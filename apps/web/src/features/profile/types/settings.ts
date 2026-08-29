import type { LucideIcon } from "lucide-react";

export type SettingsSection = "profile" | "email" | "security" | "danger";

export interface SettingsNavigationItem {
	id: SettingsSection;
	label: string;
	description: string;
	icon: LucideIcon;
}
