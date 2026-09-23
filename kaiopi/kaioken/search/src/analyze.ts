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
		if (lower.length >= MIN_TOKEN && !isStopword(lower)) {
			const s = stem(lower);
			if (s.length >= MIN_TOKEN && !isStopword(s)) out.push(s);
		}

		// Case survives until after the split — that is what makes the camelCase
		// boundary visible at all.
		for (const part of splitIdentifier(raw)) {
			if (part !== lower && part.length >= MIN_TOKEN && !isStopword(part)) {
				const s = stem(part);
				if (s.length >= MIN_TOKEN && !isStopword(s)) out.push(s);
			}
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

function isVowel(word: string, i: number): boolean {
	const ch = word[i];
	if (ch === "a" || ch === "e" || ch === "i" || ch === "o" || ch === "u") return true;
	if (ch === "y") {
		if (i === 0) return false;
		return !isVowel(word, i - 1);
	}
	return false;
}

function measure(s: string): number {
	let count = 0;
	let i = 0;
	const len = s.length;
	while (i < len && !isVowel(s, i)) i++;
	while (i < len) {
		while (i < len && isVowel(s, i)) i++;
		if (i >= len) break;
		while (i < len && !isVowel(s, i)) i++;
		count++;
	}
	return count;
}

function hasVowel(s: string): boolean {
	for (let i = 0; i < s.length; i++) {
		if (isVowel(s, i)) return true;
	}
	return false;
}

function endsWithDoubleConsonant(s: string): boolean {
	const len = s.length;
	if (len < 2) return false;
	const ch1 = s[len - 1];
	const ch2 = s[len - 2];
	return ch1 === ch2 && !isVowel(s, len - 1);
}

function endsWithCvc(s: string): boolean {
	const len = s.length;
	if (len < 3) return false;
	if (isVowel(s, len - 3) || !isVowel(s, len - 2) || isVowel(s, len - 1)) return false;
	const last = s[len - 1];
	return last !== "w" && last !== "x" && last !== "y";
}

/**
 * Lightweight algorithmic stemmer (Porter-style). Dependency-free,
 * reduces common inflections so e.g. "connecting" matches "connection"/"connect".
 */
export function stem(word: string): string {
	if (word.length <= 2) return word;
	if (!/^[a-z]+$/.test(word)) return word;

	let w = word;

	// Step 1a: plurals
	if (w.endsWith("sses")) {
		w = w.slice(0, -2);
	} else if (w.endsWith("ies")) {
		w = w.length > 4 ? `${w.slice(0, -3)}y` : w.slice(0, -1);
	} else if (w.endsWith("ches") || w.endsWith("shes") || w.endsWith("xes") || w.endsWith("zes")) {
		w = w.slice(0, -2);
	} else if (w.endsWith("s") && !w.endsWith("ss") && !w.endsWith("us") && !w.endsWith("is")) {
		if (hasVowel(w.slice(0, -1))) {
			w = w.slice(0, -1);
		}
	}

	// Step 1b: -eed, -ed, -ing
	let step1b = false;
	if (w.endsWith("eed")) {
		if (measure(w.slice(0, -3)) > 0) w = w.slice(0, -1);
	} else if (w.endsWith("ed")) {
		const stem = w.slice(0, -2);
		if (hasVowel(stem)) {
			w = stem;
			step1b = true;
		}
	} else if (w.endsWith("ing")) {
		const stem = w.slice(0, -3);
		if (hasVowel(stem)) {
			w = stem;
			step1b = true;
		}
	}

	if (step1b) {
		if (w.endsWith("at") || w.endsWith("bl") || w.endsWith("iz")) {
			w += "e";
		} else if (
			endsWithDoubleConsonant(w) &&
			!w.endsWith("l") &&
			!w.endsWith("s") &&
			!w.endsWith("z")
		) {
			w = w.slice(0, -1);
		} else if (measure(w) === 1 && endsWithCvc(w)) {
			w += "e";
		}
	}

	// Step 2 & 4: Derivational suffixes
	if (w.endsWith("ion")) {
		const stem = w.slice(0, -3);
		if ((stem.endsWith("s") || stem.endsWith("t")) && measure(stem) >= 1) {
			w = stem;
		}
	} else if (w.endsWith("tional")) {
		const stem = w.slice(0, -6);
		if (measure(stem) >= 1) w = `${stem}tion`;
	} else if (w.endsWith("ation")) {
		const stem = w.slice(0, -5);
		if (measure(stem) >= 1) w = `${stem}e`;
	} else if (w.endsWith("able") || w.endsWith("ible")) {
		const stem = w.slice(0, -4);
		if (measure(stem) >= 1) w = stem;
	} else if (w.endsWith("ment")) {
		const stem = w.slice(0, -4);
		if (measure(stem) >= 2) w = stem;
	} else if (w.endsWith("ful")) {
		const stem = w.slice(0, -3);
		if (measure(stem) >= 1) w = stem;
	} else if (w.endsWith("ness")) {
		const stem = w.slice(0, -4);
		if (measure(stem) >= 1) w = stem;
	}

	return w;
}

