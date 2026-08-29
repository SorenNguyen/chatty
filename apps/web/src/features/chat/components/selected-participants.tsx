import type { UserDTO } from "@chatty/shared-types";
import { X } from "lucide-react";
import { Button } from "@/components/button";

interface SelectedParticipantsProps {
	participants: UserDTO[];
	onRemove: (userId: string) => void;
}

export function SelectedParticipants({ participants, onRemove }: SelectedParticipantsProps) {
	if (participants.length === 0) return null;

	return (
		<ul className="mt-3 flex flex-wrap gap-1.5">
			{participants.map((participant) => (
				<li key={participant.id}>
					<Button
						variant="ghost"
						onClick={() => onRemove(participant.id)}
						aria-label={`Remove ${participant.displayName}`}
						// A chip, not a centred action button.
						className="gap-1.5 rounded-control border border-rule bg-paper px-2.5 py-1 text-xs text-ink-soft hover:bg-ink/5"
					>
						{participant.displayName}
						<X className="size-3" />
					</Button>
				</li>
			))}
		</ul>
	);
}
