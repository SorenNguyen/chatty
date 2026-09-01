/**
 * Which floating panel a message row has open, if any.
 *
 * Two panels — the reaction bar and the actions menu — share one value rather
 * than owning a boolean each. They occupy the same corner above the same button
 * group and only one can usefully be open, and a pair of booleans is how you end
 * up with both drawn on top of each other after a fast click.
 */
export type OpenMessagePanel = "menu" | "reactions" | null;
