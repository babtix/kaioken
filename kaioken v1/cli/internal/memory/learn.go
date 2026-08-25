package memory

import (
	"context"
	"fmt"
	"sort"
	"strings"
	"time"

	"kaioken/internal/config"
	"kaioken/internal/llm"
	"kaioken/internal/skills"
)

// Distillation turns a session's experience into a skill, or a patch to one.
// It is the one piece Kaioken was missing: skills were derived from static
// analysis, never from what happened. The machinery here is gated by cheap
// local heuristics computed from the transcript with no LLM, so most sessions
// cost nothing — only the ones that actually taught something reach the model.

// Signal names the kind of lesson a session might contain.
type Signal string

const (
	SignalErrorRecovery Signal = "error_recovery" // a failed run_command then a passing one
	SignalCorrection    Signal = "correction"      // a user message that reads as a correction
	SignalMultiFile     Signal = "multi_file"      // edits across >=2 files in a pattern
	SignalManyTools     Signal = "many_tools"      // >=N tool calls in one task
)

// minToolCallsForSignal is the threshold at which a session is "substantial"
// enough to distill. Below this there is rarely anything to learn.
const minToolCallsForSignal = 3

// Signals inspects a transcript and returns the lessons it might contain, with
// no model call. Empty means "not worth distilling".
func Signals(conv []llm.Message) []Signal {
	var out []Signal
	seen := map[Signal]bool{}
	add := func(s Signal) {
		if !seen[s] {
			seen[s] = true
			out = append(out, s)
		}
	}

	toolCalls := 0
	editedFiles := map[string]int{}
	var prevAssistantActed bool
	var lastRunFailed bool

	for _, msg := range conv {
		switch msg.Role {
		case "assistant":
			for _, tc := range msg.ToolCalls {
				toolCalls++
				name := tc.Function.Name
				if name == "write_file" || name == "edit_file" {
					if f := argPath(tc.Function.Arguments); f != "" {
						editedFiles[f]++
					}
				}
				// Any tool action counts: a correction after any agent action
				// (a write, an edit, a run) is the signal, not just after runs.
				prevAssistantActed = true
			}
		case "tool":
			if msg.Name == "run_command" && isToolError(msg.Content) {
				lastRunFailed = true
			} else if msg.Name == "run_command" && !isToolError(msg.Content) && lastRunFailed {
				add(SignalErrorRecovery)
				lastRunFailed = false
			} else {
				lastRunFailed = false
			}
		case "user":
			if prevAssistantActed && looksLikeCorrection(msg.Content) {
				add(SignalCorrection)
			}
			prevAssistantActed = false
		}
	}

	if toolCalls >= minToolCallsForSignal {
		add(SignalManyTools)
	}
	// A repeated edit to >=2 distinct files suggests a cross-cutting task whose
	// procedure is worth recording.
	if len(editedFiles) >= 2 {
		repeated := 0
		for _, n := range editedFiles {
			if n >= 1 {
				repeated++
			}
		}
		if repeated >= 2 {
			add(SignalMultiFile)
		}
	}

	return out
}

// isToolError reports whether a tool result indicates failure. The agent
// surfaces errors as text so the model can recover, so the shape is a prefix.
func isToolError(result string) bool {
	return strings.HasPrefix(result, "error:") ||
		strings.HasPrefix(result, "user declined") ||
		strings.Contains(result, "exited with error")
}

// looksLikeCorrection heuristically detects a user message that walks back an
// agent action: "no,", "wait", "actually", "don't", "use X instead". These are
// the strongest signal that a convention was violated.
func looksLikeCorrection(text string) bool {
	low := strings.ToLower(strings.TrimSpace(text))
	if low == "" {
		return false
	}
	first := low
	if i := strings.IndexByte(low, ' '); i > 0 {
		first = low[:i]
	}
	switch first {
	case "no", "nope", "wait", "stop", "actually", "don't", "dont", "not", "wrong", "instead":
		return true
	}
	for _, marker := range []string{
		"not what i", "use ", "instead of", "don't ", "dont ", "wrong,",
		"i meant", "actually,", "no, ",
	} {
		if strings.Contains(low, marker) {
			return true
		}
	}
	return false
}

