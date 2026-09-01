import { access, mkdir, rm, utimes, writeFile } from "node:fs/promises";
import path from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { env } from "../src/config/env.js";
import { sweepOrphanedAttachments, sweepOrphanedAvatars } from "../src/lib/orphaned-uploads.js";
import { prisma } from "../src/lib/prisma.js";

const attachmentsDirectory = path.resolve(env.UPLOAD_DIR, "attachments");
const avatarsDirectory = path.resolve(env.UPLOAD_DIR, "avatars");

/** An hour and a bit, so a file aged with it is unambiguously past the grace period. */
const WELL_PAST_GRACE_MS = 61 * 60 * 1000;

/**
 * The upload directory is emptied here, and it has to be.
 *
 * `tests/setup.ts` truncates every table before each test but touches no files,
 * so a fixture written by the previous test survives into this one with its row
 * gone — which is to say, as a genuine orphan. The sweep then correctly deletes
 * it and returns a count nobody in this test asked for. That cost one confusing
 * failure before it was written down: the assertion that broke was the one about
 * a *young* file being left alone, and the extra deletion was an old file from
 * two tests earlier.
 */
beforeEach(async () => {
	await rm(attachmentsDirectory, { recursive: true, force: true });
	await mkdir(attachmentsDirectory, { recursive: true });
	await rm(avatarsDirectory, { recursive: true, force: true });
	await mkdir(avatarsDirectory, { recursive: true });
});

async function writeAvatarFile(userId: string, ageMs = 0): Promise<string> {
	const filePath = path.join(avatarsDirectory, `${userId}.webp`);
	await writeFile(filePath, "not really an avatar");

	if (ageMs > 0) {
		const when = new Date(Date.now() - ageMs);
		await utimes(filePath, when, when);
	}

	return filePath;
}

/**
 * Writes a file where an attachment would live, optionally backdated.
 *
 * Not a real image: nothing in the sweep decodes one, and generating WebP through
 * sharp for every fixture would be a second of CPU spent proving nothing.
 */
async function writeAttachmentFile(id: string, ageMs = 0, suffix = ".webp"): Promise<string> {
	const filePath = path.join(attachmentsDirectory, `${id}${suffix}`);
	await writeFile(filePath, "not really an image");

	if (ageMs > 0) {
		const when = new Date(Date.now() - ageMs);
		await utimes(filePath, when, when);
	}

	return filePath;
}

async function exists(filePath: string): Promise<boolean> {
	try {
		await access(filePath);

		return true;
	} catch {
		return false;
	}
}

/**
 * A real `Attachment` row, and everything it needs to exist.
 *
 * Built directly rather than by sending a message: the sweep only ever asks
 * whether a row with this id exists, and going through the service would drag in
 * sharp, sockets and a conversation for no extra coverage.
 */
async function createReferencedAttachment(id: string): Promise<void> {
	const author = await prisma.user.create({
		data: { email: `${id}@chatty.test`, handle: `h${id}`, displayName: id, passwordHash: "not-a-real-hash" },
		select: { id: true },
	});
	const conversation = await prisma.conversation.create({ data: {}, select: { id: true } });
	const message = await prisma.message.create({
		data: { conversationId: conversation.id, authorId: author.id, content: "with a picture" },
		select: { id: true },
	});
	await prisma.attachment.create({
		data: {
			id,
			messageId: message.id,
			conversationId: conversation.id,
			position: 0,
			mediaType: "image/webp",
			width: 10,
			height: 10,
			byteSize: 19,
		},
		select: { id: true },
	});
}

