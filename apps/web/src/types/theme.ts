import type { LucideIcon } from "lucide-react";

/**
 * What the reader chose. Three values, not two — "system" is a standing
 * instruction to follow the OS, which is a different fact from either of the
 * concrete themes and cannot be stored as one.
 */
export type ThemePreference = "light" | "dark" | "system";

/** What the preference resolves to, and the only thing `data-theme` ever holds. */
export type ResolvedTheme = "light" | "dark";

/**
 * One row of the Appearance setting.
 *
 * Here rather than beside the constant it types, per the frontend conventions:
 * a type a constant is keyed on outlives the constant.
 */
export interface ThemeOption {
	id: ThemePreference;
	label: string;
	description: string;
	icon: LucideIcon;
}
