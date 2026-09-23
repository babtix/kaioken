/**
 * Text analysis. Indexing and querying both come through here, so the two sides
 * can never disagree about what a token is.
 *
 * Beyond lowercasing and splitting on non-alphanumerics, this emits the parts of
 * compound identifiers: a query for "wiki search" has to hit a passage that only
 * ever writes `handleWikiSearch`. That is the single most common way a search
 * over a code repository misses.
 */

/**
 * Deliberately short. An aggressive stopword list hurts technical queries, where
 * words like "get", "set" and "run" carry real meaning.
 */
const STOPWORDS = new Set(
	`a an and are as at be but by for from how if in into is it its of on or that
	 the their then there these this to was were what when where which who will
	 with you your`
		.split(/\s+/)
		.filter(Boolean),
);

export function isStopword(word: string): boolean {
	return STOPWORDS.has(word);
}

/** Tokens are at least two characters: single letters match everything. */
const MIN_TOKEN = 2;

export function analyze(text: string): string[] {
	const out: string[] = [];
	let word = "";

	const emit = () => {
		if (word.length === 0) return;
		const raw = word;
		word = "";

		const lower = raw.toLowerCase();
		if (lower.length >= MIN_TOKEN && !isStopword(lower)) out.push(lower);

		// Case survives until after the split — that is what makes the camelCase
		// boundary visible at all.
		for (const part of splitIdentifier(raw)) {
			if (part !== lower && part.length >= MIN_TOKEN && !isStopword(part)) out.push(part);
		}
	};

	for (const ch of text) {
		if (isAlphanumeric(ch)) word += ch;
		else emit();
	}
	emit();

	return out;
}

/**
 * Break camelCase, PascalCase and digit boundaries. Separators have already been
 * flattened by the caller, so snake_case and kebab-case arrive as separate words
 * and need no handling here. A word with no internal boundary returns [] rather
 * than itself, so the caller can skip the duplicate.
 */
export function splitIdentifier(word: string): string[] {
	const parts: string[] = [];
	const runes = [...word];
	let cur = "";

	for (let i = 0; i < runes.length; i++) {
		const ch = runes[i] as string;
		if (i > 0) {
			const prev = runes[i - 1] as string;
			const boundary =
				(isUpper(ch) && !isUpper(prev)) || isDigit(ch) !== isDigit(prev);
			// The acronym case: in "HTTPServer" the break belongs before the S,
			// not after it — so a lowercase letter following two uppercase ones
			// splits backwards.
			const acronymEnd =
				isLower(ch) && isUpper(prev) && i >= 2 && isUpper(runes[i - 2] as string);

			if (acronymEnd && cur.length > 1) {
				parts.push(cur.slice(0, -1).toLowerCase());
				cur = prev;
			} else if (boundary && cur.length > 0) {
				parts.push(cur.toLowerCase());
				cur = "";
			}
		}
		cur += ch;
	}

	if (cur.length > 0) parts.push(cur.toLowerCase());
	return parts.length < 2 ? [] : parts;
}

function isAlphanumeric(ch: string): boolean {
	return /\p{L}|\p{N}/u.test(ch);
}

function isUpper(ch: string): boolean {
	return /\p{Lu}/u.test(ch);
}

function isLower(ch: string): boolean {
	return /\p{Ll}/u.test(ch);
}

function isDigit(ch: string): boolean {
	return /\p{Nd}/u.test(ch);
}
