# B2-01 · Account and identity

> Introduce user accounts, authentication, and session identity to an engine that currently possesses
> zero user concepts, enabling entitlements and billing to attach to a verified customer.

| Field | Value |
|---|---|
| **Status** | `ready` |
| **Size** | M |
| **Depends on** | [`B1-02`](02-choose-the-revenue-model.md) |
| **Blocks** | [`B2-02`](02-payment-provider-integration.md), [`B2-03`](03-entitlements-and-license-keys.md), [`B2-04`](04-usage-metering.md) |
| **Touches** | `kaioken_v2/apps/cli/src/commands/auth.ts`, `kaioken_v2/packages/auth/`, local config stores |
| **Risk** | Medium — must preserve complete offline capability for unauthenticated users |
| **Gate-critical** | **Yes — real engine gates: `npm test` and `npm run typecheck`** |

---

## Why this exists

You cannot charge a subscription or meter inference credits to a person who has no digital identity
in your system.

Currently, the Kaioken engine operates entirely as an anonymous local binary:
- It reads files from disk, runs local parsers, and completes tasks without any concept of a user account.
- Entitlements, payments, and inference balance tracking cannot function without a durable `user_id`.

This leaf implements the **account and identity layer**:
1. An OAuth2 / GitHub device flow authentication command (`kaioken login`) designed for terminal and
   desktop environments.
2. Secure local token caching in `~/.kaioken/auth.json`.
3. An identity representation that downstream billing and inference proxies can consume.
4. Absolute preservation of anonymous execution: if no account is configured, the engine operates
   freely with local BYOK without nagging or degraded performance.

---

## Current state

Verified against the `kaioken_v2/` working tree:

| Fact | Evidence | Notes |
|---|---|---|
| Zero user entity in engine | Grep across `kaioken_v2/` | No `User`, `Account`, `SessionToken`, or auth headers exist in any package |
| Local config stores keys only | `apps/cli/src/commands/daemon.ts:164-175` | `interface UserConfigYaml` stores provider API keys and model names on disk |
| CLI commands run anonymously | `apps/cli/src/main.ts` | All commands (`scan`, `wiki`, `agent`) execute without auth credentials |
| Extension registry auth | `registry-web/` | Web registry has rudimentary package metadata; no CLI auth binding |

---

## Technical architecture

```
               CLI AUTHENTICATION FLOW (RFC 8628 DEVICE CODE)
┌─────────────────┐                                      ┌──────────────────────┐
│  Developer CLI  │                                      │ Kaioken Hosted Auth  │
│ `kaioken login` │                                      │   (OAuth2 Server)    │
└────────┬────────┘                                      └──────────┬───────────┘
         │ 1. POST /auth/device/code                                │
         │─────────────────────────────────────────────────────────>│
         │ 2. Return { device_code, user_code, verification_uri }   │
         │<─────────────────────────────────────────────────────────│
         │                                                          │
         │ Prints: "Open https://kaioken.dev/auth/activate"         │
         │         "Enter code: ABCD-1234"                          │
         │                                                          │
         │ 3. Polls POST /auth/device/token (interval 5s)           │
         │─────────────────────────────────────────────────────────>│
         │                                                          │ (User authorizes via
         │                                                          │  GitHub/Google login)
         │ 4. Returns JWT { access_token, refresh_token, user_id }  │
         │<─────────────────────────────────────────────────────────│
         │                                                          │
         │ Stores encrypted in ~/.kaioken/auth.json (chmod 0600)    │
         ▼                                                          ▼
```

---

## What done looks like

- [ ] New package or module `kaioken_v2/packages/auth/` (or `apps/cli/src/auth/`) defining:
  - `UserIdentity`: `{ userId: string; email: string; orgId?: string; plan: "community" | "pro" | "team" }`.
  - `TokenStore`: manages reading, writing, and refreshing JWT tokens in `~/.kaioken/auth.json`.
- [ ] New CLI command `kaioken login`:
  - Implements OAuth2 Device Authorization Grant (RFC 8628).
  - Prompts developer with one-time verification URL and user code.
  - Automatically exchanges code for long-lived JWT upon browser authorization.
- [ ] New CLI command `kaioken logout`: removes stored credentials cleanly.
- [ ] New CLI command `kaioken whoami`: displays active user email, plan tier, and credit balance.
- [ ] Preserved offline behavior: All core commands continue to function offline if unauthenticated.
- [ ] Unit tests validate token parsing, token refresh, and graceful fallback when auth is absent.

