# ADR 0007: Attachments are served through signed, expiring URLs

## Status

Accepted

## Context

Phase 4 added images to messages. Serving them raised a question avatars never did.

`GET /users/:id/avatar` is the app's one unauthenticated route, and [ADR 0004](0004-avatar-storage.md)
justifies it: an `<img>` tag cannot send an `Authorization` header, this app keeps its token in
localStorage rather than a cookie, and a profile picture addressed by an unguessable cuid is not
worth more protection than that. Rocket.Chat makes the same trade with `/avatar/:username`.

None of that reasoning survives being pointed at an attachment. A profile picture is something you
show to everyone you might talk to. A picture inside a conversation is the opposite: it is the
content, it was sent to a specific set of people, and "addressed by an id nobody can guess" is not an
access rule — it is the absence of one, restated as a probability.

The `<img>` problem does not go away, though. Three options were on the table:

1. **Unauthenticated, unguessable id** — what avatars do. Rejected: it makes every private image a
   permanent public URL for anyone who ever sees it, including a former group member, forever.
2. **Fetch the bytes with `fetch()` and render an object URL.** Correct, and the client already holds
   a bearer token. But it throws away HTTP caching entirely, keeps every visible image in JS memory,
   and needs revoke bookkeeping on every unmount — for images that are much larger than avatars.
3. **A signed, expiring token in the URL.** What S3 presigned URLs and Slack's file links do.

## Decision

`AttachmentDTO.url` is `{PUBLIC_URL}/attachments/{id}?token={jwt}`, where the JWT is minted **per
response** by `lib/attachment-token.ts`, carries the attachment id as `sub`, and expires after an
hour.

The endpoint has no `requireAuth`. It cannot: the request carries no user. The token *is* the check —
it is only ever minted inside a response whose conversation membership was already verified, so
holding one is proof that the server handed it to someone entitled to it.

Three details that are load-bearing rather than incidental:

- **The id is in the token and compared on the way in.** Without that, one leaked URL would open
  every attachment in the system.
- **A bad token answers 404, not 401.** A 401 would confirm that an attachment with this id exists,
  which is exactly what someone walking the id space wants to know. The two failures are
  indistinguishable from outside, the same way `login` refuses to say whether an email is registered.
- **Attachment tokens carry a `typ` claim, and `requireAuth` rejects any token that has one.** Both
  kinds are signed with `JWT_SECRET`, so without a marker an attachment token presented as a bearer
  token would authenticate as a "user" whose id is an attachment id. That is token confusion, and it
  is a vulnerability rather than a bug — it is covered by two tests in
  `tests/attachment-endpoint.test.ts` that assert each kind is refused where the other belongs.

`Cache-Control` is `private, max-age=3600` — never `public`, so no shared proxy may hold one, and
never longer than the token it depends on.

## Consequences

**A URL is bearer proof for as long as it lives.** Copied out of the network tab it works anywhere,
and someone removed from a group can still fetch an image whose token they were given a minute
earlier. This is inherent to the approach, not an oversight: it is the same property an S3 presigned
URL has. The hour is the whole mitigation, and shortening it is a one-constant change.

**Caching is worse than it could be, on purpose.** The token is re-minted on every read, so a reload
re-downloads every visible image. Avatars make the opposite trade — cached for a year, busted by a
version parameter — because a profile picture is public and an attachment is not.

**Nothing may treat the URL as an identity.** It is not stable across reads, and worse, it is
*sometimes* stable: a JWT's `iat` has one-second resolution, so two reads in the same second produce
the same string and two a second apart do not. Anything keyed on it — a cache, a React `key`, a
dedupe — must key on `id` instead. This is documented on `AttachmentDTO.url` in
`packages/shared-types`, because it is the client that would get it wrong.

**A second unauthenticated route now exists**, and the count matters: these are the two places where
nothing has looked at the request before the handler runs, so both validate their inputs at the top.

**If files move to S3 in phase 5, this endpoint is what disappears** — object storage issues presigned
URLs natively, and `buildAttachmentUrl` becomes a call into the SDK. The wire type does not change,
which is the same reason [ADR 0004](0004-avatar-storage.md) refused to store a URL in a column.
