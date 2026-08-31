import { ATTACHMENT_PREVIEW_TEXT } from "../constants/message";

/**
 * What a message made only of pictures says where its text would go — the
 * sidebar preview, and the composer's reply slot.
 *
 * It counts, because "Sent an image" under a conversation somebody just sent
 * nine photos to is a small lie that the sidebar is the last place to tell: the
 * preview exists precisely so the reader knows what is waiting without opening
 * the thread.
 */
export function getAttachmentPreviewText(count: number): string {
	return count > 1 ? `Sent ${count} images` : ATTACHMENT_PREVIEW_TEXT;
}
