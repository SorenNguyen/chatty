import type { AttachmentDTO } from "@chatty/shared-types";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/button";

interface AttachmentLightboxProps {
	attachments: AttachmentDTO[];
	/** Which one was clicked. The viewer opens here and moves from it. */
	initialIndex: number;
	caption: string;
	onClose: () => void;
	onOpenMessage?: (attachment: AttachmentDTO) => void;
}

/**
 * One image, full size, with the rest of its message a keystroke away.
 *
 * Split out of `MessageAttachment` when a message could carry more than one
 * picture: what used to be "show this image" became "walk a set", which is a
 * piece of state, two more controls and a second keyboard binding — none of
 * which the thumbnail that opens it has any business holding.
 *
 * The arrow keys work because a viewer that can only be driven with a mouse is
 * useless for the thing people actually do here, which is glance through a
 * handful of photos in a row.
 */
export function AttachmentLightbox({
	attachments,
	initialIndex,
	caption,
	onClose,
	onOpenMessage,
}: AttachmentLightboxProps) {
	const [index, setIndex] = useState(initialIndex);
	const total = attachments.length;

	// Wrapping rather than stopping at the ends: with three or four pictures the
	// set is small enough that "next" always having somewhere to go is less
	// surprising than an arrow that silently stops working.
	const step = useCallback((delta: number) => setIndex((current) => (current + delta + total) % total), [total]);

	useEffect(() => {
		function handleKeyDown(event: KeyboardEvent) {
			if (event.key === "Escape") onClose();
			if (event.key === "ArrowRight") step(1);
			if (event.key === "ArrowLeft") step(-1);
		}

		window.addEventListener("keydown", handleKeyDown);

		return () => window.removeEventListener("keydown", handleKeyDown);
	}, [onClose, step]);

	const current = attachments[index];
	if (!current) return null;

	return (
		<div
			role="dialog"
			aria-modal="true"
			aria-label={total > 1 ? `Image ${index + 1} of ${total}` : "Image preview"}
			onClick={onClose}
			className="fixed inset-0 z-50 flex items-center justify-center bg-scrim/90 p-6 dark:bg-scrim/95"
		>
			<img
				src={current.url}
				alt={caption || "Image"}
				// The backdrop closes on click; the picture itself must not, or
				// reaching for the next arrow past the edge of a narrow image closes
				// the viewer instead.
				onClick={(event) => event.stopPropagation()}
				className="max-h-full max-w-full rounded-control object-contain"
			/>

			{total > 1 && (
				<>
					<Button
						variant="ghost"
						onClick={(event) => {
							event.stopPropagation();
							step(-1);
						}}
						aria-label="Previous image"
						className="absolute left-5 size-10 rounded-control border border-on-media/25 p-0 text-on-media hover:bg-on-media/10"
					>
						<ChevronLeft className="size-5" />
					</Button>
					<Button
						variant="ghost"
						onClick={(event) => {
							event.stopPropagation();
							step(1);
						}}
						aria-label="Next image"
						className="absolute right-5 size-10 rounded-control border border-on-media/25 p-0 text-on-media hover:bg-on-media/10"
					>
						<ChevronRight className="size-5" />
					</Button>
					{/* Mono, like every other machine-produced number in this app. */}
					<span className="meta absolute bottom-6 text-on-media/70">
						{index + 1} / {total}
					</span>
				</>
			)}

			{onOpenMessage && (
				<Button
					variant="ghost"
					onClick={(event) => {
						event.stopPropagation();
						onOpenMessage(current);
					}}
					className="absolute bottom-5 left-5 border border-on-media/25 text-on-media hover:bg-on-media/10"
				>
					View in conversation
				</Button>
			)}

			<Button
				variant="ghost"
				onClick={onClose}
				aria-label="Close image preview"
				className="absolute right-5 top-5 size-9 rounded-control border border-on-media/25 p-0 text-on-media hover:bg-on-media/10"
			>
				<X className="size-5" />
			</Button>
		</div>
	);
}
