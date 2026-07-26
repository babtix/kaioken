package llm

import (
	"net/http"
	"strconv"
	"time"
)

// Retry pacing.
//
// A rate limit is one of the few errors that arrives with instructions. The
// provider does not just refuse — it says when to come back, in a Retry-After
// header. Guessing instead of reading it fails in the one direction that
// matters: a fixed ladder of 3s, 10s, 25s against a limit that clears in a
// minute burns every attempt and reports failure to the user, when waiting
// once would have worked.
//
// So the schedule below is only the fallback, for the failures that arrive
// with no advice — a dropped connection, a 502. When the provider states a
// delay, that number wins.

// fallbackBackoffs pace retries when the provider says nothing about timing.
// The first entry is zero: the initial attempt is not a retry.
var fallbackBackoffs = []time.Duration{0, 3 * time.Second, 10 * time.Second, 25 * time.Second}

// maxRetryWait caps an honored Retry-After. A provider that asks for ten
// minutes is not rate-limiting a burst, it is down or the account is out of
// quota; blocking a terminal that long looks identical to a hang, and the user
// can always send the message again.
const maxRetryWait = 90 * time.Second

// retryAfter reads the delay a response asks for, reporting false when the
// headers say nothing usable.
//
// Two encodings are in the wild. Retry-After is standard and carries either
// seconds or an HTTP date; retry-after-ms is a de-facto extension several
// providers send for sub-second precision. The millisecond form is checked
// first because a provider that sends both means the finer one.
func retryAfter(h http.Header) (time.Duration, bool) {
	if ms := h.Get("retry-after-ms"); ms != "" {
		if f, err := strconv.ParseFloat(ms, 64); err == nil && f > 0 {
			return capWait(time.Duration(f) * time.Millisecond), true
		}
	}
	value := h.Get("Retry-After")
	if value == "" {
		return 0, false
	}
	if secs, err := strconv.ParseFloat(value, 64); err == nil {
		if secs <= 0 {
			return 0, false
		}
		return capWait(time.Duration(secs * float64(time.Second))), true
	}
	if when, err := http.ParseTime(value); err == nil {
		if d := time.Until(when); d > 0 {
			return capWait(d), true
		}
	}
	return 0, false
}

func capWait(d time.Duration) time.Duration {
	if d > maxRetryWait {
		return maxRetryWait
	}
	return d
}
