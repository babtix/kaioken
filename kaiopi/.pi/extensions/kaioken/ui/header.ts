/**
 * The Kaioken header, as a Pi component.
 *
 * Pi's built-in header is one bold word and a version. This replaces it with
 * the banner all three Kaioken generations have shipped: the block wordmark
 * under its amber→red gradient, a neofetch panel carrying the things you
 * cannot otherwise see together — repo, branch, model, provider, whether a key
 * is set, and what `.kaioken/` currently holds — and the key legend.
 *
 * It is a component rather than a block of printed text because two of the
 * three things it does need a live frame: the entrance plays once on the first
 * paint, and the rule under the wordmark sweeps while a run is in flight. A
 * static string cannot do either.
 *
 * The animation stops. That is the design, not a limitation: DESIGN.md's axiom
 * is *if everything glows, nothing communicates*, so the entrance is spent
 * once at startup and the sweep only runs while there is work to indicate.
 * An idle header is completely still.
 */
import type { Component, TUI } from "@earendil-works/pi-tui";
import { CURTAIN, bootFrame, curtainEnabled, powerOffFrame } from "./curtain.ts";
import { pinHeader, unpinHeader, type PinnedHeader } from "./layout.ts";
import { blockWidth, stickyHeader, type HeaderInfo, type RepoState } from "./logo.ts";
import { motionEnabled, sweepRule } from "./motion.ts";
import { colorFromEnv, type Painter, type PaintTheme } from "./theme.ts";
import { HudTelemetryPoller, renderHudBar } from "./hud.ts";
import { StatusTooltip, renderTooltipBox } from "./tooltip.ts";

export interface KaiokenHeaderOptions {
	info: HeaderInfo;
	/** Called to fetch the current repo state, re-read on every frame. */
	state: () => RepoState | undefined;
	/** Whether a run is in flight, which is what the sweeping rule indicates. */
	busy: () => boolean;
	/** Optional HUD telemetry poller providing passive metrics and sparklines. */
	hud?: HudTelemetryPoller;
}

export class KaiokenHeader implements Component {
	private readonly tui: TUI;
	private readonly theme: PaintTheme;
	private readonly options: KaiokenHeaderOptions;
	private readonly started = Date.now();

	private interval: NodeJS.Timeout | undefined;
	/** The entrance plays once; after it lands the header is settled forever. */
	private entranceDone = false;
	/** What `pinHeader` needs to put Pi's layout back on dispose. */
	private pinned: PinnedHeader | null = null;
	private info: HeaderInfo;
	private hud: HudTelemetryPoller | undefined;
	private hudUnsub: (() => void) | undefined;
	private hudVisible = true;
	private activeTooltip: StatusTooltip | null = null;

	constructor(tui: TUI, theme: PaintTheme, options: KaiokenHeaderOptions) {
		this.tui = tui;
		this.theme = theme;
		this.options = options;
		this.info = options.info;
		this.hud = options.hud;

		if (this.hud) {
			this.hudUnsub = this.hud.subscribe(() => {
				this.tui.requestRender();
			});
		}

		// The entrance needs frames even when nothing else is happening, so it
		// owns a timer — but only for as long as it is playing. A header that
		// ticked forever would repaint an idle terminal every 45ms for nothing.
		if (motionEnabled()) this.interval = setInterval(() => this.tick(), CURTAIN.frameMs);

		// Lift the header out of the transcript so it stops scrolling away.
		// Deferred by a frame because Pi installs its own layout root right
		// after calling this factory, and rebuilding a tree that is about to be
		// replaced would be undone immediately.
		setTimeout(() => {
			this.pinned = pinHeader(this.tui, this);
		}, 0);
	}

	private get painter(): Painter {
		return { theme: this.theme, colored: colorFromEnv() };
	}

	/** The terminal's size, which is what the curtain needs to fill the screen. */
	private get viewport(): { width: number; height: number } {
		return { width: this.tui.terminal.columns, height: this.tui.terminal.rows };
	}

	/** Update what the panel reports, e.g. after a model or key change. */
	setInfo(info: HeaderInfo): void {
		this.info = info;
		this.tui.requestRender();
	}

	/** Attach or update the HUD telemetry poller. */
	setHud(hud: HudTelemetryPoller | undefined): void {
		if (this.hudUnsub) {
			this.hudUnsub();
			this.hudUnsub = undefined;
		}
		this.hud = hud;
		if (this.hud) {
			this.hudUnsub = this.hud.subscribe(() => {
				this.tui.requestRender();
			});
		}
		this.tui.requestRender();
	}

	getHud(): HudTelemetryPoller | undefined {
		return this.hud;
	}

	isHudVisible(): boolean {
		return this.hudVisible;
	}

	setHudVisible(visible: boolean): void {
		this.hudVisible = visible;
		this.tui.requestRender();
	}

