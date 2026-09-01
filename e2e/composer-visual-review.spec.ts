import { expect, test } from "@playwright/test";
import { makeUser, register, startDirectChat } from "./helpers.js";

test("captures the attachment menu", async ({ browser }) => {
	const minhUser = makeUser("Minh");
	const anUser = makeUser("An");
	const minh = await browser.newContext({ viewport: { width: 1440, height: 900 } });
	const an = await browser.newContext({ viewport: { width: 1440, height: 900 } });
	const minhPage = await minh.newPage();
	const anPage = await an.newPage();
	await register(anPage, anUser);
	await register(minhPage, minhUser);
	await startDirectChat(minhPage, anUser);
	await minhPage.getByRole("main").getByRole("button", { name: "Add an attachment" }).click();
	const menu = minhPage.getByRole("menu", { name: "Choose an attachment" });
	await expect(menu).toBeVisible();
	await menu.evaluate((element) => Promise.all(element.getAnimations().map((animation) => animation.finished)));
	await minhPage.screenshot({ path: "/tmp/chatty-composer-menu-before.png" });
	await minhPage.setViewportSize({ width: 360, height: 740 });
	await minhPage.screenshot({ path: "/tmp/chatty-composer-menu-mobile.png" });
});
