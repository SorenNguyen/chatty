import { expect, test } from "@playwright/test";
import { makeUser, messages, openConversationWith, register, sendMessage, startDirectChat } from "./helpers.js";

const API_URL = "http://localhost:4100";

function makeWave(): Buffer {
	const sampleRate = 8_000;
	const dataSize = sampleRate * 2;
	const wave = Buffer.alloc(44 + dataSize);
	wave.write("RIFF", 0);
	wave.writeUInt32LE(36 + dataSize, 4);
	wave.write("WAVEfmt ", 8);
	wave.writeUInt32LE(16, 16);
	wave.writeUInt16LE(1, 20);
	wave.writeUInt16LE(1, 22);
	wave.writeUInt32LE(sampleRate, 24);
	wave.writeUInt32LE(sampleRate * 2, 28);
	wave.writeUInt16LE(2, 32);
	wave.writeUInt16LE(16, 34);
	wave.write("data", 36);
	wave.writeUInt32LE(dataSize, 40);
	for (let sample = 0; sample < sampleRate; sample += 1) {
		wave.writeInt16LE(Math.round(Math.sin((sample / sampleRate) * Math.PI * 440 * 2) * 8_000), 44 + sample * 2);
	}

	return wave;
}

test("files, voice, links, thumbnails and the conversation vault work across two browsers", async ({ browser }) => {
	const senderUser = makeUser("VaultSender");
	const viewerUser = makeUser("VaultViewer");
	const sender = await browser.newContext();
	const viewer = await browser.newContext();
	const senderPage = await sender.newPage();
	const viewerPage = await viewer.newPage();

	await register(viewerPage, viewerUser);
	await register(senderPage, senderUser);
	await startDirectChat(senderPage, viewerUser);
	await openConversationWith(viewerPage, senderUser);

	const main = senderPage.getByRole("main");
	await main.locator('input[type="file"]:not([multiple])').setInputFiles({
		name: "Tài liệu.pdf",
		mimeType: "application/pdf",
		buffer: Buffer.from("%PDF-1.4 chatty e2e"),
	});
	await sendMessage(senderPage, "Quarterly file");
	await expect(messages(viewerPage).getByRole("link", { name: /Tài liệu\.pdf/u })).toBeVisible({ timeout: 15_000 });

	const png = Buffer.from(
		"iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAYAAACp8Z5+AAAAFUlEQVR42mP8z8BQz0AEYBxVSF+FABJADveWkH6oAAAAAElFTkSuQmCC",
		"base64",
	);
	await main.locator('input[type="file"][multiple]').setInputFiles({
		name: "vault-photo.png",
		mimeType: "image/png",
		buffer: png,
	});
	await sendMessage(senderPage, "Vault photo");
	await expect(messages(viewerPage).getByAltText("Vault photo")).toBeVisible({ timeout: 15_000 });

	await sendMessage(senderPage, "Read https://example.com/chatty-vault");

	// MediaRecorder itself cannot be driven meaningfully by Playwright. Post a
	// real WAV fixture through the same authenticated endpoint and assert the
	// browser renders the transcoded player—the portable playback path this test
	// is responsible for.
	const voiceStatus = await senderPage.evaluate(
		async ({ apiUrl, waveBase64 }) => {
			const token = localStorage.getItem("chatty:token");
			const conversations = (await (
				await fetch(`${apiUrl}/conversations`, { headers: { Authorization: `Bearer ${token}` } })
			).json()) as { id: string }[];
			const bytes = Uint8Array.from(atob(waveBase64), (character) => character.charCodeAt(0));
			const body = new FormData();
			body.append("voice", new Blob([bytes], { type: "audio/wav" }), "voice.wav");

			return (
				await fetch(`${apiUrl}/conversations/${conversations[0]!.id}/messages`, {
					method: "POST",
					headers: { Authorization: `Bearer ${token}` },
					body,
				})
			).status;
		},
		{ apiUrl: API_URL, waveBase64: makeWave().toString("base64") },
	);
	expect(voiceStatus).toBe(201);
	await expect(messages(viewerPage).getByRole("button", { name: "Play voice message" })).toBeVisible({
		timeout: 15_000,
	});

	await senderPage.getByRole("button", { name: "Conversation storage and details" }).click();
	const vault = senderPage
		.getByRole("complementary")
		.filter({ has: senderPage.getByRole("heading", { name: "Conversation details" }) });
	await expect(
		vault.getByText(new Intl.DateTimeFormat("en", { month: "long", year: "numeric" }).format(new Date())),
	).toBeVisible();
	await vault.getByRole("button", { name: "Files" }).click();
	await expect(vault.getByRole("link", { name: /Tài liệu\.pdf/u })).toBeVisible();
	await vault.getByRole("button", { name: "Voice", exact: true }).click();
	await expect(vault.getByRole("button", { name: "Play voice message" })).toBeVisible();
	await vault.getByRole("button", { name: "Links" }).click();
	await expect(vault.getByText("https://example.com/chatty-vault")).toBeVisible();

	await sender.close();
	await viewer.close();
});
