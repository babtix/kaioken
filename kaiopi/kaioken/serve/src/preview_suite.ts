import { escapeAttr, escapeHtml } from "./markdown.ts";
import { STYLE } from "./pages/layout.ts";

/**
 * 10 Canonical Serve Views defined in Step 36 (UX-1551 – UX-1600).
 */
export type ServeViewKind =
	| "wiki-chapter-view"
	| "card-fact-browser"
	| "dependency-graph-canvas"
	| "file-tree-explorer"
	| "drift-staleness-dashboard"
	| "search-results-drawer"
	| "symbol-inspector-pane"
	| "impact-simulator-view"
	| "skill-catalog-view"
	| "verification-history-viewer";

export const ALL_SERVE_VIEW_KINDS: readonly ServeViewKind[] = [
	"wiki-chapter-view",
	"card-fact-browser",
	"dependency-graph-canvas",
	"file-tree-explorer",
	"drift-staleness-dashboard",
	"search-results-drawer",
	"symbol-inspector-pane",
	"impact-simulator-view",
	"skill-catalog-view",
	"verification-history-viewer",
] as const;

export interface ServeViewMetadata {
	kind: ServeViewKind;
	title: string;
	description: string;
	defaultRoute: string;
	supportsSidebar: boolean;
	supportsPrintExport: boolean;
	requiresCanvas: boolean;
}

export const SERVE_VIEW_METADATA: Record<ServeViewKind, ServeViewMetadata> = {
	"wiki-chapter-view": {
		kind: "wiki-chapter-view",
		title: "Wiki Chapter Reading View",
		description: "Long-form architectural documentation with table of contents and heading navigation.",
		defaultRoute: "/wiki",
		supportsSidebar: true,
		supportsPrintExport: true,
		requiresCanvas: false,
	},
	"card-fact-browser": {
		kind: "card-fact-browser",
		title: "Knowledge Card Fact Browser",
		description: "Atomic fact cards indexed by symbol, provenance, and verification state.",
		defaultRoute: "/cards",
		supportsSidebar: true,
		supportsPrintExport: true,
		requiresCanvas: false,
	},
	"dependency-graph-canvas": {
		kind: "dependency-graph-canvas",
		title: "Interactive Dependency Graph Canvas",
		description: "WebGL / Canvas interactive visualization of package and symbol dependencies.",
		defaultRoute: "/graph",
		supportsSidebar: false,
		supportsPrintExport: true,
		requiresCanvas: true,
	},
	"file-tree-explorer": {
		kind: "file-tree-explorer",
		title: "Repository File Tree Explorer",
		description: "Hierarchical file directory explorer with syntax highlighting and risk tags.",
		defaultRoute: "/files",
		supportsSidebar: true,
		supportsPrintExport: true,
		requiresCanvas: false,
	},
	"drift-staleness-dashboard": {
		kind: "drift-staleness-dashboard",
		title: "Live Drift and Staleness Report Dashboard",
		description: "Freshness meters, orphaned card tracking, and truth drift indicators.",
		defaultRoute: "/drift",
		supportsSidebar: false,
		supportsPrintExport: true,
		requiresCanvas: false,
	},
	"search-results-drawer": {
		kind: "search-results-drawer",
		title: "Search Results Preview Drawer",
		description: "Quick-access slideout drawer with BM25 snippet previews and keyboard navigation.",
		defaultRoute: "/search",
		supportsSidebar: true,
		supportsPrintExport: false,
		requiresCanvas: false,
	},
	"symbol-inspector-pane": {
		kind: "symbol-inspector-pane",
		title: "Symbol Declaration Inspector Pane",
		description: "AST symbol declaration signatures, references, and type information.",
		defaultRoute: "/symbols",
		supportsSidebar: true,
		supportsPrintExport: true,
		requiresCanvas: false,
	},
	"impact-simulator-view": {
		kind: "impact-simulator-view",
		title: "Code Impact Blast Radius Simulator",
		description: "Simulation view showing transitive dependents and affected test targets.",
		defaultRoute: "/impact",
		supportsSidebar: true,
		supportsPrintExport: true,
		requiresCanvas: false,
	},
	"skill-catalog-view": {
		kind: "skill-catalog-view",
		title: "Agent Skill Procedure Catalog",
		description: "Catalog of autonomous agent procedures, verification recipes, and parameters.",
		defaultRoute: "/skills",
		supportsSidebar: true,
		supportsPrintExport: true,
		requiresCanvas: false,
	},
	"verification-history-viewer": {
		kind: "verification-history-viewer",
		title: "Verification Gate Test History Viewer",
		description: "Historic test run matrix with pass/fail telemetry, coverage, and regressions.",
		defaultRoute: "/verify",
		supportsSidebar: true,
		supportsPrintExport: true,
		requiresCanvas: false,
	},
};

