// Package finance implements the finance domain of the clinic application.
//
// It owns the Wallet, Transaction, Invoice and PaymentAttempt entities, the
// request/response DTOs used by the HTTP layer, and the business rules that
// govern mock payments, visit-fee collection, visit settlement (full fee to
// the doctor) and no-show forfeits. Business logic lives in service.go and
// the HTTP handlers in handler.go.
//
// Per the project's Clean Architecture rules this package lives in internal/
// and may import from pkg/, while pkg/ packages MUST NEVER import anything
// from internal/.
package finance

import (
	"time"

	"go.mongodb.org/mongo-driver/bson/primitive"
)

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

// TransactionType is the kind of movement recorded against a wallet. It is a
// typed string so the compiler catches typos while still serializing cleanly
// to/from JSON and BSON as plain strings.
type TransactionType string

const (
	// TransactionTypeDeposit is a top-up of the wallet (e.g. from a mock
	// payment verification).
	TransactionTypeDeposit TransactionType = "DEPOSIT"
	// TransactionTypeWithdrawal is money leaving the wallet.
	TransactionTypeWithdrawal TransactionType = "WITHDRAWAL"
	// TransactionTypeRefund is money credited back to the wallet after a
	// cancellation/refund.
	TransactionTypeRefund TransactionType = "REFUND"
	// TransactionTypeVisitFee is the charge applied when settling an
	// appointment's visit fee.
	TransactionTypeVisitFee TransactionType = "VISIT_FEE"
	// TransactionTypeDepositForfeit records money moved into the doctor's
	// wallet from a patient's forfeited deposit (no-show / late cancel).
	TransactionTypeDepositForfeit TransactionType = "DEPOSIT_FORFEIT"
	// TransactionTypeRevenueShare records the visit fee credited to the
	// doctor's wallet at settlement.
	TransactionTypeRevenueShare TransactionType = "REVENUE_SHARE"
)

// InvoiceStatus tracks the financial lifecycle of an appointment's invoice.
type InvoiceStatus string

const (
	// InvoiceStatusPartial means the deposit has been collected but the
	// appointment has not yet been fully settled.
	InvoiceStatusPartial InvoiceStatus = "PARTIAL"
	// InvoiceStatusSettled means the full visit fee has been paid and
	// credited to the doctor's wallet.
	InvoiceStatusSettled InvoiceStatus = "SETTLED"
	// InvoiceStatusForfeited means the deposit was forfeited (no-show / late
	// cancellation) and the invoice is now closed.
	InvoiceStatusForfeited InvoiceStatus = "FORFEITED"
)

// PaymentAttemptStatus tracks the lifecycle of a mock payment attempt.
type PaymentAttemptStatus string

const (
	// PaymentAttemptStatusPending means the attempt was initiated but not yet
	// verified by the user.
	PaymentAttemptStatusPending PaymentAttemptStatus = "PENDING"
	// PaymentAttemptStatusSuccess means the attempt was verified and the funds
	// credited to the wallet.
	PaymentAttemptStatusSuccess PaymentAttemptStatus = "SUCCESS"
	// PaymentAttemptStatusFailed means the attempt failed verification or was
	// abandoned.
	PaymentAttemptStatusFailed PaymentAttemptStatus = "FAILED"
)

// Payment channel constants mirror booking.PaymentType values without importing
// internal/booking.
const (
	// PaymentChannelOnline is payment via the patient app / digital wallet.
	PaymentChannelOnline = "ONLINE"
	// PaymentChannelInPerson is payment collected at the clinic by reception.
	PaymentChannelInPerson = "IN_PERSON"
)

// ---------------------------------------------------------------------------
// Cross-domain value object
// ---------------------------------------------------------------------------

// AppointmentInfo is finance's view of an appointment needed for billing. It
// is populated by the AppointmentService adapter so finance can read an
// appointment's billing details and mutate its payment lifecycle without
// importing internal/booking.
type AppointmentInfo struct {
	// AppointmentID is the unique identifier of the appointment.
	AppointmentID primitive.ObjectID
	// PatientID is the ObjectID of the patient the appointment belongs to.
	PatientID primitive.ObjectID
	// DoctorID is the ObjectID of the doctor assigned to the appointment.
	DoctorID primitive.ObjectID
	// TotalFee is the full fee charged for the appointment, from which the
	// mandatory deposit (50%) and remaining settlement are derived.
	TotalFee float64
	// Status is the booking-domain status of the appointment, e.g.
	// "PENDING", "DEPOSIT_PAID", "COMPLETED", "CANCELLED".
	Status string
	// PaymentType is the payment channel recorded on the appointment
	// ("ONLINE", "IN_PERSON", or empty for legacy rows).
	PaymentType string
}

