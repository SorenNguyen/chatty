import type { AttachmentDTO } from "@chatty/shared-types";
import { getAttachmentDisplaySize } from "../utils";

interface MessageAttachmentProps {
	attachment: AttachmentDTO;
	/** The message's own text, used to describe the picture when there is one. */
	caption: string;
}

/**
 * The image on a message.
 *
 * Its own component rather than a branch inside MessageList: that file already
 * carries the run-grouping, read-receipt and alignment logic, and this adds a
 * sizing concern that has nothing to do with any of them.
 *
 * `width`/`height` are set as attributes, not just in CSS, so the browser
 * reserves the box before the bytes arrive — otherwise every image loading in a
 * scrolled-back conversation shoves the messages below it down as it decodes.
 */
export function MessageAttachment({ attachment, caption }: MessageAttachmentProps) {
	const size = getAttachmentDisplaySize(attachment.width, attachment.height);

	return (
		<img
			// Keyed by id nowhere near this — the URL carries a token that is
			// re-minted per read, so it must never be used as an identity.
			src={attachment.url}
			// The caption when there is one, because that is the only description
			// anyone has written. "Image" alone at least says something is there;
			// an empty alt would tell a screen reader to skip the message entirely.
			alt={caption || "Image"}
			width={size.width}
			height={size.height}
			// Conversations load a page of history at once and most of it is off
			// screen; fetching every picture immediately would spend the whole
			// connection on images nobody has scrolled to.
			loading="lazy"
			className="rounded-xl object-cover"
		/>
	);
}
