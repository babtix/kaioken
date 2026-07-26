package memory

import (
	"encoding/json"
	"fmt"
	"strings"
	"time"

	"kaioken/internal/llm"
	"kaioken/internal/skills"
)

// Reinforcement records which skills were actually used and worked, so the
// catalog can favor proven ones; decay flags skills nobody reaches for so a
// human can prune them. Neither mechanism auto-deletes: every change is a
// reviewable diff, which is the real defense against a wrong lesson sticking.

// ConsultedSkills returns the names of skills opened via read_knowledge in a
// transcript. A skill the agent read is the precondition for reinforcement —
// a clean outcome after opening it is what makes it "proven".
func ConsultedSkills(conv []llm.Message) []string {
	seen := map[string]bool{}
	var out []string
	for _, msg := range conv {
		if msg.Role != "assistant" {
			continue
		}
		for _, tc := range msg.ToolCalls {
			if tc.Function.Name != "read_knowledge" {
				continue
			}
			if name := skillNameFromDocArg(tc.Function.Arguments); name != "" && !seen[name] {
				seen[name] = true
				out = append(out, name)
			}
		}
	}
	return out
}

// skillNameFromDocArg extracts the skill directory name from a read_knowledge
// argument, which may be ".kaioken/skills/<name>", "skills/<name>", or
// ".../<name>/SKILL.md". Returns "" when the path is not a skill.
func skillNameFromDocArg(args string) string {
	var v struct {
		Doc string `json:"doc"`
	}
	if err := json.Unmarshal([]byte(args), &v); err != nil || v.Doc == "" {
		return ""
	}
	p := strings.ReplaceAll(v.Doc, "\\", "/")
	p = strings.Trim(p, "/")
	// Find the skills/ segment.
	idx := strings.Index(p, "skills/")
	if idx < 0 {
		return ""
	}
	rest := strings.TrimPrefix(p[idx:], "skills/")
	rest = strings.TrimSuffix(rest, "/SKILL.md")
	rest = strings.TrimSuffix(rest, "/")
	rest = strings.Trim(rest, "/")
	if rest == "" || strings.Contains(rest, "/") {
		// A directory listing of all skills, or a non-skill path.
		return ""
	}
	return rest
}

// ReinforceFromSession bumps UseCount and LastUsed for every skill consulted in
// a session that ended cleanly (no in-flight error, not cancelled). It stamps
// the session id onto the skill's Sessions provenance. Failures are silent —
// reinforcement is best-effort and must never break a session close.
func ReinforceFromSession(repo string, conv []llm.Message, sessionID string, clean bool) []string {
	if !clean {
		return nil
	}
	names := ConsultedSkills(conv)
	if len(names) == 0 {
		return nil
	}
	all, err := skills.List(repo)
	if err != nil {
		return nil
	}
	byName := map[string]*skills.Skill{}
	for _, s := range all {
		byName[s.Name] = s
	}
	now := time.Now().UTC()
	var reinforced []string
	for _, name := range names {
		s, ok := byName[name]
		if !ok {
			continue
		}
		s.UseCount++
		s.LastUsed = now
		s.Sessions = appendUnique(s.Sessions, sessionID)
		_ = s.Save(repo)
		reinforced = append(reinforced, name)
	}
	return reinforced
}

func appendUnique(ss []string, s string) []string {
	for _, x := range ss {
		if x == s {
			return ss
		}
	}
	return append(ss, s)
}

// PruneCandidate is a skill the catalog would be better off without.
type PruneCandidate struct {
	Name     string
	Reason   string
	UseCount int
	LastUsed time.Time
}

// PruneStale flags skills that have not been consulted recently, so a human can
// prune them. It never deletes — that is the reviewable-diff invariant. A
// skill is a candidate when it has never been used, or when it has not been
// opened in `staleDays`. Learned skills are judged the same as generated ones:
// a lesson that nobody follows is noise.
func PruneStale(repo string, staleDays int) ([]PruneCandidate, error) {
	all, err := skills.List(repo)
	if err != nil {
		return nil, err
	}
	threshold := time.Now().UTC().Add(-time.Duration(staleDays) * 24 * time.Hour)
	var out []PruneCandidate
	for _, s := range all {
		// Never edit or delete a human-authored skill by recommendation.
		if s.Origin == skills.OriginHuman {
			continue
		}
		switch {
		case s.UseCount == 0 && s.LastUsed.IsZero():
			out = append(out, PruneCandidate{
				Name: s.Name, Reason: "never opened in any session",
				UseCount: 0, LastUsed: s.LastUsed,
			})
		case !s.LastUsed.IsZero() && s.LastUsed.Before(threshold):
			out = append(out, PruneCandidate{
				Name: s.Name, Reason: fmt.Sprintf("not opened in %d days", staleDays),
				UseCount: s.UseCount, LastUsed: s.LastUsed,
			})
		}
	}
	return out, nil
}
