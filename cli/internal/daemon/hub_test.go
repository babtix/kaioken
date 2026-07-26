package daemon

import (
	"fmt"
	"strings"
	"testing"
	"time"
)

func TestHubOrdering(t *testing.T) {
	h := NewHub()
	ch, unsub := h.Subscribe(0)
	defer unsub()

	h.Publish("a", nil)
	h.Publish("b", nil)
	h.Publish("c", nil)

	var last uint64
	for i := 0; i < 3; i++ {
		select {
		case ev := <-ch:
			if ev.Seq <= last {
				t.Fatalf("seq did not increase: got %d after %d", ev.Seq, last)
			}
			last = ev.Seq
		case <-time.After(time.Second):
			t.Fatal("timed out waiting for event")
		}
	}
}

func TestHubReplay(t *testing.T) {
	h := NewHub()
	h.Publish("a", nil)
	h.Publish("b", nil)
	h.Publish("c", nil)

	events, ok := h.Replay(0)
	if !ok {
		t.Fatal("Replay(0) should never be 'too old'")
	}
	if len(events) != 3 {
		t.Fatalf("got %d events, want 3", len(events))
	}
	if events[0].Type != "a" || events[1].Type != "b" || events[2].Type != "c" {
		t.Fatalf("replay out of order: %+v", events)
	}

	// Replay from the middle should only return what's after it.
	events, ok = h.Replay(events[0].Seq)
	if !ok || len(events) != 2 {
		t.Fatalf("Replay(mid) = %v, %v; want 2 events, ok", events, ok)
	}
}

func TestHubReplayTooOld(t *testing.T) {
	h := NewHub()
	// Overflow the ring so seq 1 is evicted.
	for i := 0; i < ringSize+5; i++ {
		h.Publish("tick", nil)
	}
	if _, ok := h.Replay(1); ok {
		t.Fatal("Replay(1) should report too-old once the ring has wrapped past it")
	}
	// The most recent seq is never too old.
	events, ok := h.Replay(uint64(ringSize + 4))
	if !ok {
		t.Fatal("Replay of the most recent seq should not be too-old")
	}
	if len(events) != 1 {
		t.Fatalf("got %d events, want 1", len(events))
	}
}

func TestHubSubscribeBackfillsGap(t *testing.T) {
	h := NewHub()
	h.Publish("a", nil)
	seqB := h.Publish("b", nil)
	h.Publish("c", nil)

	// A subscriber joining after some history should receive only what it
	// missed (seq > since), then continue live.
	ch, unsub := h.Subscribe(seqB)
	defer unsub()

	select {
	case ev := <-ch:
		if ev.Type != "c" {
			t.Fatalf("first backfilled event = %q, want c", ev.Type)
		}
	case <-time.After(time.Second):
		t.Fatal("timed out waiting for backfilled event")
	}

	h.Publish("d", nil)
	select {
	case ev := <-ch:
		if ev.Type != "d" {
			t.Fatalf("live event = %q, want d", ev.Type)
		}
	case <-time.After(time.Second):
		t.Fatal("timed out waiting for live event")
	}
}

// TestHubSlowSubscriberDropped asserts that a subscriber whose buffer fills
// up is dropped rather than allowed to block Publish — a wedged front-end
// must never stall a wiki run.
func TestHubSlowSubscriberDropped(t *testing.T) {
	h := NewHub()
	ch, unsub := h.Subscribe(0)
	defer unsub()

	done := make(chan struct{})
	go func() {
		for i := 0; i < subBuffer+10; i++ {
			h.Publish("flood", map[string]any{"i": i})
		}
		close(done)
	}()

	select {
	case <-done:
	case <-time.After(5 * time.Second):
		t.Fatal("Publish blocked on a full subscriber buffer instead of dropping it")
	}

	// The subscriber should have been removed from the hub's live set.
	h.mu.Lock()
	n := len(h.subs)
	h.mu.Unlock()
	if n != 0 {
		t.Errorf("expected the slow subscriber to be dropped, %d subs remain", n)
	}

	// Its channel should be closed (drained then closed), not silently leaked.
	drained := 0
	for range ch {
		drained++
		if drained > subBuffer+20 {
			t.Fatal("channel was never closed")
		}
	}
}

func TestEventMarshalJSONFlattensFields(t *testing.T) {
	h := NewHub()
	ch, unsub := h.Subscribe(0)
	defer unsub()

	h.Publish("chat.delta", map[string]any{
		"workspace_id": "ws_1",
		"run_id":       "run_1",
		"session_id":   "sess_1",
		"text":         "hello",
	})

	ev := <-ch
	raw, err := ev.MarshalJSON()
	if err != nil {
		t.Fatal(err)
	}
	got := string(raw)
	for _, want := range []string{
		`"type":"chat.delta"`,
		`"workspace_id":"ws_1"`,
		`"run_id":"run_1"`,
		`"session_id":"sess_1"`,
		`"text":"hello"`,
		fmt.Sprintf(`"seq":%d`, ev.Seq),
	} {
		if !strings.Contains(got, want) {
			t.Errorf("marshaled event missing %s in %s", want, got)
		}
	}
}