/* -------------------------------------------------------------------------- */
/* Theme 1: Dark and Light Theme Toggle with LocalStorage (UX-1551 – UX-1560)  */
/* -------------------------------------------------------------------------- */

export interface ThemeToggleConfig {
	view: ServeViewKind;
	storageKey: string;
	defaultTheme: "dark" | "light";
	toggleButtonId: string;
	dataAttribute: string;
	recolorCallback?: string;
}

export function buildThemeToggleConfig(view: ServeViewKind): ThemeToggleConfig {
	return {
		view,
		storageKey: "kaioken-theme-preference",
		defaultTheme: "dark",
		toggleButtonId: `k-theme-toggle-${view}`,
		dataAttribute: "data-theme",
		recolorCallback: view === "dependency-graph-canvas" ? "window.__kaioRecolorGraph" : "window.__kaioRecolor",
	};
}

export function renderThemeToggleScript(view: ServeViewKind): string {
	const config = buildThemeToggleConfig(view);
	return `
(function() {
  var STORAGE_KEY = '${config.storageKey}';
  var ATTR = '${config.dataAttribute}';
  var btn = document.getElementById('${config.toggleButtonId}') || document.getElementById('k-theme');
  
  function getTheme() {
    try {
      return localStorage.getItem(STORAGE_KEY) || '${config.defaultTheme}';
    } catch(e) {
      return '${config.defaultTheme}';
    }
  }
  
  function applyTheme(theme) {
    document.documentElement.setAttribute(ATTR, theme);
    document.documentElement.dataset.theme = theme;
    if (btn) {
      var isLight = theme === 'light';
      btn.textContent = isLight ? '\\u25D0' : '\\u25D1';
      btn.setAttribute('aria-label', isLight ? 'Switch to dark theme' : 'Switch to light theme');
      btn.setAttribute('title', isLight ? 'Switch to dark theme' : 'Switch to light theme');
    }
    if (${config.recolorCallback ? `typeof ${config.recolorCallback} === 'function'` : "false"}) {
      ${config.recolorCallback}();
    }
  }

  if (btn) {
    btn.addEventListener('click', function() {
      var current = getTheme();
      var next = current === 'light' ? 'dark' : 'light';
      try { localStorage.setItem(STORAGE_KEY, next); } catch(e) {}
      applyTheme(next);
    });
  }

  applyTheme(getTheme());
})();
`.trim();
}

/* -------------------------------------------------------------------------- */
/* Theme 2: Print-Optimized CSS Stylesheet (UX-1561 – UX-1570)                 */
/* -------------------------------------------------------------------------- */

export function generatePrintStylesheet(view: ServeViewKind): string {
	const meta = SERVE_VIEW_METADATA[view];

	return `
/* ========================================================================== */
/* Print-Optimized Stylesheet for ${meta.title} (${view})                     */
/* ========================================================================== */
@media print {
  @page {
    size: letter portrait;
    margin: 1.5cm;
  }

  *, *:before, *:after {
    background: transparent !important;
    color: #000000 !important;
    box-shadow: none !important;
    text-shadow: none !important;
  }

  html, body {
    background: #ffffff !important;
    color: #000000 !important;
    font-size: 11pt !important;
    line-height: 1.4 !important;
  }

  /* Hide interactive chrome and navigation */
  .hdr, .nav, .sidebar, .rail, .foot,
  .find, #k-theme, [role="search"],
  .tgl, .skip, .drawer-toggle, .drawer-backdrop,
  button, input, select, textarea {
    display: none !important;
  }

  .page, .page--railed {
    display: block !important;
    max-width: 100% !important;
    padding: 0 !important;
    margin: 0 !important;
  }

  .main {
    width: 100% !important;
    margin: 0 !important;
    padding: 0 !important;
  }

  /* Prevent page breaks within blocks */
  h1, h2, h3, h4, h5, h6 {
    page-break-after: avoid;
    break-after: avoid;
    color: #000000 !important;
  }

  p, pre, blockquote, table, .card, .stat, .grid {
    page-break-inside: avoid;
    break-inside: avoid;
  }

  pre, code {
    border: 1px solid #cccccc !important;
    white-space: pre-wrap !important;
    word-break: break-all !important;
    font-size: 9.5pt !important;
  }

  a, a:visited {
    text-decoration: underline !important;
    color: #000000 !important;
  }

  /* Display full citation link targets */
  a[href^="http"]:after {
    content: " (" attr(href) ")";
    font-size: 8pt;
    color: #555555 !important;
  }

  ${
		view === "dependency-graph-canvas"
			? `
  /* Print fallback for canvas */
  canvas {
    max-width: 100% !important;
    border: 1px solid #999999 !important;
  }
  `
			: ""
	}

  /* Print document header */
  body:before {
    content: "Kaioken Preview :: ${escapeAttr(meta.title)}";
    display: block;
    font-family: monospace;
    font-size: 9pt;
    color: #666666;
    border-bottom: 1px solid #cccccc;
    padding-bottom: 6px;
    margin-bottom: 18px;
  }
}
`.trim();
}

