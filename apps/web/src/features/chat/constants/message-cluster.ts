import type { ClusterPosition } from "../types/message-cluster";

/** Messages farther apart than this start a new visual turn, even from the same author. */
export const MESSAGE_BURST_WINDOW_MS = 5 * 60 * 1_000;

/** A quiet hour deserves an explicit time marker inside the same calendar day. */
export const MESSAGE_TIME_GAP_MS = 60 * 60 * 1_000;

/**
 * The corner grammar for a run of messages.
 *
 * One rule, stated as a table because the relationships between the four rows
 * are the design: **the side away from the tail never changes.** It stays at the
 * full bubble radius for the whole height of the run, and that unbroken edge is
 * what makes five messages read as one turn. Only the tail side moves — a seam
 * where a bubble meets its neighbour, and the 2px notch on the very last one.
 *
 * What shipped before this put `rounded-br-notch` on *every* outgoing bubble, so
 * a burst of five showed five tails stuttering down the right edge and the notch
 * stopped meaning "the turn ends here" — it meant nothing, because it was
 * everywhere. One notch per run is the entire point of having one.
 *
 * The all-corners class comes first in every string on purpose: tailwind-merge
 * lets a later single-corner utility override it, but not the reverse.
 */
export const OUTGOING_BUBBLE_RADIUS: Record<ClusterPosition, string> = {
	solo: "rounded-bubble rounded-br-notch",
	first: "rounded-bubble rounded-br-seam",
	middle: "rounded-bubble rounded-tr-seam rounded-br-seam",
	last: "rounded-bubble rounded-tr-seam rounded-br-notch",
};

/** The same table mirrored: an incoming run's tail is on the left. */
export const INCOMING_BUBBLE_RADIUS: Record<ClusterPosition, string> = {
	solo: "rounded-bubble rounded-bl-notch",
	first: "rounded-bubble rounded-bl-seam",
	middle: "rounded-bubble rounded-tl-seam rounded-bl-seam",
	last: "rounded-bubble rounded-tl-seam rounded-bl-notch",
};

/**
 * The picture inside a bubble, whose corners have to follow the ones around it.
 *
 * An image sits in 5px of padding, so each of its corners is the bubble's corner
 * *minus five*: the 10px outer becomes 5, and both the 4px seam and the 2px
 * notch go negative and clamp to 0. That arithmetic is why `first` and `solo`
 * share a value here while differing above, and why `middle` and `last` do —
 * the two tail radii are far enough below the padding to collapse to the same
 * square corner. It was a flat `rounded-[7px]` before, a number that matched
 * neither the bubble it sat in nor anything else in the app.
 */
export const OUTGOING_ATTACHMENT_RADIUS: Record<ClusterPosition, string> = {
	solo: "rounded-[5px] rounded-br-none",
	first: "rounded-[5px] rounded-br-none",
	middle: "rounded-[5px] rounded-tr-none rounded-br-none",
	last: "rounded-[5px] rounded-tr-none rounded-br-none",
};

/** Mirrored, as above. */
export const INCOMING_ATTACHMENT_RADIUS: Record<ClusterPosition, string> = {
	solo: "rounded-[5px] rounded-bl-none",
	first: "rounded-[5px] rounded-bl-none",
	middle: "rounded-[5px] rounded-tl-none rounded-bl-none",
	last: "rounded-[5px] rounded-tl-none rounded-bl-none",
};
