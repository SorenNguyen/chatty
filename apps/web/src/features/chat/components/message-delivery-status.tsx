import { Button } from "@/components/button";
import type { MessageDeliveryState } from "../types/thread-message";

interface MessageDeliveryStatusProps {
	state: MessageDeliveryState;
	onRetry: () => void;
	onDiscard: () => void;
}

/**
 * What the gutter says about a message that has not reached the server yet.
 *
 * It replaces the timestamp rather than joining it, because a message that is
 * still on its way has no send time to state — the one the draft carries is
 * this machine's guess, and printing it would claim something the server has
 * not agreed to.
 *
 * "Not sent" is the app's one colour, which is the rule rather than an
 * exception: `--signal` marks unread counts, the open conversation, and things
 * you cannot undo. A message the recipient never got is squarely the third.
 */
export function MessageDeliveryStatus({ state, onRetry, onDiscard }: MessageDeliveryStatusProps) {
	if (state === "pending") return <span className="meta text-ink-faint">Sending…</span>;

	return (
		<span className="inline-flex items-center gap-1.5">
			<span className="meta text-signal">Not sent</span>
			<Button
				variant="ghost"
				onClick={onRetry}
				className="eyebrow border-b border-dotted border-ink-faint px-0 py-0 text-ink-soft hover:bg-transparent hover:text-ink"
			>
				Try again
			</Button>
			<Button
				variant="ghost"
				onClick={onDiscard}
				className="eyebrow border-b border-dotted border-ink-faint px-0 py-0 text-ink-faint hover:bg-transparent hover:text-ink"
			>
				Discard
			</Button>
		</span>
	);
}
