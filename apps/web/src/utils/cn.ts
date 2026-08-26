import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Merges Tailwind classes, with later classes winning conflicts.
 *
 * `clsx` handles the conditional/array/object syntax; `twMerge` resolves
 * conflicting utilities (`"px-2 px-4"` -> `"px-4"`), which plain string
 * concatenation cannot do — the last class in the string does not
 * necessarily win in CSS, the more specific one does.
 *
 * Every `className` that is not a plain literal goes through this. See
 * docs/conventions/frontend.md ("className").
 */
export function cn(...inputs: ClassValue[]): string {
	return twMerge(clsx(inputs));
}
