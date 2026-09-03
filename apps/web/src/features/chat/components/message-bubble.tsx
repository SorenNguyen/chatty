import { cn } from "@/utils/cn";
import { ALBUM_FAN_REACH, ALBUM_FAN_TRAIL, ALBUM_SIZE, STICKER_DISPLAY_SIZE } from "../constants/attachment";
import { INCOMING_BUBBLE_RADIUS, OUTGOING_BUBBLE_RADIUS } from "../constants/message-cluster";
import type { ClusterPosition } from "../types/message-cluster";
import type { ThreadMessage } from "../types/thread-message";
import { getAttachmentDisplaySize } from "../utils/attachment-size";
import { formatMessageTime } from "../utils/format-time";
import { MessageGallery } from "./message-gallery";
import { MessageFileCard } from "./message-file-card";
import { MessageReplyQuote } from "./message-reply-quote";
import { MessageText } from "./message-text";
import { VoicePlayer } from "./voice-player";
import type { ParticipantDTO } from "@chatty/shared-types";

interface MessageBubbleProps {
	message: ThreadMessage;
	isMine: boolean;
	clusterPosition: ClusterPosition;
	/**
	 * How many emoji this message is, when it is *only* emoji — zero otherwise.
	 * Decided by the row, which is where the conditions that disqualify a message
	 * (a reply, a picture, a tombstone) are already known.
	 */
	jumboCount: number;
	onJumpToReplyOriginal: () => void;
	participants: ParticipantDTO[];
}

/**
 * What a message that still stands looks like: its quote, its pictures, its
 * words, and the shape around them.
 *
 * Split out of `MessageRow` when that file went over the 300-line limit. The
 * row keeps everything *about* the message — the avatar, the byline, the run
 * position, the gutter, the actions — and this holds the one thing that is the
 * message.
 *
 * **A message that is nothing but a few emoji gets no bubble at all**: no fill,
 * no border, no radius, and type several times the size. At bubble size an
 * emoji reads as a typo, and the bubble is chrome around content that does not
 * need explaining. Every messenger worth using does this, and it is how emoji
 * are given prominence here without spending the app's one colour — see the
 * note in `EmojiPicker` about why the reactions did not follow.
 */
