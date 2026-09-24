import type { Card, CardDuplicateCluster, CardEntryPoint, CardSimilarity, CardVerification, DeduplicationResult } from "./types.ts";

/**
 * Tokenize a string into a set of normalized lowercase words.
 */
function tokenizeWords(text: string): Set<string> {
	if (!text) return new Set();
	const words = text
		.toLowerCase()
		.replace(/[^a-z0-9_\-\s]/g, " ")
		.split(/\s+/)
		.filter((w) => w.length > 2);
	return new Set(words);
}

/**
 * Compute Jaccard similarity between two sets: |A ∩ B| / |A ∪ B|
 */
function jaccardSimilarity<T>(setA: Set<T>, setB: Set<T>): number {
	if (setA.size === 0 && setB.size === 0) return 1.0;
	if (setA.size === 0 || setB.size === 0) return 0.0;

	let intersection = 0;
	for (const item of setA) {
		if (setB.has(item)) intersection++;
	}
	const union = setA.size + setB.size - intersection;
	return union > 0 ? intersection / union : 0.0;
}

/**
 * Calculate multi-dimensional similarity between two knowledge cards (UX-1331 to UX-1340).
 * Measures source file overlap, cited symbol overlap, and lexical summary/keypoint overlap.
 */
export function calculateCardSimilarity(cardA: Card, cardB: Card): CardSimilarity {
	if (cardA.moduleId === cardB.moduleId) {
		return {
			cardAId: cardA.moduleId,
			cardBId: cardB.moduleId,
			fileOverlap: 1.0,
			symbolOverlap: 1.0,
			contentOverlap: 1.0,
			combinedScore: 1.0,
		};
	}

	// 1. Source file overlap
	const filesA = new Set(cardA.sources.map((s) => s.path));
	const filesB = new Set(cardB.sources.map((s) => s.path));
	const fileOverlap = jaccardSimilarity(filesA, filesB);

	// 2. Cited entry point symbol overlap
	const symsA = new Set(cardA.entryPoints.map((e) => e.name.toLowerCase()));
	const symsB = new Set(cardB.entryPoints.map((e) => e.name.toLowerCase()));
	const symbolOverlap = jaccardSimilarity(symsA, symsB);

	// 3. Content word overlap (summary + key points)
	const wordsA = tokenizeWords(`${cardA.summary} ${cardA.keyPoints.join(" ")}`);
	const wordsB = tokenizeWords(`${cardB.summary} ${cardB.keyPoints.join(" ")}`);
	const contentOverlap = jaccardSimilarity(wordsA, wordsB);

	// Weighted score: file and symbol overlap are stronger signals of duplication than generic prose
	const combinedScore = Number(
		(0.45 * fileOverlap + 0.35 * symbolOverlap + 0.20 * contentOverlap).toFixed(4),
	);

	return {
		cardAId: cardA.moduleId,
		cardBId: cardB.moduleId,
		fileOverlap: Number(fileOverlap.toFixed(4)),
		symbolOverlap: Number(symbolOverlap.toFixed(4)),
		contentOverlap: Number(contentOverlap.toFixed(4)),
		combinedScore,
	};
}

/**
 * Detect pairs or clusters of duplicate or heavily overlapping knowledge cards.
 */
export function detectDuplicateCards(
	cards: readonly Card[],
	threshold = 0.65,
): CardDuplicateCluster[] {
	const clusters: CardDuplicateCluster[] = [];
	const assigned = new Set<string>();

	for (let i = 0; i < cards.length; i++) {
		const cardA = cards[i] as Card;
		if (assigned.has(cardA.moduleId)) continue;

		const duplicates: Card[] = [];
		let maxSimilarity = 0;

		for (let j = i + 1; j < cards.length; j++) {
			const cardB = cards[j] as Card;
			if (assigned.has(cardB.moduleId)) continue;

			const sim = calculateCardSimilarity(cardA, cardB);
			if (sim.combinedScore >= threshold) {
				duplicates.push(cardB);
				assigned.add(cardB.moduleId);
				if (sim.combinedScore > maxSimilarity) {
					maxSimilarity = sim.combinedScore;
				}
			}
		}

		if (duplicates.length > 0) {
			assigned.add(cardA.moduleId);
			const clusterCards = [cardA, ...duplicates];
			// Canonical card is the one with highest grounding score or most verified entry points
			clusterCards.sort((a, b) => (b.verification?.grounded ?? 0) - (a.verification?.grounded ?? 0));
			const canonical = clusterCards[0] as Card;
			const otherIds = clusterCards.filter((c) => c.moduleId !== canonical.moduleId).map((c) => c.moduleId);

			clusters.push({
				canonicalModuleId: canonical.moduleId,
				duplicateModuleIds: otherIds,
				cards: clusterCards,
				similarity: maxSimilarity,
			});
		}
	}

	return clusters;
}

/**
 * Merge two overlapping knowledge cards into a single authoritative card.
 */
