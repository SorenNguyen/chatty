import type { LucideIcon } from "lucide-react";
import { Bookmark, FileText, Image, Link2, Mic } from "lucide-react";

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

/**
 * The glyph each empty tab shows above its sentence.
 *
 * An empty panel used to be one grey line stranded in the top-left corner of a
 * 700px column, which reads as a page that failed to load rather than as a
 * conversation nobody has shared a file in yet. A centred mark plus the sentence
 * is the shape every messenger uses for "there is nothing here *yet*".
 *
 * `members` is absent for the same reason it is absent from the copy above: a
 * conversation always has participants, so that tab has no empty state.
 */
export const VAULT_TAB_ICONS: Record<Exclude<VaultTab, "members">, LucideIcon> = {
	media: Image,
	files: FileText,
	voice: Mic,
	links: Link2,
	saved: Bookmark,
};
