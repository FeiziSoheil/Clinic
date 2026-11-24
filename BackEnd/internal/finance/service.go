package finance

import (
	"context"
	"crypto/rand"
	"errors"
	"fmt"
	"math"
	"math/big"
	"sort"
	"sync"
	"time"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
	"go.mongodb.org/mongo-driver/mongo"

	"clinic-api/pkg/database"
	"clinic-api/pkg/logger"
)

// ---------------------------------------------------------------------------
// Sentinel errors
// ---------------------------------------------------------------------------

// Sentinel errors returned by the service. Handlers translate these into the
// appropriate HTTP status via errormap. Using sentinel errors (rather than
// returning *errormap.APIError directly) keeps the service free of HTTP
// concerns, in line with Clean Architecture.
var (
	// ErrInvalidObjectID is returned when a supplied id is not a valid hex
	// ObjectID.
	ErrInvalidObjectID = errors.New("finance: invalid object id")
	// ErrWalletNotFound is returned when a wallet lookup yields no document.
	ErrWalletNotFound = errors.New("finance: wallet not found")
	// ErrPaymentAttemptNotFound is returned when a mock payment attempt lookup
	// yields no document.
	ErrPaymentAttemptNotFound = errors.New("finance: payment attempt not found")
	// ErrPaymentAlreadyVerified is returned when a payment attempt has already
	// been verified and cannot be verified again.
	ErrPaymentAlreadyVerified = errors.New("finance: payment attempt already verified")
	// ErrInsufficientBalance is returned when a debit would drive a wallet
	// below zero.
	ErrInsufficientBalance = errors.New("finance: insufficient balance")
	// ErrInvoiceNotFound is returned when an invoice lookup yields no document.
	ErrInvoiceNotFound = errors.New("finance: invoice not found")
	// ErrInvoiceAlreadySettled is returned when an invoice that is already
	// settled is targeted by settle/cancel.
	ErrInvoiceAlreadySettled = errors.New("finance: invoice already settled")
	// ErrInvoiceAlreadyForfeited is returned when an invoice that is already
	// forfeited is targeted by cancel/settle.
	ErrInvoiceAlreadyForfeited = errors.New("finance: invoice already forfeited")
	// ErrAppointmentNotFound is returned when the booking adapter reports no
	// appointment for the given id.
	ErrAppointmentNotFound = errors.New("finance: appointment not found")
	// ErrAppointmentAlreadyPaid is returned when an appointment already has an
	// invoice (the visit fee already collected) is targeted by another payment.
	ErrAppointmentAlreadyPaid = errors.New("finance: appointment visit fee already paid")
	// ErrInvalidMonth is returned when a doctor-read query month does not match
	// the expected YYYY-MM form.
	ErrInvalidMonth = errors.New("finance: invalid month, expected YYYY-MM")
	// ErrInvalidDateRange is returned when from/to are malformed or from > to.
	ErrInvalidDateRange = errors.New("finance: invalid date range, expected from/to as YYYY-MM-DD with from <= to")
)

// ---------------------------------------------------------------------------
// Cross-domain adapter interface
// ---------------------------------------------------------------------------

// AppointmentService is a narrow interface to the booking domain so finance can
// read an appointment's billing details and mutate its payment lifecycle without
// importing internal/booking. An adapter (typically wired in bootstrap) satisfies
// this interface by delegating to the concrete booking.Service.
type AppointmentService interface {
	// GetForBilling returns the billing-relevant details of an appointment.
	GetForBilling(ctx context.Context, appointmentID primitive.ObjectID) (*AppointmentInfo, error)
	// MarkDepositPaid records that the appointment fee has been paid. It must
	// not change the booking lifecycle status (confirmation stays with reception).
	MarkDepositPaid(ctx context.Context, appointmentID primitive.ObjectID, paymentType string) error
	// MarkSettled updates the appointment status to SETTLED/COMPLETED.
	MarkSettled(ctx context.Context, appointmentID primitive.ObjectID) error
	// MarkCancelled updates the appointment status to CANCELLED.
	MarkCancelled(ctx context.Context, appointmentID primitive.ObjectID) error
	// AppointmentStatsByMonth returns clinic-wide appointment totals and
	// no-show counts for each calendar month in the half-open [start, end)
	// window. It powers the admin dashboard's no-show-rate series.
	AppointmentStatsByMonth(ctx context.Context, start, end time.Time) ([]MonthlyAppointmentStat, error)
}

// ---------------------------------------------------------------------------
// Business-rule constants
// ---------------------------------------------------------------------------

// trackingCodeAlphabet is the character set used to mint secure random mock
// payment tracking codes.
const trackingCodeAlphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"

// trackingCodeLength is the fixed length of a mock payment tracking code.
const trackingCodeLength = 12

// defaultCurrency is the currency assigned to freshly created wallets.
const defaultCurrency = "IRR"

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

// Service contains the finance domain's business logic. It owns the generic
// repositories for wallets, transactions, invoices and payment attempts, a
// reference to the AppointmentService adapter (so finance never imports
// internal/booking), and the mongo client used to run multi-document
// transactions that keep balance mutations atomic.
type Service struct {
	walletRepo   *database.Repository[Wallet]
	txnRepo      *database.Repository[Transaction]
	invoiceRepo  *database.Repository[Invoice]
	paymentRepo  *database.Repository[PaymentAttempt]
	appointments AppointmentService
	client       *mongo.Client
	// repairMu serializes RepairSettleCompletedVisits so parallel earnings /
	// wallet / transactions requests cannot double-credit the same invoice.
	repairMu sync.Mutex
}

// NewService constructs a Service bound to the given repositories, booking
// adapter and mongo client. The client is required to start the multi-document
// transactions that keep wallet mutations atomic across credit/debit and ledger
// inserts.
func NewService(
	walletRepo *database.Repository[Wallet],
	txnRepo *database.Repository[Transaction],
	invoiceRepo *database.Repository[Invoice],
	paymentRepo *database.Repository[PaymentAttempt],
	appointments AppointmentService,
	client *mongo.Client,
) *Service {
	return &Service{
		walletRepo:   walletRepo,
		txnRepo:      txnRepo,
		invoiceRepo:  invoiceRepo,
		paymentRepo:  paymentRepo,
		appointments: appointments,
		client:       client,
	}
}

