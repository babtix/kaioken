package main

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"

	"kaioken/internal/config"
	"kaioken/internal/handoff"
	"kaioken/internal/session"
)

// cmdHandoff writes a continuation briefing for a saved session: the LLM
// distills goal, decisions, state and open threads, and the collapsed
// transcript rides along as an appendix. The positional selects the session
// (default: the most recent); -out overrides the destination.
func cmdHandoff(ctx context.Context, f flags) error {
	cfg, err := config.Load(f.repo)
	if err != nil {
		cfg = config.Default()
	}
	client, err := newClient(cfg, f)
	if err != nil {
		return err
	}

	id := f.positional
	if id == "" {
		metas, lerr := session.List(f.repo)
		if lerr != nil {
			return lerr
		}
		if len(metas) == 0 {
			return fmt.Errorf("no saved sessions in %s", session.Dir(f.repo))
		}
		id = metas[0].ID
	}
	sess, err := session.Load(f.repo, id)
	if err != nil {
		return fmt.Errorf("session %q: %w", id, err)
	}

	brief, err := handoff.Brief(ctx, client, sess)
	if err != nil {
		return err
	}

	var doc strings.Builder
	fmt.Fprintf(&doc, "# Handoff — %s\n\n", sess.Title)
	fmt.Fprintf(&doc, "_Session `%s`, briefed %s. Hand this to whoever continues the work._\n\n",
		sess.ID, time.Now().Format("2006-01-02 15:04"))
	doc.WriteString(brief)
	doc.WriteString("\n\n## Transcript\n\n")
	doc.WriteString(handoff.Transcript(sess))

	out := f.out
	if out == "" {
		dir := filepath.Join(f.repo, config.Dir, "handoffs")
		if err := os.MkdirAll(dir, 0o755); err != nil {
			return err
		}
		out = filepath.Join(dir, fmt.Sprintf("%s-%s.md", sess.ID, time.Now().Format("20060102-1504")))
	}
	if err := os.WriteFile(out, []byte(doc.String()), 0o644); err != nil {
		return err
	}
	fmt.Printf("  ✓ wrote %s\n", out)
	return nil
}