export function MessageBubble({
	message,
	isMine,
	clusterPosition,
	jumboCount,
	onJumpToReplyOriginal,
	participants,
}: MessageBubbleProps) {
	const images = message.attachments.filter((attachment) => attachment.kind === "image");
	const file = message.attachments.find((attachment) => attachment.kind === "file");
	const voice = message.attachments.find((attachment) => attachment.kind === "audio");
	const hasImages = images.length > 0;
	const sticker = message.isSticker ? images[0] : undefined;

	// A sticker gets no bubble, for the same reason a message of pure emoji does
	// not: the picture *is* the message, and a fill around it is chrome around
	// content that needs no explaining. Drawn at a fixed size rather than its own
	// — a tray of mixed shapes would otherwise make every sticker a different
	// size in the thread.
	if (sticker) {
		return (
			<img
				src={sticker.url}
				alt="Sticker"
				loading="lazy"
				width={STICKER_DISPLAY_SIZE}
				height={STICKER_DISPLAY_SIZE}
				className="object-contain"
			/>
		);
	}

	// Pictures get no bubble either, and for the same reason the sticker above
	// does not: a photograph is already a rectangle of somebody else's content,
	// and a fill around it is a second frame that the picture did not ask for.
	// The ink one was worse than most — a dark border around every photograph
	// somebody sent, which is the opposite of the "ink on paper" the fill exists
	// to carry everywhere else.
	//
	// A caption still keeps the fill that says whose the words are — but it is
	// **attached** to the picture rather than floating under it. It had become a
	// narrow pill in its own box, a gap below a photograph and pulled to the
	// tail edge, which reads as a second message sent after the picture instead
	// of as the picture's caption. Flush, the same width, and sharing the run's
	// corners, the two are one object; the fill still never surrounds the
	// photograph, which is the whole of what phase 29 was protecting.
	//
	// The width is the picture's, taken from the same pure function the gallery
	// sizes itself with, so a long caption wraps inside the photograph's width
	// rather than making the block wider than the thing it describes.
	if (hasImages) {
		const single = images.length === 1 ? images[0] : undefined;
		// An album's caption attaches too. It cannot share an *edge* with a fan of
		// rotated cards, so the stack sits on the caption rather than being welded
		// to it — but it is the same width, with no gap and the same squared join,
		// which is what stops one message reading as two.
		const attachedWidth = single
			? single.width !== null && single.height !== null
				? getAttachmentDisplaySize(single.width, single.height).width
				: undefined
			: ALBUM_SIZE + ALBUM_FAN_REACH + ALBUM_FAN_TRAIL;

		return (
			<div className={cn("flex min-w-0 flex-col gap-1.5", isMine ? "items-end" : "items-start")}>
				{message.isForwarded && <span className="eyebrow text-ink-faint">Forwarded</span>}
				{message.replyTo && (
					<MessageReplyQuote
						replyTo={message.replyTo}
						isMine={isMine}
						onJumpToOriginal={onJumpToReplyOriginal}
					/>
				)}

				{/* No gap: the caption meets the picture's squared edge. */}
				<div
					className="flex min-w-0 max-w-full flex-col"
					style={attachedWidth ? { width: attachedWidth } : undefined}
				>
					<MessageGallery
						attachments={images}
						caption={message.content}
						isMine={isMine}
						clusterPosition={clusterPosition}
						// Withheld while the message is still on its way: the time it
						// carries then is this machine's guess, and the gutter is saying
						// "Sending…" rather than a number.
						{...(message.deliveryState ? {} : { timeLabel: formatMessageTime(message.createdAt) })}
					/>

					{message.content && (
						<MessageText
							content={message.content}
							mentionedUserIds={message.mentionedUserIds}
							participants={participants}
							className={cn(
								"min-w-0 whitespace-pre-wrap px-3.5 py-2 text-sm/[1.55] wrap-break-word",
								isMine ? "bg-block text-block-ink" : "border border-rule bg-paper-raised text-ink",
								(isMine ? OUTGOING_BUBBLE_RADIUS : INCOMING_BUBBLE_RADIUS)[clusterPosition],
								// Only when it is actually attached to something. An album
								// keeps a caption of its own shape, rounded all round.
								attachedWidth && "rounded-t-none",
							)}
						/>
					)}
				</div>
			</div>
		);
	}

	if (file || voice) {
		return (
			<div className={cn("flex min-w-0 flex-col gap-1.5", isMine ? "items-end" : "items-start")}>
				{message.isForwarded && <span className="eyebrow text-ink-faint">Forwarded</span>}
				{message.replyTo && (
					<MessageReplyQuote
						replyTo={message.replyTo}
						isMine={isMine}
						onJumpToOriginal={onJumpToReplyOriginal}
					/>
				)}
				{file ? <MessageFileCard attachment={file} /> : voice ? <VoicePlayer attachment={voice} /> : null}
				{message.content && (
					<MessageText
						content={message.content}
						mentionedUserIds={message.mentionedUserIds}
						participants={participants}
						className="max-w-80 whitespace-pre-wrap text-sm/[1.55] wrap-break-word"
					/>
				)}
			</div>
		);
	}

	return (
		<div
			className={cn(
				"min-w-0 text-sm/[1.55]",
				jumboCount > 0
					? "bg-transparent px-1 py-0.5"
					: cn(
							isMine ? "bg-block text-block-ink" : "border border-rule bg-paper-raised text-ink",
							(isMine ? OUTGOING_BUBBLE_RADIUS : INCOMING_BUBBLE_RADIUS)[clusterPosition],
							"px-3.5 py-2",
						),
			)}
		>
			{message.isForwarded && <span className="eyebrow mb-1 block opacity-65">Forwarded</span>}
			{message.replyTo && (
				<MessageReplyQuote replyTo={message.replyTo} isMine={isMine} onJumpToOriginal={onJumpToReplyOriginal} />
			)}

			{message.content && (
				<MessageText
					content={message.content}
					mentionedUserIds={message.mentionedUserIds}
					participants={participants}
					className={cn(
						"whitespace-pre-wrap wrap-break-word",
						// Smaller as the count grows, so three still fit the column a
						// bubble would have occupied.
						jumboCount === 1 && "text-[44px] leading-[1.15]",
						jumboCount === 2 && "text-[38px] leading-[1.15]",
						jumboCount === 3 && "text-[32px] leading-[1.15]",
					)}
				/>
			)}
		</div>
	);
}
