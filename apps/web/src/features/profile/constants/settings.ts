import type { SettingsSection } from "../types/settings";

interface SettingsNavigationItem {
	id: SettingsSection;
	label: string;
	description: string;
}

export const SETTINGS_NAVIGATION: SettingsNavigationItem[] = [
	{ id: "profile", label: "Profile", description: "Name, handle and privacy" },
	{ id: "email", label: "Email", description: "Where account mail is sent" },
	{ id: "security", label: "Security", description: "Password and active sessions" },
	{ id: "danger", label: "Danger zone", description: "Permanent account removal" },
];
