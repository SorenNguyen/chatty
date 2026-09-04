import type { AttachmentDTO } from "@chatty/shared-types";

/** Uses the small derivative anywhere an image is only being previewed. */
export function getAttachmentPreviewUrl(attachment: AttachmentDTO): string {
	return attachment.thumbUrl ?? attachment.url;
}
