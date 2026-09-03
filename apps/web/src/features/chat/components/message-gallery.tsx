import type { AttachmentDTO } from "@chatty/shared-types";
import { Layers } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/button";
import { cn } from "@/utils/cn";
import {
	ALBUM_CARDS_BEHIND,
	ALBUM_CARD_ROTATION,
	ALBUM_CARD_SHIFT,
	ALBUM_FAN_REACH,
	ALBUM_FAN_TRAIL,
	ALBUM_SIZE,
	MEDIA_TIME_CHIP_CLASS,
} from "../constants/attachment";
import { INCOMING_BUBBLE_RADIUS, OUTGOING_BUBBLE_RADIUS } from "../constants/message-cluster";
import type { ClusterPosition } from "../types/message-cluster";
import { getAttachmentDisplaySize } from "../utils";
import { AttachmentLightbox } from "./attachment-lightbox";

interface MessageGalleryProps {
	attachments: AttachmentDTO[];
	/** The message's own text, kept for the viewer instead of the conversation preview. */
	caption: string;
	isMine: boolean;
	/** Which bubble corners this block has to follow. */
	clusterPosition: ClusterPosition;
	/** The send time, drawn on the picture itself. */
	timeLabel?: string;
	/** Forwards this message from inside the viewer. Absent while it is still being sent. */
	onForward?: () => void;
}

/**
 * The images on a message: one at its own proportions, or several as an album.
 *
 * An album intentionally stays a small fanned stack. It says "a set" without
 * converting a conversation into a contact sheet. The caption is deliberately
 * absent from the thread and appears only in the viewer, alongside every image.
 * The cards behind are real upcoming pictures so the stack remains an honest
 * preview rather than ornamental paper.
 */
export function MessageGallery({
	attachments,
	caption,
	isMine,
	clusterPosition,
	timeLabel,
	onForward,
}: MessageGalleryProps) {
	const [openIndex, setOpenIndex] = useState<number | null>(null);
	const first = attachments[0];
	if (!first || first.width === null || first.height === null) return null;

	const size = getAttachmentDisplaySize(first.width, first.height);
	const isAlbum = attachments.length > 1;
	const radiusClasses = (isMine ? OUTGOING_BUBBLE_RADIUS : INCOMING_BUBBLE_RADIUS)[clusterPosition];
	const behind = attachments.slice(1, 1 + ALBUM_CARDS_BEHIND);

	return (
		<>
			{isAlbum ? (
				<div
					className="relative"
					style={{
						width: ALBUM_SIZE + ALBUM_FAN_REACH + ALBUM_FAN_TRAIL,
						height: ALBUM_SIZE + ALBUM_FAN_REACH + ALBUM_FAN_TRAIL,
					}}
				>
					{behind.map((attachment, index) => {
						const depth = behind.length - index;

						return (
							<span
								key={attachment.id}
								aria-hidden="true"
								className="absolute overflow-hidden rounded-control border border-rule bg-paper-raised shadow-sm"
								style={{
									width: ALBUM_SIZE,
									height: ALBUM_SIZE,
									left: ALBUM_FAN_TRAIL,
									top: ALBUM_FAN_REACH,
									transform: `translate(${depth * ALBUM_CARD_SHIFT}px, ${-depth * ALBUM_CARD_SHIFT}px) rotate(${depth * ALBUM_CARD_ROTATION}deg)`,
								}}
							>
								<img src={attachment.url} alt="" loading="lazy" className="size-full object-cover" />
							</span>
						);
					})}

					<Button
						variant="ghost"
						onClick={() => setOpenIndex(0)}
						aria-label={`Open album of ${attachments.length} images${caption ? " and its caption" : ""}`}
						className={cn(
							"absolute block cursor-zoom-in overflow-hidden rounded-control p-0",
							"border border-rule shadow-sm focus-visible:ring-3 focus-visible:ring-ink/25",
						)}
						style={{
							width: ALBUM_SIZE,
							height: ALBUM_SIZE,
							left: ALBUM_FAN_TRAIL,
							top: ALBUM_FAN_REACH,
						}}
					>
						<img
							src={first.url}
							alt={caption || `Album of ${attachments.length} images`}
							loading="lazy"
							className="size-full object-cover"
						/>
						<span className="absolute right-2 top-2 inline-flex items-center gap-1 rounded-badge bg-scrim/70 px-1.5 py-0.5">
							<Layers aria-hidden="true" className="size-3 text-on-media" />
							<span className="meta text-on-media">{attachments.length}</span>
						</span>
						{timeLabel && <span className={cn(MEDIA_TIME_CHIP_CLASS, "z-10")}>{timeLabel}</span>}
					</Button>
				</div>
			) : (
				<div className={cn("relative max-w-full overflow-hidden", radiusClasses)} style={{ width: size.width }}>
					<Button
						variant="ghost"
						onClick={() => setOpenIndex(0)}
						aria-label={caption ? `Open image and caption: ${caption}` : "Open image"}
						className={cn(
							"relative block max-w-full cursor-zoom-in overflow-hidden p-0",
							"focus-visible:ring-3 focus-visible:ring-ink/25",
							"after:pointer-events-none after:absolute after:inset-0 after:rounded-[inherit]",
							"after:ring-1 after:ring-inset after:ring-ink/10",
							radiusClasses,
						)}
					>
						<img
							src={first.url}
							alt={caption || "Image"}
							width={size.width}
							height={size.height}
							loading="lazy"
							className={cn("h-auto max-w-full object-cover", radiusClasses)}
						/>
						{timeLabel && <span className={cn(MEDIA_TIME_CHIP_CLASS, "z-10")}>{timeLabel}</span>}
					</Button>
				</div>
			)}

			{openIndex !== null && (
				<AttachmentLightbox
					attachments={attachments}
					initialIndex={openIndex}
					caption={caption}
					onClose={() => setOpenIndex(null)}
					// Closed on the way out, and not as a courtesy: the forward panel
					// belongs to the conversation pane and renders under this viewer,
					// so leaving the viewer open would hide the thing the press asked
					// for behind the thing it was pressed on.
					{...(onForward && {
						onForward: () => {
							setOpenIndex(null);
							onForward();
						},
					})}
				/>
			)}
		</>
	);
}
