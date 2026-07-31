package research

import (
	"context"
	"fmt"
	"sort"
	"strings"

	"golang.org/x/sync/errgroup"

	"kaioken/internal/llm"
)

// The ×10 mode answers a different request from the others. Below it, the user
// wants an answer with its working shown; at ×10 they want a document — one
// they can hand to somebody who was not in the room, which stands on its own
// and can be checked line by line.
//
// That is not a longer prompt. A single synthesis call cannot produce twenty
// pages of cited argument: models run out of output budget long before, and
// what they do produce thins out badly past a thousand words. So the dossier is
// planned as an outline, written a section at a time — each section retrieving
// its own evidence from the corpus — and then assembled. The cost is many more
// model calls; the return is a document whose every section was written with
// the passages that section actually needed in front of the model, rather than
// one where the last third is written from memory of the first.

// dossierTargetWords is the floor the body aims for. Twelve A4 pages of body
// text at this renderer's measure is roughly 5,400 words; the target is set
// well above it so that the guarantee survives a run that finds less than it
// hoped, and so the appendices are never doing the work of reaching it.
const dossierTargetWords = 7000

// Section counts. Enough sections that each can be written well inside a
// model's output budget, few enough that the document has a shape.
const (
	minSections = 8
	maxSections = 14
)

// sectionPlan is one chapter as the outline step described it.
type sectionPlan struct {
	Title string `json:"title"`
	Brief string `json:"brief"`
}

// buildDossier plans, writes and assembles the long-form document. It returns
// the Deep record and the assembled Markdown body.
func buildDossier(ctx context.Context, client *llm.Client, question string, findings []finding,
	pool *corpus, budget, workers int, asOf string, pg Progress) (*Deep, string, error) {

	pg.stage("planning the dossier")
	plans, err := outlineDossier(ctx, client, question, findings, asOf)
	if err != nil {
		return nil, "", err
	}
	pg.detail(fmt.Sprintf("%d sections", len(plans)))

	summary, err := shortAnswer(ctx, client, question, findings, asOf)
	if err != nil {
		return nil, "", err
	}

	pg.stage(fmt.Sprintf("writing %d sections", len(plans)))
	bodies, err := writeSections(ctx, client, question, plans, findings, pool, budget, workers, asOf)
	if err != nil {
		return nil, "", err
	}

	// A section that came back thin is expanded once. Models under-produce
	// against a word target far more often than they over-produce, and one
	// corrective pass is the difference between a document that reaches its
	// floor and one that is short by a third.
	if words(bodies) < dossierTargetWords {
		pg.stage("expanding thin sections")
		expandSections(ctx, client, question, plans, bodies, pool, budget, workers, asOf)
	}

	deep := &Deep{Summary: summary}
	var b strings.Builder
	fmt.Fprintf(&b, "## Short answer\n\n%s\n", strings.TrimSpace(summary))
	for i, p := range plans {
		body := strings.TrimSpace(bodies[i])
		if body == "" {
			continue
		}
		fmt.Fprintf(&b, "\n## %s\n\n%s\n", p.Title, body)
	}
	b.WriteString(appendices(question, findings, pool))

	return deep, b.String(), nil
}