/* -------------------------------------------------------------------------- */
/* Theme 3: Mobile-Responsive Layout & Collapsible Drawer (UX-1571 – UX-1580)   */
/* -------------------------------------------------------------------------- */

export interface ResponsiveLayoutConfig {
	view: ServeViewKind;
	breakpointPx: number;
	drawerId: string;
	toggleBtnId: string;
	backdropId: string;
	drawerWidthPx: number;
}

export function generateResponsiveLayoutConfig(view: ServeViewKind): ResponsiveLayoutConfig {
	return {
		view,
		breakpointPx: 768,
		drawerId: `drawer-${view}`,
		toggleBtnId: `drawer-toggle-${view}`,
		backdropId: `drawer-backdrop-${view}`,
		drawerWidthPx: 280,
	};
}

export function renderMobileDrawerScript(view: ServeViewKind): string {
	const cfg = generateResponsiveLayoutConfig(view);

	return `
(function() {
  var drawer = document.getElementById('${cfg.drawerId}');
  var toggle = document.getElementById('${cfg.toggleBtnId}');
  var backdrop = document.getElementById('${cfg.backdropId}');
  if (!drawer || !toggle) return;

  function openDrawer() {
    drawer.classList.add('is-open');
    if (backdrop) backdrop.classList.add('is-open');
    toggle.setAttribute('aria-expanded', 'true');
    document.body.style.overflow = 'hidden';
  }

  function closeDrawer() {
    drawer.classList.remove('is-open');
    if (backdrop) backdrop.classList.remove('is-open');
    toggle.setAttribute('aria-expanded', 'false');
    document.body.style.overflow = '';
  }

  toggle.addEventListener('click', function(e) {
    e.stopPropagation();
    var isOpen = drawer.classList.contains('is-open');
    if (isOpen) closeDrawer(); else openDrawer();
  });

  if (backdrop) {
    backdrop.addEventListener('click', closeDrawer);
  }

  document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape' && drawer.classList.contains('is-open')) {
      closeDrawer();
    }
  });
})();
`.trim();
}

/* -------------------------------------------------------------------------- */
/* Theme 4: Strict Content Security Policy (CSP) Headers (UX-1581 – UX-1590)  */
/* -------------------------------------------------------------------------- */

export interface CspPolicyOptions {
	allowWebSockets?: boolean;
	allowInlineImages?: boolean;
	strictSelfOnly?: boolean;
}

export function generateStrictCspPolicy(view: ServeViewKind, options: CspPolicyOptions = {}): string {
	const connectSrc = options.allowWebSockets ? "'self' ws: wss:" : "'self'";
	const imgSrc = options.allowInlineImages !== false ? "'self' data:" : "'self'";

	// Strict CSP forbidding all external origins, allowing inline styles/scripts for zero-dependency operation
	const directives = [
		"default-src 'none'",
		"base-uri 'self'",
		"form-action 'self'",
		"frame-ancestors 'none'",
		"style-src 'self' 'unsafe-inline'",
		"script-src 'self' 'unsafe-inline'",
		`connect-src ${connectSrc}`,
		`img-src ${imgSrc}`,
		"font-src 'self' data:",
		"object-src 'none'",
	];

	if (view === "dependency-graph-canvas") {
		directives.push("worker-src 'self' blob:");
	}

	return directives.join("; ");
}

