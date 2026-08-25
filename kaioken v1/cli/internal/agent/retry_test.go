package agent

import (
	"context"
	"errors"
	"fmt"
	"testing"
)

func TestRetryableRunError(t *testing.T) {
	retryable := []error{
		errors.New("read tcp: connection reset by peer"),
		errors.New("unexpected EOF"),
		errors.New("stream error: INTERNAL_ERROR"),
		errors.New("provider returned 503 Service Unavailable"),
		errors.New("Post \"https://x\": dial tcp: i/o timeout"),
		errors.New("anthropic: Overloaded"),
	}
	for _, err := range retryable {
		if !retryableRunError(err) {
			t.Errorf("should retry: %v", err)
		}
	}
	final := []error{
		nil,
		context.Canceled,
		context.DeadlineExceeded,
		fmt.Errorf("wrapped: %w", context.Canceled),
		errors.New("401 Unauthorized"),
		errors.New("model not found"),
		errors.New("invalid request: messages must alternate"),
	}
	for _, err := range final {
		if retryableRunError(err) {
			t.Errorf("must not retry: %v", err)
		}
	}
}
