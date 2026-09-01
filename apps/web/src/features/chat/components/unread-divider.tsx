interface UnreadDividerProps {
	count: number;
}

export function UnreadDivider({ count }: UnreadDividerProps) {
	return (
		<div className="eyebrow my-4 flex items-center gap-3 text-signal">
			<span className="h-px flex-1 bg-signal/30" />
			{count} new {count === 1 ? "message" : "messages"}
			<span className="h-px flex-1 bg-signal/30" />
		</div>
	);
}
