# ADR 0002: Unique handles for finding people

## Status

Accepted

## Context

To start a conversation you must first find the right person. Three identifiers were available and
none of them worked:

- **Display name** is not unique. Several accounts called "Minh" render as identical rows.
- **Email** is unique, but search deliberately does not return it. If it did, searching a common
  substring like `gmail` would return a harvestable list of addresses.
- **Internal id** is unique but is a cuid — not something anyone reads, types, or shares.

The result was a search screen where duplicate names could not be told apart.

## Decision

Add `User.handle`: unique, lowercase, 3–20 characters, starting with a letter and otherwise limited
to letters, digits and underscores. Required at registration. Returned by search; email still is not.

Normalisation happens on write, in `handleSchema`. Postgres unique indexes are case-sensitive, so
without lowercasing first, `Minh` and `minh` would both be storable.

The character set is narrow on purpose: characters that render alike in different fonts are a way to
impersonate someone else's handle.

The migration is hand-written in three steps — add nullable, backfill from the email local part with
`row_number()` disambiguating collisions, then set `NOT NULL` and add the unique index. A unique
`NOT NULL` column cannot simply be added to a table that already has rows.

## Alternatives considered

- **Phone numbers (Zalo).** Requires SMS/OTP infrastructure, and many people are reluctant to expose
  a number.
- **An existing social graph (Messenger).** Makes the product depend on another platform.
- **Invite links / QR only (Signal).** Simpler, and no new field at signup, but you can then only
  reach people who have already sent you something.
- **Showing the email when the query matches it exactly.** Keeps signup shorter, but the rule is
  subtle enough that nobody would predict when an email appears, and it is one refactor away from
  leaking addresses again.

## Consequences

- Registration has one more required field. This is real friction and is the weakest part of the
  decision; generating a handle automatically and letting users change it later (Instagram-style) is
  recorded in the roadmap as an open question, not settled.
- `UserDTO` now carries `handle`, so every consumer must render it where names could collide —
  search results already do.
- Changing a handle is not supported yet. Once it is, anything that stored a handle rather than an
  id will go stale; ids remain the only stable reference.
