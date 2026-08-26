/**
 * The one place the e2e database is named.
 *
 * Its own database, not the dev one and not `chatty_test`: the global setup
 * truncates it, so pointing this at either would delete work — accounts created
 * by hand while developing, or the fixtures of a `npm test` run happening in
 * another terminal. The same reasoning, and the same failure, as
 * apps/server/tests/test-database-url.ts.
 */
export const E2E_DATABASE_URL = "postgresql://chatty:chatty@localhost:5432/chatty_e2e";