// ---------------------------------------------------------------------------
// Transaction helper
// ---------------------------------------------------------------------------

// runInTransaction runs fn inside a MongoDB transaction, retrying automatically
// on transient errors. All balance mutations MUST run inside this so wallet
// credits/debits, ledger inserts and invoice updates commit atomically or roll
// back together. If the deployment does not support multi-document transactions
// (e.g. a standalone mongod or no client) the callback is run once without a
// session so the service degrades gracefully rather than hard-failing.
func (s *Service) runInTransaction(ctx context.Context, fn func(sctx mongo.SessionContext) error) error {
	if s.client == nil {
		// Balance mutations are only safe inside a multi-document
		// transaction, so a configured mongo client is required. Bootstrap
		// always wires one for the finance service.
		return errors.New("finance: mongo client not configured, cannot run transaction")
	}

	session, err := s.client.StartSession()
	if err != nil {
		// Could not start a session (typical on a standalone mongod): we
		// cannot safely run the balance mutations, so surface the error
		// rather than silently running outside a transaction.
		logger.Get().Error("runInTransaction: StartSession failed", "error", err)
		return err
	}
	defer session.EndSession(ctx)

	// WithTransaction commits/aborts automatically and retries the callback on
	// transient errors (write conflicts, commit failures).
	_, err = session.WithTransaction(ctx, func(sctx mongo.SessionContext) (interface{}, error) {
		return nil, fn(sctx)
	})
	return err
}

// ---------------------------------------------------------------------------
// Wallet helpers (session-aware)
// ---------------------------------------------------------------------------

// getOrCreateWallet returns the wallet for the given user, creating a zero-
// balance wallet in the given currency when none exists yet. It is session-
// aware: it uses the wallet collection directly so reads/inserts participate
// in the caller's transaction.
func (s *Service) getOrCreateWallet(sctx mongo.SessionContext, userID primitive.ObjectID, currency string) (*Wallet, error) {
	if currency == "" {
		currency = defaultCurrency
	}

	// Look up an existing wallet by user_id.
	wallet, err := s.walletRepo.FindOne(sctx, bson.M{"user_id": userID})
	if err == nil {
		return wallet, nil
	}
	if !errors.Is(err, database.ErrNotFound) {
		logger.Get().Error("getOrCreateWallet: lookup failed", "user_id", userID.Hex(), "error", err)
		return nil, err
	}

	// No wallet yet: create a zero-balance one. There is an inherent race if
	// two requests mint a wallet for the same user concurrently; a unique
	// index on user_id (created in bootstrap) makes the second insert fail,
	// after which a re-read recovers the winner's document.
	now := time.Now().UTC()
	newWallet := &Wallet{
		ID:        primitive.NewObjectID(),
		UserID:    userID,
		Balance:   0,
		Currency:  currency,
		CreatedAt: now,
		UpdatedAt: now,
	}
	if _, err := s.walletRepo.Collection().InsertOne(sctx, newWallet); err != nil {
		// Possibly a duplicate-key from a concurrent creation: re-read.
		logger.Get().Warn("getOrCreateWallet: insert failed, attempting re-read", "user_id", userID.Hex(), "error", err)
		wallet, lerr := s.walletRepo.FindOne(sctx, bson.M{"user_id": userID})
		if lerr == nil {
			return wallet, nil
		}
		return nil, err
	}
	return newWallet, nil
}

// creditWallet atomically increments the user's wallet balance by amount via
// FindOneAndUpdate. The wallet is created on demand if it does not exist.
// It MUST run inside a transaction session.
func (s *Service) creditWallet(sctx mongo.SessionContext, userID primitive.ObjectID, amount float64) error {
	// Ensure a wallet exists so the $inc has a document to act on.
	if _, err := s.getOrCreateWallet(sctx, userID, defaultCurrency); err != nil {
		return err
	}

	filter := bson.M{"user_id": userID}
	update := bson.M{
		"$inc": bson.M{"balance": amount},
		"$set": bson.M{"updated_at": time.Now().UTC()},
	}
	if err := s.walletRepo.Collection().FindOneAndUpdate(sctx, filter, update).Err(); err != nil {
		if !errors.Is(err, mongo.ErrNoDocuments) {
			logger.Get().Error("creditWallet: update failed", "user_id", userID.Hex(), "error", err)
		}
		return err
	}
	return nil
}

// debitWallet atomically decrements the user's wallet balance by amount, but
// only if the resulting balance would remain non-negative. It uses a
// conditional filter (balance >= amount) so overdraft is rejected atomically.
// It MUST run inside a transaction session.
func (s *Service) debitWallet(sctx mongo.SessionContext, userID primitive.ObjectID, amount float64) error {
	// Ensure a wallet exists first so the conditional update has a target.
	if _, err := s.getOrCreateWallet(sctx, userID, defaultCurrency); err != nil {
		return err
	}

	filter := bson.M{
		"user_id": userID,
		"balance": bson.M{"$gte": amount},
	}
	update := bson.M{
		"$inc": bson.M{"balance": -amount},
		"$set": bson.M{"updated_at": time.Now().UTC()},
	}
	if err := s.walletRepo.Collection().FindOneAndUpdate(sctx, filter, update).Err(); err != nil {
		if errors.Is(err, mongo.ErrNoDocuments) {
			return ErrInsufficientBalance
		}
		logger.Get().Error("debitWallet: update failed", "user_id", userID.Hex(), "error", err)
		return err
	}
	return nil
}

// ---------------------------------------------------------------------------
// Mock payment
// ---------------------------------------------------------------------------

