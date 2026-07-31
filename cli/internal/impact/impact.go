// Package impact predicts the blast radius of a proposed code change before
// any file is edited: which symbols, files, modules, wiki documents, skills
// and tests a refactor would touch.
//
// The pipeline is deliberately evidence-first. Everything the knowledge engine
// already knows — the symbol index, the module plan's scopes, each skill's
// source files, each wiki document's provenance footer — is gathered
// deterministically, and only then is the LLM asked to reason over that
// bundle. Its structured answer is grounded back against the index: an item
// naming a symbol or path the repository does not contain is demoted to an
// "unverified" list instead of being presented as fact.
package impact

import (
	"context"
	"fmt"
	"strings"
	"time"

	"kaioken/internal/codemap"
	"kaioken/internal/config"
	"kaioken/internal/llm"
	"kaioken/internal/scan"
)

// Kind classifies one affected item in a report.
type Kind string

const (
	KindSymbol Kind = "symbol"
	KindFile   Kind = "file"
	KindModule Kind = "module"
	KindDoc    Kind = "doc"
	KindSkill  Kind = "skill"
	KindTest   Kind = "test"
)

// kindOrder fixes the presentation order of the groups everywhere a report is
// rendered — code first, then knowledge artifacts, then tests.
var kindOrder = []Kind{KindSymbol, KindFile, KindModule, KindDoc, KindSkill, KindTest}

// Item is one predicted point of impact.
type Item struct {
	Kind Kind `json:"kind"`
	// Name is the symbol, module id, skill name or file base name.
	Name string `json:"name"`
	// Path is the repo-relative location, when the item has one.
	Path string `json:"path,omitempty"`
	// Module is the owning module id, when the module plan resolves one.
	Module string `json:"module,omitempty"`
	Reason string `json:"reason"`
	// Risk is low, medium or high.
	Risk string `json:"risk"`
}

// Report is the full impact prediction for one intent.
type Report struct {
	Intent      string    `json:"intent"`
	Model       string    `json:"model"`
	GeneratedAt time.Time `json:"generated_at"`
	// Risk is the overall level: low, medium or high.
	Risk    string `json:"risk"`
	Summary string `json:"summary"`
	Items   []Item `json:"items"`
	// Checklist is what to verify by hand after making the change.
	Checklist []string `json:"checklist,omitempty"`
	// Unverified holds LLM claims that failed grounding against the index.
	// They are shown dimmed rather than silently dropped: a wrong prediction
	// the user can see is safer than one that vanished.
	Unverified []Item `json:"unverified,omitempty"`
	// Notes records degraded inputs (no modules.yaml, no wiki, …).
	Notes []string `json:"notes,omitempty"`
	// SavedPath is where the report was persisted, repo-relative.
	SavedPath string `json:"saved_path,omitempty"`
}

// Progress reports pipeline stages to the caller's UI.
type Progress struct {
	Info func(text string)
}

func (p Progress) info(t string) {
	if p.Info != nil {
		p.Info(t)
	}
}

// Run predicts the impact of the change described by intent. The repository
// is never modified beyond persisting the report under .kaioken/impact/.
func Run(ctx context.Context, repo string, cfg *config.Config, client *llm.Client,
	res *scan.Result, intent string, pg Progress) (*Report, error) {

	intent = strings.TrimSpace(intent)
	if intent == "" {
		return nil, fmt.Errorf("describe the change, e.g. /impact rename parseArgs to parseCLIArgs")
	}

	pg.info("indexing symbols")
	idx := codemap.Build(res)
	pg.info(fmt.Sprintf("indexed %d files, %d symbols", len(idx.Files), idx.SymbolCount()))

	ev := gather(repo, res, idx, intent)
	for _, n := range ev.notes {
		pg.info(n)
	}
	pg.info(fmt.Sprintf("evidence: %d symbol(s) · %d file(s) · %d module(s) · %d skill(s) · %d doc(s) · %d test file(s)",
		len(ev.symbols), len(ev.affected), len(ev.hitModules), len(ev.skills), len(ev.docs), len(ev.tests)))

	pg.info("asking " + client.Model + " for the impact analysis")
	var raw rawReport
	if err := client.ChatJSON(ctx, impactSystem, userPrompt(intent, ev), &raw); err != nil {
		return nil, err
	}

	rep := ground(&raw, ev, idx)
	rep.Intent = intent
	rep.Model = client.Model
	rep.GeneratedAt = time.Now()
	rep.Notes = ev.notes

	if path, err := rep.save(repo); err != nil {
		pg.info("could not save the report: " + err.Error())
	} else {
		rep.SavedPath = path
	}
	return rep, nil
}