export function renderCspMetaTag(view: ServeViewKind, options?: CspPolicyOptions): string {
	const policy = generateStrictCspPolicy(view, options);
	return `<meta http-equiv="Content-Security-Policy" content="${escapeAttr(policy)}">`;
}

/* -------------------------------------------------------------------------- */
/* Theme 5: Offline Standalone Export Bundler (UX-1591 – UX-1600)              */
/* -------------------------------------------------------------------------- */

export interface OfflineBundleOptions {
	title: string;
	bodyHtml: string;
	dataPayload?: Record<string, unknown>;
	drawerContentHtml?: string;
	customStyles?: string;
}

export function bundleOfflineStandaloneView(
	view: ServeViewKind,
	options: OfflineBundleOptions,
): string {
	const meta = SERVE_VIEW_METADATA[view];
	const cspMeta = renderCspMetaTag(view);
	const printCss = generatePrintStylesheet(view);
	const themeScript = renderThemeToggleScript(view);
	const drawerScript = renderMobileDrawerScript(view);
	const cfg = generateResponsiveLayoutConfig(view);

	const serializedData = options.dataPayload
		? `<script type="application/json" id="kaioken-offline-data">${escapeHtml(JSON.stringify(options.dataPayload))}</script>`
		: "";

	const responsiveCss = `
@media (max-width: ${cfg.breakpointPx}px) {
  .hdr .nav { display: none !important; }
  .drawer-toggle { display: inline-flex !important; }
  .page--railed { display: block !important; }
  .page--railed > .sidebar { display: none !important; }
  .mobile-drawer {
    position: fixed; top: 0; left: 0; bottom: 0; width: ${cfg.drawerWidthPx}px;
    background: var(--bg-raise); border-right: var(--hair) solid var(--rule);
    z-index: 1200; transform: translateX(-100%); transition: transform var(--dur-ui) var(--ease);
    overflow-y: auto; padding: 20px;
  }
  .mobile-drawer.is-open { transform: translateX(0); }
  .drawer-backdrop {
    position: fixed; inset: 0; background: rgba(0,0,0,0.6);
    z-index: 1100; opacity: 0; pointer-events: none; transition: opacity var(--dur-ui) var(--ease);
  }
  .drawer-backdrop.is-open { opacity: 1; pointer-events: auto; }
}
@media (min-width: ${cfg.breakpointPx + 1}px) {
  .drawer-toggle { display: none !important; }
  .mobile-drawer, .drawer-backdrop { display: none !important; }
}
`;

	return `<!doctype html>
<html lang="en" data-theme="dark">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
${cspMeta}
<title>${escapeHtml(options.title)} — Kaioken Standalone</title>
<style>
${STYLE}
${responsiveCss}
${printCss}
${options.customStyles || ""}
</style>
</head>
<body>
<div id="${escapeAttr(cfg.backdropId)}" class="drawer-backdrop"></div>
<aside id="${escapeAttr(cfg.drawerId)}" class="mobile-drawer" aria-label="Mobile Navigation">
  <div class="drawer-header" style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px;">
    <strong>${escapeHtml(meta.title)}</strong>
  </div>
  ${options.drawerContentHtml || '<p class="muted">No secondary navigation.</p>'}
</aside>
<header class="hdr"><div class="hdr-in wrap">
  <button id="${escapeAttr(cfg.toggleBtnId)}" class="btn btn--sm drawer-toggle" type="button" aria-expanded="false" aria-label="Toggle navigation">&#9776;</button>
  <a class="brand" href="#"><span class="brand-mark" aria-hidden="true">K</span>kaioken</a>
  <span class="badge badge-topic" style="margin-left:8px;">${escapeHtml(meta.title)}</span>
  <div class="hdr-right">
    <button class="tgl" id="k-theme-toggle-${escapeAttr(view)}" type="button" aria-label="Toggle theme">&#x25D1;</button>
  </div>
</div></header>
<main class="page">
${options.bodyHtml}
</main>
<footer class="foot"><div class="foot-in">
  <span class="status-dot" aria-hidden="true"></span>
  <span>Kaioken Zero-Dependency Offline Export · Standalone Document · Local Machine Only</span>
</div></footer>
${serializedData}
<script>
${themeScript}
${drawerScript}
</script>
</body>
</html>
`.trim();
}
