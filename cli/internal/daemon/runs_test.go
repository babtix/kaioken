package daemon

import (
	"context"
	"encoding/json"
	"sync"
	"testing"
	"time"
)

// TestRunRecordMarshalJSONConcurrentSafe stresses MarshalJSON against
// concurrent SetProgress/AddArtifact calls. Without the r.mu-protected
// snapshot, this races on Prog/Artifacts (only visible under -race, which
// needs cgo unavailable in this environment — but the fix is structural: no
// field is read outside the lock, so there is nothing left to race).
func TestRunRecordMarshalJSONConcurrentSafe(t *testing.T) {
	r := &RunRecord{ID: "run_test", State: RunRunning, Started: time.Now(), Artifacts: []Artifact{}}

	var wg sync.WaitGroup
	stop := make(chan struct{})

	wg.Add(2)
	go func() {
		defer wg.Done()
		i := 0
		for {
			select {
			case <-stop:
				return
			default:
				r.SetProgress("phase", "msg", i, 100)
				r.AddArtifact("path", i, "wiki_doc")
				i++
			}
		}
	}()
	go func() {
		defer wg.Done()
		for {
			select {
			case <-stop:
				return
			default:
				if _, err := json.Marshal(r); err != nil {
					t.Errorf("marshal: %v", err)
					return
				}
			}
		}
	}()

	time.Sleep(50 * time.Millisecond)
	close(stop)
	wg.Wait()
}

func TestRunsCancelIsNotFailed(t *testing.T) {
	rs := NewRuns(NewHub())
	ws := &Workspace{ID: "ws_test"}

	started := make(chan struct{})
	run := rs.Start(ws, "wiki", map[string]any{}, func(ctx context.Context, r *RunRecord) error {
		close(started)
		<-ctx.Done()
		return ctx.Err()
	})

	<-started
	if err := rs.Cancel(run.ID); err != nil {
		t.Fatalf("Cancel: %v", err)
	}

	deadline := time.After(2 * time.Second)
	for {
		got, _ := rs.Get(run.ID)
		got.mu.Lock()
		state := got.State
		got.mu.Unlock()
		if state == RunCancelled {
			break
		}
		if state == RunFailed {
			t.Fatalf("state = failed, want cancelled")
		}
		select {
		case <-deadline:
			t.Fatal("timed out waiting for cancelled state")
		case <-time.After(10 * time.Millisecond):
		}
	}
}

func TestRunsPanicBecomesFailed(t *testing.T) {
	rs := NewRuns(NewHub())
	ws := &Workspace{ID: "ws_test"}

	run := rs.Start(ws, "generate", map[string]any{}, func(ctx context.Context, r *RunRecord) error {
		panic("boom")
	})

	deadline := time.After(2 * time.Second)
	for {
		got, _ := rs.Get(run.ID)
		got.mu.Lock()
		state := got.State
		errMsg := got.Error
		got.mu.Unlock()
		if state == RunFailed {
			if errMsg == "" {
				t.Fatal("expected a non-empty error message for a panicking run")
			}
			return
		}
		select {
		case <-deadline:
			t.Fatal("timed out waiting for failed state")
		case <-time.After(10 * time.Millisecond):
		}
	}
}