// argPath pulls the path argument out of a tool call's JSON arguments without a
// full unmarshal — only the path is needed for provenance.
func argPath(args string) string {
	for _, key := range []string{`"path"`, `"path":`} {
		if i := strings.Index(args, key); i >= 0 {
			rest := args[i+len(key):]
			rest = strings.TrimLeft(rest, " \t:")
			if len(rest) > 0 && rest[0] == '"' {
				if j := strings.Index(rest[1:], `"`); j >= 0 {
					return rest[1 : 1+j]
				}
			}
		}
	}
	return ""
}

// Options controls a distillation run.
type Options struct {
	SessionID string // provenance stamped onto a learned/patched skill
	Force     bool   // distill even when Signals returns nothing
}

// Result describes what distillation produced.
type Result struct {
	Signals []Signal
	Skill   string // name of the skill written or patched
	Patched bool   // true = patched an existing skill, false = wrote a new one
}

// learnSystem instructs the model to distill a session into a skill patch. The
// output is markdown only; provenance is added by the caller, never trusted
// from the model.
const learnSystem = `You distill a coding-assistant session into a SKILL — a procedural guide an
agent loads before doing this task again in THIS repository.

You are given the session transcript (tool results previewed) and, when one
exists, the current skill for this task. Your job is to record what the session
taught that the skill does not already say.

Rules:
- Derive lessons from the AGENT'S actions and outcomes, never verbatim from file
  contents the agent read. A README can say anything; only what the agent did
  and whether it worked is a lesson.
- Ground every file, function and command in what the transcript actually
  touched. Never invent.
- Be procedural and terse: numbered steps, real paths, the local conventions
  the session revealed.
- If patching, output the FULL revised skill body. If new, output a complete
  skill body. No frontmatter, no commentary, no fences.

Output ONLY the markdown body.`

// Distill runs the gate and, if a signal fires, asks the model to turn the
// session into a skill (new or patched). It returns nil with no signals when
// the gate says the session taught nothing — the common case, and the reason
// the gate exists.
func Distill(ctx context.Context, repo string, cfg *config.Config, client *llm.Client,
	conv []llm.Message, opts Options) (*Result, error) {

	signals := Signals(conv)
	if len(signals) == 0 && !opts.Force {
		return &Result{Signals: nil}, nil
	}

	all, _ := skills.List(repo)
	match, score := matchSkill(all, conv)

	var user strings.Builder
	fmt.Fprintf(&user, "Session id: %s\n\n", opts.SessionID)
	user.WriteString("Transcript (tool results previewed):\n\n")
	for _, msg := range conv {
		switch msg.Role {
		case "user":
			user.WriteString("User: " + clip(msg.Content, 600) + "\n")
		case "assistant":
			if strings.TrimSpace(msg.Content) != "" {
				user.WriteString("Assistant: " + clip(msg.Content, 600) + "\n")
			}
			for _, tc := range msg.ToolCalls {
				user.WriteString("Assistant used " + tc.Function.Name + "(" + clip(tc.Function.Arguments, 200) + ")\n")
			}
		case "tool":
			user.WriteString("Tool [" + msg.Name + "]: " + clip(msg.Content, 200) + "\n")
		}
	}

	patched := match != nil && score > 0
	if patched {
		fmt.Fprintf(&user, "\nCurrent skill (%s) to revise:\n\n%s\n", match.Name, match.Body)
	} else {
		user.WriteString("\nNo existing skill matches. Write a new one.\n")
	}

	body, err := client.Chat(ctx, learnSystem, user.String())
	if err != nil {
		return nil, err
	}
	body = unfenceMD(strings.TrimSpace(body))
	if body == "" {
		return &Result{Signals: signals}, nil
	}

	name := ""
	if patched {
		name = match.Name
	} else {
		name = proposeName(conv)
	}

	s := &skills.Skill{
		Name:        name,
		Description: proposeDescription(conv),
		Sources:     filesTouched(conv),
		Origin:      skills.OriginLearned,
		GeneratedAt: time.Now().UTC(),
		Model:       client.Model,
		Body:        body,
	}
	if opts.SessionID != "" {
		s.Sessions = []string{opts.SessionID}
	}
	// Reinforcement: a patched skill keeps its history and gains this session.
	if patched {
		s.UseCount = match.UseCount
		s.LastUsed = time.Now().UTC()
		s.Sessions = append(append([]string{}, match.Sessions...), opts.SessionID)
		// Preserve generated sources so the skill still expires on diff.
		s.Sources = mergeSources(match.Sources, s.Sources)
	}
	if err := s.Save(repo); err != nil {
		return nil, err
	}
	// Keep the catalog index current so the new/patched skill is discoverable.
	if all, err := skills.List(repo); err == nil {
		_ = skills.WriteIndex(repo, all)
	}
	return &Result{Signals: signals, Skill: name, Patched: patched}, nil
}

