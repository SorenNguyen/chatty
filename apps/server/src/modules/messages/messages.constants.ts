/**
 * How long an author may rewrite or retract a message for every participant.
 *
 * Kept beside the mapper because the same deadline is sent to the client. The
 * client does not duplicate this number; it renders from `authorActionExpiresAt`
 * while the service remains the authority that accepts or rejects the write.
 */
export const MESSAGE_AUTHOR_ACTION_WINDOW_MS = 8 * 60 * 60 * 1000;
