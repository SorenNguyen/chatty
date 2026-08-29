/**
 * Ground and ink for an avatar that has no picture.
 *
 * Pairs, not a single background with white text on it. A pale tint carries a
 * dark initial legibly at 10px in a way a saturated fill does not, and pairing
 * the two here is what stops a hue being picked that nothing readable sits on —
 * the failure mode of hashing into a generated colour is that it eventually
 * lands on yellow.
 *
 * The tokens themselves live in `styles/globals.css`; this file is the only
 * place that names them, so a component never reaches for `bg-tint-*` directly.
 */
export const AVATAR_COLORS: string[] = [
	"bg-tint-azure text-tint-azure-ink",
	"bg-tint-amber text-tint-amber-ink",
	"bg-tint-moss text-tint-moss-ink",
	"bg-tint-plum text-tint-plum-ink",
	"bg-tint-clay text-tint-clay-ink",
	"bg-tint-teal text-tint-teal-ink",
	"bg-tint-iris text-tint-iris-ink",
	"bg-tint-fern text-tint-fern-ink",
];
