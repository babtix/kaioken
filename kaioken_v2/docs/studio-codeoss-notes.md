# Kaioken Studio (Code-OSS) — Build Notes

The **second** Studio experiment: a fork of `microsoft/vscode` (Code-OSS), option B
from the tier list. The first, a fork of Eclipse Theia, still exists and still works —
see `studio-v0.1-build-notes.md`. Neither has been discarded.

Started 2026-09-01.

| | Theia build | Code-OSS build |
|---|---|---|
| Directory | `kaioken_studio_theia/` | `kaioken_studio/` |
| Upstream | `eclipse-theia/theia-ide` 1.75.0 | `microsoft/vscode` 1.135.0 |
| Config folder | `~/.kaioken-studio-theia` | `~/.kaioken-studio` |
| Node | 24.20.0 | 24.18.0 (pinned by `.nvmrc`) |
| Package manager | Yarn 1 classic | npm |
| Editor | Monaco | Monaco (same) |
| Extensions | Open VSX | Open VSX |

---

## 1. Why this one is different in kind

The pitch for option B was: *"the only option that is exactly VS Code, pixel for
pixel. But you own the rebase forever."* Both halves of that are already visible.

**The upside is real.** This is not a VS Code *lookalike*; it is VS Code. Every
affordance, every keybinding, every layout detail is the real thing because it is
literally the same source tree.

**The cost is also real and starts immediately.** Making Kaioken Dark the default
theme required *editing VS Code's own source*, not configuring it:
`src/vs/workbench/services/themes/common/workbenchThemeService.ts`. Theia exposed the
equivalent as a preference default in a JSON file we own. That difference —
configuration versus patching — is the whole rebase tax in miniature, on the very
first customisation.

**Every fork edit is tagged `// KAIOKEN:`** so the diff against upstream is greppable:

```bash
git diff upstream/main --stat        # everything we changed
grep -rn "KAIOKEN:" src/             # every deliberate source patch
```

Keep that list short. Each entry is a merge conflict waiting for the next rebase.

**Divergence baseline at setup (2026-09-01):**

```
product.json                                   | 37 +++++++-----
src/vs/workbench/services/themes/common/
  workbenchThemeService.ts                     |  3 +-
2 files changed, 23 insertions(+), 17 deletions(-)

untracked: extensions/kaioken-theme/, product.json.upstream.bak, studio-env.ps1
KAIOKEN-tagged source patches: 1
```

That is the number to watch. It is small now; it is small *because* nothing of Kaioken
is in here yet. Re-measure after the engine integration lands — that is when the real
answer to "is the rebase tax acceptable" arrives.

---

## 2. Fork setup

- Cloned `microsoft/vscode` (2.2 GB with full history — kept, because a fork that
  cannot rebase cleanly is not a fork).
- Checked out the **1.135.0 release tag** onto a branch named `kaioken`, rather than
  `main`. `main` was at 1.137.0 and is in-development; a fork should track releases.
- Remote renamed `origin` → `upstream`, matching the Theia clone's convention, so the
  real fork can claim `origin` later.
- `product.json.upstream.bak` holds the pristine file, for diffing.

---

## 3. Rebranding (all in `product.json`, no source patch needed)

| Key | Value |
|---|---|
| `nameShort` / `nameLong` | `Kaioken Studio` |
| `applicationName` | `kaioken-studio` |
| `dataFolderName` | `.kaioken-studio` |
| `serverApplicationName` | `kaioken-studio-server` |
| `urlProtocol` | `kaioken-studio` |
| `win32AppUserModelId` | `Kaioken.Studio` |
| `win32DirName` / `win32NameVersion` | `Kaioken Studio` |
| `win32MutexName` | `kaiokenstudio` |
| `win32ShellNameShort` | `K&aioken Studio` |
| `darwinBundleIdentifier` | `dev.kaioken.studio` |

Plus `sharedDataFolderName`, `tunnelApplicationName`, `linuxIconName` and the two tunnel
mutexes, which otherwise stay `vscode-oss` and would collide with a real VS Code install.

The Theia build's config folder was changed from `.kaioken-studio` to
`.kaioken-studio-theia` at the same time. Both apps had been pointed at the same
directory, which would have had two different IDEs writing each other's settings.

