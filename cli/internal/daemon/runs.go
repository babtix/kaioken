package daemon

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"sync"
	"time"
)

// RunState is the lifecycle state of a run.
type RunState string

const (
	RunQueued     RunState = "queued"
	RunRunning    RunState = "running"
	RunDone       RunState = "done"
	RunFailed     RunState = "failed"
	RunCancelled  RunState = "cancelled"
	RunInterrupted RunState = "interrupted"
)

// Progress is the current progress of a run.
type Progress struct {
	Phase   string `json:"phase"`
	Message string `json:"message"`
	Done    int    `json:"done"`
	Total   int    `json:"total"`
}

// Artifact is one file written by a run.
type Artifact struct {
	Path  string `json:"path"`
	Lines int    `json:"lines"`
	Kind  string `json:"kind"` // wiki_doc | card | skill | plan
}

// RunRecord is one pipeline execution (wiki, generate, scan, chat, etc.).
type RunRecord struct {
	ID          string         `json:"id"`
	WorkspaceID string         `json:"workspace_id"`
	Kind        string         `json:"kind"`
	Params      map[string]any `json:"params"`
	State       RunState       `json:"state"`
	Started     time.Time      `json:"started"`
	Ended       *time.Time     `json:"ended"`
	DurationMS  *int64         `json:"duration_ms"`
	Prog        Progress       `json:"progress"`
	Artifacts   []Artifact     `json:"artifacts"`
	Error       string         `json:"error"`
	Summary     map[string]any `json:"summary"`

	mu            sync.Mutex
	cancel        context.CancelFunc
	finishSummary map[string]any // set by the run fn before returning
}

// runRecordJSON mirrors RunRecord's exported fields for MarshalJSON's
// lock-protected snapshot below. Keep its tags in sync with RunRecord's.
type runRecordJSON struct {
	ID          string         `json:"id"`
	WorkspaceID string         `json:"workspace_id"`
	Kind        string         `json:"kind"`
	Params      map[string]any `json:"params"`
	State       RunState       `json:"state"`
	Started     time.Time      `json:"started"`
	Ended       *time.Time     `json:"ended"`
	DurationMS  *int64         `json:"duration_ms"`
	Prog        Progress       `json:"progress"`
	Artifacts   []Artifact     `json:"artifacts"`
	Error       string         `json:"error"`
	Summary     map[string]any `json:"summary"`
}

// MarshalJSON snapshots the record under r.mu before encoding. Without this,
// every JSON serialization of a *RunRecord — the run.started hub event, and
// every writeJSON(w, ..., run) in handlers_runs.go — read Prog/Artifacts/
// State/etc. with no synchronization at all, racing the run's own goroutine,
// which mutates those same fields under r.mu via SetProgress/AddArtifact/
// finish. A custom MarshalJSON fixes every call site at once, since
// encoding/json always calls it when present.
func (r *RunRecord) MarshalJSON() ([]byte, error) {
	r.mu.Lock()
	snap := runRecordJSON{
		ID: r.ID, WorkspaceID: r.WorkspaceID, Kind: r.Kind, Params: r.Params,
		State: r.State, Started: r.Started, Ended: r.Ended, DurationMS: r.DurationMS,
		Prog: r.Prog, Artifacts: r.Artifacts, Error: r.Error, Summary: r.Summary,
	}
	r.mu.Unlock()
	return json.Marshal(snap)
}

// Runs is the process-lifetime run registry. It starts runs in goroutines,
// tracks their lifecycle, publishes events through the hub, and retains the
// last 50 finished runs for querying.
type Runs struct {
	mu   sync.RWMutex
	byID map[string]*RunRecord
	hub  *Hub
}

// NewRuns builds a run registry wired to the event hub.
func NewRuns(hub *Hub) *Runs {
	return &Runs{byID: make(map[string]*RunRecord), hub: hub}
}

func runID() string {
	b := make([]byte, 4)
	_, _ = rand.Read(b)
	return "run_" + hex.EncodeToString(b)
}

// Start registers a run, publishes run.started, and executes fn in a
// goroutine. fn must honour ctx and should call the run's progress/artifact
// methods to report; those publish through the hub.
func (rs *Runs) Start(ws *Workspace, kind string, params map[string]any,
	fn func(ctx context.Context, r *RunRecord) error) *RunRecord {

	ctx, cancel := context.WithCancel(context.Background())
	r := &RunRecord{
		ID:          runID(),
		WorkspaceID: ws.ID,
		Kind:        kind,
		Params:      params,
		State:       RunRunning,
		Started:     time.Now(),
		Artifacts:   []Artifact{},
		cancel:      cancel,
	}

	rs.mu.Lock()
	rs.byID[r.ID] = r
	rs.mu.Unlock()

	rs.hub.Publish("run.started", map[string]any{"run": r})

	go func() {
		defer func() {
			if rec := recover(); rec != nil {
				r.finish(RunFailed, fmt.Sprintf("panic: %v", rec), nil)
				rs.publishFinished(r)
			}
		}()

		err := fn(ctx, r)
		// Capture cancellation BEFORE cancel(): calling cancel() always makes
		// ctx.Err() non-nil, so it must be read first to tell a user-initiated
		// stop apart from a plain failure. Some engines (wiki.Run) swallow the
		// cancellation and return nil, so the cancelled state must win here.
		wasCancelled := ctx.Err() != nil
		cancel()

		switch {
		case wasCancelled:
			r.finish(RunCancelled, "", nil)
		case err == nil:
			r.finish(RunDone, "", r.finishSummary)
		default:
			r.finish(RunFailed, err.Error(), nil)
		}
		rs.publishFinished(r)
		rs.evict()
	}()

	return r
}