// generateTrackingCode mints a secure, uppercase alphanumeric tracking code of
// trackingCodeLength characters using crypto/rand.
func generateTrackingCode() (string, error) {
	alphabet := []byte(trackingCodeAlphabet)
	max := big.NewInt(int64(len(alphabet)))
	out := make([]byte, trackingCodeLength)
	for i := 0; i < trackingCodeLength; i++ {
		idx, err := rand.Int(rand.Reader, max)
		if err != nil {
			return "", fmt.Errorf("finance: failed to generate tracking code: %w", err)
		}
		out[i] = alphabet[idx.Int64()]
	}
	return string(out), nil
}

// InitiateMockPayment starts a mock payment to top up the caller's wallet. It
// mints a tracking code and persists a PENDING payment attempt, returning the
// attempt along with the mock verification URL the client should hit.
func (s *Service) InitiateMockPayment(ctx context.Context, userID string, amount float64) (*PaymentAttemptResponse, error) {
	userOID, err := primitive.ObjectIDFromHex(userID)
	if err != nil {
		return nil, ErrInvalidObjectID
	}

	code, err := generateTrackingCode()
	if err != nil {
		logger.Get().Error("initiateMockPayment: tracking code generation failed", "error", err)
		return nil, err
	}

	now := time.Now().UTC()
	attempt := PaymentAttempt{
		ID:           primitive.NewObjectID(),
		UserID:       userOID,
		Amount:       amount,
		Status:       PaymentAttemptStatusPending,
		TrackingCode: code,
		CreatedAt:    now,
		UpdatedAt:    now,
	}

	if _, err := s.paymentRepo.Insert(ctx, attempt); err != nil {
		logger.Get().Error("initiateMockPayment: insert failed", "user_id", userID, "error", err)
		return nil, err
	}

	resp := attempt.ToResponse()
	resp.PaymentURL = "/api/v1/finance/mock-verify?code=" + code

	logger.Get().Info("mock payment initiated", "id", attempt.ID.Hex(), "user_id", userID, "amount", amount)
	return resp, nil
}

// VerifyMockPayment verifies a pending mock payment attempt by tracking code,
// crediting the user's wallet with the attempt amount and recording a DEPOSIT
// ledger entry. The status transition and wallet mutation run atomically
// inside a transaction.
func (s *Service) VerifyMockPayment(ctx context.Context, trackingCode string) (*TransactionResponse, error) {
	attempt, err := s.paymentRepo.FindOne(ctx, bson.M{"tracking_code": trackingCode})
	if err != nil {
		if errors.Is(err, database.ErrNotFound) {
			return nil, ErrPaymentAttemptNotFound
		}
		logger.Get().Error("verifyMockPayment: lookup failed", "tracking_code", trackingCode, "error", err)
		return nil, err
	}
	if attempt.Status == PaymentAttemptStatusSuccess {
		return nil, ErrPaymentAlreadyVerified
	}

	var deposit *TransactionResponse
	if err := s.runInTransaction(ctx, func(sctx mongo.SessionContext) error {
		// Mark the attempt SUCCESS atomically; only a PENDING attempt may be
		// verified, which guards against double-verification under concurrency.
		filter := bson.M{
			"_id":    attempt.ID,
			"status": PaymentAttemptStatusPending,
		}
		update := bson.M{
			"$set": bson.M{
				"status":     PaymentAttemptStatusSuccess,
				"updated_at": time.Now().UTC(),
			},
		}
		if err := s.paymentRepo.Collection().FindOneAndUpdate(sctx, filter, update).Err(); err != nil {
			if errors.Is(err, mongo.ErrNoDocuments) {
				return ErrPaymentAlreadyVerified
			}
			return err
		}

		// Credit the wallet and record the deposit ledger entry.
		if err := s.creditWallet(sctx, attempt.UserID, attempt.Amount); err != nil {
			return err
		}

		txn := Transaction{
			ID:          primitive.NewObjectID(),
			UserID:      attempt.UserID,
			Amount:      attempt.Amount,
			Type:        TransactionTypeDeposit,
			ReferenceID: trackingCode,
			CreatedAt:   time.Now().UTC(),
		}
		if _, err := s.txnRepo.Insert(sctx, txn); err != nil {
			return err
		}
		deposit = txn.ToResponse()
		return nil
	}); err != nil {
		return nil, err
	}

	logger.Get().Info("mock payment verified", "tracking_code", trackingCode, "user_id", attempt.UserID.Hex())
	return deposit, nil
}

// ---------------------------------------------------------------------------
// Business Rule 1: Up-front full visit-fee payment
//
// The deposit / prepayment mechanism has been removed entirely: the patient now
// pays the FULL visit fee in a single, up-front payment. The doctor is credited
// at settlement (Business Rule 2), once the visit has taken place. Keeping the
// fee collected but the doctor credit deferred is what makes the refund logic
// (Business Rule 3) accounting-correct: a cancelled appointment can simply
// return the collected fee without reversing any already-realized doctor
// revenue.
// ---------------------------------------------------------------------------