// ---- LLM contract ----

// rawReport is the shape the model must return; grounding turns it into a
// Report by verifying every claim against the evidence.
type rawReport struct {
	Risk      string    `json:"risk"`
	Summary   string    `json:"summary"`
	Items     []rawItem `json:"items"`
	Checklist []string  `json:"checklist"`
}

type rawItem struct {
	Kind   string `json:"kind"`
	Name   string `json:"name"`
	Path   string `json:"path"`
	Module string `json:"module"`
	Reason string `json:"reason"`
	Risk   string `json:"risk"`
}

const impactSystem = `You are a senior engineer running a refactoring IMPACT ANALYSIS. Given a
proposed change and hard evidence gathered from the repository's knowledge
engine (symbol index, cross-references, module plan, skills, wiki provenance),
you predict everything the change would touch.

Rules:
- Ground every item in the evidence. Never invent symbols, paths, modules,
  skills or documents that the evidence does not mention.
- kind is one of: symbol, file, module, doc, skill, test.
- One item per affected thing. reason says WHY it is affected, in one clause
  ("declares the symbol", "calls it in 3 places", "skill lists the file as a
  source", …). risk is low, medium or high for that item.
- The overall risk reflects the worst plausible outcome: interface or
  exported-API changes and wide fan-out are high; a rename with few local
  callers is low.
- checklist lists the manual verifications to run after making the change,
  most important first, five entries at most.

Return ONLY a JSON object:
{"risk":"low|medium|high","summary":"one or two sentences",
"items":[{"kind":"...","name":"...","path":"...","module":"...","reason":"...","risk":"..."}],
"checklist":["..."]}

Strict output rules: double-quote every key and string value, no comments,
no ellipsis (…) or placeholders, no trailing commas, no text before or after
the object. Emit every item in full — never abbreviate.`

// userPrompt renders the evidence bundle the model reasons over.
func userPrompt(intent string, ev *evidence) string {
	var b strings.Builder
	b.WriteString("Proposed change:\n" + intent + "\n")

	if len(ev.symbols) > 0 {
		b.WriteString("\nMatched symbols (declarations from the index):\n")
		for _, s := range ev.symbols {
			fmt.Fprintf(&b, "- %s\n", s.Name)
			for _, sig := range s.Sigs {
				b.WriteString("    " + sig + "\n")
			}
		}
	} else {
		b.WriteString("\nNo symbol named in the intent matched the index — reason from the file evidence only.\n")
	}

	if len(ev.refs) > 0 {
		b.WriteString("\nFiles referencing those symbols (with matching lines):\n")
		for _, r := range ev.refs {
			b.WriteString("- " + r.Path + "\n")
			for _, l := range r.Lines {
				b.WriteString("    " + l + "\n")
			}
		}
	}

	if len(ev.modules) > 0 {
		b.WriteString("\nModule plan (modules marked * contain affected files):\n")
		for _, m := range ev.modules {
			mark := "  "
			if m.Hit {
				mark = "* "
			}
			fmt.Fprintf(&b, "%s%s — %s (scope: %s)\n", mark, m.ID, m.Title, strings.Join(m.Scope, ", "))
		}
	}

	if len(ev.skills) > 0 {
		b.WriteString("\nSkills whose source files are affected:\n")
		for _, s := range ev.skills {
			fmt.Fprintf(&b, "- %s: %s (sources: %s)\n", s.Name, clipText(s.Description, 120), strings.Join(s.Sources, ", "))
		}
	}

	if len(ev.docs) > 0 {
		b.WriteString("\nWiki documents whose provenance cites affected files:\n")
		for _, d := range ev.docs {
			b.WriteString("- " + d + "\n")
		}
	}

	if len(ev.tests) > 0 {
		b.WriteString("\nCandidate test files:\n")
		for _, t := range ev.tests {
			b.WriteString("- " + t + "\n")
		}
	}

	if len(ev.notes) > 0 {
		b.WriteString("\nMissing knowledge sources:\n")
		for _, n := range ev.notes {
			b.WriteString("- " + n + "\n")
		}
	}
	return b.String()
}

// ---- grounding ----

