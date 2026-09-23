/**
 * Just enough semver to decide what is newer.
 *
 * Extensions declare a strict MAJOR.MINOR.PATCH, and the only questions the
 * installer asks are "is this a valid version" and "is that one newer" — so a
 * full range grammar would be machinery nothing calls. Prerelease tags are
 * parsed and compared, because a `1.0.0-rc.1` that sorted above `1.0.0` would
 * quietly pin every user to a release candidate.
 */

export interface Semver {
	major: number;
	minor: number;
	patch: number;
	/** Dot-separated identifiers after `-`, empty for a normal release. */
	prerelease: string[];
}

const PATTERN = /^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/;

export function parseSemver(version: string): Semver | null {
	const match = PATTERN.exec(version.trim());
	if (!match) return null;
	return {
		major: Number(match[1]),
		minor: Number(match[2]),
		patch: Number(match[3]),
		prerelease: match[4] ? (match[4] as string).split(".") : [],
	};
}

/** Negative when a < b, positive when a > b, zero when they are equal. */
export function compareSemver(a: Semver, b: Semver): number {
	if (a.major !== b.major) return a.major - b.major;
	if (a.minor !== b.minor) return a.minor - b.minor;
	if (a.patch !== b.patch) return a.patch - b.patch;

	// A release outranks any prerelease of the same version.
	if (a.prerelease.length === 0 && b.prerelease.length > 0) return 1;
	if (a.prerelease.length > 0 && b.prerelease.length === 0) return -1;

	const length = Math.max(a.prerelease.length, b.prerelease.length);
	for (let i = 0; i < length; i++) {
		const left = a.prerelease[i];
		const right = b.prerelease[i];
		// A shorter prerelease sorts first: rc.1 precedes rc.1.2.
		if (left === undefined) return -1;
		if (right === undefined) return 1;
		const leftNumeric = /^\d+$/.test(left);
		const rightNumeric = /^\d+$/.test(right);
		// Numeric identifiers compare numerically and rank below alphanumerics,
		// so rc.9 precedes rc.10 rather than following it.
		if (leftNumeric && rightNumeric) {
			const diff = Number(left) - Number(right);
			if (diff !== 0) return diff;
			continue;
		}
		if (leftNumeric !== rightNumeric) return leftNumeric ? -1 : 1;
		if (left !== right) return left < right ? -1 : 1;
	}
	return 0;
}

/** Is `candidate` newer than `current`? Unparseable versions are never newer. */
export function isNewer(candidate: string, current: string): boolean {
	const a = parseSemver(candidate);
	const b = parseSemver(current);
	if (!a || !b) return false;
	return compareSemver(a, b) > 0;
}

/** Does `have` satisfy a minimum of `want`? */
export function atLeast(have: string, want: string): boolean {
	const a = parseSemver(have);
	const b = parseSemver(want);
	if (!a || !b) return false;
	return compareSemver(a, b) >= 0;
}
