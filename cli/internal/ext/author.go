package ext

import (
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"
	"time"

	"kaioken/internal/skills"
	"kaioken/internal/version"
)

// Author-side tooling: what an extension developer runs before publishing.
// ValidateDir is the same check the template repository's CI runs, and
// InstallDev is the fast dev loop — install straight from a working tree,
// no release required.

// ValidationReport is what ValidateDir found in an extension directory.
type ValidationReport struct {
	Manifest *Manifest
	Skills   []ContributedSkill
	// Warnings are things a publishable extension should fix but that do
	// not block installation.
	Warnings []string
}

// ValidateDir checks an extension working tree the way an install would,
// plus author-facing lint: hard errors come back as error, softer problems
// as report warnings.
func ValidateDir(path string) (*ValidationReport, error) {
	abs, err := filepath.Abs(path)
	if err != nil {
		return nil, err
	}
	man, err := LoadManifest(abs)
	if err != nil {
		return nil, err
	}
	rep := &ValidationReport{Manifest: man}
	if err := minVersionSatisfied(version.Version, man.MinKaiokenVersion); err != nil {
		rep.Warnings = append(rep.Warnings, fmt.Sprintf("this host could not install it: %v", err))
	}

	// Payload checks per tier: the file the manifest points at must exist.
	switch man.Type {
	case TypeWasm:
		if _, err := os.Stat(filepath.Join(abs, filepath.FromSlash(man.Wasm.Entry))); err != nil {
			rep.Warnings = append(rep.Warnings, fmt.Sprintf("wasm.entry %q does not exist — build it before publishing", man.Wasm.Entry))
		}
	case TypeMCP:
		cmd := man.MCP.Command
		if strings.ContainsAny(cmd, `/\`) && !filepath.IsAbs(cmd) {
			if _, err := os.Stat(filepath.Join(abs, filepath.FromSlash(cmd))); err != nil {
				rep.Warnings = append(rep.Warnings, fmt.Sprintf("mcp.command %q does not exist in the package", cmd))
			}
		}
	}

	// Skill lint: skillsIn silently skips broken skills at load time, which
	// is right for the host and wrong for the author — surface them here.
	if entries, err := os.ReadDir(filepath.Join(abs, "skills")); err == nil {
		for _, e := range entries {
			if !e.IsDir() {
				continue
			}
			raw, err := os.ReadFile(filepath.Join(abs, "skills", e.Name(), "SKILL.md"))
			if err != nil {
				rep.Warnings = append(rep.Warnings, fmt.Sprintf("skills/%s has no SKILL.md", e.Name()))
				continue
			}
			s, err := skills.Parse(string(raw))
			if err != nil {
				rep.Warnings = append(rep.Warnings, fmt.Sprintf("skills/%s/SKILL.md does not parse: %v", e.Name(), err))
				continue
			}
			if strings.TrimSpace(s.Description) == "" {
				rep.Warnings = append(rep.Warnings, fmt.Sprintf("skills/%s/SKILL.md has no description — the agent matches on it", e.Name()))
			}
		}
	}
	rep.Skills = skillsIn(abs, man.ID)
	if man.Type == "" || man.Type == TypeDeclarative {
		if len(rep.Skills) == 0 {
			rep.Warnings = append(rep.Warnings, "declarative extension contributes no skills — it would install and do nothing")
		}
	}
	return rep, nil
}

// devRepo marks a lock entry as a local development install. It is what
// makes Update skip the entry instead of asking GitHub about it.
const devRepo = "local"

// InstallDev installs an extension straight from a local working tree —
// the author's dev loop. The tree is copied (not linked), so editing the
// source and re-running dev is the refresh; nothing is hashed or pinned
// because nothing was downloaded. Trust semantics are identical to a real
// install: executable tiers land untrusted.
func InstallDev(path string) (*InstallResult, error) {
	rep, err := ValidateDir(path)
	if err != nil {
		return nil, err
	}
	man := rep.Manifest
	abs, err := filepath.Abs(path)
	if err != nil {
		return nil, err
	}

	lock, err := LoadLock()
	if err != nil {
		return nil, err
	}
	enabled, priorVersion := true, ""
	if prior := lock.Find(man.ID); prior != nil {
		enabled, priorVersion = prior.Enabled, prior.Version
	}

	dest := InstallDir(man.ID, man.Version)
	if err := os.RemoveAll(dest); err != nil {
		return nil, err
	}
	if err := copyTree(abs, dest); err != nil {
		return nil, err
	}

	entry := Installed{
		ID:          man.ID,
		Version:     man.Version,
		Repo:        devRepo,
		Tag:         "dev",
		InstalledAt: time.Now(),
		Enabled:     enabled,
	}
	lock.Upsert(entry)
	if err := lock.Save(); err != nil {
		return nil, err
	}
	if priorVersion != "" && priorVersion != man.Version {
		_ = os.RemoveAll(InstallDir(man.ID, priorVersion))
	}
	// A re-dev of the same version must not serve a stale compiled module.
	shutdownExtension(man.ID)

	return &InstallResult{
		Manifest:   man,
		Entry:      entry,
		Skills:     skillsIn(dest, man.ID),
		Warnings:   rep.Warnings,
		NeedsTrust: Executable(man.Type),
	}, nil
}

// copyTree copies an extension working tree, skipping VCS internals. Walk
// yields clean relative paths, so no traversal can be smuggled in.
func copyTree(src, dest string) error {
	return filepath.WalkDir(src, func(p string, d os.DirEntry, err error) error {
		if err != nil {
			return err
		}
		rel, err := filepath.Rel(src, p)
		if err != nil {
			return err
		}
		if rel == "." {
			return os.MkdirAll(dest, 0o755)
		}
		if d.IsDir() {
			if d.Name() == ".git" {
				return filepath.SkipDir
			}
			return os.MkdirAll(filepath.Join(dest, rel), 0o755)
		}
		in, err := os.Open(p)
		if err != nil {
			return err
		}
		defer in.Close()
		out, err := os.OpenFile(filepath.Join(dest, rel), os.O_CREATE|os.O_WRONLY|os.O_TRUNC, 0o644)
		if err != nil {
			return err
		}
		_, err = io.Copy(out, in)
		if cerr := out.Close(); err == nil {
			err = cerr
		}
		return err
	})
}
