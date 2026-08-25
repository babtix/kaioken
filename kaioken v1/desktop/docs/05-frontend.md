# 05 — The front-end

React 19 + Vite 6 + Tailwind 4 + TypeScript, deliberately mirroring `website/` so
components and tokens transfer without translation.

## 5.1 Dependencies

Start from `website/package.json` and subtract what a desktop app does not need.

```jsonc
{
  "dependencies": {
    "react": "^19.1.0",
    "react-dom": "^19.1.0",
    "react-router-dom": "^7.18.1",
    "zustand": "^5.0.0",
    "@tauri-apps/api": "^2",
    "@tauri-apps/plugin-dialog": "^2",
    "@tauri-apps/plugin-opener": "^2",
    "@tauri-apps/plugin-os": "^2",
    "@tauri-apps/plugin-process": "^2",
    "react-markdown": "^10.1.0",
    "remark-gfm": "^4.0.1",
    "rehype-slug": "^6.0.0",
    "mermaid": "^11.16.0",
    "lucide-react": "^1.26.0",
    "@base-ui/react": "^1.6.0",
    "class-variance-authority": "^0.7.1",
    "clsx": "^2.1.1",
    "tailwind-merge": "^3.6.0",
    "@fontsource-variable/geist": "^5.3.0",
    "@fontsource-variable/jetbrains-mono": "^5.3.0"
  },
  "devDependencies": {
    "@tauri-apps/cli": "^2",
    "@tailwindcss/vite": "^4.1.8", "tailwindcss": "^4.1.8",
    "@vitejs/plugin-react": "^4.5.2", "vite": "^6.3.5",
    "typescript": "~5.8.3", "@types/react": "^19.1.6", "@types/react-dom": "^19.1.6",
    "vitest": "^3", "@testing-library/react": "^16", "jsdom": "^25"
  },
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "predev": "node scripts/build-sidecar.mjs",
    "prebuild": "node scripts/build-sidecar.mjs",
    "tauri": "tauri",
    "test": "vitest run"
  }
}
```

Dropped from the website: `ogl` (the WebGL hero shader — a desktop app has no
hero), `shadcn` CLI, `tw-animate-css`. **No CDN anything** — the CSP forbids it
and offline must work.

## 5.2 Design system: copy, do not reinvent

These files transfer from `website/src` essentially unchanged. Copying is
correct here: the two surfaces should look identical, and a shared package for
six files would cost more than it saves.

| From `website/src` | To `desktop/src` | Change |
| --- | --- | --- |
| `index.css` | `index.css` | Drop the CRT/scanline/hero-only classes; keep the whole `:root` palette and `@theme inline` block verbatim |
| `lib/utils.ts` | `lib/utils.ts` | none |
| `components/Markdown.tsx` | `components/common/Markdown.tsx` | Rewire link handling: internal wiki links route in-app, external links go through `open_external` |
| `components/Mermaid.tsx` | `components/common/Mermaid.tsx` | none |
| `components/CodeBlock.tsx` | `components/common/CodeBlock.tsx` | none |
| `components/ui/{button,badge,tabs}.tsx` | `components/ui/…` | none |

The palette is the identity and it is already documented as *"lifted from the
TUI's lipgloss ANSI codes so the site and the terminal are literally the same
colours"*. The desktop app is the third surface and must not break that:

```
--kai-orange #ff8700  primary, headings, active state
--kai-amber  #ffaf00  warnings, approval prompts, keycaps
--kai-red    #ff0000  logo, destructive
--kai-tan    #d7af87  tool calls
--kai-blue   #87d7ff  user input, commands
--kai-green  #00d787  ok, diff +
--kai-sage   #87af87  tool results
--kai-rose   #ff5f5f  errors, diff −
--kai-black  #080808  app background
--kai-panel  #1c1c1c  panels
--kai-line   #303030  borders
--radius     0.25rem  terminals do not have rounded corners
```

Fonts: JetBrains Mono Variable for everything structural, Geist Variable for long
prose inside rendered documents.

## 5.3 Source layout

