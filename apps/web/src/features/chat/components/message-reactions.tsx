import type { ReactionDTO, ReactionEmoji, UserDTO } from "@chatty/shared-types";
import { Button } from "@/components/button";
import { cn } from "@/utils/cn";
import { REACTION_CHIP_LIMIT } from "../constants/reactions";
import { getReactionSummary } from "../utils";

interface MessageReactionsProps {
	reactions: ReactionDTO[];
	currentUserId: string;
	users: UserDTO[];
	/** Which side the bubble sits on — the chips hang off its inner corner. */
	isMine: boolean;
	onToggle: (emoji: ReactionEmoji) => void;
	/** Opens the reactor list. Reached from the overflow chip and from the actions menu. */
	onShowDetails: () => void;
}

/**
 * The chips a message wears, straddling its bottom edge.
 *
 * **Half on the bubble and half on the page**, which is the arrangement
 * Messenger and Instagram both use and the single biggest thing this component
 * used to get wrong: it hung the chips 18px clear of the bubble, so they read as
 * something that had fallen off it rather than as a sticker put on it. `top-full`
 * puts the group's top edge on the bubble's bottom edge and `-translate-y-1/2`
 * lifts it by half its own height, so the overlap is exact at any chip size and
 * the row below only has to reserve the half that hangs.
 *
 * The chips sit at the bubble's *inner* corner — bottom-right of an incoming
 * message, bottom-left of one you sent. Two reasons, and neither is symmetry:
 * they stay off the window edge on a narrow screen, and they land nearer the
 * middle of the thread, which is where the eye already is.
 *
 * Each chip carries `ring-2 ring-paper`, and that ring is what makes the slight
 * overlap between them legible: it cuts a page-coloured gap out of the chip
 * behind, so two chips read as two objects instead of one blurred pill. Against
 * the bubble's own fill the same ring reads as a halo, which is exactly what it
 * looks like in the apps this is modelled on.
 *
 * Past three distinct emoji the rest collapse into one `+N`, which opens the
 * reactor list rather than toggling anything. An open emoji set has no ceiling
 * on how many chips a group can produce, and the bubble does.
 */
export function MessageReactions({
	reactions,
	currentUserId,
	users,
	isMine,
	onToggle,
	onShowDetails,
}: MessageReactionsProps) {
	const visible = reactions.slice(0, REACTION_CHIP_LIMIT);
	const hiddenCount = reactions.length - visible.length;

	return (
		<div
			role="group"
			aria-label={isMine ? "Reactions to your message" : "Reactions to received message"}
			className={cn(
				"absolute top-full z-10 flex -translate-y-1/2 items-center -space-x-1",
				isMine ? "left-2.5" : "right-2.5",
			)}
		>
			{visible.map((reaction) => {
				const isReacted = reaction.userIds.includes(currentUserId);
				const count = reaction.userIds.length;

				return (
					<Button
						key={reaction.emoji}
						variant="ghost"
						onClick={() => onToggle(reaction.emoji)}
						aria-pressed={isReacted}
						aria-label={`${reaction.emoji}, ${count}`}
						title={getReactionSummary(reaction, users, currentUserId)}
						className={cn(
							"h-[22px] rounded-full py-0 ring-2 ring-paper transition",
							"shadow-reaction hover:-translate-y-px",
							count > 1 ? "gap-1 px-1.5" : "size-[22px] p-0",
							// Yours is filled rather than tinted. The palette spends its
							// one colour on unread counts and things you cannot undo, and
							// a reaction is neither — so "mine" is said with the ink block
							// the app already uses for a message you sent.
							isReacted
								? "bg-block text-block-ink hover:bg-block"
								: "border border-rule bg-paper-raised text-ink hover:bg-paper-raised",
						)}
					>
						<span aria-hidden="true" className="text-[13px] leading-none">
							{reaction.emoji}
						</span>
						{count > 1 && <span className="meta">{count}</span>}
					</Button>
				);
			})}

			{hiddenCount > 0 && (
				<Button
					variant="ghost"
					onClick={onShowDetails}
					aria-label={`${hiddenCount} more reactions. Show everyone who reacted`}
					className={cn(
						"h-[22px] gap-1 rounded-full border border-rule bg-paper-raised px-1.5 py-0",
						"text-ink-soft ring-2 ring-paper shadow-reaction transition",
						"hover:-translate-y-px hover:bg-paper-raised hover:text-ink",
					)}
				>
					<span className="meta">+{hiddenCount}</span>
				</Button>
			)}
		</div>
	);
}
