# ADR 0009: Group events are messages, and their text is written once

## Status

Accepted.

## Context

Phase 3 shipped add, remove, leave and rename, and every one of them happened in silence. The
membership list changed, `conversation:updated` re-rendered the panel, and nothing in the chat log
said anything at all. Someone left a group; the other person saw two of their messages sitting there
with the name and the face gone, and no explanation anywhere on the screen.

The roadmap had this as a known gap with a reason attached: a "X left the group" line is a message
with no author, and `Message.authorId` was a required foreign key to `User`. That is a schema
decision, and phase 3 declined to make it in passing.

Two questions had to be answered together: **where does the event live**, and **what is stored in
it**.

## Decision

**A group event is a real `Message` row**, with `kind = SYSTEM` and `authorId = null`, written in the
same transaction as the membership/name transition and the conversation's `updatedAt`, then
broadcast after commit on the same `message:new` event as anything anyone types. Phase 7 expanded
the original message + timestamp transaction to cover the whole domain action; see
[ADR 0010](0010-serialize-conversation-writes.md).

The alternative was to leave it on `conversation:updated` and have the client render a notice when
the participant list changes. That fails three ways at once: it does not survive a reload, it cannot
be placed in the right position among the messages around it, and it does not exist at all for anyone
who was offline when it happened. A log of what happened in a conversation is exactly what a message
table is.

**`kind` is a column, not an inference from `authorId IS NULL`.** Reading a null author as "system"
works today and breaks the first time a message outlives its author — which is precisely what
deleting an account produces.

**The sentence is rendered when the event happens and stored as `content`.** "An added Binh", not
`{action: "added", actorId: "...", targetId: "..."}` resolved at read time.

- A structured payload has to be resolved against *somebody*, and the people in a group event are
  exactly the people most likely to have left it — the original bug this work started from. Embedding
  the users instead would mean three foreign keys from `Message` to `User` (author, actor, target)
  for a feature whose entire output is one line of grey text.
- A log entry describes a moment. "An added Binh" is what happened, even after An is called something
  else — the same reason a bank statement does not rewrite the payee when a company rebrands.

**System messages never count as unread.** This falls out of the existing SQL rather than being
special-cased: the unread query counts messages where `authorId <> $viewer`, and `null <> $viewer` is
null, not true. A badge means someone said something to you, and "Chi left the group" is not that.

## Consequences

- **`Message.authorId` is nullable, and every read of it now has a null branch.** `MessageDTO.author`
  is `UserDTO | null` — which the client had to handle anyway, since the same change embedded the
  author in the message rather than resolving it against the participant list.
- **The names in an old system line do not follow a rename.** Deliberate, per above, and the one
  consequence most likely to be read as a bug later. It is recorded here so it is not "fixed" by
  accident.
- **A system message is the conversation's `lastMessage`,** so the sidebar preview shows "Chi left
  the group" — correct, and it is also what makes the group jump to the top of the list when someone
  joins or leaves. That bump is deliberate: it is news.
- **Ordering is written, not derived.** Leaving a group you own produces two lines ("… left the
  group", "… is now the group owner") in that order, because that is the order they were written in.
  Two writes in the same millisecond are ordered by id, which a cuid makes monotonic.
- **`createSystemMessage` lives in `conversations.service`, not `messages.service`,** which is where a
  message-writing function otherwise belongs. `messages.service` already imports `assertParticipant`
  from the conversations module; importing back would close the cycle `messages.mapper` exists to
  keep open. It receives the caller's transaction and never emits; socket effects happen after the
  enclosing action commits.
- **Nothing prunes them.** A group with churn accumulates system lines in its history the same way it
  accumulates messages. Same class of problem as message deletion, which this app also does not have.
