# Task 15: Improve `@kaioken/research`

## Target Package
`kaioken/research`

## Files to Inspect & Modify
- [kaioken/research/src/run.ts](file:///d:/project/ai_now_know/kaioken_kaiopi/kaioken/research/src/run.ts)
- [kaioken/research/src/ports.ts](file:///d:/project/ai_now_know/kaioken_kaiopi/kaioken/research/src/ports.ts)
- [kaioken/research/src/sanitize.ts](file:///d:/project/ai_now_know/kaioken_kaiopi/kaioken/research/src/sanitize.ts)
- [kaioken/research/test/research.test.ts](file:///d:/project/ai_now_know/kaioken_kaiopi/kaioken/research/test/research.test.ts)

---

## Problem Description

1. **Serial HTTP Page Fetching**:
   In `run.ts` (lines 89–105):
   ```ts
   for (const hit of unique) {
       ...
       result = await input.fetch.fetch(hit.url);
   }
   ```
   Web search hits are fetched strictly serially. When fetching 10 sources, each taking 1–2 seconds, the gather phase blocks for 15–20 seconds.
   - *Fix needed*: Use bounded concurrency (e.g. `mapLimit` with concurrency of 4–6) to fetch web pages concurrently.

2. **SSRF Filter Bypass via DNS Rebinding**:
   In `ports.ts` (lines 88–105), `isFetchableUrl()` only checks the URL protocol, host suffixes (`localhost`, `.internal`), and literal IPv4/IPv6 address strings.
   - An attacker or adversarial webpage can return a domain (e.g. `rebind.example.com`) whose DNS initially resolves to a public IP but re-binds to `127.0.0.1` or `169.254.169.254` (cloud metadata service) upon connection.
   - *Fix needed*: Validate that the resolved IP address from DNS lookup is not in private/reserved CIDR blocks before socket connection, or document safe port usage.

3. **Regex-Based HTML to Text Stripping**:
   In `sanitize.ts` (lines 20–49), HTML tags and script/style contents are stripped using regular expressions:
   `text.replace(new RegExp(...)`
   Malformed HTML, nested tags, or unusual encodings can leave active script/injection payloads unstripped.
   - *Fix needed*: Use a robust tokenizer or dedicated HTML-to-text parser rather than naive regexes.

---

## Verification & Acceptance Criteria
- Run `npm test -w kaioken/research` and ensure all tests pass.
- Add test verifying concurrent fetching with `mapLimit`.
- Add test verifying that DNS rebind or IP-based evasion attempts are guarded.
