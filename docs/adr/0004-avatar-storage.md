# ADR 0004: Avatars are re-encoded files behind a derived, versioned URL

## Status

Accepted

## Context

`User` had an `avatarUrl String?` column from the first migration, never written to and rendered
nowhere. Finishing the feature meant deciding three things: where the bytes live, what the client
gets in `UserDTO.avatarUrl`, and what an upload is allowed to be.

The obvious version — write the uploaded file somewhere, put its path in `avatarUrl` — fails in two
ways that only appear later:

- **Browsers cache images hard.** Replace your picture and everyone keeps seeing the old one, because
  the URL did not change. Working around it means a new filename per upload, which leaves every
  previous picture on disk forever with nothing tracking them.
- **The storage backend ends up in the database.** Moving to S3 (roadmap phase 5) would mean
  rewriting every row.

Rocket.Chat, Mattermost and Slack were checked, and all three avoid both the same way.

| | Rocket.Chat | Mattermost | Slack |
| --- | --- | --- | --- |
| URL keyed by user, not by file | `/avatar/:username` | `/api/v4/users/{id}/image` | CDN |
| Cache-busted by a version param | `?etag=` | `?_=last_picture_update` | new URL per upload |
| Server re-encodes the upload | yes | yes | pre-resized to fixed sizes |
| Deterministic initials fallback | yes | yes | yes |
| Pluggable storage backend | GridFS / FS / S3 / WebDAV | FS / S3 | — |

## Decision

**The column stores a timestamp, not a URL.** `avatarUrl` was replaced by `avatarUpdatedAt`
(Mattermost's `last_picture_update` under a different name). The server derives
`{PUBLIC_URL}/users/:id/avatar?v=<timestamp>` from it. `UserDTO.avatarUrl` is unchanged on the wire,
so this was invisible to the client.

**One file per user, overwritten in place.** No orphans, no cleanup job. The version parameter is
what makes that safe: the URL changes on every upload even though the key does not.

**Uploads are decoded to pixels and re-encoded to WebP 256×256** in `lib/avatar-storage.ts`. This is
a security control, not a size optimisation — a browser decides what a file is by sniffing bytes, so
anything that passes a MIME check could otherwise be served back from this origin as something other
than an image. It also strips EXIF, so an avatar cannot publish the GPS coordinates the phone put in
it, and it caps decoded pixels so a small file cannot expand to gigabytes in memory.

**`GET /users/:id/avatar` is unauthenticated.** An `<img>` tag cannot send an Authorization header,
and this app keeps its token in localStorage rather than a cookie. Guarding it would mean fetching
every avatar with `fetch` and converting to an object URL, which throws away HTTP caching and
re-downloads every face on every render.

**No picture falls back to generated initials**, coloured from a hash of the user id — not the
display name, so renaming does not change the colour you recognise someone by.

## Consequences

- Storage is local disk, behind one module. Swapping in S3 is a change to `lib/avatar-storage.ts`
  and nothing else; no data migration, because no row holds a path.
- `sharp` is now a dependency. It is a native module, which is a real cost — accepted because the
  re-encode is the security boundary and hand-rolling it is not an option.
- The avatar endpoint confirms that a user id exists, to anyone who has one. Ids are cuids and the
  response is a profile picture; the same trade Rocket.Chat makes serving `/avatar/:username` openly.
- Deleting a user cascades the row but not the file. Recorded in the roadmap's known gaps — it
  belongs with whatever deletes accounts, not in the filesystem layer.
- Avatars are served by Node. Fine at this size; a real deployment would put them behind a CDN, which
  the `immutable` cache header already assumes.