// ---------------------------------------------------------------------------
// Entities
// ---------------------------------------------------------------------------

// Wallet is a patient/doctor/clinic digital wallet holding the current balance
// and currency for a single user.
type Wallet struct {
	// ID is the unique identifier of the wallet document.
	ID primitive.ObjectID `bson:"_id" json:"id"`
	// UserID is the ObjectID of the user that owns the wallet.
	UserID primitive.ObjectID `bson:"user_id" json:"user_id"`
	// Balance is the current monetary balance held in the wallet.
	Balance float64 `bson:"balance" json:"balance"`
	// Currency is the ISO 4217-style currency code (default "IRR").
	Currency string `bson:"currency" json:"currency"`
	// CreatedAt is when the wallet was first created.
	CreatedAt time.Time `bson:"created_at" json:"created_at"`
	// UpdatedAt is when the wallet was last mutated.
	UpdatedAt time.Time `bson:"updated_at" json:"updated_at"`
}

// ToResponse converts the wallet entity into its JSON response DTO. It is
// nil-safe: a nil receiver yields a nil response.
func (w *Wallet) ToResponse() *WalletResponse {
	if w == nil {
		return nil
	}
	return &WalletResponse{
		ID:        w.ID.Hex(),
		UserID:    w.UserID.Hex(),
		Balance:   w.Balance,
		Currency:  w.Currency,
		CreatedAt: w.CreatedAt,
		UpdatedAt: w.UpdatedAt,
	}
}

// Transaction is an immutable ledger entry recording a single movement against
// a wallet (deposit, withdrawal, refund, visit fee, forfeit or revenue share).
type Transaction struct {
	// ID is the unique identifier of the transaction document.
	ID primitive.ObjectID `bson:"_id" json:"id"`
	// UserID is the ObjectID of the wallet owner the transaction applies to.
	UserID primitive.ObjectID `bson:"user_id" json:"user_id"`
	// Amount is the monetary magnitude of the movement. It is always positive;
	// the direction (credit/debit) is implied by Type.
	Amount float64 `bson:"amount" json:"amount"`
	// Type is the kind of movement (deposit, refund, visit fee, ...).
	Type TransactionType `bson:"type" json:"type"`
	// ReferenceID is an optional correlation id linking the transaction to its
	// cause (e.g. a tracking code or an appointment id hex).
	ReferenceID string `bson:"reference_id" json:"reference_id"`
	// CreatedAt is when the transaction was recorded.
	CreatedAt time.Time `bson:"created_at" json:"created_at"`
}

// ToResponse converts the transaction entity into its JSON response DTO. It is
// nil-safe: a nil receiver yields a nil response.
func (t *Transaction) ToResponse() *TransactionResponse {
	if t == nil {
		return nil
	}
	return &TransactionResponse{
		ID:          t.ID.Hex(),
		UserID:      t.UserID.Hex(),
		Amount:      t.Amount,
		Type:        t.Type,
		ReferenceID: t.ReferenceID,
		CreatedAt:   t.CreatedAt,
	}
}

// Invoice is the billing record for a single appointment, holding the fee
// breakdown, amount collected, and the amount credited to the doctor at
// settlement or forfeit.
type Invoice struct {
	// ID is the unique identifier of the invoice document.
	ID primitive.ObjectID `bson:"_id" json:"id"`
	// AppointmentID is the ObjectID of the appointment this invoice bills.
	AppointmentID primitive.ObjectID `bson:"appointment_id" json:"appointment_id"`
	// DoctorID is the ObjectID of the doctor who performed the appointment.
	DoctorID primitive.ObjectID `bson:"doctor_id" json:"doctor_id"`
	// UserID is the ObjectID of the patient (needed for refunds/debits).
	UserID primitive.ObjectID `bson:"user_id" json:"user_id"`
	// TotalFee is the full fee for the appointment.
	TotalFee float64 `bson:"total_fee" json:"total_fee"`
	// DepositPaid is the amount collected up front (full visit fee for online pay).
	DepositPaid float64 `bson:"deposit_paid" json:"deposit_paid"`
	// DoctorShare is the amount credited to the doctor's wallet at settlement
	// or forfeit (the full TotalFee or forfeited deposit).
	DoctorShare float64 `bson:"doctor_share" json:"doctor_share"`
	// Status is the current financial state of the invoice.
	Status InvoiceStatus `bson:"status" json:"status"`
	// PaymentType records how the fee was collected (online wallet vs in-clinic).
	PaymentType string `bson:"payment_type,omitempty" json:"payment_type,omitempty"`
	// CreatedAt is when the invoice was first created (deposit paid).
	CreatedAt time.Time `bson:"created_at" json:"created_at"`
	// UpdatedAt is when the invoice was last mutated.
	UpdatedAt time.Time `bson:"updated_at" json:"updated_at"`
}