```
desktop/src/
├── main.tsx                      React root; mounts after daemon bootstrap
├── App.tsx                       HashRouter + AppShell + route table
├── index.css
├── lib/
│   ├── api.ts                    typed fetch client (one function per endpoint)
│   ├── events.ts                 SSE reader + reconnect
│   ├── sse.ts                    frame parser (pure, unit-tested)
│   ├── types.ts                  hand-written mirrors of 02-api-contract.md
│   ├── daemon.ts                 invoke("daemon_info"), daemon://up|down|dead
│   ├── format.ts                 bytes, durations, token counts, relative time
│   └── utils.ts                  cn()
├── store/
│   ├── workspace.ts              current workspace, recents, config, scan, status
│   ├── chat.ts                   sessions, transcript, streaming buffer, approvals
│   ├── runs.ts                   run registry mirror, progress, artifacts
│   ├── docs.ts                   wiki tree, open document, search, plan editors
│   └── settings.ts               providers, keys metadata, models, defaults
├── components/
│   ├── layout/    AppShell · NavRail · StatusBar · CommandPalette · Toaster
│   ├── chat/      Transcript · Message · StreamingText · ToolCallCard ·
│   │              ApprovalDialog · DiffView · Composer · SlashMenu ·
│   │              SessionList · CostMeter
│   ├── wiki/      WikiTree · DocReader · DocToc · WikiSearch · PlanEditor ·
│   │              BriefEditor · MultiplierDial · RunConsole · EstimateCard
│   ├── cards/     ModuleTable · ModulesEditor · CardViewer
│   ├── skills/    SkillList · SkillViewer
│   ├── settings/  ProviderList · KeyField · ModelPicker · ScopeEditor · NotesEditor
│   └── common/    Markdown · Mermaid · CodeBlock · Empty · Spinner · Kbd · YamlEditor
└── routes/
    ├── Welcome.tsx   no workspace open
    ├── Chat.tsx
    ├── Wiki.tsx      reader + run panel
    ├── Cards.tsx
    ├── Skills.tsx
    ├── Activity.tsx  runs, logs, artifacts
    └── Settings.tsx
```

**HashRouter, not BrowserRouter.** Production loads from `tauri://localhost` with
no server to rewrite paths; a hash router is the only thing that survives a
reload on a deep route.

## 5.4 Talking to the daemon

### `lib/daemon.ts`

```ts
import { invoke } from "@tauri-apps/api/core"
import { listen } from "@tauri-apps/api/event"

export type DaemonInfo = { port: number; token: string; version: string }

let current: DaemonInfo | null = null

export async function bootstrap(): Promise<DaemonInfo> {
  current = await invoke<DaemonInfo>("daemon_info")
  return current
}
export function base() {
  if (!current) throw new Error("daemon not ready")
  return `http://127.0.0.1:${current.port}/v1`
}
export function authHeaders(): HeadersInit {
  return { Authorization: `Bearer ${current!.token}`, "Content-Type": "application/json" }
}
export function onDaemonUp(fn: (i: DaemonInfo) => void) { return listen<DaemonInfo>("daemon://up", e => { current = e.payload; fn(e.payload) }) }
export function onDaemonDead(fn: (msg: string) => void) { return listen<string>("daemon://dead", e => fn(e.payload)) }
```

`main.tsx` awaits `bootstrap()` before rendering `<App/>`, and renders a
`<FatalError/>` screen on `daemon://dead`. There is no meaningful UI without a
daemon, so there is no point rendering one.

### `lib/api.ts`

One exported function per endpoint, named after it, fully typed. No generic
`request(path)` escape hatch exposed to components — that is how contracts rot.

```ts
async function req<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(base() + path, {
    method, headers: authHeaders(),
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  if (!res.ok) throw await ApiError.from(res)   // parses the §2.1 envelope
  return res.status === 204 ? (undefined as T) : await res.json()
}

export const api = {
  health:        () => req<Health>("GET", "/health"),
  listWorkspaces:() => req<WorkspaceList>("GET", "/workspaces"),
  openWorkspace: (path: string) => req<Workspace>("POST", "/workspaces", { path }),
  scan:  (id: string, refresh = false) => req<ScanResult>("GET", `/workspaces/${id}/scan?refresh=${refresh}`),
  startRun: (id: string, kind: RunKind, params: RunParams) =>
      req<Run>("POST", `/workspaces/${id}/runs`, { kind, params }),
  resolveApproval: (aid: string, decision: Decision) =>
      req<void>("POST", `/approvals/${aid}`, { decision }),
  // …one per row of the §2.10 index
}
```

