import type { MessageEditDTO } from "@chatty/shared-types";
import { History, X } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { api } from "@/api/client";
import { Button } from "@/components/button";

interface MessageEditHistoryProps {
	conversationId: string;
	messageId: string;
	onClose: () => void;
}

export function MessageEditHistory({ conversationId, messageId, onClose }: MessageEditHistoryProps) {
	const [edits, setEdits] = useState<MessageEditDTO[]>([]);
	const [isLoading, setIsLoading] = useState(true);
	const [error, setError] = useState("");
	const titleId = useId();
	const dialogRef = useRef<HTMLElement>(null);

	useEffect(() => {
		let isCurrent = true;
		setIsLoading(true);
		setError("");
		void api
			.listMessageEdits(conversationId, messageId)
			.then((found) => {
				if (isCurrent) setEdits(found);
			})
			.catch((loadError: Error) => {
				if (isCurrent) setError(loadError.message);
			})
			.finally(() => {
				if (isCurrent) setIsLoading(false);
			});

		return () => {
			isCurrent = false;
		};
	}, [conversationId, messageId]);

	useEffect(() => {
		dialogRef.current?.focus();

		function handleKeyDown(event: KeyboardEvent) {
			if (event.key === "Escape") onClose();
			if (event.key !== "Tab" || !dialogRef.current) return;

			const focusable = dialogRef.current.querySelectorAll<HTMLElement>(
				"button:not([disabled]), [href], input:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])",
			);
			const first = focusable[0];
			const last = focusable[focusable.length - 1];
			if (!first || !last) return;

			if (event.shiftKey && document.activeElement === first) {
				event.preventDefault();
				last.focus();
			} else if (!event.shiftKey && document.activeElement === last) {
				event.preventDefault();
				first.focus();
			}
		}

		document.addEventListener("keydown", handleKeyDown);

		return () => document.removeEventListener("keydown", handleKeyDown);
	}, [onClose]);

	return (
		<div
			className="fixed inset-0 z-50 flex items-center justify-center bg-ink/30 p-4"
			onPointerDown={(event) => {
				if (event.target === event.currentTarget) onClose();
			}}
		>
			<section
				ref={dialogRef}
				role="dialog"
				aria-modal="true"
				aria-labelledby={titleId}
				tabIndex={-1}
				className="max-h-[min(70vh,36rem)] w-full max-w-md overflow-hidden rounded-xl border border-rule bg-paper shadow-[0_40px_80px_-20px_rgba(40,30,20,0.35)] outline-none"
			>
				<header className="flex items-center justify-between border-b border-rule bg-paper-raised px-5 py-4">
					<div className="flex items-center gap-3">
						<span className="flex size-9 items-center justify-center rounded-md border border-rule text-ink-soft">
							<History className="size-4" strokeWidth={1.75} />
						</span>
						<div>
							<h2 id={titleId} className="text-[0.9375rem] font-bold tracking-tight text-ink">
								Edit history
							</h2>
							<p className="eyebrow mt-1 text-ink-faint">Previous versions of this message</p>
						</div>
					</div>
					<Button
						variant="ghost"
						onClick={onClose}
						aria-label="Close edit history"
						className="size-8 rounded-md border border-rule p-0"
					>
						<X className="size-4" strokeWidth={1.75} />
					</Button>
				</header>
				<div className="max-h-[calc(min(70vh,36rem)-4.5rem)] overflow-y-auto p-4">
					{isLoading && <p className="eyebrow py-8 text-center text-ink-faint">Loading edit history…</p>}
					{error && (
						<p className="eyebrow rounded-md border border-signal/30 bg-signal-soft p-3 text-signal">
							{error}
						</p>
					)}
					{!isLoading && !error && edits.length === 0 && (
						<p className="eyebrow py-8 text-center text-ink-faint">No previous versions.</p>
					)}
					{!isLoading && !error && edits.length > 0 && (
						<ul className="space-y-3">
							{edits.map((edit) => (
								<li key={edit.id} className="rounded-md border border-rule bg-paper-raised p-3.5">
									<p className="whitespace-pre-wrap wrap-break-word text-sm text-ink">
										{edit.content || "No caption"}
									</p>
									<time className="meta mt-2 block text-ink-faint">
										{new Date(edit.editedAt).toLocaleString()}
									</time>
								</li>
							))}
						</ul>
					)}
				</div>
			</section>
		</div>
	);
}
