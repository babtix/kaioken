package agent

import (
	"fmt"
	"strings"
)

// Mode selects how much of the repo the agent may touch during a run. It is
// a coarse permission preset: build is today's full-access behavior, plan and
// explore are read-only, and general keeps every tool but always asks first.
type Mode string

// The recognized agent modes.
const (
	// ModeBuild grants full access: write, edit, and run tools are all
	// available. This is the default and matches the historical behavior.
	ModeBuild Mode = "build"
	// ModePlan is read-only: the agent may inspect the repo and propose
	// changes as text, but write_file, edit_file, and run_command are
	// withheld entirely.
	ModePlan Mode = "plan"
	// ModeGeneral keeps the full toolset but forces an approval prompt for
	// every repo-changing action, even when auto-approve is on.
	ModeGeneral Mode = "general"
	// ModeExplore is read-only like plan, but oriented toward searching and
	// explaining the codebase rather than drafting changes.
	ModeExplore Mode = "explore"
)

// Permissions describes what a mode lets the agent do.
type Permissions struct {
	CanWrite      bool // write_file / edit_file are offered and executable
	CanRun        bool // run_command may be offered (still gated by AllowRun)
	ForceApproval bool // repo-changing actions always prompt, ignoring AutoApprove
}

// PermissionsFor maps a mode to its permission set. Unknown or empty modes
// are treated as build so that a zero-value Agent keeps today's behavior.
func PermissionsFor(m Mode) Permissions {
	switch m {
	case ModePlan, ModeExplore:
		return Permissions{CanWrite: false, CanRun: false, ForceApproval: false}
	case ModeGeneral:
		return Permissions{CanWrite: true, CanRun: true, ForceApproval: true}
	default: // build, "", or anything unrecognized
		return Permissions{CanWrite: true, CanRun: true, ForceApproval: false}
	}
}

// ParseMode converts user input into a Mode. Matching is case-insensitive
// and ignores surrounding whitespace; an empty string means the default,
// ModeBuild. Unknown values produce an error naming the valid modes.
func ParseMode(s string) (Mode, error) {
	switch Mode(strings.ToLower(strings.TrimSpace(s))) {
	case "":
		return ModeBuild, nil
	case ModeBuild:
		return ModeBuild, nil
	case ModePlan:
		return ModePlan, nil
	case ModeGeneral:
		return ModeGeneral, nil
	case ModeExplore:
		return ModeExplore, nil
	}
	return "", fmt.Errorf("unknown mode %q (valid modes: build, plan, general, explore)", s)
}

// PromptGuidance returns a mode-specific snippet appended to the system
// prompt, or "" for build so the default prompt stays byte-identical.
func (m Mode) PromptGuidance() string {
	switch m {
	case ModePlan:
		return "You are in plan mode: analyze the codebase and propose concrete changes, " +
			"but you cannot modify files or run commands. Present plans and diffs as text."
	case ModeGeneral:
		return "You are in general mode: every repo-changing action requires explicit user " +
			"approval, so be deliberate — explain what each change does before proposing it."
	case ModeExplore:
		return "You are in explore mode: focus on reading, searching, and explaining the " +
			"codebase. You cannot modify files or run commands."
	default:
		return ""
	}
}

// Valid reports whether m is one of the recognized modes.
func (m Mode) Valid() bool {
	switch m {
	case ModeBuild, ModePlan, ModeGeneral, ModeExplore:
		return true
	}
	return false
}

// AllModes lists the recognized modes in display order.
func AllModes() []Mode {
	return []Mode{ModeBuild, ModePlan, ModeGeneral, ModeExplore}
}
