/** Adds two numbers. */
export function add(a: number, b: number): number {
	return a + b;
}

function notExported(x: number): number {
	return x;
}

/** Anything that can report its area. */
export interface Shape {
	area(): number;
}

export type Alias = string;

/** A rectangle. */
export class Rect implements Shape {
	constructor(
		private w: number,
		private h: number,
	) {}

	area(): number {
		return this.w * this.h;
	}

	private scale(f: number): number {
		return f;
	}

	protected label = "rect";
}

export const MAX = 4096;

const internalArrow = (x: number): number => x * 2;

export enum Kind {
	Round = "round",
	Square = "square",
}
