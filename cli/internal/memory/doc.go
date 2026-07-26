// Package memory implements Kaioken's experience loop: the agent's persistent
// notes about a repo, recall of past sessions, and the distillation of a
// session's lessons into skills that patch — rather than replace — the
// generated set.
//
// Kaioken's skills are derived from static analysis of the repository, never
// from what happened while working in it. This package closes that gap. The
// design has five pieces, each shippable on its own:
//
//  1. Project + user memory — `.kaioken/MEMORY.md` (committed, team-shared) and
//     `~/.kaioken/USER.md` (personal). A hard token cap forces merge or evict,
//     not append. The `remember` tool writes it; the "memory" context source
//     injects it into the system prompt.
//  2. Session digests — at session close, a short summary (goal, files touched,
//     outcome, gotchas) is written next to the transcript. The `recall` tool
//     scans digests cheaply, with no index and no new dependencies.
//  3. Distillation gate — local heuristics computed from the transcript with no
//     LLM decide whether a session is worth a model call. The strongest signal
//     is error recovery: a failed run_command followed by a passing one.
//  4. Patch over rewrite — a lesson usually edits an existing skill, not a new
//     file. Matched against existing descriptions, provenance (Origin, Sources,
//     Sessions) records where a lesson came from so it can be reverted.
//  5. Reinforcement / decay — a skill opened to a clean outcome is reinforced;
//     one never opened in N sessions is flagged for pruning. The catalog is
//     relevance-ranked by UseCount so the prompt budget favors proven skills.
//
// The loop lives here, not in the TUI, because both the TUI and the daemon
// need it. The two defenses against self-poisoning are that learned skills cite
// Sources (so they expire on git diff) and that every memory write is a
// reviewable git diff. Memory writes derive from the agent's conclusions about
// its own actions, never verbatim from tool output — that is what stops a
// prompt-injected README from becoming a permanent instruction.
//
// See DESIGN.md in this directory for the full rationale.
package memory