// ToResponse converts the invoice entity into its JSON response DTO. It is
// nil-safe: a nil receiver yields a nil response.
func (i *Invoice) ToResponse() *InvoiceResponse {
	if i == nil {
		return nil
	}
	return &InvoiceResponse{
		ID:            i.ID.Hex(),
		AppointmentID: i.AppointmentID.Hex(),
		DoctorID:      i.DoctorID.Hex(),
		UserID:        i.UserID.Hex(),
		TotalFee:      i.TotalFee,
		DepositPaid:   i.DepositPaid,
		DoctorShare:   i.DoctorShare,
		Status:        i.Status,
		PaymentType:   i.PaymentType,
		CreatedAt:     i.CreatedAt,
		UpdatedAt:     i.UpdatedAt,
	}
}

// PaymentAttempt is a mock gateway payment attempt initiated by a user to top
// up their wallet, later verified via a tracking code.
type PaymentAttempt struct {
	// ID is the unique identifier of the payment attempt document.
	ID primitive.ObjectID `bson:"_id" json:"id"`
	// UserID is the ObjectID of the user initiating the payment.
	UserID primitive.ObjectID `bson:"user_id" json:"user_id"`
	// Amount is the monetary amount the user is attempting to pay.
	Amount float64 `bson:"amount" json:"amount"`
	// Status is the current state of the attempt (pending/success/failed).
	Status PaymentAttemptStatus `bson:"status" json:"status"`
	// TrackingCode is the secure random code the user must present to verify
	// the payment at the mock gateway.
	TrackingCode string `bson:"tracking_code" json:"tracking_code"`
	// CreatedAt is when the attempt was initiated.
	CreatedAt time.Time `bson:"created_at" json:"created_at"`
	// UpdatedAt is when the attempt was last mutated (e.g. on verification).
	UpdatedAt time.Time `bson:"updated_at" json:"updated_at"`
}

// ToResponse converts the payment attempt entity into its JSON response DTO.
// PaymentURL is intentionally left empty here; it is populated by the service
// for the initiate response only and is never persisted. It is nil-safe: a
// nil receiver yields a nil response.
func (p *PaymentAttempt) ToResponse() *PaymentAttemptResponse {
	if p == nil {
		return nil
	}
	return &PaymentAttemptResponse{
		ID:           p.ID.Hex(),
		UserID:       p.UserID.Hex(),
		Amount:       p.Amount,
		Status:       p.Status,
		TrackingCode: p.TrackingCode,
		CreatedAt:    p.CreatedAt,
		UpdatedAt:    p.UpdatedAt,
	}
}

// ---------------------------------------------------------------------------
// Response DTOs
// ---------------------------------------------------------------------------

// WalletResponse is the JSON shape returned for a wallet.
type WalletResponse struct {
	// ID is the unique identifier of the wallet document.
	ID string `json:"id"`
	// UserID is the hex ObjectID of the wallet owner.
	UserID string `json:"user_id"`
	// Balance is the current monetary balance.
	Balance float64 `json:"balance"`
	// Currency is the wallet's currency code.
	Currency string `json:"currency"`
	// CreatedAt is when the wallet was created.
	CreatedAt time.Time `json:"created_at"`
	// UpdatedAt is when the wallet was last mutated.
	UpdatedAt time.Time `json:"updated_at"`
}

// TransactionResponse is the JSON shape returned for a ledger entry.
type TransactionResponse struct {
	// ID is the unique identifier of the transaction document.
	ID string `json:"id"`
	// UserID is the hex ObjectID of the wallet owner the entry applies to.
	UserID string `json:"user_id"`
	// Amount is the monetary magnitude of the movement.
	Amount float64 `json:"amount"`
	// Type is the kind of movement.
	Type TransactionType `json:"type"`
	// ReferenceID is the optional correlation id.
	ReferenceID string `json:"reference_id"`
	// CreatedAt is when the entry was recorded.
	CreatedAt time.Time `json:"created_at"`
}

