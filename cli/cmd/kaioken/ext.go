package main

import (
	"bufio"
	"context"
	"fmt"
	"os"
	"strings"

	"kaioken/internal/ext"
)

const extUsage = `usage: kaioken ext <subcommand>

  install <owner/repo[@version]>   install an extension from its GitHub release
  dev <path>                       install from a local directory (author dev loop)
  validate [path]                  lint an extension working tree before publishing
  remove <id>                      uninstall an extension
  list                             show installed extensions (the default)
  update [id]                      update every extension (or one) to the latest release
  search [term]                    browse the community registry
  enable <id> | disable <id>       toggle an installed extension
  trust <id>                       allow an mcp/wasm extension to run (-force skips the prompt)
  untrust <id>                     revoke that permission and stop it
  tools <id>                       list an extension's tools (-force re-queries the plugin)

browse the catalog on the web: https://extensions.kaioken.dev
registry override: set ext_registry in ~/.kaioken/config.yaml (any URL serving
the community-extensions.json shape, e.g. a company-internal index)
`

// cmdExt manages community extensions: declarative packages installed from
// GitHub releases into ~/.kaioken/extensions. See internal/ext.
func cmdExt(ctx context.Context, f flags) error {
	sub, arg := "", ""
	if len(f.positionals) > 0 {
		sub = strings.ToLower(f.positionals[0])
	}
	if len(f.positionals) > 1 {
		arg = f.positionals[1]
	}

	switch sub {
	case "", "list", "ls":
		return extList()
	case "install", "add":
		if arg == "" {
			return fmt.Errorf("usage: kaioken ext install <owner/repo[@version]>")
		}
		return extInstall(ctx, arg)
	case "dev":
		if arg == "" {
			return fmt.Errorf("usage: kaioken ext dev <path>")
		}
		return extDev(arg)
	case "validate", "lint":
		if arg == "" {
			arg = "."
		}
		return extValidate(arg)
	case "remove", "uninstall", "rm":
		if arg == "" {
			return fmt.Errorf("usage: kaioken ext remove <id>")
		}
		if err := ext.Remove(arg); err != nil {
			return err
		}
		fmt.Printf("  ✓ removed %s\n", arg)
		return nil
	case "update":
		return extUpdate(ctx, arg)
	case "search":
		return extSearch(ctx, arg)
	case "enable", "disable":
		if arg == "" {
			return fmt.Errorf("usage: kaioken ext %s <id>", sub)
		}
		if err := ext.SetEnabled(arg, sub == "enable"); err != nil {
			return err
		}
		fmt.Printf("  ✓ %s %sd\n", arg, sub)
		return nil
	case "trust":
		if arg == "" {
			return fmt.Errorf("usage: kaioken ext trust <id>")
		}
		return extTrust(ctx, arg, f.force)
	case "untrust":
		if arg == "" {
			return fmt.Errorf("usage: kaioken ext untrust <id>")
		}
		if err := ext.Untrust(arg); err != nil {
			return err
		}
		fmt.Printf("  ✓ %s untrusted — its server will not run again until you re-trust it\n", arg)
		return nil
	case "tools":
		if arg == "" {
			return fmt.Errorf("usage: kaioken ext tools <id>")
		}
		return extTools(ctx, arg, f.force)
	default:
		return fmt.Errorf("unknown ext subcommand %q\n\n%s", sub, extUsage)
	}
}

func extList() error {
	lock, err := ext.LoadLock()
	if err != nil {
		return err
	}
	if len(lock.Extensions) == 0 {
		fmt.Println("no extensions installed")
		fmt.Println("  kaioken ext search           browse the community registry")
		fmt.Println("  kaioken ext install o/r      install straight from a GitHub repo")
		return nil
	}
	for _, e := range lock.Extensions {
		state := "enabled"
		if !e.Enabled {
			state = "disabled"
		}
		trust := "-"
		if man, _, err := ext.InstalledManifest(e.ID); err == nil && ext.Executable(man.Type) {
			if e.Trusted() {
				trust = "trusted"
			} else {
				trust = "UNTRUSTED"
			}
		}
		fmt.Printf("  %-32s %-10s %-28s %-9s %s\n", e.ID, e.Version, e.Repo, state, trust)
	}
	fmt.Printf("%d extension(s) in %s\n", len(lock.Extensions), ext.Root())
	return nil
}

