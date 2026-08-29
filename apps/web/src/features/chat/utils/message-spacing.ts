import { MESSAGE_BURST_WINDOW_MS, MESSAGE_TIME_GAP_MS } from "../constants/message-cluster";

function getElapsedMs(isoTimestamp: string, previousIsoTimestamp: string): number {
	return Math.max(0, Date.parse(isoTimestamp) - Date.parse(previousIsoTimestamp));
}

/** Whether two adjacent messages are close enough to read as one burst. */
export function isWithinMessageBurst(isoTimestamp: string, previousIsoTimestamp: string | undefined): boolean {
	if (!previousIsoTimestamp) return false;

	return getElapsedMs(isoTimestamp, previousIsoTimestamp) <= MESSAGE_BURST_WINDOW_MS;
}

/** Whether a same-day pause is long enough to orient the reader again. */
export function hasMessageTimeGap(isoTimestamp: string, previousIsoTimestamp: string | undefined): boolean {
	if (!previousIsoTimestamp) return false;

	return getElapsedMs(isoTimestamp, previousIsoTimestamp) >= MESSAGE_TIME_GAP_MS;
}