export function mergeDuplicateCards(cardA: Card, cardB: Card): Card {
	// Canonical base is the one with higher grounding score or alphabetically first
	const scoreA = cardA.verification?.score ?? 0;
	const scoreB = cardB.verification?.score ?? 0;
	const [base, secondary] = scoreA >= scoreB ? [cardA, cardB] : [cardB, cardA];

	// 1. Merge summary: use base summary if comprehensive, else combine distinct sentences
	let summary = base.summary;
	if (secondary.summary && secondary.summary !== base.summary && !summary.includes(secondary.summary.slice(0, 30))) {
		summary = `${base.summary} (Also: ${secondary.summary})`;
	}

	// 2. Merge key points: deduplicate normalized points
	const keyPoints: string[] = [...base.keyPoints];
	const seenKp = new Set(base.keyPoints.map((kp) => kp.toLowerCase().trim()));
	for (const kp of secondary.keyPoints) {
		const norm = kp.toLowerCase().trim();
		if (!seenKp.has(norm)) {
			seenKp.add(norm);
			keyPoints.push(kp);
		}
	}

	// 3. Merge entry points: union by (name + file), preserving line/kind/note
	const entryPointsMap = new Map<string, CardEntryPoint>();
	for (const ep of [...base.entryPoints, ...secondary.entryPoints]) {
		const key = `${ep.name}::${ep.file}`;
		const existing = entryPointsMap.get(key);
		if (!existing) {
			entryPointsMap.set(key, { ...ep });
		} else {
			// Upgrade with line or kind if missing
			if (!existing.line && ep.line) existing.line = ep.line;
			if (!existing.kind && ep.kind) existing.kind = ep.kind;
			if (!existing.note && ep.note) existing.note = ep.note;
		}
	}
	const entryPoints = [...entryPointsMap.values()];

	// 4. Merge sources: union by path
	const sourcesMap = new Map<string, { path: string; hash: string }>();
	for (const s of [...base.sources, ...secondary.sources]) {
		const existing = sourcesMap.get(s.path);
		if (!existing || (!existing.hash && s.hash)) {
			sourcesMap.set(s.path, { path: s.path, hash: s.hash });
		}
	}
	const sources = [...sourcesMap.values()];

	// 5. Merge verification
	const grounded = entryPoints.filter((e) => Boolean(e.line)).length || Math.max(base.verification?.grounded ?? 0, secondary.verification?.grounded ?? 0);
	const ungrounded = [
		...new Set([
			...(base.verification?.ungrounded ?? []),
			...(secondary.verification?.ungrounded ?? []),
		]),
	].filter((sym) => !entryPoints.some((e) => e.name === sym && e.line));

	const unknownFiles = [
		...new Set([
			...(base.verification?.unknownFiles ?? []),
			...(secondary.verification?.unknownFiles ?? []),
		]),
	];

	const uncovered = [
		...new Set([
			...(base.verification?.uncovered ?? []),
			...(secondary.verification?.uncovered ?? []),
		]),
	];

	const total = grounded + ungrounded.length;
	const score = total > 0 ? Math.round((grounded / total) * 100) : 100;
	const status: "grounded" | "defects" | "partial" =
		ungrounded.length === 0 && unknownFiles.length === 0
			? "grounded"
			: grounded > 0
				? "partial"
				: "defects";

	const verification: CardVerification = {
		grounded,
		ungrounded,
		unknownFiles,
		uncovered,
		score,
		status,
	};

	return {
		moduleId: base.moduleId,
		name: base.name,
		generatedAt: new Date().toISOString(),
		summary,
		keyPoints,
		entryPoints,
		sources,
		verification,
	};
}

/**
 * Merge an entire cluster of duplicate cards into a single authoritative card.
 */
export function mergeCardCluster(clusterCards: readonly Card[]): Card {
	if (clusterCards.length === 0) {
		throw new Error("Cannot merge empty card cluster");
	}
	if (clusterCards.length === 1) {
		return clusterCards[0] as Card;
	}

	let merged = clusterCards[0] as Card;
	for (let i = 1; i < clusterCards.length; i++) {
		merged = mergeDuplicateCards(merged, clusterCards[i] as Card);
	}
	return merged;
}

/**
 * Deploy duplicate card deduplication engine across all cards in the repository.
 * Detects overlapping cards and merges them into canonical fact sheets.
 */
export function deduplicateCards(
	cards: readonly Card[],
	options: { threshold?: number } = {},
): DeduplicationResult {
	const threshold = options.threshold ?? 0.65;
	const clusters = detectDuplicateCards(cards, threshold);

	if (clusters.length === 0) {
		return {
			cards: [...cards],
			mergedCount: 0,
			clusters: [],
		};
	}

	const duplicatesToRemove = new Set<string>();
	for (const cluster of clusters) {
		for (const id of cluster.duplicateModuleIds) {
			duplicatesToRemove.add(id);
		}
	}

	const clusterMap = new Map<string, CardDuplicateCluster>(
		clusters.map((c) => [c.canonicalModuleId, c]),
	);

	const deduplicated: Card[] = [];
	for (const card of cards) {
		if (duplicatesToRemove.has(card.moduleId)) continue;

		const cluster = clusterMap.get(card.moduleId);
		if (cluster) {
			deduplicated.push(mergeCardCluster(cluster.cards));
		} else {
			deduplicated.push(card);
		}
	}

	return {
		cards: deduplicated,
		mergedCount: duplicatesToRemove.size,
		clusters,
	};
}
