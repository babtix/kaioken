/**
 * Search history dropdown remembering frequently investigated queries across the 10 document archetypes:
 * 1. exported API endpoint declarations (UX-0771)
 * 2. configuration options and environment variables (UX-0772)
 * 3. error codes and exception class definitions (UX-0773)
 * 4. database schema tables and migration scripts (UX-0774)
 * 5. utility functions and helper algorithms (UX-0775)
 * 6. test suite descriptions and assertion blocks (UX-0776)
 * 7. documentation wiki chapters and headings (UX-0777)
 * 8. knowledge card summaries and cited sources (UX-0778)
 * 9. agent procedure instructions and parameters (UX-0779)
 * 10. git commit messages and author metadata (UX-0780)
 */

import type { DomainArchetype } from "./boost.ts";
import { DOMAIN_BADGES } from "./highlight.ts";

export interface SearchHistoryEntry {
	readonly id: string;
	readonly query: string;
	readonly domain?: DomainArchetype;
	readonly frequency: number;
	readonly firstSearchedAt: number;
	readonly lastSearchedAt: number;
	readonly lastResultCount: number;
}

export interface RecordSearchOptions {
	domain?: DomainArchetype;
	resultCount?: number;
}

export interface HistoryDropdownOptions {
	domain?: DomainArchetype;
	maxItems?: number;
	title?: string;
}

/**
 * In-memory and serializable search history store with frequency scoring and LRU tracking.
 */
export class SearchHistoryStore {
	private readonly entries = new Map<string, SearchHistoryEntry>();
	private readonly maxEntries: number;

	constructor(maxEntries = 500) {
		this.maxEntries = maxEntries;
	}

	/**
	 * Record or update a search query in history.
	 */
	record(query: string, options: RecordSearchOptions = {}): SearchHistoryEntry {
		const cleanQuery = query.trim();
		if (!cleanQuery) {
			throw new Error("Cannot record empty query in search history");
		}

		const key = options.domain ? `${options.domain}:${cleanQuery.toLowerCase()}` : cleanQuery.toLowerCase();
		const now = Date.now();
		const existing = this.entries.get(key);

		const updated: SearchHistoryEntry = {
			id: key,
			query: cleanQuery,
			domain: options.domain ?? existing?.domain,
			frequency: (existing?.frequency ?? 0) + 1,
			firstSearchedAt: existing?.firstSearchedAt ?? now,
			lastSearchedAt: now,
			lastResultCount: options.resultCount ?? existing?.lastResultCount ?? 0,
		};

		// Enforce size limit via LRU eviction of oldest entry
		if (!existing && this.entries.size >= this.maxEntries) {
			let oldestKey: string | undefined;
			let oldestTime = Infinity;
			for (const [k, v] of this.entries.entries()) {
				if (v.lastSearchedAt < oldestTime) {
					oldestTime = v.lastSearchedAt;
					oldestKey = k;
				}
			}
			if (oldestKey) {
				this.entries.delete(oldestKey);
			}
		}

		this.entries.set(key, updated);
		return updated;
	}

	/**
	 * Retrieve top queries ordered by frequency, optionally filtered by domain archetype.
	 */
	getFrequent(limit = 10, domain?: DomainArchetype): SearchHistoryEntry[] {
		let list = Array.from(this.entries.values());
		if (domain) {
			list = list.filter((e) => e.domain === domain);
		}
		list.sort((a, b) => b.frequency - a.frequency || b.lastSearchedAt - a.lastSearchedAt);
		return list.slice(0, limit);
	}

	/**
	 * Retrieve recent queries ordered by timestamp, optionally filtered by domain archetype.
	 */
	getRecent(limit = 10, domain?: DomainArchetype): SearchHistoryEntry[] {
		let list = Array.from(this.entries.values());
		if (domain) {
			list = list.filter((e) => e.domain === domain);
		}
		list.sort((a, b) => b.lastSearchedAt - a.lastSearchedAt);
		return list.slice(0, limit);
	}

	/**
	 * Delete a query from history.
	 */
	remove(query: string, domain?: DomainArchetype): boolean {
		const key = domain ? `${domain}:${query.trim().toLowerCase()}` : query.trim().toLowerCase();
		return this.entries.delete(key);
	}

	/**
	 * Clear history, optionally for a single domain.
	 */
	clear(domain?: DomainArchetype): void {
		if (!domain) {
			this.entries.clear();
			return;
		}
		for (const [k, v] of this.entries.entries()) {
			if (v.domain === domain) {
				this.entries.delete(k);
			}
		}
	}

	/**
	 * Serialize history to JSON.
	 */
	exportJson(): string {
		return JSON.stringify(Array.from(this.entries.values()), null, 2);
	}

	/**
	 * Import history from JSON.
	 */
	importJson(json: string): void {
		try {
			const parsed = JSON.parse(json) as SearchHistoryEntry[];
			if (Array.isArray(parsed)) {
				for (const item of parsed) {
					if (item && item.id && item.query) {
						this.entries.set(item.id, item);
					}
				}
			}
		} catch {
			// Ignore corrupt JSON
		}
	}

	size(): number {
		return this.entries.size;
	}
}

/**
 * Format relative duration (e.g. "just now", "5m ago").
 */
function formatRelativeTime(timestamp: number): string {
	const diffSec = Math.max(0, Math.floor((Date.now() - timestamp) / 1000));
	if (diffSec < 60) return "just now";
	const diffMin = Math.floor(diffSec / 60);
	if (diffMin < 60) return `${diffMin}m ago`;
	const diffHour = Math.floor(diffMin / 60);
	if (diffHour < 24) return `${diffHour}h ago`;
	const diffDays = Math.floor(diffHour / 24);
	return `${diffDays}d ago`;
}

/**
 * Render visual search history dropdown card for terminal UI and search autocomplete.
 */
export function renderSearchHistoryDropdown(
	entries: SearchHistoryEntry[],
	options: HistoryDropdownOptions = {},
): string {
	const maxItems = options.maxItems ?? 8;
	const domain = options.domain;
	const title = options.title ?? (domain ? `Search History [${domain.toUpperCase()}]` : "Frequent Search Inquiries");

	const border = "─".repeat(68);
	const lines = [
		`┌${border}┐`,
		`│ 🕒  ${title.padEnd(63)} │`,
		`├${border}┤`,
	];

	if (entries.length === 0) {
		lines.push(`│   No prior search inquiries recorded for this domain.             │`);
		lines.push(`└${border}┘`);
		return lines.join("\n");
	}

	const displayEntries = entries.slice(0, maxItems);
	for (let i = 0; i < displayEntries.length; i++) {
		const entry = displayEntries[i];
		const num = `${i + 1}.`.padEnd(3);
		const badge = entry.domain ? DOMAIN_BADGES[entry.domain] || `[${entry.domain}]` : "[ALL]";
		const freq = `×${entry.frequency}`.padStart(4);
		const hits = `(${entry.lastResultCount} hits)`.padStart(11);
		const relTime = formatRelativeTime(entry.lastSearchedAt).padStart(8);

		const queryPad = entry.query.length > 22 ? `${entry.query.slice(0, 19)}...` : entry.query;
		const lineContent = `${num} ${badge.padEnd(16)} "${queryPad}" ${freq} ${hits} ${relTime}`;
		lines.push(`│ ${lineContent.padEnd(66)} │`);
	}

	lines.push(`├${border}┤`);
	lines.push(`│ [↑/↓ Navigate | Enter: Execute | Esc: Dismiss]                     │`);
	lines.push(`└${border}┘`);

	return lines.join("\n");
}
