/**
 * Zero-allocation HUD telemetry poller and unified status bar widget.
 *
 * Implements Step 19.5 (Features #UX-0241 - #UX-0250).
 * Provides microsecond-overhead passive polling, deadband change detection,
 * and integrated status bar rendering.
 */
import { TelemetryRingBuffer, renderVelocityWidget } from "./sparkline.ts";
import { renderFreshnessBadge } from "./freshness.ts";
import { renderWorktreePill } from "./worktree-status.ts";
import { dim, type Painter } from "./theme.ts";
import { truncate } from "./logo.ts";

export interface HudTelemetrySnapshot {
	tokensPerSec: number;
	contextUtilization: number;
	freshnessRatio: number;
	staleDocsCount: number;
	worktreeBranch: string;
	worktreeDirty: boolean;
	worktreeModified: number;
	backgroundTasks: number;
	lastPollDurationUs: number;
	timestamp: number;
}

export type HudSubscriber = (snapshot: Readonly<HudTelemetrySnapshot>) => void;

/**
 * High-performance telemetry poller with zero runtime allocations during polling cycles.
 */
export class HudTelemetryPoller {
	readonly velocityBuffer: TelemetryRingBuffer;
	private interval: NodeJS.Timeout | undefined;
	private subscribers: Set<HudSubscriber> = new Set();

	// Pre-allocated in-place mutable snapshot object
	private readonly snapshot: HudTelemetrySnapshot = {
		tokensPerSec: 0,
		contextUtilization: 0,
		freshnessRatio: 1.0,
		staleDocsCount: 0,
		worktreeBranch: "main",
		worktreeDirty: false,
		worktreeModified: 0,
		backgroundTasks: 0,
		lastPollDurationUs: 0,
		timestamp: Date.now(),
	};

	// Tracking for deadband change detection
	private lastNotifiedTokensPerSec = 0;
	private lastNotifiedFreshness = 1.0;
	private lastNotifiedDirty = false;
	private lastNotifiedBranch = "main";
	private lastNotifiedTasks = 0;

	constructor(bufferCapacity = 20) {
		this.velocityBuffer = new TelemetryRingBuffer(bufferCapacity);
	}

	/** Current telemetry snapshot view. */
	get current(): Readonly<HudTelemetrySnapshot> {
		return this.snapshot;
	}

	/** Subscribe to telemetry changes. Returns an unsubscribe function. */
	subscribe(fn: HudSubscriber): () => void {
		this.subscribers.add(fn);
		return () => {
			this.subscribers.delete(fn);
		};
	}

	/** Start periodic polling loop. */
	start(intervalMs = 500): void {
		if (this.interval) return;
		this.interval = setInterval(() => {
			this.poll();
		}, intervalMs);
	}

	/** Stop periodic polling. */
	stop(): void {
		if (this.interval) {
			clearInterval(this.interval);
			this.interval = undefined;
		}
	}

	/** Dispose poller and remove all listeners. */
	dispose(): void {
		this.stop();
		this.subscribers.clear();
		this.velocityBuffer.clear();
	}

	/** Record token consumption. */
	recordTokens(tokens: number, timestamp = Date.now()): void {
		this.velocityBuffer.push(tokens, timestamp);
	}

	/** Update repository freshness telemetry. */
	updateFreshness(ratio: number, staleDocsCount = 0): void {
		this.snapshot.freshnessRatio = Math.min(1, Math.max(0, ratio));
		this.snapshot.staleDocsCount = Math.max(0, staleDocsCount);
	}

	/** Update git worktree telemetry. */
	updateWorktree(branch: string, isDirty: boolean, modifiedCount = 0): void {
		this.snapshot.worktreeBranch = branch || "HEAD";
		this.snapshot.worktreeDirty = isDirty;
		this.snapshot.worktreeModified = Math.max(0, modifiedCount);
	}

	/** Update context window utilization ratio (0..1). */
	updateContextUtilization(ratio: number): void {
		this.snapshot.contextUtilization = Math.min(1, Math.max(0, ratio));
	}

