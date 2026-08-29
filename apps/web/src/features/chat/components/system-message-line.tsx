interface SystemMessageLineProps {
	content: string;
}

/**
 * "An added Binh", "Chi left the group".
 *
 * No author, no bubble, no side — it is about the conversation rather than from
 * anyone in it, so it reads as a ruled line across the thread rather than as
 * something somebody said. The short rule on the left and the long one on the
 * right keep it from centring like a heading, which would give a membership
 * change more weight than the messages around it.
 */
export function SystemMessageLine({ content }: SystemMessageLineProps) {
	return (
		<p className="flex items-center gap-3">
			<span aria-hidden="true" className="h-px w-6 shrink-0 bg-rule" />
			<span className="eyebrow shrink-0 text-ink-faint">{content}</span>
			<span aria-hidden="true" className="h-px flex-1 bg-rule-soft" />
		</p>
	);
}
