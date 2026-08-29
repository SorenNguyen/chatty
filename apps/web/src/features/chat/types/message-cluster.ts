/**
 * Where one message sits in a run of messages from the same author.
 *
 * The whole corner grammar hangs off this: which corners a bubble rounds, which
 * it tightens to a seam, and which one carries the notch. Derived once in the
 * list — a row cannot see its neighbours — and passed down as a single value
 * rather than as two booleans, so the four cases are named and exhaustive
 * instead of being reconstructed from `isFirst && !isLast` at each use.
 */
export type ClusterPosition = "solo" | "first" | "middle" | "last";
