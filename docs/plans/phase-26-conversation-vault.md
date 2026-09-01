# Phase 26 — the vault: what a conversation has accumulated

The gap named directly: *"thiếu chức năng xem kho lưu trữ chat"*. Everything ever sent in a
conversation exists and is reachable only by scrolling to it. This phase gives a conversation a panel
that answers "where is that picture / that file / that link / that thing I saved".

Depends on phase 24 (`kind`, `conversationId` on the row) and reads better after 25 (a Voice tab).

| # | Item | Size |
| --- | --- | --- |
| 100 | `GET /conversations/:id/media` — one index scan, cursor-paged | M |
| 101 | Links, extracted at write time | M |
| 102 | Saved messages (per user, across conversations) | M |
| 103 | The conversation info panel: Media · Files · Voice · Links · Saved | M |
| 104 | Image thumbnails, so a grid is not ten full-size downloads | M |

## Item 100 — the query, and why it is one index scan

```
GET /conversations/:id/media?kind=image|file|audio&before=<attachmentId>&limit=40
→ { items: AttachmentWithMessageDTO[], hasMore: boolean }
```

Phase 24 put `conversationId` on `Attachment` and indexed `(conversationId, kind, createdAt)`
specifically for this. The query is a range scan on that index; **it must not become a join back to
`Message` for filtering**, which is what will happen by accident. Two filters make that tempting:

- `deletedAt` — not needed. Deleting a message deletes its attachment rows, so a tombstone has none.
- `MessageHiddenFor` (delete-for-me, phase 15) — **is** needed, and is the one thing that has to reach
  `Message`. Do it as a `NOT EXISTS` on `MessageHiddenFor` keyed by `(messageId, userId)`, which is a
  primary-key probe per row, not a join over the conversation. Verify with `EXPLAIN` on a seeded
  conversation and paste the plan into the PR description.

Each item carries just enough of its message to be useful — `messageId`, `createdAt`, and the author's
`displayName` — so tapping a picture can jump to it in the thread using the existing
`GET .../messages/:id/context` from phase 15. Not the whole `MessageDTO`: forty of those in one
response is forty author objects and forty reaction arrays for a grid of thumbnails.

Authorization is `assertParticipant`, once, in the service — the same rule as everything else scoped to
a conversation. History from before you joined is visible, consistently with messages themselves.

## Item 101 — links

A conversation's links cannot be found by scanning `content`: that is a sequential scan over the whole
conversation, and the phase 12 tsvector index cannot serve "rows containing a URL".

```prisma
/// A URL found in a message when it was written.
///
/// Extracted at write time rather than matched at read time: "every link in this
/// conversation" is otherwise a scan of every message in it, and the search
/// index cannot answer it — a tsvector knows words, not shapes.
model MessageLink {
  id             String   @id @default(cuid())
  messageId      String
  conversationId String
  /// As written, after normalising the scheme. Never fetched — see plans/README.
  url            String
  /// Order within the message, so a message with three links keeps them ordered.
  position       Int
  createdAt      DateTime @default(now())

  message Message @relation(fields: [messageId], references: [id], onDelete: Cascade)

  @@unique([messageId, position])
  @@index([conversationId, createdAt])
}
```

- Extracted in `sendMessage` **inside the transaction**, from the same `content` the row stores.
- **Re-extracted on edit** (delete the set, write the new one) and **deleted on message delete** — the
  cascade covers the tombstone path only if `deleteMessage` deletes the rows explicitly, because a
  tombstone is an `UPDATE`, not a `DELETE`. This is the bug this item will ship with if it is not
  written down: a retracted message's links surviving in the vault is a content leak, not a cosmetic
  miss.
- The extractor is one util with tests: bare domains (`chatty.dev`), `www.`, trailing punctuation
  (`see https://x.com/a.` must not capture the full stop), parentheses, Vietnamese text either side
  with no space, `mailto:`, and a cap (10 per message) so a pasted wall of links is bounded.
