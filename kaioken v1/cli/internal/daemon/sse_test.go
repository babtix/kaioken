package daemon

import (
	"bufio"
	"context"
	"encoding/json"
	"io"
	"net/http"
	"strconv"
	"strings"
	"sync/atomic"
	"testing"
	"time"
)

type sseFrame struct {
	id    string
	event string
	data  string
}

// frameReader reads SSE frames off one persistent bufio.Reader for the life
// of a test connection, so heartbeat comments and frame boundaries are never
// split across two independently-buffered readers.
type frameReader struct {
	r     *bufio.Reader
	pings atomic.Int64
}

func newFrameReader(r io.Reader) *frameReader {
	return &frameReader{r: bufio.NewReader(r)}
}

func (fr *frameReader) next() (sseFrame, error) {
	var cur sseFrame
	for {
		line, err := fr.r.ReadString('\n')
		if err != nil {
			return cur, err
		}
		line = strings.TrimRight(line, "\r\n")
		switch {
		case line == "":
			if cur.event != "" {
				return cur, nil
			}
		case strings.HasPrefix(line, ":"):
			fr.pings.Add(1)
		case strings.HasPrefix(line, "id: "):
			cur.id = strings.TrimPrefix(line, "id: ")
		case strings.HasPrefix(line, "event: "):
			cur.event = strings.TrimPrefix(line, "event: ")
		case strings.HasPrefix(line, "data: "):
			cur.data = strings.TrimPrefix(line, "data: ")
		}
	}
}

// readFrame reads the next frame with a test timeout, skipping heartbeats.
func readFrame(t *testing.T, fr *frameReader, timeout time.Duration) sseFrame {
	t.Helper()
	type result struct {
		frame sseFrame
		err   error
	}
	ch := make(chan result, 1)
	go func() {
		f, err := fr.next()
		ch <- result{f, err}
	}()
	select {
	case r := <-ch:
		if r.err != nil {
			t.Fatalf("reading SSE frame: %v", r.err)
		}
		return r.frame
	case <-time.After(timeout):
		t.Fatal("timed out reading SSE frame")
		return sseFrame{}
	}
}

// openSSE issues an authenticated GET /v1/events?since=<since>.
func openSSE(t *testing.T, url, since string) (*http.Response, context.CancelFunc) {
	t.Helper()
	ctx, cancel := context.WithCancel(context.Background())
	full := url + "/v1/events"
	if since != "" {
		full += "?since=" + since
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, full, nil)
	if err != nil {
		cancel()
		t.Fatal(err)
	}
	req.Header.Set("Authorization", "Bearer "+testToken)
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		cancel()
		t.Fatal(err)
	}
	return resp, cancel
}

// TestSSEWorksWithRequestLogging exercises the SSE handler through
// logRequests' statusWriter wrapper (Quiet: false) — every other SSE test
// uses Quiet: true, which skips that wrapper entirely and would silently
// miss a regression where wrapping breaks the http.Flusher assertion.
func TestSSEWorksWithRequestLogging(t *testing.T) {
	srv := &Server{opts: Options{Token: testToken, Quiet: false}, started: time.Now(), cancel: func() {}, hub: NewHub(), mgr: NewManager()}
	srv.runs = NewRuns(srv.hub)
	ts := newTestServer(t, srv)

	resp, cancel := openSSE(t, ts.URL, "")
	defer cancel()
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		t.Fatalf("status = %d, want 200", resp.StatusCode)
	}
	fr := newFrameReader(resp.Body)
	if f := readFrame(t, fr, 2*time.Second); f.event != "ready" {
		t.Fatalf("event = %q, want ready", f.event)
	}
}

func TestSSEReadyFrame(t *testing.T) {
	srv := &Server{opts: Options{Token: testToken, Quiet: true}, started: time.Now(), cancel: func() {}, hub: NewHub(), mgr: NewManager(), port: 54321}
	srv.runs = NewRuns(srv.hub)
	ts := newTestServer(t, srv)

	resp, cancel := openSSE(t, ts.URL, "")
	defer cancel()
	defer resp.Body.Close()

	if ct := resp.Header.Get("Content-Type"); ct != "text/event-stream" {
		t.Errorf("Content-Type = %q, want text/event-stream", ct)
	}

	fr := newFrameReader(resp.Body)
	f := readFrame(t, fr, 2*time.Second)
	if f.event != "ready" {
		t.Fatalf("first frame event = %q, want ready", f.event)
	}
	var data struct {
		Port    int    `json:"port"`
		Version string `json:"version"`
	}
	if err := json.Unmarshal([]byte(f.data), &data); err != nil {
		t.Fatal(err)
	}
	if data.Port != 54321 {
		t.Errorf("ready.port = %d, want 54321", data.Port)
	}
}