// outlineDossier plans the document's chapters.
func outlineDossier(ctx context.Context, client *llm.Client, question string,
	findings []finding, asOf string) ([]sectionPlan, error) {

	system := `You plan the structure of a long research report. You are given a
question and the findings a research pipeline gathered for it. Produce the
chapter outline for a report of 20 to 40 pages.

A good outline for this is not a list of the subquestions. It is the shape an
analyst would give the material: establish what is being measured and how,
work through each dimension of the evidence, confront the places sources
disagree, then say what follows and what would change the conclusion.

Every chapter must be answerable from the findings. Do not plan a chapter on
material nobody gathered — plan a chapter on what is missing instead, and say
so there.

For each chapter give:
  - "title": a specific noun phrase, not a generic label. "What drives the cost
    gap" beats "Analysis".
  - "brief": one or two sentences saying exactly what that chapter must
    establish, in enough detail that a writer who saw only the brief and the
    evidence could write it.

Reply with ONLY a JSON object:
{"sections": [{"title": "...", "brief": "..."}]}`

	user := fmt.Sprintf("%sQuestion: %s\n\nFindings gathered:\n%s\n\nPlan between %d and %d chapters.",
		asOf, question, renderFindings(findings), minSections, maxSections)

	var out struct {
		Sections []sectionPlan `json:"sections"`
	}
	if err := client.ChatJSON(ctx, system, user, &out); err != nil {
		return nil, fmt.Errorf("planning the dossier: %w", err)
	}

	var plans []sectionPlan
	seen := map[string]bool{}
	for _, s := range out.Sections {
		s.Title = strings.TrimSpace(s.Title)
		s.Brief = strings.TrimSpace(s.Brief)
		if s.Title == "" || seen[strings.ToLower(s.Title)] {
			continue
		}
		seen[strings.ToLower(s.Title)] = true
		plans = append(plans, s)
		if len(plans) >= maxSections {
			break
		}
	}
	if len(plans) == 0 {
		// A planner that returns nothing must not end the run. One chapter per
		// subquestion is a worse document than a planned one, but it is a
		// document, and every finding still reaches the reader.
		for _, f := range findings {
			plans = append(plans, sectionPlan{Title: f.Question, Brief: "Answer this from the evidence."})
			if len(plans) >= maxSections {
				break
			}
		}
	}
	return plans, nil
}

// shortAnswer writes the conclusion that leads the document.
func shortAnswer(ctx context.Context, client *llm.Client, question string,
	findings []finding, asOf string) (string, error) {

	system := `You write the opening answer of a research report: the three or
four sentences a reader gets if they read nothing else.

Lead with the answer. If the question asks which of two things is larger,
cheaper or better, say which one and give the figure that decides it. If the
evidence does not settle it, say that outright in the first sentence rather
than after three sentences of context.

Attach a citation like [3] to every figure. Do not hedge across both sides of a
question the evidence actually answers, and do not preview the report's
structure — the reader has a contents page.

Reply with the paragraph only. No heading, no preamble.`

	user := fmt.Sprintf("%sQuestion: %s\n\nFindings:\n%s", asOf, question, renderFindings(findings))
	md, err := client.Chat(ctx, system, user)
	if err != nil {
		return "", fmt.Errorf("writing the short answer: %w", err)
	}
	return strings.TrimSpace(md), nil
}

// writeSections writes every chapter in parallel, each against evidence
// retrieved for that chapter rather than for the question as a whole.
func writeSections(ctx context.Context, client *llm.Client, question string, plans []sectionPlan,
	findings []finding, pool *corpus, budget, workers int, asOf string) ([]string, error) {

	ranks := pool.pageRanks()
	lex := newLexicon(pool.chunks)
	const fenceOverhead = 150
	topK := clampInt(budget/(childChars+fenceOverhead), 4, 64)
	perSource := clampInt(topK/3, 2, 12)

	out := make([]string, len(plans))
	g, gctx := errgroup.WithContext(ctx)
	g.SetLimit(workers)

	for i, p := range plans {
		i, p := i, p
		g.Go(func() error {
			evidence := evidenceFor(pool, p.Title+"\n"+p.Brief, ranks, lex, topK, perSource, budget)
			body, err := writeSection(gctx, client, question, p, findings, evidence, asOf)
			if err != nil {
				return err
			}
			out[i] = body
			return nil
		})
	}
	if err := g.Wait(); err != nil {
		return nil, err
	}
	return out, nil
}

// evidenceFor selects and fences the passages one chapter should be written
// from.
func evidenceFor(pool *corpus, focus string, ranks map[int]int, lex *lexicon,
	topK, perSource, budget int) string {

	top := rankChunks(pool.chunks, focus, ranks, lex, topK, perSource)
	parts := make([]string, 0, len(top))
	for _, ch := range top {
		src, ok := pool.source(ch.SourceN)
		if !ok {
			continue
		}
		parts = append(parts, fenceUntrusted(src.N, src.URL, src.Title, ch.Text))
	}
	return budgetChunks(parts, budget)
}

