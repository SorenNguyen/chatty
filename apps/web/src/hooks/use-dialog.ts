import { useEffect, useRef } from "react";

/**
 * Everything a `<div role="dialog">` needs to behave like one.
 *
 * Everything focusable that is not disabled and not deliberately skipped. The
 * trap is only as good as this list: anything missing from it is a control Tab
 * can reach and Shift+Tab cannot come back from.
 */
const FOCUSABLE_SELECTOR =
	"button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])";

/**
 * Escape to close, Tab wrapped inside the panel, focus moved into it on open.
 *
 * Extracted because the edit-history dialog and the settings dialog need the
 * identical thing and live in different features, which is exactly the case the
 * frontend conventions say to lift into `src/hooks` rather than copy. Two copies
 * of a focus trap are two chances for one of them to lose a case.
 *
 * The caller owns the state: this closes nothing itself, it calls `onClose`.
 * Pass a stable callback — a new function each render re-binds the listener.
 */
export function useDialog<T extends HTMLElement>(onClose: () => void) {
	const dialogRef = useRef<T>(null);

	useEffect(() => {
		dialogRef.current?.focus();

		function handleKeyDown(event: KeyboardEvent) {
			if (event.key === "Escape") {
				onClose();

				return;
			}

			if (event.key !== "Tab" || !dialogRef.current) return;

			const focusable = [...dialogRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)];
			const first = focusable[0];
			const last = focusable[focusable.length - 1];
			if (!first || !last) return;

			if (event.shiftKey && document.activeElement === first) {
				event.preventDefault();
				last.focus();
			} else if (!event.shiftKey && document.activeElement === last) {
				event.preventDefault();
				first.focus();
			}
		}

		document.addEventListener("keydown", handleKeyDown);

		return () => document.removeEventListener("keydown", handleKeyDown);
	}, [onClose]);

	return dialogRef;
}
