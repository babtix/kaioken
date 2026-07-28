// Command validate checks community-extensions.json before a registry pull
// request merges. It belongs to the registry repository, not to the Kaioken
// build. Structural checks run offline; -deep additionally fetches each
// listed repository's latest release from GitHub and cross-checks its
// extension.yaml against the index entry, so a listing can never drift from
// what the extension actually declares.
package main

import (
	"flag"
	"fmt"
	"os"
)

func main() {
	deep := flag.Bool("deep", false, "also fetch each repo's latest release and cross-check its manifest")
	flag.Parse()

	entries, err := LoadIndex("community-extensions.json")
	if err != nil {
		fail("%v", err)
	}

	problems := CheckEntries(entries)
	if *deep {
		problems = append(problems, DeepCheck(entries, DeepConfig{Token: os.Getenv("GITHUB_TOKEN")})...)
	}

	for _, p := range problems {
		fmt.Printf("✗ %s\n", p)
	}
	if len(problems) > 0 {
		fail("%d problem(s) in %d entries", len(problems), len(entries))
	}
	fmt.Printf("✓ %d entries valid\n", len(entries))
}

func fail(format string, args ...any) {
	fmt.Printf("✗ "+format+"\n", args...)
	os.Exit(1)
}
