/**
 * Groups a conversation's notifications under one tag.
 *
 * Without it, ten messages in one thread stack ten notifications for one
 * conversation; with it, each replaces the last and the reader is told once
 * that somebody is talking to them.
 */
export const NOTIFICATION_TAG_PREFIX = "chatty-conversation-";
