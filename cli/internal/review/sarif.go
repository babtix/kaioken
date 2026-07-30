package review

import (
	"encoding/json"
	"fmt"

	"kaioken/internal/version"
)

// SARIF is what GitHub code scanning, GitLab and most CI annotators consume.
// Emitting it is what turns this from a command someone runs occasionally into
// review comments that appear on a pull request automatically.

// SARIF renders the report as a SARIF 2.1.0 log.
func (r *Report) SARIF() (string, error) {
	rules := map[string]bool{}
	var ruleDefs []sarifRule
	results := make([]sarifResult, 0, len(r.Findings))

	for _, f := range r.Findings {
		ruleID := "kaioken/" + string(f.Severity)
		if !rules[ruleID] {
			rules[ruleID] = true
			ruleDefs = append(ruleDefs, sarifRule{
				ID:               ruleID,
				Name:             "Kaioken" + title(string(f.Severity)),
				ShortDescription: sarifText{Text: fmt.Sprintf("Kaioken review finding (%s)", f.Severity)},
				FullDescription: sarifText{
					Text: "A finding from reviewing the diff against this repository's own " +
						"generated documentation, established skills and maintainer notes.",
				},
				DefaultConfiguration: sarifConfig{Level: sarifLevel(f.Severity)},
			})
		}

		text := f.Detail
		if f.Grounding != "" {
			text += "\n\nGrounded in: " + f.Grounding
		}
		res := sarifResult{
			RuleID:  ruleID,
			Level:   sarifLevel(f.Severity),
			Message: sarifText{Text: f.Title + "\n\n" + text},
			Locations: []sarifLocation{{
				PhysicalLocation: sarifPhysical{
					ArtifactLocation: sarifArtifact{URI: f.File},
					Region:           sarifRegion{StartLine: maxInt(f.Line, 1)},
				},
			}},
		}
		results = append(results, res)
	}

	log := sarifLog{
		Schema:  "https://json.schemastore.org/sarif-2.1.0.json",
		Version: "2.1.0",
		Runs: []sarifRun{{
			Tool: sarifTool{Driver: sarifDriver{
				Name:           "kaioken review",
				Version:        version.Version,
				InformationURI: "https://github.com/BABTIX/kaioken",
				Rules:          ruleDefs,
			}},
			Results: results,
		}},
	}

	raw, err := json.MarshalIndent(log, "", "  ")
	if err != nil {
		return "", err
	}
	return string(raw), nil
}

// sarifLevel maps severities onto SARIF's fixed vocabulary. "concern" becomes
// warning rather than error: it is explicitly the tier a maintainer may accept,
// and failing a build on it would make the distinction meaningless.
func sarifLevel(s Severity) string {
	switch s {
	case SeverityBlocker:
		return "error"
	case SeverityConcern:
		return "warning"
	default:
		return "note"
	}
}

type sarifLog struct {
	Schema  string     `json:"$schema"`
	Version string     `json:"version"`
	Runs    []sarifRun `json:"runs"`
}

type sarifRun struct {
	Tool    sarifTool     `json:"tool"`
	Results []sarifResult `json:"results"`
}

type sarifTool struct {
	Driver sarifDriver `json:"driver"`
}

type sarifDriver struct {
	Name           string      `json:"name"`
	Version        string      `json:"version"`
	InformationURI string      `json:"informationUri,omitempty"`
	Rules          []sarifRule `json:"rules"`
}

type sarifRule struct {
	ID                   string      `json:"id"`
	Name                 string      `json:"name"`
	ShortDescription     sarifText   `json:"shortDescription"`
	FullDescription      sarifText   `json:"fullDescription"`
	DefaultConfiguration sarifConfig `json:"defaultConfiguration"`
}

type sarifConfig struct {
	Level string `json:"level"`
}

type sarifText struct {
	Text string `json:"text"`
}

type sarifResult struct {
	RuleID    string          `json:"ruleId"`
	Level     string          `json:"level"`
	Message   sarifText       `json:"message"`
	Locations []sarifLocation `json:"locations"`
}

type sarifLocation struct {
	PhysicalLocation sarifPhysical `json:"physicalLocation"`
}

type sarifPhysical struct {
	ArtifactLocation sarifArtifact `json:"artifactLocation"`
	Region           sarifRegion   `json:"region"`
}

type sarifArtifact struct {
	URI string `json:"uri"`
}

type sarifRegion struct {
	StartLine int `json:"startLine"`
}

func maxInt(a, b int) int {
	if a > b {
		return a
	}
	return b
}

func title(s string) string {
	if s == "" {
		return s
	}
	return string(s[0]-32) + s[1:]
}
