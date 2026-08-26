import { execSync } from "node:child_process";
import { TEST_DATABASE_URL } from "./test-database-url.js";

/**
 * Runs once before the whole suite: brings the test database's schema up to
 * date with prisma/migrations.
 *
 * DATABASE_URL is passed explicitly rather than inherited. globalSetup runs
 * outside the test environment, so vitest's `test.env` does not reach it — and
 * without this, the Prisma CLI falls back to .env and migrates the DEV database.
 *
 * `migrate deploy` (not `migrate dev`) only applies existing migrations and
 * never prompts or generates new ones, which is what a non-interactive run needs.
 */
export default function globalSetup(): void {
	execSync("npx prisma migrate deploy", {
		stdio: "inherit",
		env: { ...process.env, DATABASE_URL: TEST_DATABASE_URL },
	});
}
