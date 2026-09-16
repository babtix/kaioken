# B2-03 · Entitlements and license keys

> Implement cryptographically verifiable entitlement keys, offline grace period caching, and an explicit
> fail-open-for-in-flight / fail-closed-for-new-runs policy when subscriptions lapse mid-run.

| Field | Value |
|---|---|
| **Status** | `ready` |
| **Size** | M |
| **Depends on** | [`B2-01`](01-account-and-identity.md), [`B2-02`](02-payment-provider-integration.md), [`B1-03`](03-open-core-boundary.md) |
| **Blocks** | [`B2-05`](05-inference-proxy-and-margin.md), [`B2-06`](06-quotas-and-abuse-controls.md) |
| **Touches** | `kaioken_v2/packages/auth/`, `kaioken_v2/apps/cli/src/entitlements.ts`, local license cache |
| **Risk** | Medium — overly strict checks lock out legitimate offline developers; overly loose checks bypass billing |
| **Gate-critical** | **Yes — real engine gates: `npm test` and `npm run typecheck`** |

---

## Why this exists

A customer who pays for Kaioken Pro expects immediate access to paid capabilities (hosted premier models,
cloud daemon sync, private registry publishing). However, developer workflows have unique operating requirements:
- Developers frequently code on airplanes, trains, or behind corporate firewalls with intermittent internet.
  A client that phones home on every single keystroke or CLI invocation will fail frustratingly.
- Subscriptions expire or credit cards fail due to billing issues. If an entitlement check fails in the
  middle of an autonomous multi-file refactor, how the engine responds determines whether the user's
  worktree is saved or corrupted.

This leaf establishes:
1. **Asymmetric cryptographic license keys (Ed25519 / JWT):** The cloud server signs an entitlement token;
   the client verifies it locally with an embedded public key without requiring constant network pings.
2. **Offline grace periods:** Caches valid entitlements locally for up to 14 days without network contact.
3. **The mid-run lapse policy:** An explicit, intentional decision regarding what happens when a subscription
   lapses while a run is actively executing.

---

## Current state

Verified repository state:
- No entitlement or license key verification logic exists anywhere in `kaioken_v2/`.
- Local CLI commands (`scan`, `wiki`, `impact`) do not consult any entitlement checker.
- Per the open-core boundary ([`B1-03`](03-open-core-boundary.md)), Community
  features are free forever and will never check for an entitlement key.

---

## The mid-run lapse policy: fail-open vs fail-closed

> [!important] Architectural Decision: Fail-Open for In-Flight Runs, Fail-Closed for New Runs
> This is a critical product-reliability decision that must be explicitly codified, not left to default error handling.

Suppose a developer starts an extensive multi-pass refactoring session at Multiplier ×5. While the run is
executing turn 8 of 12, their monthly subscription renewal fails, or their included monthly credit pool is
exhausted.

| Strategy | Behavior | Consequence | Verdict |
|---|---|---|---|
| **Violent Fail-Closed** | Immediately abort the process, terminate tool execution, and exit non-zero | Leaves working tree in an inconsistent, corrupt state with half-edited files. Customer fury and support tickets | **REJECTED** |
| **Full Fail-Open** | Continue running indefinitely without payment | Allows users to drain unlimited wholesale API spend by never terminating sessions | **REJECTED** |
| **Hybrid Graceful Policy (Adopted)** | **Allow the active session to finish cleanly up to its pre-allocated session ceiling; block all subsequent runs** | Preserves git worktree integrity, saves customer work, but prevents new financial leakage | **APPROVED** |

### Policy Rules:
1. **In-Flight Session Protection:** Once an agent session begins, its active lease is valid until the
   session naturally concludes or hits its configured per-session turn/spend ceiling (see [`M7-05`](../../m07-permissions-and-sandboxing/05-resource-ceilings.md)).
2. **Graceful Notice:** If the entitlement lapses during the session, the engine appends an honest warning
   to the session output: *"Note: Your subscription renewal failed. This session was allowed to finish,
   but subsequent runs will require billing reactivation."*
3. **Subsequent Run Gate:** Any *new* invocation attempting to use paid hosted models or cloud services
   fails closed immediately before making network calls.
4. **Local Features Unaffected:** If paid access is blocked, local offline commands (`scan`, `wiki`, local BYOK)
   continue operating without restriction.

---

## Technical architecture

```
                     ENTITLEMENT VERIFICATION ENGINE
┌────────────────────────┐                             ┌────────────────────────┐
│  Kaioken Cloud Server  │                             │ Developer Local Client │
└───────────┬────────────┘                             └───────────┬────────────┘
            │ 1. Issues signed token upon payment                  │
            │    (Ed25519 signature with server private key)       │
            │                                                      │
            │ {                                                    │
            │   userId: "usr_123",                                 │
            │   plan: "pro",                                       │
            │   features: ["hosted_proxy", "cloud_sync"],          │
            │   expiresAt: 1735689600,                             │
            │   gracePeriodUntil: 1736899200                       │
            │ }                                                    │
            │─────────────────────────────────────────────────────>│
            │                                                      │
            │                                                      │ 2. Stores in ~/.kaioken/license.jwt
            │                                                      │
            │                                                      │ 3. Offline Verification:
            │                                                      │    Verifies Ed25519 signature
            │                                                      │    using embedded public key.
            │                                                      │    If Date.now() < gracePeriod,
            │                                                      │    ALLOWS execution offline.
            ▼                                                      ▼
```

