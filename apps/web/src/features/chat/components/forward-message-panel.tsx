import type { ConversationDTO, MessageDTO } from "@chatty/shared-types";
import { Forward, X } from "lucide-react";
import { useState } from "react";
import { api } from "@/api/client";
import { Button } from "@/components/button";
import { getConversationTitle } from "../utils";
import { ConversationAvatar } from "./conversation-avatar";

interface ForwardMessagePanelProps {
	message: MessageDTO;
	conversations: ConversationDTO[];
	currentUserId: string;
	onClose: () => void;
}

export function ForwardMessagePanel({ message, conversations, currentUserId, onClose }: ForwardMessagePanelProps) {
	const [sendingToId, setSendingToId] = useState<string | null>(null);
	const [error, setError] = useState("");

	async function forwardTo(conversationId: string): Promise<void> {
		setSendingToId(conversationId);
		setError("");
		try {
			await api.forwardMessage(conversationId, message.id);
			onClose();
		} catch (caught) {
			setError(caught instanceof Error ? caught.message : "The message could not be forwarded");
			setSendingToId(null);
		}
	}

	return (
		<div
			className="absolute inset-0 z-40 flex items-center justify-center bg-scrim/20 p-4 dark:bg-scrim/50"
			role="dialog"
			aria-modal="true"
			aria-label="Forward message"
		>
			<div className="flex max-h-[70vh] w-full max-w-sm flex-col overflow-hidden rounded-bubble border border-rule bg-paper-raised shadow-lift">
				<div className="flex items-center gap-3 border-b border-rule px-4 py-3">
					<Forward className="size-4 text-ink-faint" />
					<h2 className="flex-1 text-sm font-semibold">Forward to</h2>
					<Button variant="ghost" onClick={onClose} aria-label="Close forward panel" className="size-7 p-0">
						<X className="size-4" />
					</Button>
				</div>
				{error && (
					<p role="alert" className="px-4 py-2 text-xs text-signal">
						{error}
					</p>
				)}
				<div className="overflow-y-auto p-2">
					{conversations.map((conversation) => (
						<Button
							key={conversation.id}
							variant="ghost"
							onClick={() => void forwardTo(conversation.id)}
							disabled={sendingToId !== null}
							className="w-full justify-start px-3 py-2.5"
						>
							<ConversationAvatar
								conversation={conversation}
								currentUserId={currentUserId}
								onlineUserIds={new Set()}
								size="sm"
							/>
							<span className="truncate">{getConversationTitle(conversation, currentUserId)}</span>
						</Button>
					))}
				</div>
			</div>
		</div>
	);
}
