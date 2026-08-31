import { expect, test } from "@playwright/test";
import { makeUser, messages, openConversationWith, register, sendMessage, startDirectChat } from "./helpers.js";

/**
 * Optimistic send (phase 19), in a real browser.
 *
 * Nothing below this level can make these assertions. The composer no longer
 * calls the API, so a component test proves only that it called a prop; what
 * matters is what a person actually sees between pressing Enter and the server
 * answering, and whether the message is on screen exactly once when it does.
 */
test.describe("sending a message", () => {
	test("puts the message on screen and empties the composer before the server answers", async ({ browser }) => {
		const senderUser = makeUser("Sen");
		const peerUser = makeUser("Peer");

		const sender = await browser.newContext();
		const peer = await browser.newContext();
		const senderPage = await sender.newPage();
		const peerPage = await peer.newPage();

		await register(peerPage, peerUser);
		await register(senderPage, senderUser);
		await startDirectChat(senderPage, peerUser);
		await openConversationWith(peerPage, senderUser);

		// Hold the send open, so "before the server answers" is a state this test
		// can actually stand in rather than a race it hopes to win.
		await senderPage.route("**/conversations/*/messages", async (route) => {
			await new Promise((resolve) => setTimeout(resolve, 2_000));
			await route.continue();
		});

		await sendMessage(senderPage, "typed and shown at once");

		// Both halves of the point: the words are already in the thread, and the
		// composer is free for the next message rather than waiting on the network.
		await expect(messages(senderPage).getByText("typed and shown at once")).toBeVisible({ timeout: 1_500 });
		await expect(senderPage.getByLabel("Message", { exact: true })).toHaveValue("");

		await senderPage.unroute("**/conversations/*/messages");

		// And once it lands it is there once, not twice — the draft is dropped
		// rather than replaced, because the socket broadcast usually arrives first.
		await expect(messages(peerPage).getByText("typed and shown at once")).toBeVisible({ timeout: 15_000 });
		await expect(messages(senderPage).getByText("typed and shown at once")).toHaveCount(1);

		await sender.close();
		await peer.close();
	});

	test("marks a message that could not be sent, and sends it on the retry", async ({ browser }) => {
		const senderUser = makeUser("Rey");
		const peerUser = makeUser("Pat");

		const sender = await browser.newContext();
		const peer = await browser.newContext();
		const senderPage = await sender.newPage();
		const peerPage = await peer.newPage();

		await register(peerPage, peerUser);
		await register(senderPage, senderUser);
		await startDirectChat(senderPage, peerUser);
		await openConversationWith(peerPage, senderUser);

		// One failure, then let it through. Before phase 19 a failed send simply
		// vanished and took the typed words with it.
		let hasFailedOnce = false;
		await senderPage.route("**/conversations/*/messages", async (route) => {
			if (route.request().method() === "POST" && !hasFailedOnce) {
				hasFailedOnce = true;
				await route.abort("failed");

				return;
			}

			await route.continue();
		});

		await sendMessage(senderPage, "this one has to survive");

		// The words are still on screen, and they are marked rather than lost.
		await expect(messages(senderPage).getByText("this one has to survive")).toBeVisible();
		await expect(senderPage.getByText("Not sent")).toBeVisible({ timeout: 15_000 });

		await senderPage.getByRole("button", { name: "Try again" }).click();

		await expect(senderPage.getByText("Not sent")).toBeHidden({ timeout: 15_000 });
		await expect(messages(peerPage).getByText("this one has to survive")).toBeVisible({ timeout: 15_000 });
		await expect(messages(senderPage).getByText("this one has to survive")).toHaveCount(1);

		await sender.close();
		await peer.close();
	});
});
