# Kaioken — web-news

A small serverless site for publishing news about the Kaioken project: a public
feed plus a password-protected admin area for writing posts.

It is deliberately independent of `desktop/` and `website/` — it deploys on its
own and shares no code with them.

## Layout

- `src/` — React 19 front-end. Two screens: the public feed and `/admin`.
- `api/` — serverless functions (Vercel Node runtime). Also work unchanged on
  any host that maps a file to a request handler.
- `api/_lib/` — auth, storage and HTTP helpers shared by the functions.

## Configuration

Copy `.env.example` to `.env.local` and fill it in:

| Variable | Required | Purpose |
| --- | --- | --- |
| `ADMIN_PASSWORD` | yes | The single admin password. |
| `AUTH_SECRET` | yes | Signs session cookies; ≥16 chars. Rotating it signs everyone out. |
| `KV_REST_API_URL` | production | Redis-compatible KV REST endpoint (Vercel KV or Upstash). |
| `KV_REST_API_TOKEN` | production | Token for that endpoint. |

Without the KV variables the site still runs, but posts are held in process
memory and disappear on a cold start. That is fine locally and wrong in
production, so the server logs a warning when it happens with `NODE_ENV=production`.

## Running locally

The front-end and the functions are served by different processes:

```bash
npm install
npx vercel dev
```

`vercel dev` serves both on <http://localhost:3000>. To run only the front-end
against an already-running API, use `npm run dev` — Vite proxies `/api` to port
3000.

## Deploying

```bash
npx vercel deploy --prod
```

Set the four environment variables in the project's dashboard first. `vercel.json`
rewrites every non-API path to `index.html` so client-side routes deep-link.

## Auth model

There are no user accounts. `POST /api/login` compares the submitted password to
`ADMIN_PASSWORD` and, on a match, sets an HttpOnly, SameSite=Strict, Secure
cookie holding `<expiry>.<HMAC(expiry)>`. Every mutating endpoint re-verifies
that HMAC, so no session state is stored server-side — which is what lets it work
on a runtime that keeps nothing between invocations.

Drafts are invisible without a session: `GET /api/posts` filters them out and
`GET /api/posts/:id` returns 404 rather than 403, so an unpublished post does not
advertise its own existence.

## API

| Method | Path | Auth | Purpose |
| --- | --- | --- | --- |
| `GET` | `/api/session` | — | Whether the caller is signed in. |
| `POST` | `/api/login` | — | Exchange the password for a session cookie. |
| `POST` | `/api/logout` | — | Clear the cookie. |
| `GET` | `/api/posts` | optional | Published posts; all posts when signed in. |
| `POST` | `/api/posts` | yes | Create a post. |
| `GET` | `/api/posts/:id` | optional | One post. |
| `PUT` | `/api/posts/:id` | yes | Update a post. |
| `DELETE` | `/api/posts/:id` | yes | Delete a post. |
