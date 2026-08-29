import { formatMessageTime } from "../utils";

interface MessageTimeSeparatorProps {
	isoTimestamp: string;
}

/** Re-orients a thread after a long pause without repeating the calendar day. */
export function MessageTimeSeparator({ isoTimestamp }: MessageTimeSeparatorProps) {
	return (
		<div
			className="flex items-center justify-center py-5"
			aria-label={`Conversation resumed at ${formatMessageTime(isoTimestamp)}`}
		>
			<span className="meta rounded-badge bg-paper-sunken px-2 py-1 text-ink-faint">
				{formatMessageTime(isoTimestamp)}
			</span>
		</div>
	);
}
