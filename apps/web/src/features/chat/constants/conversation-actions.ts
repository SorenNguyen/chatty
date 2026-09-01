export const CONVERSATION_MUTE_OPTIONS = [
	{ label: "8 hours", milliseconds: 8 * 60 * 60 * 1000 },
	{ label: "1 week", milliseconds: 7 * 24 * 60 * 60 * 1000 },
	{ label: "Forever", milliseconds: null },
] as const;
