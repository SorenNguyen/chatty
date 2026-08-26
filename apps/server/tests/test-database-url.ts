/**
 * The one place the test database is named.
 *
 * Both vitest.config.ts (which injects it into the test environment) and
 * global-setup.ts (which migrates it) import this. They cannot share it via
 * `process.env`: vitest's `test.env` only applies to test files, so globalSetup
 * would fall back to the dev `.env` and migrate the wrong database.
 */
export const TEST_DATABASE_URL = "postgresql://chatty:chatty@localhost:5432/chatty_test";
