/**
 * How long the socket may be down before the UI says so.
 *
 * Not zero, deliberately. The socket is opened when the chat mounts, so it is
 * legitimately disconnected for the moment before its first handshake completes
 * — and a banner that flashes on every page load is one people learn to ignore
 * before the day it means something. Socket.io's own reconnection attempts
 * start at 1s, so this also rides out the common case where the connection
 * comes straight back.
 */
export const CONNECTION_WARNING_DELAY_MS = 2_000;
