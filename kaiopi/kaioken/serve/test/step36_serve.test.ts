import { describe, expect, it } from "vitest";
import {
	ALL_SERVE_VIEW_KINDS,
	SERVE_VIEW_METADATA,
	type ServeViewKind,
	buildThemeToggleConfig,
	bundleOfflineStandaloneView,
	generatePrintStylesheet,
	generateResponsiveLayoutConfig,
	generateStrictCspPolicy,
	renderCspMetaTag,
	renderMobileDrawerScript,
	renderThemeToggleScript,
} from "../src/index.ts";

describe("Step 36: Category 16 — Serve Preview, Web UI & Interactive Knowledge Graph (UX-1551 – UX-1600)", () => {
	it("defines all 10 canonical serve view kinds", () => {
		expect(ALL_SERVE_VIEW_KINDS).toHaveLength(10);
		for (const view of ALL_SERVE_VIEW_KINDS) {
			const meta = SERVE_VIEW_METADATA[view];
			expect(meta).toBeDefined();
			expect(meta.title.length).toBeGreaterThan(0);
			expect(meta.description.length).toBeGreaterThan(0);
			expect(meta.defaultRoute.startsWith("/")).toBe(true);
		}
	});

	/* -------------------------------------------------------------------------- */
	/* Theme 1: Dark and Light Theme Toggle with LocalStorage (UX-1551 – UX-1560)  */
	/* -------------------------------------------------------------------------- */
	describe("Theme 1: Dark and light theme toggle with persistent localStorage preference (UX-1551 – UX-1560)", () => {
		const testCases: Array<{ view: ServeViewKind; uxId: string }> = [
			{ view: "wiki-chapter-view", uxId: "UX-1551" },
			{ view: "card-fact-browser", uxId: "UX-1552" },
			{ view: "dependency-graph-canvas", uxId: "UX-1553" },
			{ view: "file-tree-explorer", uxId: "UX-1554" },
			{ view: "drift-staleness-dashboard", uxId: "UX-1555" },
			{ view: "search-results-drawer", uxId: "UX-1556" },
			{ view: "symbol-inspector-pane", uxId: "UX-1557" },
			{ view: "impact-simulator-view", uxId: "UX-1558" },
			{ view: "skill-catalog-view", uxId: "UX-1559" },
			{ view: "verification-history-viewer", uxId: "UX-1560" },
		];

		for (const { view, uxId } of testCases) {
			it(`[${uxId}] generates theme toggle config and client script for ${view}`, () => {
				const config = buildThemeToggleConfig(view);
				expect(config.view).toBe(view);
				expect(config.storageKey).toBe("kaioken-theme-preference");
				expect(config.defaultTheme).toBe("dark");
				expect(config.toggleButtonId).toContain(`k-theme-toggle-${view}`);

				const script = renderThemeToggleScript(view);
				expect(script).toContain("kaioken-theme-preference");
				expect(script).toContain("localStorage.getItem");
				expect(script).toContain("localStorage.setItem");
				expect(script).toContain(config.toggleButtonId);
				expect(script).toContain("applyTheme");
			});
		}
	});

	/* -------------------------------------------------------------------------- */
	/* Theme 2: Print-Optimized CSS Stylesheet (UX-1561 – UX-1570)                 */
	/* -------------------------------------------------------------------------- */
	describe("Theme 2: Print-optimized CSS stylesheet generating clean PDF documentation (UX-1561 – UX-1570)", () => {
		const testCases: Array<{ view: ServeViewKind; uxId: string }> = [
			{ view: "wiki-chapter-view", uxId: "UX-1561" },
			{ view: "card-fact-browser", uxId: "UX-1562" },
			{ view: "dependency-graph-canvas", uxId: "UX-1563" },
			{ view: "file-tree-explorer", uxId: "UX-1564" },
			{ view: "drift-staleness-dashboard", uxId: "UX-1565" },
			{ view: "search-results-drawer", uxId: "UX-1566" },
			{ view: "symbol-inspector-pane", uxId: "UX-1567" },
			{ view: "impact-simulator-view", uxId: "UX-1568" },
			{ view: "skill-catalog-view", uxId: "UX-1569" },
			{ view: "verification-history-viewer", uxId: "UX-1570" },
		];

		for (const { view, uxId } of testCases) {
			it(`[${uxId}] generates print-optimized stylesheet for ${view}`, () => {
				const printCss = generatePrintStylesheet(view);
				expect(printCss).toContain("@media print");
				expect(printCss).toContain("color: #000000 !important");
				expect(printCss).toContain("background: #ffffff !important");
				expect(printCss).toContain("page-break-after: avoid");
				expect(printCss).toContain("page-break-inside: avoid");
				expect(printCss).toContain("display: none !important"); // hides nav & chrome
				expect(printCss).toContain(`Kaioken Preview :: ${SERVE_VIEW_METADATA[view].title}`);
			});
		}
	});

	/* -------------------------------------------------------------------------- */
	/* Theme 3: Mobile-Responsive Layout & Collapsible Drawer (UX-1571 – UX-1580)   */
	/* -------------------------------------------------------------------------- */
	describe("Theme 3: Mobile-responsive layout with collapsible sidebar drawer (UX-1571 – UX-1580)", () => {
		const testCases: Array<{ view: ServeViewKind; uxId: string }> = [
			{ view: "wiki-chapter-view", uxId: "UX-1571" },
			{ view: "card-fact-browser", uxId: "UX-1572" },
			{ view: "dependency-graph-canvas", uxId: "UX-1573" },
			{ view: "file-tree-explorer", uxId: "UX-1574" },
			{ view: "drift-staleness-dashboard", uxId: "UX-1575" },
			{ view: "search-results-drawer", uxId: "UX-1576" },
			{ view: "symbol-inspector-pane", uxId: "UX-1577" },
			{ view: "impact-simulator-view", uxId: "UX-1578" },
			{ view: "skill-catalog-view", uxId: "UX-1579" },
			{ view: "verification-history-viewer", uxId: "UX-1580" },
		];

		for (const { view, uxId } of testCases) {
			it(`[${uxId}] generates responsive layout configuration and mobile drawer script for ${view}`, () => {
				const cfg = generateResponsiveLayoutConfig(view);
				expect(cfg.view).toBe(view);
				expect(cfg.breakpointPx).toBe(768);
				expect(cfg.drawerId).toBe(`drawer-${view}`);
				expect(cfg.toggleBtnId).toBe(`drawer-toggle-${view}`);
				expect(cfg.backdropId).toBe(`drawer-backdrop-${view}`);

				const script = renderMobileDrawerScript(view);
				expect(script).toContain(cfg.drawerId);
				expect(script).toContain(cfg.toggleBtnId);
				expect(script).toContain("openDrawer");
				expect(script).toContain("closeDrawer");
				expect(script).toContain("Escape");
			});
		}
	});

	/* -------------------------------------------------------------------------- */
	/* Theme 4: Strict Content Security Policy (CSP) Headers (UX-1581 – UX-1590)  */
	/* -------------------------------------------------------------------------- */
	describe("Theme 4: Strict Content Security Policy (CSP) headers protecting preview (UX-1581 – UX-1590)", () => {
		const testCases: Array<{ view: ServeViewKind; uxId: string }> = [
			{ view: "wiki-chapter-view", uxId: "UX-1581" },
			{ view: "card-fact-browser", uxId: "UX-1582" },
			{ view: "dependency-graph-canvas", uxId: "UX-1583" },
			{ view: "file-tree-explorer", uxId: "UX-1584" },
			{ view: "drift-staleness-dashboard", uxId: "UX-1585" },
			{ view: "search-results-drawer", uxId: "UX-1586" },
			{ view: "symbol-inspector-pane", uxId: "UX-1587" },
			{ view: "impact-simulator-view", uxId: "UX-1588" },
			{ view: "skill-catalog-view", uxId: "UX-1589" },
			{ view: "verification-history-viewer", uxId: "UX-1590" },
		];

		for (const { view, uxId } of testCases) {
			it(`[${uxId}] formulates strict CSP header policy and meta tag for ${view}`, () => {
				const policy = generateStrictCspPolicy(view);
				expect(policy).toContain("default-src 'none'");
				expect(policy).toContain("style-src 'self' 'unsafe-inline'");
				expect(policy).toContain("script-src 'self' 'unsafe-inline'");
				expect(policy).toContain("frame-ancestors 'none'");
				expect(policy).toContain("base-uri 'self'");

				const metaTag = renderCspMetaTag(view);
				expect(metaTag).toContain('<meta http-equiv="Content-Security-Policy"');
				expect(metaTag).toContain("default-src &#39;none&#39;");
			});
		}
	});

	/* -------------------------------------------------------------------------- */
	/* Theme 5: Offline Standalone Export Bundler (UX-1591 – UX-1600)              */
	/* -------------------------------------------------------------------------- */
	describe("Theme 5: Offline standalone export bundler generating zero-dependency HTML (UX-1591 – UX-1600)", () => {
		const testCases: Array<{ view: ServeViewKind; uxId: string }> = [
			{ view: "wiki-chapter-view", uxId: "UX-1591" },
			{ view: "card-fact-browser", uxId: "UX-1592" },
			{ view: "dependency-graph-canvas", uxId: "UX-1593" },
			{ view: "file-tree-explorer", uxId: "UX-1594" },
			{ view: "drift-staleness-dashboard", uxId: "UX-1595" },
			{ view: "search-results-drawer", uxId: "UX-1596" },
			{ view: "symbol-inspector-pane", uxId: "UX-1597" },
			{ view: "impact-simulator-view", uxId: "UX-1598" },
			{ view: "skill-catalog-view", uxId: "UX-1599" },
			{ view: "verification-history-viewer", uxId: "UX-1600" },
		];

		for (const { view, uxId } of testCases) {
			it(`[${uxId}] compiles complete zero-dependency standalone HTML bundle for ${view}`, () => {
				const bundle = bundleOfflineStandaloneView(view, {
					title: `Standalone Preview: ${SERVE_VIEW_METADATA[view].title}`,
					bodyHtml: `<div class="content-block"><h1>${SERVE_VIEW_METADATA[view].title}</h1><p>Offline content for ${view}.</p></div>`,
					dataPayload: {
						viewKind: view,
						timestamp: "2026-09-25T12:00:00Z",
						itemsCount: 42,
					},
					drawerContentHtml: `<ul><li>Item A</li><li>Item B</li></ul>`,
				});

				expect(bundle).toContain("<!doctype html>");
				expect(bundle).toContain("<html lang=\"en\" data-theme=\"dark\">");
				expect(bundle).toContain("Content-Security-Policy");
				expect(bundle).toContain(SERVE_VIEW_METADATA[view].title);
				expect(bundle).toContain("Offline content for");
				expect(bundle).toContain("kaioken-offline-data");
				expect(bundle).toContain("kaioken-theme-preference");
				expect(bundle).toContain(`drawer-${view}`);
				expect(bundle).toContain("Kaioken Zero-Dependency Offline Export");
				// Verify zero external network links/dependencies in bundle
				expect(bundle).not.toContain("https://cdn.");
				expect(bundle).not.toContain("https://fonts.googleapis.com");
			});
		}
	});
});
