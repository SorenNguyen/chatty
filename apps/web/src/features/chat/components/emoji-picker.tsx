import { Clock, Search } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/button";
import { cn } from "@/utils/cn";
import { EMOJI_CATEGORIES } from "../constants/emoji";
import { useRecentEmoji } from "../hooks";
import { searchEmoji } from "../utils";

interface EmojiPickerProps {
	onPick: (char: string) => void;
	onClose: () => void;
	/**
	 * Where the panel hangs. Defaults to above-left, which is what the composer
	 * needs; the reaction bar passes its own so the panel opens over the message
	 * rather than off the bottom of the thread.
	 */
	className?: string;
}

/**
 * The panel that puts an emoji in the composer.
 *
 * Hand-built rather than a library, and that is the design decision: every
 * emoji picker on npm arrives with its own stylesheet, which means its own
 * look — in an app whose entire premise is one declared look. The chrome here
 * is the app's: hairline rules, ink on paper, mono for the machine-produced
 * labels. Only the emoji themselves are colour, and they are the content.
 *
 * The reactions used to be deliberately **not** this — a closed set of five ink
 * marks, on the argument that a full-colour glyph parked beside a bubble is the
 * loudest thing on the page. The argument was sound and the implementation never
 * honoured it: the chips rendered colour emoji anyway while only the picker
 * stayed in ink, so one reaction had two appearances and neither predicted the
 * other. The set is open now and this panel is what `+` on the reaction bar
 * opens, which is why it takes an anchor.
 */
export function EmojiPicker({ onPick, onClose, className }: EmojiPickerProps) {
	const [query, setQuery] = useState("");
	const [activeCategoryId, setActiveCategoryId] = useState(EMOJI_CATEGORIES[0]!.id);
	const { recent, remember } = useRecentEmoji();
	const panelRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		function handlePointerDown(event: MouseEvent) {
			// A picker that only closes on Escape leaves a panel hanging over the
			// thread for anyone who reaches for the mouse instead.
			if (!panelRef.current?.contains(event.target as Node)) onClose();
		}

		function handleKeyDown(event: KeyboardEvent) {
			if (event.key === "Escape") onClose();
		}

		document.addEventListener("mousedown", handlePointerDown);
		document.addEventListener("keydown", handleKeyDown);

		return () => {
			document.removeEventListener("mousedown", handlePointerDown);
			document.removeEventListener("keydown", handleKeyDown);
		};
	}, [onClose]);

	function pick(char: string) {
		remember(char);
		onPick(char);
	}

	const results = searchEmoji(query);
	const activeCategory =
		EMOJI_CATEGORIES.find((category) => category.id === activeCategoryId) ?? EMOJI_CATEGORIES[0]!;
	// Searching replaces the categories rather than filtering within one: the
	// thing being looked for is rarely in the tab that happens to be open.
	const shown = query.trim() ? results : activeCategory.emoji;

	return (
		<div
			ref={panelRef}
			role="dialog"
			aria-label="Choose an emoji"
			className={cn(
				"popover-enter z-40 w-[min(320px,calc(100vw-24px))] rounded-panel border border-rule bg-paper-raised shadow-lift",
				// The app declares one shadow and this used to reach for Tailwind's
				// `shadow-lg`, which is a neutral grey drop on warm paper.
				className ?? "absolute bottom-full left-0 mb-2",
			)}
		>
			<div className="flex items-center gap-2.5 border-b border-rule-soft px-3.5 py-2.5">
				<Search aria-hidden="true" className="size-[15px] shrink-0 text-ink-faint" />
				<input
					autoFocus
					value={query}
					onChange={(event) => setQuery(event.target.value)}
					placeholder="Search emoji"
					aria-label="Search emoji"
					className="w-full bg-transparent text-[13px] text-ink outline-none placeholder:text-ink-faint"
				/>
			</div>

			{recent.length > 0 && !query.trim() && (
				<div className="border-b border-rule-soft px-2 py-2">
					<span className="eyebrow flex items-center gap-1.5 px-1.5 pb-1.5 text-ink-faint">
						<Clock aria-hidden="true" className="size-3" />
						Recent
					</span>
					<div className="flex flex-wrap">
						{recent.map((char) => (
							<Button
								key={char}
								variant="ghost"
								onClick={() => pick(char)}
								aria-label={`Insert ${char}`}
								className="size-9 rounded-control p-0 text-[20px] leading-none"
							>
								{char}
							</Button>
						))}
					</div>
				</div>
			)}

			<div className="grid max-h-[220px] grid-cols-8 overflow-y-auto p-2">
				{shown.map((entry) => (
					<Button
						key={entry.char}
						variant="ghost"
						onClick={() => pick(entry.char)}
						aria-label={`Insert ${entry.char}`}
						title={entry.keywords.split(" ")[0]}
						className="size-9 rounded-control p-0 text-[20px] leading-none"
					>
						{entry.char}
					</Button>
				))}
				{shown.length === 0 && (
					<p className="col-span-8 px-2 py-6 text-center text-[13px] text-ink-faint">
						Nothing matches “{query.trim()}”.
					</p>
				)}
			</div>

			{/* Hidden while searching: the tabs would be pointing at categories the
			    results are not drawn from, which reads as a filter that is not one. */}
			{!query.trim() && (
				<div className="flex items-center gap-px border-t border-rule-soft px-2 py-1.5">
					{EMOJI_CATEGORIES.map((category) => (
						<Button
							key={category.id}
							variant="ghost"
							onClick={() => setActiveCategoryId(category.id)}
							aria-label={category.label}
							aria-current={category.id === activeCategoryId ? "true" : undefined}
							className={cn(
								"size-8 rounded-control p-0",
								category.id === activeCategoryId ? "bg-ink/5 text-ink" : "text-ink-faint",
							)}
						>
							<category.Icon className="size-4" />
						</Button>
					))}
				</div>
			)}
		</div>
	);
}
