package impact

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
	"time"

	"kaioken/internal/gitx"
)

// Comparing a prediction against what actually changed is what turns impact
// analysis from a guess into a measured system: every -compare run records an
// accuracy line, so over time the reports carry a track record.

// footerRe matches the machine-readable file list save() appends to reports.
var footerRe = regexp.MustCompile(`(?s)<!-- kaioken:files (.*?) -->`)

// intentRe pulls the intent line out of a rendered report.
var intentRe = regexp.MustCompile(`(?m)^\*\*Intent:\*\* (.+)$`)

// LoadLatest reads the newest saved report and returns its predicted paths
// and intent. Report filenames are timestamp-prefixed, so name order is
// chronological order.
func LoadLatest(repo string) (predicted []string, intent string, err error) {
	entries, rerr := os.ReadDir(storeDir(repo))
	if rerr != nil {
		return nil, "", fmt.Errorf("no saved impact reports — run one first")
	}
	var names []string
	for _, e := range entries {
		if !e.IsDir() && strings.HasSuffix(e.Name(), ".md") {
			names = append(names, e.Name())
		}
	}
	if len(names) == 0 {
		return nil, "", fmt.Errorf("no saved impact reports — run one first")
	}
	sort.Strings(names)

	raw, rerr := os.ReadFile(filepath.Join(storeDir(repo), names[len(names)-1]))
	if rerr != nil {
		return nil, "", rerr
	}
	doc := string(raw)
	if m := intentRe.FindStringSubmatch(doc); m != nil {
		intent = strings.TrimSpace(m[1])
	}
	m := footerRe.FindStringSubmatch(doc)
	if m == nil {
		return nil, intent, nil // a report may legitimately predict no files
	}
	for _, p := range strings.Split(m[1], ",") {
		if p = strings.TrimSpace(p); p != "" {
			predicted = append(predicted, p)
		}
	}
	return predicted, intent, nil
}

// Outcome is a prediction scored against reality.
type Outcome struct {
	Hits        []string // predicted and changed
	Missed      []string // predicted, untouched
	Unpredicted []string // changed, never predicted
}

// Compare scores predicted paths against the changes git reports. Kaioken's
// own generated files are excluded from the actuals: documentation churn is
// not something a code-impact prediction should be graded on.
func Compare(predicted []string, actual []gitx.Change) Outcome {
	norm := func(p string) string {
		p = filepath.ToSlash(filepath.Clean(p))
		return strings.TrimPrefix(p, "./")
	}
	predictedSet := map[string]bool{}
	for _, p := range predicted {
		predictedSet[norm(p)] = true
	}

	actualSet := map[string]bool{}
	for _, c := range actual {
		p := norm(c.Path)
		if strings.HasPrefix(p, ".kaioken/") {
			continue
		}
		actualSet[p] = true
	}

	var out Outcome
	for _, p := range predicted {
		if actualSet[norm(p)] {
			out.Hits = append(out.Hits, p)
		} else {
			out.Missed = append(out.Missed, p)
		}
	}
	for p := range actualSet {
		if !predictedSet[p] {
			out.Unpredicted = append(out.Unpredicted, p)
		}
	}
	sort.Strings(out.Unpredicted)
	return out
}

// Accuracy is the fraction of predictions that landed. Zero predictions
// score 1.0 only when nothing was missed by definition — report it as NaN-ish
// 0 so a prediction-free compare does not masquerade as perfect.
func (o Outcome) Accuracy() float64 {
	if len(o.Hits)+len(o.Missed) == 0 {
		return 0
	}
	return float64(len(o.Hits)) / float64(len(o.Hits)+len(o.Missed))
}

// RecordAccuracy appends one comparison to .kaioken/impact/accuracy.jsonl,
// the running log of how well predictions hold up in this repo.
func RecordAccuracy(repo, intent string, o Outcome) error {
	if err := os.MkdirAll(storeDir(repo), 0o755); err != nil {
		return err
	}
	rec := struct {
		At          time.Time `json:"at"`
		Intent      string    `json:"intent"`
		Accuracy    float64   `json:"accuracy"`
		Hits        []string  `json:"hits"`
		Missed      []string  `json:"missed"`
		Unpredicted []string  `json:"unpredicted"`
	}{time.Now().UTC(), intent, o.Accuracy(), o.Hits, o.Missed, o.Unpredicted}
	if rec.Hits == nil {
		rec.Hits = []string{}
	}
	if rec.Missed == nil {
		rec.Missed = []string{}
	}
	if rec.Unpredicted == nil {
		rec.Unpredicted = []string{}
	}
	raw, err := json.Marshal(rec)
	if err != nil {
		return err
	}
	f, err := os.OpenFile(filepath.Join(storeDir(repo), "accuracy.jsonl"),
		os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0o644)
	if err != nil {
		return err
	}
	defer f.Close()
	_, err = f.Write(append(raw, '\n'))
	return err
}
