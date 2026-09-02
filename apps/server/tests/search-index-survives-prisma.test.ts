import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { prisma } from "../src/lib/prisma.js";

const MIGRATIONS_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "prisma", "migrations");
const SEARCH_INDEX = "Message_searchVector_idx";

interface IndexRow {
	indexdef: string;
}

/**
 * A trap Prisma re-arms every time somebody runs `migrate dev`.
 *
 * `Message.searchVector` is `Unsupported("tsvector")` in the schema, so Prisma
 * knows neither that the column is `GENERATED ALWAYS` nor that phase 12 put a
 * GIN index on it in raw SQL. Its introspection therefore sees an index that
 * "should not exist" and a default that "should not be there", and every
 * migration it drafts for this table opens with `DROP INDEX` on the one and
 * `DROP DEFAULT` on the other.
 *
 * The `DROP DEFAULT` is harmless because Postgres refuses it outright — a
 * generated column cannot have its default dropped, so the migration fails loudly
 * and gets fixed. The `DROP INDEX` is the dangerous half: it succeeds. Search
 * keeps returning exactly the right rows afterwards, by sequential scan, so no
 * assertion anywhere in this suite goes red. The only symptom is that search gets
 * slower as the table grows, which nobody notices until it matters.
 *
 * This nearly shipped once: the phase 30 migration was generated with that line
 * in it and had to be removed by hand. Hence a test rather than a note — see
 * ADR 0015.
 */
describe("the full-text search index", () => {
	it("exists, and is still a GIN index", async () => {
		const rows = await prisma.$queryRaw<IndexRow[]>`
			SELECT indexdef FROM pg_indexes WHERE indexname = ${SEARCH_INDEX}
		`;

		expect(rows).toHaveLength(1);
		expect(rows[0]!.indexdef).toContain("USING gin");
	});

	it("is not dropped by any committed migration", () => {
		const offenders = readdirSync(MIGRATIONS_DIR, { withFileTypes: true })
			.filter((entry) => entry.isDirectory())
			.filter((entry) => {
				const sql = readFileSync(join(MIGRATIONS_DIR, entry.name, "migration.sql"), "utf8")
					// Comments first, or this flags the migrations that explain in prose
					// why the line was removed — which is exactly what a migration that
					// did the right thing looks like.
					.replace(/--[^\n]*/g, "");

				// Only a DROP counts. The two migrations that legitimately CREATE the
				// index name it too, and re-creating it is how it got here.
				return /DROP\s+INDEX[^;]*Message_searchVector_idx/i.test(sql);
			})
			.map((entry) => entry.name);

		expect(
			offenders,
			`These migrations drop the search index. Prisma writes that line into every migration it ` +
				`generates for the Message table; it is never what you want. Delete it and keep the rest.`,
		).toEqual([]);
	});
});
