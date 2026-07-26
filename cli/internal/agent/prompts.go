package agent

import "strings"

// Per-model prompt guidance.
//
// opencode ships an entirely separate system prompt per model family —
// anthropic.txt, gpt.txt, gemini.txt, and so on. That is the thorough answer,
// and it is also six prompts to keep in sync every time the base instructions
// change.
//
// Kaioken takes the cheaper half of the trade: one base prompt, plus a short
// addendum naming the failure that particular family actually has. Almost all
// of the benefit comes from a handful of sentences, because the differences
// that matter are not stylistic — they are specific, repeated mistakes.
//
// Only add an entry here for behavior observed in practice. A guess costs
// tokens on every single turn and steers the model toward a problem it may not
// have had.

// modelGuidance returns family-specific steering for a model id, or "" when
// the family is unknown or needs nothing said.
func modelGuidance(model string) string {
	switch modelFamily(model) {
	case familyAnthropic:
		// Claude reads eagerly and reasons well over what it has read; left
		// alone it will sometimes narrate a plan instead of carrying it out.
		return "Model note: you tend to over-explain before acting. Prefer making the edit and " +
			"describing it after, rather than proposing it and waiting."

	case familyGPT:
		// The GPT families are strong at tool calls but economical with reads,
		// and will answer from a filename when the file was right there.
		return "Model note: read the files before concluding. Do not infer a file's contents from " +
			"its name, its path, or a search result line — open it."

	case familyGemini:
		// Very large context invites dumping the repository into it, which
		// buries the actual question.
		return "Model note: your context is large, but relevance still beats volume. Read what the " +
			"task needs, not everything adjacent to it."

	case familyWeakTools:
		// Small and free models are where malformed tool calls come from: JSON
		// wrapped in prose, several calls crammed into one, invented tools.
		return "Model note: tool calls must be valid JSON matching the schema exactly, one call per " +
			"tool invocation, using only the tools listed above. Do not wrap a call in prose or " +
			"markdown fences, and do not invent tools or parameters. If a call fails to parse, " +
			"send it again correctly rather than explaining what you meant."
	}
	return ""
}

// Recognized model families.
const (
	familyUnknown = iota
	familyAnthropic
	familyGPT
	familyGemini
	familyWeakTools
)

// weakToolModels are substrings of models that need tool-call discipline spelled
// out. These are the small, distilled, and free-tier models: capable enough to
// be useful and unreliable enough to need the rules restated. Kaioken's own
// default model is one of them.
var weakToolModels = []string{
	"nemotron", ":free", "-free", "phi-", "gemma", "mini", "small",
	"7b", "8b", "9b", "3b", "1b", "distill",
}

func modelFamily(model string) int {
	id := strings.ToLower(model)
	switch {
	case strings.Contains(id, "claude"):
		return familyAnthropic
	case strings.Contains(id, "gpt-") || strings.HasPrefix(id, "o1") ||
		strings.HasPrefix(id, "o3") || strings.Contains(id, "/o1") || strings.Contains(id, "/o3"):
		return familyGPT
	case strings.Contains(id, "gemini"):
		return familyGemini
	}
	// The weak-tool check runs last so a large frontier model whose id happens
	// to contain a substring like "mini" is classified by its family first.
	for _, weak := range weakToolModels {
		if strings.Contains(id, weak) {
			return familyWeakTools
		}
	}
	return familyUnknown
}
