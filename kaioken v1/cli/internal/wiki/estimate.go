package wiki

import (
	"fmt"
	"strings"

	"kaioken/internal/config"
	"kaioken/internal/scan"
)

// A ×3 wiki over a large repo is minutes of wall time and a lot of tokens.
// Estimate predicts that before the run starts, so the number is on screen
// while it is still cheap to say no.

// heavyCalls and heavyTokens are the thresholds past which a run is worth
// confirming rather than just starting.
const (
	heavyCalls  = 25
	heavyTokens = 400_000
)

// charsPerToken is the usual rough ratio for source code.
const charsPerToken = 4

// Estimate is an approximate cost forecast for a wiki run.
type Estimate struct {
	Sections     int
	Calls        int
	PromptTokens int
	OutputTokens int
	// Planned reports whether a saved outline was used. When false the
	// section count is itself a guess, so the whole estimate is rougher.
	Planned bool
	// Passes describes the quality passes this multiplier buys.
	Passes string
}

// Heavy reports whether a run is big enough to confirm first.
func (e *Estimate) Heavy() bool {
	return e.Calls >= heavyCalls || e.PromptTokens >= heavyTokens
}

// Total is the combined token count across prompts and completions.
func (e *Estimate) Total() int { return e.PromptTokens + e.OutputTokens }

func (e *Estimate) String() string {
	var b strings.Builder
	basis := "from the saved plan"
	if !e.Planned {
		basis = "estimated — no plan yet, so the section count is a guess"
	}
	fmt.Fprintf(&b, "%d sections, about %d model calls (%s)\n", e.Sections, e.Calls, basis)
	fmt.Fprintf(&b, "roughly %s prompt + %s output tokens\n",
		humanCount(e.PromptTokens), humanCount(e.OutputTokens))
	if e.Passes != "" {
		b.WriteString("quality passes: " + e.Passes + "\n")
	}
	b.WriteString("free-tier models are rate limited; this can take several minutes")
	return b.String()
}

// passDescription names what a multiplier buys beyond drafting, so the extra
// calls in the estimate are explained rather than mysterious.
func passDescription(multiplier int) string {
	switch {
	case multiplier >= verifyMultiplier:
		return "draft + critique/revise + grounding verification with correction"
	case multiplier >= critiqueMultiplier:
		return "draft + critique/revise"
	default:
		return "draft only (×4 adds critique, ×10 adds grounding correction)"
	}
}

// passesPerDoc is how many model calls each document costs at this depth.
func passesPerDoc(multiplier int) int {
	n := 1 // the draft
	if multiplier >= critiqueMultiplier {
		n++
	}
	if multiplier >= verifyMultiplier {
		n++ // correction, when verification finds problems
	}
	return n
}

func humanCount(n int) string {
	switch {
	case n >= 1_000_000:
		return fmt.Sprintf("%.1fM", float64(n)/1_000_000)
	case n >= 1_000:
		return fmt.Sprintf("%.0fk", float64(n)/1_000)
	default:
		return fmt.Sprintf("%d", n)
	}
}

// expectedSubsections is the mid-point of the range the sub-planner is asked
// for, since the model picks somewhere inside it.
func expectedSubsections(multiplier int) int {
	if multiplier < 2 {
		return 0 // ×1 generates section documents only
	}
	maxSubs := 4 * multiplier
	if maxSubs > 12 {
		maxSubs = 12
	}
	return (2 + maxSubs) / 2
}

// expectedOutputTokens mirrors the length targets in docSystem, at roughly a
// dozen tokens per line of markdown.
func expectedOutputTokens(multiplier int) int {
	switch {
	case multiplier <= 1:
		return 450 * 12
	case multiplier == 2:
		return 900 * 12
	default:
		return 1500 * 12
	}
}

// EstimateRun forecasts a full wiki run. It uses the saved outline when one
// exists, and otherwise assumes a mid-sized plan over the whole repository.
func EstimateRun(repo string, cfg *config.Config, res *scan.Result, multiplier int) *Estimate {
	if multiplier < 1 {
		multiplier = 3
	}
	subs := expectedSubsections(multiplier)
	outPerDoc := expectedOutputTokens(multiplier)
	perDoc := passesPerDoc(multiplier)
	est := &Estimate{Passes: passDescription(multiplier)}

	outline, err := loadOutline(repo)
	if err == nil && outline != nil && len(outline.Sections) > 0 {
		est.Planned = true
		est.Sections = len(outline.Sections)
		for _, sec := range outline.Sections {
			ctxTokens := bundleTokens(res, resolveFiles(res, sec.Files, nil), cfg.MaxModuleTokens)
			// One sub-plan call, then every document costs perDoc calls.
			docs := 1 + subs
			calls := 1 + docs*perDoc
			est.Calls += calls
			est.PromptTokens += ctxTokens * calls
			est.OutputTokens += outPerDoc * docs * perDoc
		}
		// The architecture brief is one repo-wide call.
		est.Calls++
		return est
	}

	// No plan yet: a global planning call plus the architecture brief, then a
	// guessed 12 sections splitting the repository between them.
	est.Calls += 2
	est.Sections = 12
	totalTokens := int(res.TotalSize / charsPerToken)
	perSection := totalTokens / est.Sections
	if perSection > cfg.MaxModuleTokens {
		perSection = cfg.MaxModuleTokens
	}
	docs := 1 + subs
	calls := 1 + docs*perDoc
	est.Calls += est.Sections * calls
	est.PromptTokens += est.Sections * perSection * calls
	est.OutputTokens += est.Sections * outPerDoc * docs * perDoc
	return est
}

// bundleTokens approximates what bundleFiles will actually send for a set of
// files, applying the same budget cap.
func bundleTokens(res *scan.Result, files []scan.File, maxTokens int) int {
	var total int64
	for _, f := range files {
		total += f.Size
	}
	tokens := int(total / charsPerToken)
	if tokens > maxTokens {
		return maxTokens
	}
	return tokens
}
