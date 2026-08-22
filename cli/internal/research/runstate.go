package research

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
	"sync"
	"time"

	"kaioken/internal/config"
)

// The run state is the shared control plane: whichever path is executing —
// fast, deep, or a promotion between the two — reads and writes the same
// directory, so a closed terminal loses one worker's work, not the run.
// Everything is checkpointed to disk after each phase transition and each
// worker completion; nothing that must survive lives only in memory.

// Phase is where in the pipeline a run stands.
type Phase string

const (
	PhaseScope    Phase = "scope"
	PhasePlan     Phase = "plan"
	PhaseResearch Phase = "research"
	PhaseWrite    Phase = "write"
	PhaseCite     Phase = "cite"
	PhaseDone     Phase = "done"
	PhaseFailed   Phase = "failed"
)

// SubtopicStatus tracks one delegated unit of work.
type SubtopicStatus string

const (
	SubtopicPending SubtopicStatus = "pending"
	SubtopicRunning SubtopicStatus = "running"
	SubtopicDone    SubtopicStatus = "done"
	SubtopicFailed  SubtopicStatus = "failed"
)

// Subtopic is one delegated unit of research. The four fields Objective,
// Format, Sources and Bounds are the delegation contract: workers wander,
// duplicate each other and over-spawn when any of them is omitted, so the
// supervisor is not allowed to emit a subtopic missing one.
type Subtopic struct {
	ID        string         `json:"id"`
	Objective string         `json:"objective"`
	Format    string         `json:"format"`
	Sources   []string       `json:"sources"` // "web" | "code" | both
	Bounds    string         `json:"bounds"`
	Status    SubtopicStatus `json:"status"`
	FindingID string         `json:"finding_id,omitempty"`
}

// Complete reports whether the delegation contract holds — all four fields
// carry substance.
func (s Subtopic) Complete() bool {
	return strings.TrimSpace(s.Objective) != "" &&
		strings.TrimSpace(s.Format) != "" &&
		len(s.Sources) > 0 &&
		strings.TrimSpace(s.Bounds) != ""
}

// Finding is one worker's compressed output: prose plus atomic claims, each
// tied to the hashes of what was actually read. Raw documents stay in the
// source store; only this travels back to the supervisor.
type Finding struct {
	SubtopicID string   `json:"subtopic_id"`
	Summary    string   `json:"summary"`
	Claims     []Claim  `json:"claims"`
	SourceHash []string `json:"source_hash"`
}

// Claim is one atomic statement the report may lean on.
type Claim struct {
	Text    string   `json:"text"`
	Support []string `json:"support"` // source hashes
}

// FastState is the checkpointed shape of the fast path, so a resumed run
// can continue its loop instead of starting it over.
type FastState struct {
	Subs     []string  `json:"subs,omitempty"`
	Findings []finding `json:"findings,omitempty"`
	Queries  []string  `json:"queries,omitempty"`
	Round    int       `json:"round,omitempty"`
	// Pending is the search list the next round will issue, and Gaps the audit
	// that produced it. Both are checkpointed because a resume that drops them
	// throws away the model call that found them: the run would go back to
	// searching the original question instead of the specific gaps, which is
	// the whole difference between round three and round one.
	//
	// omitempty on both keeps a checkpoint written by an older build loading
	// cleanly, with the fields simply empty.
	Pending []string   `json:"pending,omitempty"`
	Gaps    *gapReport `json:"gaps,omitempty"`
}

// RunMeta is the durable metadata of one research run.
type RunMeta struct {
	ID            string     `json:"id"`
	Query         string     `json:"query"`
	Path          string     `json:"path"` // fast | deep
	Mode          string     `json:"mode"` // auto | fast | deep — how Path was chosen
	// Multiplier is the ×N dial the run started under. A resume must run
	// under the same one: the loop shape, budgets and dossier behaviour all
	// derive from it, and a continue a month later cannot guess it.
	Multiplier    int        `json:"multiplier,omitempty"`
	Phase         Phase      `json:"phase"`
	Plan          []Subtopic `json:"plan,omitempty"`
	EscalatedFrom string     `json:"escalated_from,omitempty"`
	StartedAt     time.Time  `json:"started_at"`
	Fast          FastState  `json:"fast,omitempty"`
}

// RunState owns one run directory and the checkpoint discipline around it.
type RunState struct {
	mu  sync.Mutex
	dir string
	run RunMeta
}

// RunsDir is the root of every run directory.
func RunsDir() string {
	return filepath.Join(config.GlobalDir(), "runs")
}

// runIDRe admits only what NewRunID produces, so a --resume argument can
// never carry separators or traversal into a path.
var runIDRe = regexp.MustCompile(`^\d{8}-\d{6}-[0-9a-f]{4}$`)

// NewRunID mints a run id: date-time plus a random tail for uniqueness.
func NewRunID() string {
	tail := make([]byte, 2)
	_, _ = rand.Read(tail)
	return time.Now().UTC().Format("20060102-150405") + "-" + hex.EncodeToString(tail)
}

