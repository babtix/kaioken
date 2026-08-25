# Error Handling and Retry Logic

This chapter explains how kaioken identifies retryable errors, implements exponential backoff for streaming and non-streaming requests, and uses provider-specific signals to manage transient failures in LLM provider interactions.

## Table of Contents
- [Error Handling and Retry Logic](#error-handling-and-retry-logic)
  - [Overview](#overview)
  - [Retryable Error Identification](#retryable-error-identification)
  - [Exponential Backoff Implementation](#exponential-backoff-implementation)
  - [Special Case Handling](#special-case-handling)
  - [Streaming-Specific Constraints](#streaming-specific-constraints)
  - [Error Propagation](#error-propagation)
  - [Referenced Files](#referenced-files)

## Overview

The LLM client (`internal/llm/openrouter.go` and `internal/llm/stream.go`) implements a unified retry mechanism for both standard and tool-calling chat requests. Retry logic handles:
- Network failures (connection timeouts, DNS errors)
- Rate limiting (HTTP 429)
- Server errors (HTTP 5xx)
- Provider-specific transient conditions (NVIDIA routing issues)
- Payment required signals (HTTP 402) triggering token budget adjustments

The mechanism differs slightly between streaming and non-streaming paths to prevent duplicate output in streaming scenarios.

## Retryable Error Identification

Retryable errors are identified in the `doPost` (non-streaming) and `doStream` (streaming) functions. An error is retryable if:

1. **Network-level failures**: Any error from `http.Do` or `io.ReadAll` (e.g., connection refused, timeout)
2. **HTTP status codes**:
   - `429 Too Many Requests` (rate limiting)
   - `500-599` (server errors)
3. **Special NVIDIA 404 handling**: Specific "Function ... Not found for account" errors triggering URL fallback

Non-retryable errors include:
- Client errors (400, 401, 403, 404 except NVIDIA special case, 422)
- Provider-reported errors in response body (e.g., invalid API key)
- Errors after text emission in streaming (to prevent duplication)

### HTTP Status Code Handling

| Status Code | Retryable? | Handling |
|-------------|------------|----------|
| 429         | Yes        | Triggers backoff |
| 500-599     | Yes        | Triggers backoff |
| 400, 401, 403, 422 | No | Returns immediately with error |
| 404 (NVIDIA specific) | Conditional | Triggers URL fallback (see [NVIDIA Handling](#nvidia-specific-404-handling)) |
| 402         | Special    | Triggers token ceiling reduction (see [Payment Required Handling](#payment-required-handling)) |

```go
// internal/llm/openrouter.go:295-326
func (c *Client) doPost(ctx context.Context, body []byte) (raw []byte, retryable bool, err error) {
    // ... request setup ...
    resp, err := c.HTTP.Do(req)
    if err != nil {
        return nil, true, err // Network error: retryable
    }
    // ... response reading ...
    if resp.StatusCode == http.StatusTooManyRequests || resp.StatusCode >= 500 {
        return nil, true, fmt.Errorf("provider HTTP %d: %s", resp.StatusCode, truncate(string(raw), 300))
    }
    // ... non-retryable error handling ...
}
```

```go
// internal/llm/stream.go:137-177
func (c *Client) doStream(ctx context.Context, body []byte, onDelta func(string)) (Message, bool, error) {
    // ... request setup ...
    resp, err := c.HTTP.Do(req)
    if err != nil {
        return Message{}, true, err // Network error: retryable
    }
    // ... status handling ...
    switch {
    case resp.StatusCode == http.StatusTooManyRequests || resp.StatusCode >= 500:
        // ... retryable error ...
    case resp.StatusCode == http.StatusBadRequest, /* ... */:
        // ... non-retryable unless NVIDIA fallback ...
    }
}
```

## Exponential Backoff Implementation

Both streaming and non-streaming paths use identical backoff logic with four attempts:
1. Immediate retry (0ms)
2. 3 second delay
3. 10 second delay
4. 25 second delay

The backoff sequence is defined as:
```go
backoffs := []time.Duration{0, 3 * time.Second, 10 * time.Second, 25 * time.Second}
```

### Retry Loop Structure
```go
// internal/llm/openrouter.go:196-232 (rawChat)
for i := 0; i < len(backoffs); i++ {
    if backoffs[i] > 0 {
        select {
        case <-time.After(backoffs[i]):
        case <-ctx.Done():
            return nil, ctx.Err()
        }
    }
    // Attempt request
    raw, retryable, err := c.doPost(ctx, body)
    if err == nil {
        return raw, nil
    }
    // ... error handling ...
    if !retryable {
        return nil, creditError(err, ceiling)
    }
}
```

```go
// internal/llm/stream.go:99-135 (stream)
for i := 0; i < len(backoffs); i++ {
    if backoffs[i] > 0 {
        select {
        case <-time.After(backoffs[i]):
        case <-ctx.Done():
            return Message{}, ctx.Err()
        }
    }
    // Attempt request
    msg, retryable, err := c.doStream(ctx, body, onDelta)
    if err == nil {
        return msg, nil
    }
    // ... error handling ...
    if !retryable {
        return Message{}, creditError(err, ceiling)
    }
}
```

**Key behaviors**:
- Context cancellation respected during backoff waits
- Loop index decremented on successful token ceiling adjustment (see [Payment Required Handling](#payment-required-handling))
- Final error wrapped with `creditError` after exhausting retries

## Special Case Handling

### Payment Required Handling (HTTP 402)

When the provider returns a 402 status (indicating insufficient credits), the client:
1. Extracts the suggested token ceiling from the error via `affordableTokens`
2. Updates internal token ceiling via `learnCeiling`
3. Retries immediately without backoff by decrementing loop index
4. Only performs this adjustment once per request sequence (`shrunk` flag)

```go
// internal/llm/openrouter.go:212-224
if n, ok := affordableTokens(err); ok && !shrunk {
    shrunk = true
    c.learnCeiling(n)
    ceiling = n
    body = withMaxTokens(body, n)
    i-- // retry same backoff slot
    continue
}
```

```go
// internal/llm/stream.go:112-124
if n, ok := affordableTokens(err); ok && !shrunk {
    shrunk = true
    c.learnCeiling(n)
    ceiling = n
    body = withMaxTokens(body, n)
    i--
    continue
}
```

### NVIDIA-Specific 404 Handling

NVIDIA's API requires special handling for routing errors:
- Generic endpoint (`/v1/chat/completions`) may fail with "Function ... Not found for account"
- Model-specific endpoint (`/v1/chat/completions/{model}`) may work when generic fails
- Client toggles between endpoints on specific 404 errors

```go
// internal/llm/openrouter.go:263-284
func (c *Client) nvidia404(err error) bool {
    if err == nil || !strings.Contains(c.BaseURL, "integrate.api.nvidia.com") {
        return false
    }
    msg := err.Error()
    if !strings.Contains(msg, "404") {
        return false
    }
    switch {
    case !c.nvidiaModelURL && strings.Contains(msg, "Not found for account") && !c.nvidiaTriedFallback:
        // Try model-specific URL once
        c.nvidiaModelURL = true
        c.nvidiaTriedFallback = true
        return true
    case c.nvidiaModelURL && !strings.Contains(msg, "Not found for account"):
        // Revert to generic endpoint for real error
        c.nvidiaModelURL = false
        return true
    }
    return false
}
```

When `nvidia404` returns `true`, the caller recurses:
```go
// In doPost (openrouter.go:318-320)
if c.nvidia404(e) {
    return c.doPost(ctx, body)
}

// In doStream (stream.go:158-160)
if c.nvidia404(e) {
    return c.doStream(ctx, body, onDelta)
}
```

## Streaming-Specific Constraints

Streaming retries are constrained to prevent duplicate output:
- Retries only attempted if **no text has been emitted** to the user yet
- Tracked via `emitted` flag in `parseSSE`
- Once any delta is sent to `onDelta`, subsequent errors become non-retryable

```go
// internal/llm/stream.go:182-255 (parseSSE)
func parseSSE(ctx context.Context, r io.Reader, onDelta func(string), record func(*usage)) (Message, bool, error) {
    // ...
    for {
        // ... process SSE ...
        if ch.Delta.Content != "" {
            content.WriteString(ch.Delta.Content)
            if onDelta != nil {
                onDelta(ch.Delta.Content)
                emitted = true // Mark that output has begun
            }
        }
        // ...
    }
    // ...
    if readErr != nil {
        return Message{}, !emitted, readErr // Retry only if nothing emitted
    }
}
```

This ensures:
- If connection fails before any text: safe to retry
- If connection fails after partial text: return error to prevent duplication
- Final `Message` contains only successfully streamed content

## Error Propagation

After exhausting retries:
1. Non-streaming paths return wrapped error via `creditError`
2. Streaming paths return wrapped error via `creditError` (if no emission) or partial `Message` (if emission occurred)
3. Context cancellation errors propagate immediately without wrapping

```go
// Final error handling in rawChat/stream
return nil, creditError(fmt.Errorf("giving up after retries: %w", lastErr), ceiling)
```

The `creditError` function (not shown in provided source) formats errors with token ceiling context for user diagnosis.

## Referenced Files
- `internal/llm/openrouter.go`: Contains core retry logic, backoff implementation, NVIDIA handling, and payment required logic
- `internal/llm/stream.go`: Contains streaming-specific retry constraints and SSE parsing with emission tracking

This retry mechanism ensures resilience against transient failures while preventing duplicate output in streaming scenarios and providing meaningful errors for permanent failures.

<!-- kaioken:files internal/llm/openrouter.go,internal/llm/stream.go -->
