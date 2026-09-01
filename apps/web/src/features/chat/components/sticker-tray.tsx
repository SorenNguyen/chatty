import { ImagePlus, X } from "lucide-react";
import { useEffect, useRef } from "react";
import { Button } from "@/components/button";
import { ACCEPTED_IMAGE_TYPES } from "../constants/attachment";
import { useStickers } from "../hooks";

interface StickerTrayProps {
	onPick: (stickerId: string) => void;
	onClose: () => void;
}

/**
 * Somebody's saved images, one tap from being sent again.
 *
 * A personal tray rather than a shipped pack, and that is the decision: a
 * sticker set means artwork, and the honest options were a built-in pack drawn
 * in this app's ink style — which is not what anybody means by "stickers" — or
 * letting people bring their own. The second is a real feature, needs no
 * licensing, and reuses the image pipeline the gallery already put in place.
 *
 * A sticker is *copied* into a fresh attachment when it is sent, so removing one
 * from the tray never blanks a picture out of a conversation it was sent to.
 */
export function StickerTray({ onPick, onClose }: StickerTrayProps) {
	const { stickers, isLoading, error, add, remove } = useStickers();
	const panelRef = useRef<HTMLDivElement>(null);
	const fileInputRef = useRef<HTMLInputElement>(null);

	useEffect(() => {
		function handlePointerDown(event: MouseEvent) {
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

	function handleFileSelected(event: React.ChangeEvent<HTMLInputElement>) {
		const file = event.target.files?.[0];
		// Reset so the same file can be added twice — the change event does not
		// fire when the value is unchanged.
		event.target.value = "";
		if (file) void add(file);
	}

	return (
		<div
			ref={panelRef}
			role="dialog"
			aria-label="Stickers"
			className="popover-enter absolute bottom-full left-0 z-40 mb-2 w-[min(320px,calc(100vw-24px))] rounded-panel border border-rule bg-paper-raised shadow-lift"
		>
			<div className="flex items-center justify-between border-b border-rule-soft px-3.5 py-2.5">
				<span className="eyebrow text-ink-soft">Stickers</span>
				<input
					ref={fileInputRef}
					type="file"
					accept={ACCEPTED_IMAGE_TYPES}
					onChange={handleFileSelected}
					className="hidden"
				/>
				<Button
					variant="ghost"
					onClick={() => fileInputRef.current?.click()}
					className="eyebrow gap-1.5 px-1.5 py-0.5 text-ink-faint hover:text-ink"
				>
					<ImagePlus className="size-3.5" />
					Add
				</Button>
			</div>

			{error && (
				<p role="alert" className="eyebrow border-b border-rule-soft px-3.5 py-2.5 text-signal">
					{error}
				</p>
			)}

			<div className="grid max-h-[240px] grid-cols-3 gap-2 overflow-y-auto p-3">
				{stickers.map((sticker) => (
					// `group` so the remove button appears on hover rather than sitting
					// permanently over every picture in the tray.
					<div key={sticker.id} className="group relative">
						<Button
							variant="ghost"
							onClick={() => onPick(sticker.id)}
							aria-label="Send this sticker"
							className="block size-full overflow-hidden rounded-control p-0"
						>
							<img
								src={sticker.url}
								alt=""
								loading="lazy"
								className="aspect-square w-full object-contain"
							/>
						</Button>
						<Button
							variant="ghost"
							onClick={() => void remove(sticker.id)}
							aria-label="Remove this sticker"
							className="absolute -right-1.5 -top-1.5 size-5 rounded-badge border border-rule bg-paper-raised p-0 text-ink-faint opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
						>
							<X className="size-3" />
						</Button>
					</div>
				))}
			</div>

			{!isLoading && stickers.length === 0 && (
				<p className="px-4 pb-5 text-center text-[13px] text-ink-faint">
					No stickers yet. Add a picture and it is one tap away from every conversation.
				</p>
			)}
		</div>
	);
}
