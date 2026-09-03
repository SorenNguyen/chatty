/**
 * Widest an image is *drawn* at, on a screen with room for it.
 *
 * A ceiling, not a width. The picture also carries `max-w-full`, so on a narrow
 * screen it scales down inside the message row instead of being cut off by it —
 * which is what used to happen: the row is `76vw` on a phone, so on a 390px
 * screen every 320px photograph ran 24px past it and lost its right edge and
 * both corners to `overflow-hidden`.
 *
 * 380 rather than the 320 it was: the row itself allows `min(62vw, 34rem)`, so
 * 320 was spending barely half of what a picture is allowed, and a photograph
 * drawn at thumbnail size in a conversation about it reads as a link to the
 * picture rather than the picture. Still comfortably under the cap, which is
 * what keeps an image part of the exchange rather than the whole view.
 */
export const MAX_ATTACHMENT_DISPLAY_WIDTH = 380;

/**
 * Tallest, for the portrait photos that would otherwise take the entire column
 * and push the message that came with them off screen.
 */
export const MAX_ATTACHMENT_DISPLAY_HEIGHT = 460;

/** What the file picker offers. The server re-encodes whatever arrives anyway. */
export const ACCEPTED_IMAGE_TYPES = "image/*";

/**
 * How many images one message may carry. Mirrors
 * `MAX_ATTACHMENTS_PER_MESSAGE` on the server, which is the one that actually
 * enforces it — this exists so the composer can refuse before the upload rather
 * than after ten megabytes have crossed the wire.
 */
export const MAX_ATTACHMENTS_PER_MESSAGE = 10;
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
export const MAX_FILE_BYTES = 25 * 1024 * 1024;
export const MAX_FILES_PER_MESSAGE = 1;
export const REFUSED_FILE_EXTENSIONS = [
	"exe",
	"msi",
	"bat",
	"cmd",
	"com",
	"scr",
	"pif",
	"jar",
	"apk",
	"dmg",
	"app",
	"sh",
	"ps1",
	"vbs",
	"js",
	"jse",
	"wsf",
	"lnk",
	"reg",
] as const;

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

/**
 * How long the composer waits for the browser to decode a picked image before
 * giving up on knowing its size.
 *
 * A local decode is a few milliseconds; this is not a budget, it is a guard
 * against never finishing. A corrupt file fires neither `load` nor `error` on
 * some browsers, and jsdom fires neither on any file at all — without a
 * deadline the first optimistic image send would hang instead of appearing.
 * Missing the deadline is not a failure: the bubble goes up without dimensions,
 * exactly as it does for a stored image the server could not measure.
 */
export const IMAGE_MEASURE_TIMEOUT_MS = 1_500;

/**
 * The time, laid over a picture.
 *
 * A photograph is the one message that cannot state its time in the gutter. The
 * gutter is centred on the bubble, so beside a 460px picture the number floats
 * at its middle, level with nothing, belonging to nothing — which is what made
 * an image message read as undesigned however carefully the picture itself was
 * drawn.
 *
 * This is not a new idea imported from another app: the album count chip has
 * been the answer to "a machine-produced value, laid over media" since phase 23,
 * and this is that chip carrying the value that matters most. `scrim` is what
 * keeps it legible over a white sky and a black jacket alike, and `meta` is
 * tabular, so a minute ticking over does not shift the chip's width.
 */
export const MEDIA_TIME_CHIP_CLASS =
	"meta pointer-events-none absolute bottom-2 right-2 rounded-badge bg-scrim/70 px-1.5 py-0.5 text-on-media";
