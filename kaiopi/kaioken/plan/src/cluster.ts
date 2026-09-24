import type { ScanResult } from "@kaioken/scan";
import type { Module } from "./types.ts";

export type ArchitecturalDomain =
	| "frontend-ui"
	| "backend-api"
	| "database-orm"
	| "auth-session"
	| "job-worker"
	| "cloud-infra"
	| "shared-util"
	| "cli-interface"
	| "third-party-client"
	| "testing-fixture";

export interface DomainMeta {
	domain: ArchitecturalDomain;
	title: string;
	purpose: string;
	patterns: RegExp[];
}

export const ARCHITECTURAL_DOMAINS: DomainMeta[] = [
	{
		domain: "frontend-ui",
		title: "Frontend UI Components",
		purpose: "Frontend UI view components, design tokens, and user interface rendering layouts",
		patterns: [
			/(?:^|\/)(?:components|views|pages|ui|tui|layouts|screens|styles)(?:\/|$)/i,
			/\.(?:tsx|jsx|vue|svelte|css|scss|less)$/i,
		],
	},
	{
		domain: "backend-api",
		title: "Backend API Routes",
		purpose: "Backend API route handlers, request endpoints, controllers, and middleware",
		patterns: [
			/(?:^|\/)(?:api|routes|controllers|handlers|endpoints|middleware)(?:\/|$)/i,
		],
	},
	{
		domain: "database-orm",
		title: "Database Models & Migrations",
		purpose: "Database ORM models, migration scripts, entity schemas, and query repositories",
		patterns: [
			/(?:^|\/)(?:models|db|database|migrations|schema|schemas|entities|repositories|queries)(?:\/|$)/i,
			/\.(?:sql|prisma)$/i,
		],
	},
	{
		domain: "auth-session",
		title: "Authentication & Sessions",
		purpose: "Authentication, session management, access control tokens, and security guards",
		patterns: [
			/(?:^|\/)(?:auth|session|sessions|security|identity|oauth|jwt|passwords?)(?:\/|$)/i,
		],
	},
	{
		domain: "job-worker",
		title: "Background Workers & Queues",
		purpose: "Background job queue workers, asynchronous task processors, and scheduled tasks",
		patterns: [
			/(?:^|\/)(?:workers|jobs|queue|queues|tasks|scheduler|cron|pipeline)(?:\/|$)/i,
		],
	},
	{
		domain: "cloud-infra",
		title: "Cloud Infrastructure & Deployment",
		purpose: "Cloud infrastructure provisioning scripts, container definitions, and CI/CD pipelines",
		patterns: [
			/(?:^|\/)(?:infra|infrastructure|deploy|deployment|terraform|k8s|kubernetes|docker|helm|ansible|cdk)(?:\/|$)/i,
			/(?:Dockerfile|docker-compose|\.tf$|k8s.*\.ya?ml$)/i,
		],
	},
	{
		domain: "cli-interface",
		title: "CLI Command Interfaces",
		purpose: "Command-line interface commands, terminal argument parsers, and interactive prompts",
		patterns: [
			/(?:^|\/)(?:cli|commands|bin)(?:\/|$)/i,
			/(?:bin\.[a-z]+$|cli\.[a-z]+$)/i,
		],
	},
	{
		domain: "third-party-client",
		title: "External Integration Clients",
		purpose: "External third-party integration clients, API adapters, and service connectors",
		patterns: [
			/(?:^|\/)(?:clients|integrations|adapters|services|connectors|external|webhooks)(?:\/|$)/i,
		],
	},
	{
		domain: "testing-fixture",
		title: "Testing & Mock Harnesses",
		purpose: "Testing fixtures, test suites, mock doubles, and verification test harnesses",
		patterns: [
			/(?:^|\/)(?:test|tests|testing|fixtures|mocks|doubles|spec|specs|__tests__|__mocks__)(?:\/|$)/i,
			/\.(?:test|spec)\.[a-z]+$/i,
		],
	},
	{
		domain: "shared-util",
		title: "Shared Utilities & Helpers",
		purpose: "Shared utility libraries, common data transformers, formatting routines, and helpers",
		patterns: [
			/(?:^|\/)(?:utils|utilities|helpers|common|shared|lib|core|support)(?:\/|$)/i,
		],
	},
];

