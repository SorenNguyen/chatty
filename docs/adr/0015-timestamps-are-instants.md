# ADR 0015 — Timestamps are instants, not wall clocks

Status: accepted

## Decision

Every `DateTime` field in the Prisma schema carries `@db.Timestamptz(3)`, so every timestamp column
is `timestamp with time zone`. A `DateTime` added without it is a bug, and
`tests/timestamps-are-instants.test.ts` fails on the next one by querying `information_schema` for
any column still declared `timestamp without time zone`.

## Why

The columns were naive `timestamp`, which stores no offset. A value in one therefore only means
something if everybody writing the column agrees about which clock it came from, and two writers did
not agree:

- The database's own clock wrote **local** time. `CURRENT_TIMESTAMP` is a `timestamptz`; narrowing it
  into a naive column yields the session's wall clock. `OutboxMessage.nextAttemptAt` is written this
  way on purpose — the phase 9 note "everything that is *compared* against the database clock is
  written by the database" is still the right instinct, and it was only half a fix.
- Prisma wrote **UTC**, because a JS `Date` is an instant and the driver sends it as one.

On a UTC database the two coincide, which is exactly why this survived twenty-nine phases:
`docker-compose.yml` pins no timezone and the `postgres` image happens to default to UTC. It was
found by running the suite against a Postgres that had taken its timezone from the machine
(`Asia/Ho_Chi_Minh`), where four tests failed:

- `outbox.test.ts` — `"nextAttemptAt" <= NOW()` compares a naive column against a `timestamptz`, so
  Postgres reads the stored value in the session's zone. A five-minute backoff looked seven hours
  overdue, and the retry schedule stopped existing: a transient SMTP failure would burn its whole
  `attempts` budget in seconds instead of backing off.
- `search.service.test.ts` and `messages.service.test.ts` — the keyset pagination in search and in the
  vault compares `(createdAt, id)` against a cursor Prisma sends in UTC. Skewed by the offset, the
  comparison stopped excluding the cursor row, so a page handed back a row the previous page had
  already shown.

None of these are timezone *features*. They are ordinary queries that were quietly correct only
because of an environment nobody had written down.

## Alternatives rejected

- **Pin the session timezone to UTC** (a connection-string option, or `PGTZ`). One line, and it works
  until somebody connects with psql, a migration tool, or a BI client that does not carry the
  setting. It makes correctness a property of every client rather than of the data.
- **Document the requirement.** The cheapest option and the weakest: nothing enforces prose, and the
  failure mode is silent wrong answers rather than an error.

`timestamptz` needs neither, because there is no longer a question to get wrong. The column stores an
instant; no session setting can reinterpret it.

## Consequences

- The migration converts existing columns with `USING "col" AT TIME ZONE 'UTC'`. That clause is
  load-bearing: without it the conversion reads stored values in the *migrating client's* timezone, so
  running it from a non-UTC shell would shift every historical row. UTC is what the values mean,
  because every deployment so far has run UTC.
- **That clause also costs a full table rewrite, and it was chosen knowing so.** Measured rather than
  assumed: `pg_relation_filenode` changes across the `ALTER` with the `USING` clause and does not
  change without it. PostgreSQL can convert `timestamp` to `timestamptz` as a metadata-only change,
  but only for the implicit conversion on a session already in UTC — an explicit `USING` expression it
  cannot prove is a no-op forces the rewrite, and with it an `ACCESS EXCLUSIVE` lock for the duration.
  On this database that is seconds. On a `Message` table with millions of rows it is minutes of
  downtime, and a deployment at that size should either run the migration with a UTC session and drop
  the `USING` clauses — trading the guarantee for the speed, having first checked the session really
  is UTC — or add each column, backfill, and swap. The guarantee is the better default because the
  failure it prevents is silent and permanent, while the lock is merely slow and visible.
- Nothing changes for application code. Prisma returns a JS `Date` either way, and the raw SQL that
  compares against `NOW()` becomes correct rather than needing rewriting.
- `Message.searchVector` is untouched. Prisma models it as `Unsupported("tsvector")` and does not know
  it is `GENERATED ALWAYS`, so its draft migration tried to `DROP DEFAULT` on it — which Postgres
  refuses outright — and to drop the phase 12 GIN index it cannot see. Both were removed by hand, and
  the same edit will be needed on any future migration Prisma generates for this table.

  The two halves are not equally dangerous, and only one of them announces itself. `DROP DEFAULT`
  fails loudly, because Postgres will not do it to a generated column. `DROP INDEX` **succeeds**, and
  search then returns exactly the right rows by sequential scan — no test goes red, and the only
  symptom is a query that gets slower as the table grows. `tests/search-index-survives-prisma.test.ts`
  is the guard: it asserts the index is present and GIN, and reads every committed migration for a
  `DROP INDEX` naming it, so the line is caught in `verify` rather than in production.
