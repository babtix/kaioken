# PHASE 0 — FOUNDATION
> Estimate: 2h · Depends on: nothing · Exit: Pi answers interactively on Gemini 3.8 Flash (high)

## Goal
Pi harness builds and runs; Antigravity/Flash provider configured; workspace skeleton for Kaioken exists.

## Steps
### 0.1 Prereqs
Node >= 22, npm >= 10, git on PATH.
```bash
node -v && npm -v && git --version
```

### 0.2 Baseline build
```bash
cd kaioken_kaiopi
npm install && npm run build
pi --version
```

### 0.3 Provider config — `~/.pi/agent/models.json`
(Shape per Pi custom-provider docs; adapt `baseUrl` to your Antigravity proxy, e.g. cli-proxy-api.)
```json
{
  "providers": {
    "antigravity": {
      "baseUrl": "http://127.0.0.1:8317/v1",
      "apiKey": "ANTIGRAVITY_API_KEY",
      "api": "openai-completions",
      "models": [
        {
          "id": "gemini-3.8-flash-high",
          "name": "Gemini 3.8 Flash (high)",
          "reasoning": true,
          "input": ["text", "image"],
          "contextWindow": 1048576,
          "maxTokens": 65536,
          "cost": { "input": 0.15, "output": 0.6, "cacheRead": 0.03, "cacheWrite": 0.15 }
        }
      ]
    }
  }
}
```
`reasoning: true` + proxy-side thinking=high = the "high" tier. `cost` feeds Phase 7 spend estimates — set real numbers.

### 0.4 Smoke test
```bash
cd /tmp/scratch && pi --model antigravity/gemini-3.8-flash-high
# prompt: "reply with OK"  → expect: OK
```

### 0.5 Workspace skeleton
```bash
cd -  # back to kaioken_kaiopi
mkdir -p .pi/extensions/kaioken/{tools,commands,hooks,prompts} kaioken
```
Root `package.json`:
```json
{ "workspaces": ["packages/*", "kaioken/*", ".pi/extensions/kaioken"] }
```
`.gitignore` add: `node_modules/`, `dist/` (`.kaioken/` lives in target repos, never here).

### 0.6 Commit
```bash
git add -A && git commit -m "phase0: pi baseline + antigravity flash-high provider + skeleton"
```

## Verification
- [x] `npm run build` green
- [x] `pi --version` prints
- [x] Scratch session answers on flash-high
- [x] Skeleton dirs exist and are committed

## Pitfalls
- Wrong proxy `baseUrl` → 401/404; verify proxy health endpoint first.
- Do NOT edit anything under `packages/` (Invariant 1).
- `cost` values wrong → Phase 7 estimates lie; fix now.

## Next
PHASE-1-bridge-skeleton.md