// PayVisitFee collects the FULL visit fee for an appointment in a single
// up-front payment by debiting the patient's wallet, creating a PARTIAL invoice
// (the doctor is credited later at settlement) and marking the appointment
// confirmed. The whole operation runs inside a transaction.
func (s *Service) PayVisitFee(ctx context.Context, userID string, appointmentID string) (*InvoiceResponse, error) {
	userOID, err := primitive.ObjectIDFromHex(userID)
	if err != nil {
		return nil, ErrInvalidObjectID
	}
	apptOID, err := primitive.ObjectIDFromHex(appointmentID)
	if err != nil {
		return nil, ErrInvalidObjectID
	}

	info, err := s.appointments.GetForBilling(ctx, apptOID)
	if err != nil || info == nil {
		return nil, ErrAppointmentNotFound
	}

	// Guard against double payment: an invoice must not already exist for this
	// appointment.
	if existing, lerr := s.invoiceRepo.FindOne(ctx, bson.M{"appointment_id": apptOID}); lerr == nil && existing != nil {
		return nil, ErrAppointmentAlreadyPaid
	}

	totalFee := info.TotalFee
	now := time.Now().UTC()

	// The full visit fee is collected up front; DepositPaid records that amount
	// (the field name is retained for BSON/ledger compatibility — it now holds
	// the entire fee, not a fractional deposit).
	invoice := Invoice{
		ID:            primitive.NewObjectID(),
		AppointmentID: apptOID,
		DoctorID:      info.DoctorID,
		UserID:        userOID,
		TotalFee:      totalFee,
		DepositPaid:   totalFee,
		Status:        InvoiceStatusPartial,
		PaymentType:   PaymentChannelOnline,
		CreatedAt:     now,
		UpdatedAt:     now,
	}

	if err := s.runInTransaction(ctx, func(sctx mongo.SessionContext) error {
		// Debit the full visit fee from the patient (overdraft -> error).
		if err := s.debitWallet(sctx, userOID, totalFee); err != nil {
			return err
		}

		// Record the fee collection on the ledger for traceability.
		feeTxn := Transaction{
			ID:          primitive.NewObjectID(),
			UserID:      userOID,
			Amount:      totalFee,
			Type:        TransactionTypeWithdrawal,
			ReferenceID: apptOID.Hex(),
			CreatedAt:   time.Now().UTC(),
		}
		if _, err := s.txnRepo.Insert(sctx, feeTxn); err != nil {
			return err
		}

		// Persist the invoice.
		if _, err := s.invoiceRepo.Insert(sctx, invoice); err != nil {
			return err
		}

		// Record payment on the appointment. Lifecycle status stays PENDING
		// until reception explicitly confirms the booking.
		if err := s.appointments.MarkDepositPaid(sctx, apptOID, PaymentChannelOnline); err != nil {
			return err
		}
		return nil
	}); err != nil {
		return nil, err
	}

	logger.Get().Info("appointment visit fee paid", "appointment_id", appointmentID, "fee", totalFee)
	return invoice.ToResponse(), nil
}

// ---------------------------------------------------------------------------
// Business Rule 2: Settlement
// ---------------------------------------------------------------------------

// SettleAppointment collects any remaining balance of an appointment
// (TotalFee - DepositPaid), credits the full TotalFee to the doctor's wallet
// and marks the invoice SETTLED. The whole operation runs inside a transaction.
func (s *Service) SettleAppointment(ctx context.Context, appointmentID string) (*InvoiceResponse, error) {
	apptOID, err := primitive.ObjectIDFromHex(appointmentID)
	if err != nil {
		return nil, ErrInvalidObjectID
	}

	info, err := s.appointments.GetForBilling(ctx, apptOID)
	if err != nil || info == nil {
		return nil, ErrAppointmentNotFound
	}

	invoice, err := s.invoiceRepo.FindOne(ctx, bson.M{"appointment_id": apptOID})
	if err != nil {
		if errors.Is(err, database.ErrNotFound) {
			if info.PaymentType == PaymentChannelInPerson {
				return s.settleInPersonAppointment(ctx, apptOID, info)
			}
			return nil, ErrInvoiceNotFound
		}
		return nil, err
	}
	if invoice.Status == InvoiceStatusSettled {
		return nil, ErrInvoiceAlreadySettled
	}
	if invoice.Status == InvoiceStatusForfeited {
		return nil, ErrInvoiceAlreadyForfeited
	}

	remaining := invoice.TotalFee - invoice.DepositPaid
	doctorShare := invoice.TotalFee

	if err := s.runInTransaction(ctx, func(sctx mongo.SessionContext) error {
		// Claim the invoice atomically: only one concurrent settler can flip
		// PARTIAL → SETTLED. Others see MatchedCount=0 and abort before credit.
		claim := bson.M{
			"$set": bson.M{
				"doctor_share": doctorShare,
				"status":       InvoiceStatusSettled,
				"updated_at":   time.Now().UTC(),
			},
		}
		claimRes, cerr := s.invoiceRepo.Collection().UpdateOne(sctx,
			bson.M{"_id": invoice.ID, "status": InvoiceStatusPartial}, claim)
		if cerr != nil {
			return cerr
		}
		if claimRes.MatchedCount == 0 {
			return ErrInvoiceAlreadySettled
		}

		// Debit any remaining balance from the patient.
		if remaining > 0 {
			if err := s.debitWallet(sctx, invoice.UserID, remaining); err != nil {
				return err
			}

			visitFeeTxn := Transaction{
				ID:          primitive.NewObjectID(),
				UserID:      invoice.UserID,
				Amount:      remaining,
				Type:        TransactionTypeVisitFee,
				ReferenceID: apptOID.Hex(),
				CreatedAt:   time.Now().UTC(),
			}
			if _, err := s.txnRepo.Insert(sctx, visitFeeTxn); err != nil {
				return err
			}
		}

		// Credit the full visit fee to the doctor.
		if err := s.creditWallet(sctx, invoice.DoctorID, doctorShare); err != nil {
			return err
		}
		doctorShareTxn := Transaction{
			ID:          primitive.NewObjectID(),
			UserID:      invoice.DoctorID,
			Amount:      doctorShare,
			Type:        TransactionTypeRevenueShare,
			ReferenceID: apptOID.Hex(),
			CreatedAt:   time.Now().UTC(),
		}
		if _, err := s.txnRepo.Insert(sctx, doctorShareTxn); err != nil {
			return err
		}

		invoice.DoctorShare = doctorShare
		invoice.Status = InvoiceStatusSettled
		invoice.UpdatedAt = time.Now().UTC()

		if err := s.appointments.MarkSettled(sctx, apptOID); err != nil {
			return err
		}
		return nil
	}); err != nil {
		return nil, err
	}

	logger.Get().Info("appointment settled", "appointment_id", appointmentID, "remaining", remaining)
	return invoice.ToResponse(), nil
}

