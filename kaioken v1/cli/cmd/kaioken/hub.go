package main

import (
	"context"
	"fmt"
	"os"
	"strings"

	"kaioken/internal/hub"
	"kaioken/internal/status"
)

const hubUsage = `usage: kaioken hub <subcommand>

  list              list registered repositories (default)
  add [path]        add a repository to the hub (default: current directory)
  remove <name>     remove a repository by name or path
  status            show freshness of every registered repo (exit 1 if any stale)
`

// cmdHub manages the cross-repo registry stored in ~/.kaioken/hub.yaml.
func cmdHub(ctx context.Context, f flags) error {
	sub := ""
	if len(f.positionals) > 0 {
		sub = strings.ToLower(f.positionals[0])
	}

	switch sub {
	case "", "list", "ls":
		return hubList()
	case "add":
		path := f.repo // -repo flag is the natural "target" for add
		if len(f.positionals) > 1 {
			path = f.positionals[1]
		}
		return hubAdd(path)
	case "remove", "rm":
		if len(f.positionals) < 2 {
			return fmt.Errorf("usage: kaioken hub remove <name>")
		}
		return hubRemove(f.positionals[1])
	case "status":
		return hubStatus()
	default:
		fmt.Fprint(os.Stderr, hubUsage)
		return fmt.Errorf("unknown hub subcommand %q", sub)
	}
}

func hubList() error {
	h, err := hub.Load()
	if err != nil {
		return err
	}
	fmt.Print(h.FormatTable())
	return nil
}

func hubAdd(path string) error {
	h, err := hub.Load()
	if err != nil {
		return err
	}
	if err := h.Add(path); err != nil {
		return err
	}
	if err := h.Save(); err != nil {
		return err
	}
	// Find the entry we just added to print its name.
	entry, ok := h.Find(path)
	if ok {
		fmt.Printf("  ✓ added %s (%s)\n", entry.Name, entry.Path)
	}
	return nil
}

func hubRemove(nameOrPath string) error {
	h, err := hub.Load()
	if err != nil {
		return err
	}
	entry, ok := h.Find(nameOrPath)
	if !ok {
		return fmt.Errorf("hub remove: %q not registered", nameOrPath)
	}
	if err := h.Remove(nameOrPath); err != nil {
		return err
	}
	if err := h.Save(); err != nil {
		return err
	}
	fmt.Printf("  ✓ removed %s\n", entry.Name)
	return nil
}

// hubStatus prints the freshness of every registered repository and exits 1
// when any is stale, making it suitable as a CI gate.
func hubStatus() error {
	h, err := hub.Load()
	if err != nil {
		return err
	}
	if len(h.Repos) == 0 {
		fmt.Println("no repos registered")
		return nil
	}

	anyStale := false
	for _, r := range h.Repos {
		rep, rerr := status.Assess(r.Path)
		if rerr != nil {
			fmt.Printf("  ✗ %-20s error: %v\n", r.Name, rerr)
			anyStale = true
			continue
		}
		if rep.Stale() {
			stale := rep.StaleModules()
			if rep.WikiBehind {
				stale = append(stale, "wiki")
			}
			fmt.Printf("  · %-20s stale (%s)\n", r.Name, strings.Join(stale, ", "))
			anyStale = true
		} else {
			fmt.Printf("  ✓ %-20s fresh\n", r.Name)
		}
	}

	if anyStale {
		return errStale // reuse the same exit-1 sentinel as `status -check`
	}
	return nil
}
