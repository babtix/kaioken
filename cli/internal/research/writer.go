package research

import (
	"context"
	"fmt"
	"strings"
)

// writeBrief runs the scope step: one cheap call that turns the raw
// question into the brief every later stage rereads. The brief is the north
// star of the run — workers judge their own scope against it, and a resumed
// run rebuilds its sense of purpose from it.
func (e *engine) writeBrief(ctx context.Context) (string, error) {
	system := `You scope a research task. Write a short research brief for
the question below. Cover:
- what the question is really asking, including any comparison or timeframe;
- what a good answer must contain (figures with units, named sources, dates);
- what is explicitly out of scope.

Write 100-250 words of plain prose under a single "# Brief" heading.
No preamble.`

	brief, err := e.clients.For(RoleScope).Chat(ctx, system,
		e.asOf+"Question: "+e.question)
	if err != nil {
		return "", fmt.Errorf("scoping the research: %w", err)
	}
	return strings.TrimSpace(brief), nil
}

// maxPlanSubtopics caps the delegation plan: 3–5 strands is where the
// pattern works, and more than that is the supervisor over-spawning.
const maxPlanSubtopics = 5

// planSubtopics runs the plan step: the question becomes 3–5 subtopics,
// each carrying the full delegation contract. A subtopic missing any of the
// four fields is dropped rather than issued — an incomplete contract is
// what makes workers wander, duplicate each other and over-spawn.
func (e *engine) planSubtopics(ctx context.Context, brief string) ([]Subtopic, error) {
	system := `You plan multi-agent research. Decompose the question into
the independent subtopics a team of researchers could work on IN PARALLEL.

Each subtopic must carry the full delegation contract:
- objective: the exact question this strand must settle, self-contained;
- format: the shape of the answer it must return ("a dated list",
  "one figure with units and year", "a comparison table", …);
- sources: where the evidence lives — "web", "code", or both;
- bounds: what is explicitly out of scope for this strand.

Rules:
- 3 to 5 subtopics. A comparison needs one strand per side, on the same basis.
- Strands must be genuinely independent; if one needs another's answer,
  fold them into one strand.
- Prefer "web" unless the question is about this repository's own code or
  documentation.

Reply with ONLY a JSON object:
{"subtopics": [{"objective": "...", "format": "...", "sources": ["web"], "bounds": "..."}]}`

	user := fmt.Sprintf("%sResearch brief:\n%s\n\nQuestion: %s\n\nProduce at most %d subtopics.",
		e.asOf, brief, e.question, maxPlanSubtopics)

	var out struct {
		Subtopics []struct {
			Objective string   `json:"objective"`
			Format    string   `json:"format"`
			Sources   []string `json:"sources"`
			Bounds    string   `json:"bounds"`
		} `json:"subtopics"`
	}
	if err := e.clients.For(RolePlan).ChatJSON(ctx, system, user, &out); err != nil {
		return nil, fmt.Errorf("planning the research: %w", err)
	}

	var subs []Subtopic
	for i, s := range out.Subtopics {
		sub := Subtopic{
			ID:        fmt.Sprintf("sub-%d", i+1),
			Objective: strings.TrimSpace(s.Objective),
			Format:    strings.TrimSpace(s.Format),
			Sources:   cleanSourceTags(s.Sources, e.opts.Repo != ""),
			Bounds:    strings.TrimSpace(s.Bounds),
			Status:    SubtopicPending,
		}
		if !sub.Complete() {
			// The contract is all four fields or nothing; a partial one
			// would wander, so it never leaves the planner.
			e.state.Event("plan", fmt.Sprintf("dropped incomplete subtopic %q", sub.Objective))
			continue
		}
		subs = append(subs, sub)
		if len(subs) >= maxPlanSubtopics {
			break
		}
	}
	if len(subs) == 0 {
		// A planner that produces nothing usable falls back to researching
		// the question as one strand — honest, and never silent.
		subs = []Subtopic{{
			ID:        "sub-1",
			Objective: e.question,
			Format:    "a cited prose answer",
			Sources:   []string{"web"},
			Bounds:    "nothing beyond the question as asked",
			Status:    SubtopicPending,
		}}
	}
	return subs, nil
}

// cleanSourceTags normalises the planner's source tags. "code" is only
// admitted when the run actually has a repository to search.
func cleanSourceTags(tags []string, haveRepo bool) []string {
	var out []string
	for _, t := range tags {
		t = strings.ToLower(strings.TrimSpace(t))
		switch t {
		case "web":
			out = append(out, "web")
		case "code", "repo", "both":
			if haveRepo {
				out = append(out, "code")
			}
			if t == "both" {
				out = append(out, "web")
			}
		}
	}
	if len(out) == 0 {
		out = []string{"web"}
	}
	return out
}