// writeSection writes one chapter.
func writeSection(ctx context.Context, client *llm.Client, question string, p sectionPlan,
	findings []finding, evidence, asOf string) (string, error) {

	system := `You write one chapter of a long research report, from fetched web
pages and from findings a research pipeline already established.
` + untrustedRules + `

Write 700 to 1000 words of Markdown. Use ### subheadings to break it up, and
bullet lists where the material is genuinely a list — not to avoid writing
prose.

Rules:
- Write only this chapter. Do not introduce the report, do not summarise it,
  and do not repeat its title as a heading: it is added for you.
- Attach a citation like [3] to every specific claim, figure or date. A
  paragraph carrying no citation does not belong in the chapter.
- Keep each figure's year, place, units and basis attached to it. A number
  without them cannot be compared with anything.
- Weigh the sources. A statistics agency, regulator or peer-reviewed paper
  outranks a vendor page, an advocacy group or a forum post on the same claim.
  Say when a figure comes from a party with an interest in it.
- Where sources disagree, set out the disagreement and its likely cause rather
  than picking a side silently.
- Never state a figure no source provided, and never pad. If this chapter's
  material runs to 700 words and no further, write 700 good words and stop.
  Repetition is more damaging to a long report than brevity.`

	user := fmt.Sprintf("%sReport question: %s\n\nThis chapter: %s\nIt must establish: %s\n\n"+
		"Findings already established:\n%s\n\nSource passages:\n%s",
		asOf, question, p.Title, p.Brief, renderFindings(findings), evidence)

	md, err := client.Chat(ctx, system, user)
	if err != nil {
		return "", fmt.Errorf("writing chapter %q: %w", p.Title, err)
	}
	return stripEchoedTitle(strings.TrimSpace(md), p.Title), nil
}

// expandSections deepens the thinnest chapters when the body came in under its
// target. Failures here are tolerated: a shorter dossier is a far better
// outcome than a failed one, and the caller has already checked the floor.
func expandSections(ctx context.Context, client *llm.Client, question string, plans []sectionPlan,
	bodies []string, pool *corpus, budget, workers int, asOf string) {

	ranks := pool.pageRanks()
	lex := newLexicon(pool.chunks)
	const fenceOverhead = 150
	topK := clampInt(budget/(childChars+fenceOverhead), 4, 64)

	// Order chapters by how far short they fell, and expand the worst half.
	idx := make([]int, len(bodies))
	for i := range idx {
		idx[i] = i
	}
	sort.SliceStable(idx, func(a, b int) bool {
		return len(strings.Fields(bodies[idx[a]])) < len(strings.Fields(bodies[idx[b]]))
	})
	if len(idx) > 1 {
		idx = idx[:(len(idx)+1)/2]
	}

	system := `You deepen one chapter of a research report that came back thinner
than it should be.
` + untrustedRules + `

Return the WHOLE chapter rewritten, not an addition to it. Keep everything that
is already there and add the material the evidence supports but the draft left
out: the figures behind a general statement, the mechanism behind a claim, the
qualifications on a comparison, the sources that disagree.

Do not pad. Do not restate a point in different words to reach a length. If the
evidence genuinely supports no more than what is written, return it unchanged.
Every added claim needs its own citation.`

	g, gctx := errgroup.WithContext(ctx)
	g.SetLimit(workers)
	for _, i := range idx {
		i := i
		g.Go(func() error {
			evidence := evidenceFor(pool, plans[i].Title+"\n"+plans[i].Brief, ranks, lex, topK, 0, budget)
			user := fmt.Sprintf("%sReport question: %s\n\nChapter: %s\nIt must establish: %s\n\n"+
				"Current draft:\n%s\n\nSource passages:\n%s",
				asOf, question, plans[i].Title, plans[i].Brief, bodies[i], evidence)
			md, err := client.Chat(gctx, system, user)
			if err != nil {
				return nil // tolerated; the draft stands
			}
			if expanded := stripEchoedTitle(strings.TrimSpace(md), plans[i].Title); len(expanded) > len(bodies[i]) {
				bodies[i] = expanded
			}
			return nil
		})
	}
	_ = g.Wait()
}

// ------------------------------------------------------------- appendices