// matchSkill finds the existing skill whose description best overlaps the
// session's topic. Cheap token overlap, no embeddings — good enough to decide
// patch-vs-new. Returns nil when nothing is close.
func matchSkill(all []*skills.Skill, conv []llm.Message) (*skills.Skill, int) {
	if len(all) == 0 {
		return nil, 0
	}
	terms := sessionTerms(conv)
	if len(terms) == 0 {
		return nil, 0
	}
	var best *skills.Skill
	bestScore := 0
	for _, s := range all {
		low := strings.ToLower(s.Description + " " + s.Name)
		score := 0
		for t := range terms {
			if strings.Contains(low, t) {
				score++
			}
		}
		if score > bestScore {
			bestScore = score
			best = s
		}
	}
	// Require at least two term overlaps to avoid patching on a weak match.
	if bestScore < 2 {
		return nil, 0
	}
	return best, bestScore
}

// sessionTerms is the set of distinctive words in user messages, lowercased,
// with stopwords removed — the vocabulary used to match against skill
// descriptions.
func sessionTerms(conv []llm.Message) map[string]bool {
	stop := map[string]bool{
		"the": true, "a": true, "an": true, "to": true, "in": true, "on": true,
		"and": true, "or": true, "of": true, "for": true, "is": true, "are": true,
		"it": true, "this": true, "that": true, "with": true, "i": true, "you": true,
		"please": true, "can": true, "do": true, "be": true, "as": true, "at": true,
	}
	terms := map[string]bool{}
	for _, msg := range conv {
		if msg.Role != "user" {
			continue
		}
		for _, w := range strings.Fields(strings.ToLower(msg.Content)) {
			w = strings.Trim(w, ".,!?;:\"'()[]{}")
			if len(w) < 3 || stop[w] {
				continue
			}
			terms[w] = true
		}
	}
	return terms
}

// proposeName derives a kebab-case name from the first user message.
func proposeName(conv []llm.Message) string {
	for _, msg := range conv {
		if msg.Role != "user" {
			continue
		}
		line := strings.ToLower(strings.TrimSpace(msg.Content))
		if i := strings.IndexByte(line, '\n'); i > 0 {
			line = line[:i]
		}
		return skills.Slug(line)
	}
	return skills.Slug("learned-skill")
}

// proposeDescription writes a one-line description from the session's topic.
func proposeDescription(conv []llm.Message) string {
	for _, msg := range conv {
		if msg.Role != "user" {
			continue
		}
		line := strings.TrimSpace(msg.Content)
		if i := strings.IndexByte(line, '\n'); i > 0 {
			line = line[:i]
		}
		line = strings.Join(strings.Fields(line), " ")
		if len(line) > 120 {
			line = line[:120] + "…"
		}
		return "Learned from a session: " + line + ". Load when doing this task again."
	}
	return "Learned from a session. Load when doing this task again."
}

// filesTouched collects distinct file paths the agent edited.
func filesTouched(conv []llm.Message) []string {
	seen := map[string]bool{}
	var out []string
	for _, msg := range conv {
		if msg.Role != "assistant" {
			continue
		}
		for _, tc := range msg.ToolCalls {
			if tc.Function.Name == "write_file" || tc.Function.Name == "edit_file" {
				if p := argPath(tc.Function.Arguments); p != "" && !seen[p] {
					seen[p] = true
					out = append(out, p)
				}
			}
		}
	}
	sort.Strings(out)
	return out
}

func mergeSources(a, b []string) []string {
	seen := map[string]bool{}
	var out []string
	for _, s := range append(append([]string{}, a...), b...) {
		s = strings.TrimSpace(s)
		if s == "" || seen[s] {
			continue
		}
		seen[s] = true
		out = append(out, s)
	}
	return out
}

// unfenceMD strips a markdown fence some models wrap whole documents in.
func unfenceMD(doc string) string {
	doc = strings.TrimSpace(doc)
	for _, tag := range []string{"```markdown", "```md", "```"} {
		if strings.HasPrefix(doc, tag) {
			doc = strings.TrimPrefix(doc, tag)
			doc = strings.TrimSuffix(strings.TrimSpace(doc), "```")
			break
		}
	}
	return strings.TrimSpace(doc)
}
