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
 * A picture is the bubble now, so it reads the same table a sentence does.
 *
 * The pair of tables that used to live here described a picture *inside* a
 * bubble: 5px, the bubble's 10 minus the 5px of padding around it. Phase 29
 * took that padding away — a photograph is already a rectangle of somebody
 * else's content and a fill around it is a second frame — and the 5px stayed
 * behind, so a bare picture sat at half the radius of every bubble beside it,
 * with one corner squared against a caption that had moved out of its box.
 *
 * A captioned picture is one object again, and it is built from the table above
 * with a single override at each end: the picture takes it plus `rounded-b-none`
 * and the caption takes it plus `rounded-t-none`. The two squared edges meet, so
 * the run's grammar — the unbroken side, the seam, the one notch — is drawn
 * across the pair exactly as it would be across one bubble. `cn` is what makes
 * that work: tailwind-merge drops the corner class a later side class covers.
 */