// InvoiceResponse is the JSON shape returned for an appointment invoice.
type InvoiceResponse struct {
	// ID is the unique identifier of the invoice document.
	ID string `json:"id"`
	// AppointmentID is the hex ObjectID of the billed appointment.
	AppointmentID string `json:"appointment_id"`
	// DoctorID is the hex ObjectID of the doctor.
	DoctorID string `json:"doctor_id"`
	// UserID is the hex ObjectID of the patient.
	UserID string `json:"user_id"`
	// TotalFee is the full fee for the appointment.
	TotalFee float64 `json:"total_fee"`
	// DepositPaid is the amount collected up front.
	DepositPaid float64 `json:"deposit_paid"`
	// DoctorShare is the amount credited to the doctor's wallet at settlement
	// or forfeit.
	DoctorShare float64 `json:"doctor_share"`
	// Status is the current financial state of the invoice.
	Status InvoiceStatus `json:"status"`
	// PaymentType is the payment channel (ONLINE or IN_PERSON).
	PaymentType string `json:"payment_type,omitempty"`
	// CreatedAt is when the invoice was created.
	CreatedAt time.Time `json:"created_at"`
	// UpdatedAt is when the invoice was last mutated.
	UpdatedAt time.Time `json:"updated_at"`
}

// PaymentAttemptResponse is the JSON shape returned for a mock payment attempt.
// PaymentURL is only set on the initiate response (by the service) and is not
// persisted on the document.
type PaymentAttemptResponse struct {
	// ID is the unique identifier of the payment attempt document.
	ID string `json:"id"`
	// UserID is the hex ObjectID of the user initiating the payment.
	UserID string `json:"user_id"`
	// Amount is the monetary amount being paid.
	Amount float64 `json:"amount"`
	// Status is the current state of the attempt.
	Status PaymentAttemptStatus `json:"status"`
	// TrackingCode is the code the user must present to verify the payment.
	TrackingCode string `json:"tracking_code"`
	// PaymentURL is the mock verification endpoint the client should hit, set
	// by the service on the initiate response; it is never persisted.
	PaymentURL string `json:"payment_url,omitempty"`
	// CreatedAt is when the attempt was initiated.
	CreatedAt time.Time `json:"created_at"`
	// UpdatedAt is when the attempt was last mutated.
	UpdatedAt time.Time `json:"updated_at"`
}

// ---------------------------------------------------------------------------
// Request DTOs
// ---------------------------------------------------------------------------

// MockPayRequest initiates a mock payment to top up the caller's wallet.
type MockPayRequest struct {
	// UserID is the hex ObjectID of the user paying into their wallet.
	UserID string `json:"user_id" validate:"required"`
	// Amount is the monetary amount to pay; must be strictly positive.
	Amount float64 `json:"amount" validate:"required,gt=0"`
}

// PayVisitFeeRequest pays the FULL visit fee for an appointment in a single
// up-front payment (the deposit/prepayment mechanism has been removed). UserID
// is normally taken from the auth context; it is also accepted on the body for
// testing.
type PayVisitFeeRequest struct {
	// AppointmentID is the hex ObjectID of the appointment to pay the visit fee
	// for.
	AppointmentID string `json:"appointment_id" validate:"required"`
	// UserID is an optional override of the authenticated user id, used mainly
	// for testing.
	UserID string `json:"user_id,omitempty"`
}

// SettleRequest settles the remaining balance of an appointment.
type SettleRequest struct {
	// AppointmentID is the hex ObjectID of the appointment to settle.
	AppointmentID string `json:"appointment_id" validate:"required"`
}

// CancelRequest processes a cancellation, optionally forfeiting the deposit on
// a late cancellation / no-show.
type CancelRequest struct {
	// AppointmentID is the hex ObjectID of the appointment being cancelled.
	AppointmentID string `json:"appointment_id" validate:"required"`
	// IsLateOrNoShow indicates whether the cancellation is within the no-refund
	// window (no-show / late cancel), in which case the deposit is forfeited.
	IsLateOrNoShow bool `json:"is_late_or_no_show"`
}

// ---------------------------------------------------------------------------
// Doctor-facing read DTOs
// ---------------------------------------------------------------------------

