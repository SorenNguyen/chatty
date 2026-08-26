/**
 * One or two letters standing in for someone with no avatar.
 *
 * Takes the first and last word, not the first two: "Nguyễn Tuấn Minh" is
 * recognisable as NM and confusing as NT, because Vietnamese names put the
 * distinguishing part last. A single-word name gives one letter rather than two
 * from the same word.
 */
export function getInitials(displayName: string): string {
	const words = displayName.trim().split(/\s+/).filter(Boolean);
	if (words.length === 0) return "?";

	const first = words[0]!.charAt(0);
	const last = words.length > 1 ? words[words.length - 1]!.charAt(0) : "";

	return (first + last).toUpperCase();
}
