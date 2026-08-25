package agent

// Agent-level retry.
//
// The transport already retries what a status code admits to — a 429, a
// 503 — inside one HTTP exchange. What it cannot survive is a stream that
// dies mid-reply: by then bytes have been consumed and the request is gone,
// so the error surfaces here, between turns. Retrying at this level re-runs
// the whole model call, which is safe — history is immutable and no tool
// has executed for the failed turn yet — and much cheaper for the user than
// watching a twenty-minute run die on a hiccup.

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	"kaioken/internal/agent/events"
	"kaioken/internal/llm"
)

const (
	// maxTurnRetries is how many times one turn is re-attempted. Two covers
	// the blip; a provider that fails three times in a row is down.
	maxTurnRetries = 2
	// retryBaseDelay doubles per attempt.
	retryBaseDelay = 2 * time.Second
)

// retryableRunError reports whether a model-turn failure is transient
// plumbing rather than a real answer. Cancellation is never retried — the
// user asked for the stop. Everything else is judged by message, because
// the error has crossed enough wrappers that the type is long gone.
func retryableRunError(err error) bool {
	if err == nil || errors.Is(err, context.Canceled) || errors.Is(err, context.DeadlineExceeded) {
		return false
	}
	msg := strings.ToLower(err.Error())
	for _, marker := range []string{
		"connection reset", "broken pipe", "unexpected eof", "eof",
		"stream error", "timeout", "timed out", "temporarily unavailable",
		"connection refused", "no such host",
		"429", "500", "502", "503", "504", "overloaded",
	} {
		if strings.Contains(msg, marker) {
			return true
		}
	}
	return false
}

// chatWithRetry runs one model turn, re-attempting transient failures with
// exponential backoff. Retries are reported on the bus (retry_start /
// retry_end) and to the user — a silent second attempt would make the
// wait unexplainable.
//
// A retried streaming turn may repeat prose the first attempt already
// streamed; the live region is replaced by the final message either way,
// so the cost is cosmetic and the alternative is a dead run.
func (a *Agent) chatWithRetry(ctx context.Context, history []llm.Message, tools []llm.Tool, step int) (llm.Message, error) {
	bus := a.bus()
	var msg llm.Message
	var err error
	for attempt := 0; ; attempt++ {
		msg, err = a.chat(ctx, history, tools)
		if err == nil {
			if attempt > 0 {
				bus.Emit(&events.Event{Type: events.RetryEnd, Step: step, Depth: a.Depth})
			}
			return msg, nil
		}
		if attempt >= maxTurnRetries || !retryableRunError(err) || ctx.Err() != nil {
			if attempt > 0 {
				bus.Emit(&events.Event{Type: events.RetryEnd, Step: step, Depth: a.Depth, Err: err})
			}
			return msg, err
		}
		delay := retryBaseDelay << attempt
		bus.Emit(&events.Event{Type: events.RetryStart, Step: step, Depth: a.Depth,
			Err: err, Text: fmt.Sprintf("attempt %d of %d in %s", attempt+2, maxTurnRetries+1, delay)})
		a.UI.Info(fmt.Sprintf("model call failed (%v) — retrying in %s", err, delay))
		select {
		case <-time.After(delay):
		case <-ctx.Done():
			return msg, ctx.Err()
		}
	}
}
