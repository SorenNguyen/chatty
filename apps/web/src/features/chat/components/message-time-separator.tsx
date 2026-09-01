import { formatMessageTime } from "../utils";

interface MessageTimeSeparatorProps {
	isoTimestamp: string;
}

/** Re-orients a thread after a long pause without repeating the calendar day. */
export function MessageTimeSeparator({ isoTimestamp }: MessageTimeSeparatorProps) {
	return (
		<div
			role="separator"
			className="flex items-center gap-3.5 py-5"
			aria-label={`Conversation resumed at ${formatMessageTime(isoTimestamp)}`}
		>
			<span aria-hidden="true" className="h-px flex-1 bg-rule-soft" />
			<time dateTime={isoTimestamp} className="meta shrink-0 text-ink-faint">
				{formatMessageTime(isoTimestamp)}
			</time>
			<span aria-hidden="true" className="h-px flex-1 bg-rule-soft" />
		</div>
	);
}