func TestSSEReplayThenLive(t *testing.T) {
	srv := &Server{opts: Options{Token: testToken, Quiet: true}, started: time.Now(), cancel: func() {}, hub: NewHub(), mgr: NewManager()}
	srv.runs = NewRuns(srv.hub)
	srv.hub.Publish("a", nil)
	srv.hub.Publish("b", nil)
	ts := newTestServer(t, srv)

	resp, cancel := openSSE(t, ts.URL, "")
	defer cancel()
	defer resp.Body.Close()
	fr := newFrameReader(resp.Body)

	if f := readFrame(t, fr, 2*time.Second); f.event != "ready" {
		t.Fatalf("event = %q, want ready", f.event)
	}
	if f := readFrame(t, fr, 2*time.Second); f.event != "a" {
		t.Fatalf("event = %q, want a", f.event)
	}
	if f := readFrame(t, fr, 2*time.Second); f.event != "b" {
		t.Fatalf("event = %q, want b", f.event)
	}

	srv.hub.Publish("c", nil)
	if f := readFrame(t, fr, 2*time.Second); f.event != "c" {
		t.Fatalf("live event = %q, want c", f.event)
	}
}

func TestSSEReconnectReplay(t *testing.T) {
	srv := &Server{opts: Options{Token: testToken, Quiet: true}, started: time.Now(), cancel: func() {}, hub: NewHub(), mgr: NewManager()}
	srv.runs = NewRuns(srv.hub)
	seqA := srv.hub.Publish("a", nil)
	srv.hub.Publish("b", nil)
	ts := newTestServer(t, srv)

	resp, cancel := openSSE(t, ts.URL, strconv.FormatUint(seqA, 10))
	defer cancel()
	defer resp.Body.Close()
	fr := newFrameReader(resp.Body)

	if f := readFrame(t, fr, 2*time.Second); f.event != "ready" {
		t.Fatalf("event = %q, want ready", f.event)
	}
	// Only "b" should replay — seq > seqA.
	if f := readFrame(t, fr, 2*time.Second); f.event != "b" {
		t.Fatalf("event = %q, want b", f.event)
	}
}

func TestSSEStreamReset(t *testing.T) {
	srv := &Server{opts: Options{Token: testToken, Quiet: true}, started: time.Now(), cancel: func() {}, hub: NewHub(), mgr: NewManager()}
	srv.runs = NewRuns(srv.hub)
	for i := 0; i < ringSize+5; i++ {
		srv.hub.Publish("tick", nil)
	}
	ts := newTestServer(t, srv)

	resp, cancel := openSSE(t, ts.URL, "1")
	defer cancel()
	defer resp.Body.Close()
	fr := newFrameReader(resp.Body)

	if f := readFrame(t, fr, 2*time.Second); f.event != "ready" {
		t.Fatalf("first event = %q, want ready", f.event)
	}
	f := readFrame(t, fr, 2*time.Second)
	if f.event != "stream.reset" {
		t.Fatalf("second event = %q, want stream.reset", f.event)
	}
	var data struct {
		FromSeq uint64 `json:"from_seq"`
	}
	if err := json.Unmarshal([]byte(f.data), &data); err != nil {
		t.Fatal(err)
	}
	if data.FromSeq != srv.hub.OldestSeq() {
		t.Errorf("from_seq = %d, want %d", data.FromSeq, srv.hub.OldestSeq())
	}
}

func TestSSEHeartbeat(t *testing.T) {
	old := sseHeartbeat
	sseHeartbeat = 20 * time.Millisecond
	defer func() { sseHeartbeat = old }()

	srv := &Server{opts: Options{Token: testToken, Quiet: true}, started: time.Now(), cancel: func() {}, hub: NewHub(), mgr: NewManager()}
	srv.runs = NewRuns(srv.hub)
	ts := newTestServer(t, srv)

	resp, cancel := openSSE(t, ts.URL, "")
	defer cancel()
	defer resp.Body.Close()
	fr := newFrameReader(resp.Body)

	if f := readFrame(t, fr, 2*time.Second); f.event != "ready" {
		t.Fatalf("event = %q, want ready", f.event)
	}
	// No more real events will arrive, so next() will block scanning past
	// heartbeat comments forever (until resp.Body.Close() at test end
	// unblocks it) — run it in the background and poll the counter it bumps
	// on every ": ping" line.
	go fr.next() //nolint:errcheck // intentionally discarded; see comment above

	deadline := time.Now().Add(2 * time.Second)
	for fr.pings.Load() == 0 && time.Now().Before(deadline) {
		time.Sleep(10 * time.Millisecond)
	}
	if fr.pings.Load() == 0 {
		t.Error("did not observe a heartbeat ping within 2s")
	}
}

func TestSSEBadSince(t *testing.T) {
	ts := newTestServer(t, nil)
	resp := doRequest(t, http.MethodGet, ts.URL+"/v1/events?since=not-a-number", testToken, "")
	if resp.StatusCode != http.StatusBadRequest {
		t.Fatalf("status = %d, want 400", resp.StatusCode)
	}
}
