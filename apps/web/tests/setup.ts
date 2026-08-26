import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

/**
 * Unmounts anything a test rendered.
 *
 * Without this the DOM accumulates across tests in a file, and a query like
 * `getByRole("button")` starts matching leftovers from an earlier test rather
 * than failing — a false pass that is very hard to spot.
 */
afterEach(() => {
	cleanup();
});
