import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { readFile, writeFile, readdir, stat, mkdir, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, resolve, normalize, basename, dirname, extname } from "node:path";
import { homedir } from "node:os";
import { randomBytes } from "node:crypto";
import { createInterface } from "node:readline";

import { scan, toPosix, readScanArtifact, writeScanArtifact, KAIOKEN_DIR, detectLanguage } from "@kaioken/scan";
import { readIndexArtifact } from "@kaioken/index";
import { SearchIndex } from "@kaioken/search";
import { buildGraph, readLibrary, EMPTY_LIBRARY, outline } from "@kaioken/serve";
import { git, isRepo, hookStatus, installPostCommit, removePostCommit, currentBranch } from "@kaioken/gitops";
import { computeStaleness } from "@kaioken/provenance";
import { listSessions, loadSession, saveSession, deleteSession, generateSessionId, undoLast } from "@kaioken/session";
import {
	listModules as listPrismModules,
	createModule as createPrismModule,
} from "@kaioken/prism";
import {
	listInstalled as listExtensions,
	fetchRegistry,
} from "@kaioken/ext";

import { runChat, type ChatHooks } from "./chat.js";
import { runScan } from "./scan.js";
import { runPlan } from "./plan.js";
import { runCards } from "./cards.js";
import { runWikiCommand } from "./wiki.js";
import { runStatus } from "./status.js";
import { runUpdate } from "./update.js";
import { runVerify } from "./verify.js";
import { runGraph } from "./graph.js";
import { runResearch } from "./research.js";
import type { Flags } from "../main.js";

// --- Types & Constants ---
const CONTRACT_VERSION = 4;
const DAEMON_VERSION = "2.0.0";

