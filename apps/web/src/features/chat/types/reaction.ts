import type { LucideIcon } from "lucide-react";
import type { ReactionKind } from "@chatty/shared-types";

/** One entry in the reaction picker: what the server calls it, and how it is drawn. */
export interface ReactionOption {
	kind: ReactionKind;
	/** Announced by a screen reader — the chip's only visible content is a glyph and a count. */
	label: string;
	Icon: LucideIcon;
}
