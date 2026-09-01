import type { ParticipantDTO } from "@chatty/shared-types";
import { Button } from "@/components/button";

interface ComposerMentionSuggestionsProps {
	participants: ParticipantDTO[];
	onPick: (participant: ParticipantDTO) => void;
}

export function ComposerMentionSuggestions({ participants, onPick }: ComposerMentionSuggestionsProps) {
	if (participants.length === 0) return null;

	return (
		<div className="mx-3 mb-2 overflow-hidden rounded-control border border-rule bg-paper-raised shadow-lift">
			{participants.map((participant) => (
				<Button
					key={participant.id}
					variant="ghost"
					onClick={() => onPick(participant)}
					className="w-full justify-start rounded-none px-3 py-2 text-left"
				>
					<span className="font-semibold">{participant.displayName}</span>
					<span className="text-ink-faint">@{participant.handle}</span>
				</Button>
			))}
		</div>
	);
}