---

## What done looks like

- [ ] Entitlement schema defined:
  ```ts
  export interface EntitlementClaims {
    userId: string;
    plan: "community" | "pro" | "team";
    features: string[];
    issuedAt: number;
    expiresAt: number;
    gracePeriodUntil: number;
  }
  ```
- [ ] License validator module in `kaioken_v2/apps/cli/src/entitlements.ts`:
  - Verifies token signature using embedded Ed25519 public key.
  - Returns structured status: `"valid" | "in_grace_period" | "expired" | "tampered"`.
- [ ] Session runner checks entitlements before starting a paid run.
- [ ] In-flight lapse handler: session does not crash if expiration passes mid-run; surfaces clean renewal banner at end.
- [ ] Unit tests validate cryptographic verification, expired token rejection, grace-period allowances,
      and offline execution.

---

## Steps

1. **Implement Cryptographic Verification:** Use Node.js built-in `crypto.verify` (ed25519) to verify
   license signatures without external dependencies.
2. **Implement Local Cache:** Read and write `~/.kaioken/license.jwt`.
3. **Wire into Hosted Model Provider:**
   - In `apps/cli/src/model.ts`, when routing to Kaioken hosted models, verify that `claims.features.includes("hosted_proxy")`.
   - If missing or expired past grace period, abort with clear instruction: `"Run 'kaioken upgrade' to activate Pro hosted inference."`
4. **Implement In-Flight Immunity:** Pass an immutable session lease into the agent runtime driver so
   background timer ticks do not kill active tool executions.
5. **Verify Engine Gates:** Ensure `npm test` and `npm run typecheck` pass cleanly.

---

## In scope

- Client-side Ed25519 signature verification.
- Entitlement claims parsing and local caching.
- Enforcing in-flight session completion guarantees.

---

## Out of scope

- Generating private Ed25519 signing keys (stored securely in cloud deployment secrets).
- Hardware-locked node fingerprinting (unnecessary and hostile to developer environments).
- Obfuscating or encrypting open-source TypeScript code.

---

## Gates

From `kaioken_v2/`:

```bash
npm run typecheck
npm test
```

Specific entitlement test:
```bash
npx vitest run apps/cli/test/entitlements.test.ts
```

Offline verification:
```bash
node apps/cli/dist/bin.js scan --root .
```

---

## Traps

| Trap | Guard |
|---|---|
| Crashing mid-run when token expires | Always allow in-flight runs to complete cleanly up to the turn limit. Never corrupt a worktree |
| Requiring internet on every run | Cryptographic Ed25519 tokens validate offline. Allow a 14-day offline grace period |
| Hardcoding private keys in client code | Embed ONLY the public verification key in the client binary. The private key stays in the secure cloud |
| Gating Community features | Ensure `entitlements.check()` is never called in `scan`, `wiki`, or local BYOK code paths |

---

## Open questions

1. **What is the offline grace period duration?**
   - *Recommendation:* **14 calendar days**. Sufficient for business travel while limiting unpaid access.
   - *Owner:* Human maintainer.

---

## Session brief

```xml
<task>
In kaioken_v2/apps/cli/, implement cryptographic entitlement verification and license key management
using Ed25519 signatures, enforcing the fail-open-for-in-flight / fail-closed-for-new-runs policy:

1. Implement apps/cli/src/billing/entitlements.ts:
   - Interface EntitlementClaims: { userId, plan, features, issuedAt, expiresAt, gracePeriodUntil }.
   - Function verifyLicenseKey(rawJwt: string, publicKey: string): { ok: boolean; status: "valid" | "grace" | "expired" | "invalid"; claims?: EntitlementClaims }.
   - Function isFeatureEntitled(feature: string, claims?: EntitlementClaims): boolean.
2. In apps/cli/src/agent-host.ts:
   - Check entitlement before starting session that uses Kaioken hosted models.
   - If entitlement expires mid-session, do NOT terminate active run: allow session to finish,
     then append a billing renewal warning to the session transcript.
3. Add unit tests in apps/cli/test/entitlements.test.ts testing:
   - Valid signed token passes.
   - Tampered signature fails.
   - Expired token within grace period passes with warning; expired past grace period fails.
   - Offline validation requires zero network requests.
</task>

<verification_loop>
Run from kaioken_v2/:
  npm run typecheck
  npm test
  node apps/cli/dist/bin.js scan --root .
Confirm all unit tests pass and offline scan succeeds without credentials.
</verification_loop>

<action_safety>
Do NOT require entitlements for offline open-source commands (scan, wiki, local BYOK).
Do NOT embed private keys.
Leave all work uncommitted.
</action_safety>

<structured_output_contract>
End with: (1) entitlement implementation summary, (2) files touched, (3) test suite execution results,
(4) confirmation of graceful in-flight lapse handling.
</structured_output_contract>
```
