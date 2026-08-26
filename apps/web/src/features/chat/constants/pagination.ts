/** How many messages to fetch per page. Must not exceed the server's cap of 100. */
export const MESSAGE_PAGE_SIZE = 50;

/**
 * How close to the top counts as "wants older messages".
 *
 * Not zero: waiting for an exact top hit means the reader stares at a blank gap
 * while the request runs. Loading slightly early hides the latency.
 */
export const LOAD_OLDER_THRESHOLD_PX = 120;
