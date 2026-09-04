import { CheckCheck } from "lucide-react";
import type { ParticipantDTO } from "@chatty/shared-types";
import { useState } from "react";
import { Avatar } from "@/components/avatar";
import { Button } from "@/components/button";
import { cn } from "@/utils/cn";
import { EDITED_MESSAGE_LABEL } from "../constants/message";
import type { MessageDeliveryState } from "../types/thread-message";
import type { ReadReceipt } from "../utils/read-receipt";
import { formatMessageTime } from "../utils";
import { MessageDeliveryStatus } from "./message-delivery-status";

interface MessageMetaProps {
	createdAt: string;
	isMine: boolean;
	isGroup: boolean;
	isEdited: boolean;
	/**
	 * Whether the time stays on screen rather than waiting for a hover. True on
	 * the message that ends a burst, and on the one carrying a receipt.
	 */
	isTimeAlwaysVisible: boolean;
	/**
	 * Whether the bubble states its own time. True for a picture, which carries
	 * it in a chip on the image — the gutter is centred on the bubble, so beside
	 * a tall photograph its number would sit level with nothing.
	 */
	hasTimeOnMedia: boolean;
	receipt: ReadReceipt | null;
	participants: ParticipantDTO[];
	deliveryState: MessageDeliveryState | undefined;
	onShowHistory: () => void;
	onRetrySend: () => void;
	onDiscardDraft: () => void;
}

/**
 * The gutter beside a bubble: its time, its edited marker, its read receipt,
 * and — while it is being sent — what is happening to it.
 *
 * Split out of `MessageRow` when that file went over the 300-line limit. It is
 * a real seam rather than a line-count one: everything here is *about* the
 * message rather than part of it, which is the same distinction that put it
 * beside the bubble instead of underneath.
 *
 * The container reserves its width whether or not anything in it is currently
 * shown, and that is the entire trick — revealing a timestamp on hover must not
 * reflow the thread it sits in.
 */
export function MessageMeta({
	createdAt,
	isMine,
	isGroup,
	isEdited,
	isTimeAlwaysVisible,
	hasTimeOnMedia,
	receipt,
	participants,
	deliveryState,
	onShowHistory,
	onRetrySend,
	onDiscardDraft,
}: MessageMetaProps) {
	const [isReaderListOpen, setIsReaderListOpen] = useState(false);
	const readers = receipt
		? receipt.readerIds
				.map((readerId) => participants.find((participant) => participant.id === readerId))
				.filter((participant): participant is ParticipantDTO => Boolean(participant))
		: [];

	return (
		<div
			className={cn(
				"relative flex shrink-0 items-center gap-2",
				"max-sm:absolute max-sm:top-full max-sm:mt-1",
				isMine ? "max-sm:right-0" : "max-sm:left-10",
				(hasTimeOnMedia || (!isTimeAlwaysVisible && !isEdited)) &&
					!deliveryState &&
					!receipt &&
					"max-sm:hidden",
			)}
		>
			{isEdited && (
				<Button
					variant="ghost"
					onClick={onShowHistory}
					className="eyebrow border-b border-dotted border-ink-faint px-0 py-0 text-ink-faint hover:bg-transparent hover:text-ink-soft"
				>
					{EDITED_MESSAGE_LABEL}
				</Button>
			)}

			{/* A message still on its way has no send time to state: the one it
			    carries is this machine's guess, not the server's answer. */}
			{deliveryState ? (
				<MessageDeliveryStatus state={deliveryState} onRetry={onRetrySend} onDiscard={onDiscardDraft} />
			) : hasTimeOnMedia ? null : (
				<span
					className={cn(
						"meta text-ink-faint transition-opacity",
						!isTimeAlwaysVisible && "opacity-0 group-hover:opacity-100 group-focus-within:opacity-100",
					)}
				>
					{formatMessageTime(createdAt)}
				</span>
			)}

			{receipt && !isGroup && (
				<span className="inline-flex items-center gap-1">
					<CheckCheck
						aria-label={isGroup ? `Seen by ${receipt.readerCount}` : "Seen"}
						className="size-3.5 text-signal"
					/>
				</span>
			)}

			{receipt && isGroup && (
				<>
					<Button
						variant="ghost"
						onClick={() => setIsReaderListOpen((current) => !current)}
						aria-label={`Seen by ${receipt.readerCount}`}
						aria-expanded={isReaderListOpen}
						className="-space-x-1.5 px-0 py-0 hover:bg-transparent"
					>
						{readers.slice(0, 3).map((reader) => (
							<Avatar key={reader.id} user={reader} size="xs" className="ring-2 ring-paper" />
						))}
						{readers.length > 3 && <span className="meta pl-2 text-signal">+{readers.length - 3}</span>}
					</Button>
					{isReaderListOpen && (
						<div className="absolute bottom-full right-0 z-30 mb-2 w-48 rounded-control border border-rule bg-paper-raised p-2 shadow-lift">
							<p className="eyebrow px-2 pb-1 text-ink-faint">Seen by</p>
							{readers.map((reader) => (
								<div
									key={reader.id}
									className="flex items-center gap-2 px-2 py-1.5 text-xs text-ink-soft"
								>
									<Avatar user={reader} size="xs" />
									<span className="truncate">{reader.displayName}</span>
								</div>
							))}
						</div>
					)}
				</>
			)}
		</div>
	);
}
