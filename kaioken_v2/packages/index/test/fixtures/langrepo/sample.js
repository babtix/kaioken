// Adds two numbers.
export function add(a, b) {
	return a + b;
}

function notExported(x) {
	return x;
}

export class Rect {
	area() {
		return this.w * this.h;
	}
}

export const MAX = 4096;

const arrow = (x) => x;
