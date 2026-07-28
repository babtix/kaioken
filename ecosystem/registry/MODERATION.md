# Moderation policy

The registry stores pointers, never code. Moderation therefore has exactly
three levers: refusing a listing (PR review), flagging a listing
(`deprecated`), and the kill switch (`malicious`). Everything else — what an
extension may do on a user's machine — is enforced by the Kaioken client
itself (per-version trust, permission validation, the sandbox).

## Listing criteria

Every entry must:

- Point at a public GitHub repository the submitter owns or maintains.
- Ship a valid `extension.yaml` (CI deep-checks the latest release against
  the index entry: id, type, and — for wasm — the permission set).
- Have an honest one-sentence description. Marketing language, keyword
  stuffing, and impersonating another project are grounds for refusal.
- Not duplicate an existing listing's id or repo.

## Review checklist per tier

**declarative** — lowest bar. Skim the skills for prompt-injection attempts
(instructions that tell the agent to exfiltrate data, disable safety
behavior, or hide actions from the user). Declarative extensions run no
code, but they do enter the agent's context.

**mcp** — highest scrutiny. The server command runs **unsandboxed** on the
user's machine after trust. Review:
- What `mcp.command` + `args` actually execute; the README must explain it.
- Whether the repository contains the server source (a listing whose command
  downloads and runs remote code is refused).
- The runtime it assumes (node, python, …) is stated in the README.

**wasm** — sandboxed by construction, so review focuses on permissions:
- The listing's `permissions` must match the manifest (CI enforces this).
- `fs:read:workspace` must be justified by what the tools do.
- The repo should contain the plugin source and a reproducible build for the
  `.wasm` artifact.

## Flags

- `deprecated` — the extension still installs; clients show a warning. Used
  when an author abandons an extension or a better replacement exists.
  Applied by PR, ideally by the author.
- `malicious` — the kill switch. Kaioken clients refuse to install or update
  the extension and hide it from browse UIs. Applied by maintainers,
  effective for every client within its 24h registry cache TTL.

## Takedown procedure

1. Anyone reports a listing by opening an issue titled `takedown: <id>`
   with evidence.
2. A maintainer verifies the behavior (installing into a disposable
   environment; for mcp, reading the server source at the released tag).
3. Confirmed malicious → a maintainer PRs `"flags": ["malicious"]` onto the
   entry (entries are never deleted — deletion would un-block reinstalls for
   clients that still have the old index cached, while the flag actively
   blocks them).
4. The finding is documented in the issue before it is closed.

Disputes: the author may appeal on the same issue; the flag stays until the
appeal is resolved.

## What moderation does not promise

Review is a good-faith read of source at submission time, not a security
audit, and releases after review are not re-reviewed until the entry
changes. The trust model assumes this: users grant trust per extension
version, updates revoke it, and the client never runs extension code the
user has not explicitly re-approved.
