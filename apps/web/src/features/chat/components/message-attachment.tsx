import type { AttachmentDTO } from "@chatty/shared-types";
import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/button";
import { getAttachmentDisplaySize } from "../utils";
import { INCOMING_ATTACHMENT_RADIUS, OUTGOING_ATTACHMENT_RADIUS } from "../constants/message-cluster";
import type { ClusterPosition } from "../types/message-cluster";
import { cn } from "@/utils/cn";

interface MessageAttachmentProps {
	attachment: AttachmentDTO;
	/** The message's own text, used to describe the picture when there is one. */
	caption: string;
	isMine: boolean;
	/** Which bubble corners this picture has to follow. */
	clusterPosition: ClusterPosition;
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
export function MessageAttachment({ attachment, caption, isMine, clusterPosition }: MessageAttachmentProps) {
	const size = getAttachmentDisplaySize(attachment.width, attachment.height);
	// A caption puts text below the picture inside the same bubble, so the two
	// corners that were following the bubble's bottom edge are now in the middle
	// of it and square off. `rounded-b-none` must come last: it is what
	// tailwind-merge lets override the per-corner classes in the table.
	const radiusClasses = cn(
		(isMine ? OUTGOING_ATTACHMENT_RADIUS : INCOMING_ATTACHMENT_RADIUS)[clusterPosition],
		caption && "rounded-b-none",
	);
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
				className={cn(
					"block cursor-zoom-in overflow-hidden p-0 focus-visible:ring-3 focus-visible:ring-ink/25",
					radiusClasses,
				)}
			>
				<img
					// Keyed by id nowhere near this — the URL carries a token that is
					// re-minted per read, so it must never be used as an identity.
					src={attachment.url}
					alt={caption || "Image"}
					width={size.width}
					height={size.height}
					loading="lazy"
					className={cn("object-cover", radiusClasses)}
				/>
			</Button>

			{isOpen && (
				<div
					role="dialog"
					aria-modal="true"
					aria-label="Image preview"
					onClick={() => setIsOpen(false)}
					className="fixed inset-0 z-50 flex items-center justify-center bg-ink/90 p-6"
				>
					<img
						src={attachment.url}
						alt={caption || "Image"}
						className="max-h-full max-w-full rounded-control object-contain"
					/>
					<Button
						variant="ghost"
						onClick={() => setIsOpen(false)}
						aria-label="Close image preview"
						className="absolute right-5 top-5 size-9 rounded-control border border-paper/25 p-0 text-paper hover:bg-paper/10"
					>
						<X className="size-5" />
					</Button>
				</div>
			)}
		</>
	);
}
