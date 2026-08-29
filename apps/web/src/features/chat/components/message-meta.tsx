import { Button } from "@/components/button";
import { cn } from "@/utils/cn";
import { EDITED_MESSAGE_LABEL } from "../constants/message";
import { formatMessageTime } from "../utils";

interface MessageMetaProps {
	createdAt: string;
	/** When the author last rewrote it, or null if they never did. */
	editedAt: string | null;
	isDeleted: boolean;
	isMine: boolean;
	onOpenHistory: () => void;
}

/**
 * The line under a message saying when it was sent and whether it changed.
 *
 * Outside the bubble rather than inside it. A timestamp is not part of what was
 * said, and setting it on the ink fill meant inventing a second, washed-out
 * colour that exists nowhere else in the palette just to hold it.
 *
 * "Edited" is a marker, not "edited at 14:12": the useful fact is that what you
 * are reading is not what was sent, and a second timestamp beside the first
 * mostly asks which is which. The dotted underline is the affordance — it reads
 * as something openable, which it is.
 */
export function MessageMeta({ createdAt, editedAt, isDeleted, isMine, onOpenHistory }: MessageMetaProps) {
	return (
		<p className={cn("flex items-center gap-2", isMine ? "justify-end" : "justify-start")}>
			{editedAt && !isDeleted && (
				<Button
					variant="ghost"
					onClick={onOpenHistory}
					className="eyebrow h-auto rounded-none border-b border-dotted border-ink-faint p-0 text-ink-faint hover:border-ink hover:bg-transparent hover:text-ink"
				>
					{EDITED_MESSAGE_LABEL}
				</Button>
			)}
			<span className="meta text-ink-faint">{formatMessageTime(createdAt)}</span>
		</p>
	);
}
