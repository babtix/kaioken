package memory

import (
	"context"

	"kaioken/internal/config"
	"kaioken/internal/llm"
	"kaioken/internal/session"
)

// LearnSession is the session-end experience loop: reinforce the skills the
// session consulted, write a digest for later recall, and (when the gate fires
// or the user asked explicitly) distill the session into a skill patch.
//
// It is designed to run in a goroutine at session close — from the TUI on
// /learn or /new, and from the daemon when a run finishes. Every step is
// best-effort: a failure in one does not abort the others, because a missed
// reinforcement must not lose a digest, and a failed digest must not lose a
// distilled skill. The first error is reported, but work continues.
type SessionLearnResult struct {
	Reinforced []string       // skills whose UseCount was bumped
	Digest     *Digest        // the written digest, if any
	Distill    *Result        // the distillation outcome, if it ran
	Err        error          // first non-nil error encountered
}

// LearnSession runs reinforcement, digest, and (conditionally) distillation.
// force=true (an explicit /learn) bypasses the Signals gate and the
// LearnAtSessionEnd tier check, so the user can always distill on demand.
func LearnSession(ctx context.Context, repo string, cfg *config.Config, client *llm.Client,
	sess *session.Session, force bool) *SessionLearnResult {

	res := &SessionLearnResult{}
	if sess == nil || len(sess.Messages) == 0 {
		return res
	}
	conv := sess.Messages

	// Reinforcement is cheap (no LLM) and runs unconditionally for a clean
	// session — a skill opened to a good outcome is the core signal.
	res.Reinforced = ReinforceFromSession(repo, conv, sess.ID, true)

	// The digest is one model call; a failure is reported but does not block
	// distillation, because the two answer different questions (what happened
	// vs. what to do next time).
	if client != nil {
		d, err := WriteDigest(ctx, client, repo, sess)
		if err != nil && res.Err == nil {
			res.Err = err
		}
		res.Digest = d
	}

	// Distillation is gated: explicit /learn always runs; otherwise only when
	// the configured tier asks for session-end learning. Distill itself
	// additionally gates on the local Signals heuristics, so a session that
	// taught nothing costs no model call even at ×5.
	if force || (!cfg.Memory.Disable && cfg.LearnAtSessionEnd()) {
		r, err := Distill(ctx, repo, cfg, client, conv, Options{SessionID: sess.ID, Force: force})
		if err != nil && res.Err == nil {
			res.Err = err
		}
		res.Distill = r
	}
	return res
}
