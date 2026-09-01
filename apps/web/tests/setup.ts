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

/**
 * jsdom implements no layout, so it ships no `scrollIntoView` at all — the
 * method is simply absent from `Element.prototype` and calling it is a
 * TypeError rather than a no-op.
 *
 * Three places in the thread call it (the search jump, the reply-quote jump and
 * the unread divider), so a component test that renders any of them crashes on
 * a browser API that has nothing to do with what it is testing. Stubbed once
 * here rather than in each file; a test that wants to assert on the *call* can
 * still spy on it.
 */
Element.prototype.scrollIntoView ??= function scrollIntoView() {};
