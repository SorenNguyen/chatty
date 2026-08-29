import { AtSign, KeyRound, TriangleAlert, UserRound } from "lucide-react";
import type { SettingsNavigationItem } from "../types/settings";

export const SETTINGS_NAVIGATION: SettingsNavigationItem[] = [
	{ id: "profile", label: "Profile", description: "Name, handle and privacy", icon: UserRound },
	{ id: "email", label: "Email", description: "Where account mail is sent", icon: AtSign },
	{ id: "security", label: "Security", description: "Password and active sessions", icon: KeyRound },
	{ id: "danger", label: "Danger zone", description: "Permanent account removal", icon: TriangleAlert },
];
