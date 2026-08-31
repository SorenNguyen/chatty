/**
 * Widest an image is drawn in a bubble. Bubbles are capped at 70% of the
 * conversation, and a picture wider than this stops reading as part of the
 * exchange and starts being the whole view.
 */
export const MAX_ATTACHMENT_DISPLAY_WIDTH = 320;

/**
 * Tallest, for the portrait photos that would otherwise take the entire column
 * and push the message that came with them off screen.
 */
export const MAX_ATTACHMENT_DISPLAY_HEIGHT = 400;

/** What the file picker offers. The server re-encodes whatever arrives anyway. */
export const ACCEPTED_IMAGE_TYPES = "image/*";

/**
 * How many images one message may carry. Mirrors
 * `MAX_ATTACHMENTS_PER_MESSAGE` on the server, which is the one that actually
 * enforces it — this exists so the composer can refuse before the upload rather
 * than after ten megabytes have crossed the wire.
 */
export const MAX_ATTACHMENTS_PER_MESSAGE = 10;

/**
 * The side of the album's top photograph, in pixels.
 *
 * A stack, not a grid, and that is the point: four square tiles at bubble width
 * occupy 320×320 of a conversation for a set somebody will open in a viewer
 * anyway. The stack says "there are pictures here, and how many" in roughly a
 * quarter of the space, and one tap gets to all of them.
 */
export const ALBUM_SIZE = 168;

/**
 * Degrees each card behind the top one is turned.
 *
 * The first version offset them straight down with no rotation and drew them as
 * blank paper. It was legible and it was dead — the block read as a rendering
 * fault rather than as a pile of photographs. A few degrees of fan is what makes
 * it a stack, and it is the one place in this app where a rotation earns its
 * keep: everything else here is set square because it is type and rules, and a
 * photograph thrown on a desk is neither.
 *
 * Small, though. Past about six degrees the corners start to look like a
 * mistake rather than a hand.
 */
export const ALBUM_CARD_ROTATION = 5;

/** How far each card behind is nudged, in pixels, so the fan leans one way. */
export const ALBUM_CARD_SHIFT = 4;

/**
 * Room above and to the right of the top photograph, in pixels.
 *
 * Asymmetric because the fan leans that way, and worked out rather than
 * guessed. A square of side S turned by θ about its centre spans
 * `S·(cos θ + sin θ)`, so at 168px and ten degrees it reaches
 * `(168 · 1.159 − 168) / 2 ≈ 14px` past its own box on every side — and the
 * furthest card is nudged another 8px up and right on top of that.
 *
 * The first attempt reserved 8px and the cards poked out through the top of the
 * bubble, which reads as a clipping fault rather than as a stack. Room is
 * cheaper than that.
 */
export const ALBUM_FAN_REACH = 22;

/** The same reach on the other two sides, where the lean works against it. */
export const ALBUM_FAN_TRAIL = 6;

/** How many cards are drawn behind the top one, however many pictures there are. */
export const ALBUM_CARDS_BEHIND = 2;

/**
 * How large a sticker is drawn in the thread.
 *
 * Fixed rather than the picture's own size: a tray holds whatever people put in
 * it, and letting each one size itself would make every sticker a different
 * height in the conversation. `object-contain` inside the square keeps the
 * proportions of the picture itself.
 */
export const STICKER_DISPLAY_SIZE = 128;
