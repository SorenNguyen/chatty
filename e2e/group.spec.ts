import { expect, test } from "@playwright/test";
import {
	makeUser,
	messages,
	openConversationNamed,
	register,
	sendMessage,
	startGroupChat,
	type TestUser,
} from "./helpers.js";
import type { Browser, Page } from "@playwright/test";

/**
 * Phase 6, in a real browser: the three things somebody noticed within a minute
 * of opening a group — a departure that happened in silence, messages whose
 * author disappeared from them, and a group where everybody could kick
 * everybody.
 */

const GROUP_NAME = "Weekend football";

interface Member {
	user: TestUser;
	page: Page;
}

/** Registers one person in their own browser context, so three people are three sessions. */
async function join(browser: Browser, name: string): Promise<Member> {
	const user = makeUser(name);
	const context = await browser.newContext();
	const page = await context.newPage();
	await register(page, user);

	return { user, page };
}

test.describe("a group with an owner", () => {
	test("announces a departure, and keeps the leaver's name on what they wrote", async ({ browser }) => {
		const owner = await join(browser, "Owner");
		const stayer = await join(browser, "Stayer");
		const leaver = await join(browser, "Leaver");

		await startGroupChat(owner.page, [stayer.user, leaver.user], GROUP_NAME);

		await openConversationNamed(leaver.page, GROUP_NAME);
		await sendMessage(leaver.page, "see you all");
		await expect(messages(owner.page).getByText("see you all")).toBeVisible({ timeout: 15_000 });

		await leaver.page.getByRole("button", { name: "Group members" }).click();
		await leaver.page.getByRole("button", { name: "Leave group" }).click();
		// Leaving is irreversible from here, so it asks first (phase 19). This
		// spec is why the confirmation could not ship unnoticed: every unit test
		// of the panel passed, and the browser found the flow had gained a step.
		await leaver.page.getByRole("button", { name: "Leave", exact: true }).click();

		// The notice the app used to leave out entirely: membership changed and
		// nothing anywhere said so.
		await expect(messages(owner.page).getByText(`${leaver.user.displayName} left the group`)).toBeVisible({
			timeout: 15_000,
		});

		// And the message they wrote before leaving still says who wrote it. This
		// is the assertion the old code fails: the author was resolved against the
		// participant list, which no longer contains them.
		await expect(messages(owner.page).getByText("see you all")).toBeVisible();
		await expect(messages(owner.page).getByText(leaver.user.displayName, { exact: true })).toBeVisible();

		// The conversation the leaver was in is gone from their own sidebar,
		// rather than staying there in a state they cannot use.
		await expect(leaver.page.getByRole("button", { name: new RegExp(GROUP_NAME) })).toBeHidden({
			timeout: 15_000,
		});

		await Promise.all([owner.page.context().close(), stayer.page.context().close(), leaver.page.context().close()]);
	});

	test("lets the owner rename it and shows everyone the new name", async ({ browser }) => {
		const owner = await join(browser, "Boss");
		const memberA = await join(browser, "Mem");
		const memberB = await join(browser, "Other");

		await startGroupChat(owner.page, [memberA.user, memberB.user], GROUP_NAME);
		await openConversationNamed(memberA.page, GROUP_NAME);

		await owner.page.getByRole("button", { name: "Group members" }).click();
		await owner.page.getByLabel("Group name").fill("Sunday football");
		await owner.page.getByRole("button", { name: "Save", exact: true }).click();

		// The rename reaches the other member over the socket, as a heading and as
		// a line in the log.
		await expect(memberA.page.getByRole("heading", { name: "Sunday football" })).toBeVisible({ timeout: 15_000 });
		await expect(
			messages(memberA.page).getByText(`${owner.user.displayName} renamed the group to "Sunday football"`),
		).toBeVisible({ timeout: 15_000 });

		await Promise.all([
			owner.page.context().close(),
			memberA.page.context().close(),
			memberB.page.context().close(),
		]);
	});

	test("gives a member no way to rename it or remove anyone", async ({ browser }) => {
		const owner = await join(browser, "Chief");
		const member = await join(browser, "Regular");
		const third = await join(browser, "Third");

		await startGroupChat(owner.page, [member.user, third.user], GROUP_NAME);
		await openConversationNamed(member.page, GROUP_NAME);

		await member.page.getByRole("button", { name: "Group members" }).click();

		await expect(member.page.getByLabel("Group name")).toBeDisabled();
		await expect(member.page.getByText(/only the group owner can rename/i)).toBeVisible();
		await expect(
			member.page.getByRole("button", { name: `Remove ${third.user.displayName} from the group` }),
		).toBeHidden();
		// What they can still do: leave, and invite.
		await expect(member.page.getByRole("button", { name: "Leave group" })).toBeEnabled();
		await expect(member.page.getByLabel("Add a member")).toBeEnabled();

		await Promise.all([owner.page.context().close(), member.page.context().close(), third.page.context().close()]);
	});
});
