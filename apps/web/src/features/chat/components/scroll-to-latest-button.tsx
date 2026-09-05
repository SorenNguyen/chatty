import { ArrowDown } from "lucide-react";
import { Button } from "@/components/button";

interface ScrollToLatestButtonProps {
	/**
	 * Messages below the fold, badged on the button. Zero renders no badge —
	 * the arrow still has a job when the reader is simply scrolled up.
	 */
	unreadCount: number;
	onClick: () => void;
}

/**
 * The floating arrow that takes a reader who has scrolled up back to the bottom.
 *
 * A component rather than a fragment inside `MessageList` because it is the one
 * thing in that file which is not part of the scrolling thread — it sits over
 * it, positioned against the pane rather than the message flow.
 */
export function ScrollToLatestButton({ unreadCount, onClick }: ScrollToLatestButtonProps) {
	return (
		<Button
			aria-label="Jump to latest messages"
			onClick={onClick}
			className="absolute bottom-4 right-4 z-20 size-10 rounded-full p-0 shadow-lift"
		>
			<ArrowDown className="size-4" />
			{unreadCount > 0 && (
				<span className="absolute -right-1 -top-1 min-w-5 rounded-badge bg-signal px-1 text-[10px] text-paper">
					{unreadCount > 99 ? "99+" : unreadCount}
				</span>
			)}
		</Button>
	);
}
