import { formatDayLabel } from "../utils";

interface DaySeparatorProps {
	/** The timestamp of the first message of the day this rule opens. */
	isoTimestamp: string;
}

/** The hairline rule that names the day the messages under it were sent. */
export function DaySeparator({ isoTimestamp }: DaySeparatorProps) {
	return (
		<div className="flex items-center gap-3.5 pt-7 first:pt-0">
			<span className="eyebrow text-ink-faint">{formatDayLabel(isoTimestamp)}</span>
			<span className="h-px flex-1 bg-rule-soft" />
		</div>
	);
}
