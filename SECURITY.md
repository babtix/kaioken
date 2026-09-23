# Security Policy

## Supported versions

| Version | Supported |
|---|:---:|
| 2.x (`master`) | Yes |
| 1.x (`.kaioken_v1/` archive, Go prototype) | No — archived reference only |

## How to report a vulnerability

**Do not open a public issue for security vulnerabilities.**

Use GitHub's **private vulnerability reporting** (Security tab → Report a vulnerability) on this repository, or contact the repository owner privately at [github.com/babtix](https://github.com/babtix) if private reporting is unavailable.

Include where possible:

- Affected component (`packages/ext`, `packages/research`, `packages/serve`, `desktop/`, etc.) and version/commit.
- Steps to reproduce or proof of concept (redact any secrets).
- Impact assessment (what an attacker could achieve).
- Any suggested mitigation.

We acknowledge valid reports within **72 hours**. There is currently **no bounty program**; we offer credit in release notes on request.

## Scope notes for contributors

Kaioken handles untrusted input by design. Extra care is expected in:

- `packages/ext` — tarball extraction, manifest validation, MCP/WASM execution boundaries, version-trust locks.
- `packages/research` — URL sanitization, SSRF prevention, page-content sanitization, citation verification.
- `packages/serve` — Markdown rendering safety, request handling, loopback binding assumptions.
- Subprocess execution anywhere — enforce timeouts and never interpolate untrusted input into shells.

Never commit credentials, tokens (`mcp_token`), `.env*` files, or private instance data while reproducing an issue. See [CONTRIBUTING.md](CONTRIBUTING.md) for secrets hygiene.
