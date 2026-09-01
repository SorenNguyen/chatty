# Phase 27 — a sidebar you can organise, and one that stops re-listing itself

Independent of phases 24-26; it touches no attachment code. It does touch the most delicate live-update
code in the app, which is why item 108 is in here rather than left to be discovered.

| # | Item | Size |
| --- | --- | --- |
| 105 | Archive a conversation | M |
| 106 | Pin, up to five | S |
| 107 | Mute, with an end time | M |
| 108 | The sidebar patches the row that changed instead of re-listing everything | L |

## The rule that governs all of 105-107

These three are **per participant**, not per conversation. `conversation:updated` is broadcast to the
whole room, so it may never carry them — this is the same trap `unreadCount` sprang in phase 3, and
the payload type's own doc comment already says why.

- They live on `ConversationParticipant`.
- They ride on `ConversationDTO` beside `unreadCount`, which is already documented as the per-viewer
  field.
- They change through a **new personal event**, `conversation:self-updated`, emitted to
  `userRoom(userId)` — the room presence and typing already use for exactly this reason. Payload:
  `{ conversationId, isPinned, isArchived, mutedUntil }`. It exists so a second tab and a phone update
  together; without it the feature silently only works where it was clicked.

```prisma
model ConversationParticipant {
  ...
  /// When this participant archived it, or null. Per participant: archiving is
  /// a statement about your own list, not about the conversation.
  archivedAt DateTime?
  /// When they pinned it. A timestamp rather than a boolean so pinned rows have
  /// a stable order — most recently pinned first — instead of falling back to
  /// activity, which is what pinning is a way of overriding.
  pinnedAt   DateTime?
  /// Notifications are silent until this moment. Null means not muted; a far
  /// future date is what "mute forever" is stored as, so one column answers
  /// both questions and no boolean can disagree with it.
  mutedUntil DateTime?
}
```

Endpoints, on the conversations router, all of them acting on the caller's own row:

```
PUT    /conversations/:id/archive     { archived: boolean }
PUT    /conversations/:id/pin         { pinned: boolean }
PUT    /conversations/:id/mute        { until: string | null }
```

`PUT` rather than `POST` for all three: sending the same state twice settles where it started, which is
the argument `PUT /messages/:id/reactions` already made.

## Item 105 — archive

- `GET /conversations` returns the unarchived list. A second call, `?archived=true`, returns the
  archived one. **Not a client-side filter of one list**: the whole point is that the archive is
  unbounded and the main list is what the sidebar renders on every change.
- **A new message does not un-archive.** WhatsApp made the opposite choice for years and then reversed
  it, because a conversation someone archived is one they have decided about. The unread count still
  counts and the Archived row shows a total, so nothing is hidden — it is just not in the way.
- Archived conversations still deliver notifications unless they are also muted. Two settings, two
  meanings; collapsing them is how "archived" starts to mean "I never want to hear from you", which is
  what mute is for.

## Item 106 — pin

- Cap at 5, enforced in the service, with a stated error (`You can pin up to 5 conversations`). Every
  messenger caps it; an uncapped pin list is a second inbox.
- Ordering becomes: pinned first by `pinnedAt` desc, then the rest by `updatedAt` desc. The ordering
  lives in the query, not in the client — the client sorts nothing today and should keep sorting
  nothing, or the two will disagree during a patch.
- A pinned conversation cannot also be archived; pinning an archived one un-archives it. One line in
  the service, and it prevents a row that is in neither list.

## Item 107 — mute

- Options: 8 hours, 1 week, forever, and un-mute. Stored as a timestamp; "forever" is `9999-12-31`.
- Mute suppresses **browser notifications and the sound**, and nothing else. The unread badge stays
  truthful — a muted conversation is not a read one, and a badge that lies to keep a list tidy is worse
  than a badge.
- The tab-title count (phase 19, item 74) **excludes** muted conversations. That is the one place the
  two rules differ, and it is right: the title is an interruption, the badge is a record.
- The check belongs in `use-message-notifications`, reading `mutedUntil` off the conversation the
  message arrived for. Expiry needs no timer: compare against `Date.now()` when a message arrives.
- **A mention always notifies, even muted** — see phase 28 item 114. If mentions ship first, wire this;
  if not, leave the hook shaped so the exception has somewhere to go.

## Item 108 — the sidebar stops re-listing itself

ROADMAP item 80 recorded this and deferred it: `ChatPage` re-fetches the entire conversation list on
**every incoming message**, which is what keeps ordering, previews and unread counts true — and which
makes pagination impossible, because every message would reset the reader to page one.

This phase touches the list query for archive, pin and mute anyway. Doing 108 at the same time is one
careful piece of work; doing it later means doing that work twice.

**What replaces it.** A reducer over the list, patched by the events already being received:

| Event | Patch |
| --- | --- |
| `message:new` | that row's `lastMessage`, `updatedAt`, `unreadCount + 1` (unless the author is you, or it is a system line — the SQL already excludes both, so the reducer must too), then re-sort |
| `message:updated` | that row's `lastMessage` **only if the edited message is the newest one**; never the order (phase 8: an edit is not activity) |
| `conversation:read` | `unreadCount = 0` when the reader is you |
| `conversation:updated` | name and participants |
| `conversation:self-updated` | pin / archive / mute |
| `conversation:new`, `conversation:left` | insert / remove |
| socket reconnect | **full re-list**, which is what phase 18 already does and the one case where re-fetching everything is correct |

**The trap**: the reducer is now a second implementation of `countUnreadByConversation`'s rules. Every
divergence is a badge that is wrong until a reload. Mitigate by (a) keeping the rules in one commented
place in the reducer with a pointer to the SQL, (b) re-listing on reconnect, and (c) a web test per row
of that table.

Pagination itself stays `planned`. This item removes the reason it could not exist; the cursor is a
smaller, separate change once this is proven in use.

## Tests

- Service: archive/pin/mute set only the caller's row and are invisible to the other participant.
- Service: the sixth pin is refused; pinning an archived conversation un-archives it.
- Service: ordering — pinned first, then activity.
- Socket: `conversation:self-updated` reaches the actor's **other** sockets and nobody else's. Model it
  on `tests/typing.socket.test.ts`, which exists because exactly this class of bug is invisible from
  below.
- Web: the reducer, one test per row of the table above, including "an edit does not reorder" and "a
  system message does not raise the badge".
- e2e: mute a conversation, receive a message, assert no notification permission prompt and no title
  change (`e2e/` already drives two contexts, so this is a natural addition to `chat.spec.ts`).

## Deliberately not in this phase

- **"Delete this conversation for me."** Telegram's version — hidden until a new message arrives —
  needs a `clearedBeforeMessageId` cutoff applied consistently to the message page, the unread count,
  the sidebar preview, the search results **and** the vault. That is five query sites, four of which are
  the ones this repo has already had to fix twice for `MessageHiddenFor`. It is a phase, not an item.
- **Folders / categories.** Pinning covers the need at this size of user base.
- **Unread filter tab.** One line of client filtering, and it belongs with phase 28's small items rather
  than in the middle of a reducer rewrite.
