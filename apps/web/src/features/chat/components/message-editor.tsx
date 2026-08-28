import { useState } from "react";
import { Button } from "@/components/button";

interface MessageEditorProps {
	initialContent: string;
	/** Whether the message has an image, which is what lets the text be cleared. */
	hasAttachment: boolean;
	onSave: (content: string) => void;
	onCancel: () => void;
}

/**
 * The bubble, turned into a field, while its author rewrites it.
 *
 * Editing happens in place rather than in the composer at the bottom. The
 * composer is where a *new* message is written, and borrowing it would mean the
 * message being changed scrolls out of sight behind the thing changing it.
 *
 * The save rule mirrors the server's, so the button is disabled rather than the
 * request refused: a message has to be something, and clearing the text is only
 * allowed when a picture is left to stand on its own.
 */
export function MessageEditor({ initialContent, hasAttachment, onSave, onCancel }: MessageEditorProps) {
	const [draft, setDraft] = useState(initialContent);

	const trimmed = draft.trim();
	const canSave = (Boolean(trimmed) || hasAttachment) && trimmed !== initialContent;

	function handleKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
		// Enter saves and Shift+Enter breaks the line, matching what people expect
		// from the composer. Escape abandons the edit, which is the only way out
		// that does not involve finding a small button with the mouse.
		if (event.key === "Enter" && !event.shiftKey) {
			event.preventDefault();
			if (canSave) onSave(trimmed);
		}

		if (event.key === "Escape") onCancel();
	}

	return (
		<div className="flex flex-col gap-1.5">
			<textarea
				value={draft}
				onChange={(event) => setDraft(event.target.value)}
				onKeyDown={handleKeyDown}
				aria-label="Edit message"
				autoFocus
				rows={2}
				className="w-64 resize-none rounded-lg border border-slate-300 px-2 py-1 text-sm text-slate-900 outline-none focus:border-blue-500"
			/>

			<div className="flex items-center gap-1">
				<Button onClick={() => onSave(trimmed)} disabled={!canSave} className="px-2 py-1 text-xs">
					Save
				</Button>
				<Button variant="ghost" onClick={onCancel} className="px-2 py-1 text-xs">
					Cancel
				</Button>
			</div>
		</div>
	);
}
