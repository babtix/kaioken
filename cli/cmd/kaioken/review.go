package main

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"kaioken/internal/config"
	"kaioken/internal/review"
)

// cmdReview runs the grounded code reviewer. The exit code is the CI contract:
// non-zero when the review found a blocker, so a pipeline step can gate on it
// without parsing the output.
func cmdReview(ctx context.Context, f flags) error {
	cfg, err := config.Load(f.repo)
	if err != nil {
		return err
	}
	client, err := newClient(cfg, f)
	if err != nil {
		return err
	}

	format := "markdown"
	var severity review.Severity
	var only []string
	failOnFindings := false

	// The shared flag parser does not know these, so they arrive as
	// positionals; reading them here keeps the global flag struct from growing
	// a field per command.
	for i, p := range f.positionals {
		switch p {
		case "-format", "--format":
			if i+1 < len(f.positionals) {
				format = strings.ToLower(f.positionals[i+1])
			}
		case "-severity", "--severity":
			if i+1 < len(f.positionals) {
				severity = review.Severity(strings.ToLower(f.positionals[i+1]))
			}
		case "-only", "--only":
			if i+1 < len(f.positionals) {
				only = splitComma(f.positionals[i+1])
			}
		case "-fail-on-findings", "--fail-on-findings":
			failOnFindings = true
		}
	}

	quiet := format == "json" || format == "sarif"
	pg := review.Progress{}
	if !quiet {
		pg.Stage = func(s string) { fmt.Println("  → " + s) }
		pg.Detail = func(s string) { fmt.Println("    " + s) }
		base := f.base
		if base == "" {
			base = "HEAD"
		}
		fmt.Printf("reviewing %s against %s with %s …\n", f.repo, base, client.Model)
	}

	rep, err := review.Run(ctx, f.repo, cfg, client, review.Options{
		Base:     f.base,
		Only:     only,
		Severity: severity,
	}, pg)
	if err != nil {
		return err
	}

	var out string
	switch format {
	case "json":
		out, err = rep.JSON()
	case "sarif":
		out, err = rep.SARIF()
	default:
		out = rep.Markdown()
	}
	if err != nil {
		return err
	}

	if f.out != "" {
		path := f.out
		if !filepath.IsAbs(path) {
			path = filepath.Join(f.repo, path)
		}
		if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
			return err
		}
		if err := os.WriteFile(path, []byte(out), 0o644); err != nil {
			return err
		}
		if !quiet {
			fmt.Printf("\nwrote %s\n", path)
		}
	} else {
		if !quiet {
			fmt.Println()
		}
		fmt.Println(out)
	}

	if !quiet {
		fmt.Printf("\n%s (%s)\n", rep.Verdict, rep.Elapsed.Round(1e6))
	}

	// A blocker always fails; -fail-on-findings widens that to anything at all,
	// for a team that wants the review advisory-free.
	if rep.HasBlockers() || (failOnFindings && len(rep.Findings) > 0) {
		os.Exit(1)
	}
	return nil
}
