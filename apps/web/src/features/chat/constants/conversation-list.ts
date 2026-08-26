/**
 * Above this the unread badge stops counting and says "lots".
 *
 * Not cosmetic: the badge sits in a fixed-width sidebar row, and a four-digit
 * count pushes the conversation name out of it. The exact number past ninety-nine
 * is not information anyone acts on anyway.
 */
export const MAX_UNREAD_BADGE_COUNT = 99;
