# Kaioken Registry Web

The public face of the Kaioken extension ecosystem: a browse/search UI over
the community index, per-extension detail pages with README + trust panels,
a submit wizard, and the documentation.

Stack: React 19 + Vite 6 + Tailwind 4 front-end, Vercel serverless functions
under `api/` (same layout as `web-news/`), Kaioken design tokens borrowed
from `website/`.

## Architecture — deliberately no database

GitHub is the source of truth end to end:

- The **index** is `community-extensions.json` in
  [`babtix/kaioken-extensions`](https://github.com/babtix/kaioken-extensions)
  — the exact file the Kaioken CLI fetches.
- Extension **code** lives in each author's repo; installs pull their GitHub
  releases directly.
- **Moderation** is PR review + CI validation + the `malicious` flag the
  CLI already enforces.

The serverless API is read-only enrichment on top:

| Route | What it does |
|-------|--------------|
| `GET /api/index` | Index + live release data (version, date, downloads). Bare array, superset of the CLI's `RegistryEntry` — works as an `ext_registry` target. Edge-cached 5 min. |
| `GET /api/ext/[id]` | One listing + manifest at the latest release + README + release history. |
| `POST /api/validate` | `{repo}` → the same manifest rules as `kaioken ext validate` (TS port in `api/_lib/manifest.ts`, tests mirror the Go cases) + tree lint. Powers the submit wizard. Writes nothing. |

There is **no write API**: submission is a validated, prefilled GitHub PR,
so the human review step cannot be bypassed.

## Develop

```
npm install
npm run test      # vitest: manifest rule port, enrichment, browse filtering
npm run build     # tsc -b && vite build
vercel dev        # serves api/ + frontend together
npm run dev       # vite only; proxies /api to :3000 (run vercel dev too)
```

## Deploy (operator steps)

1. `vercel link` in this directory, then `vercel deploy --prod`.
2. Optionally set `GITHUB_TOKEN` (no scopes needed) in the Vercel project to
   raise GitHub API rate limits for enrichment/validation.
3. The site assumes the registry repo exists at
   `babtix/kaioken-extensions` (push `ecosystem/registry/` there) and the
   template at `babtix/kaioken-extension-template`
   (push `ecosystem/extension-template/`).
