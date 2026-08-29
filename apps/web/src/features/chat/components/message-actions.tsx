import { MoreHorizontal, Pencil, Trash2, UserRoundX, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/button";
import { cn } from "@/utils/cn";
import { MAX_BROWSER_TIMEOUT_MS } from "../constants/message";

interface MessageActionsProps {
	onEdit?: () => void;
	onDeleteForEveryone?: () => void;
	onDeleteForMe: () => void;
	authorActionExpiresAt: string | null;
	align: "start" | "end";
}

/** A compact action menu beside a message bubble, visible on hover or keyboard focus. */
export function MessageActions({
	onEdit,
	onDeleteForEveryone,
	onDeleteForMe,
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

	return (
		<div ref={rootRef} className="relative shrink-0">
			<Button
				variant="ghost"
				onClick={() => {
					setIsOpen((current) => !current);
					setIsChoosingDeleteScope(false);
				}}
				aria-label="Message actions"
				aria-haspopup="menu"
				aria-expanded={isOpen}
				className={cn(
					"size-8 rounded-full border border-slate-200 bg-white p-0 text-slate-500 shadow-sm",
					"opacity-70 hover:bg-slate-50 hover:text-slate-800 sm:opacity-0 sm:group-hover:opacity-100 sm:focus:opacity-100",
					isOpen && "opacity-100",
				)}
			>
				<MoreHorizontal className="size-4" />
			</Button>

			{isOpen && (
				<div
					role="menu"
					aria-label="Message actions"
					className={cn(
						"absolute bottom-full z-30 mb-1.5 w-52 overflow-hidden rounded-xl border border-slate-200",
						"bg-white p-1.5 text-sm shadow-xl shadow-slate-900/10",
						align === "end" ? "right-0" : "left-0",
					)}
				>
					{isChoosingDeleteScope ? (
						<>
							<p className="px-2.5 py-2 text-xs font-medium text-slate-500">Delete this message</p>
							<Button
								variant="ghost"
								role="menuitem"
								onClick={onDeleteForMe}
								className="w-full justify-start px-2.5 py-2 text-slate-700"
							>
								<UserRoundX className="size-4" />
								Delete for me
							</Button>
							{canChangeForEveryone && onDeleteForEveryone && (
								<Button
									variant="ghost"
									role="menuitem"
									onClick={onDeleteForEveryone}
									className="w-full justify-start px-2.5 py-2 text-red-600 hover:bg-red-50"
								>
									<Trash2 className="size-4" />
									Delete for everyone
								</Button>
							)}
							<Button
								variant="ghost"
								role="menuitem"
								onClick={() => setIsChoosingDeleteScope(false)}
								className="w-full justify-start px-2.5 py-2 text-slate-500"
							>
								<X className="size-4" />
								Cancel
							</Button>
						</>
					) : (
						<>
							{canChangeForEveryone && onEdit && (
								<Button
									variant="ghost"
									role="menuitem"
									onClick={() => {
										setIsOpen(false);
										onEdit();
									}}
									className="w-full justify-start px-2.5 py-2 text-slate-700"
								>
									<Pencil className="size-4" />
									Edit message
								</Button>
							)}
							<Button
								variant="ghost"
								role="menuitem"
								onClick={() => setIsChoosingDeleteScope(true)}
								className="w-full justify-start px-2.5 py-2 text-red-600 hover:bg-red-50"
							>
								<Trash2 className="size-4" />
								Delete message
							</Button>
						</>
					)}
				</div>
			)}
		</div>
	);
}
