/**
 * Telemetry sparkline and velocity tracking widget.
 *
 * Implements Step 19.1 (Features #UX-0201 - #UX-0210).
 * Zero-allocation circular telemetry buffer and responsive Unicode/ASCII sparkline renderer.
 */
import { fg, type Painter } from "./theme.ts";

export const UNICODE_SPARKLINE_BARS = [" ", "▂", "▃", "▄", "▅", "▆", "▇", "█"] as const;
export const ASCII_SPARKLINE_BARS = ["_", ".", "-", "=", "+", "*", "#", "@"] as const;

export interface SparklineOptions {
	min?: number;
	max?: number;
	width?: number;
	unicode?: boolean;
	emptyGlyph?: string;
}

/**
 * Render a sequence of numeric data points into a single-line terminal sparkline.
 */
export function renderSparkline(values: readonly number[], options: SparklineOptions = {}): string {
	const unicode = options.unicode ?? true;
	const bars = unicode ? UNICODE_SPARKLINE_BARS : ASCII_SPARKLINE_BARS;
	const empty = options.emptyGlyph ?? (unicode ? " " : "_");

	if (values.length === 0) {
		return options.width ? empty.repeat(options.width) : "";
	}

	let targetValues = values;
	if (options.width !== undefined && options.width > 0) {
		if (values.length > options.width) {
			targetValues = values.slice(values.length - options.width);
		}
	}

	let min = options.min ?? Number.POSITIVE_INFINITY;
	let max = options.max ?? Number.NEGATIVE_INFINITY;

	if (options.min === undefined || options.max === undefined) {
		for (const val of targetValues) {
			if (options.min === undefined && val < min) min = val;
			if (options.max === undefined && val > max) max = val;
		}
	}

	if (min === Number.POSITIVE_INFINITY) min = 0;
	if (max === Number.NEGATIVE_INFINITY) max = 0;

	const range = max - min;
	let out = "";

	if (options.width !== undefined && targetValues.length < options.width) {
		out += empty.repeat(options.width - targetValues.length);
	}

	for (const val of targetValues) {
		if (range <= 0) {
			out += val > 0 ? bars[Math.floor(bars.length / 2)]! : bars[0]!;
			continue;
		}
		const normalized = (val - min) / range;
		const index = Math.min(bars.length - 1, Math.max(0, Math.floor(normalized * (bars.length - 1))));
		out += bars[index]!;
	}

	return out;
}

/**
 * High-performance, zero-allocation ring buffer storing time-series telemetry.
 */
export class TelemetryRingBuffer {
	readonly capacity: number;
	private readonly values: Float64Array;
	private readonly timestamps: Float64Array;
	private head = 0;
	private size = 0;

	constructor(capacity = 20) {
		this.capacity = Math.max(2, capacity);
		this.values = new Float64Array(this.capacity);
		this.timestamps = new Float64Array(this.capacity);
	}

	/** Number of items currently recorded. */
	get count(): number {
		return this.size;
	}

	/** Push a sample into the circular buffer in O(1) without allocations. */
	push(value: number, timestamp = Date.now()): void {
		this.values[this.head] = value;
		this.timestamps[this.head] = timestamp;
		this.head = (this.head + 1) % this.capacity;
		if (this.size < this.capacity) {
			this.size++;
		}
	}

	/** Retrieve values in chronological order (oldest to newest). */
	getValues(): number[] {
		const result: number[] = new Array(this.size);
		const start = this.size < this.capacity ? 0 : this.head;
		for (let i = 0; i < this.size; i++) {
			const idx = (start + i) % this.capacity;
			result[i] = this.values[idx]!;
		}
		return result;
	}

	/**
	 * Compute velocity (rate of value change per second) over a given time window.
	 */
	getVelocity(windowMs = 1000): number {
		if (this.size < 2) return 0;

		const newestIdx = (this.head - 1 + this.capacity) % this.capacity;
		const newestTime = this.timestamps[newestIdx]!;
		const cutoff = newestTime - windowMs;

		let oldestIdx = newestIdx;
		for (let i = 1; i < this.size; i++) {
			const idx = (this.head - 1 - i + this.capacity * 2) % this.capacity;
			if (this.timestamps[idx]! < cutoff) break;
			oldestIdx = idx;
		}

		if (oldestIdx === newestIdx) return 0;

		const dt = (newestTime - this.timestamps[oldestIdx]!) / 1000;
		if (dt <= 0) return 0;

		const dv = this.values[newestIdx]! - this.values[oldestIdx]!;
		return Math.max(0, dv / dt);
	}

	/** Average value across all samples currently in the buffer. */
	getAverage(): number {
		if (this.size === 0) return 0;
		let sum = 0;
		for (let i = 0; i < this.size; i++) {
			sum += this.values[i]!;
		}
		return sum / this.size;
	}

	/** Peak (maximum) value across current samples. */
	getPeak(): number {
		if (this.size === 0) return 0;
		let peak = Number.NEGATIVE_INFINITY;
		for (let i = 0; i < this.size; i++) {
			if (this.values[i]! > peak) peak = this.values[i]!;
		}
		return peak === Number.NEGATIVE_INFINITY ? 0 : peak;
	}

	/** Maximum value across current samples (alias for getPeak). */
	getMax(): number {
		return this.getPeak();
	}

	/** Minimum value across current samples. */
	getMin(): number {
		if (this.size === 0) return 0;
		let min = Number.POSITIVE_INFINITY;
		for (let i = 0; i < this.size; i++) {
			if (this.values[i]! < min) min = this.values[i]!;
		}
		return min === Number.POSITIVE_INFINITY ? 0 : min;
	}

	/** Most recently pushed sample. */
	getLatest(): number {
		if (this.size === 0) return 0;
		const idx = (this.head - 1 + this.capacity) % this.capacity;
		return this.values[idx]!;
	}

	/** Reset buffer state. */
	clear(): void {
		this.head = 0;
		this.size = 0;
		this.values.fill(0);
		this.timestamps.fill(0);
	}
}

export interface VelocityWidgetOptions {
	label?: string;
	unit?: string;
	unicode?: boolean;
	width?: number;
}

/**
 * Render a real-time token spend velocity widget with trend sparkline.
 */
export function renderVelocityWidget(
	buffer: TelemetryRingBuffer,
	paint?: Painter,
	options: VelocityWidgetOptions = {},
): string {
	const unicode = options.unicode ?? true;
	const unit = options.unit ?? "tok/s";
	const width = options.width ?? 8;
	const velocity = Math.round(buffer.getVelocity());
	const values = buffer.getValues();
	const sparkline = renderSparkline(values, { width, unicode });

	const icon = unicode ? "⚡" : ">";
	const labelText = `${icon} ${velocity} ${unit}`;

	let coloredLabel = labelText;
	let coloredSpark = sparkline;

	if (paint) {
		const role = velocity > 500 ? "error" : velocity > 200 ? "warn" : "ok";
		coloredLabel = fg(paint, role, labelText);
		coloredSpark = fg(paint, "accent", sparkline);
	}

	return `${coloredLabel} ${coloredSpark}`;
}
