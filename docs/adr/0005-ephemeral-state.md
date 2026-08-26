# ADR 0005: Typing and presence are never stored

## Status

Accepted

## Context

Read receipts, typing indicators and presence were built together, and they look like three versions
of the same feature: small facts about a user inside a conversation, pushed in realtime. Treating
them the same way would have been the natural thing to do.

They are not the same. Read receipts are a durable fact — you read a message, and that stays true
next week, on another device. Typing and presence are true for seconds and worthless afterwards.

Two temptations follow from ignoring that:

1. Send typing over HTTP, like every other write. A request per keystroke, each with a round trip and
   an auth check, to announce something that expires before it lands.
2. Store presence in an `isOnline` column. The problem is not the write, it is the clear: the process
   responsible for setting it back to false is exactly the one that crashed. Every crash leaves rows
   claiming users are online forever, and nothing ever notices.

## Decision

**Read receipts persist.** `ConversationParticipant.lastReadMessageId`, written over HTTP
(`POST /conversations/:id/read`), broadcast as `conversation:read`. It follows the app's existing
rule: writes go over HTTP and come back to everyone as a server event.

**Typing is the one client→server socket event.** `typing:start` / `typing:stop` carry a
conversation id, are validated with `safeParse` (a throw on this transport would drop the connection
rather than return a 400), and are relayed to the room. Membership is checked against `socket.rooms`
— an in-memory set already derived from the database at connect — rather than with a query, because
this fires several times a sentence. The check is not optional: `socket.to(room)` addresses any room
by name, joined or not.

**Presence is derived from live connections.** No column. The Socket.io adapter is asked who is
connected: `io.in(userRoom(id)).fetchSockets()` for one user, `io.fetchSockets()` for everyone.

Three details make it behave:

- **Only the first connect and the last disconnect are events.** A second tab does not change whether
  someone is reachable, so announcing it would make every refresh look like a reconnect to everyone
  watching. This is what `userRoom()` is for.
- **A snapshot is sent to every socket after the handshake.** Updates only report *changes*, so
  without it everyone already online before you opened the app would look offline indefinitely.
- **The audience is people you share a conversation with**, not everyone connected. The unfiltered
  list would tell every account who else is signed in.

Timing is split across three constants in the web app (`features/chat/constants/typing.ts`) so a
dropped "stopped typing" cannot leave an indicator lit forever: the sender re-announces while typing,
announces a stop after a pause, and the receiver expires a typer that goes quiet.

## Consequences

- Nothing to clean up, nothing to reconcile at boot, and a crash costs at most one stale indicator on
  a client for a few seconds.
- Presence and the online snapshot only see **this process**. Correct today, wrong the moment a
  second instance exists — the Redis adapter that roadmap phase 5 needs for rate limiting is the same
  fix. `fetchSockets()` was chosen over reading `io.sockets.adapter.rooms` directly precisely because
  it keeps working across processes.
- Presence is binary. "Last seen at" would need a column, and with it a decision about who may see it.
- `socket.data.userId` rather than a property on the socket object: `fetchSockets()` returns a remote
  handle that exposes `data` and nothing custom, so a bolted-on property would be invisible from
  there — and invisible across processes later.
