package otp

import "time"

// BanLevel is the persisted, per-phone "how many times has this number been
// temporarily blocked for brute-forcing an OTP" counter.
//
// It is intentionally stored in the database (not Redis) so it survives Redis
// restarts/flushei and lets the service apply an *escalating* block window:
// each consecutive block lasts longer than the previous one. The active block
// itself still lives in Redis with a TTL (otp:block:{phone}) so it auto-expires
// without any cron job; this document only remembers the escalation tier.
//
// The document is keyed by the normalized phone number (used as _id) so there is
// exactly one record per number and upserts are trivial.
type BanLevel struct {
	// Phone is the normalized Iranian mobile number and the document _id.
	Phone string `bson:"_id" json:"phone"`
	// Level is the number of times the phone has been blocked (1-based).
	Level int `bson:"level" json:"level"`
	// UpdatedAt is the timestamp of the most recent escalation.
	UpdatedAt time.Time `bson:"updated_at" json:"updated_at"`
}

// BanPolicy expresses the escalating, per-level temporary-block windows. Durations
// are populated from configuration so the schedule can be tuned without a code
// change. Level 1 is the first offence; levels beyond the configured list keep
// reusing the final (longest) window.
type BanPolicy struct {
	// Level1 is the block window applied on the first offence.
	Level1 time.Duration
	// Level2 is the block window applied on the second offence.
	Level2 time.Duration
	// Level3 is the block window applied on the third offence.
	Level3 time.Duration
	// Level4Plus is the block window applied on the fourth and every subsequent
	// offence (the escalation ceiling).
	Level4Plus time.Duration
}

// DurationFor returns the block window for the given (1-based) ban level. Levels
// above 3 all resolve to Level4Plus so repeat offenders settle at the longest
// configured window. A non-positive level falls back to Level1 defensively.
func (p BanPolicy) DurationFor(level int) time.Duration {
	switch {
	case level <= 1:
		return p.Level1
	case level == 2:
		return p.Level2
	case level == 3:
		return p.Level3
	default:
		return p.Level4Plus
	}
}