**Gotcha: in dev mode the data folder gets a `-dev` suffix.** `scripts/code.bat` sets
`VSCODE_DEV=1`, so the running app uses `~/.kaioken-studio-dev`, *not*
`~/.kaioken-studio`. Do not read the un-suffixed directory as evidence of anything: on
this machine `~/.kaioken-studio` is stale Theia state left over from before the Theia
build was moved to `.kaioken-studio-theia`, and it is safe to delete.

**The Electron binary is renamed from `nameShort`.** `code.bat` greps `nameShort` out of
`product.json` and launches `.build\electron\<nameShort>.exe`, so the process is
literally `Kaioken Studio.exe` and shows up under that name in Task Manager.

---

## 4. The marketplace tradeoff, made concrete

Code-OSS ships with **no `extensionsGallery` at all** — a bare Code-OSS build cannot
install extensions from anywhere. Microsoft's marketplace is not licensed for use by
forks, so the option that exists is Open VSX:

```json
"extensionsGallery": {
  "serviceUrl": "https://open-vsx.org/vscode/gallery",
  "itemUrl": "https://open-vsx.org/vscode/item",
  "resourceUrlTemplate": "https://open-vsx.org/vscode/asset/{publisher}/{name}/{version}/Microsoft.VisualStudio.Code.WebResources/{path}"
}
```

Practical consequence: no C#/Dev Kit, no Pylance, no Remote-SSH, no Live Share — those
are proprietary Microsoft extensions, absent from Open VSX by licence rather than by
oversight. The Theia build has exactly the same limitation, so this is not a point of
difference between the two options; it is a cost of *not being Microsoft*.

---

## 5. The theme

`extensions/kaioken-theme/` is a standard built-in theme extension, structured exactly
like `extensions/theme-abyss/`. It needs no entry in `build/npm/dirs.ts` — that file
lists only extensions that require `npm install`, and a theme has no dependencies.

The theme JSON is **generated from the Theia build's compiled theme**, not rewritten:

```bash
node -e "const {KAIOKEN_DARK}=require('.../kaioken-dark.js'); ..." # 200 colors, 23 token rules
```

Theia's theming and VS Code's use the same colour-theme format, so the two builds are
guaranteed pixel-identical in palette rather than merely similar. If the palette
changes, regenerate rather than hand-editing both.

---

## 6. Build result — verified

```
npm install       OK
npm run compile   Finished 'compile' after 1.67 min, 0 errors
scripts\code.bat  ->  process "Kaioken Studio", window "Welcome - Kaioken Studio Dev"
```

The Electron binary on disk is `.build\electron\Kaioken Studio.exe`.

**The theme is confirmed active, not merely shipped.** The workbench persists its
resolved theme into `%APPDATA%\code-oss-dev\User\globalStorage\state.vscdb`; that
database contains `Kaioken Dark` and `kaioken-theme`, and **zero** occurrences of
upstream's default `Dark 2026`. So the built-in theme extension was discovered, the
patched default constant resolved to it, and it is what the workbench renders.

**A third data location, and it is not branded:** in dev mode the *user data* directory
is `%APPDATA%\code-oss-dev`, derived from **`package.json`'s `name`** rather than
`product.json`. Three places to look, only two of them branded:

| Holds | Path |
|---|---|
| Extensions + `argv.json` | `~/.kaioken-studio-dev` (dataFolderName + `-dev`) |
| Shared storage | `~/.kaioken-studio-shared` (sharedDataFolderName) |
| Workbench state, settings | `%APPDATA%\code-oss-dev` (package.json `name`) |

---

## 7. The Kaioken chat agent — replacing GitHub Copilot Chat's role

2026-09-01: the open question above is answered. `extensions/kaioken-chat/` is a new
built-in extension registering a `@kaioken` chat participant, grounded in
`kaioken_v2`'s own knowledge tools (`symbol_lookup`, `wiki_search`, `impact`,
`skill_load`, `read_file`) rather than a generic model with no view of the repository.

**Out-of-process, not in-process — and deliberately different from the Theia build's
choice.** The Theia extension bridges to `kaioken_v2` (ESM) with a runtime `import()`
inside its own backend process, because that backend is plain Node. Code-OSS's
extension host is not: it runs under Electron's *bundled* Node, a third ABI on top of
the two already in play (`kaioken_studio`'s own `.nvmrc`-pinned 24.18.0 versus
`kaioken_v2`'s global 26.x, which is what its native tree-sitter build is compiled
against). Importing `@kaioken/*` in-process here would be importing native code built
for one Node into a process running a different one. Spawning `kaioken_v2` as its own
child process — using the system's own `node`, the same way `typescript-language-features`
talks to `tsserver` — sidesteps the question entirely: the native modules run in the
Node they were built for, and the extension itself needs no bundler or ESM-interop
trick at all.

