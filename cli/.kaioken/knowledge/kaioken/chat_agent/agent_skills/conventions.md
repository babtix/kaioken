Skill names must be normalized to kebab-case using the Slug function (e.g., "Add a TUI Command" becomes "add-a-tui-command").
Each skill must be saved in a directory named after its slug under .kaioken/skills/ with the file SKILL.md.
The Sources field in a skill's frontmatter must list the repo-relative files or directories used to generate it, enabling staleness-based refreshes.
When generating skills, individual failures are logged but do not abort the generation of other skills.
The skills index (.kaioken/skills/README.md) and the repository's AGENTS.md file (if present) must be updated after skill generation or refresh.
A skill's frontmatter must include YAML fields for name, description, sources, generated_at, model, origin, use_count, last_used, and sessions (though some are optional and inferred if missing).