describe("sweepOrphanedAttachments", () => {
	it("removes a file that no row points at", async () => {
		// What a request dying between writing the image and committing its row
		// leaves behind. Nothing in the app can see it afterwards.
		const orphan = await writeAttachmentFile("orphan1", WELL_PAST_GRACE_MS);

		await expect(sweepOrphanedAttachments()).resolves.toBe(1);
		await expect(exists(orphan)).resolves.toBe(false);
	});

	it("leaves a file its row still points at", async () => {
		const kept = await writeAttachmentFile("kept1", WELL_PAST_GRACE_MS);
		await createReferencedAttachment("kept1");

		await expect(sweepOrphanedAttachments()).resolves.toBe(0);
		await expect(exists(kept)).resolves.toBe(true);
	});

	it("leaves a file that is younger than the grace period", async () => {
		// The dangerous case, and the reason the grace period exists: this file may
		// belong to a request whose row has not committed yet. Deleting it turns a
		// working upload into a broken image, which is worse than the bytes.
		const inFlight = await writeAttachmentFile("inflight1");

		await expect(sweepOrphanedAttachments()).resolves.toBe(0);
		await expect(exists(inFlight)).resolves.toBe(true);
	});

	it("is idempotent, so two instances sweeping at once is not an error", async () => {
		await writeAttachmentFile("orphan2", WELL_PAST_GRACE_MS);

		await expect(sweepOrphanedAttachments()).resolves.toBe(1);
		// The second pass finds nothing rather than failing on a file that is gone.
		await expect(sweepOrphanedAttachments()).resolves.toBe(0);
	});

	it("keeps every derivative of a live id and removes every file of an orphan", async () => {
		const orphanImage = await writeAttachmentFile("orphan3", WELL_PAST_GRACE_MS);
		const orphanFile = await writeAttachmentFile("orphan3", WELL_PAST_GRACE_MS, ".bin");
		const orphanThumb = await writeAttachmentFile("orphan3", WELL_PAST_GRACE_MS, "_t.webp");
		const keptImage = await writeAttachmentFile("kept3", WELL_PAST_GRACE_MS);
		const keptFile = await writeAttachmentFile("kept3", WELL_PAST_GRACE_MS, ".bin");
		const keptThumb = await writeAttachmentFile("kept3", WELL_PAST_GRACE_MS, "_t.webp");
		await createReferencedAttachment("kept3");

		await expect(sweepOrphanedAttachments()).resolves.toBe(1);
		for (const orphan of [orphanImage, orphanFile, orphanThumb]) await expect(exists(orphan)).resolves.toBe(false);
		for (const kept of [keptImage, keptFile, keptThumb]) await expect(exists(kept)).resolves.toBe(true);
	});
});

describe("sweepOrphanedAvatars", () => {
	it("removes an old avatar after its user row is gone", async () => {
		const orphan = await writeAvatarFile("deleted-user", WELL_PAST_GRACE_MS);

		await expect(sweepOrphanedAvatars()).resolves.toBe(1);
		await expect(exists(orphan)).resolves.toBe(false);
	});

	it("keeps the avatar of a user whose profile references it", async () => {
		const user = await prisma.user.create({
			data: {
				email: "avatar-owner@chatty.test",
				handle: "avatarowner",
				displayName: "Avatar owner",
				passwordHash: "not-a-real-hash",
				avatarUpdatedAt: new Date(),
			},
			select: { id: true },
		});
		const kept = await writeAvatarFile(user.id, WELL_PAST_GRACE_MS);

		await expect(sweepOrphanedAvatars()).resolves.toBe(0);
		await expect(exists(kept)).resolves.toBe(true);
	});

	it("removes a stale file when the user has cleared their avatar", async () => {
		const user = await prisma.user.create({
			data: {
				email: "cleared-avatar@chatty.test",
				handle: "clearedavatar",
				displayName: "Cleared avatar",
				passwordHash: "not-a-real-hash",
			},
			select: { id: true },
		});
		const orphan = await writeAvatarFile(user.id, WELL_PAST_GRACE_MS);

		await expect(sweepOrphanedAvatars()).resolves.toBe(1);
		await expect(exists(orphan)).resolves.toBe(false);
	});
});