// appendices are generated in Go, not by a model. They are a record of what the
// run did, so inventing any part of them would defeat the purpose — and they
// are exactly the material a reader checks the rest of the document against.
func appendices(question string, findings []finding, pool *corpus) string {
	var b strings.Builder

	b.WriteString("\n## Appendix A — How this was researched\n\n")
	fmt.Fprintf(&b, "This dossier was assembled by kaioken's deep research pipeline for the question "+
		"%q. The pipeline decomposed the question into subquestions, wrote search queries for each, "+
		"fetched and read the pages the searches returned, reasoned over the passages that matched, "+
		"audited its own coverage for gaps, and searched again for what was missing — repeating that "+
		"cycle until the evidence was sufficient or the round budget ran out.\n\n", question)
	b.WriteString("Every claim in the body cites a page that was actually fetched and read. Citations " +
		"that did not resolve to such a page were removed before this document was written, so a " +
		"marker in the text always resolves to an entry in the source register.\n\n")
	b.WriteString("Two limits are worth stating plainly. Source quality is weighted by a heuristic — " +
		"domain, search rank and how well a passage matched — not by verification: a well-ranked page " +
		"can still be wrong. And the pipeline reads what a search engine surfaces, so material behind " +
		"paywalls, in formats it cannot parse, or absent from the open web is absent here too. " +
		"Passages where the report says the evidence was thin or contradictory are the ones to check " +
		"first.\n\n")

	b.WriteString("## Appendix B — Findings register\n\n")
	b.WriteString("Every subquestion the pipeline researched, with the answer it reached and its own " +
		"assessment of how well the evidence supported it.\n\n")
	for i, f := range findings {
		fmt.Fprintf(&b, "### B%d. %s\n\n", i+1, strings.TrimSpace(f.Question))
		fmt.Fprintf(&b, "%s\n\n", strings.TrimSpace(f.Answer))
		fmt.Fprintf(&b, "- Confidence: %s\n", orDash(f.Confidence))
		if len(f.Citations) > 0 {
			fmt.Fprintf(&b, "- Sources: %s\n", markerList(f.Citations))
		}
		if strings.TrimSpace(f.Gaps) != "" {
			fmt.Fprintf(&b, "- Still missing: %s\n", strings.TrimSpace(f.Gaps))
		}
		b.WriteString("\n")
	}

	return b.String()
}

// searchLog and scanLog are rendered separately from appendices because they
// are built from run state the corpus does not hold.

// SearchLog renders the queries appendix.
func SearchLog(queries []string) string {
	var b strings.Builder
	b.WriteString("## Appendix C — Search log\n\n")
	fmt.Fprintf(&b, "Every query issued, in the order it was issued. Later queries were written by "+
		"the gap audit to close what the earlier rounds left open.\n\n")
	for i, q := range queries {
		fmt.Fprintf(&b, "%d. %s\n", i+1, q)
	}
	b.WriteString("\n")
	return b.String()
}

// ScanLog renders the coverage appendix: every page the run reached.
func ScanLog(pages []ScannedPage) string {
	var read, cited int
	for _, p := range pages {
		if p.Read {
			read++
		}
		if p.Cited {
			cited++
		}
	}
	var b strings.Builder
	b.WriteString("## Appendix D — Pages reached\n\n")
	fmt.Fprintf(&b, "The run reached %d page%s, read %d of them, and cited %d in the body. "+
		"Pages that could not be read — dead links, paywalls, formats the fetcher does not parse — "+
		"are listed too, because a page that was tried and failed is part of an honest account of "+
		"the coverage.\n\n", len(pages), plural(len(pages), "", "s"), read, cited)
	// Entries are numbered sequentially, not by citation id: the body's markers
	// resolve against the source register, and reusing those numbers here would
	// invite the reader to look up [7] and find the wrong page.
	for i, p := range pages {
		title := strings.TrimSpace(p.Title)
		if title == "" {
			title = p.URL
		}
		fmt.Fprintf(&b, "%d. %s — %s _(%s)_\n", i+1, title, p.URL, scanStatus(p))
	}
	b.WriteString("\n")
	return b.String()
}

