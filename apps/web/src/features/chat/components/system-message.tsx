import { formatMessageTime } from "../utils";

interface SystemMessageProps {
	content: string;
	createdAt: string;
}

/**
 * "An added Binh", "Chi left the group".
 *
 * No author, no bubble, no side — it is about the conversation rather than from
 * anyone in it, so it reads as a rule across the thread instead of sitting in
 * either column. The text is set as a label rather than as speech for the same
 * reason: nobody said it.
 */
export function SystemMessage({ content, createdAt }: SystemMessageProps) {
	return (
		<div className="group flex items-center gap-3 py-4">
			<span className="h-px w-6 shrink-0 bg-rule" />
			<span className="eyebrow tracking-[0.08em] text-ink-faint">{content}</span>
			<span className="h-px flex-1 bg-rule-soft" />
			<time
				dateTime={createdAt}
				className="meta shrink-0 text-ink-faint opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 max-sm:hidden"
			>
				{formatMessageTime(createdAt)}
			</time>
		</div>
	);
}
