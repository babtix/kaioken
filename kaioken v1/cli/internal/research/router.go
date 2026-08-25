package research

import (
	"context"
	"fmt"
	"strings"
	"time"
	"unicode"

	"kaioken/internal/llm"
)

// The triage router decides, per question, whether it pays for the deep
// path at all. It exists because the two reference designs imply it without
// naming it: a single-loop engine is the whole point of the fast path, and
// multi-agent overhead is wasted on questions that do not decompose into
// independent strands. Making the choice automatically — rather than
// exposing it as a manual flag — is what turns a research tool into a
// research system.

// Route is the execution path a question takes.
type Route int

const (
	RouteFast Route = iota // one continuous chain of search and reasoning
	RouteDeep              // independent parallel strands under a supervisor
)

func (r Route) String() string {
	if r == RouteDeep {
		return "deep"
	}
	return "fast"
}

// parseRoute turns a persisted path name back into a Route. Anything
// unrecognised reads as fast, the cheap default.
func parseRoute(s string) Route {
	if strings.EqualFold(strings.TrimSpace(s), "deep") {
		return RouteDeep
	}
	return RouteFast
}

// The decision boundary. The design's open question — which signal trips
// fast→deep and what error rate is tolerable — is answered by asking the
// model, not by counting keywords: whether a question decomposes into
// independent strands is a judgement about meaning, and word-spotting gets
// it wrong in both directions ("compare" in a subordinate clause is not a
// comparison; a genuinely multi-stranded question need not contain any of
// these words). The scoring below survives as the fallback for when no
// router model is reachable, and as the tie-break when the model is
// unavailable mid-run.
//
// The asymmetry the design called for lives in the prompt and in the
// fallback instead: both lean fast, because a false-containment (deep was
// needed, fast ran) is caught by escalation mid-run, while a
// false-escalation only ever costs what the deep path costs. Every
// decision still lands in events.jsonl so the boundary can be tuned from a
// corpus of real runs.
const (
	// routerDeepScore routes deep on the fallback heuristic at or above this.
	routerDeepScore = 3
	// routerFastScore is the fallback's narrow band; kept as the counterpart
	// to routerDeepScore so the two thresholds stay legible together.
	routerFastScore = 1
	// routerEntityMin is how many distinct capitalised phrases suggest
	// several subjects that can be researched in parallel.
	routerEntityMin = 3
	// routerLongQuery is the character count above which a question earns
	// a complexity point on length alone.
	routerLongQuery = 180
)

// routerTimeout bounds the triage call. It now runs on every auto-routed
// run rather than only the borderline band, so a router model that is down
// must cost seconds and hand over to the heuristic — not spend the client's
// full 5xx backoff before the research has started.
const routerTimeout = 20 * time.Second

// deepWords are verbs and nouns that mark a question as multi-stranded.
var deepWords = []string{
	"compare", "comparison", "versus", " vs ", "differ", "contrast",
	"architect", "design ", "evaluate", "assessment", "trade-off", "tradeoff",
	"strategy", "landscape", "survey ", "ecosystem", "alternatives",
}

// junctionWords join independent clauses; each junction is a strand.
var junctionWords = []string{
	", and ", " and also ", " plus ", "; ", " as well as ", ", then ",
}

// heuristicScore rates a question's parallelism without spending a call.
// It is the fallback path only: it runs when no router model is reachable
// or the router call fails, never ahead of the model's judgement.
func heuristicScore(question string) int {
	q := " " + strings.ToLower(question) + " "
	score := 0

	junctions := 0
	for _, j := range junctionWords {
		junctions += strings.Count(q, j)
	}
	if junctions > 0 {
		score++
	}
	if junctions >= 2 {
		score++
	}

	for _, w := range deepWords {
		if strings.Contains(q, w) {
			score++
			break
		}
	}

	if countEntities(question) >= routerEntityMin {
		score++
	}
	if len(question) > routerLongQuery {
		score++
	}
	return score
}

// countEntities counts capitalised words mid-sentence as a cheap proxy
// for named subjects. The sentence-initial word never counts — it is
// capitalised by grammar, not by being a name.
func countEntities(question string) int {
	words := strings.Fields(question)
	count := 0
	for i, w := range words {
		if i == 0 {
			continue
		}
		for _, r := range w {
			if unicode.IsLetter(r) {
				if unicode.IsUpper(r) {
					count++
				}
				break
			}
		}
	}
	return count
}

// routeDecision is what the router concludes, and why.
type routeDecision struct {
	Route  Route
	Reason string
}

// triage picks the path. Every auto-routed question costs one cheap call,
// because the judgement it makes — does this decompose into strands that do
// not depend on each other — is about what the question means, and keyword
// scoring answers a different question badly. Only an unreachable or
// failing router model falls back to the heuristic; escalation remains the
// safety net for whatever the router still gets wrong.
func triage(ctx context.Context, client *llm.Client, question string) routeDecision {
	if client == nil {
		return fallbackTriage(question, "no router model available")
	}
	ctx, cancel := context.WithTimeout(ctx, routerTimeout)
	defer cancel()

	system := `You triage research questions. Decide whether the question
decomposes into INDEPENDENT strands that can be researched in parallel
("deep"), or is one continuous chain of lookup and reasoning ("fast").

Independent means a strand can be researched without knowing another
strand's answer, and draws on its own sources. Two questions about the same
subject from the same sources are one strand, however long the sentence.
A strand that only exists to set up the next one is not independent.

Deep examples: comparisons across three or more named subjects; "how should
we do X, and what do comparable projects do differently"; multi-part
questions where each part has its own sources.
Fast examples: a single lookup, one subject's history or price, summarising
one document, "what changed in X between versions", a chain where each step
needs the previous step's answer.

Judge the meaning, not the wording. A question can be long, list several
names, or contain the word "compare" and still be one strand; a short plain
question can be several.

First list the independent strands you actually see, then choose: two or
more strands is deep, otherwise fast. When it is genuinely a toss-up answer
fast — a contained answer can be promoted later, and multi-agent cost is
only worth clearly parallel questions.

Reply with ONLY a JSON object:
{"strands": ["one clause per independent strand"],
 "path": "fast" | "deep",
 "reason": "one short clause"}`

	var out struct {
		Strands []string `json:"strands"`
		Path    string   `json:"path"`
		Reason  string   `json:"reason"`
	}
	if err := client.ChatJSON(ctx, system, "Question: "+question, &out); err != nil {
		return fallbackTriage(question, "router call failed: "+err.Error())
	}

	reason := strings.TrimSpace(out.Reason)
	if reason == "" {
		reason = fmt.Sprintf("router judgement (%d strand(s))", len(out.Strands))
	}
	if strings.EqualFold(strings.TrimSpace(out.Path), "deep") {
		return routeDecision{RouteDeep, "router: " + reason}
	}
	// An empty or unrecognised path reads as fast, the cheap default, the
	// same way a missing one does — the router never fails a run.
	return routeDecision{RouteFast, "router: " + reason}
}

// fallbackTriage decides without the model. It exists for the two cases the
// router cannot cover — no client, or a failed call — and keeps the old
// keyword scoring for them, biased fast: anything short of a clear
// multi-stranded score stays contained and lets escalation promote it.
func fallbackTriage(question, why string) routeDecision {
	score := heuristicScore(question)
	if score >= routerDeepScore {
		return routeDecision{RouteDeep, fmt.Sprintf("%s; heuristic fallback: multi-stranded (score %d)", why, score)}
	}
	return routeDecision{RouteFast, fmt.Sprintf("%s; heuristic fallback: single strand (score %d)", why, score)}
}