// finish sets the terminal state. Called from the run goroutine.
func (r *RunRecord) finish(state RunState, errMsg string, summary map[string]any) {
	r.mu.Lock()
	defer r.mu.Unlock()
	now := time.Now()
	r.State = state
	r.Ended = &now
	dur := now.Sub(r.Started).Milliseconds()
	r.DurationMS = &dur
	r.Error = errMsg
	r.Summary = summary
}

// publishFinished emits the run.finished event from the run's current state.
func (rs *Runs) publishFinished(r *RunRecord) {
	r.mu.Lock()
	state := string(r.State)
	errMsg := r.Error
	var dur int64
	if r.DurationMS != nil {
		dur = *r.DurationMS
	}
	summary := r.Summary
	r.mu.Unlock()
	rs.hub.RunFinished(r.WorkspaceID, r.ID, state, dur, errMsg, summary)
}

// Cancel cancels a running run. Returns an error if the run is not cancellable.
func (rs *Runs) Cancel(id string) error {
	rs.mu.RLock()
	r, ok := rs.byID[id]
	rs.mu.RUnlock()
	if !ok {
		return fmt.Errorf("run %s not found", id)
	}
	r.mu.Lock()
	defer r.mu.Unlock()
	if r.State != RunRunning && r.State != RunQueued {
		return fmt.Errorf("run already finished")
	}
	if r.cancel != nil {
		r.cancel()
	}
	return nil
}

// ActiveKind reports whether a run of the given kind is active (running or
// queued) on the given workspace. Used for 409 run_conflict.
func (rs *Runs) ActiveKind(workspaceID, kind string) bool {
	rs.mu.RLock()
	defer rs.mu.RUnlock()
	for _, r := range rs.byID {
		if r.WorkspaceID == workspaceID && r.Kind == kind &&
			(r.State == RunRunning || r.State == RunQueued) {
			return true
		}
	}
	return false
}

// ActiveCount returns the number of currently running/queued runs.
func (rs *Runs) ActiveCount() int {
	rs.mu.RLock()
	defer rs.mu.RUnlock()
	n := 0
	for _, r := range rs.byID {
		if r.State == RunRunning || r.State == RunQueued {
			n++
		}
	}
	return n
}

// Get returns a run by id.
func (rs *Runs) Get(id string) (*RunRecord, bool) {
	rs.mu.RLock()
	defer rs.mu.RUnlock()
	r, ok := rs.byID[id]
	return r, ok
}

// List returns runs for a workspace, optionally only active ones.
func (rs *Runs) List(workspaceID string, activeOnly bool, limit int) []*RunRecord {
	rs.mu.RLock()
	defer rs.mu.RUnlock()
	// Non-nil so JSON encodes [] rather than null (the front-end maps over it).
	out := make([]*RunRecord, 0)
	for _, r := range rs.byID {
		if r.WorkspaceID != workspaceID {
			continue
		}
		if activeOnly && r.State != RunRunning && r.State != RunQueued {
			continue
		}
		out = append(out, r)
	}
	if limit > 0 && len(out) > limit {
		out = out[:limit]
	}
	return out
}

// CancelWorkspace cancels all active runs on a workspace.
func (rs *Runs) CancelWorkspace(workspaceID string) {
	rs.mu.RLock()
	var active []*RunRecord
	for _, r := range rs.byID {
		if r.WorkspaceID == workspaceID && (r.State == RunRunning || r.State == RunQueued) {
			active = append(active, r)
		}
	}
	rs.mu.RUnlock()
	for _, r := range active {
		r.mu.Lock()
		if r.cancel != nil {
			r.cancel()
		}
		r.mu.Unlock()
	}
}

// evict trims finished runs beyond the 50-run retention window.
func (rs *Runs) evict() {
	rs.mu.Lock()
	defer rs.mu.Unlock()
	var finished []*RunRecord
	for _, r := range rs.byID {
		if r.State == RunDone || r.State == RunFailed || r.State == RunCancelled {
			finished = append(finished, r)
		}
	}
	if len(finished) <= 50 {
		return
	}
	// Sort by start time, evict oldest.
	for i := 0; i < len(finished); i++ {
		for j := i + 1; j < len(finished); j++ {
			if finished[j].Started.Before(finished[i].Started) {
				finished[i], finished[j] = finished[j], finished[i]
			}
		}
	}
	for _, r := range finished[:len(finished)-50] {
		delete(rs.byID, r.ID)
	}
}

// --- Progress reporting (called by run goroutines) ---

// SetProgress updates the run's progress and publishes run.progress.
func (r *RunRecord) SetProgress(phase, msg string, done, total int) {
	r.mu.Lock()
	r.Prog = Progress{Phase: phase, Message: msg, Done: done, Total: total}
	r.mu.Unlock()
}

// AddArtifact records a written file.
func (r *RunRecord) AddArtifact(path string, lines int, kind string) {
	r.mu.Lock()
	r.Artifacts = append(r.Artifacts, Artifact{Path: path, Lines: lines, Kind: kind})
	r.mu.Unlock()
}
