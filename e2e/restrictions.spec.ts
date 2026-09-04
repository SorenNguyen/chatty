import { expect, test } from "@playwright/test";
import { makeUser, messages, openConversationWith, register, sendMessage, startDirectChat } from "./helpers.js";

/**
 * Restricting, through the interface rather than the service.
 *
 * The service tests already prove the rules — one-directional, groups exempt,
 * unread/read-receipt/presence effects — so this covers only what a browser
 * can say: that the control is reachable from the conversation panel, that it
 * is a quiet toggle rather than blocking's confirm-then-act, that it does not
 * touch message delivery the way a block does, and that account settings and
 * the conversation panel agree about the same fact in real time.
 */
test.describe("restricting", () => {
	test("toggles quietly from the panel, and never stops a message arriving", async ({ browser }) => {
		const mai = makeUser("Mai");
		const linh = makeUser("Linh");
		const maiContext = await browser.newContext();
		const linhContext = await browser.newContext();
		const maiPage = await maiContext.newPage();
		const linhPage = await linhContext.newPage();

		await register(linhPage, linh);
		await register(maiPage, mai);
		await startDirectChat(maiPage, linh);

		await maiPage.getByRole("button", { name: "Conversation storage and details" }).click();
		await expect(maiPage.getByRole("button", { name: `Restrict ${linh.displayName}` })).toBeVisible({
			timeout: 15_000,
		});

		// No confirm dialog — unlike Block, restricting changes nothing the other
		// person can observe, so there is nothing here worth a second click to undo.
		await maiPage.getByRole("button", { name: `Restrict ${linh.displayName}` }).click();
		await expect(maiPage.getByRole("button", { name: `Stop restricting ${linh.displayName}` })).toBeVisible({
			timeout: 15_000,
		});

		// The point of the feature: a restricted person's message still arrives.
		// Linh's page has not opened the conversation yet — it exists only on
		// Mai's side so far, delivered to Linh's sidebar over `conversation:new`.
		await openConversationWith(linhPage, mai);
		await sendMessage(linhPage, "still delivered after being restricted");
		await expect(messages(maiPage).getByText("still delivered after being restricted")).toBeVisible({
			timeout: 15_000,
		});
	});

	test("account settings and the conversation panel agree about the same restriction", async ({ browser }) => {
		const mai = makeUser("Mai");
		const linh = makeUser("Linh");
		const maiContext = await browser.newContext();
		const linhContext = await browser.newContext();
		const maiPage = await maiContext.newPage();
		const linhPage = await linhContext.newPage();

		await register(linhPage, linh);
		await register(maiPage, mai);
		await startDirectChat(maiPage, linh);

		await maiPage.getByRole("button", { name: "Conversation storage and details" }).click();
		await maiPage.getByRole("button", { name: `Restrict ${linh.displayName}` }).click();
		await expect(maiPage.getByRole("button", { name: `Stop restricting ${linh.displayName}` })).toBeVisible({
			timeout: 15_000,
		});

		await maiPage.getByLabel("Account settings").click();
		await maiPage.getByRole("button", { name: "Restricted people" }).click();
		// Scoped to the dialog: Linh's name also appears in the sidebar row and
		// the conversation header behind it.
		const settingsDialog = maiPage.getByRole("dialog");
		await expect(settingsDialog.getByText(linh.displayName, { exact: true })).toBeVisible({ timeout: 15_000 });

		await settingsDialog.getByRole("button", { name: "Stop restricting" }).click();
		await expect(settingsDialog.getByText("You have not restricted anyone.")).toBeVisible({ timeout: 15_000 });
		await maiPage.getByRole("button", { name: "Close settings" }).click();

		// The panel is a second surface over the same store: unrestricting in
		// settings has to be reflected here too, or it would invite restricting
		// someone who settings already says is not restricted.
		await maiPage.getByRole("button", { name: "Conversation storage and details" }).click();
		await expect(maiPage.getByRole("button", { name: `Restrict ${linh.displayName}` })).toBeVisible({
			timeout: 15_000,
		});
	});
});
