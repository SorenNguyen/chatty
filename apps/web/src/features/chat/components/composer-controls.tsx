import { ArrowUp, ImagePlus, Smile, Sticker } from "lucide-react";
import { useRef } from "react";
import { Button } from "@/components/button";
import { ACCEPTED_IMAGE_TYPES, MAX_ATTACHMENTS_PER_MESSAGE } from "../constants/attachment";
import { EmojiPicker } from "./emoji-picker";
import { StickerTray } from "./sticker-tray";

interface ComposerControlsProps {
	isSending: boolean;
	/** True at the attachment cap: the picker is disabled rather than silently trimming. */
	isFull: boolean;
	canSend: boolean;
	isEmojiPickerOpen: boolean;
	isStickerTrayOpen: boolean;
	onToggleEmojiPicker: () => void;
	onToggleStickerTray: () => void;
	onCloseEmojiPicker: () => void;
	onCloseStickerTray: () => void;
	onFilesSelected: (event: React.ChangeEvent<HTMLInputElement>) => void;
	onInsertEmoji: (char: string) => void;
	onPickSticker: (stickerId: string) => void;
}

/**
 * The row under the field: attach, emoji, sticker, send — and the two panels
 * that open above it.
 *
 * Split out of `MessageInput` when that file went over the 300-line limit for
 * the second time. Every piece of state still lives in the composer; this owns
 * the file input's ref and nothing else, because the ref exists only to click
 * a hidden element that is rendered right here.
 */
export function ComposerControls({
	isSending,
	isFull,
	canSend,
	isEmojiPickerOpen,
	isStickerTrayOpen,
	onToggleEmojiPicker,
	onToggleStickerTray,
	onCloseEmojiPicker,
	onCloseStickerTray,
	onFilesSelected,
	onInsertEmoji,
	onPickSticker,
}: ComposerControlsProps) {
	const fileInputRef = useRef<HTMLInputElement>(null);

	return (
		// `relative` so the panels, which are absolutely positioned above this row,
		// are placed against the controls rather than the whole form.
		<div className="relative flex items-center justify-between gap-3 px-2.5 pb-2.5">
			{isEmojiPickerOpen && <EmojiPicker onPick={onInsertEmoji} onClose={onCloseEmojiPicker} />}
			{isStickerTrayOpen && <StickerTray onPick={onPickSticker} onClose={onCloseStickerTray} />}

			<input
				ref={fileInputRef}
				type="file"
				accept={ACCEPTED_IMAGE_TYPES}
				multiple
				onChange={onFilesSelected}
				className="hidden"
			/>
			<Button
				variant="ghost"
				onClick={() => fileInputRef.current?.click()}
				// Disabled at the cap rather than silently dropping the extras: a
				// picker that opens and then ignores what was chosen is worse than one
				// that will not open.
				disabled={isSending || isFull}
				aria-label={isFull ? `At most ${MAX_ATTACHMENTS_PER_MESSAGE} images` : "Attach an image"}
				className="size-7 shrink-0 p-0"
			>
				<ImagePlus className="size-4" />
			</Button>

			<Button
				variant="ghost"
				onClick={onToggleEmojiPicker}
				disabled={isSending}
				aria-label="Insert an emoji"
				aria-expanded={isEmojiPickerOpen}
				className="-ml-auto size-7 shrink-0 p-0"
			>
				<Smile className="size-4" />
			</Button>

			<Button
				variant="ghost"
				onClick={onToggleStickerTray}
				disabled={isSending}
				aria-label="Send a sticker"
				aria-expanded={isStickerTrayOpen}
				className="mr-auto size-7 shrink-0 p-0"
			>
				<Sticker className="size-4" />
			</Button>

			<div className="flex items-center gap-3">
				<span className="eyebrow text-ink-faint max-sm:hidden">Enter to send</span>
				<Button
					type="submit"
					disabled={isSending || !canSend}
					aria-label="Send message"
					className="size-8 shrink-0 p-0"
				>
					<ArrowUp className="size-4" />
				</Button>
			</div>
		</div>
	);
}
