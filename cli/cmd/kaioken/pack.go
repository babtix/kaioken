package main

import (
	"fmt"

	"kaioken/internal/pack"
)

// cmdPack moves a repository's generated knowledge between machines. Bare
// `kaioken pack` bundles .kaioken/ into a single .tar.gz; `kaioken pack
// -extract <file>` unpacks one into the target repo. The archive carries the
// wiki, cards, skills and search state — everything except private session
// history — so an offline machine can `kaioken serve` without ever calling an
// LLM.
func cmdPack(f flags) error {
	if f.extract != "" {
		if err := pack.Extract(f.extract, f.repo); err != nil {
			return err
		}
		fmt.Printf("  ✓ extracted %s into %s/.kaioken\n", f.extract, f.repo)
		return nil
	}
	out, err := pack.Create(f.repo, f.out)
	if err != nil {
		return err
	}
	fmt.Printf("  ✓ packed knowledge → %s\n", out)
	return nil
}
