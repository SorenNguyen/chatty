import { Bell, CircleUserRound, Lock, Mail, TriangleAlert } from "lucide-react";
import type { SettingsNavigationItem } from "../types/settings";

/**
 * The categories, in the order somebody is likely to want them.
 *
 * "Password" rather than "Security" and "Delete account" rather than "Danger
 * zone": both of the old names described a *kind* of setting, and a nav row is
 * more useful when it names the thing it will let you do.
 */
export const SETTINGS_NAVIGATION: SettingsNavigationItem[] = [
	{
		id: "profile",
		label: "Profile",
		description: "How you appear to everyone you talk to.",
		icon: CircleUserRound,
	},
	{
		id: "email",
		label: "Email",
		description: "Where account mail is sent, and how to move it.",
		icon: Mail,
	},
	{
		id: "notifications",
		label: "Notifications",
		description: "Be told about a message while you are looking elsewhere.",
		icon: Bell,
	},
	{
		id: "security",
		label: "Password",
		description: "Change it, and sign every other device out.",
		icon: Lock,
	},
	{
		id: "danger",
		label: "Delete account",
		description: "Permanent, and nothing here can undo it.",
		icon: TriangleAlert,
		isDestructive: true,
	},
];