**The wire protocol** is `kaioken agent-serve` (`kaioken_v2/apps/cli/src/commands/agent-serve.ts`),
a newline-delimited-JSON wrapper around `runChat` — the exact function the CLI's own
`kaioken chat` and the TUI's `chatBridge.ts` already drive. One process is kept alive
per workspace root (`extensions/kaioken-chat/src/agentProcess.ts`) so the `ChatSessionCache`
(loaded knowledge, resolved model, the agent session) survives across turns instead of
being rebuilt — and re-billed — every message. `runChat`'s own human-readable stdout
writes are suppressed with `json: true`; every byte on the child's stdout is a JSON
event line instead.

**v1 is read-only.** No `--write` tool calls are enabled from the chat participant yet,
so there is no file-change approval UI. The approve round-trip is already implemented
end to end in both `agent-serve.ts` (blocks on an `approve-reply` line) and
`agentProcess.ts` (the `approve` hook), unused only because `extension.ts` hardcodes
`write: false`. Wiring a confirmation UI (`vscode.window.showQuickPick`, or a
`ChatResponseConfirmationPart` if the proposed API is worth enabling for it) and
flipping that flag is the next step, not a redesign.

**IMPORTANT — a prior, larger rebrand already exists in this tree, and this extension
does not supersede it.** Before writing any of the above, an earlier (uncommitted)
effort had already rebranded GitHub Copilot into "Kaioken Agent" in place:

| What | State |
|---|---|
| `extensions/copilot/package.json` | `name: kaioken-agent-chat`, `publisher: Kaioken`, `displayName: Kaioken Agent` |
| `product.json` | zero `copilot` references; `chatExtensionId: "Kaioken.kaioken-agent-chat"` |
| `src/vs/**` | ~13 files patched (`chatEntitlementService`, `chatErrorMessages`, `copilotChatSessions.contribution`, `surveyQuestions`, onboarding, …) |

That work is **identity-level, not brain-level**. The extension directory is still
Copilot's source: 18 files under `extensions/copilot/src` still call
`api.github.com` / `copilot_internal`, and the running app still logs
`No token resolved for resource: https://api.github.com` and `Sign in to GitHub to use
the Cloud Agent`. So "Kaioken Agent" is GitHub Copilot wearing a Kaioken name — it
needs a GitHub sign-in and answers from Copilot's backend.

`extensions/kaioken-chat/` is the opposite trade: genuinely engine-backed, but thin
(one `panel`/`ask` participant, read-only). **It is deliberately NOT `isDefault`** —
the rebranded Kaioken Agent keeps all seven of its default-participant declarations
(ask/panel, edit/panel, editor, agent/panel, notebook ×2, terminal), because it is the
only one that covers edit/agent/notebook/terminal modes at all. The two coexist:
plain questions go to the full-featured Kaioken Agent, `@kaioken` reaches the
engine-backed one.

> Correction, recorded deliberately: those seven flags were briefly flipped to
> `false` here in an attempt to make `kaioken-chat` the default, on the mistaken
> belief that `extensions/copilot` was still upstream Copilot. It is not — it is the
> rebranded Kaioken Agent, and flipping them left edit/agent/notebook/terminal modes
> with no default participant. Reverted. **Check `extensions/copilot/package.json`'s
> `name`/`publisher` before assuming that directory is upstream code.**

### The convergence: tools, not a second agent

The two agents converge through the **editor-wide tool registry**, which is the seam
that avoids both bad options (rewriting the huge Copilot extension, or regrowing every
chat mode inside `kaioken-chat`).

`extensions/kaioken-chat/src/tools.ts` registers the engine's five knowledge tools via
`vscode.lm.registerTool` — stable API, declared in `contributes.languageModelTools`:

