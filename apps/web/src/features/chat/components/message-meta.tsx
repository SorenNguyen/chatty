import { CheckCheck } from "lucide-react";
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
	receipt: ReadReceipt | null;
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
	receipt,
	deliveryState,
	onShowHistory,
	onRetrySend,
	onDiscardDraft,
}: MessageMetaProps) {
	return (
		<div
			className={cn(
				"flex shrink-0 items-center gap-2",
				"max-sm:absolute max-sm:top-full max-sm:mt-1",
				isMine ? "max-sm:right-0" : "max-sm:left-10",
				!isTimeAlwaysVisible && !isEdited && !deliveryState && "max-sm:hidden",
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
			) : (
				<span
					className={cn(
						"meta text-ink-faint transition-opacity",
						!isTimeAlwaysVisible && "opacity-0 group-hover:opacity-100",
					)}
				>
					{formatMessageTime(createdAt)}
				</span>
			)}

			{receipt && (
				<span className="inline-flex items-center gap-1">
					<CheckCheck
						aria-label={isGroup ? `Seen by ${receipt.readerCount}` : "Seen"}
						className="size-3.5 text-signal"
					/>
					{isGroup && <span className="meta text-signal">{receipt.readerCount}</span>}
				</span>
			)}
		</div>
	);
}