// settleInPersonAppointment records a cash/card payment collected at reception
// for an appointment that was booked in-clinic (walk-in / phone). No patient
// wallet is debited; the full fee is credited to the doctor and the appointment
// is marked completed.
func (s *Service) settleInPersonAppointment(ctx context.Context, apptOID primitive.ObjectID, info *AppointmentInfo) (*InvoiceResponse, error) {
	totalFee := info.TotalFee
	now := time.Now().UTC()

	invoice := Invoice{
		ID:            primitive.NewObjectID(),
		AppointmentID: apptOID,
		DoctorID:      info.DoctorID,
		UserID:        info.PatientID,
		TotalFee:      totalFee,
		DepositPaid:   0,
		Status:        InvoiceStatusPartial,
		PaymentType:   PaymentChannelInPerson,
		CreatedAt:     now,
		UpdatedAt:     now,
	}

	if err := s.runInTransaction(ctx, func(sctx mongo.SessionContext) error {
		if err := s.creditWallet(sctx, invoice.DoctorID, totalFee); err != nil {
			return err
		}
		doctorShareTxn := Transaction{
			ID:          primitive.NewObjectID(),
			UserID:      invoice.DoctorID,
			Amount:      totalFee,
			Type:        TransactionTypeRevenueShare,
			ReferenceID: apptOID.Hex(),
			CreatedAt:   time.Now().UTC(),
		}
		if _, err := s.txnRepo.Insert(sctx, doctorShareTxn); err != nil {
			return err
		}

		invoice.DoctorShare = totalFee
		invoice.Status = InvoiceStatusSettled
		invoice.UpdatedAt = time.Now().UTC()

		if _, err := s.invoiceRepo.Insert(sctx, invoice); err != nil {
			return err
		}

		if err := s.appointments.MarkDepositPaid(sctx, apptOID, PaymentChannelInPerson); err != nil {
			return err
		}
		if err := s.appointments.MarkSettled(sctx, apptOID); err != nil {
			return err
		}
		return nil
	}); err != nil {
		return nil, err
	}

	logger.Get().Info("in-person appointment settled", "appointment_id", apptOID.Hex(), "fee", totalFee)
	return invoice.ToResponse(), nil
}

// ---------------------------------------------------------------------------
// Business Rule 3: No-show / late cancel forfeit
// ---------------------------------------------------------------------------

// ProcessCancellation processes an appointment cancellation. For a standard
// cancellation the deposit is fully refunded to the patient (the invoice
// stays PARTIAL with DepositPaid zeroed). For a late cancellation / no-show
// the deposit is forfeited and credited entirely to the doctor, and the
// invoice is marked FORFEITED. The whole operation runs inside a transaction.
func (s *Service) ProcessCancellation(ctx context.Context, appointmentID string, isLateOrNoShow bool) (*InvoiceResponse, error) {
	apptOID, err := primitive.ObjectIDFromHex(appointmentID)
	if err != nil {
		return nil, ErrInvalidObjectID
	}

	invoice, err := s.invoiceRepo.FindOne(ctx, bson.M{"appointment_id": apptOID})
	if err != nil {
		if errors.Is(err, database.ErrNotFound) {
			return nil, ErrInvoiceNotFound
		}
		return nil, err
	}
	if invoice.Status == InvoiceStatusForfeited {
		return nil, ErrInvoiceAlreadyForfeited
	}
	if invoice.Status == InvoiceStatusSettled {
		return nil, ErrInvoiceAlreadySettled
	}

	deposit := invoice.DepositPaid

	if err := s.runInTransaction(ctx, func(sctx mongo.SessionContext) error {
		if !isLateOrNoShow {
			// Standard cancellation: 100% refund of the deposit.
			if err := s.creditWallet(sctx, invoice.UserID, deposit); err != nil {
				return err
			}
			refundTxn := Transaction{
				ID:          primitive.NewObjectID(),
				UserID:      invoice.UserID,
				Amount:      deposit,
				Type:        TransactionTypeRefund,
				ReferenceID: apptOID.Hex(),
				CreatedAt:   time.Now().UTC(),
			}
			if _, err := s.txnRepo.Insert(sctx, refundTxn); err != nil {
				return err
			}

			update := bson.M{
				"$set": bson.M{
					"deposit_paid": 0.0,
					"updated_at":   time.Now().UTC(),
				},
			}
			if err := s.invoiceRepo.Update(sctx, invoice.ID, update); err != nil {
				return err
			}
			invoice.DepositPaid = 0
			invoice.UpdatedAt = time.Now().UTC()
		} else {
			// Late cancellation / no-show: forfeit the deposit to the doctor.
			if err := s.creditWallet(sctx, invoice.DoctorID, deposit); err != nil {
				return err
			}
			doctorForfeitTxn := Transaction{
				ID:          primitive.NewObjectID(),
				UserID:      invoice.DoctorID,
				Amount:      deposit,
				Type:        TransactionTypeDepositForfeit,
				ReferenceID: apptOID.Hex(),
				CreatedAt:   time.Now().UTC(),
			}
			if _, err := s.txnRepo.Insert(sctx, doctorForfeitTxn); err != nil {
				return err
			}

			update := bson.M{
				"$set": bson.M{
					"doctor_share": deposit,
					"status":       InvoiceStatusForfeited,
					"updated_at":   time.Now().UTC(),
				},
			}
			if err := s.invoiceRepo.Update(sctx, invoice.ID, update); err != nil {
				return err
			}
			invoice.DoctorShare = deposit
			invoice.Status = InvoiceStatusForfeited
			invoice.UpdatedAt = time.Now().UTC()
		}

		if err := s.appointments.MarkCancelled(sctx, apptOID); err != nil {
			return err
		}
		return nil
	}); err != nil {
		return nil, err
	}

	logger.Get().Info("appointment cancellation processed",
		"appointment_id", appointmentID,
		"no_show", isLateOrNoShow,
		"deposit", deposit,
	)
	return invoice.ToResponse(), nil
}

