package daemon

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"time"

	"kaioken/internal/version"
)

// sseHeartbeat is a var (not a const) so tests can shrink it rather than
// waiting 20 real seconds for a ping.
var sseHeartbeat = 20 * time.Second

// handleEvents is the SSE stream: docs/02-api-contract.md §2.2. It replays
// buffered events newer than ?since (or emits stream.reset when since predates
// the ring buffer), then forwards live events until the client disconnects.
func (s *Server) handleEvents(w http.ResponseWriter, r *http.Request) {
	flusher, ok := w.(http.Flusher)
	if !ok {
		writeError(w, http.StatusInternalServerError, codeEngineError, "streaming unsupported by this response writer", "")
		return
	}

	since, err := parseSince(r.URL.Query().Get("since"))
	if err != nil {
		writeError(w, http.StatusBadRequest, codeBadRequest, "since must be a non-negative integer", "")
		return
	}

	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")
	w.Header().Set("X-Accel-Buffering", "no")
	w.WriteHeader(http.StatusOK)
	flusher.Flush()

	writeSSEFrame(w, 0, "ready", map[string]any{"port": s.port, "version": version.Version})

	backfill, ok := s.hub.Replay(since)
	if !ok {
		writeSSEFrame(w, 0, "stream.reset", map[string]any{"from_seq": s.hub.OldestSeq()})
		// The client is told to refetch its state via REST, not to expect a
		// replay of everything still buffered — jump straight to "now" so
		// Subscribe below doesn't flood it with the whole ring.
		since = s.hub.CurrentSeq()
	} else {
		for _, ev := range backfill {
			writeSSEFrame(w, ev.Seq, ev.Type, ev)
			since = ev.Seq // advance past what we just sent so Subscribe
			// doesn't backfill (and duplicate) it again below.
		}
	}
	flusher.Flush()

	ch, unsub := s.hub.Subscribe(since)
	defer unsub()

	ticker := time.NewTicker(sseHeartbeat)
	defer ticker.Stop()

	for {
		select {
		case ev, open := <-ch:
			if !open {
				return // dropped as a slow subscriber
			}
			writeSSEFrame(w, ev.Seq, ev.Type, ev)
			flusher.Flush()
		case <-ticker.C:
			fmt.Fprint(w, ": ping\n\n")
			flusher.Flush()
		case <-r.Context().Done():
			return
		}
	}
}

func parseSince(raw string) (uint64, error) {
	if raw == "" {
		return 0, nil
	}
	return strconv.ParseUint(raw, 10, 64)
}

// writeSSEFrame writes one frame. Errors are ignored: a broken connection is
// discovered by the next Flush/Write anyway, and there is no client left to
// report the error to.
func writeSSEFrame(w http.ResponseWriter, id uint64, event string, data any) {
	raw, err := json.Marshal(data)
	if err != nil {
		return
	}
	fmt.Fprintf(w, "id: %d\nevent: %s\ndata: %s\n\n", id, event, raw)
}
