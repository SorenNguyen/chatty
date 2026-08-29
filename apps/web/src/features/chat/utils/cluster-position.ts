import type { ClusterPosition } from "../types/message-cluster";

/**
 * Names the four cases the corner grammar is written against.
 *
 * A message that both opens and closes its run is `solo` rather than "first and
 * last": it is the only shape that carries a full set of round corners plus the
 * notch, and calling it by name is what stops the tables in
 * `constants/message-cluster` from needing a fifth row nobody would maintain.
 */
export function getClusterPosition(isFirstOfRun: boolean, isLastOfRun: boolean): ClusterPosition {
	if (isFirstOfRun && isLastOfRun) return "solo";
	if (isFirstOfRun) return "first";
	if (isLastOfRun) return "last";

	return "middle";
}