/**
 * Detects the architectural domain of a file path based on directory and file patterns.
 */
export function detectArchitecturalDomain(filePath: string): ArchitecturalDomain | null {
	const normalized = filePath.split("\\").join("/");
	for (const meta of ARCHITECTURAL_DOMAINS) {
		for (const pattern of meta.patterns) {
			if (pattern.test(normalized)) {
				return meta.domain;
			}
		}
	}
	return null;
}

export interface ClusteringOptions {
	/** If true, splits large folders by architectural domain. Defaults to false. */
	groupByDomain?: boolean;
	/** Maximum file count before attempting sub-clustering. Defaults to 50. */
	maxFilesPerModule?: number;
	/** Custom monorepo directory prefixes. */
	monorepoPrefixes?: string[];
}

const DEFAULT_MONOREPO_PREFIXES = new Set([
	"packages",
	"crates",
	"modules",
	"libs",
	"services",
	"apps",
	"kaioken",
]);

/**
 * Deterministic heuristic directory clustering fallback.
 *
 * Groups repository files into stable, coherent modules based on monorepo package
 * boundaries and top-level directory structures, assigning descriptive purposes
 * based on recognized architectural domains.
 */
export function clusterDirectories(
	scan: ScanResult,
	options: ClusteringOptions = {},
): Module[] {
	const eligibleFiles = scan.files.filter(
		(f) => !f.binary && !f.risk.includes("generated") && !f.risk.includes("lockfile"),
	);
	if (eligibleFiles.length === 0) {
		return [];
	}

	const prefixes = options.monorepoPrefixes
		? new Set(options.monorepoPrefixes.map((p) => p.toLowerCase()))
		: DEFAULT_MONOREPO_PREFIXES;

	const groups = new Map<string, string[]>();

	for (const file of eligibleFiles) {
		const normalized = file.path.split("\\").join("/");
		const parts = normalized.split("/");
		let groupKey: string;

		if (parts.length === 1) {
			groupKey = "root";
		} else if (parts.length > 2 && prefixes.has(parts[0]!.toLowerCase())) {
			groupKey = `${parts[0]}/${parts[1]}`;
		} else {
			groupKey = parts[0]!;
		}

		let list = groups.get(groupKey);
		if (!list) {
			list = [];
			groups.set(groupKey, list);
		}
		list.push(normalized);
	}

	const modules: Module[] = [];

	for (const [groupKey, files] of groups.entries()) {
		// Detect dominant architectural domain for this group
		const domainCounts = new Map<ArchitecturalDomain, number>();
		for (const file of files) {
			const dom = detectArchitecturalDomain(file);
			if (dom) {
				domainCounts.set(dom, (domainCounts.get(dom) ?? 0) + 1);
			}
		}

		let dominantDomain: ArchitecturalDomain | null = null;
		let maxCount = 0;
		for (const [dom, count] of domainCounts.entries()) {
			if (count > maxCount) {
				maxCount = count;
				dominantDomain = dom;
			}
		}

		const id = groupKey
			.toLowerCase()
			.replace(/[^a-z0-9._-]+/g, "-")
			.replace(/^-+|-+$/g, "") || "module";

		const name = groupKey
			.split(/[/_-]+/)
			.map((word) => word.charAt(0).toUpperCase() + word.slice(1))
			.join(" ");

		let purpose: string;
		if (dominantDomain && maxCount >= Math.max(2, Math.floor(files.length * 0.4))) {
			const meta = ARCHITECTURAL_DOMAINS.find((d) => d.domain === dominantDomain);
			purpose = meta ? meta.purpose : `Structural module for ${groupKey}`;
		} else {
			purpose = `Structural module for ${groupKey}`;
		}

		modules.push({
			id,
			name: name || groupKey,
			purpose,
			files: files.sort(),
		});
	}

	return modules.sort((a, b) => a.id.localeCompare(b.id));
}