// ---------------------------------------------------------------------------
// Doctor-facing read queries
// ---------------------------------------------------------------------------

// parseMonthRange converts a "YYYY-MM" string into the half-open
// [startOfMonth, startOfNextMonth) UTC range used for month filtering. The
// month string is assumed to be syntactically validated (^\d{4}-\d{2}$) by the
// caller; any parse failure yields ErrInvalidMonth.
func parseMonthRange(month string) (fromLabel, toLabel string, start, endExclusive time.Time, err error) {
	t, perr := time.Parse("2006-01", month)
	if perr != nil {
		return "", "", time.Time{}, time.Time{}, ErrInvalidMonth
	}
	start = time.Date(t.Year(), t.Month(), 1, 0, 0, 0, 0, time.UTC)
	endExclusive = start.AddDate(0, 1, 0)
	lastDay := endExclusive.AddDate(0, 0, -1)
	return start.Format("2006-01-02"), lastDay.Format("2006-01-02"), start, endExclusive, nil
}

// parseDateRange converts inclusive YYYY-MM-DD from/to into a half-open UTC
// range [start, endExclusive).
func parseDateRange(from, to string) (start, endExclusive time.Time, err error) {
	start, err = time.ParseInLocation("2006-01-02", from, time.UTC)
	if err != nil {
		return time.Time{}, time.Time{}, ErrInvalidDateRange
	}
	toDay, err := time.ParseInLocation("2006-01-02", to, time.UTC)
	if err != nil {
		return time.Time{}, time.Time{}, ErrInvalidDateRange
	}
	if toDay.Before(start) {
		return time.Time{}, time.Time{}, ErrInvalidDateRange
	}
	endExclusive = toDay.AddDate(0, 0, 1)
	return start, endExclusive, nil
}

// GetDoctorEarnings aggregates settled/pending invoice metrics for the doctor
// over the half-open UTC window [start, endExclusive). fromLabel/toLabel are
// the inclusive YYYY-MM-DD bounds returned to the client.
func (s *Service) GetDoctorEarnings(ctx context.Context, doctorID, fromLabel, toLabel string, start, endExclusive time.Time) (*DoctorEarningsSummaryResponse, error) {
	doctorOID, err := primitive.ObjectIDFromHex(doctorID)
	if err != nil {
		return nil, ErrInvalidObjectID
	}

	rangeFilter := bson.M{"$gte": start, "$lt": endExclusive}

	settledFilter := bson.M{
		"doctor_id":  doctorOID,
		"created_at": rangeFilter,
		"status": bson.M{"$in": []InvoiceStatus{
			InvoiceStatusSettled,
			InvoiceStatusForfeited,
		}},
	}
	settled, err := s.invoiceRepo.FindAll(ctx, settledFilter)
	if err != nil {
		logger.Get().Error("getDoctorEarnings: settled query failed", "doctor_id", doctorID, "error", err)
		return nil, err
	}

	pendingFilter := bson.M{
		"doctor_id":  doctorOID,
		"created_at": rangeFilter,
		"status":     InvoiceStatusPartial,
	}
	pending, err := s.invoiceRepo.FindAll(ctx, pendingFilter)
	if err != nil {
		logger.Get().Error("getDoctorEarnings: pending query failed", "doctor_id", doctorID, "error", err)
		return nil, err
	}

	summary := &DoctorEarningsSummaryResponse{From: fromLabel, To: toLabel}
	for _, inv := range settled {
		summary.TotalCompleted++
		summary.DoctorShare += inv.DoctorShare
	}
	for _, inv := range pending {
		summary.PendingCount++
		summary.PendingSettlement += inv.DepositPaid
	}

	return summary, nil
}

// RepairSettleCompletedVisits finds PARTIAL invoices for the doctor whose
// appointments are already COMPLETED and settles them (credits the doctor).
// It is used to backfill visits that were finished clinically before
// auto-settle-on-complete was wired. Failures are logged per invoice and do
// not abort the batch.
func (s *Service) RepairSettleCompletedVisits(ctx context.Context, doctorID string) error {
	s.repairMu.Lock()
	defer s.repairMu.Unlock()

	doctorOID, err := primitive.ObjectIDFromHex(doctorID)
	if err != nil {
		return ErrInvalidObjectID
	}

	// Undo duplicate REVENUE_SHARE credits from concurrent settle races before
	// attempting any further repairs.
	if err := s.reconcileDuplicateRevenueShares(ctx, doctorOID); err != nil {
		logger.Get().Warn("repairSettle: reconcile duplicates failed", "doctor_id", doctorID, "error", err)
	}

	partials, err := s.invoiceRepo.FindAll(ctx, bson.M{
		"doctor_id": doctorOID,
		"status":    InvoiceStatusPartial,
	})
	if err != nil {
		return err
	}

	repaired := 0
	for _, inv := range partials {
		info, gerr := s.appointments.GetForBilling(ctx, inv.AppointmentID)
		if gerr != nil || info == nil {
			continue
		}
		if info.Status != "COMPLETED" {
			continue
		}
		if _, serr := s.SettleAppointment(ctx, inv.AppointmentID.Hex()); serr != nil {
			if errors.Is(serr, ErrInvoiceAlreadySettled) {
				continue
			}
			logger.Get().Warn("repairSettle: settle failed",
				"appointment_id", inv.AppointmentID.Hex(), "error", serr)
			continue
		}
		repaired++
	}
	if repaired > 0 {
		logger.Get().Info("repairSettle: settled completed visits",
			"doctor_id", doctorID, "repaired", repaired)
	}

	return nil
}

