# M12-01 · Registry launch and moderation policy

> Deploy the registry-web portal to production, open the GitHub-backed extension submission flow, and publish a binding moderation and security incident response policy.

| Field | Value |
|---|---|
| **Status** | `blocked` |
| **Size** | M |
| **Depends on** | `registry-web/`, `02-extension-sdk-v1.md`, [`roadmap/decisions/d1-license.md`](../decisions/d1-license.md) |
| **Blocks** | `05-v2-release-checklist.md` |
| **Touches** | `registry-web/`, `registry-web/content/`, `registry-web/api/` |
| **Risk** | High. Hosting a third-party extension registry incurs legal, security, and supply-chain liability. A moderation policy is a legally binding operational obligation. |
| **Gate-critical** | No |

## Why this exists

Kaioken features an extensible architecture: `packages/ext` allows third parties to contribute declarative knowledge schemas, Model Context Protocol (MCP) server configurations, and WebAssembly (WASM) analysis tools ([`kaioken_v2/packages/ext/src/manifest.ts:19-24`](file:///D:/project/ai_now_know/kaioken_v2/packages/ext/src/manifest.ts#L19-L24)).

To make these extensions discoverable, `registry-web/` was created as the public directory. Its architecture is deliberately lightweight: **there is no database** ([`registry-web/README.md:11`](file:///D:/project/ai_now_know/registry-web/README.md#L11)). GitHub is the single source of truth:
- The registry index is `community-extensions.json` in `babtix/kaioken-extensions`.
- Submissions are structured, pre-validated GitHub pull requests.
- Installs pull directly from release artifacts in authors' own repositories.

However, **a moderation policy is a real operational obligation, not a marketing checkbox.** Third-party MCP servers execute local processes on user machines; WASM modules run in the engine sandbox. The project cannot launch a public registry without:
1. Clear criteria for accepting or rejecting submissions.
2. A defined incident response protocol for compromised or malicious packages.
3. An automated verification pipeline enforcing schema compliance and scanning for supply-chain risks.

## Current state

Verified against the working tree.

| Fact | Evidence |
|---|---|
| Registry frontend is implemented | `registry-web/` (React 19, Vite 6, Tailwind 4) |
| Architecture is database-free over GitHub | `registry-web/README.md:11` — index is `community-extensions.json` in `babtix/kaioken-extensions` |
| Submission wizard uses manifest validation | `registry-web/api/validate.ts` and `registry-web/api/_lib/manifest.ts` |
| Submitting guide exists in draft form | `registry-web/content/submitting.md` |
| Extension manifest types defined | `kaioken_v2/packages/ext/src/manifest.ts:25` (`"declarative" | "mcp" | "wasm"`) |
| Malicious flag enforced by CLI | `registry-web/README.md:20` and `kaioken_v2/packages/ext/src/install.ts` |

`UNVERIFIED:` Production deployment credentials (`vercel link` and DNS configuration for `registry.kaioken.dev` or equivalent).

## What done looks like

- [ ] A formal `MODERATION.md` and `SECURITY.md` are published in `registry-web/content/` and `babtix/kaioken-extensions`.
- [ ] The policy specifies: (1) automated review gates, (2) human review SLAs (<72 hours), (3) prohibited behaviors (data exfiltration, obfuscation, cryptomining), (4) takedown procedure.
- [ ] The automated submission validator (`POST /api/validate` in `registry-web/api/validate.ts`) enforces the frozen `extension.v1.json` schema from M12-02.
- [ ] The submit wizard (`registry-web/src/pages/Submit.tsx`) generates pre-filled PR URLs targeting `babtix/kaioken-extensions`.
- [ ] `registry-web` builds cleanly (`npm run build` from `registry-web/`) and passes its vitest suite.
- [ ] The site is deployed to Vercel production and verifies connectivity against the live GitHub extensions repository.

## Steps

1. **Author the Binding Moderation Policy.**
   - Draft `registry-web/content/moderation-policy.md`:
     - Scope: declarative docs, MCP commands, WASM binaries.
     - Review protocol: automated manifest validation, package hash pinning, source code availability.
     - Malicious package response: immediate revocation, adding package ID to CLI `malicious` blocklist, public CVE disclosure.
2. **Harden Submission Validation (`registry-web/api/validate.ts`).**
   - Import the frozen JSON Schema from M12-02 (`packages/ext/schema/extension.v1.json`).
   - Validate repository URL format, release tag existence, and manifest syntax.
   - Flag any requested permissions beyond `["read_repo", "network"]` ([`kaioken_v2/packages/ext/src/manifest.ts:70`](file:///D:/project/ai_now_know/kaioken_v2/packages/ext/src/manifest.ts#L70)).
3. **Verify Frontend UI Pages.**
   - Verify `Browse.tsx`, `Detail.tsx`, `Submit.tsx`, and `Docs.tsx` render correctly.
   - Ensure the trust panel ([`registry-web/src/components/TrustPanel.tsx`](file:///D:/project/ai_now_know/registry-web/src/components/TrustPanel.tsx)) clearly distinguishes between declarative (zero-risk) and executable (MCP/WASM) extensions.
4. **Deploy to Vercel.**
   - Execute `vercel link` and `vercel deploy --prod` from `registry-web/`.
   - Configure optional `GITHUB_TOKEN` secret in Vercel to increase API rate limits.
5. **Verify End-to-End Submission.**
   - Run a test submission PR against `babtix/kaioken-extensions` using the template at `babtix/kaioken-extension-template`.

## In scope

- Moderation and security documentation under `registry-web/content/`.
- Validation API hardening in `registry-web/api/`.
- Front-end trust badge display in `registry-web/src/`.
- Production deployment configuration.

## Out of scope

- Database backend implementation — the database-free GitHub architecture is a permanent invariant.
- Implementing an automated payment or paid extension marketplace — refused non-goal.
- Modifying the CLI's installation logic (`kaioken_v2/packages/ext/src/install.ts`).

## Gates

Run from `registry-web/`:

```bash
npm run test
npm run build
```

Verify manifest validation endpoint locally:

```bash
npm run test -- api/_lib/__tests__/manifest.test.ts
```

## Traps

| Trap | Guard |
|---|---|
| Hand-waving security obligations | Executable extensions (MCP, WASM) run on developer hardware. Publish explicit security guarantees and emergency takedown steps. |
| Introducing a database | Maintain the architectural invariant: GitHub PRs and `community-extensions.json` are the only database. Do not spin up Postgres or MongoDB. |
| Permitting unrestricted WASM permissions | Reject any extension manifest asking for undeclared permissions outside `read_repo` and `network`. |
| Launching without schema freeze | Gated behind M12-02: the extension schema must be frozen before opening public submissions. |
| Commercial licensing collision | License Zero Noncommercial 2.0.1 prevents commercial companies from publishing or consuming extensions. Address this in the registry terms. |

## Open questions

1. **Commercial Licensing for Third-Party Ecosystem:** Resolved by [`roadmap/decisions/d1-license.md`](../decisions/d1-license.md). Third-party extension authors and developers in commercial firms cannot legally publish or consume extensions from the public registry under License Zero Noncommercial 2.0.1. A formal resolution between Path A (stay noncommercial), Path B (dual-license), or Path C (permissive open-core) is required to establish the registry's terms of service.

## Session brief

```xml
<task>
In registry-web/, prepare the public extension registry for launch by formalizing the moderation policy, locking down submission validation, and verifying production builds.

The registry is deliberately database-free: GitHub is the source of truth (community-extensions.json in babtix/kaioken-extensions), and submissions are pre-validated GitHub PRs.

1. Create registry-web/content/moderation-policy.md:
   - Detail the evaluation criteria for extension submissions.
   - Explain how security trust tiers work: Declarative (documents only, zero execution risk), MCP (external server process, runs in install dir), WASM (sandboxed WebAssembly module).
   - Detail the emergency takedown procedure: how compromised packages are flagged as "malicious" in the registry index and blocked by the CLI.
   - Specify a 72-hour review SLA for incoming pull requests.
2. In registry-web/api/_lib/manifest.ts and registry-web/api/validate.ts:
   - Ensure manifest validation strictly aligns with the frozen extension.yaml schema from packages/ext/src/manifest.ts.
   - Reject unknown permissions outside "read_repo" and "network".
   - Enforce lowercase kebab-case for extension IDs ("owner.name").
3. Verify the frontend pages render trust indicators:
   - Confirm TrustPanel.tsx clearly informs users about MCP/WASM execution risks.
4. Run vitest test suite in registry-web/ and verify all tests pass.
</task>

<verification_loop>
Run from registry-web/:
  npm run test
  npm run build
Ensure Vite build completes without TypeScript or bundle errors.
Confirm that moderation-policy.md is accessible in the site's docs routing.
</verification_loop>

<missing_context_gating>
Read registry-web/README.md and registry-web/api/_lib/types.ts to understand the data flow.
Do not introduce a database. Maintain GitHub PR submission flow.
</missing_context_gating>

<action_safety>
Scope strictly to registry-web/. Do not modify kaioken_v2/ or .kaioken_v1/.
Do NOT run git add or git commit — leave all changes uncommitted in the working tree.
</action_safety>

<structured_output_contract>
End with: (1) summary of moderation policy and submission updates, (2) files touched, (3) registry-web test and build output, (4) how the database-free architecture was preserved.
</structured_output_contract>
```
