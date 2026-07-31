package main

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"kaioken/internal/config"
	"kaioken/internal/impact"
	"kaioken/internal/scan"
)

// cmdImpact runs the refactoring impact predictor headless: describe the
// change as the positional argument and get the predicted blast radius —
// symbols, files, modules, wiki docs, skills and tests. Advisory by design:
// the exit code stays zero so it can sit in any script without gating it.
func cmdImpact(ctx context.Context, f flags) error {
	cfg, err := config.Load(f.repo)
	if err != nil {
		return err
	}
	client, err := newClient(cfg, f)
	if err != nil {
		return err
	}

	// The shared flag parser does not know -format, so it arrives among the
	// positionals; everything that is not a flag pair is the intent.
	format := "markdown"
	var words []string
	for i := 0; i < len(f.positionals); i++ {
		switch f.positionals[i] {
		case "-format", "--format":
			if i+1 < len(f.positionals) {
				format = strings.ToLower(f.positionals[i+1])
				i++
			}
		default:
			words = append(words, f.positionals[i])
		}
	}
	intent := strings.TrimSpace(strings.Join(words, " "))
	if intent == "" {
		return fmt.Errorf(`describe the change, e.g. kaioken impact "rename parseArgs to parseCLIArgs"`)
	}

	quiet := format == "json"
	pg := impact.Progress{}
	if !quiet {
		pg.Info = func(t string) { fmt.Println("  " + t) }
		fmt.Printf("predicting impact in %s with %s …\n", f.repo, client.Model)
	}

	res, err := scan.Repo(f.repo, cfg)
	if err != nil {
		return err
	}
	rep, err := impact.Run(ctx, f.repo, cfg, client, res, intent, pg)
	if err != nil {
		return err
	}

	var out string
	if format == "json" {
		out, err = rep.JSON()
		if err != nil {
			return err
		}
	} else {
		out = rep.Markdown()
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

	if !quiet && rep.SavedPath != "" {
		fmt.Printf("report saved: %s\n", rep.SavedPath)
	}
	return nil
}
