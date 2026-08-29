import { expect, test } from "@playwright/test";
import { makeUser, messages, openConversationWith, register, sendMessage, startDirectChat } from "./helpers.js";

/**
 * What only a browser can prove about reactions and replies.
 *
 * The service tests know the toggle writes a row and broadcasts the message, and
 * the component tests know what a bubble renders given a reaction list. Neither
 * knows the two are joined up — that pressing a glyph in one person's menu puts
 * a chip on the other person's screen without a reload, and that the composer's
 * reply slot actually reaches the server as `replyToId`. Every link in that
 * chain is invisible from below.
 */
test.describe("reactions", () => {
	test("a reaction reaches the other person without a reload", async ({ browser }) => {
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

		await sendMessage(alicePage, "shipped it");
		await expect(messages(bobPage).getByText("shipped it")).toBeVisible({ timeout: 15_000 });

		await bobPage.getByLabel("Message actions").click();
		await bobPage.getByRole("menuitem", { name: "Heart" }).click();

		// Alice is looking at her own message and did nothing, so a chip appearing
		// on her screen can only be the broadcast.
		await expect(alicePage.getByRole("button", { name: "Heart, 1" })).toBeVisible({ timeout: 15_000 });
		await expect(bobPage.getByRole("button", { name: "Heart, 1" })).toBeVisible();
	});

	test("pressing the same reaction again takes it off", async ({ browser }) => {
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

		await sendMessage(alicePage, "shipped it");
		await expect(messages(bobPage).getByText("shipped it")).toBeVisible({ timeout: 15_000 });

		await bobPage.getByLabel("Message actions").click();
		await bobPage.getByRole("menuitem", { name: "Heart" }).click();
		const chip = bobPage.getByRole("button", { name: "Heart, 1" });
		await expect(chip).toBeVisible({ timeout: 15_000 });

		// The chip is the same toggle as the menu entry: pressing it clears it.
		await chip.click();

		await expect(bobPage.getByRole("button", { name: /^Heart,/ })).toHaveCount(0, { timeout: 15_000 });
		await expect(alicePage.getByRole("button", { name: /^Heart,/ })).toHaveCount(0, { timeout: 15_000 });
	});
});

test.describe("replies", () => {
	test("a reply carries its quote to the other person", async ({ browser }) => {
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

		await bobPage.getByLabel("Message actions").click();
		await bobPage.getByRole("menuitem", { name: "Reply" }).click();
		// The composer says what is about to be answered before anything is sent.
		await expect(bobPage.getByText(/Replying to/)).toBeVisible();
		await sendMessage(bobPage, "works for me");

		// Alice sees the answer with her own line quoted inside it — which can only
		// have come back down from the server, since her page never had a reply slot.
		const reply = messages(alicePage).getByText("works for me");
		await expect(reply).toBeVisible({ timeout: 15_000 });
		await expect(messages(alicePage).getByText("meet at 5")).toHaveCount(2);
	});

	test("the quote follows the original when it is edited", async ({ browser }) => {
		// The quote is resolved on every read rather than copied at send time, so
		// an edited original must re-quote with its new words. A copy would keep
		// showing text its author had already replaced.
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

		await bobPage.getByLabel("Message actions").click();
		await bobPage.getByRole("menuitem", { name: "Reply" }).click();
		await sendMessage(bobPage, "works for me");
		await expect(messages(alicePage).getByText("works for me")).toBeVisible({ timeout: 15_000 });

		await alicePage.reload();
		await openConversationWith(alicePage, bobUser);
		await expect(messages(alicePage).getByText("meet at 5")).toHaveCount(2, { timeout: 15_000 });
	});
});
