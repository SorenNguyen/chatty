import type { AttachmentDTO } from "@chatty/shared-types";
import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/button";
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
	const [isOpen, setIsOpen] = useState(false);

	useEffect(() => {
		if (!isOpen) return;

		function closeOnEscape(event: KeyboardEvent) {
			if (event.key === "Escape") setIsOpen(false);
		}

		window.addEventListener("keydown", closeOnEscape);

		return () => window.removeEventListener("keydown", closeOnEscape);
	}, [isOpen]);

	return (
		<>
			<Button
				variant="ghost"
				onClick={() => setIsOpen(true)}
				className="block cursor-zoom-in rounded-md p-0 focus:outline-none focus:ring-2 focus:ring-ink/25"
			>
				<img
					// Keyed by id nowhere near this — the URL carries a token that is
					// re-minted per read, so it must never be used as an identity.
					src={attachment.url}
					alt={caption || "Image"}
					width={size.width}
					height={size.height}
					loading="lazy"
					className="rounded-md object-cover"
				/>
			</Button>

			{isOpen && (
				<div
					role="dialog"
					aria-modal="true"
					aria-label="Image preview"
					onClick={() => setIsOpen(false)}
					className="fixed inset-0 z-50 flex items-center justify-center bg-ink/92 p-6 backdrop-blur-sm"
				>
					<img
						src={attachment.url}
						alt={caption || "Image"}
						className="max-h-full max-w-full rounded-md object-contain"
					/>
					<Button
						variant="ghost"
						onClick={() => setIsOpen(false)}
						aria-label="Close image preview"
						className="absolute right-5 top-5 size-9 rounded-md border border-paper/25 bg-transparent p-0 text-paper hover:bg-paper/15 hover:text-paper"
					>
						<X className="size-5" />
					</Button>
				</div>
			)}
		</>
	);
}
