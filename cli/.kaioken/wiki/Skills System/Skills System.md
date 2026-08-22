# Skills System

The Skills System in kaioken manages task guides (skills) that enable the agent to perform specific coding tasks. Skills are repository-specific, procedural documents stored in `.kaioken/skills/` that teach the agent *how* to accomplish recurring tasks (like adding an API endpoint or running tests) by detailing the exact files, functions, and conventions to follow. Unlike the wiki (which describes *what* the codebase contains), skills focus on *how to do* things within the project's unique context.

Skills are generated in two primary ways:
1. **Initial generation** via `kaioken skills` (or `/skills` in TUI), which analyzes the repository to propose and write a full set of skills
2. **Incremental refresh** via `kaioken update` (or `/update` in TUI), which regenerates only skills affected by file changes

Each skill follows the [Agent Skills format](https://github.com/agent-labs/agent-skills): a `SKILL.md` file with YAML frontmatter containing metadata (name, description, sources, generation timestamp, model used, origin, usage count, last used timestamp, and reinforcing sessions) and a markdown body with procedural guidance.

Skills are consumed by the agent during chat sessions: when the agent determines a skill is relevant to the user's request (based on description matching), it loads the skill to provide task-specific context for the LLM.

## Table of Contents
- [Overview](#overview)
- [Skill Structure](#skill-structure)
- [Skill Generation](#skill-generation)
- [Skill Refreshing](#skill-refreshing)
- [Skill Loading and Listing](#skill-loading-and-listing)
- [Skill Index](#skill-index)
- [Data Flow Diagrams](#data-flow-diagrams)
- [Referenced Files](#referenced-files)

## Overview

Skills are generated in two primary ways:
1. **Initial generation** via `kaioken skills` (or `/skills` in TUI), which analyzes the repository to propose and write a full set of skills
2. **Incremental refresh** via `kaioken update` (or `/update` in TUI), which regenerates only skills affected by file changes

Each skill follows the [Agent Skills format](https://github.com/agent-labs/agent-skills): a `SKILL.md` file with YAML frontmatter containing metadata (name, description, sources, generation timestamp, model used, origin, usage count, last used timestamp, and reinforcing sessions) and a markdown body with procedural guidance.

Skills are consumed by the agent during chat sessions: when the agent determines a skill is relevant to the user's request (based on description matching), it loads the skill to provide task-specific context for the LLM.

## Skill Structure

The `Skill` struct defines the schema for all skills:

```
internal/skills/skills.go:29-60
```

```go
// Skill is one generated capability document.
type Skill struct {
	// Name is a kebab-case identifier, also the directory name.
	Name string `yaml:"name"`
	// Description says what the skill covers and when to load it. Agent
	// runtimes match against this, so it carries the triggering weight.
	Description string `yaml:"description"`
	// Sources are the repo-relative files this skill was written from. They
	// drive incremental refresh: when one changes, the skill is stale.
	Sources     []string  `yaml:"sources,omitempty"`
	GeneratedAt time.Time `yaml:"generated_at,omitempty"`
	Model       string    `yaml:"model,omitempty"`

	// Origin records how this skill came to exist. A generated skill is
	// written from static analysis; a learned one is distilled from a session
	// that actually did the task; a human one was dropped in by hand. The
	// distinction is what lets a reviewer tell a hard-won lesson from a guess.
	Origin string `yaml:"origin,omitempty"`
	// UseCount is how many sessions opened this skill and followed it to a
	// clean outcome. It is the reinforcement signal: a loaded skill that
	// worked is more likely to be the right answer next time.
	UseCount int `yaml:"use_count,omitempty

<!-- kaioken:files internal/skills/skills.go,internal/skills/generate.go,internal/skills/skills_test.go -->
