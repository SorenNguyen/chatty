import { Button } from "@/components/button";
import { useNotificationSetting } from "@/hooks/use-notification-setting";

/**
 * Turns browser notifications on for this browser.
 *
 * It states that scope out loud — "this browser" — because it is the one thing
 * about the setting that surprises people: everything else in this dialog
 * follows the account to every device, and this cannot. Permission is granted
 * by one browser on one machine, so a setting synced to the account would be
 * making a promise the phone had never agreed to.
 *
 * A denied permission is not something a button here can fix, so the copy sends
 * the reader to the place that can rather than offering a control that would do
 * nothing.
 */
export function NotificationSettings() {
	const isEnabled = useNotificationSetting((state) => state.isEnabled);
	const permission = useNotificationSetting((state) => state.permission);
	const enable = useNotificationSetting((state) => state.enable);
	const disable = useNotificationSetting((state) => state.disable);

	if (permission === "unsupported") {
		return <p className="text-[13px] text-ink-soft">This browser cannot show notifications.</p>;
	}

	return (
		<div className="flex flex-col gap-4">
			<p className="text-[13px] text-ink-soft">
				Show a notification when a message arrives and this tab is not the one you are looking at. The setting
				applies to this browser only.
			</p>

			{permission === "denied" ? (
				<p
					role="status"
					className="rounded-control border border-rule bg-paper-raised px-3 py-2.5 text-[13px] text-ink-soft"
				>
					This browser is blocking notifications for Chatty. Allow them in its site settings, then come back.
				</p>
			) : (
				<div className="flex items-center gap-3">
					<Button
						variant={isEnabled ? "outline" : "primary"}
						onClick={isEnabled ? disable : () => void enable()}
					>
						{isEnabled ? "Turn notifications off" : "Turn notifications on"}
					</Button>
					<span className="eyebrow text-ink-faint">{isEnabled ? "On for this browser" : "Off"}</span>
				</div>
			)}
		</div>
	);
}
