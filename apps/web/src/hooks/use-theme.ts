import { create } from "zustand";
import { DARK_SCHEME_QUERY, THEME_STORAGE_KEY } from "@/constants/theme";
import type { ResolvedTheme, ThemePreference } from "@/types/theme";

/**
 * The reader's theme: what they asked for, and what that currently means.
 *
 * Two fields rather than one, and the pair is the point. `preference` is the
 * stored choice and may be "system"; `resolved` is what is on screen and never
 * is. Collapsing them would make it impossible to render the setting correctly —
 * the panel has to show System as chosen while the app is drawn dark.
 *
 * `public/theme.js` has already stamped the element by the time this module
 * loads, so nothing here runs on startup: reading the same two facts a second
 * time and writing the same attribute would be work that cannot change anything.
 * This store owns the *transitions* — a click in Settings, and the OS moving
 * underneath a reader who chose System.
 *
 * In `src/hooks` rather than a feature's: the settings dialog changes the theme
 * and every feature is drawn in it, so it belongs to none of them.
 */
interface ThemeState {
	preference: ThemePreference;
	resolved: ResolvedTheme;
	setPreference: (preference: ThemePreference) => void;
}

function readStoredPreference(): ThemePreference {
	try {
		const stored = localStorage.getItem(THEME_STORAGE_KEY);
		if (stored === "light" || stored === "dark" || stored === "system") return stored;
	} catch {
		// Private modes throw on access rather than returning null. A theme is
		// not worth a crashed render; the default below is the same one
		// `theme.js` fell back to a moment ago, so the two agree.
	}

	return "system";
}

/**
 * Guarded rather than called directly: jsdom does not implement `matchMedia`,
 * and this module is pulled in by every component test that renders a page.
 */
function prefersDark(): boolean {
	return typeof window.matchMedia === "function" && window.matchMedia(DARK_SCHEME_QUERY).matches;
}

function resolveTheme(preference: ThemePreference): ResolvedTheme {
	if (preference !== "system") return preference;

	return prefersDark() ? "dark" : "light";
}

function stamp(resolved: ResolvedTheme): void {
	document.documentElement.dataset.theme = resolved;
}

const storedPreference = readStoredPreference();

export const useTheme = create<ThemeState>((set) => ({
	preference: storedPreference,
	resolved: resolveTheme(storedPreference),

	setPreference(preference) {
		try {
			localStorage.setItem(THEME_STORAGE_KEY, preference);
		} catch {
			// The choice applies now and may not survive a reload — the same
			// bargain the notification preference makes.
		}

		const resolved = resolveTheme(preference);
		stamp(resolved);
		set({ preference, resolved });
	},
}));

/*
 * The OS switching at dusk moves the app with it, but only for a reader who
 * asked it to. An explicit Light or Dark is a decision, and a decision the
 * operating system can overrule is not one.
 *
 * Registered at module scope rather than in an effect: there is exactly one of
 * these for the life of the tab, and a hook would tie it to whichever component
 * happened to mount first.
 */
if (typeof window.matchMedia === "function") {
	window.matchMedia(DARK_SCHEME_QUERY).addEventListener("change", (event) => {
		if (useTheme.getState().preference !== "system") return;

		const resolved: ResolvedTheme = event.matches ? "dark" : "light";
		stamp(resolved);
		useTheme.setState({ resolved });
	});
}
