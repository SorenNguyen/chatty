# ADR 0006: No admin role — any participant may add, remove, or rename

## Status

Accepted

## Context

Phase 3 needed group management: add a member, remove one, rename the group, leave. Every real
messaging app that does this has to answer a question this codebase had never asked before: who is
*allowed* to?

The obvious answer — an admin role, promoted at creation, demotable, transferable when they leave —
is also a lot of new surface for a feature the roadmap describes in four words ("add/remove member,
leave, rename"). It needs a new column, a decision about what happens when the last admin leaves, and
UI for promoting someone else. None of that was asked for, and `Conversation` and
`ConversationParticipant` already have every field group management actually needs without it.

## Decision

**Any current participant may add a member, remove any other member, or rename the group.** There is
no admin, no owner, no special role. `createConversation` does not record who created a group for any
permission purpose — the only check every operation makes is `assertParticipant`, the same "are you
in this conversation" check every other conversation-scoped operation already made.

Leaving and being removed are **the same operation.** `removeParticipant(actorId, conversationId,
targetUserId)` does not care whether `targetUserId === actorId`; either way it is one participant row
being deleted, and the person leaving still has to already be a participant to call it, which is true
in both cases. Modeling them separately would mean two functions doing the same database write for a
distinction that does not change what happens.

**A group is allowed to end up with zero participants.** Nothing in this app deletes a conversation —
a direct conversation is never destroyed either — so an empty group is not a special case to guard
against, just an unreachable row, the same as any conversation nobody happens to be looking at.
`Conversation.isGroup` already does not get recomputed from a headcount (see the field's own comment
in `schema.prisma`), which is what makes this safe: a group does not flip back into looking like a
direct conversation on its way to empty.

## Consequences

- **No confirmation dialog on remove or leave.** The app has none anywhere else (signing out has
  none), so adding one here for symmetry with real chat apps would be inventing a UI pattern this
  codebase doesn't otherwise have, not following one.
- **Griefing is possible**: any member can remove every other member, or add strangers, with no
  cooldown and no way to be stopped short of leaving themselves. Acceptable for what this app is
  today — a learning project, not a product with adversarial users — and cheap to add a role to
  later, because every check funnels through one function (`assertGroup` / `assertParticipant`) that
  would only need one more condition, not a rewrite.
- **`conversation:updated` cannot carry `unreadCount` or `lastMessage`.** This surfaced designing the
  above, not from it, but is worth recording here because it would otherwise be an easy thing to get
  wrong the same way twice: the event broadcasts to a whole room, and unread count is a fact about one
  viewer, not about the conversation. See the type's own doc comment in `packages/shared-types`.
- If an admin role is ever added, the migration is additive (a nullable `role` or a separate
  `createdById` column) and the breaking part is behavioral, not structural: deciding what an admin
  can do that a member can't, and what happens to a group whose only admin leaves.
