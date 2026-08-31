/** Where this browser's recently used emoji are kept. */
export const RECENT_EMOJI_STORAGE_KEY = "chatty:recent-emoji";

/**
 * How many the picker remembers.
 *
 * One row at the grid's width. More would push the categories below the fold on
 * a short window, and a "recent" list long enough to scroll has stopped being
 * the shortcut it exists to be.
 */
export const MAX_RECENT_EMOJI = 8;