| Contributed | `#`-reference | Engine tool |
|---|---|---|
| `kaioken_symbolLookup` | `#kaiokenSymbol` | `symbol_lookup` |
| `kaioken_wikiSearch` | `#kaiokenSearch` | `wiki_search` |
| `kaioken_impact` | `#kaiokenImpact` | `impact` |
| `kaioken_skillLoad` | `#kaiokenSkill` | `skill_load` |
| `kaioken_readFile` | `#kaiokenRead` | `read_file` |

Registered tools are visible to **every** agent in the editor, so the full-featured
Kaioken Agent — which already owns edit/agent/notebook/terminal modes — can call them.
That is what "its tool calls run through the kaioken_v2 engine" actually required: the
grounded part is the tools, and they are now shared rather than duplicated.

The manifest entries are **generated from `KNOWLEDGE_TOOLS`' own `params`**, so the
JSON schemas cannot drift from the engine's real signatures. Regenerate rather than
hand-editing. Each tool is a pass-through to `agent-serve`'s `tool-call`; no tool logic
is reimplemented in the extension.

**`agent-serve` gained a second request level** for this. It now dispatches requests as
they arrive instead of running one queue, because a tool call must not wait behind a
conversational turn. Turns stay serialised against each other (they share one agent
session); tool calls run concurrently and are matched by `id`, verified by issuing
three at once and getting them back out of order.

A tool failure comes back as a **tool result**, not a protocol error or a thrown
exception — "this repository declares no such symbol" is a useful answer the calling
model should see and continue from, not a lost turn.

### The GitHub dependency, and how it actually lifts

The rebranded agent needs a model, and its model layer is Copilot's. But it ships a
full **BYOK** stack (`src/extension/byok/vscode-node/`) including an OpenRouter
provider — the same provider `kaioken_v2` already resolves models through.

The gate is `isClientBYOKAllowed(hasGitHubSession, copilotToken)`, and it reads in a
way that is easy to get backwards:

```ts
if (!hasGitHubSession) { return true; }   // no GitHub session -> BYOK allowed
if (!copilotToken) { return false; }      // signed in, but no Copilot -> blocked
return copilotToken.isInternal || copilotToken.isIndividual || copilotToken.isClientBYOKEnabled();
```

So **signing in to GitHub is what blocks BYOK**, not what enables it. Staying signed
out and adding an OpenRouter key under the chat model picker's "Manage Models" gives
the agent a model with no GitHub account involved. The `No token resolved for
https://api.github.com` log lines are that path being skipped, not a failure.

**Still open:** `product.json`'s Copilot-derived keys and `extensions/copilot`'s 18
GitHub-calling files remain. Stripping the extension outright is *not* a safe
shortcut — 30 files read `product.chatExtensionId`, and the chat-setup onboarding flow
shows a dead-end install card when the extension named there is missing.

**Verified 2026-09-01:**

- `kaioken agent-serve` smoke-tested directly (piped a JSON request into
  `node apps/cli/dist/bin.js agent-serve --root .`): got back a real, grounded reply —
  it correctly listed `kaioken_v2`'s own knowledge tools — with the stdout stream
  confirmed to be pure JSON lines (no stray text from `runChat`'s own writes leaking
  through), and diagnostics landing on stderr instead, as designed.
- `extensions/kaioken-chat` compiles clean (`gulp compile-extension:kaioken-chat`, 0
  errors) against the real `vscode.d.ts` — `chatParticipants`, `createChatParticipant`,
  and `ChatResponseStream` are all stable API surface at this VS Code version; only
  `isDefault` and `locations` are gated behind proposed APIs, which is why Phase A
  avoids setting them.
- Dev build launches clean with the new extension present in `extensions/`; no
  extension-host errors in the launch log.
- **Not yet verified: the `@kaioken` participant actually answering inside the running
  Chat panel.** The dev build only runs from source (no Start Menu entry), which put it
  out of reach of this session's screen-automation tooling. The protocol and the
  compiled extension are both proven independently; what remains is a two-minute human
  check — open the Chat view, type `@kaioken` and a question, confirm a grounded reply
  streams in.

---

## 8. Running it

```
cd D:\project\ai_now_know\kaioken_studio; . .\studio-env.ps1; .\scripts\code.bat
```

`studio-env.ps1` reads `.nvmrc` and puts that exact Node on PATH for the one shell.
Set `VSCODE_SKIP_PRELAUNCH=1` to skip the pre-launch build check when nothing changed.
After editing TypeScript, `npm run compile` (or `npm run watch`).
