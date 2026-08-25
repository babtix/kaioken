---
name: add-a-skill
description: Create a new skill file in the .kaioken/skills/ directory. Load this skill when you want to teach the agent a new task by defining a skill guide.
sources:
    - internal/skills/skills_test.go
generated_at: 2026-07-26T04:10:31.1007403Z
model: nvidia/nemotron-3-super-120b-a12b
---

# Add-a-skill

Create a new skill guide in .kaioken/skills/ with proper YAML frontmatter and body following the existing skill format. Use when teaching the agent a new task.

## Prerequisites
None.

## Steps
1. Choose a concise skill title (e.g., "Add a TUI command") and compute its slug using the `Slug` function from `internal/skills/skills.go`.  
   Example: `slug := skills.Slug("Add a TUI command")` yields `"add-a-tui-command"`.

2. Create the directory for the skill:  
   ```sh
   mkdir -p .kaioken/skills/<slug>
   ```
   Replace `<slug>` with the computed slug.

3. Inside that directory, create `SKILL.md`. Start by copying the frontmatter pattern from an existing skill (see example below) and replace the fields:
   ```yaml
   ---
   name: <slug>
   description: "<one or two sentences>"
   sources:
   - <path/to/source1.go>
   - <path/to/source2.go>
   generatedAt: <timestamp in RFC3339 format, e.g., 2024-01-02T15:04:05Z>
   model: "<llm model used, e.g., \"openrouter/gpt-4o\">"
   ---
   ```
   The `generatedAt` can be generated with `time.Now().UTC().Truncate(time.Second).Format(time.RFC3339)`.

4. After the closing `---`, write the skill body using the standard sections:
   - `# <Skill Title>`
   - A short description paragraph.
   - Optional `## Prerequisites` if needed.
   - `## Steps` with a numbered list referencing real files and functions (e.g., `internal/skills/skills.go:Save`).
   - `## Conventions to follow` with any local rules.
   - `## Verification` with the command to test the skill (e.g., `go test ./internal/skills`).
   - `## Common mistakes` with pitfalls observed in this repository.

5. (Optional) Verify the new skill can be loaded by running:
   ```sh
   go test ./internal/skills -run TestSaveLoadList
   ```
   or by using the `kaioken skills list` command to see it appear.

## Conventions to follow
- Use lowercase kebab-case for the skill directory name (the slug).
- Keep the `sources` list limited to files that are actually referenced in the steps; if none, use an empty slice `[]`.
- The `description` should be a single sentence or two, summarizing when to use the skill.
- In the `Steps` section, always cite real file paths and function names from this repository; when copying a pattern, include a short verbatim excerpt and its path.
- Do not invent functions, files, or commands; everything must be verifiable in the provided sources.
- The `model` field can be left empty or set to the model used to generate the skill; if unknown, use an empty string.

## Verification
- Run `go test ./internal/skills` to ensure the skill parsing and saving logic still works.
- Start kaioken, load the skill via `/skills` palette or `kaioken skills list`, and confirm the new skill appears with the correct name.
- Use the skill in a chat session (`/load <slug>`) and verify the agent can follow its steps without errors.

## Common mistakes
- Forgetting to create the subdirectory under `.kaioken/skills/` and placing `SKILL.md` directly in the skills root, which causes the skill to be omitted from listings.
- Using title case or spaces in the directory name; the agent expects the slug format (lowercase, hyphenated).
- Omitting the frontmatter or using incorrect YAML indentation, leading to parse errors when the skill is loaded.
- Listing source files that do not exist or are misspelled; the `Stale` function relies on accurate paths to detect when a skill needs regeneration.
- Using a non‑RFC3339 timestamp in `generatedAt`; the `Parse` function expects a time that can be parsed by `time.Parse(time.RFC3339, ...)`.