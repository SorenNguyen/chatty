import { useState } from "react";
import { Check, Pencil, Trash2, X } from "lucide-react";
import { Button } from "@/components/button";

interface MessageActionsProps {
	onEdit: () => void;
	onDelete: () => void;
}

/**
 * Edit and delete, for a message you wrote.
 *
 * Delete asks twice, and it is the only destructive action in the app that
 * does. Removing someone from a group is one click because it is undoable —
 * invite them back. A deleted message is gone: the server empties the row and
 * removes the image file, so a misclick here cannot be walked back by anyone,
 * including whoever runs the database.
 *
 * The confirmation is inline rather than a `window.confirm` or a modal. This
 * app has no dialog primitive declared in its conventions, and `GroupMembersPanel`
 * already established that the answer to that is to render in place rather than
 * to invent one.
 */
export function MessageActions({ onEdit, onDelete }: MessageActionsProps) {
	const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);

	if (isConfirmingDelete) {
		return (
			<div className="flex items-center gap-1">
				<span className="text-[10px] text-slate-500">Delete?</span>
				<Button
					variant="ghost"
					onClick={onDelete}
					aria-label="Confirm delete"
					className="px-1 py-1 text-red-600 hover:bg-red-50"
				>
					<Check className="size-3.5" />
				</Button>
				<Button
					variant="ghost"
					onClick={() => setIsConfirmingDelete(false)}
					aria-label="Keep message"
					className="px-1 py-1"
				>
					<X className="size-3.5" />
				</Button>
			</div>
		);
	}

	return (
		// Revealed on hover *and* on keyboard focus. `group-hover` alone would put
		// these behind a pointer, which is the whole feature unreachable from a
		// keyboard — `focus-within` is what keeps tabbing to them working.
		<div className="flex items-center gap-1 opacity-0 transition group-hover:opacity-100 focus-within:opacity-100">
			<Button variant="ghost" onClick={onEdit} aria-label="Edit message" className="px-1 py-1">
				<Pencil className="size-3.5" />
			</Button>
			<Button
				variant="ghost"
				onClick={() => setIsConfirmingDelete(true)}
				aria-label="Delete message"
				className="px-1 py-1"
			>
				<Trash2 className="size-3.5" />
			</Button>
		</div>
	);
}
