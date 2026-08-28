import { expect, test } from "@playwright/test";
import { makeUser, messages, openConversationWith, register, sendMessage, startDirectChat } from "./helpers.js";

/**
 * What only a browser can prove about phase 8.
 *
 * The service tests know `message:updated` was broadcast and the component tests
 * know what the list renders given a changed message. Neither knows the two are
 * connected — that the event reaches a second person's screen and replaces the
 * bubble in place. That wiring is a socket subscription, a `conversationId`
 * comparison and a map by id, and every one of them is invisible from below.
 */
test.describe("editing and deleting a message", () => {
	test("an edit reaches the other person without a reload", async ({ browser }) => {
		const aliceUser = makeUser("Ada");
		const bobUser = makeUser("Bram");

		const alice = await browser.newContext();
		const bob = await browser.newContext();
		const alicePage = await alice.newPage();
		const bobPage = await bob.newPage();

		await register(bobPage, bobUser);
		await register(alicePage, aliceUser);
		await startDirectChat(alicePage, bobUser);
		await openConversationWith(bobPage, aliceUser);

		await sendMessage(alicePage, "meet at 5");
		await expect(messages(bobPage).getByText("meet at 5")).toBeVisible({ timeout: 15_000 });

		await alicePage.getByLabel("Edit message").click();
		await alicePage.getByLabel("Edit message").fill("meet at 6");
		await alicePage.getByRole("button", { name: "Save" }).click();

		// Bob is already looking at the old text, so this can only be the event.
		await expect(messages(bobPage).getByText("meet at 6")).toBeVisible({ timeout: 15_000 });
		await expect(messages(bobPage).getByText("meet at 5")).toHaveCount(0);
		// Replaced in place, not appended — otherwise both versions would show.
		await expect(messages(bobPage).getByText(/edited/)).toBeVisible();

		await alice.close();
		await bob.close();
	});

	test("a delete replaces the message on the other person's screen", async ({ browser }) => {
		const aliceUser = makeUser("Amara");
		const bobUser = makeUser("Bo");

		const alice = await browser.newContext();
		const bob = await browser.newContext();
		const alicePage = await alice.newPage();
		const bobPage = await bob.newPage();

		await register(bobPage, bobUser);
		await register(alicePage, aliceUser);
		await startDirectChat(alicePage, bobUser);
		await openConversationWith(bobPage, aliceUser);

		await sendMessage(alicePage, "sent to the wrong person");
		await expect(messages(bobPage).getByText("sent to the wrong person")).toBeVisible({ timeout: 15_000 });

		await alicePage.getByLabel("Delete message").click();
		// Still there: the delete asks first, and this is the half a unit test
		// cannot tell apart from a button that silently did nothing.
		await expect(messages(bobPage).getByText("sent to the wrong person")).toBeVisible();

		await alicePage.getByLabel("Confirm delete").click();

		await expect(messages(bobPage).getByText("This message was deleted")).toBeVisible({ timeout: 15_000 });
		await expect(messages(bobPage).getByText("sent to the wrong person")).toHaveCount(0);
		// And on the author's own screen, from the same event rather than from
		// the response to their own request.
		await expect(messages(alicePage).getByText("This message was deleted")).toBeVisible();

		await alice.close();
		await bob.close();
	});

	test("nobody is offered the buttons on someone else's message", async ({ browser }) => {
		const aliceUser = makeUser("Anh");
		const bobUser = makeUser("Bao");

		const alice = await browser.newContext();
		const bob = await browser.newContext();
		const alicePage = await alice.newPage();
		const bobPage = await bob.newPage();

		await register(bobPage, bobUser);
		await register(alicePage, aliceUser);
		await startDirectChat(alicePage, bobUser);
		await openConversationWith(bobPage, aliceUser);

		await sendMessage(alicePage, "mine to change");
		await expect(messages(bobPage).getByText("mine to change")).toBeVisible({ timeout: 15_000 });

		await expect(bobPage.getByLabel("Edit message")).toHaveCount(0);
		await expect(bobPage.getByLabel("Delete message")).toHaveCount(0);
		await expect(alicePage.getByLabel("Edit message")).toBeVisible();

		await alice.close();
		await bob.close();
	});
});
