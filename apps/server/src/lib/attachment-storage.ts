import { access, mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { env } from "../config/env.js";
import { ValidationError } from "./errors.js";
import { signAttachmentToken } from "./attachment-token.js";

/**
 * Where a message's image is — on disk, and on the wire.
 *
 * Deliberately a sibling of avatar-storage.ts rather than a shared "image
 * storage" module. The two answer different questions: an avatar is one square
 * per user, overwritten in place, public, and cached forever; an attachment is
 * one file per message, never replaced, private, and reached through a signed
 * URL. Merging them would mean a function whose every argument decides which of
 * the two it is actually doing.
 */

/**
 * Longest edge, preserving aspect ratio. Enough to stay sharp full-screen on a
 * retina laptop; past it the bytes cost more than the detail is worth in a chat
 * bubble. Smaller images are never enlarged.
 */
const MAX_ATTACHMENT_DIMENSION = 1600;

/**
 * Same guard as avatars, and for the same reason: a few kilobytes of PNG can
 * decode to gigabytes of pixels, which no file-size limit on the upload can see.
 */
const MAX_INPUT_PIXELS = 50_000_000;

const attachmentsDirectory = path.resolve(env.UPLOAD_DIR, "attachments");

/** What the re-encode produced, for the columns that describe it. */
export interface StoredAttachment {
	width: number;
	height: number;
	byteSize: number;
}

/**
 * Ids reaching this module end up in a path, so the shape is asserted here — at
 * the line that does the joining — rather than trusted to have been checked by
 * whoever called. Same reasoning as avatar-storage.
 */
function assertSafeKey(attachmentId: string): void {
	if (!/^[A-Za-z0-9_-]+$/.test(attachmentId)) {
		throw new ValidationError("Invalid attachment id");
	}
}

function attachmentPathFor(attachmentId: string): string {
	assertSafeKey(attachmentId);

	return path.join(attachmentsDirectory, `${attachmentId}.webp`);
}

/**
 * Normalizes an uploaded image and writes it under `attachmentId`.
 *
 * The re-encode is the security control, exactly as it is for avatars: a browser
 * decides what a file is by sniffing its bytes, so storing the original means
 * anything that survives a MIME check can still be served back from this origin
 * as something other than an image. Decoding to pixels and re-encoding as WebP
 * leaves nothing of the input format, and drops the EXIF a phone camera puts
 * there — which for a photo sent into a group chat is a GPS fix.
 *
 * Takes the id rather than inventing one so the caller can write the file
 * *before* the database row exists. Getting that order wrong the other way
 * leaves a row pointing at nothing, which is a message showing a broken image
 * forever; this way a failure leaves an unreferenced file, which costs bytes.
 */
export async function saveAttachment(attachmentId: string, upload: Buffer): Promise<StoredAttachment> {
	const filePath = attachmentPathFor(attachmentId);

	let normalized: Buffer;
	let width: number;
	let height: number;
	try {
		const { data, info } = await sharp(upload, { limitInputPixels: MAX_INPUT_PIXELS })
			// Applies the EXIF orientation flag, then discards it — without this,
			// photos taken in portrait arrive sideways.
			.rotate()
			.resize(MAX_ATTACHMENT_DIMENSION, MAX_ATTACHMENT_DIMENSION, { fit: "inside", withoutEnlargement: true })
			.webp({ quality: 82 })
			.toBuffer({ resolveWithObject: true });
		normalized = data;
		width = info.width;
		height = info.height;
	} catch {
		// sharp throws for anything it cannot decode — a PDF renamed to .png, a
		// truncated upload, a decompression bomb. All the caller's fault, so a 400
		// rather than the 500 an unhandled throw would become.
		throw new ValidationError("That file could not be read as an image");
	}

	await mkdir(attachmentsDirectory, { recursive: true });
	await writeFile(filePath, normalized);

	return { width, height, byteSize: normalized.byteLength };
}

/** Absolute path of a stored attachment, or null when the file is not there. */
export async function findAttachmentPath(attachmentId: string): Promise<string | null> {
	const filePath = attachmentPathFor(attachmentId);

	try {
		await access(filePath);

		return filePath;
	} catch {
		return null;
	}
}

/** Removes an attachment's file. Succeeds when there was nothing to remove. */
export async function deleteAttachment(attachmentId: string): Promise<void> {
	await rm(attachmentPathFor(attachmentId), { force: true });
}

/**
 * The URL a client should put in an `<img src>`.
 *
 * Absolute, because the web app is served from a different origin in dev and a
 * relative path would resolve against Vite rather than this API.
 *
 * The token is minted per response rather than stored, so the same attachment
 * gets a different URL each time the message list is fetched. That costs the
 * HTTP cache — a reload re-downloads every visible image — and it is the price
 * of not leaving a permanent public link to private content lying around. The
 * avatar endpoint makes the opposite trade for the opposite reason: a profile
 * picture is public, so it can be cached forever.
 */
export function buildAttachmentUrl(attachmentId: string): string {
	return `${env.PUBLIC_URL}/attachments/${attachmentId}?token=${signAttachmentToken(attachmentId)}`;
}