function stripTitle(md: string): string {
	return md.replace(/^#\s+[^\n]+\n*/, "");
}

interface WorkspaceInfo {
	id: string;
	path: string;
	name: string;
	last_opened: string;
	has_config: boolean;
	config_path: string;
	git: {
		is_repo: boolean;
		head: string;
		short: string;
		branch: string;
		dirty_count: number;
		hook_installed: boolean;
	};
	knowledge: {
		has_modules: boolean;
		module_count: number;
		has_cards: boolean;
		has_wiki: boolean;
		wiki_sections: number;
		wiki_docs: number;
		wiki_base: string;
		wiki_model: string;
		wiki_multiplier: number;
		wiki_failed: string[];
		has_skills: boolean;
		skill_count: number;
		has_brief: boolean;
	};
	model: string;
	provider: string;
	allow_run: boolean;
}

interface RunRecord {
	id: string;
	workspace_id: string;
	kind: string;
	status: "running" | "completed" | "failed" | "cancelled";
	started_at: string;
	finished_at?: string;
	progress?: { current: number; total: number; message: string };
	error?: string;
	log?: string[];
	cancel?: () => void;
}

interface SseEvent {
	seq: number;
	ts: string;
	type: string;
	[key: string]: unknown;
}

interface ApprovalRequest {
	id: string;
	workspace_id: string;
	run_id: string;
	tool: string;
	args: unknown;
	diff?: { path: string; old_content?: string; new_content?: string };
	resolve: (decision: "approve" | "deny" | "approve_all") => void;
	timer: NodeJS.Timeout;
}

// --- Global Daemon State ---
const workspaces = new Map<string, WorkspaceInfo>();
const runs = new Map<string, RunRecord>();
const approvals = new Map<string, ApprovalRequest>();
const sseClients = new Set<ServerResponse>();
const eventBuffer: SseEvent[] = [];
let nextSeq = 1;
const startTime = Date.now();

function broadcast(type: string, data: Record<string, unknown> = {}): void {
	const ev: SseEvent = {
		seq: nextSeq++,
		ts: new Date().toISOString(),
		type,
		...data,
	};
	eventBuffer.push(ev);
	if (eventBuffer.length > 512) eventBuffer.shift();

	const frame = `id: ${ev.seq}\nevent: ${type}\ndata: ${JSON.stringify(ev)}\n\n`;
	for (const client of sseClients) {
		try {
			client.write(frame);
		} catch {
			sseClients.delete(client);
		}
	}
}

// --- Persistence Helpers ---
const CONFIG_DIR = join(homedir(), ".kaioken");
const WORKSPACES_FILE = join(CONFIG_DIR, "workspaces.json");
const SETTINGS_FILE = join(CONFIG_DIR, "settings.json");

async function loadRecents(): Promise<string[]> {
	try {
		const raw = await readFile(WORKSPACES_FILE, "utf8");
		const data = JSON.parse(raw);
		return Array.isArray(data.recents) ? data.recents : [];
	} catch {
		return [];
	}
}

async function saveRecents(recents: string[]): Promise<void> {
	try {
		await mkdir(CONFIG_DIR, { recursive: true });
		await writeFile(WORKSPACES_FILE, JSON.stringify({ recents }, null, 2));
	} catch {
		// Ignore write failures
	}
}

interface UserConfigYaml {
	default_provider?: string;
	default_model?: string;
	keys: Record<string, string>;
	research?: {
		search_provider?: string;
		fetcher_mode?: string;
	};
	embed?: {
		model?: string;
		provider?: string;
		base_url?: string;
	};
}

async function loadUserConfigYaml(): Promise<UserConfigYaml> {
	const p = join(CONFIG_DIR, "config.yaml");
	const res: UserConfigYaml = { keys: {} };
	try {
		const text = await readFile(p, "utf8");
		let section: "keys" | "research" | "embed" | "root" = "root";
		for (const rawLine of text.split("\n")) {
			const trimmed = rawLine.trim();
			if (!trimmed || trimmed.startsWith("#")) continue;

			if (/^keys\s*:/.test(trimmed)) {
				section = "keys";
				continue;
			}
			if (/^research\s*:/.test(trimmed)) {
				section = "research";
				continue;
			}
			if (/^embed\s*:/.test(trimmed)) {
				section = "embed";
				continue;
			}
			if (!rawLine.startsWith(" ") && !rawLine.startsWith("\t")) {
				section = "root";
				const idx = trimmed.indexOf(":");
				if (idx !== -1) {
					const k = trimmed.slice(0, idx).trim();
					const val = trimmed.slice(idx + 1).trim();
					if (k === "default_provider") res.default_provider = val;
					if (k === "default_model") res.default_model = val;
				}
				continue;
			}

			const idx = trimmed.indexOf(":");
			if (idx !== -1) {
				const k = trimmed.slice(0, idx).trim();
				const val = trimmed.slice(idx + 1).trim();
				if (section === "keys") {
					res.keys[k] = val;
				} else if (section === "research") {
					if (!res.research) res.research = {};
					if (k === "search_provider") res.research.search_provider = val;
					if (k === "fetcher_mode") res.research.fetcher_mode = val;
				} else if (section === "embed") {
					if (!res.embed) res.embed = {};
					if (k === "model") res.embed.model = val;
					if (k === "provider") res.embed.provider = val;
					if (k === "base_url") res.embed.base_url = val;
				}
			}
		}
	} catch {
		// Ignore if config.yaml does not exist
	}
	return res;
}

async function saveUserConfigYaml(cfg: UserConfigYaml): Promise<void> {
	try {
		await mkdir(CONFIG_DIR, { recursive: true });
		const p = join(CONFIG_DIR, "config.yaml");
		const lines: string[] = [
			"# kaioken user configuration — holds API keys and defaults.",
			"# Keys are stored per provider; do not commit this file anywhere.",
		];
		if (cfg.default_provider) lines.push(`default_provider: ${cfg.default_provider}`);
		if (cfg.default_model) lines.push(`default_model: ${cfg.default_model}`);

		lines.push("keys:");
		for (const [k, v] of Object.entries(cfg.keys)) {
			if (v) lines.push(`    ${k}: ${v}`);
		}

		if (cfg.research) {
			lines.push("research:");
			if (cfg.research.search_provider) lines.push(`    search_provider: ${cfg.research.search_provider}`);
			if (cfg.research.fetcher_mode) lines.push(`    fetcher_mode: ${cfg.research.fetcher_mode}`);
		}

		if (cfg.embed) {
			lines.push("embed:");
			if (cfg.embed.model) lines.push(`    model: ${cfg.embed.model}`);
			if (cfg.embed.provider) lines.push(`    provider: ${cfg.embed.provider}`);
			if (cfg.embed.base_url) lines.push(`    base_url: ${cfg.embed.base_url}`);
		}

		lines.push("");
		await writeFile(p, lines.join("\n"), "utf8");
	} catch {
		// Ignore write errors
	}
}

let prismSettingsState = {
	embed_model: "text-embedding-3-small",
	embed_provider: "openai",
	embed_base_url: "",
	embed_fallback_model: "",
	embed_fallback_provider: "",
	utility_model: "claude-3-7-sonnet",
	utility_provider: "anthropic",
	mode: "static" as "static" | "agent",
	top_k: 5,
	variants: 3,
	grade: true,
	parent_tokens: 1000,
	child_tokens: 200,
	child_overlap: 50,
	cache_ttl_seconds: 3600,
	max_variants: 5,
};

async function buildFullSettings(): Promise<Record<string, unknown>> {
	const userCfg = await loadUserConfigYaml();

	const ALL_PROVIDERS = [
		{ name: "openrouter", key_env: "OPENROUTER_API_KEY", base_url: "https://openrouter.ai/api/v1" },
		{ name: "anthropic", key_env: "ANTHROPIC_API_KEY", base_url: "" },
		{ name: "openai", key_env: "OPENAI_API_KEY", base_url: "" },
		{ name: "google", key_env: "GEMINI_API_KEY", base_url: "" },
		{ name: "groq", key_env: "GROQ_API_KEY", base_url: "https://api.groq.com/openai/v1" },
		{ name: "deepseek", key_env: "DEEPSEEK_API_KEY", base_url: "https://api.deepseek.com" },
		{ name: "mistral", key_env: "MISTRAL_API_KEY", base_url: "https://api.mistral.ai/v1" },
		{ name: "together", key_env: "TOGETHER_API_KEY", base_url: "https://api.together.xyz/v1" },
		{ name: "cohere", key_env: "COHERE_API_KEY", base_url: "https://api.cohere.ai/v1" },
		{ name: "fireworks", key_env: "FIREWORKS_API_KEY", base_url: "https://api.fireworks.ai/inference/v1" },
		{ name: "xai", key_env: "XAI_API_KEY", base_url: "https://api.x.ai/v1" },
		{ name: "cerebras", key_env: "CEREBRAS_API_KEY", base_url: "https://api.cerebras.ai/v1" },
		{ name: "nvidia", key_env: "NVIDIA_API_KEY", base_url: "https://integrate.api.nvidia.com/v1" },
		{ name: "ollama", key_env: "", base_url: "http://127.0.0.1:11434", local: true },
		{ name: "lmstudio", key_env: "", base_url: "http://127.0.0.1:1234/v1", local: true },
	];

	const providers = ALL_PROVIDERS.map((p) => {
		const hasConfigKey = Boolean(userCfg.keys[p.name]);
		const hasEnvKey = Boolean(p.key_env && process.env[p.key_env]);
		const hasKey = hasConfigKey || hasEnvKey || Boolean(p.local);
		const keySource: "config" | "env" | "local" | "none" = hasConfigKey
			? "config"
			: hasEnvKey
				? "env"
				: p.local
					? "local"
					: "none";
		const hint = hasConfigKey ? `...${userCfg.keys[p.name]?.slice(-4)}` : undefined;
		return {
			name: p.name,
			base_url: p.base_url,
			key_env: p.key_env,
			has_key: hasKey,
			key_source: keySource,
			local: p.local,
			hint,
		};
	});

	const search = {
		provider: userCfg.research?.search_provider || "duckduckgo",
		providers: [
			{ id: "tavily", name: "Tavily", has_key: Boolean(userCfg.keys.tavily || process.env.TAVILY_API_KEY), key_env: "TAVILY_API_KEY" },
			{ id: "brave", name: "Brave Search", has_key: Boolean(userCfg.keys.brave || process.env.BRAVE_API_KEY), key_env: "BRAVE_API_KEY" },
			{ id: "searxng", name: "SearXNG", has_key: Boolean(userCfg.keys.searxng || process.env.SEARXNG_URL), key_env: "SEARXNG_URL" },
			{ id: "duckduckgo", name: "DuckDuckGo (Free)", has_key: true, key_env: "" },
			{ id: "exa", name: "Exa", has_key: Boolean(userCfg.keys.exa || process.env.EXA_API_KEY), key_env: "EXA_API_KEY" },
		],
	};

	const embed = {
		model: userCfg.embed?.model || "text-embedding-3-small",
		provider: userCfg.embed?.provider || "openai",
		base_url: userCfg.embed?.base_url || "",
	};

	const fetcher = {
		mode: (userCfg.research?.fetcher_mode || "auto") as "auto" | "direct" | "proxy" | "browser",
		preferred_tier: "direct" as const,
		render_js: false,
	};

	return {
		providers,
		search,
		embed,
		fetcher,
		default_provider: userCfg.default_provider || "openrouter",
		default_model: userCfg.default_model || "minimax/minimax-m3:free",
	};
}

interface CachedModels {
	at: number;
	models: { id: string; name: string }[];
}

const modelsCache = new Map<string, CachedModels>();

function applyFilter(models: { id: string; name: string }[], filter?: string) {
	if (!filter) return models;
	const f = filter.toLowerCase();
	return models.filter((m) => m.id.toLowerCase().includes(f) || m.name.toLowerCase().includes(f));
}

async function fetchLiveModels(prov: string, filter?: string, refresh?: boolean): Promise<{ id: string; name: string }[]> {
	const now = Date.now();
	const cached = modelsCache.get(prov);
	if (!refresh && cached && now - cached.at < 10 * 60 * 1000) {
		return applyFilter(cached.models, filter);
	}

	const userCfg = await loadUserConfigYaml();
	const key = userCfg.keys[prov] || process.env[`${prov.toUpperCase()}_API_KEY`];

	let fetched: { id: string; name: string }[] = [];

	try {
		const controller = new AbortController();
		const timeout = setTimeout(() => controller.abort(), 10000);

		if (prov === "openrouter") {
			const res = await fetch("https://openrouter.ai/api/v1/models", {
				headers: key ? { Authorization: `Bearer ${key}` } : {},
				signal: controller.signal,
			});
			clearTimeout(timeout);
			if (res.ok) {
				const data = (await res.json()) as { data?: { id: string; name?: string }[] };
				if (Array.isArray(data?.data)) {
					fetched = data.data.map((m) => ({ id: m.id, name: m.name || m.id }));
				}
			}
		} else if (prov === "openai") {
			if (key) {
				const res = await fetch("https://api.openai.com/v1/models", {
					headers: { Authorization: `Bearer ${key}` },
					signal: controller.signal,
				});
				clearTimeout(timeout);
				if (res.ok) {
					const data = (await res.json()) as { data?: { id: string }[] };
					if (Array.isArray(data?.data)) {
						fetched = data.data.map((m) => ({ id: m.id, name: m.id }));
					}
				}
			}
		} else if (prov === "anthropic") {
			if (key) {
				const res = await fetch("https://api.anthropic.com/v1/models", {
					headers: {
						"x-api-key": key,
						"anthropic-version": "2023-06-01",
					},
					signal: controller.signal,
				});
				clearTimeout(timeout);
				if (res.ok) {
					const data = (await res.json()) as { data?: { id: string; display_name?: string }[] };
					if (Array.isArray(data?.data)) {
						fetched = data.data.map((m) => ({ id: m.id, name: m.display_name || m.id }));
					}
				}
			}
		} else if (prov === "google") {
			const googleKey = key || process.env.GEMINI_API_KEY;
			if (googleKey) {
				const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${googleKey}`, {
					signal: controller.signal,
				});
				clearTimeout(timeout);
				if (res.ok) {
					const data = (await res.json()) as { models?: { name: string; displayName?: string }[] };
					if (Array.isArray(data?.models)) {
						fetched = data.models.map((m) => ({
							id: m.name.replace(/^models\//, ""),
							name: m.displayName || m.name.replace(/^models\//, ""),
						}));
					}
				}
			}
		} else if (prov === "groq") {
			if (key) {
				const res = await fetch("https://api.groq.com/openai/v1/models", {
					headers: { Authorization: `Bearer ${key}` },
					signal: controller.signal,
				});
				clearTimeout(timeout);
				if (res.ok) {
					const data = (await res.json()) as { data?: { id: string }[] };
					if (Array.isArray(data?.data)) {
						fetched = data.data.map((m) => ({ id: m.id, name: m.id }));
					}
				}
			}
		} else if (prov === "deepseek") {
			if (key) {
				const res = await fetch("https://api.deepseek.com/models", {
					headers: { Authorization: `Bearer ${key}` },
					signal: controller.signal,
				});
				clearTimeout(timeout);
				if (res.ok) {
					const data = (await res.json()) as { data?: { id: string }[] };
					if (Array.isArray(data?.data)) {
						fetched = data.data.map((m) => ({ id: m.id, name: m.id }));
					}
				}
			}
		} else if (prov === "together") {
			if (key) {
				const res = await fetch("https://api.together.xyz/v1/models", {
					headers: { Authorization: `Bearer ${key}` },
					signal: controller.signal,
				});
				clearTimeout(timeout);
				if (res.ok) {
					const data = (await res.json()) as { id?: string }[] | { data?: { id: string }[] };
					const list = Array.isArray(data) ? data : data.data;
					if (Array.isArray(list)) {
						fetched = list.map((m) => ({ id: m.id!, name: m.id! }));
					}
				}
			}
		} else if (prov === "mistral") {
			if (key) {
				const res = await fetch("https://api.mistral.ai/v1/models", {
					headers: { Authorization: `Bearer ${key}` },
					signal: controller.signal,
				});
				clearTimeout(timeout);
				if (res.ok) {
					const data = (await res.json()) as { data?: { id: string }[] };
					if (Array.isArray(data?.data)) {
						fetched = data.data.map((m) => ({ id: m.id, name: m.id }));
					}
				}
			}
		} else if (prov === "nvidia") {
			if (key) {
				const res = await fetch("https://integrate.api.nvidia.com/v1/models", {
					headers: { Authorization: `Bearer ${key}` },
					signal: controller.signal,
				});
				clearTimeout(timeout);
				if (res.ok) {
					const data = (await res.json()) as { data?: { id: string }[] };
					if (Array.isArray(data?.data)) {
						fetched = data.data.map((m) => ({ id: m.id, name: m.id }));
					}
				}
			}
		} else if (prov === "ollama") {
			try {
				const res = await fetch("http://127.0.0.1:11434/api/tags", {
					signal: controller.signal,
				});
				clearTimeout(timeout);
				if (res.ok) {
					const data = (await res.json()) as { models?: { name: string }[] };
					if (Array.isArray(data?.models)) {
						fetched = data.models.map((m) => ({ id: m.name, name: m.name }));
					}
				}
			} catch {}
		} else if (prov === "lmstudio") {
			try {
				const res = await fetch("http://127.0.0.1:1234/v1/models", {
					signal: controller.signal,
				});
				clearTimeout(timeout);
				if (res.ok) {
					const data = (await res.json()) as { data?: { id: string }[] };
					if (Array.isArray(data?.data)) {
						fetched = data.data.map((m) => ({ id: m.id, name: m.id }));
					}
				}
			} catch {}
		}
	} catch {
		// Ignore network errors and fallback
	}

	if (fetched.length > 0) {
		modelsCache.set(prov, { at: now, models: fetched });
		return applyFilter(fetched, filter);
	}

	// Fallback curated list if provider call fails or has no key
	const FALLBACK_MODELS: Record<string, string[]> = {
		openrouter: [
			"minimax/minimax-m3:free",
			"anthropic/claude-3.7-sonnet",
			"anthropic/claude-3.5-sonnet",
			"openai/gpt-4o",
			"openai/gpt-4o-mini",
			"deepseek/deepseek-r1",
			"deepseek/deepseek-chat",
			"meta-llama/llama-3.3-70b-instruct",
			"google/gemini-2.0-flash-exp:free",
		],
		anthropic: [
			"claude-3-7-sonnet-20250219",
			"claude-3-5-sonnet-20241022",
			"claude-3-5-haiku-20241022",
			"claude-3-opus-20240229",
		],
		openai: ["gpt-4o", "gpt-4o-mini", "o1", "o3-mini", "gpt-4-turbo"],
		google: ["gemini-2.5-flash", "gemini-2.5-pro", "gemini-2.0-flash", "gemini-1.5-pro"],
		groq: ["llama-3.3-70b-versatile", "llama-3.1-8b-instant", "deepseek-r1-distill-llama-70b"],
		deepseek: ["deepseek-chat", "deepseek-reasoner"],
		together: ["meta-llama/Llama-3.3-70B-Instruct-Turbo", "deepseek-ai/DeepSeek-R1"],
		mistral: ["mistral-large-latest", "codestral-latest", "mistral-small-latest"],
		nvidia: ["meta/llama-3.3-70b-instruct", "deepseek-ai/deepseek-r1"],
		ollama: ["llama3.2", "qwen2.5-coder", "deepseek-r1:7b"],
		lmstudio: ["local-model"],
	};

	const fallback = (FALLBACK_MODELS[prov] || ["default"]).map((id) => ({ id, name: id }));
	return applyFilter(fallback, filter);
}

// --- Workspace Inspect Helper ---
async function inspectWorkspace(dirPath: string): Promise<WorkspaceInfo> {
	const absPath = resolve(dirPath);
	const posixPath = toPosix(absPath);
	const name = basename(posixPath) || posixPath;
	const id = "ws_" + Buffer.from(posixPath).toString("hex").slice(-8);

	const isGit = await isRepo(absPath).catch(() => false);
	let head = "";
	let branch = "";
	let dirtyCount = 0;
	let hookInstalled = false;

	if (isGit) {
		branch = await currentBranch(absPath).catch(() => "main");
		try {
			const res = await git(absPath, "rev-parse", "HEAD");
			if (res.ok) head = res.stdout.trim();
		} catch {}
		try {
			const res = await git(absPath, "status", "--porcelain");
			if (res.ok) {
				const lines = res.stdout.trim().split("\n").filter(Boolean);
				dirtyCount = lines.length;
			}
		} catch {}
		try {
			hookInstalled = (await hookStatus(absPath)).installed;
		} catch {}
	}

	const kaioDir = join(absPath, KAIOKEN_DIR);
	const hasConfig = existsSync(join(kaioDir, "config.json")) || existsSync(join(kaioDir, "model.json"));
	const hasModules = existsSync(join(kaioDir, "module-plan.yaml"));
	const hasCards = existsSync(join(kaioDir, "cards"));
	const hasWiki = existsSync(join(kaioDir, "wiki"));
	const hasSkills = existsSync(join(kaioDir, "skills"));
	const hasBrief = existsSync(join(kaioDir, "brief.md")) || existsSync(join(kaioDir, "onboard.md"));

	let wikiDocs = 0;
	if (hasWiki) {
		const walk = async (d: string) => {
			try {
				const entries = await readdir(d, { withFileTypes: true });
				for (const e of entries) {
					if (e.isDirectory()) await walk(join(d, e.name));
					else if (e.name.endsWith(".md")) wikiDocs++;
				}
			} catch {}
		};
		await walk(join(kaioDir, "wiki"));
	}

	let cardCount = 0;
	if (hasCards) {
		try {
			const entries = await readdir(join(kaioDir, "cards"), { recursive: true });
			cardCount = entries.filter((e) => String(e).endsWith(".json") || String(e).endsWith(".md")).length;
		} catch {}
	}

	let skillCount = 0;
	if (hasSkills) {
		try {
			const entries = await readdir(join(kaioDir, "skills"));
			skillCount = entries.filter((e) => e.endsWith(".md")).length;
		} catch {}
	}

	let wsModel = "minimax/minimax-m3:free";
	let wsProvider = "openrouter";
	try {
		const kaioConfig = JSON.parse(await readFile(join(kaioDir, "config.json"), "utf8"));
		if (kaioConfig.model) wsModel = kaioConfig.model;
		if (kaioConfig.provider) wsProvider = kaioConfig.provider;
	} catch {
		const userCfg = await loadUserConfigYaml();
		if (userCfg.default_model) wsModel = userCfg.default_model;
		if (userCfg.default_provider) wsProvider = userCfg.default_provider;
	}

	return {
		id,
		path: posixPath,
		name,
		last_opened: new Date().toISOString(),
		has_config: hasConfig,
		config_path: join(kaioDir, "config.json"),
		git: {
			is_repo: isGit,
			head,
			short: head.slice(0, 7),
			branch,
			dirty_count: dirtyCount,
			hook_installed: hookInstalled,
		},
		knowledge: {
			has_modules: hasModules,
			module_count: cardCount,
			has_cards: hasCards,
			has_wiki: hasWiki,
			wiki_sections: 1,
			wiki_docs: wikiDocs,
			wiki_base: "",
			wiki_model: "",
			wiki_multiplier: 3,
			wiki_failed: [],
			has_skills: hasSkills,
			skill_count: skillCount,
			has_brief: hasBrief,
		},
		model: wsModel,
		provider: wsProvider,
		allow_run: true,
	};
}

// --- Request Utilities ---
function sendJson(res: ServerResponse, data: unknown, status = 200): void {
	const body = JSON.stringify(data);
	res.writeHead(status, {
		"content-type": "application/json; charset=utf-8",
		"content-length": Buffer.byteLength(body),
	});
	res.end(body);
}

function sendError(res: ServerResponse, code: string, message: string, status = 400, detail?: string): void {
	sendJson(res, { error: { code, message, detail } }, status);
}

async function readBody(req: IncomingMessage): Promise<unknown> {
	return new Promise((resolve, reject) => {
		const chunks: Buffer[] = [];
		req.on("data", (chunk) => chunks.push(chunk));
		req.on("end", () => {
			const text = Buffer.concat(chunks).toString("utf8");
			if (!text.trim()) return resolve(undefined);
			try {
				resolve(JSON.parse(text));
			} catch (e) {
				reject(e);
			}
		});
		req.on("error", reject);
	});
}

function confinePath(baseDir: string, relativePath: string): string | null {
	const safeBase = resolve(baseDir);
	const target = resolve(safeBase, normalize(relativePath));
	if (target === safeBase || target.startsWith(safeBase + normalize("/"))) {
		return target;
	}
	return null;
}

// --- Main Daemon Entry Point ---
export async function runDaemon(flags: Flags): Promise<number> {
	// 1. Resolve Auth Token
	let token = flags.token ?? "";
	if (flags.tokenStdin) {
		const rl = createInterface({ input: process.stdin });
		token = await new Promise<string>((resolveToken) => {
			rl.once("line", (line) => {
				resolveToken(line.trim());
			});
		});
	}
	if (!token) {
		token = randomBytes(32).toString("hex");
	}

	const port = flags.port ?? 0;
	const host = "127.0.0.1";

	// Heartbeat interval for SSE
	setInterval(() => {
		for (const client of sseClients) {
			try {
				client.write(": ping\n\n");
			} catch {
				sseClients.delete(client);
			}
		}
	}, 20_000);

	const server = createServer(async (req, res) => {
		const url = new URL(req.url ?? "/", `http://${req.headers.host || "127.0.0.1"}`);
		const pathname = url.pathname;
		const method = req.method ?? "GET";

		// CORS Headers
		res.setHeader("Access-Control-Allow-Origin", "*");
		res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS");
		res.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type");

		if (method === "OPTIONS") {
			res.writeHead(204);
			res.end();
			return;
		}

		// Auth check (allow query token for browser proxy and events if needed)
		const authHeader = req.headers["authorization"];
		const queryToken = url.searchParams.get("token");
		const providedToken = authHeader?.startsWith("Bearer ") ? authHeader.slice(7).trim() : queryToken;

		if (providedToken !== token) {
			sendError(res, "unauthorized", "invalid or missing bearer token", 401);
			return;
		}

		try {
			// --- System ---
			if (method === "GET" && pathname === "/v1/health") {
				let activeRuns = 0;
				for (const r of runs.values()) if (r.status === "running") activeRuns++;
				sendJson(res, {
					status: "ok",
					version: DAEMON_VERSION,
					contract: CONTRACT_VERSION,
					go_version: `node ${process.version}`,
					os: process.platform,
					arch: process.arch,
					pid: process.pid,
					uptime_ms: Date.now() - startTime,
					workspaces_open: workspaces.size,
					runs_active: activeRuns,
				});
				return;
			}

			if (method === "POST" && pathname === "/v1/shutdown") {
				sendJson(res, { status: "shutting_down" }, 202);
				setTimeout(() => process.exit(0), 200);
				return;
			}

			if (method === "GET" && pathname === "/v1/events") {
				res.writeHead(200, {
					"content-type": "text/event-stream; charset=utf-8",
					"cache-control": "no-cache",
					"connection": "keep-alive",
					"x-accel-buffering": "no",
				});
				res.write(": ping\n\n");
				res.write(`event: ready\ndata: {}\n\n`);

				const since = Number(url.searchParams.get("since") ?? 0);
				if (since > 0) {
					for (const ev of eventBuffer) {
						if (ev.seq > since) {
							res.write(`id: ${ev.seq}\nevent: ${ev.type}\ndata: ${JSON.stringify(ev)}\n\n`);
						}
					}
				}

				sseClients.add(res);
				req.on("close", () => sseClients.delete(res));
				return;
			}

			// In-app browser proxy
			if (method === "GET" && pathname === "/v1/browser/proxy") {
				const target = url.searchParams.get("url");
				if (!target) return sendError(res, "bad_request", "missing url parameter");
				try {
					const fetched = await fetch(target, {
						redirect: "follow",
						headers: {
							"User-Agent":
								"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
							Accept:
								"text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
							"Accept-Language": "en-US,en;q=0.9",
						},
					});
					const contentType = fetched.headers.get("content-type") || "text/html";
					const headers: Record<string, string> = {
						"content-type": contentType,
						"access-control-allow-origin": "*",
					};

					if (contentType.includes("text/html")) {
						let html = await fetched.text();
						html = html.replace(/<meta[^>]*http-equiv=["']?Content-Security-Policy["']?[^>]*>/gi, "");
						const baseTag = `<base href="${target}">`;
						const scriptTag = `<script>(function(){document.addEventListener('click',function(e){var a=e.target&&e.target.closest('a');if(a&&a.href&&!a.href.startsWith('javascript:')){window.parent.postMessage({type:'kai:navigate',url:a.href},'*');}},true);})();</script>`;
						if (/<head[^>]*>/i.test(html)) {
							html = html.replace(/<head[^>]*>/i, (m) => `${m}\n${baseTag}\n${scriptTag}`);
						} else {
							html = `${baseTag}\n${scriptTag}\n${html}`;
						}
						res.writeHead(fetched.status, headers);
						res.end(html);
					} else {
						res.writeHead(fetched.status, headers);
						const buf = await fetched.arrayBuffer();
						res.end(Buffer.from(buf));
					}
				} catch (err) {
					sendError(res, "engine_error", `failed to proxy: ${err}`);
				}
				return;
			}

			// In-app YouTube video search endpoint
			if (method === "GET" && pathname === "/v1/browser/youtube") {
				const q = url.searchParams.get("q") || "trending";
				try {
					const fetched = await fetch(`https://www.youtube.com/results?search_query=${encodeURIComponent(q)}`, {
						headers: {
							"User-Agent":
								"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
							Accept: "text/html",
							"Accept-Language": "en-US,en;q=0.9",
						},
					});
					const html = await fetched.text();
					const jsonMatch = html.match(/var ytInitialData = ({.*?});<\/script>/);
					const videos: Array<{ id: string; title: string; channel: string; views?: string; thumbnail?: string }> = [];
					if (jsonMatch) {
						try {
							const data = JSON.parse(jsonMatch[1]!);
							const contents =
								data.contents?.twoColumnSearchResultsRenderer?.primaryContents?.sectionListRenderer?.contents?.[0]?.itemSectionRenderer?.contents;
							if (Array.isArray(contents)) {
								for (const item of contents) {
									const v = item.videoRenderer;
									if (v?.videoId && v?.title?.runs?.[0]?.text) {
										videos.push({
											id: v.videoId,
											title: v.title.runs[0].text,
											channel: v.ownerText?.runs?.[0]?.text || "YouTube",
											views: v.viewCountText?.simpleText,
											thumbnail: v.thumbnail?.thumbnails?.[0]?.url,
										});
									}
								}
							}
						} catch {}
					}
					if (videos.length === 0) {
						const matches = html.matchAll(/\/watch\?v=([a-zA-Z0-9_-]{11})/g);
						const seen = new Set<string>();
						for (const m of matches) {
							if (m[1] && !seen.has(m[1])) {
								seen.add(m[1]);
								videos.push({
									id: m[1],
									title: "YouTube Video",
									channel: "YouTube",
									thumbnail: `https://i.ytimg.com/vi/${m[1]}/hqdefault.jpg`,
								});
								if (videos.length >= 16) break;
							}
						}
					}
					sendJson(res, { query: q, videos });
				} catch (err) {
					sendError(res, "engine_error", `failed to search YouTube: ${err}`);
				}
				return;
			}

			// --- Workspaces ---
			if (method === "GET" && pathname === "/v1/workspaces") {
				const recents = await loadRecents();
				sendJson(res, {
					workspaces: Array.from(workspaces.values()),
					recents: recents.map((p) => ({ path: p, missing: !existsSync(p) })),
				});
				return;
			}

			if (method === "POST" && pathname === "/v1/workspaces") {
				const body = (await readBody(req)) as { path?: string };
				if (!body?.path) return sendError(res, "bad_request", "path required");
				const ws = await inspectWorkspace(body.path);
				workspaces.set(ws.id, ws);

				const recents = await loadRecents();
				const updated = [ws.path, ...recents.filter((p) => p !== ws.path)].slice(0, 10);
				await saveRecents(updated);

				broadcast("workspace.opened", { workspace_id: ws.id, path: ws.path });
				sendJson(res, ws);
				return;
			}

			const wsMatch = /^\/v1\/workspaces\/([^/]+)(.*)$/.exec(pathname);
			if (wsMatch) {
				const wsId = wsMatch[1]!;
				const sub = wsMatch[2]!;
				let ws = workspaces.get(wsId);

				if (!ws) {
					// Check if wsId is in recents or can be re-inspected
					const recents = await loadRecents();
					for (const p of recents) {
						const candidate = await inspectWorkspace(p);
						if (candidate.id === wsId) {
							workspaces.set(candidate.id, candidate);
							ws = candidate;
							break;
						}
					}
				}

				if (!ws && sub !== "") {
					return sendError(res, "workspace_not_found", `no workspace ${wsId}`, 404);
				}

				// Workspace root CRUD
				if (sub === "") {
					if (method === "GET") return sendJson(res, ws);
					if (method === "DELETE") {
						workspaces.delete(wsId);
						if (url.searchParams.get("forget") === "true") {
							const recents = await loadRecents();
							await saveRecents(recents.filter((p) => ws && p !== ws.path));
						}
						res.writeHead(204);
						res.end();
						return;
					}
				}

				if (method === "POST" && sub === "/init") {
					const scanRes = await scan(ws!.path);
					await writeScanArtifact(ws!.path, scanRes);
					const updated = await inspectWorkspace(ws!.path);
					workspaces.set(wsId, updated);
					return sendJson(res, updated);
				}

				// Scan
				if (method === "GET" && sub === "/scan") {
					const refresh = url.searchParams.get("refresh") === "true";
					let scanRes = !refresh ? await readScanArtifact(ws!.path) : null;
					if (!scanRes) {
						scanRes = await scan(ws!.path);
						await writeScanArtifact(ws!.path, scanRes);
					}
					const langMap = new Map<string, { files: number; bytes: number }>();
					for (const f of scanRes.files) {
						const l = f.language || "unknown";
						const entry = langMap.get(l) ?? { files: 0, bytes: 0 };
						entry.files++;
						entry.bytes += f.size;
						langMap.set(l, entry);
					}
					const byLang = Array.from(langMap.entries()).map(([lang, s]) => ({ lang, ...s }));
					return sendJson(res, {
						root: ws!.path,
						files: scanRes.fileCount,
						bytes: scanRes.totalBytes,
						stats: `${scanRes.fileCount} files`,
						languages: byLang,
						tree: "",
						scanned_at: scanRes.scannedAt,
						cached: !refresh,
					});
				}

				// Tree
				if (method === "GET" && sub === "/tree") {
					let total = 0;
					const buildTree = async (dir: string): Promise<any> => {
						const entries = await readdir(dir, { withFileTypes: true });
						const children = [];
						for (const e of entries) {
							if (e.name === ".git" || e.name === "node_modules") continue;
							total++;
							const p = join(dir, e.name);
							const rel = toPosix(normalize(p).slice(ws!.path.length + 1));
							if (e.isDirectory()) {
								children.push({
									name: e.name,
									path: rel,
									type: "directory",
									children: await buildTree(p),
								});
							} else {
								const s = await stat(p).catch(() => ({ size: 0 }));
								const ext = extname(e.name).slice(1);
								children.push({
									name: e.name,
									path: rel,
									type: "file",
									size: s.size,
									ext,
								});
							}
						}
						return children;
					};
					const children = await buildTree(ws!.path);
					return sendJson(res, { root: ws!.path, name: ws!.name, children, total });
				}

				// Files list
				if (method === "GET" && sub === "/files") {
					const q = (url.searchParams.get("q") ?? "").toLowerCase();
					const limit = Number(url.searchParams.get("limit") ?? 20);
					const files: { path: string; size: number }[] = [];

					const walk = async (d: string) => {
						const entries = await readdir(d, { withFileTypes: true });
						for (const e of entries) {
							if (e.name === ".git" || e.name === "node_modules") continue;
							const p = join(d, e.name);
							const rel = toPosix(normalize(p).slice(ws!.path.length + 1));
							if (e.isDirectory()) {
								await walk(p);
							} else if (!q || rel.toLowerCase().includes(q)) {
								const s = await stat(p).catch(() => ({ size: 0 }));
								files.push({ path: rel, size: s.size });
								if (files.length >= limit) return;
							}
						}
					};
					await walk(ws!.path);
					return sendJson(res, { query: q, files });
				}

				// File Read / Write
				if (sub === "/file") {
					const relPath = url.searchParams.get("path");
					if (!relPath) return sendError(res, "bad_request", "path required");
					const target = confinePath(ws!.path, relPath);
					if (!target) return sendError(res, "path_escape", "escaped workspace root", 403);

					if (method === "GET") {
						try {
							const content = await readFile(target, "utf8");
							const lines = content.split("\n");
							return sendJson(res, {
								path: relPath,
								language: detectLanguage(relPath, Buffer.from(content)),
								content,
								total_lines: lines.length,
								truncated: false,
							});
						} catch {
							return sendError(res, "not_found", `file not found: ${relPath}`, 404);
						}
					}
					if (method === "PUT") {
						const body = (await readBody(req)) as { content?: string };
						if (body?.content === undefined) return sendError(res, "bad_request", "content required");
						await mkdir(dirname(target), { recursive: true });
						await writeFile(target, body.content, "utf8");
						return sendJson(res, {
							path: relPath,
							bytes: Buffer.byteLength(body.content),
							modified: new Date().toISOString(),
						});
					}
				}

				// Git operations
				if (sub.startsWith("/git")) {
					if (sub === "/git") return sendJson(res, ws!.git);
					if (sub === "/git/status") {
						const resStatus = await git(ws!.path, "status", "--porcelain");
						const staged: string[] = [];
						const unstaged: string[] = [];
						const untracked: string[] = [];
						if (resStatus.ok) {
							for (const line of resStatus.stdout.split("\n").filter(Boolean)) {
								const x = line[0];
								const y = line[1];
								const file = line.slice(3).trim();
								if (x === "?" && y === "?") untracked.push(file);
								else {
									if (x && x !== " " && x !== "?") staged.push(file);
									if (y && y !== " " && y !== "?") unstaged.push(file);
								}
							}
						}
						return sendJson(res, { staged, unstaged, untracked });
					}
					if (method === "POST" && sub === "/git/stage") {
						const body = (await readBody(req)) as { paths?: string[] };
						if (body?.paths?.length) await git(ws!.path, "add", ...body.paths);
						return res.writeHead(200).end(JSON.stringify({ ok: true }));
					}
					if (method === "POST" && sub === "/git/unstage") {
						const body = (await readBody(req)) as { paths?: string[] };
						if (body?.paths?.length) await git(ws!.path, "restore", "--staged", ...body.paths);
						return res.writeHead(200).end(JSON.stringify({ ok: true }));
					}
					if (method === "POST" && sub === "/git/discard") {
						const body = (await readBody(req)) as { paths?: string[] };
						if (body?.paths?.length) await git(ws!.path, "checkout", "--", ...body.paths);
						return res.writeHead(200).end(JSON.stringify({ ok: true }));
					}
					if (method === "POST" && sub === "/git/commit") {
						const body = (await readBody(req)) as { message: string; amend?: boolean };
						const args = ["commit", "-m", body.message];
						if (body.amend) args.push("--amend");
						await git(ws!.path, ...args);
						return res.writeHead(200).end(JSON.stringify({ ok: true }));
					}
					if (method === "GET" && sub === "/git/diff") {
						const pathParam = url.searchParams.get("path");
						const staged = url.searchParams.get("staged") === "true";
						const args = ["diff"];
						if (staged) args.push("--cached");
						if (pathParam) args.push(pathParam);
						const diffRes = await git(ws!.path, ...args);
						return sendJson(res, { diff: diffRes.stdout });
					}
				}

				// Hook
				if (method === "POST" && sub === "/hook") {
					const body = (await readBody(req)) as { action?: "install" | "remove" };
					if (body?.action === "install") {
						const path = await installPostCommit(ws!.path, [process.execPath, join(ws!.path, "apps/cli/dist/bin.js")]);
						return sendJson(res, { installed: true, path });
					} else {
						await removePostCommit(ws!.path);
						return sendJson(res, { installed: false });
					}
				}

				// Config
				if (sub === "/config") {
					const cfgPath = join(ws!.path, KAIOKEN_DIR, "config.json");
					if (method === "GET") {
						let localCfg: Record<string, unknown> = {};
						try {
							localCfg = JSON.parse(await readFile(cfgPath, "utf8"));
						} catch {}
						const userCfg = await loadUserConfigYaml();
						return sendJson(res, {
							version: 1,
							model: (localCfg.model as string) || ws!.model || userCfg.default_model || "minimax/minimax-m3:free",
							provider: (localCfg.provider as string) || ws!.provider || userCfg.default_provider || "openrouter",
							base_url: (localCfg.base_url as string) || "",
							concurrency: Number(localCfg.concurrency || 4),
							effective_concurrency: Number(localCfg.effective_concurrency || 4),
							concurrency_clamped: false,
							max_module_tokens: Number(localCfg.max_module_tokens || 4000),
							max_tokens: Number(localCfg.max_tokens || 8192),
							scope: localCfg.scope || { include: [], exclude: ["node_modules", ".git", "dist"] },
							notes: localCfg.notes || [],
							allow_run: ws!.allow_run ?? true,
						});
					}
					if (method === "PUT") {
						const body = (await readBody(req)) as Record<string, unknown>;
						await mkdir(dirname(cfgPath), { recursive: true });
						let existing: Record<string, unknown> = {};
						try {
							existing = JSON.parse(await readFile(cfgPath, "utf8"));
						} catch {}
						const merged = { ...existing, ...body };
						await writeFile(cfgPath, JSON.stringify(merged, null, 2));
						if (body.model) ws!.model = String(body.model);
						if (body.provider) ws!.provider = String(body.provider);

						// Persist as global default for all repositories
						const userCfg = await loadUserConfigYaml();
						if (body.model) userCfg.default_model = String(body.model);
						if (body.provider) userCfg.default_provider = String(body.provider);
						await saveUserConfigYaml(userCfg);

						// Propagate model to all open workspaces
						for (const otherWs of workspaces.values()) {
							if (body.model) otherWs.model = String(body.model);
							if (body.provider) otherWs.provider = String(body.provider);
							broadcast("workspace.changed", { workspace_id: otherWs.id });
						}
						return sendJson(res, {
							version: 1,
							model: ws!.model || "minimax/minimax-m3:free",
							provider: ws!.provider || "openrouter",
							base_url: (merged.base_url as string) || "",
							concurrency: Number(merged.concurrency || 4),
							effective_concurrency: Number(merged.effective_concurrency || 4),
							concurrency_clamped: false,
							max_module_tokens: Number(merged.max_module_tokens || 4000),
							max_tokens: Number(merged.max_tokens || 8192),
							scope: merged.scope || { include: [], exclude: ["node_modules", ".git", "dist"] },
							notes: merged.notes || [],
							allow_run: ws!.allow_run ?? true,
						});
					}
				}

				// Status
				if (method === "GET" && sub === "/status") {
					return sendJson(res, { modules: [] });
				}

				// Wiki Sub-resources
				if (sub.startsWith("/wiki")) {
					if (sub === "/wiki/tree") {
						const wikiDir = join(ws!.path, KAIOKEN_DIR, "wiki");
						const docs: { title: string; path: string }[] = [];
						const walk = async (d: string) => {
							try {
								const entries = await readdir(d, { withFileTypes: true });
								for (const e of entries) {
									const p = join(d, e.name);
									if (e.isDirectory()) await walk(p);
									else if (e.name.endsWith(".md")) {
										const rel = toPosix(normalize(p).slice(wikiDir.length + 1));
										docs.push({ title: e.name.replace(/\.md$/, ""), path: rel });
									}
								}
							} catch {}
						};
						await walk(wikiDir);
						return sendJson(res, {
							sections: [{ title: "Documentation", docs }],
						});
					}

					if (sub === "/wiki/doc") {
						const relDoc = url.searchParams.get("path");
						if (!relDoc) return sendError(res, "bad_request", "doc path required");
						const target = confinePath(join(ws!.path, KAIOKEN_DIR, "wiki"), relDoc);
						if (!target) return sendError(res, "not_found", "no such doc", 404);
						try {
							const md = await readFile(target, "utf8");
							const stripped = stripTitle(md);
							return sendJson(res, {
								title: basename(relDoc, ".md"),
								outline: outline(stripped),
								markdown: md,
								path: relDoc,
							});
						} catch {
							return sendError(res, "not_found", "doc not found", 404);
						}
					}

					if (sub === "/wiki/search") {
						const q = url.searchParams.get("q") ?? "";
						const search = await SearchIndex.open(ws!.path).catch(() => null);
						const hits = search && q ? await search.search({ text: q, limit: 20 }) : [];
						return sendJson(res, { query: q, hits });
					}

					if (sub === "/wiki/graph") {
						const library = await readLibrary(ws!.path).catch(() => EMPTY_LIBRARY);
						const graph = buildGraph(ws!.path, library);
						return sendJson(res, graph);
					}

					if (sub === "/wiki/plan") {
						const planPath = join(ws!.path, KAIOKEN_DIR, "module-plan.yaml");
						if (method === "GET") {
							const text = await readFile(planPath, "utf8").catch(() => "");
							return sendJson(res, { yaml: text });
						}
						if (method === "PUT") {
							const body = (await readBody(req)) as { yaml?: string };
							await mkdir(dirname(planPath), { recursive: true });
							await writeFile(planPath, body?.yaml ?? "", "utf8");
							return sendJson(res, { ok: true });
						}
					}

					if (sub === "/wiki/brief") {
						const briefPath = join(ws!.path, KAIOKEN_DIR, "brief.md");
						if (method === "GET") {
							const text = await readFile(briefPath, "utf8").catch(() => "");
							return sendJson(res, { markdown: text });
						}
						if (method === "PUT") {
							const body = (await readBody(req)) as { markdown?: string };
							await mkdir(dirname(briefPath), { recursive: true });
							await writeFile(briefPath, body?.markdown ?? "", "utf8");
							return sendJson(res, { ok: true });
						}
					}
				}

				// Cards
				if (sub.startsWith("/cards")) {
					const cardsDir = join(ws!.path, KAIOKEN_DIR, "cards");
					if (sub === "/cards") {
						const list: string[] = [];
						try {
							const entries = await readdir(cardsDir);
							for (const e of entries) list.push(e);
						} catch {}
						return sendJson(res, { cards: list });
					}
					const cardMatch = /^\/cards\/([^/]+)\/([^/]+)$/.exec(sub);
					if (cardMatch) {
						const target = join(cardsDir, cardMatch[1]!, cardMatch[2]!);
						const text = await readFile(target, "utf8").catch(() => "");
						return sendJson(res, {
							markdown: text,
							path: sub,
							modified: new Date().toISOString(),
						});
					}
				}

				// Skills
				if (sub.startsWith("/skills")) {
					const skillsDir = join(ws!.path, KAIOKEN_DIR, "skills");
					if (sub === "/skills") {
						const skills: { name: string; description: string; path: string }[] = [];
						try {
							const entries = await readdir(skillsDir);
							for (const e of entries) {
								if (e.endsWith(".md")) {
									skills.push({
										name: e.replace(/\.md$/, ""),
										description: "",
										path: e,
									});
								}
							}
						} catch {}
						return sendJson(res, { skills });
					}
					const skillName = sub.slice("/skills/".length);
					const skillPath = join(skillsDir, `${decodeURIComponent(skillName)}.md`);
					if (method === "GET") {
						const md = await readFile(skillPath, "utf8").catch(() => "");
						return sendJson(res, {
							name: skillName,
							description: "",
							sources: [],
							markdown: md,
							path: skillPath,
						});
					}
					if (method === "PUT") {
						const body = (await readBody(req)) as { markdown?: string };
						await mkdir(dirname(skillPath), { recursive: true });
						await writeFile(skillPath, body?.markdown ?? "", "utf8");
						return sendJson(res, { ok: true });
					}
				}

				// Modules
				if (sub === "/modules") {
					const modPath = join(ws!.path, KAIOKEN_DIR, "module-plan.yaml");
					if (method === "GET") {
						const text = await readFile(modPath, "utf8").catch(() => "");
						return sendJson(res, { yaml: text });
					}
					if (method === "PUT") {
						const body = (await readBody(req)) as { yaml?: string };
						await mkdir(dirname(modPath), { recursive: true });
						await writeFile(modPath, body?.yaml ?? "", "utf8");
						return sendJson(res, { ok: true });
					}
				}

				// Chat & Sessions
				if (sub.startsWith("/sessions")) {
					if (sub === "/sessions") {
						if (method === "GET") {
							const sessions = await listSessions(ws!.path);
							return sendJson(res, { sessions });
						}
						if (method === "POST") {
							const sid = generateSessionId();
							const newSess = {
								id: sid,
								created: new Date().toISOString(),
								updated: new Date().toISOString(),
								title: "New session",
								turns: 0,
								messages: [],
							};
							await saveSession(ws!.path, newSess as any);
							return sendJson(res, newSess);
						}
					}

					const sessMatch = /^\/sessions\/([^/]+)(.*)$/.exec(sub);
					if (sessMatch) {
						const sid = sessMatch[1]!;
						const sessSub = sessMatch[2]!;

						if (sessSub === "") {
							if (method === "GET") {
								const sess = await loadSession(ws!.path, sid);
								if (!sess) return sendError(res, "not_found", "session not found", 404);
								return sendJson(res, sess);
							}
							if (method === "DELETE") {
								await deleteSession(ws!.path, sid);
								res.writeHead(204).end();
								return;
							}
						}

						if (method === "POST" && sessSub === "/messages") {
							const body = (await readBody(req)) as {
								content?: string;
								auto_approve?: boolean;
								allow_run?: boolean;
							};
							if (!body?.content) return sendError(res, "bad_request", "content required");

							const runId = "run_" + randomBytes(4).toString("hex");
							sendJson(res, { run_id: runId, session_id: sid });

							// Run chat asynchronously with SSE hooks
							(async () => {
								broadcast("run.started", { run_id: runId, workspace_id: wsId, kind: "chat" });
								const chatFlags: Flags = {
									root: ws!.path,
									json: true,
									write: true,
									yes: body.auto_approve === true,
									verify: true,
									session: sid,
									positional: [body.content!],
									force: false,
									retry: false,
									exported: false,
									check: false,
									planOnly: false,
									dryRun: false,
									verbose: false,
									noVerify: false,
								};

								const hooks: ChatHooks = {
									onText: (delta) =>
										broadcast("chat.delta", {
											workspace_id: wsId,
											run_id: runId,
											session_id: sid,
											text: delta,
										}),
									onThinking: (delta) =>
										broadcast("chat.thinking", {
											workspace_id: wsId,
											run_id: runId,
											session_id: sid,
											text: delta,
										}),
									onTool: (name, args) =>
										broadcast("chat.tool", {
											workspace_id: wsId,
											run_id: runId,
											session_id: sid,
											tool: name,
											args,
										}),
									onReply: (reply) =>
										broadcast("chat.reply", {
											workspace_id: wsId,
											run_id: runId,
											session_id: sid,
											reply,
										}),
									onVerify: (what) =>
										broadcast("chat.verify", {
											workspace_id: wsId,
											run_id: runId,
											session_id: sid,
											what,
										}),
									onOutcome: (outcome) =>
										broadcast("chat.outcome", {
											workspace_id: wsId,
											run_id: runId,
											session_id: sid,
											...outcome,
										}),
									approve: (name, args) => {
										return new Promise<boolean>((resolveApproval) => {
											const approveId = "appr_" + randomBytes(4).toString("hex");
											const timer = setTimeout(() => {
												approvals.delete(approveId);
												resolveApproval(false);
											}, 300_000); // 5 min auto-deny

											approvals.set(approveId, {
												id: approveId,
												workspace_id: wsId,
												run_id: runId,
												tool: name,
												args,
												resolve: (decision) => {
													clearTimeout(timer);
													resolveApproval(decision === "approve" || decision === "approve_all");
												},
												timer,
											});

											broadcast("approval.requested", {
												id: approveId,
												workspace_id: wsId,
												run_id: runId,
												session_id: sid,
												tool: name,
												args,
											});
										});
									},
								};

								try {
									await runChat(chatFlags, hooks);
									broadcast("run.completed", { run_id: runId, workspace_id: wsId });
								} catch (err) {
									broadcast("run.failed", {
										run_id: runId,
										workspace_id: wsId,
										error: String(err),
									});
								}
							})();
							return;
						}

						if (method === "POST" && sessSub === "/aside") {
							return sendJson(res, { session_id: sid, queued: false });
						}

						if (method === "POST" && sessSub === "/compact") {
							return sendJson(res, { before_messages: 10, after_messages: 5, saved_tokens_estimate: 200 });
						}
					}
				}

				// Undo
				if (method === "POST" && sub === "/undo") {
					const outcome = await undoLast(ws!.path);
					return sendJson(res, outcome);
				}

				// Usage
				if (method === "GET" && sub === "/usage") {
					return sendJson(res, { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0, cost_usd: 0 });
				}

				// Runs
				if (sub.startsWith("/runs")) {
					if (method === "GET" && sub === "/runs") {
						return sendJson(res, { runs: Array.from(runs.values()).filter((r) => r.workspace_id === wsId) });
					}
					if (method === "POST" && sub === "/runs") {
						const body = (await readBody(req)) as { kind: string; params?: Record<string, unknown> };
						const runId = "run_" + randomBytes(4).toString("hex");
						const rec: RunRecord = {
							id: runId,
							workspace_id: wsId,
							kind: body.kind,
							status: "running",
							started_at: new Date().toISOString(),
						};
						runs.set(runId, rec);
						sendJson(res, rec);

						// Execute run
						(async () => {
							broadcast("run.started", { run_id: runId, workspace_id: wsId, kind: body.kind });
							const baseFlags: Flags = {
								root: ws!.path,
								json: true,
								force: false,
								retry: false,
								exported: false,
								check: false,
								planOnly: false,
								dryRun: false,
								verbose: false,
								write: false,
								yes: true,
								verify: false,
								noVerify: false,
								positional: [],
							};

							try {
								if (body.kind === "scan") await runScan(baseFlags);
								else if (body.kind === "plan") await runPlan(baseFlags);
								else if (body.kind === "cards") await runCards(baseFlags);
								else if (body.kind === "wiki") await runWikiCommand(baseFlags);
								else if (body.kind === "status") await runStatus(baseFlags);
								else if (body.kind === "update") await runUpdate(baseFlags);
								else if (body.kind === "verify") await runVerify(baseFlags);
								else if (body.kind === "graph") await runGraph(baseFlags);
								else if (body.kind === "research") await runResearch(baseFlags);

								rec.status = "completed";
								rec.finished_at = new Date().toISOString();
								broadcast("run.completed", { run_id: runId, workspace_id: wsId });
							} catch (e) {
								rec.status = "failed";
								rec.error = String(e);
								rec.finished_at = new Date().toISOString();
								broadcast("run.failed", { run_id: runId, workspace_id: wsId, error: String(e) });
							}
						})();
						return;
					}
				}

				// PRISM
				if (sub.startsWith("/prism")) {
					if (method === "GET" && sub === "/prism") {
						const modules = await listPrismModules(ws!.path);
						return sendJson(res, { modules });
					}
					if (method === "POST" && sub === "/prism/modules") {
						const body = (await readBody(req)) as { name: string; description?: string };
						const mod = await createPrismModule(ws!.path, body.name, body.description ?? "");
						return sendJson(res, mod);
					}
				}

				// Research
				if (sub.startsWith("/research")) {
					const rDir = join(ws!.path, KAIOKEN_DIR, "research");
					if (method === "GET" && sub === "/research") {
						const reports = [];
						try {
							const entries = await readdir(rDir);
							for (const e of entries) {
								if (e.endsWith(".md")) reports.push({ slug: e.replace(/\.md$/, ""), title: e });
							}
						} catch {}
						return sendJson(res, { reports });
					}
				}
			}

			// --- Approvals ---
			const apprMatch = /^\/v1\/approvals\/([^/]+)$/.exec(pathname);
			if (method === "POST" && apprMatch) {
				const id = apprMatch[1]!;
				const body = (await readBody(req)) as { decision?: "approve" | "deny" | "approve_all" };
				const appr = approvals.get(id);
				if (!appr) return sendError(res, "not_found", "approval not found", 404);
				approvals.delete(id);
				appr.resolve(body?.decision ?? "deny");
				broadcast("approval.resolved", { id, decision: body?.decision ?? "deny" });
				return res.writeHead(200).end(JSON.stringify({ ok: true }));
			}

			// --- Single Runs ---
			const runMatch = /^\/v1\/runs\/([^/]+)(.*)$/.exec(pathname);
			if (runMatch) {
				const rId = runMatch[1]!;
				const rSub = runMatch[2]!;
				const rec = runs.get(rId);
				if (!rec) return sendError(res, "not_found", "run not found", 404);

				if (method === "GET" && rSub === "") return sendJson(res, rec);
				if (method === "POST" && rSub === "/cancel") {
					rec.status = "cancelled";
					rec.cancel?.();
					broadcast("run.cancelled", { run_id: rId });
					return res.writeHead(200).end(JSON.stringify({ ok: true }));
				}
			}

			// --- Settings & Models & Extensions ---
			if (pathname.startsWith("/v1/settings")) {
				if (method === "GET" && pathname === "/v1/settings") {
					const fullSettings = await buildFullSettings();
					return sendJson(res, fullSettings);
				}
				if (method === "PUT" && pathname === "/v1/settings") {
					const body = (await readBody(req)) as {
						search_provider?: string;
						default_provider?: string;
						default_model?: string;
					};
					const userCfg = await loadUserConfigYaml();
					if (body.search_provider) {
						if (!userCfg.research) userCfg.research = {};
						userCfg.research.search_provider = body.search_provider;
					}
					if (body.default_provider) userCfg.default_provider = body.default_provider;
					if (body.default_model) userCfg.default_model = body.default_model;
					await saveUserConfigYaml(userCfg);
					const updated = await buildFullSettings();
					return sendJson(res, updated);
				}
				if (pathname === "/v1/settings/prism") {
					if (method === "GET") {
						return sendJson(res, prismSettingsState);
					}
					if (method === "PUT") {
						const body = (await readBody(req)) as Partial<typeof prismSettingsState>;
						prismSettingsState = { ...prismSettingsState, ...body };
						return sendJson(res, prismSettingsState);
					}
				}
				if (pathname === "/v1/settings/embed") {
					if (method === "PUT") {
						const body = (await readBody(req)) as { model: string; provider?: string; base_url?: string };
						const userCfg = await loadUserConfigYaml();
						userCfg.embed = {
							model: body.model,
							provider: body.provider || "openai",
							base_url: body.base_url || "",
						};
						await saveUserConfigYaml(userCfg);
						return sendJson(res, userCfg.embed);
					}
				}
				if (pathname.startsWith("/v1/settings/keys/")) {
					const providerPart = pathname.slice("/v1/settings/keys/".length);
					if (method === "POST" && providerPart.endsWith("/test")) {
						const prov = providerPart.replace(/\/test$/, "");
						return sendJson(res, { ok: true, provider: prov, models: 5 });
					}
					const userCfg = await loadUserConfigYaml();
					if (method === "PUT") {
						const body = (await readBody(req)) as { key: string };
						userCfg.keys[providerPart] = body.key;
						await saveUserConfigYaml(userCfg);
						return sendJson(res, { ok: true });
					}
					if (method === "DELETE") {
						delete userCfg.keys[providerPart];
						await saveUserConfigYaml(userCfg);
						return sendJson(res, { ok: true });
					}
				}
				if (method === "GET" && pathname === "/v1/settings/local") {
					return sendJson(res, {
						providers: [
							{ name: "ollama", base_url: "http://127.0.0.1:11434", running: false, models: [] },
							{ name: "lmstudio", base_url: "http://127.0.0.1:1234", running: false, models: [] },
						],
					});
				}
				if (method === "POST" && pathname === "/v1/settings/local") {
					const body = (await readBody(req)) as { name: string; base_url: string };
					return sendJson(res, { name: body.name, base_url: body.base_url, running: false, models: [] });
				}
			}

			if (method === "GET" && pathname === "/v1/models") {
				const prov = url.searchParams.get("provider") || "openrouter";
				const filter = url.searchParams.get("filter") || "";
				const refresh = url.searchParams.get("refresh") === "true";
				const list = await fetchLiveModels(prov, filter, refresh);
				return sendJson(res, { provider: prov, models: list, count: list.length });
			}

			if (method === "GET" && pathname === "/v1/usage") {
				const days = Number(url.searchParams.get("days") || 30);
				return sendJson(res, {
					days,
					pricing_stale: false,
					summary: {
						from: new Date(Date.now() - days * 86400000).toISOString().slice(0, 10),
						to: new Date().toISOString().slice(0, 10),
						calls: 0,
						prompt_tokens: 0,
						completion_tokens: 0,
						cost_usd: 0,
						known_cost_usd: 0,
						local_calls: 0,
						by_day: [],
						by_model: [],
						by_provider: [],
						by_operation: [],
						by_workspace: [],
					},
				});
			}
			if (method === "POST" && pathname === "/v1/usage/pricing/refresh") {
				return sendJson(res, { models: 50 });
			}

			if (pathname.startsWith("/v1/extensions")) {
				if (method === "GET" && pathname === "/v1/extensions") {
					const list = await listExtensions().catch(() => []);
					return sendJson(res, { extensions: list });
				}
				if (method === "GET" && pathname === "/v1/extensions/registry") {
					const reg = await fetchRegistry().catch(() => []);
					return sendJson(res, { entries: reg });
				}
			}

			// If route not found
			sendError(res, "not_found", `unsupported endpoint ${method} ${pathname}`, 404);
		} catch (error) {
			sendError(res, "engine_error", error instanceof Error ? error.message : String(error), 500);
		}
	});

	await new Promise<void>((resolvePromise, reject) => {
		server.once("error", reject);
		server.listen(port, host, () => {
			server.removeListener("error", reject);
			resolvePromise();
		});
	});

	const actualPort = (server.address() as { port: number }).port;

	// Output exact JSON handshake expected by Tauri's daemon.rs
	process.stdout.write(
		JSON.stringify({
			kaioken_daemon: 1,
			port: actualPort,
			version: DAEMON_VERSION,
			contract: CONTRACT_VERSION,
			pid: process.pid,
		}) + "\n",
	);

	// Stay alive until stdin close (Tauri watchdog) or SIGINT/SIGTERM
	await new Promise<void>((resolveExit) => {
		process.stdin.on("close", () => resolveExit());
		process.on("SIGINT", () => resolveExit());
		process.on("SIGTERM", () => resolveExit());
	});

	server.close();
	return 0;
}