	toggleHud(): boolean {
		this.hudVisible = !this.hudVisible;
		this.tui.requestRender();
		return this.hudVisible;
	}

	/** Set active hovering tooltip or clear it. */
	setTooltip(tooltip: StatusTooltip | null): void {
		this.activeTooltip = tooltip;
		this.tui.requestRender();
	}

	/** Restart the ticker when work begins after an idle period. */
	beginWork(): void {
		if (!motionEnabled()) return;
		if (!this.interval) this.interval = setInterval(() => this.tick(), CURTAIN.frameMs);
	}

	private tick(): void {
		const elapsed = Date.now() - this.started;

		if (elapsed < CURTAIN.open || this.options.busy()) {
			this.tui.requestRender();
			return;
		}

		// Nothing left to animate. Stop the timer rather than letting it spin;
		// `beginWork` is what restarts it.
		this.entranceDone = true;
		this.stop();
	}

	private stop(): void {
		if (this.interval) {
			clearInterval(this.interval);
			this.interval = undefined;
		}
	}

	render(width: number): string[] {
		const paint = this.painter;
		const elapsed = Date.now() - this.started;

		// The entrance: the boot curtain for its duration, then the settled
		// header. The curtain replaces the header rather than layering over it,
		// which is why this is a branch and not a blend.
		if (motionEnabled() && !this.entranceDone && elapsed < CURTAIN.open) {
			return bootFrame(paint, width, this.viewport.height, elapsed, this.info.version);
		}

		const state = this.options.state();
		const info: HeaderInfo = { ...this.info, ...(state ? { knowledge: state } : {}) };
		// `undefined` once the entrance has landed, which is what tells the
		// banner to render its settled form rather than a frame of the rise.
		const lines = stickyHeader(
			paint,
			info,
			width,
			this.viewport.height,
			this.entranceDone ? undefined : elapsed,
		);

		// HUD status bar: renders passive telemetry readouts when attached and visible
		if (this.hud && this.hudVisible) {
			const hudBar = renderHudBar(this.hud.current, this.hud.velocityBuffer, paint, width);
			if (hudBar) lines.push(hudBar);
		}

		// Floating hover tooltip: renders overlay box when hovering or inspecting a metric
		if (this.activeTooltip) {
			const tooltipBox = renderTooltipBox(this.activeTooltip, paint, {
				maxWidth: Math.min(width > 0 ? width : 60, 60),
			});
			lines.push(...tooltipBox);
		}

		// The sweeping rule is the only thing that keeps moving, and only while
		// there is something to indicate.
		if (this.options.busy()) {
			lines.push(sweepRule(paint, Math.max(1, blockWidth(lines)), elapsed, true));
		}
		return lines;
	}

	invalidate(): void {
		// Nothing is cached across frames: every line is derived from the
		// current time and the current repo state, which is what makes the
		// animation a pure function of elapsed milliseconds.
	}

	dispose(): void {
		this.stop();
		if (this.hudUnsub) {
			this.hudUnsub();
			this.hudUnsub = undefined;
		}
		unpinHeader(this.tui, this, this.pinned);
		this.pinned = null;
	}
}

/**
 * The closing animation: a CRT switching off.
 *
 * Drawn as a full-screen overlay rather than on the alternate screen, because
 * the overlay is the mechanism Pi's TUI exposes for "own the whole viewport
 * for a moment and give it back". The transcript underneath is untouched, so
 * it returns intact the instant the overlay hides — the same behaviour the
 * alternate screen was being used for in v2, without a second screen buffer.
 *
 * Returns the goodbye to print after it, or null when motion is off. The
 * goodbye is a message rather than an effect, so the caller prints it either
 * way.
 */
export async function playPowerOff(
	tui: TUI,
	theme: PaintTheme,
	version: string,
): Promise<string | null> {
	if (!curtainEnabled()) return null;

	const paint: Painter = { theme, colored: colorFromEnv() };
	const width = tui.terminal.columns;
	const height = tui.terminal.rows;

	let frame = powerOffFrame(paint, width, height, 0, version);
	const component: Component = {
		render: () => frame,
		invalidate: () => {},
	};

	tui.showOverlay(component, {
		width: "100%",
		maxHeight: "100%",
		anchor: "top-left",
		offsetX: 0,
		offsetY: 0,
	});
	try {
		const started = Date.now();
		for (;;) {
			const elapsed = Date.now() - started;
			if (elapsed >= CURTAIN.close) break;
			frame = powerOffFrame(paint, width, height, elapsed, version);
			tui.renderNow(true);
			await new Promise((resolve) => setTimeout(resolve, CURTAIN.frameMs));
		}
	} finally {
		// Always lift the overlay, even if a frame threw: leaving it up would
		// hide the user's session behind an animation that stopped.
		tui.hideOverlay();
	}

	return paint.theme.fg("dim", `kaioken v${version} · see you next session`);
}
