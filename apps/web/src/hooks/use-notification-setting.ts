import { create } from "zustand";
import { NOTIFICATIONS_STORAGE_KEY } from "@/constants/notifications";

/**
 * Whether this browser shows a notification for a message that arrives while
 * the tab is hidden.
 *
 * Shared rather than owned by either feature: the chat raises the notifications
 * and the settings dialog turns them on, and features may not import from each
 * other.
 *
 * Two facts, not one, and conflating them is the bug this shape avoids. The
 * *preference* is this app's and lives in `localStorage`; the *permission* is
 * the browser's and cannot be stored, granted or taken back by anything here. A
 * single boolean would let the UI claim notifications are on for a browser that
 * has quietly revoked them.
 */
export type NotificationPermissionState = NotificationPermission | "unsupported";

interface NotificationSettingState {
	/** The stored preference. True does not on its own mean a notification will appear. */
	isEnabled: boolean;
	permission: NotificationPermissionState;
	/** Asks the browser if it has to, then stores the preference if it was granted. */
	enable: () => Promise<void>;
	disable: () => void;
}

function readStoredPreference(): boolean {
	try {
		return localStorage.getItem(NOTIFICATIONS_STORAGE_KEY) === "true";
	} catch {
		// Private modes and blocked site data throw on access rather than
		// returning null, and a settings toggle is not worth a crashed render.
		return false;
	}
}

function readPermission(): NotificationPermissionState {
	return typeof Notification === "undefined" ? "unsupported" : Notification.permission;
}

export const useNotificationSetting = create<NotificationSettingState>((set) => ({
	// Read once at module load. The preference only changes through this store,
	// so there is nothing to re-read; the permission is refreshed on every
	// `enable`, which is the only moment it can change from inside this app.
	isEnabled: readStoredPreference(),
	permission: readPermission(),

	async enable() {
		if (typeof Notification === "undefined") {
			set({ permission: "unsupported" });

			return;
		}

		// `requestPermission` resolves immediately with the existing answer when
		// one has already been given, so this needs no branch of its own.
		const permission = await Notification.requestPermission();
		// Stored only when it will actually do something. Writing `true` against a
		// denied permission produces a switch that is on and silent, which is worse
		// than one that refused to move.
		const isEnabled = permission === "granted";

		try {
			localStorage.setItem(NOTIFICATIONS_STORAGE_KEY, String(isEnabled));
		} catch {
			// The preference is lost at the end of the session; the notifications
			// still work for the rest of it.
		}

		set({ permission, isEnabled });
	},

	disable() {
		try {
			localStorage.setItem(NOTIFICATIONS_STORAGE_KEY, "false");
		} catch {
			// As above — the setting applies now and may not survive a reload.
		}

		set({ isEnabled: false });
	},
}));
