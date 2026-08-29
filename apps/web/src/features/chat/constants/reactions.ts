import { Angry, Frown, Heart, Laugh, ThumbsUp } from "lucide-react";
import type { ReactionKind } from "@chatty/shared-types";
import type { ReactionOption } from "../types/reaction";

/**
 * The five marks, in the order the picker offers them.
 *
 * Icons rather than emoji, and that is the design rather than a limitation: a
 * full-colour 😂 beside an ink bubble on warm paper is the most saturated thing
 * on the page, and this app spends its one colour on unread counts and things
 * you cannot undo. Drawn from the same set as every other icon, they inherit the
 * square caps and mitred joins the stylesheet imposes and read as part of the
 * page. The set is closed on the server too — see the `ReactionKind` enum.
 *
 * `label` is not decoration: the chip is a button whose only visible content is
 * a glyph and a number, so this is what a screen reader announces.
 */
export const REACTION_OPTIONS: ReactionOption[] = [
	{ kind: "heart", label: "Heart", Icon: Heart },
	{ kind: "thumbs-up", label: "Thumbs up", Icon: ThumbsUp },
	{ kind: "laugh", label: "Laugh", Icon: Laugh },
	{ kind: "frown", label: "Frown", Icon: Frown },
	{ kind: "angry", label: "Angry", Icon: Angry },
];

/** Lookup for rendering a chip, whose kind arrives from the server, not the list above. */
export const REACTION_BY_KIND: Record<ReactionKind, ReactionOption> = {
	heart: REACTION_OPTIONS[0]!,
	"thumbs-up": REACTION_OPTIONS[1]!,
	laugh: REACTION_OPTIONS[2]!,
	frown: REACTION_OPTIONS[3]!,
	angry: REACTION_OPTIONS[4]!,
};
