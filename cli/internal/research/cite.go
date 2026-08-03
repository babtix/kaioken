package research

import (
	"context"
	"fmt"
	"strings"
)

// The citation pass is a separate agent that runs after the draft exists.
// By drafting time, source text has been condensed through several worker
// returns, so a writer that also cites is citing from memory rather than
// from ground truth. This pass reads the actual documents and checks the
// draft against them — claims that cannot be grounded are flagged in the
// report rather than silently dropped, because an uncited claim the user
// can see beats a fabricated citation they cannot.

const (
	// citeDocCap bounds each raw document the grounding pass reads.
	citeDocCap = 3000
	// citeTotalCap bounds the total raw text one grounding call carries.
	citeTotalCap = 40000
	// citeMaxDocs bounds how many sources one grounding call reviews.
	citeMaxDocs = 30
)

// UngroundedClaim is one draft statement the sources do not support.
type UngroundedClaim struct {
	Claim string `json:"claim"`
	// LoadBearing marks the claims the report leans on — the figures and
	// conclusions it is really about. A grounding failure on one of these
	// is an escalation signal; a failure on an aside is a flag only.
	LoadBearing bool `json:"load_bearing"`
}

// Grounding is the pass's verdict.
type Grounding struct {
	Checked    int               `json:"claims_checked"`
	Ungrounded []UngroundedClaim `json:"ungrounded"`
	Notes      string            `json:"notes,omitempty"`
}

// Rate is the share of checked claims the pass could ground.
func (g *Grounding) Rate() float64 {
	if g == nil || g.Checked <= 0 {
		return 0
	}
	un := len(g.Ungrounded)
	if un >= g.Checked {
		return 0
	}
	return 1 - float64(un)/float64(g.Checked)
}

// LoadBearingFailed reports that a claim the report leans on could not be
// grounded — the escalation trigger, not merely a cosmetic flag.
func (g *Grounding) LoadBearingFailed() bool {
	if g == nil {
		return false
	}
	for _, u := range g.Ungrounded {
		if u.LoadBearing {
			return true
		}
	}
	return false
}

// citePass grounds the draft against the raw documents. Sources arrive
// numbered the way the draft cites them, so the pass can match marker to
// text directly.
func (e *engine) citePass(ctx context.Context, md string, sources []Source) (*Grounding, error) {
	var b strings.Builder
	total, count := 0, 0
	for _, s := range sources {
		doc, ok := e.store.Seen(s.URL)
		if !ok {
			continue
		}
		text := doc.Content
		if len(text) > citeDocCap {
			text = text[:citeDocCap] + "\n[truncated]"
		}
		block := fmt.Sprintf("<ground-source id=%d url=%q title=%q>\n%s\n</ground-source>",
			s.N, s.URL, s.Title, text)
		if total+len(block) > citeTotalCap || count >= citeMaxDocs {
			break
		}
		b.WriteString(block)
		b.WriteString("\n\n")
		total += len(block)
		count++
	}
	if count == 0 {
		// Nothing to ground against is itself reported, not papered over.
		return &Grounding{Notes: "no raw source text was available to ground against"}, nil
	}

	system := `You are a citation-grounding reviewer. You receive a research
DRAFT and the RAW SOURCES it cites, numbered to match the draft's [n]
markers.

Check every specific claim in the draft — figures, dates, names, rankings,
causal statements — against the raw sources. A claim is grounded only if
some source actually states it. Judge from the raw text alone, not from
what seems plausible.

Report:
- claims_checked: how many specific claims you examined;
- ungrounded: each claim no source supports, verbatim or near-verbatim,
  with load_bearing=true when the report's conclusion leans on it (its
  headline figure or central judgement) and false for asides;
- notes: one sentence on overall grounding quality.

A claim whose source discusses the topic but never states the claim is
UNGROUNDED. A claim the sources contradict is ungrounded and load_bearing.

Reply with ONLY a JSON object:
{"claims_checked": 12, "ungrounded": [{"claim": "...", "load_bearing": true}], "notes": "..."}`

	user := fmt.Sprintf("DRAFT:\n%s\n\nRAW SOURCES:\n%s", md, b.String())

	var out Grounding
	if err := e.clients.For(RoleCite).ChatJSON(ctx, system, user, &out); err != nil {
		return nil, fmt.Errorf("grounding the draft: %w", err)
	}
	if out.Checked < len(out.Ungrounded) {
		out.Checked = len(out.Ungrounded)
	}
	e.state.Event("cite", fmt.Sprintf("checked %d claims, %d ungrounded (rate %.2f)",
		out.Checked, len(out.Ungrounded), out.Rate()))
	return &out, nil
}

// groundingFlags renders the pass's flags as a report section. Claims are
// surfaced, never dropped: the reader decides what an unverified claim is
// worth.
func groundingFlags(g *Grounding) string {
	var b strings.Builder
	b.WriteString("\n\n## Grounding flags\n\nThe citation pass could not ground the following claims in the sources read:\n\n")
	for _, u := range g.Ungrounded {
		if u.LoadBearing {
			fmt.Fprintf(&b, "- **%s** — load-bearing; treat with care\n", u.Claim)
		} else {
			fmt.Fprintf(&b, "- %s — unverified\n", u.Claim)
		}
	}
	if strings.TrimSpace(g.Notes) != "" {
		fmt.Fprintf(&b, "\nReviewer note: %s\n", strings.TrimSpace(g.Notes))
	}
	return b.String()
}
