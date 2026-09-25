import { describe, expect, it } from "vitest";
import {
	ALL_TUI_ELEMENT_KINDS,
	TUI_ELEMENT_METADATA,
	type TuiElementKind,
	applyColorSaturation,
	formatElementWithGlyphFallback,
	interpolateMicroAnimation,
	resolveElementGlyphs,
} from "../ui/index.ts";

describe("Step 38: Category 01 — Terminal UI (TUI) & Visual Aesthetics (UX-0051 – UX-0100)", () => {
	it("defines all 20 canonical TUI element kinds with full metadata", () => {
		expect(ALL_TUI_ELEMENT_KINDS).toHaveLength(20);
		for (const element of ALL_TUI_ELEMENT_KINDS) {
			const meta = TUI_ELEMENT_METADATA[element];
			expect(meta).toBeDefined();
			expect(meta.title.length).toBeGreaterThan(0);
			expect(meta.baseColor.startsWith("#")).toBe(true);
			expect(meta.defaultDurationMs).toBeGreaterThan(0);
			expect(meta.glyphSet.unicode.length).toBeGreaterThan(0);
			expect(meta.glyphSet.ascii.length).toBeGreaterThan(0);
		}
	});

	/* -------------------------------------------------------------------------- */
	/* Theme 1: Dynamic Glyph Fallback System (UX-0051 – UX-0060)                  */
	/* -------------------------------------------------------------------------- */
	describe("Theme 1: Dynamic glyph fallback system when terminal lacks Unicode (UX-0051 – UX-0060)", () => {
		const testCases: Array<{ element: TuiElementKind; uxId: string }> = [
			{ element: "ast-symbol-tree", uxId: "UX-0051" },
			{ element: "git-branch-indicators", uxId: "UX-0052" },
			{ element: "staleness-warning-badges", uxId: "UX-0053" },
			{ element: "citation-grounding-chips", uxId: "UX-0054" },
			{ element: "search-hit-counters", uxId: "UX-0055" },
			{ element: "blast-radius-heatmaps", uxId: "UX-0056" },
			{ element: "test-progress-rings", uxId: "UX-0057" },
			{ element: "interactive-diff-blocks", uxId: "UX-0058" },
			{ element: "syntax-highlight-frames", uxId: "UX-0059" },
			{ element: "task-queue-spinners", uxId: "UX-0060" },
		];

		for (const { element, uxId } of testCases) {
			it(`[${uxId}] provides dynamic Unicode and ASCII fallback glyphs for ${element}`, () => {
				const unicodeGlyphs = resolveElementGlyphs(element, true);
				expect(unicodeGlyphs.element).toBe(element);
				expect(unicodeGlyphs.activeGlyph).toBe(unicodeGlyphs.unicode);

				const asciiGlyphs = resolveElementGlyphs(element, false);
				expect(asciiGlyphs.element).toBe(element);
				expect(asciiGlyphs.activeGlyph).toBe(asciiGlyphs.ascii);

				// Fallback formatting
				const formattedAscii = formatElementWithGlyphFallback(element, "Sample Label", false);
				expect(formattedAscii).toContain(asciiGlyphs.ascii);
				expect(formattedAscii).toContain("Sample Label");

				const formattedUnicode = formatElementWithGlyphFallback(element, "Sample Label", true);
				expect(formattedUnicode).toContain(unicodeGlyphs.unicode);
				expect(formattedUnicode).toContain("Sample Label");
			});
		}
	});

	/* -------------------------------------------------------------------------- */
	/* Theme 2: Smooth Micro-Animation Frame Interpolator (UX-0061 – UX-0080)     */
	/* -------------------------------------------------------------------------- */
	describe("Theme 2: Smooth micro-animation frame interpolator across all 20 elements (UX-0061 – UX-0080)", () => {
		const testCases: Array<{ element: TuiElementKind; uxId: string }> = [
			{ element: "kaioken-banner-masthead", uxId: "UX-0061" },
			{ element: "logo-sparkline", uxId: "UX-0062" },
			{ element: "active-model-badge", uxId: "UX-0063" },
			{ element: "power-off-shutdown-animation", uxId: "UX-0064" },
			{ element: "status-bar-pills", uxId: "UX-0065" },
			{ element: "split-pane-containers", uxId: "UX-0066" },
			{ element: "dialog-modal-frames", uxId: "UX-0067" },
			{ element: "spend-estimate-cards", uxId: "UX-0068" },
			{ element: "wiki-toc-tree", uxId: "UX-0069" },
			{ element: "knowledge-card-previews", uxId: "UX-0070" },
			{ element: "ast-symbol-tree", uxId: "UX-0071" },
			{ element: "git-branch-indicators", uxId: "UX-0072" },
			{ element: "staleness-warning-badges", uxId: "UX-0073" },
			{ element: "citation-grounding-chips", uxId: "UX-0074" },
			{ element: "search-hit-counters", uxId: "UX-0075" },
			{ element: "blast-radius-heatmaps", uxId: "UX-0076" },
			{ element: "test-progress-rings", uxId: "UX-0077" },
			{ element: "interactive-diff-blocks", uxId: "UX-0078" },
			{ element: "syntax-highlight-frames", uxId: "UX-0079" },
			{ element: "task-queue-spinners", uxId: "UX-0080" },
		];

		for (const { element, uxId } of testCases) {
			it(`[${uxId}] smoothly interpolates micro-animation frames for ${element}`, () => {
				const duration = TUI_ELEMENT_METADATA[element].defaultDurationMs;

				// Start frame
				const frameStart = interpolateMicroAnimation(element, 0);
				expect(frameStart.element).toBe(element);
				expect(frameStart.normalizedProgress).toBe(0);
				expect(frameStart.easedProgress).toBe(0);
				expect(frameStart.active).toBe(true);

				// Midpoint frame
				const frameMid = interpolateMicroAnimation(element, duration / 2);
				expect(frameMid.normalizedProgress).toBeCloseTo(0.5, 1);
				expect(frameMid.easedProgress).toBeGreaterThan(0.5); // Ease-out curve rises faster initially
				expect(frameMid.visualToken).toBeDefined();

				// Inactive / disabled animation
				const frameDisabled = interpolateMicroAnimation(element, 200, { active: false });
				expect(frameDisabled.active).toBe(false);
				expect(frameDisabled.normalizedProgress).toBe(1.0);
			});
		}
	});

	/* -------------------------------------------------------------------------- */
	/* Theme 3: Configurable Color Saturation Dial (UX-0081 – UX-0100)            */
	/* -------------------------------------------------------------------------- */
	describe("Theme 3: Configurable color saturation dial across all 20 elements (UX-0081 – UX-0100)", () => {
		const testCases: Array<{ element: TuiElementKind; uxId: string }> = [
			{ element: "kaioken-banner-masthead", uxId: "UX-0081" },
			{ element: "logo-sparkline", uxId: "UX-0082" },
			{ element: "active-model-badge", uxId: "UX-0083" },
			{ element: "power-off-shutdown-animation", uxId: "UX-0084" },
			{ element: "status-bar-pills", uxId: "UX-0085" },
			{ element: "split-pane-containers", uxId: "UX-0086" },
			{ element: "dialog-modal-frames", uxId: "UX-0087" },
			{ element: "spend-estimate-cards", uxId: "UX-0088" },
			{ element: "wiki-toc-tree", uxId: "UX-0089" },
			{ element: "knowledge-card-previews", uxId: "UX-0090" },
			{ element: "ast-symbol-tree", uxId: "UX-0091" },
			{ element: "git-branch-indicators", uxId: "UX-0092" },
			{ element: "staleness-warning-badges", uxId: "UX-0093" },
			{ element: "citation-grounding-chips", uxId: "UX-0094" },
			{ element: "search-hit-counters", uxId: "UX-0095" },
			{ element: "blast-radius-heatmaps", uxId: "UX-0096" },
			{ element: "test-progress-rings", uxId: "UX-0097" },
			{ element: "interactive-diff-blocks", uxId: "UX-0098" },
			{ element: "syntax-highlight-frames", uxId: "UX-0099" },
			{ element: "task-queue-spinners", uxId: "UX-0100" },
		];

		for (const { element, uxId } of testCases) {
			it(`[${uxId}] adjusts color saturation accurately via saturation dial for ${element}`, () => {
				const baseColor = TUI_ELEMENT_METADATA[element].baseColor;

				// Grayscale (saturation multiplier = 0)
				const grayscale = applyColorSaturation(element, baseColor, 0.0);
				expect(grayscale.multiplier).toBe(0.0);
				expect(grayscale.rgb[0]).toBe(grayscale.rgb[1]);
				expect(grayscale.rgb[1]).toBe(grayscale.rgb[2]); // R=G=B in grayscale

				// Default (multiplier = 1.0)
				const normal = applyColorSaturation(element, baseColor, 1.0);
				expect(normal.multiplier).toBe(1.0);
				expect(normal.saturatedHex.toLowerCase()).toBe(baseColor.toLowerCase());

				// Vivid (multiplier = 1.5)
				const vivid = applyColorSaturation(element, baseColor, 1.5);
				expect(vivid.multiplier).toBe(1.5);
				expect(vivid.ansi256Code).toBeGreaterThanOrEqual(16);
				expect(vivid.ansi256Code).toBeLessThanOrEqual(255);
			});
		}
	});
});