// reconcileDuplicateRevenueShares removes extra REVENUE_SHARE ledger rows that
// share the same appointment reference_id (from concurrent settle races) and
// debits the doctor wallet for each removed duplicate.
func (s *Service) reconcileDuplicateRevenueShares(ctx context.Context, doctorOID primitive.ObjectID) error {
	txns, err := s.txnRepo.FindAll(ctx, bson.M{
		"user_id": doctorOID,
		"type":    TransactionTypeRevenueShare,
	})
	if err != nil {
		return err
	}

	byRef := map[string][]*Transaction{}
	for _, t := range txns {
		if t.ReferenceID == "" {
			continue
		}
		byRef[t.ReferenceID] = append(byRef[t.ReferenceID], t)
	}

	removed := 0
	for ref, group := range byRef {
		if len(group) <= 1 {
			continue
		}
		sort.Slice(group, func(i, j int) bool {
			return group[i].CreatedAt.Before(group[j].CreatedAt)
		})
		for _, dup := range group[1:] {
			if err := s.runInTransaction(ctx, func(sctx mongo.SessionContext) error {
				// Force debit even if balance filter would reject — correcting
				// an over-credit from a prior race.
				filter := bson.M{"user_id": doctorOID}
				update := bson.M{
					"$inc": bson.M{"balance": -dup.Amount},
					"$set": bson.M{"updated_at": time.Now().UTC()},
				}
				if _, uerr := s.walletRepo.Collection().UpdateOne(sctx, filter, update); uerr != nil {
					return uerr
				}
				if _, derr := s.txnRepo.Collection().DeleteOne(sctx, bson.M{"_id": dup.ID}); derr != nil {
					return derr
				}
				return nil
			}); err != nil {
				logger.Get().Warn("reconcileDuplicateRevenueShares: failed",
					"reference_id", ref, "txn_id", dup.ID.Hex(), "error", err)
				continue
			}
			removed++
		}
	}
	if removed > 0 {
		logger.Get().Info("reconcileDuplicateRevenueShares: removed duplicates",
			"doctor_id", doctorOID.Hex(), "removed", removed)
	}

	return nil
}

// GetDoctorTransactions returns the REVENUE_SHARE and DEPOSIT_FORFEIT ledger
// entries for the given doctor within [start, endExclusive), newest first.
func (s *Service) GetDoctorTransactions(ctx context.Context, doctorID string, start, endExclusive time.Time) ([]*TransactionResponse, error) {
	doctorOID, err := primitive.ObjectIDFromHex(doctorID)
	if err != nil {
		return nil, ErrInvalidObjectID
	}

	filter := bson.M{
		"user_id": doctorOID,
		"type": bson.M{"$in": []TransactionType{
			TransactionTypeRevenueShare,
			TransactionTypeDepositForfeit,
		}},
		"created_at": bson.M{"$gte": start, "$lt": endExclusive},
	}
	txns, err := s.txnRepo.FindAll(ctx, filter)
	if err != nil {
		logger.Get().Error("getDoctorTransactions: query failed", "doctor_id", doctorID, "error", err)
		return nil, err
	}

	sort.Slice(txns, func(i, j int) bool {
		return txns[i].CreatedAt.After(txns[j].CreatedAt)
	})

	out := make([]*TransactionResponse, 0, len(txns))
	for _, t := range txns {
		out = append(out, t.ToResponse())
	}
	return out, nil
}

// GetDoctorWallet returns the doctor's wallet balance, reporting currency as
// "Toman" to match the frontend's expectations. If no wallet exists yet the
// balance is reported as 0 (this is NOT an error: a doctor may legitimately
// have no wallet before earning anything).
func (s *Service) GetDoctorWallet(ctx context.Context, doctorID string) (*DoctorWalletResponse, error) {
	doctorOID, err := primitive.ObjectIDFromHex(doctorID)
	if err != nil {
		return nil, ErrInvalidObjectID
	}

	wallet, err := s.walletRepo.FindOne(ctx, bson.M{"user_id": doctorOID})
	if err != nil {
		if errors.Is(err, database.ErrNotFound) {
			return &DoctorWalletResponse{Balance: 0, Currency: "Toman"}, nil
		}
		logger.Get().Error("getDoctorWallet: lookup failed", "doctor_id", doctorID, "error", err)
		return nil, err
	}
	return &DoctorWalletResponse{Balance: wallet.Balance, Currency: "Toman"}, nil
}

// GetUserWallet returns the authenticated user's wallet balance, reporting
// currency as "Toman" to match the frontend's expectations (the response shape
// is identical to GetDoctorWallet). It is the patient-facing analogue of
// GetDoctorWallet: the user id is resolved from the JWT auth context by the
// handler. If no wallet exists yet the balance is reported as 0 (this is NOT an
// error: a user may legitimately have no wallet before topping it up).
func (s *Service) GetUserWallet(ctx context.Context, userID string) (*DoctorWalletResponse, error) {
	userOID, err := primitive.ObjectIDFromHex(userID)
	if err != nil {
		return nil, ErrInvalidObjectID
	}

	wallet, err := s.walletRepo.FindOne(ctx, bson.M{"user_id": userOID})
	if err != nil {
		if errors.Is(err, database.ErrNotFound) {
			return &DoctorWalletResponse{Balance: 0, Currency: "Toman"}, nil
		}
		logger.Get().Error("getUserWallet: lookup failed", "user_id", userID, "error", err)
		return nil, err
	}
	return &DoctorWalletResponse{Balance: wallet.Balance, Currency: "Toman"}, nil
}

// ---------------------------------------------------------------------------
// Admin dashboard
// ---------------------------------------------------------------------------

// dashboardMonthCount maps a dashboard range to the number of trailing months
// (including the current, possibly partial, month) it covers. Any value other
// than DashboardRange6m is treated as the 12-month window.
func dashboardMonthCount(rangeStr string) int {
	if rangeStr == string(DashboardRange6m) {
		return 6
	}
	return 12
}

