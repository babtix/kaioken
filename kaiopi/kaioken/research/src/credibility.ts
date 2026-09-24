/**
 * Web source domain authority and credibility scoring (#UX-1631 – #UX-1640).
 *
 * Grounded research requires transparent evaluation of external source quality.
 * Sources are evaluated deterministically based on domain reputation, transport
 * security (HTTPS), content substance, and prompt-injection safety signals.
 */

export type CredibilityTier = "high" | "medium" | "low";

export interface SourceCredibility {
	/** Overall credibility rating from 0 to 100. */
	score: number;
	/** High (>= 70), Medium (40-69), Low (< 40). */
	tier: CredibilityTier;
	/** Domain reputation and authority rating from 0 to 100. */
	domainAuthority: number;
	/** Human-readable badge displayed on cards and markdown citations. */
	badge: string;
	/** Transparent factors explaining why this score was assigned. */
	factors: string[];
}

export interface CredibilityInput {
	url: string;
	bodyText?: string;
	injectionHits?: boolean | number;
	error?: string;
}

const AUTHORITATIVE_DOMAINS = new Set([
	"developer.mozilla.org",
	"github.com",
	"docs.python.org",
	"python.org",
	"go.dev",
	"golang.org",
	"rust-lang.org",
	"doc.rust-lang.org",
	"nodejs.org",
	"typescriptlang.org",
	"w3.org",
	"ietf.org",
	"cve.mitre.org",
	"nvd.nist.gov",
	"en.wikipedia.org",
	"wikipedia.org",
	"arxiv.org",
	"kernel.org",
	"kubernetes.io",
	"registry.npmjs.org",
	"docs.oracle.com",
	"docs.microsoft.com",
	"learn.microsoft.com",
	"cloud.google.com",
	"docs.aws.amazon.com",
	"developer.apple.com",
	"docker.com",
	"pypi.org",
	"crates.io",
	"pkg.go.dev",
	"apache.org",
	"react.dev",
	"vuejs.org",
	"angular.io",
]);

/**
 * Calculate domain authority for a given URL or hostname (0–100).
 */
export function calculateDomainAuthority(urlOrHost: string): { authority: number; factors: string[]; isOfficial: boolean; isAcademicGov: boolean } {
	let hostname = urlOrHost.toLowerCase().trim();
	let isHttps = false;

	try {
		const parsed = new URL(urlOrHost.includes("://") ? urlOrHost : `http://${urlOrHost}`);
		hostname = parsed.hostname.toLowerCase();
		isHttps = parsed.protocol === "https:";
	} catch {
		// fallback to raw string
	}

	const factors: string[] = [];
	let authority = 45; // baseline

	if (isHttps) {
		authority += 10;
		factors.push("HTTPS transport security (+10)");
	}

	// Check if IP literal
	if (/^[\d.]+$/.test(hostname) || hostname.includes(":")) {
		authority -= 25;
		factors.push("Direct IP address without domain name (-25)");
		return { authority: Math.max(0, Math.min(100, authority)), factors, isOfficial: false, isAcademicGov: false };
	}

	let isOfficial = false;
	let isAcademicGov = false;

	// Check authoritative tech domains
	const parts = hostname.split(".");
	const domainMatches = AUTHORITATIVE_DOMAINS.has(hostname) ||
		(parts.length > 2 && AUTHORITATIVE_DOMAINS.has(parts.slice(-2).join(".")));

	if (domainMatches) {
		authority += 35;
		isOfficial = true;
		factors.push("Verified technical documentation / standards authority domain (+35)");
	}

	// TLD analysis
	if (hostname.endsWith(".gov") || hostname.endsWith(".mil")) {
		authority += 30;
		isAcademicGov = true;
		factors.push("Government / institutional top-level domain (.gov/.mil) (+30)");
	} else if (hostname.endsWith(".edu") || hostname.endsWith(".ac.uk")) {
		authority += 25;
		isAcademicGov = true;
		factors.push("Accredited academic / educational domain (.edu) (+25)");
	} else if (hostname.endsWith(".org") && !domainMatches) {
		authority += 10;
		factors.push("Organization top-level domain (.org) (+10)");
	}

	// Subdomain nesting penalty (> 4 labels)
	if (parts.length > 4) {
		authority -= 15;
		factors.push("Deep subdomain hierarchy (-15)");
	}

	return {
		authority: Math.max(0, Math.min(100, authority)),
		factors,
		isOfficial,
		isAcademicGov,
	};
}

/**
 * Score full source credibility combining domain authority, text content, and safety checks.
 */
export function scoreCredibility(input: CredibilityInput): SourceCredibility {
	if (input.error) {
		return {
			score: 0,
			tier: "low",
			domainAuthority: 0,
			badge: "Fetch Failed",
			factors: [`Fetch failed: ${input.error}`],
		};
	}

	const { authority, factors, isOfficial, isAcademicGov } = calculateDomainAuthority(input.url);
	let score = authority;

	// Content substance
	const bodyLen = input.bodyText?.length ?? 0;
	if (bodyLen >= 1000) {
		score += 10;
		factors.push("Substantial content body length (+10)");
	} else if (bodyLen >= 300) {
		score += 5;
		factors.push("Adequate content body length (+5)");
	} else if (bodyLen < 100 && bodyLen > 0) {
		score -= 20;
		factors.push("Sparse content body (-20)");
	}

	// Prompt injection penalty
	const hasInjection = typeof input.injectionHits === "number" ? input.injectionHits > 0 : Boolean(input.injectionHits);
	if (hasInjection) {
		score -= 30;
		factors.push("Potential prompt injection pattern detected in page body (-30)");
	}

	score = Math.max(0, Math.min(100, score));

	let tier: CredibilityTier;
	if (score >= 70) {
		tier = "high";
	} else if (score >= 40) {
		tier = "medium";
	} else {
		tier = "low";
	}

	let badge: string;
	if (isOfficial) {
		badge = "Official Documentation";
	} else if (isAcademicGov) {
		badge = "Academic / Gov";
	} else if (tier === "high") {
		badge = "Verified Source";
	} else if (tier === "medium") {
		badge = "Community Reference";
	} else {
		badge = "Unverified Source";
	}

	return {
		score,
		tier,
		domainAuthority: authority,
		badge,
		factors,
	};
}