	/** Update in-flight background task count. */
	updateBackgroundTasks(count: number): void {
		this.snapshot.backgroundTasks = Math.max(0, count);
	}

	/**
	 * Synchronous poll cycle with microsecond timing.
	 * Mutates the internal snapshot in place without creating garbage.
	 */
	poll(): Readonly<HudTelemetrySnapshot> {
		const startMs = typeof performance !== "undefined" ? performance.now() : Date.now();

		// Update velocity from ring buffer
		this.snapshot.tokensPerSec = this.velocityBuffer.getVelocity(1000);
		this.snapshot.timestamp = Date.now();

		const endMs = typeof performance !== "undefined" ? performance.now() : Date.now();
		// Compute duration in microseconds
		this.snapshot.lastPollDurationUs = Math.max(0, Math.round((endMs - startMs) * 1000));

		// Check deadband before notifying subscribers
		if (this.hasSignificantChange()) {
			this.lastNotifiedTokensPerSec = this.snapshot.tokensPerSec;
			this.lastNotifiedFreshness = this.snapshot.freshnessRatio;
			this.lastNotifiedDirty = this.snapshot.worktreeDirty;
			this.lastNotifiedBranch = this.snapshot.worktreeBranch;
			this.lastNotifiedTasks = this.snapshot.backgroundTasks;

			for (const sub of this.subscribers) {
				try {
					sub(this.snapshot);
				} catch {
					// Defensive error boundary: ignore listener failures
				}
			}
		}

		return this.snapshot;
	}

	private hasSignificantChange(): boolean {
		if (this.snapshot.worktreeDirty !== this.lastNotifiedDirty) return true;
		if (this.snapshot.worktreeBranch !== this.lastNotifiedBranch) return true;
		if (this.snapshot.backgroundTasks !== this.lastNotifiedTasks) return true;
		if (Math.abs(this.snapshot.tokensPerSec - this.lastNotifiedTokensPerSec) >= 5) return true;
		if (Math.abs(this.snapshot.freshnessRatio - this.lastNotifiedFreshness) >= 0.02) return true;
		return false;
	}
}

export interface HudBarOptions {
	unicode?: boolean;
	compact?: boolean;
	showTasks?: boolean;
}

/**
 * Render the unified status bar line composing velocity sparkline, freshness badge, and worktree pill.
 */
export function renderHudBar(
	snapshot: HudTelemetrySnapshot,
	velocityBuffer?: TelemetryRingBuffer,
	paint?: Painter,
	width?: number,
	options: HudBarOptions = {},
): string {
	const unicode = options.unicode ?? true;
	const compact = options.compact ?? false;

	const parts: string[] = [];

	// 1. Worktree dirty status pill
	parts.push(
		renderWorktreePill(
			{
				branch: snapshot.worktreeBranch,
				isDirty: snapshot.worktreeDirty,
				modifiedCount: snapshot.worktreeModified,
			},
			paint,
			{ unicode, compact },
		),
	);

	// 2. Freshness ratio badge
	parts.push(
		renderFreshnessBadge(snapshot.freshnessRatio, snapshot.staleDocsCount, paint, {
			unicode,
			compact,
		}),
	);

	// 3. Token velocity sparkline
	if (velocityBuffer && velocityBuffer.count > 0) {
		parts.push(renderVelocityWidget(velocityBuffer, paint, { unicode, width: 6 }));
	}

	// 4. In-flight tasks pill (if any)
	if (options.showTasks && snapshot.backgroundTasks > 0) {
		const taskText = unicode
			? `[⚙ ${snapshot.backgroundTasks} tasks]`
			: `[tasks: ${snapshot.backgroundTasks}]`;
		parts.push(paint ? dim(paint, taskText) : taskText);
	}

	const sep = paint ? dim(paint, " · ") : " · ";
	const fullLine = parts.join(sep);

	if (width !== undefined && width > 0) {
		return truncate(fullLine, width);
	}
	return fullLine;
}
