# ADR 0003: Socket rooms for realtime delivery

## Status

Accepted

## Context

Messages must reach every participant of a conversation, on every device they have open, without the
client polling. Socket.io offers rooms; the question was what the rooms should be and how membership
is decided.

An early version joined each socket to its conversation rooms once, at connect time. That was not
enough, and produced two distinct bugs:

1. A conversation created **while a participant was already online** never delivered to them — their
   socket had joined rooms that existed at connect time and nothing added the new one.
2. Even after fixing that, a brand-new conversation still did not appear in the sidebar. Nothing is
   ever broadcast into an empty conversation, so there was no event to react to.

## Decision

Two kinds of room:

- **`<conversationId>`** — every participant's sockets. Messages broadcast here.
- **`user:<userId>`** (`userRoom()` in `lib/socket-bus.ts`) — every socket belonging to one person.
  Used to reach someone regardless of which conversations they are in, and how many tabs or devices
  they have open.

On connect, a socket joins its personal room plus one room per conversation, both read from the
database.

On conversation creation, the service:

1. calls `io.in(userRoom(id)).socketsJoin(conversationId)` for each participant, then
2. emits `conversation:new` to each participant's personal room.

**The order matters.** A client told a conversation exists before its socket is in the room could
send a message and never see its own broadcast return.

`conversation:new` is sent to the creator too, even though their HTTP response already contains the
conversation. The client de-duplicates by id. One payload for everyone beats a second code path that
only the creator exercises — and only the creator would notice was broken.

Room membership is always derived from the database, never from a map kept in memory. An in-memory
map desynchronises the moment a second server process exists, and reconnects would silently stop
delivering.

## Consequences

- Adding someone to an **existing** group does not yet subscribe or notify them; that work belongs
  with the add-member feature (roadmap phase 3). Recorded so it is not rediscovered as a bug.
- Every conversation creation issues one `socketsJoin` and one emit per participant. Fine at this
  size; a group with thousands of members would want batching.
- Because delivery depends on room membership rather than a lookup at send time, a socket that
  somehow misses its join receives nothing, silently. `joinConversationRooms` therefore disconnects
  the socket if it fails rather than leaving the user in a chat that never updates.
