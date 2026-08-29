import { CornerUpLeft, Heart, MoreHorizontal, Pencil, Trash2, UserRoundX, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/button";
import { cn } from "@/utils/cn";
import type { ReactionKind } from "@chatty/shared-types";
import { MAX_BROWSER_TIMEOUT_MS } from "../constants/message";
import { REACTION_OPTIONS } from "../constants/reactions";
import { formatRemaining } from "../utils";

interface MessageActionsProps {
	onEdit?: () => void;
	onDeleteForEveryone?: () => void;
	onDeleteForMe: () => void;
	/** Absent on a message there is nothing left to answer — a tombstone. */
	onReply?: (() => void) | undefined;
	/** Absent for the same reason. Which kinds exist is the server's list, not this component's. */
	onToggleReaction?: ((kind: ReactionKind) => void) | undefined;
	/** Which kinds the viewer has already left, so the picker can show them as set. */
	reactedKinds: ReactionKind[];
	authorActionExpiresAt: string | null;
	align: "start" | "end";
}

/** A compact action menu beside a message bubble, visible on hover or keyboard focus. */
export function MessageActions({
	onEdit,
	onDeleteForEveryone,
	onDeleteForMe,
	onReply,
	onToggleReaction,
	reactedKinds,
	authorActionExpiresAt,
	align,
}: MessageActionsProps) {
	const [isOpen, setIsOpen] = useState(false);
	const [isChoosingDeleteScope, setIsChoosingDeleteScope] = useState(false);
	const [hasAuthorActionsExpired, setHasAuthorActionsExpired] = useState(
		() => !authorActionExpiresAt || Date.parse(authorActionExpiresAt) <= Date.now(),
	);
	const rootRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		if (!authorActionExpiresAt) {
			setHasAuthorActionsExpired(true);

			return;
		}

		const remaining = Date.parse(authorActionExpiresAt) - Date.now();
		if (remaining <= 0) {
			setHasAuthorActionsExpired(true);

			return;
		}

		setHasAuthorActionsExpired(false);
		const timer = window.setTimeout(
			() => {
				setHasAuthorActionsExpired(true);
				setIsChoosingDeleteScope(false);
			},
			Math.min(remaining, MAX_BROWSER_TIMEOUT_MS),
		);

		return () => window.clearTimeout(timer);
	}, [authorActionExpiresAt]);

	useEffect(() => {
		if (!isOpen) return;
		const focusFrame = window.requestAnimationFrame(() => {
			rootRef.current?.querySelector<HTMLButtonElement>("[role='menuitem']")?.focus();
		});

		function closeFromOutside(event: PointerEvent) {
			if (!rootRef.current?.contains(event.target as Node)) {
				setIsOpen(false);
				setIsChoosingDeleteScope(false);
			}
		}

		function closeFromKeyboard(event: KeyboardEvent) {
			if (event.key === "Escape") {
				setIsOpen(false);
				setIsChoosingDeleteScope(false);
				rootRef.current?.querySelector<HTMLButtonElement>("[aria-haspopup='menu']")?.focus();

				return;
			}

			if (!rootRef.current || !["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
			const items = [...rootRef.current.querySelectorAll<HTMLButtonElement>("[role='menuitem']")];
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
	}, [isOpen, isChoosingDeleteScope]);

	const canChangeForEveryone = !hasAuthorActionsExpired && Boolean(onEdit || onDeleteForEveryone);
	// Recomputed on each render of an open menu rather than ticked on a timer:
	// a menu is open for seconds, and a second interval per message on screen
	// costs more than the minute of precision it would buy.
	const remainingLabel = isOpen && canChangeForEveryone ? formatRemaining(authorActionExpiresAt) : null;
	const isHeartReacted = reactedKinds.includes("heart");

	return (
		<div
			ref={rootRef}
			className={cn(
				"relative flex shrink-0 items-center",
				"max-sm:opacity-70 sm:opacity-0 sm:transition-opacity",
				"sm:group-hover:opacity-100 sm:focus-within:opacity-100",
				isOpen && "sm:opacity-100",
			)}
		>
			{onToggleReaction && (
				<Button
					variant="ghost"
					onClick={() => onToggleReaction("heart")}
					aria-label="React with Heart"
					aria-pressed={isHeartReacted}
					className={cn(
						"size-6 p-0 hover:bg-transparent hover:text-ink max-sm:hidden",
						isHeartReacted ? "text-signal" : "text-ink-faint",
					)}
				>
					<Heart className={cn("size-3.5", isHeartReacted && "fill-current")} />
				</Button>
			)}

			{onReply && (
				<Button
					variant="ghost"
					onClick={onReply}
					aria-label="Reply to message"
					className="size-6 p-0 text-ink-faint hover:bg-transparent hover:text-ink max-sm:hidden"
				>
					<CornerUpLeft className="size-3.5" />
				</Button>
			)}

			<Button
				variant="ghost"
				onClick={() => {
					setIsOpen((current) => !current);
					setIsChoosingDeleteScope(false);
				}}
				aria-label="Message actions"
				aria-haspopup="menu"
				aria-expanded={isOpen}
				className={cn("size-6 p-0 text-ink-faint hover:bg-transparent hover:text-ink", isOpen && "text-ink")}
			>
				<MoreHorizontal className="size-4" />
			</Button>

			{isOpen && (
				<div
					role="menu"
					aria-label="Message actions"
					className={cn(
						"absolute bottom-full z-30 mb-2 w-56 overflow-hidden rounded-control border border-rule",
						"bg-paper-raised p-1.5 text-[13px] shadow-lift",
						align === "end" ? "right-0" : "left-0",
					)}
				>
					{isChoosingDeleteScope ? (
						<>
							<p className="eyebrow px-2.5 py-2 text-ink-faint">Delete this message</p>
							<Button
								variant="ghost"
								role="menuitem"
								onClick={onDeleteForMe}
								className="w-full justify-start px-2.5 py-2 text-ink"
							>
								<UserRoundX className="size-4" />
								Delete for me
							</Button>
							{canChangeForEveryone && onDeleteForEveryone && (
								<Button
									variant="ghost"
									role="menuitem"
									onClick={onDeleteForEveryone}
									className="w-full justify-start px-2.5 py-2 text-signal hover:bg-signal-soft"
								>
									<Trash2 className="size-4" />
									Delete for everyone
								</Button>
							)}
							<Button
								variant="ghost"
								role="menuitem"
								onClick={() => setIsChoosingDeleteScope(false)}
								className="w-full justify-start px-2.5 py-2 text-ink-faint"
							>
								<X className="size-4" />
								Cancel
							</Button>
						</>
					) : (
						<>
							{onToggleReaction && (
								<div className="flex items-center gap-0.5 px-1 pb-1.5 pt-0.5">
									{REACTION_OPTIONS.map((option) => {
										const isReacted = reactedKinds.includes(option.kind);

										return (
											<Button
												key={option.kind}
												variant="ghost"
												role="menuitem"
												aria-pressed={isReacted}
												aria-label={option.label}
												onClick={() => {
													setIsOpen(false);
													onToggleReaction(option.kind);
												}}
												className={cn(
													"size-8 rounded-control p-0",
													isReacted
														? "bg-signal-soft text-signal hover:bg-signal-soft"
														: "text-ink-soft hover:bg-ink/5 hover:text-ink",
												)}
											>
												<option.Icon className={cn("size-4", isReacted && "fill-current")} />
											</Button>
										);
									})}
								</div>
							)}

							{onReply && (
								<Button
									variant="ghost"
									role="menuitem"
									onClick={() => {
										setIsOpen(false);
										onReply();
									}}
									className="w-full justify-start px-2.5 py-2 text-ink"
								>
									<CornerUpLeft className="size-4" />
									Reply
								</Button>
							)}

							{canChangeForEveryone && onEdit && (
								<Button
									variant="ghost"
									role="menuitem"
									onClick={() => {
										setIsOpen(false);
										onEdit();
									}}
									className="w-full justify-start px-2.5 py-2 text-ink"
								>
									<Pencil className="size-4" />
									Edit message
								</Button>
							)}
							<Button
								variant="ghost"
								role="menuitem"
								onClick={() => setIsChoosingDeleteScope(true)}
								className="w-full justify-start px-2.5 py-2 text-signal hover:bg-signal-soft"
							>
								<Trash2 className="size-4" />
								Delete message
							</Button>
							{/* Without this the two actions above simply vanish one day
							    and look like a bug rather than like a deadline. */}
							{remainingLabel && (
								<div className="mt-1 flex items-center justify-between gap-2 border-t border-rule-soft px-2.5 pb-1 pt-2">
									<span className="eyebrow text-ink-faint">Window</span>
									<span className="meta text-ink-faint">{remainingLabel}</span>
								</div>
							)}
						</>
					)}
				</div>
			)}
		</div>
	);
}
