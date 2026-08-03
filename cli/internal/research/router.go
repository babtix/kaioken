package research

import (
	"context"
	"fmt"
	"strings"
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
// fast→deep and what error rate is tolerable — is answered here with a
// deliberate asymmetry: the router is biased toward fast, because a
// false-containment (deep was needed, fast ran) is caught by escalation
// mid-run, while a false-escalation only ever costs what the deep path
// costs. The thresholds are named so a corpus of logged decisions can tune
// them; every decision lands in events.jsonl for exactly that reason.
const (
	// routerDeepScore routes deep on heuristics alone at or above this.
	routerDeepScore = 3
	// routerFastScore routes fast on heuristics alone at or below this.
	routerFastScore = 1
	// routerEntityMin is how many distinct capitalised phrases suggest
	// several subjects that can be researched in parallel.
	routerEntityMin = 3
	// routerLongQuery is the character count above which a question earns
	// a complexity point on length alone.
	routerLongQuery = 180
)

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

// triage picks the path. Heuristics settle the clear cases for free; only
// the middle band costs one cheap call. Ties and failures land on fast —
// escalation is the safety net, not the router.
func triage(ctx context.Context, client *llm.Client, question string) routeDecision {
	score := heuristicScore(question)
	if score >= routerDeepScore {
		return routeDecision{RouteDeep, fmt.Sprintf("heuristic: multi-stranded (score %d)", score)}
	}
	if score <= routerFastScore {
		return routeDecision{RouteFast, fmt.Sprintf("heuristic: single strand (score %d)", score)}
	}
	if client == nil {
		return routeDecision{RouteFast, "heuristic: borderline, no router model available"}
	}

	system := `You triage research questions. Decide whether the question
decomposes into INDEPENDENT strands that can be researched in parallel
("deep"), or is one continuous chain of lookup and reasoning ("fast").

Deep examples: comparisons across three or more named subjects; "how should
we do X, and what do comparable projects do differently"; multi-part
questions joined by "and" where each part has its own sources.
Fast examples: a single lookup, one subject's history or price, summarising
one document, "what changed in X between versions".

When unsure, answer fast: a contained answer can be promoted later, and
multi-agent cost is only worth clearly parallel questions.

Reply with ONLY a JSON object:
{"path": "fast" | "deep", "reason": "one short clause"}`

	var out struct {
		Path   string `json:"path"`
		Reason string `json:"reason"`
	}
	if err := client.ChatJSON(ctx, system, "Question: "+question, &out); err != nil {
		return routeDecision{RouteFast, "router call failed; defaulting to fast: " + err.Error()}
	}
	reason := strings.TrimSpace(out.Reason)
	if reason == "" {
		reason = fmt.Sprintf("router judgement (heuristic score %d)", score)
	}
	if strings.EqualFold(strings.TrimSpace(out.Path), "deep") {
		return routeDecision{RouteDeep, "router: " + reason}
	}
	return routeDecision{RouteFast, "router: " + reason}
}
