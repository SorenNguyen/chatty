import { findAttachmentPath } from "../../lib/attachment-storage.js";
import { isValidAttachmentToken } from "../../lib/attachment-token.js";
import { NotFoundError } from "../../lib/errors.js";
import { prisma } from "../../lib/prisma.js";

/**
 * Path of the file to serve for `GET /attachments/:attachmentId`.
 *
 * Returns a path rather than bytes so the controller can hand it to
 * `res.sendFile`, which sets the caching and range headers an image response
 * wants — reading it into a Buffer here would mean re-implementing those.
 *
 * A bad token answers 404 rather than 401, and the difference matters: 401
 * would confirm that an attachment with this id exists, which is exactly what
 * someone walking the id space is trying to find out. The two failures are
 * indistinguishable from outside, the same way `login` refuses to say whether
 * an email is registered.
 *
 * There is no membership check here. There cannot be — the request carries no
 * user. The token *is* the check: it is minted only in a response whose
 * membership was already verified. See lib/attachment-token.ts for what that
 * costs.
 */
export async function getAttachmentFilePath(attachmentId: string, token: string): Promise<string> {
	if (!isValidAttachmentToken(token, attachmentId)) throw new NotFoundError("Attachment not found");

	// Checked before the disk, so a file left behind by a failed write is not
	// served as though it were a real attachment.
	const attachment = await prisma.attachment.findUnique({ where: { id: attachmentId }, select: { id: true } });
	if (!attachment) throw new NotFoundError("Attachment not found");

	const filePath = await findAttachmentPath(attachmentId);
	if (!filePath) throw new NotFoundError("Attachment not found");

	return filePath;
}
