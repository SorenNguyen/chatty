import { describe, expect, it } from "vitest";
import { prisma } from "../src/lib/prisma.js";

interface ColumnRow {
	table_name: string;
	column_name: string;
}

/**
 * The invariant no other test can state, because every other test is written
 * against whatever timezone the database it found happens to run in.
 *
 * `timestamp without time zone` stores no offset, so a value only means
 * something if everyone writing the column agrees on which clock it came from —
 * and nobody did. `CURRENT_TIMESTAMP` narrowed to a naive column yields the
 * session's wall clock while Prisma writes UTC, so a database running anywhere
 * but UTC read the outbox's backoff as hours overdue and handed out the cursor
 * row twice in the vault and in search. Every deployment happened to be UTC,
 * which is exactly why it stayed invisible: the two conventions coincide there.
 *
 * Asserting the column *type* rather than any one query's behaviour is the point.
 * A `timestamptz` cannot be read in the wrong timezone, so this catches the next
 * `DateTime` field added without `@db.Timestamptz(3)` — which is how the bug
 * would come back, one column at a time.
 */
describe("timestamp columns", () => {
	it("are all timestamptz, so no session timezone can reinterpret them", async () => {
		const naive = await prisma.$queryRaw<ColumnRow[]>`
			SELECT table_name, column_name
			FROM information_schema.columns
			WHERE table_schema = 'public'
				AND data_type = 'timestamp without time zone'
			ORDER BY table_name, column_name
		`;

		expect(naive).toEqual([]);
	});
});
