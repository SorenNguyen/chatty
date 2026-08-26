import jwt from "jsonwebtoken";
import { env } from "../config/env.js";

/**
 * Short-lived capability tokens for `GET /attachments/:id`.
 *
 * An `<img>` tag cannot send an Authorization header, and unlike an avatar an
 * attachment is private — it is content inside a conversation, and "addressed
 * by an id nobody can guess" is not an access rule. So the URL carries proof
 * instead: the server hands out a token only in a response it has already
 * checked membership for, and the endpoint serves whoever presents one.
 *
 * The consequence is that a token is bearer proof for as long as it lives. Copy
 * a URL out of the network tab and it works elsewhere until it expires, and
 * someone removed from a group can still fetch an image whose token they were
 * given a minute earlier. That is the same trade a Slack or S3 signed URL makes;
 * `ATTACHMENT_TOKEN_TTL_SECONDS` is how long it lasts.
 */
export const ATTACHMENT_TOKEN_TTL_SECONDS = 60 * 60;

/**
 * Marks a token as *not* an access token.
 *
 * Both kinds are signed with `JWT_SECRET`, so without something to tell them
 * apart an attachment token would be accepted by `requireAuth` — which reads
 * `sub` as a user id and would be handed an attachment id instead. `requireAuth`
 * rejects any token carrying this claim; access tokens never have it.
 */
export const ATTACHMENT_TOKEN_TYPE = "attachment";

interface AttachmentTokenPayload {
	sub: string;
	typ: typeof ATTACHMENT_TOKEN_TYPE;
}

export function signAttachmentToken(attachmentId: string): string {
	const payload: AttachmentTokenPayload = { sub: attachmentId, typ: ATTACHMENT_TOKEN_TYPE };

	return jwt.sign(payload, env.JWT_SECRET, { expiresIn: ATTACHMENT_TOKEN_TTL_SECONDS });
}

/**
 * True when `token` was issued for exactly this attachment.
 *
 * The id is compared rather than returned, so a valid token for one attachment
 * cannot be replayed against another's URL.
 */
export function isValidAttachmentToken(token: string, attachmentId: string): boolean {
	try {
		const payload = jwt.verify(token, env.JWT_SECRET) as Partial<AttachmentTokenPayload>;

		return payload.typ === ATTACHMENT_TOKEN_TYPE && payload.sub === attachmentId;
	} catch {
		return false;
	}
}