// ground verifies every model claim against the evidence and the index.
// Verified items keep their place; the rest land in Unverified. Deterministic
// findings the model omitted (stale skills, provenance-hit docs, hit modules,
// test files) are appended so the report never under-reports what the
// knowledge engine already proved.
func ground(raw *rawReport, ev *evidence, idx *codemap.Index) *Report {
	rep := &Report{
		Risk:      normRisk(raw.Risk),
		Summary:   strings.TrimSpace(raw.Summary),
		Checklist: raw.Checklist,
	}

	moduleIDs := map[string]bool{}
	for _, m := range ev.modules {
		moduleIDs[m.ID] = true
	}
	skillNames := map[string]bool{}
	for _, s := range ev.skills {
		skillNames[s.Name] = true
	}
	docPaths := map[string]bool{}
	for _, d := range ev.docs {
		docPaths[d] = true
	}

	for _, r := range raw.Items {
		it := Item{
			Kind:   Kind(strings.ToLower(strings.TrimSpace(r.Kind))),
			Name:   strings.TrimSpace(r.Name),
			Path:   normPath(r.Path),
			Module: strings.TrimSpace(r.Module),
			Reason: strings.TrimSpace(r.Reason),
			Risk:   normRisk(r.Risk),
		}
		ok := false
		switch it.Kind {
		case KindSymbol:
			if files, has := idx.HasSymbol(it.Name); has {
				ok = true
				if it.Path == "" && len(files) > 0 {
					it.Path = files[0]
				}
			}
		case KindFile, KindTest:
			ok = idx.HasFile(it.Path)
		case KindModule:
			ok = moduleIDs[it.Name] || moduleIDs[it.Path]
			if !ok && moduleIDs[it.Module] {
				ok, it.Name = true, it.Module
			}
		case KindDoc:
			ok = docPaths[it.Path] || docPaths[it.Name]
			if ok && it.Path == "" {
				it.Path = it.Name
			}
		case KindSkill:
			ok = skillNames[it.Name]
		}
		if ok {
			rep.Items = append(rep.Items, it)
		} else if it.Name != "" || it.Path != "" {
			rep.Unverified = append(rep.Unverified, it)
		}
	}

	ensureDeterministic(rep, ev)
	return rep
}

// ensureDeterministic appends evidence the model left out. These are facts,
// not predictions: a skill whose source file is in the change set IS affected.
func ensureDeterministic(rep *Report, ev *evidence) {
	have := map[string]bool{}
	for _, it := range rep.Items {
		have[string(it.Kind)+"\x00"+it.Name+"\x00"+it.Path] = true
		// Also record kind+name (without path) so a model item with no path
		// is not duplicated when the deterministic pass supplies the full one.
		have[string(it.Kind)+"\x00"+it.Name] = true
	}
	add := func(it Item) {
		key := string(it.Kind) + "\x00" + it.Name + "\x00" + it.Path
		if have[key] || have[string(it.Kind)+"\x00"+it.Name] {
			return
		}
		if it.Path != "" {
			for _, e := range rep.Items {
				if e.Kind == it.Kind && e.Path == it.Path {
					return
				}
			}
		}
		have[key] = true
		have[string(it.Kind)+"\x00"+it.Name] = true
		rep.Items = append(rep.Items, it)
	}

	for _, id := range ev.hitModules {
		add(Item{Kind: KindModule, Name: id,
			Reason: "module scope contains affected files", Risk: "medium"})
	}
	for _, s := range ev.skills {
		add(Item{Kind: KindSkill, Name: s.Name, Path: s.Path,
			Reason: "skill lists an affected file as a source", Risk: "medium"})
	}
	for _, d := range ev.docs {
		add(Item{Kind: KindDoc, Name: baseName(d), Path: d,
			Reason: "document provenance cites an affected file", Risk: "medium"})
	}
	for _, t := range ev.tests {
		add(Item{Kind: KindTest, Name: baseName(t), Path: t,
			Reason: "test file in the predicted change set", Risk: "medium"})
	}
}

func normRisk(s string) string {
	switch strings.ToLower(strings.TrimSpace(s)) {
	case "low":
		return "low"
	case "high":
		return "high"
	default:
		return "medium"
	}
}

func normPath(p string) string {
	return strings.Trim(strings.ReplaceAll(strings.TrimSpace(p), "\\", "/"), "/")
}

func baseName(p string) string {
	if i := strings.LastIndex(p, "/"); i >= 0 {
		return p[i+1:]
	}
	return p
}

func clipText(s string, n int) string {
	s = strings.TrimSpace(s)
	if len(s) <= n {
		return s
	}
	return s[:n-1] + "…"
}
