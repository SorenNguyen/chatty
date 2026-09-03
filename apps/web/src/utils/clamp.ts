/** Keeps `value` inside `[min, max]`. Used anywhere a number is computed rather than chosen. */
export function clamp(value: number, min: number, max: number): number {
	return Math.min(Math.max(value, min), max);
}