func extInstall(ctx context.Context, source string) error {
	fmt.Printf("installing %s …\n", source)
	res, err := ext.Install(ctx, source)
	if err != nil {
		return err
	}
	for _, w := range res.Warnings {
		fmt.Printf("  ! %s\n", w)
	}
	fmt.Printf("  ✓ %s %s  (%s, release %s)\n", res.Entry.ID, res.Entry.Version, res.Entry.Repo, res.Entry.Tag)
	for _, s := range res.Skills {
		fmt.Printf("    + skill %s — %s\n", s.Name, s.Description)
	}
	if len(res.Skills) == 0 {
		fmt.Println("    (no skills contributed)")
	}
	if res.NeedsTrust {
		switch res.Manifest.Type {
		case ext.TypeWasm:
			fmt.Println("\n  ! this is a wasm extension: it ships sandboxed plugin code")
			fmt.Printf("    module: %s   permissions: %s\n", res.Manifest.Wasm.Entry, permissionLine(res.Manifest))
		default:
			fmt.Println("\n  ! this is an mcp extension: it declares a server that would run UNSANDBOXED")
			fmt.Printf("    command: %s\n", commandLine(res.Manifest))
		}
		fmt.Printf("    it stays inert until you run `kaioken ext trust %s`\n", res.Entry.ID)
	}
	return nil
}

// commandLine renders an mcp manifest's launch invocation for display — the
// exact thing trusting would allow to run.
func commandLine(man *ext.Manifest) string {
	if man == nil || man.MCP == nil {
		return "(none)"
	}
	parts := append([]string{man.MCP.Command}, man.MCP.Args...)
	line := strings.Join(parts, " ")
	if len(man.MCP.Env) > 0 {
		var envs []string
		for k, v := range man.MCP.Env {
			envs = append(envs, k+"="+v)
		}
		line += "   (env: " + strings.Join(envs, " ") + ")"
	}
	return line
}

// permissionLine renders a wasm manifest's capability grants for display.
func permissionLine(man *ext.Manifest) string {
	if len(man.Permissions) == 0 {
		return "none — fully isolated"
	}
	return strings.Join(man.Permissions, ", ")
}

// extTrust shows exactly what would run, asks, and only then grants trust —
// which runs the plugin once to record its tool catalog.
func extTrust(ctx context.Context, id string, force bool) error {
	man, entry, err := ext.InstalledManifest(id)
	if err != nil {
		return err
	}
	if !ext.Executable(man.Type) {
		return fmt.Errorf("%s is a declarative extension — it runs no code and needs no trust", id)
	}
	if entry.Trusted() {
		fmt.Printf("%s %s is already trusted\n", id, entry.Version)
		return nil
	}

	switch man.Type {
	case ext.TypeWasm:
		fmt.Printf("%s %s wants to run a SANDBOXED wasm plugin:\n", id, entry.Version)
		fmt.Printf("\n    module:      %s\n    permissions: %s\n\n", man.Wasm.Entry, permissionLine(man))
		fmt.Println("The sandbox gives it no network, no environment, and no filesystem")
		fmt.Println("beyond the permissions listed (fs:read:workspace mounts your repo")
		fmt.Println("read-only). Memory is capped. Trust applies to this exact version;")
		fmt.Println("updates revoke it.")
	default:
		fmt.Printf("%s %s wants to run an MCP server on your machine, UNSANDBOXED:\n", id, entry.Version)
		fmt.Printf("\n    %s\n\n", commandLine(man))
		fmt.Println("Kaioken cannot restrict what this process does. Trust it only if you")
		fmt.Println("trust its author. Trust applies to this exact version; updates revoke it.")
	}
	if !force {
		fmt.Print("\nTrust and run it now? [y/N]: ")
		line, _ := bufio.NewReader(os.Stdin).ReadString('\n')
		switch strings.ToLower(strings.TrimSpace(line)) {
		case "y", "yes":
		default:
			fmt.Println("not trusted — nothing was run")
			return nil
		}
	}

	tools, err := ext.Trust(ctx, id)
	if err != nil {
		return err
	}
	fmt.Printf("  ✓ %s %s trusted — %d tool(s) now available to the agent (each call still needs approval)\n",
		id, entry.Version, len(tools))
	printExtTools(tools)
	return nil
}