// dashboardWindow returns the half-open [start, end) UTC range spanning the last
// `count` calendar months including the current one, plus the ordered list of
// (year, month, short-label) buckets in chronological order.
func dashboardWindow(count int) (start, end time.Time, buckets []dashboardMonth) {
	now := time.Now().UTC()
	// Anchor to the first instant of the current month.
	currentMonthStart := time.Date(now.Year(), now.Month(), 1, 0, 0, 0, 0, time.UTC)
	// start = first instant of the month `count-1` months before the current.
	start = currentMonthStart.AddDate(0, -(count - 1), 0)
	// end = first instant of next month (exclusive upper bound).
	end = currentMonthStart.AddDate(0, 1, 0)

	buckets = make([]dashboardMonth, 0, count)
	for i := 0; i < count; i++ {
		t := start.AddDate(0, i, 0)
		buckets = append(buckets, dashboardMonth{
			year:  t.Year(),
			month: int(t.Month()),
			label: t.Month().String()[:3], // e.g. "Jul"
		})
	}
	return start, end, buckets
}

// dashboardMonth is an internal (year, month, short-label) bucket descriptor.
type dashboardMonth struct {
	year  int
	month int
	label string
}

// monthKey returns the unique comparable key for a (year, month) bucket.
func dashboardMonthKey(year, month int) int { return year*100 + month }

// GetDashboard computes the admin dashboard report (KPI summary plus the
// revenue, doctor-earnings and no-show chart series) for the requested range,
// all derived from real persisted invoices and appointments.
//
// Revenue and doctor earnings are aggregated from SETTLED and FORFEITED invoices
// (bucketed by their finalized `updated_at` month): a SETTLED invoice
// contributes its full TotalFee as revenue, a FORFEITED invoice contributes the
// forfeited DepositPaid; both contribute DoctorShare to the doctor-earnings
// series. The no-show series is computed from clinic-wide appointment totals
// and NO_SHOW counts provided by the booking adapter.
func (s *Service) GetDashboard(ctx context.Context, rangeStr string) (*DashboardResponse, error) {
	count := dashboardMonthCount(rangeStr)
	start, end, buckets := dashboardWindow(count)

	// --- Invoices: revenue + doctor earnings, bucketed by updated_at month. ---
	invoiceFilter := bson.M{
		"status": bson.M{"$in": []InvoiceStatus{
			InvoiceStatusSettled,
			InvoiceStatusForfeited,
		}},
		"updated_at": bson.M{"$gte": start, "$lt": end},
	}
	invoices, err := s.invoiceRepo.FindAll(ctx, invoiceFilter)
	if err != nil {
		logger.Get().Error("getDashboard: invoice query failed", "error", err)
		return nil, err
	}

	// Per-bucket accumulators keyed by month key. Pre-seed one entry per window
	// bucket so every key is guaranteed non-nil even for months that have no
	// invoices (avoids nil-pointer dereferences when assembling the series).
	type revenueAcc struct {
		revenue float64
		doctor  float64
	}
	revByMonth := make(map[int]*revenueAcc, count)
	for _, b := range buckets {
		revByMonth[dashboardMonthKey(b.year, b.month)] = &revenueAcc{}
	}
	for _, inv := range invoices {
		key := dashboardMonthKey(inv.UpdatedAt.Year(), int(inv.UpdatedAt.Month()))
		acc, ok := revByMonth[key]
		if !ok {
			continue
		}
		if inv.Status == InvoiceStatusSettled {
			acc.revenue += inv.TotalFee
		} else {
			acc.revenue += inv.DepositPaid
		}
		acc.doctor += inv.DoctorShare
	}

	// --- Appointments: no-show rate, bucketed by appointment date month. ---
	apptStats, err := s.appointments.AppointmentStatsByMonth(ctx, start, end)
	if err != nil {
		logger.Get().Error("getDashboard: appointment stats query failed", "error", err)
		return nil, err
	}
	noShowByMonth := make(map[int]MonthlyAppointmentStat, len(apptStats))
	var totalAppointments int64
	for _, st := range apptStats {
		noShowByMonth[dashboardMonthKey(st.Year, st.Month)] = st
		totalAppointments += st.Total
	}

	// --- Assemble the ordered series following the window's buckets. ---
	revenueTrend := make([]DashboardRevenuePoint, 0, count)
	doctorEarningsTrend := make([]DashboardDoctorEarningsPoint, 0, count)
	noShowTrend := make([]DashboardNoShowPoint, 0, count)

	var totalRevenue float64
	var noShowRateSum float64
	var noShowRateCount int

	for _, b := range buckets {
		key := dashboardMonthKey(b.year, b.month)
		acc := revByMonth[key]

		revenueTrend = append(revenueTrend, DashboardRevenuePoint{
			Month:   b.label,
			Revenue: acc.revenue,
		})
		doctorEarningsTrend = append(doctorEarningsTrend, DashboardDoctorEarningsPoint{
			Month:          b.label,
			DoctorEarnings: acc.doctor,
		})
		totalRevenue += acc.revenue

		var rate float64
		if st, ok := noShowByMonth[key]; ok && st.Total > 0 {
			rate = float64(st.NoShow) / float64(st.Total) * 100
		}
		noShowTrend = append(noShowTrend, DashboardNoShowPoint{
			Month:      b.label,
			NoShowRate: roundTo(rate, 1),
		})
		if st, ok := noShowByMonth[key]; ok && st.Total > 0 {
			noShowRateSum += rate
			noShowRateCount++
		}
	}

	var avgNoShow float64
	if noShowRateCount > 0 {
		avgNoShow = noShowRateSum / float64(noShowRateCount)
	}

	return &DashboardResponse{
		Summary: DashboardSummaryResponse{
			TotalRevenue:      totalRevenue,
			TotalAppointments: totalAppointments,
			AvgNoShowRate:     roundTo(avgNoShow, 1),
		},
		RevenueTrend:        revenueTrend,
		DoctorEarningsTrend: doctorEarningsTrend,
		NoShowTrend:         noShowTrend,
	}, nil
}

// roundTo rounds f to `places` decimal places using the standard half-away-from
// zero rule. It is the local money/rate rounding helper for the dashboard.
func roundTo(f float64, places int) float64 {
	shift := 1.0
	for i := 0; i < places; i++ {
		shift *= 10
	}
	return math.Round(f*shift) / shift
}