`ApiError` carries `code`, `message`, `detail`, and `status`, so a component can
branch on `err.code === "no_api_key"` and offer *Open settings* instead of
printing a stack trace.

### `lib/sse.ts` — the frame parser

`EventSource` cannot send an `Authorization` header, and putting the token in a
query string leaks it into logs. So the stream is a `fetch` whose body is read as
a `ReadableStream`, and frames are parsed by hand. Pure function, unit-tested:

```ts
export type Frame = { id?: string; event: string; data: string }

/** Feed decoded chunks in; get complete frames out. Handles frames split
 *  across chunk boundaries and CRLF line endings. */
export function createFrameParser() {
  let buf = ""
  return (chunk: string): Frame[] => {
    buf += chunk.replace(/\r\n/g, "\n")
    const out: Frame[] = []
    let i: number
    while ((i = buf.indexOf("\n\n")) !== -1) {
      const raw = buf.slice(0, i); buf = buf.slice(i + 2)
      if (raw.startsWith(":")) continue                  // heartbeat
      const f: Frame = { event: "message", data: "" }
      for (const line of raw.split("\n")) {
        const c = line.indexOf(":")
        const field = c === -1 ? line : line.slice(0, c)
        const value = c === -1 ? "" : line.slice(c + 1).replace(/^ /, "")
        if (field === "event") f.event = value
        else if (field === "data") f.data += (f.data ? "\n" : "") + value
        else if (field === "id") f.id = value
      }
      out.push(f)
    }
    return out
  }
}
```

Test cases the parser must pass: a frame split mid-`data:`, multi-line `data`, a
`: ping` heartbeat between frames, CRLF endings, and a trailing partial frame that
only completes on the next chunk.

### `lib/events.ts` — the subscription

```ts
export function connectEvents(onEvent: (e: KaiEvent) => void, onStatus: (s: ConnStatus) => void) {
  let lastSeq = 0, stop = false, attempt = 0
  ;(async function loop() {
    while (!stop) {
      try {
        onStatus("connecting")
        const res = await fetch(`${base()}/events?since=${lastSeq}`, { headers: authHeaders() })
        if (!res.ok || !res.body) throw new Error(`events: ${res.status}`)
        onStatus("open"); attempt = 0
        const reader = res.body.pipeThrough(new TextDecoderStream()).getReader()
        const parse = createFrameParser()
        for (;;) {
          const { value, done } = await reader.read()
          if (done) break
          for (const f of parse(value)) {
            const ev = JSON.parse(f.data) as KaiEvent
            lastSeq = Math.max(lastSeq, ev.seq)
            onEvent(ev)
          }
        }
      } catch { /* fall through to backoff */ }
      if (stop) return
      onStatus("reconnecting")
      await sleep(Math.min(1000 * 2 ** attempt++, 10_000))
    }
  })()
  return () => { stop = true }
}
```

A single connection for the whole app, owned by `App.tsx`, dispatching into the
stores by `ev.type`. Not one subscription per component — that would multiply the
stream N times and reorder events between consumers.

## 5.5 State

Zustand, one store per domain (decision D9). Stores are written by two sources:
API responses and SSE events. Keep both in the store, never in component state.

```ts
// store/chat.ts (shape only)
type ChatState = {
  sessionId: string | null
  messages: Message[]           // committed transcript
  live: string                  // streaming assistant text, not yet committed
  toolCalls: Record<string, ToolCallView>
  approval: Approval | null     // at most one modal at a time
  runId: string | null          // the in-flight turn
  usage: Usage

  send(text: string): Promise<void>
  cancel(): Promise<void>
  resolve(decision: Decision): Promise<void>
  // event handlers, called only by the App-level dispatcher:
  onDelta(text: string): void
  onMessage(m: Message): void
  onToolCall(t: ToolCall): void
  onToolResult(r: ToolResult): void
  onApproval(a: Approval): void
}
```