func scanStatus(p ScannedPage) string {
	switch {
	case p.Cited:
		return "cited"
	case p.Read:
		return "read, not cited"
	default:
		return "not readable"
	}
}

// ------------------------------------------------------------------ helpers

// appendixPrefix marks the sections that are a record of the run rather than
// part of its argument. The dossier generates these titles itself, so matching
// on the prefix is a convention this package owns, not a guess about prose.
const appendixPrefix = "Appendix "

// Chapters are the dossier's argument: everything before the appendices.
func (d *Deep) Chapters() []DeepSection {
	var out []DeepSection
	for _, s := range d.Sections {
		if !strings.HasPrefix(s.Title, appendixPrefix) {
			out = append(out, s)
		}
	}
	return out
}

// Appendices are the record of the run: method, findings, searches, coverage.
func (d *Deep) Appendices() []DeepSection {
	var out []DeepSection
	for _, s := range d.Sections {
		if strings.HasPrefix(s.Title, appendixPrefix) {
			out = append(out, s)
		}
	}
	return out
}

// splitSections cuts an assembled body back into its chapters, so the PDF can
// give each one its own page and contents entry. The body is re-cut rather than
// kept as written because citation renumbering rewrites it after assembly.
func splitSections(md string) []DeepSection {
	var out []DeepSection
	var cur *DeepSection
	for _, line := range strings.Split(md, "\n") {
		if title, ok := strings.CutPrefix(line, "## "); ok {
			out = append(out, DeepSection{Title: strings.TrimSpace(title)})
			cur = &out[len(out)-1]
			continue
		}
		if cur != nil {
			cur.Markdown += line + "\n"
		}
	}
	for i := range out {
		out[i].Markdown = strings.TrimSpace(out[i].Markdown)
	}
	return out
}

// firstSection returns the body of the first "## " chapter, which is the short
// answer.
func firstSection(md string) string {
	secs := splitSections(md)
	if len(secs) == 0 {
		return ""
	}
	return secs[0].Markdown
}

// stripToProse reduces a fragment to its first paragraph, for the cover.
func stripToProse(md string) string {
	md = strings.TrimSpace(md)
	if para, _, ok := strings.Cut(md, "\n\n"); ok {
		return strings.TrimSpace(para)
	}
	return md
}

// stripEchoedTitle removes a heading the model repeated despite being told the
// title is added for it. Left in, it would show up twice in the PDF.
func stripEchoedTitle(md, title string) string {
	for _, prefix := range []string{"# ", "## ", "### "} {
		head := prefix + title
		if strings.HasPrefix(md, head) {
			return strings.TrimSpace(strings.TrimPrefix(md, head))
		}
	}
	return md
}

func findingNotes(findings []finding) []FindingNote {
	out := make([]FindingNote, 0, len(findings))
	for _, f := range findings {
		out = append(out, FindingNote{
			Question: f.Question, Answer: f.Answer, Confidence: f.Confidence,
			Gaps: f.Gaps, Citations: f.Citations,
		})
	}
	return out
}

// scannedPages builds the coverage log. cited carries the post-renumbering
// citation ids, so the log agrees with the body about which pages were used.
func scannedPages(pool *corpus, cited []Source) []ScannedPage {
	used := make(map[string]bool, len(cited))
	for _, s := range cited {
		used[normalizeURL(s.URL)] = true
	}
	out := make([]ScannedPage, 0, len(pool.sources))
	for _, s := range pool.sources {
		out = append(out, ScannedPage{
			N: s.N, URL: s.URL, Title: s.Title, Tier: s.Tier,
			Read: s.Fetched, Cited: used[normalizeURL(s.URL)],
		})
	}
	return out
}

func words(bodies []string) int {
	var n int
	for _, b := range bodies {
		n += len(strings.Fields(b))
	}
	return n
}

func markerList(ns []int) string {
	parts := make([]string, 0, len(ns))
	for _, n := range ns {
		parts = append(parts, fmt.Sprintf("[%d]", n))
	}
	return strings.Join(parts, "")
}

func orDash(s string) string {
	if strings.TrimSpace(s) == "" {
		return "—"
	}
	return s
}