---

## Steps

1. **Implement Token Storage (`apps/cli/src/auth/store.ts`):**
   - Create functions to load and save `{ accessToken, refreshToken, expiresAt, userId }` in
     `~/.kaioken/auth.json`.
   - Ensure file permissions on POSIX systems are clamped to `0600` (read/write by owner only).
2. **Implement Device Flow Client (`apps/cli/src/auth/device-flow.ts`):**
   - Implement standard RFC 8628 handshake against the hosted authentication endpoint.
   - Include terminal timeout (15 minutes) and exponential backoff on polling errors.
3. **Add Auth Commands to CLI:**
   - Register `login`, `logout`, and `whoami` commands in `apps/cli/src/main.ts`.
4. **Integrate into Model Client Seam:**
   - In `apps/cli/src/model.ts`, if user is logged in and using Kaioken managed models, attach
     `Authorization: Bearer <accessToken>` to outgoing proxy requests.
5. **Unit & Integration Testing:**
   - Test offline runs pass with no token present.
   - Test mock token storage read/write and expired token refresh.

---

## In scope

- `kaioken_v2/apps/cli/src/auth/`
- `kaioken_v2/apps/cli/src/commands/auth.ts`
- Wiring auth tokens into `apps/cli/src/model.ts`
- Unit tests in `kaioken_v2/apps/cli/test/auth.test.ts`

---

## Out of scope

- Hosting the OAuth2 server itself (uses managed Supabase Auth / WorkOS backend).
- Multi-factor authentication (handled upstream by identity provider like GitHub).
- In-memory biometric keychain integrations (file-based `auth.json` suffices for v1).

---

## Gates

From `kaioken_v2/`:

```bash
npm run typecheck
npm test
```

Specific auth unit tests:
```bash
npx vitest run apps/cli/test/auth.test.ts
```

Offline verification:
```bash
# Must exit 0 with no network or auth credentials configured
node apps/cli/dist/bin.js scan --root .
```

---

## Traps

| Trap | Guard |
|---|---|
| Breaking offline functionality | Never throw an unhandled error if auth is missing. Return `null` identity and let the engine use local BYOK |
| Leaking tokens in error logs | Scrub `Authorization` headers and `auth.json` contents from all CLI debug output and crash traces |
| Browser popup failures in headless environments | Device flow is SSH-friendly: developer copies URL and code to any browser on any machine |
| Storing tokens with open file permissions | Clamp file creation mode to `0o600` on Linux/macOS to prevent multi-user permission leakage |

---

## Open questions

1. None. RFC 8628 device flow is the established industry standard for CLI authentication.

---

## Session brief

```xml
<task>
In kaioken_v2/apps/cli/, implement account authentication and user identity primitives using RFC 8628
OAuth2 device flow, ensuring core commands remain 100% functional when offline or unauthenticated.

1. Implement apps/cli/src/auth/store.ts:
   - Token storage interface reading/writing ~/.kaioken/auth.json with chmod 0600.
   - Interface AuthCredentials: { accessToken: string; refreshToken: string; expiresAt: number; userId: string; email: string }.
2. Implement apps/cli/src/auth/device-flow.ts:
   - Initiates device authorization, outputs user verification URL and code.
   - Polls token endpoint with backoff until authorized or timed out.
3. Wire commands in apps/cli/src/commands/auth.ts:
   - "kaioken login": initiates device flow.
   - "kaioken logout": deletes auth.json.
   - "kaioken whoami": displays current user identity and plan.
4. Add unit tests in apps/cli/test/auth.test.ts verifying store serialization, permission clamping,
   and unauthenticated fallback.
</task>

<verification_loop>
Run from kaioken_v2/:
  npm run typecheck
  npm test
  node apps/cli/dist/bin.js scan --root .
Confirm all unit tests pass and offline scan succeeds without credentials.
</verification_loop>

<action_safety>
Do NOT require authentication for existing commands (scan, wiki, impact).
Do NOT hardcode live production client IDs or secrets in code.
Do NOT run git add or git commit. Leave work uncommitted.
</action_safety>

<structured_output_contract>
End with: (1) auth module design summary, (2) files touched, (3) test suite execution results,
(4) confirmation that unauthenticated CLI runs pass.
</structured_output_contract>
```
