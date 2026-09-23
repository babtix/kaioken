# Task 10: Improve `@kaioken/skills`

## Target Package
`kaioken/skills`

## Files to Inspect & Modify
- [kaioken/skills/src/skills.ts](file:///d:/project/ai_now_know/kaioken_kaiopi/kaioken/skills/src/skills.ts)
- [kaioken/skills/src/load.ts](file:///d:/project/ai_now_know/kaioken_kaiopi/kaioken/skills/src/load.ts)
- [kaioken/skills/test/skills.test.ts](file:///d:/project/ai_now_know/kaioken_kaiopi/kaioken/skills/test/skills.test.ts)

---

## Problem Description

1. **Duplicate Skill Shadowing**:
   In `skills.ts` (lines 73–79):
   ```ts
   for (const skill of skills) {
       if (seen.has(skill.name)) {
           problems.push({ path: skill.path, reason: `duplicate skill name "${skill.name}"` });
       }
       seen.add(skill.name);
   }
   ```
   When two skills have the same name, an error is recorded in `problems`, but *both* skills are kept in the returned `skills` array. When `loadSkill(name)` is called, it blindly returns the first match, silently shadowing the second without warning the caller.
   - *Fix needed*: Explicitly resolve or omit shadowed skills, or return an error/warning when requesting a skill that has collisions.

2. **Single Search Directory Restriction**:
   `skillsDir()` only points to `join(root, ".kaioken", "skills")`.
   However, modern coding agents store skills in several standard locations:
   - `.agents/skills/`
   - `.pi/skills/`
   - `.github/skills/`
   None of these are discovered or read by `@kaioken/skills`.
   - *Fix needed*: Allow configuring skill search paths or fallback to standard agent skill roots (`.agents/skills`, `.pi/skills`).

3. **Frontmatter Schema Validation**:
   `parseSkill` only checks that YAML is parsable and that `name` exists. It does not validate fields like `description`, `parameters`, or `triggers`.
   - *Fix needed*: Enforce a clear schema with helpful error reporting when a skill's frontmatter lacks required fields.

---

## Verification & Acceptance Criteria
- Run `npm test -w kaioken/skills` and ensure all tests pass.
- Add test verifying handling of duplicate skill names.
- Add test verifying that skills can be loaded from configurable directories.