// DoctorEarningsSummaryResponse is the aggregated earnings summary returned to
// a signed-in doctor for a half-open date window [From, To] (To is inclusive
// calendar day in the API; the service queries [from, to+1day)).
type DoctorEarningsSummaryResponse struct {
	// From is the inclusive start date of the window (YYYY-MM-DD, UTC).
	From string `json:"from"`
	// To is the inclusive end date of the window (YYYY-MM-DD, UTC).
	To string `json:"to"`
	// TotalCompleted is the number of settled/forfeited invoices in the window.
	TotalCompleted int `json:"total_completed"`
	// DoctorShare is the sum of amounts credited to the doctor's wallet in the
	// window (settled visits + forfeited deposits).
	DoctorShare float64 `json:"doctor_share"`
	// PendingSettlement is the sum of fees already collected from patients
	// (PARTIAL invoices) that have not yet been credited to the doctor.
	PendingSettlement float64 `json:"pending_settlement"`
	// PendingCount is how many PARTIAL (paid, awaiting settle) invoices fall
	// in the window.
	PendingCount int `json:"pending_count"`
}

// DoctorWalletResponse is the wallet balance returned to a signed-in doctor.
// Currency is always reported as "Toman" to mirror what the frontend expects.
type DoctorWalletResponse struct {
	// Balance is the current monetary balance held in the doctor's wallet.
	Balance float64 `json:"balance"`
	// Currency is the human-readable currency label.
	Currency string `json:"currency"`
}

// ---------------------------------------------------------------------------
// Admin dashboard DTOs
// ---------------------------------------------------------------------------

// DashboardRange is the aggregation window applied to the admin dashboard
// report. It is kept as a typed string so the caller can branch cleanly.
type DashboardRange string

const (
	// DashboardRange6m covers the most recent 6 complete months.
	DashboardRange6m DashboardRange = "6m"
	// DashboardRange12m covers the most recent 12 complete months.
	DashboardRange12m DashboardRange = "12m"
)

// DashboardSummaryResponse holds the KPI numbers shown on the dashboard cards.
type DashboardSummaryResponse struct {
	// TotalRevenue is the sum of realized revenue across the window (Toman).
	TotalRevenue float64 `json:"total_revenue"`
	// TotalAppointments is the number of appointments scheduled in the window.
	TotalAppointments int64 `json:"total_appointments"`
	// AvgNoShowRate is the mean monthly no-show rate (0–100) across the window.
	AvgNoShowRate float64 `json:"avg_no_show_rate"`
}

// DashboardRevenuePoint is a single point in the revenue-over-time series.
type DashboardRevenuePoint struct {
	// Month is a short English month label, e.g. "Jul".
	Month string `json:"month"`
	// Revenue is the realized revenue for the month (Toman).
	Revenue float64 `json:"revenue"`
}

// DashboardDoctorEarningsPoint is a single point in the doctor-earnings series.
type DashboardDoctorEarningsPoint struct {
	// Month is a short English month label, e.g. "Jul".
	Month string `json:"month"`
	// DoctorEarnings is the amount credited to doctors for the month (Toman).
	DoctorEarnings float64 `json:"doctor_earnings"`
}

// DashboardNoShowPoint is a single point in the no-show-rate series.
type DashboardNoShowPoint struct {
	// Month is a short English month label, e.g. "Jul".
	Month string `json:"month"`
	// NoShowRate is the percentage of appointments missed (0–100).
	NoShowRate float64 `json:"no_show_rate"`
}

// DashboardResponse is the full payload returned by GET /finance/dashboard.
type DashboardResponse struct {
	// Summary holds the KPI summary numbers shown on the cards.
	Summary DashboardSummaryResponse `json:"summary"`
	// RevenueTrend is the monthly realized-revenue series.
	RevenueTrend []DashboardRevenuePoint `json:"revenue_trend"`
	// DoctorEarningsTrend is the monthly amount credited to doctors.
	DoctorEarningsTrend []DashboardDoctorEarningsPoint `json:"doctor_earnings_trend"`
	// NoShowTrend is the monthly no-show-rate series.
	NoShowTrend []DashboardNoShowPoint `json:"no_show_trend"`
}

// MonthlyAppointmentStat holds clinic-wide appointment counts for a single
// calendar month. It is the value object returned by the cross-domain
// AppointmentService adapter so the finance dashboard can compute no-show rates
// without importing internal/booking.
type MonthlyAppointmentStat struct {
	// Year is the 4-digit calendar year.
	Year int
	// Month is the 1-based calendar month number.
	Month int
	// Total is the total number of appointments scheduled in the month.
	Total int64
	// NoShow is the number of appointments marked NO_SHOW in the month.
	NoShow int64
}
