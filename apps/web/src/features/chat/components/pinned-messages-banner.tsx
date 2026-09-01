import type { PinnedMessageDTO } from "@chatty/shared-types";
import { Pin } from "lucide-react";
import { Button } from "@/components/button";

interface PinnedMessagesBannerProps {
	pinnedMessages: PinnedMessageDTO[];
	onOpenMessage: (messageId: string) => void;
}

export function PinnedMessagesBanner({ pinnedMessages, onOpenMessage }: PinnedMessagesBannerProps) {
	const newest = pinnedMessages[0];
	if (!newest) return null;

	return (
		<Button
			variant="ghost"
			onClick={() => onOpenMessage(newest.messageId)}
			className="h-9 w-full justify-start rounded-none border-b border-rule-soft bg-paper-raised px-4 text-left"
		>
			<Pin className="size-3.5 shrink-0 fill-current text-signal" />
			<span className="eyebrow shrink-0 text-ink-faint">Pinned</span>
			<span className="truncate text-xs text-ink-soft">{newest.content || "Attachment"}</span>
			{pinnedMessages.length > 1 && (
				<span className="meta ml-auto text-ink-faint">+{pinnedMessages.length - 1}</span>
			)}
		</Button>
	);
}