// NewRun starts a fresh run directory for the query.
func NewRun(query, mode string) (*RunState, error) {
	id := NewRunID()
	dir := filepath.Join(RunsDir(), id)
	if err := os.MkdirAll(filepath.Join(dir, "sources"), 0o755); err != nil {
		return nil, err
	}
	if err := os.MkdirAll(filepath.Join(dir, "findings"), 0o755); err != nil {
		return nil, err
	}
	rs := &RunState{dir: dir, run: RunMeta{
		ID: id, Query: query, Mode: mode, Phase: PhaseScope, StartedAt: time.Now().UTC(),
	}}
	if err := rs.Checkpoint(); err != nil {
		return nil, err
	}
	return rs, nil
}

// OpenRun reloads an existing run for --resume.
func OpenRun(id string) (*RunState, error) {
	if !runIDRe.MatchString(id) {
		return nil, fmt.Errorf("invalid run id %q", id)
	}
	dir := filepath.Join(RunsDir(), id)
	raw, err := os.ReadFile(filepath.Join(dir, "run.json"))
	if err != nil {
		return nil, fmt.Errorf("no resumable run %q: %w", id, err)
	}
	var run RunMeta
	if err := json.Unmarshal(raw, &run); err != nil {
		return nil, fmt.Errorf("run %q is corrupt: %w", id, err)
	}
	if run.Phase == PhaseDone || run.Phase == PhaseFailed {
		return nil, fmt.Errorf("run %q already finished in phase %q", id, run.Phase)
	}
	return &RunState{dir: dir, run: run}, nil
}

// Dir is the run directory.
func (rs *RunState) Dir() string { return rs.dir }

// SourcesDir is where content-addressed documents live.
func (rs *RunState) SourcesDir() string { return filepath.Join(rs.dir, "sources") }

// FindingsDir is where compressed worker output lives.
func (rs *RunState) FindingsDir() string { return filepath.Join(rs.dir, "findings") }

// Snapshot returns a copy of the current run metadata.
func (rs *RunState) Snapshot() RunMeta {
	rs.mu.Lock()
	defer rs.mu.Unlock()
	run := rs.run
	run.Plan = append([]Subtopic(nil), rs.run.Plan...)
	return run
}

// Mutate applies fn to the run metadata under the lock. Callers checkpoint
// when the mutation is durable-worthy.
func (rs *RunState) Mutate(fn func(r *RunMeta)) {
	rs.mu.Lock()
	fn(&rs.run)
	rs.mu.Unlock()
}

// SetPhase advances the phase and checkpoints: phase transitions are the
// moments a crash must never lose.
func (rs *RunState) SetPhase(p Phase) error {
	rs.mu.Lock()
	rs.run.Phase = p
	rs.mu.Unlock()
	return rs.Checkpoint()
}

// Checkpoint writes run.json. The whole marshal+write+rename holds the
// state lock: workers checkpoint concurrently, and on Windows two renames
// onto the same destination do not queue — they fail outright — while the
// old shared temp path also let a half-overwritten file be renamed into
// place. The temp name is unique per call so an interrupted checkpoint
// litters nothing.
func (rs *RunState) Checkpoint() error {
	rs.mu.Lock()
	defer rs.mu.Unlock()
	data, err := json.MarshalIndent(rs.run, "", "  ")
	if err != nil {
		return err
	}
	f, err := os.CreateTemp(rs.dir, "run.json.*.tmp")
	if err != nil {
		return err
	}
	tmp := f.Name()
	if _, err := f.Write(data); err != nil {
		_ = f.Close()
		_ = os.Remove(tmp)
		return err
	}
	if err := f.Close(); err != nil {
		_ = os.Remove(tmp)
		return err
	}
	if err := os.Rename(tmp, filepath.Join(rs.dir, "run.json")); err != nil {
		_ = os.Remove(tmp)
		return err
	}
	return nil
}

// Event appends one line to the audit log. The log is append-only and
// human-readable: when a run goes wrong, this is what gets read.
func (rs *RunState) Event(kind, detail string) {
	entry := map[string]string{
		"t":      time.Now().UTC().Format(time.RFC3339),
		"kind":   kind,
		"detail": detail,
	}
	line, err := json.Marshal(entry)
	if err != nil {
		return
	}
	f, err := os.OpenFile(filepath.Join(rs.dir, "events.jsonl"), os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0o644)
	if err != nil {
		return
	}
	_, _ = f.Write(append(line, '\n'))
	_ = f.Close()
}

// WriteBrief stores the research brief — the north star every later stage
// rereads.
func (rs *RunState) WriteBrief(brief string) error {
	return os.WriteFile(filepath.Join(rs.dir, "brief.md"), []byte(brief), 0o644)
}

