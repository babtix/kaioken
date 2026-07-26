Clients must be initialized with a non-empty API key (checked in NewForProvider and New)
HTTP client uses a 300-second timeout (set in Client initialization)
Chat requests use temperature 0.2 (factual output), ChatWithTools uses 0.3
Requests include fixed headers: Authorization (Bearer), Content-Type, HTTP-Referer (https://github.com/local/kaioken), and X-Title (kaioken)
On 402 (payment required) errors, extract affordable token count from response, update internal ceiling, and retry immediately without backoff
For NVIDIA providers: if generic endpoint fails with 'Not found for account', retry via model-specific URL; if that fails with plain 404, revert to generic to surface actionable error
Tool-calling requests set tool_choice to 'auto' when tools are provided
ChatJSON attempts one automatic repair round if model output isn't valid JSON
Stream processing does not retry once any content has been emitted (to avoid duplication)
Token budget ceiling only ever decreases (ratchets downward) during client lifetime
