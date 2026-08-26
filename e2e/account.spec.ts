import { expect, test } from "@playwright/test";
import { makeUser, register } from "./helpers.js";

test.describe("account", () => {
	test("a renamed profile shows up for the person who renamed it", async ({ page }) => {
		const user = makeUser("Rio");
		await register(page, user);

		await page.getByLabel("Account settings").click();
		await page.getByLabel("Display name").fill("Rio Renamed");
		await page.getByRole("button", { name: "Save changes" }).click();
		await expect(page.getByText("Profile saved")).toBeVisible();

		await page.getByRole("link", { name: "Back to chat" }).click();

		// The sidebar reads from the auth store, so this is what proves the
		// refreshed profile was written back into it rather than only returned.
		await expect(page.getByText("Rio Renamed")).toBeVisible();
	});

	test("a changed password is the one that works afterwards", async ({ page }) => {
		const user = makeUser("Pia");
		await register(page, user);

		await page.getByLabel("Account settings").click();
		await page.getByLabel("Current password").fill(user.password);
		await page.getByLabel("New password", { exact: true }).fill("BrandNewSecret456");
		await page.getByLabel("Confirm new password").fill("BrandNewSecret456");
		await page.getByRole("button", { name: "Change password" }).click();
		await expect(page.getByText(/password changed/i)).toBeVisible();

		await page.getByRole("link", { name: "Back to chat" }).click();
		await page.getByLabel("Sign out").click();

		await page.getByLabel("Email").fill(user.email);
		await page.getByLabel("Password").fill("BrandNewSecret456");
		await page.getByRole("button", { name: "Sign in" }).click();

		// The search box, not the composer: a fresh sign-in lands on the chat screen
		// with no conversation selected, so there is nothing to type into yet.
		await expect(page.getByLabel("Find someone")).toBeVisible({ timeout: 15_000 });
	});
});
