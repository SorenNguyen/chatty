/**
 * What stands in for a message whose author deleted it.
 *
 * Rendered on the client rather than sent by the server, and that is not an
 * oversight: the server empties the row's content, so there is nothing left for
 * it to send. Putting the sentence in the payload would mean a deleted message
 * arriving with text in `content` again — the one field a client must be able to
 * trust is empty. It is also the string localisation would need, and the last
 * one this app can translate without touching the database (see ADR 0009).
 */
export const DELETED_MESSAGE_TEXT = "This message was deleted";

/** Marker beside the timestamp of a message its author rewrote. */
export const EDITED_MESSAGE_LABEL = "edited";
