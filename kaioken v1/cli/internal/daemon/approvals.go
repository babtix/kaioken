package daemon

import (
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"sync"

	"kaioken/internal/agent"
)

// Decision is the user's response to an approval request.
type Decision string

const (
	DecisionApprove    Decision = "approve"
	DecisionDeny       Decision = "deny"
	DecisionApproveAll Decision = "approve_all"
)

// pendingApproval is one blocked agent goroutine waiting for a decision.
type pendingApproval struct {
	runID string
	req   agent.ApprovalRequest
	ch    chan Decision
}

// Approvals is the pending-approval registry. The agent's Approve method
// registers here and blocks; the front-end's POST /approvals/{id} resolves it.
type Approvals struct {
	mu      sync.Mutex
	pending map[string]*pendingApproval
}

// NewApprovals builds an empty registry.
func NewApprovals() *Approvals {
	return &Approvals{pending: make(map[string]*pendingApproval)}
}

func approvalID() string {
	b := make([]byte, 4)
	_, _ = rand.Read(b)
	return "apr_" + hex.EncodeToString(b)
}

// Register creates a pending approval and returns its id and the channel the
// waiter blocks on. The channel is buffered (capacity 1) so Resolve never
// blocks even if the waiter has already timed out.
func (a *Approvals) Register(runID string, req agent.ApprovalRequest) (string, chan Decision) {
	id := approvalID()
	ch := make(chan Decision, 1)
	a.mu.Lock()
	a.pending[id] = &pendingApproval{runID: runID, req: req, ch: ch}
	a.mu.Unlock()
	return id, ch
}

// Resolve delivers a decision to the waiting goroutine. Returns an error if
// the id is unknown (already resolved or expired).
func (a *Approvals) Resolve(id string, d Decision) error {
	a.mu.Lock()
	p, ok := a.pending[id]
	if ok {
		delete(a.pending, id)
	}
	a.mu.Unlock()
	if !ok {
		return fmt.Errorf("approval %s not found", id)
	}
	p.ch <- d
	return nil
}

// Expire removes a pending approval without delivering a decision (the waiter
// has already timed out or been cancelled).
func (a *Approvals) Expire(id string) {
	a.mu.Lock()
	delete(a.pending, id)
	a.mu.Unlock()
}

// CancelRun denies all pending approvals for a run (used when a run is
// cancelled or the workspace is closed).
func (a *Approvals) CancelRun(runID string) {
	a.mu.Lock()
	var ids []string
	for id, p := range a.pending {
		if p.runID == runID {
			ids = append(ids, id)
		}
	}
	for _, id := range ids {
		p := a.pending[id]
		delete(a.pending, id)
		p.ch <- DecisionDeny
	}
	a.mu.Unlock()
}

// Pending returns the number of unresolved approvals.
func (a *Approvals) Pending() int {
	a.mu.Lock()
	defer a.mu.Unlock()
	return len(a.pending)
}

// GetRequest returns the approval request for an id (for building the event
// payload). Returns nil if unknown.
func (a *Approvals) GetRequest(id string) *agent.ApprovalRequest {
	a.mu.Lock()
	defer a.mu.Unlock()
	if p, ok := a.pending[id]; ok {
		return &p.req
	}
	return nil
}
