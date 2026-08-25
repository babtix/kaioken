package agent

import (
	"strings"
	"testing"

	"kaioken/internal/llm"
)

func convOf(contents ...string) []llm.Message {
	out := make([]llm.Message, len(contents))
	for i, c := range contents {
		out[i] = llm.Message{Role: "user", Content: c}
	}
	return out
}

func TestContextTrackerNilFallsBackToEstimation(t *testing.T) {
	conv := convOf("a", "b")
	var track *ContextTracker
	got, measured := track.Estimate(conv)
	if measured {
		t.Error("a nil tracker cannot report a measured figure")
	}
	if want := llm.EstimateTokens(conv); got != want {
		t.Errorf("Estimate = %d, want the plain estimate %d", got, want)
	}
}

// The point of the anchor: the provider's figure covers the measured prefix,
// and only what was appended afterwards is estimated.
func TestContextTrackerAnchorsOnMeasurement(t *testing.T) {
	conv := convOf("one", "two")
	track := &ContextTracker{}
	track.Record(5000, len(conv), conv)

	got, measured := track.Estimate(conv)
	if !measured {
		t.Fatal("expected a measured figure")
	}
	if got != 5000 {
		t.Errorf("Estimate = %d, want exactly the measurement 5000", got)
	}

	// Appending must add an estimate on top, not discard the anchor.
	conv = append(conv, llm.Message{Role: "tool", Content: strings.Repeat("x", 4000)})
	got, measured = track.Estimate(conv)
	if !measured {
		t.Fatal("appending must not invalidate the anchor")
	}
	if got <= 5000 {
		t.Errorf("Estimate = %d, want more than the anchor after appending", got)
	}
}

// The anchor validates itself against the prefix it measured, so no call site
// has to remember to invalidate it. These are the shapes that matter.
func TestContextTrackerDetectsRewrittenHistory(t *testing.T) {
	base := convOf("one", "two", "three", "four")

	cases := []struct {
		name string
		next []llm.Message
	}{
		{"compacted shorter", convOf("summary")},
		{"pruned in place", convOf("one", "[pruned]", "three", "four")},
		{"branch switched, same length", convOf("one", "other", "three", "four")},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			track := &ContextTracker{}
			track.Record(5000, len(base), base)
			got, measured := track.Estimate(tc.next)
			if measured {
				t.Errorf("stale anchor was used on rewritten history (got %d)", got)
			}
			if want := llm.EstimateTokens(tc.next); got != want {
				t.Errorf("fallback = %d, want the plain estimate %d", got, want)
			}
		})
	}
}

func TestContextTrackerResetAndBadInput(t *testing.T) {
	conv := convOf("a", "b")
	track := &ContextTracker{}
	track.Record(5000, len(conv), conv)
	track.Reset()
	if _, measured := track.Estimate(conv); measured {
		t.Error("Reset must drop the anchor")
	}

	// A call that reported no usage leaves any earlier anchor alone.
	track.Record(5000, len(conv), conv)
	track.Record(0, len(conv), conv)
	if _, measured := track.Estimate(conv); !measured {
		t.Error("a zero-token report must not clear a good anchor")
	}
	// n past the end is refused rather than panicking.
	track.Record(9000, len(conv)+5, conv)
	if got, _ := track.Estimate(conv); got != 5000 {
		t.Errorf("out-of-range Record changed the anchor: %d", got)
	}
}

// A measured conversation should not be compacted a tenth of a window early:
// Usable() holds that back to cover estimation error there is no longer any of.
func TestShouldCompactReclaimsEstimationSlack(t *testing.T) {
	// A large-context model is the case that matters: there the reserve is set
	// by the window/10 estimation slack rather than by the reply ceiling, so
	// there is slack to give back.
	model, ceiling := "openai/gpt-5", 1024
	window := llm.ContextWindow(model)
	conv := make([]llm.Message, 0, minCompactMessages)
	for i := 0; i < minCompactMessages; i++ {
		conv = append(conv, llm.Message{Role: "user", Content: "x"})
	}

	// Sized to sit between the estimated limit and the measured one.
	between := (Usable(model, ceiling) + measuredLimit(model, ceiling)) / 2
	if between <= Usable(model, ceiling) {
		t.Skipf("no slack to reclaim for %s (window %d)", model, window)
	}

	track := &ContextTracker{}
	track.Record(between, len(conv), conv)
	if need, _ := ShouldCompact(track, conv, model, ceiling); need {
		t.Errorf("measured %d compacted below the measured limit %d",
			between, measuredLimit(model, ceiling))
	}

	// The same size, measured, past the measured limit must still trigger.
	over := measuredLimit(model, ceiling) + 1
	track2 := &ContextTracker{}
	track2.Record(over, len(conv), conv)
	if need, _ := ShouldCompact(track2, conv, model, ceiling); !need {
		t.Errorf("measured %d did not trigger past the limit %d", over, measuredLimit(model, ceiling))
	}
}