func extTools(ctx context.Context, id string, refresh bool) error {
	var tools []ext.Tool
	var err error
	if refresh {
		tools, err = ext.RefreshTools(ctx, id)
	} else {
		tools, err = ext.CachedTools(id)
	}
	if err != nil {
		return err
	}
	if len(tools) == 0 {
		fmt.Println("no tools recorded — trust the extension first, or -force to re-query the plugin")
		return nil
	}
	printExtTools(tools)
	return nil
}

func printExtTools(tools []ext.Tool) {
	for _, t := range tools {
		fmt.Printf("    %-40s %s\n", t.FullName, t.Description)
	}
}

func extUpdate(ctx context.Context, id string) error {
	var results []ext.UpdateResult
	var err error
	if id != "" {
		results, err = ext.Update(ctx, id)
	} else {
		results, err = ext.Update(ctx)
	}
	if err != nil {
		return err
	}
	if len(results) == 0 {
		fmt.Println("no extensions installed")
		return nil
	}
	for _, r := range results {
		switch {
		case r.Err != nil:
			fmt.Printf("  ✗ %s: %v\n", r.ID, r.Err)
		case r.Local:
			fmt.Printf("  · %s %s (local dev install — refresh with `kaioken ext dev`)\n", r.ID, r.From)
		case r.Updated:
			fmt.Printf("  ✓ %s %s → %s\n", r.ID, r.From, r.To)
		default:
			fmt.Printf("  · %s %s is current\n", r.ID, r.From)
		}
	}
	return nil
}

// extDev installs from a local working tree — the author's dev loop.
func extDev(path string) error {
	res, err := ext.InstallDev(path)
	if err != nil {
		return err
	}
	for _, w := range res.Warnings {
		fmt.Printf("  ! %s\n", w)
	}
	fmt.Printf("  ✓ %s %s installed from %s (dev)\n", res.Entry.ID, res.Entry.Version, path)
	for _, s := range res.Skills {
		fmt.Printf("    + skill %s — %s\n", s.Name, s.Description)
	}
	if res.NeedsTrust {
		fmt.Printf("    executable extension — trust it with `kaioken ext trust %s`\n", res.Entry.ID)
	}
	fmt.Println("  re-run `kaioken ext dev` after editing the source to refresh")
	return nil
}

// extValidate lints an extension working tree — the same check the template
// repository's CI runs before a release.
func extValidate(path string) error {
	rep, err := ext.ValidateDir(path)
	if err != nil {
		return err
	}
	man := rep.Manifest
	typ := man.Type
	if typ == "" {
		typ = ext.TypeDeclarative
	}
	fmt.Printf("  %s %s  (%s)\n", man.ID, man.Version, typ)
	if len(man.Permissions) > 0 {
		fmt.Printf("  permissions: %s\n", strings.Join(man.Permissions, ", "))
	}
	for _, s := range rep.Skills {
		fmt.Printf("    + skill %s — %s\n", s.Name, s.Description)
	}
	for _, w := range rep.Warnings {
		fmt.Printf("  ! %s\n", w)
	}
	if len(rep.Warnings) == 0 {
		fmt.Println("  ✓ valid — ready to publish")
	} else {
		fmt.Printf("  valid with %d warning(s)\n", len(rep.Warnings))
	}
	return nil
}

func extSearch(ctx context.Context, term string) error {
	entries, err := ext.Registry(ctx, false)
	if err != nil {
		return fmt.Errorf("%w\ndirect install still works: kaioken ext install <owner/repo>", err)
	}
	hits := ext.SearchRegistry(entries, term)
	if len(hits) == 0 {
		fmt.Println("no matching extensions in the registry")
		return nil
	}
	for _, e := range hits {
		fmt.Printf("  %-32s %-28s [%s] %s\n", e.ID, e.Repo, e.TierLabel(), e.Description)
	}
	fmt.Printf("%d result(s) — install with `kaioken ext install <owner/repo>`\n", len(hits))
	fmt.Println("browse the full catalog with READMEs and trust details at https://extensions.kaioken.dev")
	return nil
}