- The same extractor feeds the auto-linkifier in phase 28, item 112. Write it once, in
  `apps/web`? No — **server-side**, in `lib/extract-links.ts`, and the client gets its own renderer.
  Two implementations of one regex is how they drift; the client one only decides where to put an
  `<a>`, and disagreeing with the server there is cosmetic. Say this in the file.

## Item 102 — saved messages

```prisma
model MessageStar {
  messageId String
  userId    String
  createdAt DateTime @default(now())
  ...
  @@id([messageId, userId])
  @@index([userId, createdAt])
}
```

`PUT`/`DELETE /messages/:id/star` — actually `PUT /conversations/:cid/messages/:id/star`, on the
existing router, so the membership check is the one that already exists. Composite primary key is the
toggle, exactly as `MessageReaction` does it (phase 17): saving twice is refused by the database rather
than checked for first.

`GET /me/saved` lists them across conversations, newest first, cursor-paged, shaped like the search
results DTO (`message` + a thin `conversation`) — that type exists and this is the same question.

`MessageDTO` gains `isSaved: boolean`? **No.** It is per-viewer and `message:new`/`message:updated` are
broadcast to a room — the phase 3 lesson. The saved set is loaded once per session as a set of ids and
patched locally on toggle. Write that down in the DTO's doc comment, because adding the field is the
obvious-looking move.

## Item 103 — the panel

A right-hand drawer over the thread, opened from `ConversationHeader`, with tabs. It shares its shell
with `GroupMembersPanel` — which is already a header-triggered inline panel and should become the
**Members** tab of this same drawer rather than a second mechanism next to it. Phase 3 recorded why
this is a panel and not a dialog: it acts on the conversation you are looking at.

- **Media**: a square grid of thumbnails, grouped by month with a small heading. Tap opens the existing
  `AttachmentLightbox`; the lightbox gains prev/next across the loaded page (it currently steps through
  one message's album).
- **Files**: the phase 24 card, in a list, with size and date.
- **Voice**: the phase 25 player, in a list, with duration and date.
- **Links**: domain in mono, the rest of the URL truncated, the message's date, tap to open the message.
- **Saved**: the same rows as `/me/saved`, filtered to this conversation.
- Infinite scroll on the same cursor the API returns. An empty tab says what would appear there, not
  "No results".
- Mobile: the drawer is full-screen, the same way the conversation is (phase 17, item 68).

## Item 104 — thumbnails

Today one 1600px WebP serves the bubble, the lightbox and — after this phase — a grid of forty. That is
tens of megabytes to draw a page of postage stamps, and it is the single biggest performance defect this
plan touches.

- At upload, write a second derivative: `<id>_t.webp`, longest edge 480, quality 70. Same sharp
  pipeline, one extra `.resize()`.
- Served by the same route with `?size=thumb`; the signed token covers the attachment id, so it covers
  both sizes and ADR 0007 is unchanged.
- `AttachmentDTO` gains `thumbUrl: string | null` — null for non-images, and null for rows created
  before this phase (**do not backfill**: a null means "use `url`", which is exactly what today's client
  does, and a backfill job over every existing image to save bytes on history nobody is browsing is
  work for its own sake).
- `deleteAttachment` removes both files. `listStoredAttachments` must **not** report `<id>_t.webp` as a
  separate id, or the orphan sweep will delete every thumbnail on its next run. That is the sharp edge
  in this item; it needs its own test.

## Tests

- Service: the vault returns only this conversation's attachments, only the asked-for kind, newest
  first, and paginates without duplicating or skipping across a page boundary.
- Service: a message hidden by one participant disappears from *their* vault and stays in everyone
  else's.
- Service: editing a message replaces its links; deleting one removes them.
- Endpoint: `?size=thumb` serves the derivative; a token minted for the attachment works for both.
- Sweep: a directory containing `<id>.webp`, `<id>_t.webp` and `<id>.bin` for a live row loses none of
  them; an orphan loses all of its files.
- e2e: send a picture, a file and a link, open the panel, see all three under the right tabs.

## Documentation

ROADMAP phase 26; README's feature list; and a note in `docs/ARCHITECTURE.md` if it describes the
attachment read path, because the thumbnail changes it.
