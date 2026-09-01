export type VaultTab = "media" | "files" | "voice" | "links" | "saved" | "members";

export const VAULT_TABS: { id: VaultTab; label: string }[] = [
	{ id: "media", label: "Media" },
	{ id: "files", label: "Files" },
	{ id: "voice", label: "Voice" },
	{ id: "links", label: "Links" },
	{ id: "saved", label: "Saved" },
	{ id: "members", label: "Members" },
];

export const EMPTY_VAULT_TAB_COPY: Record<Exclude<VaultTab, "members">, string> = {
	media: "Photos shared in this conversation will appear here.",
	files: "Files shared in this conversation will appear here.",
	voice: "Voice messages shared in this conversation will appear here.",
	links: "Links shared in this conversation will appear here.",
	saved: "Messages you save in this conversation will appear here.",
};
