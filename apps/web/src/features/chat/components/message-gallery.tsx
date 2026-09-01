import type { AttachmentDTO } from "@chatty/shared-types";
import { Layers } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/button";
import { cn } from "@/utils/cn";
import {
	ALBUM_CARD_ROTATION,
	ALBUM_CARD_SHIFT,
	ALBUM_CARDS_BEHIND,
	ALBUM_FAN_REACH,
	ALBUM_FAN_TRAIL,
	ALBUM_SIZE,
} from "../constants/attachment";
import { INCOMING_ATTACHMENT_RADIUS, OUTGOING_ATTACHMENT_RADIUS } from "../constants/message-cluster";
import type { ClusterPosition } from "../types/message-cluster";
import { getAttachmentDisplaySize } from "../utils";
import { AttachmentLightbox } from "./attachment-lightbox";

interface MessageGalleryProps {
	attachments: AttachmentDTO[];
	/** The message's own text, used to describe the pictures when there is one. */
	caption: string;
	isMine: boolean;
	/** Which bubble corners this block has to follow. */
	clusterPosition: ClusterPosition;
}

/**
 * The images on a message: one at its own proportions, or several as an album.
 *
 * **One picture keeps its true shape.** `width`/`height` go on the element
 * itself, not only in CSS, so the browser reserves the box before the bytes
 * arrive — otherwise every image loading in a scrolled-back conversation shoves
 * the messages below it down as it decodes.
 *
 * **Several become a fanned stack, not a grid.** A 2×2 of tiles takes 320×320 of
 * the conversation for a set that gets opened in a viewer anyway; the stack says
 * "there are pictures here, and how many" in roughly a quarter of that, and one
 * tap reaches all of them.
 *
 * The cards behind are the **next pictures**, turned a few degrees. The first
 * version drew blank paper offset straight down, and it was dead — legible, and
 * read as a rendering fault rather than a pile of photographs. Showing the real
 * images is also the more useful half: a glance tells you what is in the set,
 * not merely that there is one.
 */
export function MessageGallery({ attachments, caption, isMine, clusterPosition }: MessageGalleryProps) {
	// Null rather than a boolean: the viewer opens *at* a picture, and for an
	// album that is always the one on top.
	const [openIndex, setOpenIndex] = useState<number | null>(null);

	// All four corners, always. A caption used to sit under the picture inside
	// one bubble, which squared off the two corners in the middle of it; since
	// pictures lost their bubble the caption is a separate block underneath and
	// there is nothing for the image to butt against.
	const radiusClasses = (isMine ? OUTGOING_ATTACHMENT_RADIUS : INCOMING_ATTACHMENT_RADIUS)[clusterPosition];

	const first = attachments[0];
	if (!first) return null;
	if (first.width === null || first.height === null) return null;

	const size = getAttachmentDisplaySize(first.width, first.height);
	const isAlbum = attachments.length > 1;
	// The pictures drawn behind the top one, furthest last. Fewer than
	// `ALBUM_CARDS_BEHIND` when the set is small, so two photographs never show
	// three cards.
	const behind = attachments.slice(1, 1 + ALBUM_CARDS_BEHIND);

	return (
		<>
			{isAlbum ? (
				// The box is the photograph plus room for the turned corners behind
				// it, so the bubble sizes to the whole fan rather than clipping it.
				<div
					className="relative"
					style={{
						width: ALBUM_SIZE + ALBUM_FAN_REACH + ALBUM_FAN_TRAIL,
						height: ALBUM_SIZE + ALBUM_FAN_REACH + ALBUM_FAN_TRAIL,
					}}
				>
					{/* Furthest first, so each is painted under the one in front. */}
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
						aria-label={`Open album of ${attachments.length} images`}
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
							// Never keyed on: the URL carries a token that is re-minted
							// per read, so it must not be used as an identity.
							src={first.url}
							alt={caption || `Album of ${attachments.length} images`}
							loading="lazy"
							className="size-full object-cover"
						/>
						{/* Mono, like every machine-produced number in this app. */}
						<span className="absolute bottom-2 right-2 inline-flex items-center gap-1 rounded-badge bg-scrim/70 px-1.5 py-0.5">
							<Layers aria-hidden="true" className="size-3 text-on-media" />
							<span className="meta text-on-media">{attachments.length}</span>
						</span>
					</Button>
				</div>
			) : (
				<Button
					variant="ghost"
					onClick={() => setOpenIndex(0)}
					aria-label={caption ? `Open image: ${caption}` : "Open image"}
					className={cn(
						"block cursor-zoom-in overflow-hidden p-0 focus-visible:ring-3 focus-visible:ring-ink/25",
						radiusClasses,
					)}
				>
					<img
						src={first.url}
						alt={caption || "Image"}
						width={size.width}
						height={size.height}
						loading="lazy"
						className={cn("object-cover", radiusClasses)}
					/>
				</Button>
			)}

			{openIndex !== null && (
				<AttachmentLightbox
					attachments={attachments}
					initialIndex={openIndex}
					caption={caption}
					onClose={() => setOpenIndex(null)}
				/>
			)}
		</>
	);
}
