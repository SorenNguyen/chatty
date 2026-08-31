import type { StickerDTO } from "@chatty/shared-types";
import { buildStickerUrl, deleteAttachment, findAttachmentPath, saveAttachment } from "../../lib/attachment-storage.js";
import { isValidAttachmentToken } from "../../lib/attachment-token.js";
import { NotFoundError } from "../../lib/errors.js";
import { prisma } from "../../lib/prisma.js";

/**
 * Somebody's tray of saved images.
 *
 * Stored and served exactly the way an attachment is — same re-encode, same
 * signed URL, same directory — because they are the same kind of thing on disk.
 * What differs is lifetime, which is why they are a separate table: an
 * attachment dies with its message, a sticker outlives every message it was
 * sent in.
 */

/** Keeps a tray browsable and bounds what one account can put on the disk. */
export const MAX_STICKERS_PER_USER = 60;

function toStickerDTO(row: { id: string; width: number; height: number; createdAt: Date }): StickerDTO {
	return {
		id: row.id,
		// Built per response, never stored: the token in it expires. Points at
		// `/stickers/:id`, not `/attachments/:id` — a sticker is not in the
		// attachment table, and the wrong path is a broken image in every tray.
		url: buildStickerUrl(row.id),
		width: row.width,
		height: row.height,
		createdAt: row.createdAt.toISOString(),
	};
}

export async function listStickers(userId: string): Promise<StickerDTO[]> {
	const rows = await prisma.sticker.findMany({
		where: { userId },
		orderBy: { createdAt: "desc" },
		select: { id: true, width: true, height: true, createdAt: true },
	});

	return rows.map(toStickerDTO);
}

/**
 * Saves an image to the tray.
 *
 * The file is written before the row, the same order `sendMessage` uses and for
 * the same reason: a crash between the two leaves an unreferenced file, which
 * is swept, where the other order leaves a tray showing a broken image forever.
 */
export async function addSticker(userId: string, upload: Buffer): Promise<StickerDTO> {
	const count = await prisma.sticker.count({ where: { userId } });
	if (count >= MAX_STICKERS_PER_USER) {
		throw new NotFoundError(`A tray holds at most ${MAX_STICKERS_PER_USER} stickers`);
	}

	const id = crypto.randomUUID();
	const stored = await saveAttachment(id, upload);
	const row = await prisma.sticker.create({
		data: { id, userId, ...stored },
		select: { id: true, width: true, height: true, createdAt: true },
	});

	return toStickerDTO(row);
}

export async function removeSticker(userId: string, stickerId: string): Promise<void> {
	// Scoped by owner rather than fetched and compared, so a miss never confirms
	// that somebody else's sticker id exists.
	const deleted = await prisma.sticker.deleteMany({ where: { id: stickerId, userId } });
	if (deleted.count === 0) throw new NotFoundError("Sticker not found");

	// After the row, so a failure here leaves a file nothing points at rather
	// than a tray entry with no picture.
	await deleteAttachment(stickerId).catch(() => undefined);
}

/**
 * The file behind a sticker, for `GET /stickers/:id`.
 *
 * A bad token answers 404 rather than 401, the same way the attachment endpoint
 * does: a 401 would confirm the id exists.
 */
export async function getStickerFilePath(stickerId: string, token: string): Promise<string> {
	if (!isValidAttachmentToken(token, stickerId)) throw new NotFoundError("Sticker not found");

	const filePath = await findAttachmentPath(stickerId);
	if (!filePath) throw new NotFoundError("Sticker not found");

	return filePath;
}

/** The bytes of a sticker somebody owns, for copying into a message. */
export async function readOwnedStickerPath(userId: string, stickerId: string): Promise<string> {
	const sticker = await prisma.sticker.findFirst({ where: { id: stickerId, userId }, select: { id: true } });
	if (!sticker) throw new NotFoundError("Sticker not found");

	const filePath = await findAttachmentPath(sticker.id);
	if (!filePath) throw new NotFoundError("Sticker not found");

	return filePath;
}
