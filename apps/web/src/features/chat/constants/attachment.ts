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
