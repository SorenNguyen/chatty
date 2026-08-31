import { useCallback } from "react";
import { Button } from "@/components/button";
import { useDialog } from "@/hooks/use-dialog";

interface ConfirmDialogProps {
	title: string;
	/** What will happen, in a sentence. Say the consequence, not the mechanism. */
	body: string;
	/** Names the action rather than agreeing — "Remove", not "OK". */
	confirmLabel: string;
	onConfirm: () => void;
	onCancel: () => void;
}

/**
 * Asks before something that cannot be taken back.
 *
 * The app went without one for a long time on the stated grounds that nothing
 * else had one, which was true and was the wrong test: the reason to confirm is
 * that the action is irreversible, and removing somebody from a group, leaving
 * one, and deleting a message for everybody all are. What kept it out was the
 * absence of a dialog primitive; `use-dialog` is that primitive, and it already
 * carries Escape, the focus trap and focus-on-open.
 *
 * The confirm button is `danger`, which is outlined rather than filled for the
 * reason recorded in `Button`: a solid red block invites the click this dialog
 * exists to slow down. Cancel is the first control in the DOM, so the focus
 * trap's opening move is the harmless one.
 */
export function ConfirmDialog({ title, body, confirmLabel, onConfirm, onCancel }: ConfirmDialogProps) {
	// `useDialog` re-binds its listener whenever this identity changes, and the
	// caller usually passes an inline arrow.
	const handleCancel = useCallback(() => onCancel(), [onCancel]);
	const dialogRef = useDialog<HTMLDivElement>(handleCancel);

	return (
		<div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/20 px-4">
			<div
				ref={dialogRef}
				role="dialog"
				aria-modal="true"
				aria-label={title}
				tabIndex={-1}
				className="flex w-full max-w-[380px] flex-col gap-4 rounded-bubble border border-rule bg-paper-raised p-5 outline-none"
			>
				<div className="flex flex-col gap-1.5">
					<h2 className="font-display text-[19px] leading-tight tracking-tight">{title}</h2>
					<p className="text-[13px] text-ink-soft">{body}</p>
				</div>

				<div className="flex justify-end gap-2">
					<Button variant="ghost" onClick={handleCancel}>
						Cancel
					</Button>
					<Button variant="danger" onClick={onConfirm}>
						{confirmLabel}
					</Button>
				</div>
			</div>
		</div>
	);
}
