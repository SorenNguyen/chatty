import type { AttachmentDTO } from "@chatty/shared-types";
import { IMAGE_MEASURE_TIMEOUT_MS } from "../constants/attachment";

/** Marks an attachment as this tab's, so nothing mistakes one for a stored row. */
const DRAFT_ATTACHMENT_ID_PREFIX = "draft-attachment:";

/**
 * Turns picked files into attachments the thread can render before the upload.
 *
 * This is what the "an image send is not optimistic" gap in the roadmap was
 * about, and the objection recorded there was a real one: an optimistic gallery
 * has to reserve each picture's space, and a gallery that resizes when the
 * upload lands is worse than the progress bar it replaced. So the size is
 * measured *first* — the browser already has the bytes, decoding them costs
 * milliseconds, and `getAttachmentDisplaySize` then reserves exactly the box the
 * stored image will occupy. Nothing moves when the real message arrives.
 *
 * An image that will not decode still gets a bubble, with null dimensions. That
 * is not a fallback path so much as the same path: the server stores null for a
 * picture it could not measure either, and the gallery has always handled it.
 *
 * The URLs are `blob:` and belong to this document. Whoever creates them owns
 * revoking them — see `releaseUpload` in `useConversationMessages`, which does
 * it when the draft settles, is discarded, or the hook unmounts with one still
 * in flight.
 */
export async function toDraftAttachments(files: File[]): Promise<AttachmentDTO[]> {
	return Promise.all(files.map(toDraftAttachment));
}

async function toDraftAttachment(file: File): Promise<AttachmentDTO> {
	const url = URL.createObjectURL(file);
	const size = await measure(url);

	return {
		id: `${DRAFT_ATTACHMENT_ID_PREFIX}${crypto.randomUUID()}`,
		kind: "image",
		url,
		// A draft has no server-made thumbnail. Its full picture is already local,
		// so the album's cards behind the cover do not need a second URL yet.
		thumbUrl: null,
		width: size?.width ?? null,
		height: size?.height ?? null,
		byteSize: file.size,
		fileName: file.name,
		mediaType: file.type,
		durationMs: null,
		waveform: [],
	};
}

/** Resolves with the picture's intrinsic size, or null if it will not decode in time. */
function measure(url: string): Promise<{ width: number; height: number } | null> {
	return new Promise((resolve) => {
		const image = new Image();
		const timer = window.setTimeout(() => resolve(null), IMAGE_MEASURE_TIMEOUT_MS);

		function settle(size: { width: number; height: number } | null) {
			window.clearTimeout(timer);
			resolve(size);
		}

		image.onload = () => settle({ width: image.naturalWidth, height: image.naturalHeight });
		image.onerror = () => settle(null);
		image.src = url;
	});
}
