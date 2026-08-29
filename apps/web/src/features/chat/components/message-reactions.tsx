import type { ReactionDTO, ReactionKind, UserDTO } from "@chatty/shared-types";
import { Button } from "@/components/button";
import { cn } from "@/utils/cn";
import { REACTION_BY_KIND } from "../constants/reactions";
import { getReactionSummary } from "../utils";

interface MessageReactionsProps {
	reactions: ReactionDTO[];
	currentUserId: string;
	users: UserDTO[];
	/** Which side the bubble sits on — the chips hang off its far edge. */
	isMine: boolean;
	onToggle: (kind: ReactionKind) => void;
}

/**
 * The chips hanging off the bottom of a bubble.
 *
 * Positioned absolutely against the bubble and overlapping it by exactly half
 * their height, so a chip is unmistakably *cut* by the message it belongs to
 * rather than floating between that message and the next one — which is the only
 * thing that keeps it unambiguous inside a run stacked at 3px.
 *
 * They hang off the edge *away* from the tail, and that is the whole reason the
 * geometry works: the tail side already carries the seams and the notch, so a
 * chip there would sit on top of the one corner that says where a turn ends. The
 * far side is fully rounded for the height of the run and has nothing on it.
 *
 * The row this sits in is `relative` and the chips are out of flow, so a message
 * gaining its first reaction never reflows the thread — `MessageRow` opens the
 * clearance underneath instead.
 */
export function MessageReactions({ reactions, currentUserId, users, isMine, onToggle }: MessageReactionsProps) {
	return (
		<div className={cn("absolute -bottom-2.5 flex items-center gap-1", isMine ? "left-2.5" : "right-2.5")}>
			{reactions.map((reaction) => {
				const option = REACTION_BY_KIND[reaction.kind];
				const isReacted = reaction.userIds.includes(currentUserId);
				const summary = getReactionSummary(reaction, users, currentUserId, option.label);

				return (
					<Button
						key={reaction.kind}
						variant="ghost"
						onClick={() => onToggle(reaction.kind)}
						aria-pressed={isReacted}
						aria-label={`${option.label}, ${reaction.userIds.length}`}
						title={summary}
						className={cn(
							"h-[22px] gap-1.5 rounded-control border px-1.5 py-0",
							// A 2px ring of the page colour is what punches the chip out of
							// the bubble behind it. Without it the border dies into the ink
							// fill and the chip reads as a hole rather than as an object.
							"ring-2 ring-paper",
							isReacted
								? "border-signal bg-signal-soft text-signal hover:bg-signal-soft"
								: "border-rule bg-paper-raised text-ink-soft hover:bg-paper-sunken hover:text-ink",
						)}
					>
						<option.Icon aria-hidden="true" className={cn("size-3", isReacted && "fill-current")} />
						<span className="meta">{reaction.userIds.length}</span>
					</Button>
				);
			})}
		</div>
	);
}
