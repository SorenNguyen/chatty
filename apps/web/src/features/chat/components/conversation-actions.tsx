import type { ConversationDTO } from "@chatty/shared-types";
import { Archive, ArrowLeft, BellOff, Check, Clock, MoreHorizontal, Pin } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { api } from "@/api/client";
import { Button } from "@/components/button";
import { cn } from "@/utils/cn";
import { CONVERSATION_MUTE_OPTIONS } from "../constants/conversation-actions";

interface ConversationActionsProps {
	conversation: ConversationDTO;
}

export function ConversationActions({ conversation }: ConversationActionsProps) {
	const [isOpen, setIsOpen] = useState(false);
	const [isChoosingMute, setIsChoosingMute] = useState(false);
	const [isSaving, setIsSaving] = useState(false);
	const [error, setError] = useState("");
	const rootRef = useRef<HTMLDivElement>(null);
	const menuRef = useRef<HTMLDivElement>(null);
	const [menuPosition, setMenuPosition] = useState({ left: 8, top: 8 });
	const isMuted = Boolean(conversation.mutedUntil && Date.parse(conversation.mutedUntil) > Date.now());

	useEffect(() => {
		if (!isOpen) return;
		const focusFrame = window.requestAnimationFrame(() => {
			menuRef.current?.querySelector<HTMLButtonElement>("[role='menuitem']")?.focus();
		});

		function closeFromOutside(event: PointerEvent) {
			if (!rootRef.current?.contains(event.target as Node) && !menuRef.current?.contains(event.target as Node))
				close();
		}
		function closeFromKeyboard(event: KeyboardEvent) {
			if (event.key === "Escape") {
				close();
				rootRef.current?.querySelector<HTMLButtonElement>("[aria-haspopup='menu']")?.focus();

				return;
			}

			if (!menuRef.current || !["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
			const items = [...menuRef.current.querySelectorAll<HTMLButtonElement>("[role='menuitem']")];
			if (items.length === 0) return;
			event.preventDefault();
			const currentIndex = items.findIndex((item) => item === document.activeElement);
			if (event.key === "Home") items[0]?.focus();
			else if (event.key === "End") items[items.length - 1]?.focus();
			else if (event.key === "ArrowDown") items[(currentIndex + 1 + items.length) % items.length]?.focus();
			else items[(currentIndex - 1 + items.length) % items.length]?.focus();
		}
		document.addEventListener("pointerdown", closeFromOutside);
		document.addEventListener("keydown", closeFromKeyboard);

		return () => {
			window.cancelAnimationFrame(focusFrame);
			document.removeEventListener("pointerdown", closeFromOutside);
			document.removeEventListener("keydown", closeFromKeyboard);
		};
	}, [isOpen, isChoosingMute]);

	useLayoutEffect(() => {
		if (!isOpen || !rootRef.current || !menuRef.current) return;
		const trigger = rootRef.current.querySelector("button");
		if (!trigger) return;
		const triggerBounds = trigger.getBoundingClientRect();
		const menuBounds = menuRef.current.getBoundingClientRect();
		const gap = 8;
		setMenuPosition({
			left: Math.max(
				gap,
				Math.min(window.innerWidth - menuBounds.width - gap, triggerBounds.right - menuBounds.width),
			),
			top:
				triggerBounds.bottom + gap + menuBounds.height <= window.innerHeight
					? triggerBounds.bottom + gap
					: Math.max(gap, triggerBounds.top - menuBounds.height - gap),
		});
	}, [error, isChoosingMute, isOpen]);

	function close(): void {
		setIsOpen(false);
		setIsChoosingMute(false);
		setError("");
	}

	async function update(action: () => Promise<unknown>): Promise<void> {
		setIsSaving(true);
		setError("");
		try {
			await action();
			close();
		} catch (caught) {
			setError(caught instanceof Error ? caught.message : "Could not update conversation");
		} finally {
			setIsSaving(false);
		}
	}

	function muteFor(milliseconds: number | null): void {
		const until =
			milliseconds === null ? "9999-12-31T23:59:59.999Z" : new Date(Date.now() + milliseconds).toISOString();
		void update(() => api.setConversationMuted(conversation.id, until));
	}

	return (
		<div ref={rootRef} className="absolute right-3 top-1/2 z-20 -translate-y-1/2">
			<Button
				variant="ghost"
				onClick={() => {
					const nextIsOpen = !isOpen;
					setIsOpen(nextIsOpen);
					setIsChoosingMute(false);
				}}
				aria-label="Conversation actions"
				aria-haspopup="menu"
				aria-expanded={isOpen}
				className={cn(
					"size-7 rounded-full p-0 text-ink-faint opacity-0 transition-opacity",
					"group-hover:opacity-100 group-focus-within:opacity-100 max-md:opacity-70",
					isOpen && "bg-paper-raised text-ink opacity-100 shadow-sm",
				)}
			>
				<MoreHorizontal className="size-4" />
			</Button>

			{isOpen &&
				createPortal(
					<div
						ref={menuRef}
						role="menu"
						aria-label="Conversation actions"
						style={menuPosition}
						className="fixed z-50 w-52 overflow-hidden rounded-panel border border-rule bg-paper-raised p-1.5 shadow-lift"
					>
						{isChoosingMute ? (
							<>
								<Button
									variant="ghost"
									role="menuitem"
									onClick={() => setIsChoosingMute(false)}
									className="w-full justify-start px-2.5 py-2 text-ink-faint"
								>
									<ArrowLeft className="size-4" />
									Mute duration
								</Button>
								{isMuted && (
									<Button
										variant="ghost"
										role="menuitem"
										disabled={isSaving}
										onClick={() =>
											void update(() => api.setConversationMuted(conversation.id, null))
										}
										className="w-full justify-start px-2.5 py-2 text-ink"
									>
										<Check className="size-4 text-live" />
										Unmute
									</Button>
								)}
								{CONVERSATION_MUTE_OPTIONS.map((option) => (
									<Button
										key={option.label}
										variant="ghost"
										role="menuitem"
										disabled={isSaving}
										onClick={() => muteFor(option.milliseconds)}
										className="w-full justify-start px-2.5 py-2 text-ink"
									>
										<Clock className="size-4 text-ink-faint" />
										{option.label}
									</Button>
								))}
							</>
						) : (
							<>
								<Button
									variant="ghost"
									role="menuitem"
									disabled={isSaving}
									onClick={() =>
										void update(() =>
											api.setConversationPinned(conversation.id, !conversation.isPinned),
										)
									}
									className="w-full justify-start px-2.5 py-2 text-ink"
								>
									<Pin
										className={cn("size-4", conversation.isPinned && "fill-current text-signal")}
									/>
									{conversation.isPinned ? "Unpin" : "Pin conversation"}
								</Button>
								<Button
									variant="ghost"
									role="menuitem"
									disabled={isSaving}
									onClick={() =>
										void update(() =>
											api.setConversationArchived(conversation.id, !conversation.isArchived),
										)
									}
									className="w-full justify-start px-2.5 py-2 text-ink"
								>
									<Archive className="size-4 text-ink-faint" />
									{conversation.isArchived ? "Unarchive" : "Archive"}
								</Button>
								<Button
									variant="ghost"
									role="menuitem"
									onClick={() => setIsChoosingMute(true)}
									className="w-full justify-start px-2.5 py-2 text-ink"
								>
									<BellOff className={cn("size-4", isMuted ? "text-signal" : "text-ink-faint")} />
									{isMuted ? "Muted" : "Mute"}
								</Button>
							</>
						)}
						{error && (
							<p role="alert" className="border-t border-rule-soft px-2.5 py-2 text-xs text-signal">
								{error}
							</p>
						)}
					</div>,
					document.body,
				)}
		</div>
	);
}
