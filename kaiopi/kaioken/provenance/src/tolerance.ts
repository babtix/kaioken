import type {
	CategoryToleranceConfig,
	DocCategory,
	DriftKind,
	ToleranceConfig,
	ToleranceEvaluation,
} from "./types.ts";

/**
 * Remove comments from source text across multiple languages
 * (C/JS/TS // and /* *\/, Python/Shell #, HTML/Markdown <!-- -->, SQL/Lua --).
 */
export function stripComments(text: string): string {
	let result = text;
	// Multi-line block comments /* ... */
	result = result.replace(/\/\*[\s\S]*?\*\//g, "");
	// HTML / XML / Markdown comments <!-- ... -->
	result = result.replace(/<!--[\s\S]*?-->/g, "");
	// Python multiline docstrings """ ... """ or ''' ... '''
	result = result.replace(/"""[\s\S]*?"""/g, "");
	result = result.replace(/'''[\s\S]*?'''/g, "");
	// Single line comments: //, #, --
	result = result.replace(/(^|[ \t])(\/\/|#|--).*$/gm, "$1");
	return result;
}

/**
 * Normalize whitespace by collapsing whitespace characters and stripping whitespace around syntactic operators/brackets.
 */
export function stripWhitespace(text: string): string {
	return text
		.replace(/\r\n/g, "\n")
		.replace(/\s+/g, " ")
		.replace(/\s*([(){}[\]:;,=<>+\-*/&|!~^?])\s*/g, "$1")
		.trim();
}

/**
 * Normalize source text according to tolerance configuration rules.
 */
export function normalizeForTolerance(
	text: string,
	options: CategoryToleranceConfig,
): string {
	let normalized = text;
	if (options.ignoreDocstrings || options.ignoreComments) {
		normalized = stripComments(normalized);
	}
	if (options.ignoreWhitespace) {
		normalized = stripWhitespace(normalized);
	}
	return normalized;
}

/**
 * Default tolerance configuration.
 * By default, ignores comments and whitespace across all categories, with strict semantic zero diff tolerance.
 */
export function createDefaultToleranceConfig(): ToleranceConfig {
	return {
		default: {
			ignoreComments: true,
			ignoreWhitespace: true,
			ignoreDocstrings: true,
			maxAllowedDiffPercentage: 0, // 0 = require exact match after normalization
		},
		byCategory: {
			security: {
				ignoreComments: true,
				ignoreWhitespace: true,
				ignoreDocstrings: false, // Security docstrings/policies might be sensitive
				maxAllowedDiffPercentage: 0,
			},
			api: {
				ignoreComments: true,
				ignoreWhitespace: true,
				ignoreDocstrings: true,
				maxAllowedDiffPercentage: 0,
			},
			architecture: {
				ignoreComments: true,
				ignoreWhitespace: true,
				ignoreDocstrings: true,
				maxAllowedDiffPercentage: 0,
			},
			tutorials: {
				ignoreComments: true,
				ignoreWhitespace: true,
				ignoreDocstrings: true,
				maxAllowedDiffPercentage: 0,
			},
		},
	};
}

/**
 * Evaluates whether a detected diff between old and new source text is tolerated
 * (e.g. comment-only, whitespace-only, formatting-only edits)
 * across any of the 10 documentation artifact types (UX-0871 - UX-0880).
 */
export function isDriftWithinTolerance(
	oldSource: string,
	newSource: string,
	category: DocCategory,
	config?: ToleranceConfig,
): ToleranceEvaluation {
	if (oldSource === newSource) {
		return {
			isTolerated: true,
			category,
			reason: "Identical content; no drift detected.",
			detectedDriftKind: "comment_only",
			effectiveDiffPercentage: 0,
		};
	}

	const activeConfig = config ?? createDefaultToleranceConfig();
	const catConfig: CategoryToleranceConfig = {
		...activeConfig.default,
		...(activeConfig.byCategory?.[category] ?? {}),
	};

	const normOld = normalizeForTolerance(oldSource, catConfig);
	const normNew = normalizeForTolerance(newSource, catConfig);

	if (normOld === normNew) {
		const isCommentOnly =
			stripComments(oldSource) === stripComments(newSource);
		const isWhitespaceOnly =
			stripWhitespace(oldSource) === stripWhitespace(newSource);

		let reason = "Drift is within configured tolerance.";
		if (isCommentOnly && isWhitespaceOnly) {
			reason = "Edits consist solely of whitespace and formatting.";
		} else if (isCommentOnly) {
			reason = "Edits consist solely of comments / docstrings.";
		} else if (isWhitespaceOnly) {
			reason = "Edits consist solely of whitespace changes.";
		}

		return {
			isTolerated: true,
			category,
			reason,
			detectedDriftKind: "comment_only",
			effectiveDiffPercentage: 0,
		};
	}

	// Calculate rough diff percentage between normalized texts
	const maxLen = Math.max(normOld.length, normNew.length);
	const lenDiff = Math.abs(normOld.length - normNew.length);
	const diffPct = maxLen === 0 ? 0 : Math.round((lenDiff / maxLen) * 100);

	const maxAllowed = catConfig.maxAllowedDiffPercentage ?? 0;
	if (diffPct <= maxAllowed && maxAllowed > 0) {
		return {
			isTolerated: true,
			category,
			reason: `Drift diff (${diffPct}%) is within allowed category threshold (${maxAllowed}%).`,
			detectedDriftKind: "body_modified",
			effectiveDiffPercentage: diffPct,
		};
	}

	return {
		isTolerated: false,
		category,
		reason: `Semantic code drift detected (${diffPct}% diff) exceeding category threshold.`,
		detectedDriftKind: "body_modified",
		effectiveDiffPercentage: diffPct,
	};
}