**The event dispatcher lives in one file** (`App.tsx` or `lib/dispatch.ts`) and is
an exhaustive `switch (ev.type)` over the §2.3 catalogue. A `default:` that
`console.warn`s an unknown type catches contract drift immediately.

## 5.6 Streaming without jank

The single biggest performance trap: re-parsing markdown on every token. A 3000-token
reply at ~30 tokens/second is 3000 full markdown parses of an ever-growing string.

The mitigation is the same one the TUI uses — it caches a `committed` render and
only redraws the live tail (`internal/tui/tui.go`, the `committed`/`live` fields):

1. **Committed messages are `React.memo`'d** and keyed by index. They never
   re-render while a new message streams.
2. **Deltas accumulate in a ref**, not in state. A `requestAnimationFrame` loop
   flushes the ref into state at most every ~60 ms, so React sees ~16 updates a
   second regardless of token rate.
3. **The live tail renders as pre-wrapped text**, not markdown — `<div
   className="whitespace-pre-wrap font-mono">`. Half-written markdown renders
   badly anyway (an unclosed fence swallows the rest of the reply).
4. **On `chat.message`** the live buffer is cleared and the complete text is
   appended as a committed, markdown-rendered message. This is exactly why the
   contract sends both `chat.delta` and a final `chat.message`.
5. **Mermaid renders lazily**, on an `IntersectionObserver`, and only in committed
   content. A 71-document wiki with diagrams in every chapter will stall the main
   thread otherwise.
6. **Auto-scroll respects intent**: stick to the bottom only while the user is
   already within 40 px of it.

## 5.7 Markdown and links

`components/common/Markdown.tsx` wraps `react-markdown` with `remark-gfm` and
`rehype-slug` (matching the website, and matching the server-side slugs from
§2.8). Link handling is the one real change:

- `./Other Chapter.md` or `../Section/Doc.md` → resolve against the current
  document's path and navigate in-app to `#/wiki/<section>/<doc>`.
- `#anchor` → smooth-scroll within the document.
- `http(s)://…` → `open_external`, never in-WebView.
- Anything else (`file://`, custom schemes) → rendered as inert text with a
  tooltip. Generated documents are model output; treat their links as untrusted.

Code blocks reuse the website's `CodeBlock` with a copy button. `mermaid` fences
route to `<Mermaid/>`, which must **fail soft**: invalid diagram syntax renders the
source as a plain code block, matching what the Go pipeline already does in
`wiki/polish.go`.

## 5.8 Keyboard

The audience lives in a terminal; the app should reward that.

| Keys | Action |
| --- | --- |
| `Ctrl/Cmd+K` | Command palette |
| `Ctrl/Cmd+O` | Open repository |
| `Ctrl/Cmd+1…5` | Chat · Wiki · Cards · Skills · Activity |
| `Ctrl/Cmd+,` | Settings |
| `Enter` | Send message |
| `Alt+Enter` / `Ctrl+J` | Newline in composer (same binding as the TUI) |
| `Esc` | Cancel run / close modal / clear palette |
| `Y` / `N` | Approve / deny while the approval dialog is focused |
| `Ctrl/Cmd+F` | Search within the wiki |
| `Ctrl/Cmd+Z` | Undo the last agent file change |
| `/` at an empty composer | Slash-command menu |

The slash menu mirrors the TUI's command palette (`internal/tui/palette.go`) so
muscle memory transfers: typing `/wiki x3` in the composer starts a wiki run at
multiplier 3 rather than sending a chat message. This is the single strongest
affordance for existing users — implement it, do not defer it.

## 5.9 TypeScript types

`lib/types.ts` is hand-written from `docs/02-api-contract.md` and is the only
place types are declared. Rules:

- No `any`. `unknown` plus a narrowing function where a payload is genuinely open.
- Event payloads are a discriminated union on `type`:
  ```ts
  export type KaiEvent =
    | { type: "chat.delta"; seq: number; ts: string; run_id: string; session_id: string; text: string }
    | { type: "run.progress"; seq: number; ts: string; run_id: string; phase: string; message: string; done: number; total: number }
    | …
  ```
  The exhaustive `switch` in the dispatcher then fails to compile when the
  contract grows an event and the front-end has not handled it. That compile
  error is a feature.
- `tsc -b` runs in `npm run build`; a type error blocks the build.
