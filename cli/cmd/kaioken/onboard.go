package main

import (
	"fmt"
	"os"
	"path/filepath"

	"kaioken/internal/config"
	"kaioken/internal/onboard"
)

// cmdOnboard writes ONBOARDING.md — the day-one guide assembled from the
// repo's generated knowledge. It refuses to clobber an existing guide unless
// -force is set: that file may carry human edits the machine should not own.
func cmdOnboard(f flags) error {
	cfg, err := config.Load(f.repo)
	if err != nil {
		return err
	}
	doc, err := onboard.Generate(f.repo, cfg)
	if err != nil {
		return err
	}
	out := filepath.Join(f.repo, "ONBOARDING.md")
	if _, err := os.Stat(out); err == nil && !f.force {
		return fmt.Errorf("%s already exists — pass -force to overwrite", out)
	}
	if err := os.WriteFile(out, []byte(doc), 0o644); err != nil {
		return err
	}
	fmt.Printf("  ✓ wrote %s\n", out)
	return nil
}
