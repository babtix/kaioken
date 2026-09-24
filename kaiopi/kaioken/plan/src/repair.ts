/**
 * Self-repair JSON parser recovering from malformed replies (UX-1211 to UX-1220).
 *
 * LLMs frequently produce near-valid JSON with common syntax defects:
 * - Markdown fences with conversational preamble or postamble
 * - Trailing commas in objects and arrays
 * - Unquoted or single-quoted object keys
 * - Single-quoted string values
 * - Python-style booleans and nulls (True, False, None)
 * - Single-line and multi-line comments
 * - Truncation mid-stream due to max token limits
 *
 * This parser repairs these defects defensively and extracts structured data
 * without discarding good model output or crashing the pipeline.
 */

export interface RepairResult {
	repaired: string;
	fixes: string[];
}

export interface SelfRepairParseResult<T> {
	data: T | null;
	repaired: boolean;
	fixes: string[];
}

/**
 * Extracts and repairs malformed JSON from LLM replies.
 */
export function repairJson(raw: string): RepairResult {
	const fixes: string[] = [];
	let text = raw.trim();

	// 1. Strip markdown fences if present
	const fencedRegex = new RegExp("```(?:json)?\\s*\\n([\\s\\S]*?)```", "i");
	const fencedMatch = fencedRegex.exec(text);
	if (fencedMatch && fencedMatch[1]) {
		text = fencedMatch[1].trim();
		fixes.push("stripped_markdown_fence");
	} else if (text.startsWith("```")) {
		text = text.replace(new RegExp("^```(?:json)?\\s*", "i"), "").replace(new RegExp("```\\s*$", ""), "").trim();
		fixes.push("stripped_partial_markdown_fence");
	}

	// 2. Locate outermost JSON structure if surrounded by prose
	const firstBrace = text.indexOf("{");
	const firstBracket = text.indexOf("[");
	let startIdx = -1;

	if (firstBrace !== -1 && firstBracket !== -1) {
		startIdx = Math.min(firstBrace, firstBracket);
	} else if (firstBrace !== -1) {
		startIdx = firstBrace;
	} else if (firstBracket !== -1) {
		startIdx = firstBracket;
	}

	if (startIdx > 0) {
		text = text.slice(startIdx).trim();
		fixes.push("stripped_preamble_prose");
	}

	// 3. Strip single-line and multi-line comments
	const withoutLineComments = text.replace(/\/\/[^\n\r]*/g, (match) => {
		fixes.push("stripped_line_comment");
		return "";
	});
	const withoutBlockComments = withoutLineComments.replace(/\/\*[\s\S]*?\*\//g, (match) => {
		fixes.push("stripped_block_comment");
		return "";
	});
	text = withoutBlockComments;

	// 4. Normalize Python literals (True -> true, False -> false, None -> null)
	text = text.replace(/:\s*True\b/g, () => {
		fixes.push("normalized_python_true");
		return ": true";
	});
	text = text.replace(/:\s*False\b/g, () => {
		fixes.push("normalized_python_false");
		return ": false";
	});
	text = text.replace(/:\s*None\b/g, () => {
		fixes.push("normalized_python_none");
		return ": null";
	});
	text = text.replace(/\[\s*True\b/g, () => {
		fixes.push("normalized_python_true");
		return "[true";
	});
	text = text.replace(/\[\s*False\b/g, () => {
		fixes.push("normalized_python_false");
		return "[false";
	});
	text = text.replace(/\[\s*None\b/g, () => {
		fixes.push("normalized_python_none");
		return "[null";
	});

	// 5. Quote unquoted object keys: e.g. { id: "a", name: "b" } -> { "id": "a", "name": "b" }
	text = text.replace(
		/([{,]\s*)([A-Za-z0-9_$-]+)\s*:/g,
		(match, prefix, key) => {
			if (key === "true" || key === "false" || key === "null") return match;
			fixes.push("quoted_unquoted_key");
			return `${prefix}"${key}":`;
		},
	);

	// 6. Convert single-quoted string values/keys to double quotes: e.g. 'hello' -> "hello"
	text = text.replace(
		/'([^'\\]*(?:\\.[^'\\]*)*)'/g,
		(match, content) => {
			fixes.push("converted_single_quotes");
			// escape unescaped double quotes inside
			const escaped = content.replace(/"/g, '\\"');
			return `"${escaped}"`;
		},
	);

	// 7. Strip trailing commas before } or ]
	text = text.replace(/,\s*([}\]])/g, (match, close) => {
		fixes.push("stripped_trailing_comma");
		return close;
	});

	// 8. Auto-close truncated JSON if brackets/braces/quotes are unmatched
	text = autoCloseTruncatedJson(text, fixes);

	return { repaired: text, fixes: [...new Set(fixes)] };
}

/**
 * Closes unclosed quotes, brackets, and braces from truncated completions.
 */
function autoCloseTruncatedJson(text: string, fixes: string[]): string {
	let inString = false;
	let escaped = false;
	const stack: ("{" | "[")[] = [];

	for (let i = 0; i < text.length; i++) {
		const ch = text[i]!;
		if (escaped) {
			escaped = false;
			continue;
		}
		if (ch === "\\") {
			escaped = true;
			continue;
		}
		if (ch === '"') {
			inString = !inString;
			continue;
		}
		if (inString) {
			continue;
		}

		if (ch === "{" || ch === "[") {
			stack.push(ch);
		} else if (ch === "}") {
			if (stack.length > 0 && stack[stack.length - 1] === "{") {
				stack.pop();
			}
		} else if (ch === "]") {
			if (stack.length > 0 && stack[stack.length - 1] === "[") {
				stack.pop();
			}
		}
	}

	let result = text;

	// If cut off inside a string literal, close the quote
	if (inString) {
		result += '"';
		fixes.push("closed_unclosed_string");
	}

	// Clean trailing dangling punctuation (like trailing comma or dangling colon/key)
	result = result.replace(/,\s*$/, "");
	result = result.replace(/:\s*$/, ': ""');

	// If there are unclosed brackets/braces, close them in reverse order
	if (stack.length > 0) {
		while (stack.length > 0) {
			const open = stack.pop()!;
			if (open === "{") {
				result += "}";
				fixes.push("closed_unclosed_brace");
			} else if (open === "[") {
				result += "]";
				fixes.push("closed_unclosed_bracket");
			}
		}
	}

	return result;
}

/**
 * Attempts to parse JSON, automatically repairing malformed input on failure.
 */
export function parseSelfRepairJson<T>(raw: string): SelfRepairParseResult<T> {
	// 1. Direct parse attempt
	try {
		const direct = JSON.parse(raw.trim()) as T;
		return { data: direct, repaired: false, fixes: [] };
	} catch {
		// Proceed to self-repair
	}

	// 2. First-pass repair
	const { repaired, fixes } = repairJson(raw);
	try {
		const parsed = JSON.parse(repaired) as T;
		return { data: parsed, repaired: true, fixes };
	} catch {
		// Proceed to secondary structural recovery
	}

	// 3. Fallback: balanced span extraction
	const spans = [balancedSpan(raw, "{", "}"), balancedSpan(raw, "[", "]")];
	for (const span of spans) {
		if (!span) continue;
		try {
			const parsed = JSON.parse(span) as T;
			return { data: parsed, repaired: true, fixes: [...fixes, "extracted_balanced_span"] };
		} catch {
			const spanRepair = repairJson(span);
			try {
				const parsed = JSON.parse(spanRepair.repaired) as T;
				return {
					data: parsed,
					repaired: true,
					fixes: [...fixes, "extracted_balanced_span", ...spanRepair.fixes],
				};
			} catch {
				// Continue trying
			}
		}
	}

	// 4. Truncated array item recovery: if root has `{"modules": [...]}` but the last element is mangled
	const recovered = recoverPartialArray(raw, fixes);
	if (recovered) {
		return { data: recovered as T, repaired: true, fixes };
	}

	return { data: null, repaired: false, fixes };
}

/**
 * Extracts and parses JSON using self-repair, throwing an informative error if unrecoverable.
 */
export function extractRepairJson<T>(reply: string): T {
	const result = parseSelfRepairJson<T>(reply);
	if (result.data !== null) {
		return result.data;
	}
	throw new Error("model reply contained no parseable or repairable JSON");
}

function balancedSpan(text: string, open: string, close: string): string | null {
	const start = text.indexOf(open);
	if (start === -1) return null;

	let depth = 0;
	let inString = false;
	let escaped = false;

	for (let i = start; i < text.length; i++) {
		const ch = text[i]!;

		if (escaped) {
			escaped = false;
			continue;
		}
		if (ch === "\\") {
			escaped = true;
			continue;
		}
		if (ch === '"') {
			inString = !inString;
			continue;
		}
		if (inString) continue;

		if (ch === open) depth++;
		else if (ch === close) {
			depth--;
			if (depth === 0) return text.slice(start, i + 1);
		}
	}

	return null;
}

/**
 * Recovers valid objects from a truncated array in `modules`.
 */
function recoverPartialArray(raw: string, fixes: string[]): Record<string, unknown> | null {
	// Look for pattern `{"modules": [`
	const match = /"modules"\s*:\s*\[([\s\S]*)/i.exec(raw);
	if (!match || !match[1]) return null;

	const content = match[1];
	const objects: unknown[] = [];
	let depth = 0;
	let start = -1;
	let inString = false;
	let escaped = false;

	for (let i = 0; i < content.length; i++) {
		const ch = content[i]!;
		if (escaped) {
			escaped = false;
			continue;
		}
		if (ch === "\\") {
			escaped = true;
			continue;
		}
		if (ch === '"') {
			inString = !inString;
			continue;
		}
		if (inString) continue;

		if (ch === "{") {
			if (depth === 0) start = i;
			depth++;
		} else if (ch === "}") {
			depth--;
			if (depth === 0 && start !== -1) {
				const objStr = content.slice(start, i + 1);
				try {
					objects.push(JSON.parse(objStr));
				} catch {
					const rep = repairJson(objStr);
					try {
						objects.push(JSON.parse(rep.repaired));
					} catch {
						// skip corrupted item
					}
				}
				start = -1;
			}
		}
	}

	if (objects.length > 0) {
		fixes.push("recovered_partial_array_items");
		return { modules: objects };
	}

	return null;
}