// ReadBrief reloads the brief, for a resumed run.
func (rs *RunState) ReadBrief() string {
	raw, err := os.ReadFile(filepath.Join(rs.dir, "brief.md"))
	if err != nil {
		return ""
	}
	return string(raw)
}

// WriteFinding persists one compressed worker finding and records it on the
// subtopic. Checkpointing happens here too: a completed worker's work is
// exactly what a crash must not lose.
func (rs *RunState) WriteFinding(f Finding) error {
	data, err := json.MarshalIndent(f, "", "  ")
	if err != nil {
		return err
	}
	name := safeFindingName(f.SubtopicID)
	if err := os.WriteFile(filepath.Join(rs.FindingsDir(), name+".json"), data, 0o644); err != nil {
		return err
	}
	rs.mu.Lock()
	for i := range rs.run.Plan {
		if rs.run.Plan[i].ID == f.SubtopicID {
			rs.run.Plan[i].Status = SubtopicDone
			rs.run.Plan[i].FindingID = name
		}
	}
	rs.mu.Unlock()
	return rs.Checkpoint()
}

// safeFindingName reduces a subtopic id — which ultimately derives from
// model output — to a filename that cannot carry separators, dots or
// traversal. The planner's own ids ("sub-1", "sub-2", …) pass through
// unchanged.
var findingNameRe = regexp.MustCompile(`^[a-z0-9][a-z0-9-]{0,63}$`)

func safeFindingName(id string) string {
	id = strings.ToLower(strings.TrimSpace(id))
	if findingNameRe.MatchString(id) {
		return id
	}
	var b strings.Builder
	for _, r := range id {
		switch {
		case r >= 'a' && r <= 'z', r >= '0' && r <= '9':
			b.WriteRune(r)
		default:
			if b.Len() > 0 {
				b.WriteByte('-')
			}
		}
		if b.Len() >= 48 {
			break
		}
	}
	out := strings.Trim(b.String(), "-")
	if out == "" {
		out = "finding"
	}
	return out
}

// LoadFindings reads every persisted finding back, for resume.
func (rs *RunState) LoadFindings() ([]Finding, error) {
	entries, err := os.ReadDir(rs.FindingsDir())
	if err != nil {
		if os.IsNotExist(err) {
			return nil, nil
		}
		return nil, err
	}
	var out []Finding
	for _, e := range entries {
		if e.IsDir() || !strings.HasSuffix(e.Name(), ".json") {
			continue
		}
		raw, err := os.ReadFile(filepath.Join(rs.FindingsDir(), e.Name()))
		if err != nil {
			continue
		}
		var f Finding
		if json.Unmarshal(raw, &f) == nil {
			out = append(out, f)
		}
	}
	return out, nil
}

// WriteReport stores the final markdown beside the state that produced it.
func (rs *RunState) WriteReport(md string) error {
	return os.WriteFile(filepath.Join(rs.dir, "report.md"), []byte(md), 0o644)
}

// ResumableRun is one interrupted run on disk, as the listing surfaces it:
// enough for a user to recognise the work and decide to continue it — today
// or next month, the checkpoint does not age.
type ResumableRun struct {
	ID        string    `json:"id"`
	Question  string    `json:"question"`
	Phase     Phase     `json:"phase"`
	Path      string    `json:"path"`
	Mode      string    `json:"mode"`
	StartedAt time.Time `json:"started_at"`
}

// ResumableRuns lists every run directory that has not reached a terminal
// phase, newest first. Runs in the write or cite phase can be resumed too:
// the pipeline re-enters at its checkpointed position, whatever that is.
func ResumableRuns() []ResumableRun {
	entries, err := os.ReadDir(RunsDir())
	if err != nil {
		return nil
	}
	var out []ResumableRun
	for _, e := range entries {
		if !e.IsDir() || !runIDRe.MatchString(e.Name()) {
			continue
		}
		raw, err := os.ReadFile(filepath.Join(RunsDir(), e.Name(), "run.json"))
		if err != nil {
			continue
		}
		var run RunMeta
		if json.Unmarshal(raw, &run) != nil {
			continue
		}
		if run.Phase == PhaseDone || run.Phase == PhaseFailed {
			continue
		}
		out = append(out, ResumableRun{
			ID: run.ID, Question: run.Query, Phase: run.Phase,
			Path: run.Path, Mode: run.Mode, StartedAt: run.StartedAt,
		})
	}
	sort.Slice(out, func(i, j int) bool { return out[i].StartedAt.After(out[j].StartedAt) })
	return out
}

// DeleteRun removes one run directory entirely — the discard half of
// stop-and-continue. Only ids of the minted shape are admitted, so the
// removal cannot escape the runs directory.
func DeleteRun(id string) error {
	if !runIDRe.MatchString(id) {
		return fmt.Errorf("invalid run id %q", id)
	}
	dir := filepath.Join(RunsDir(), id)
	if _, err := os.Stat(dir); err != nil {
		return err
	}
	return os.RemoveAll(dir)
}
