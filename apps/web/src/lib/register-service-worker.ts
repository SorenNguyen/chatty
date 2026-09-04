/** Keeps the production app shell available so IndexedDB can actually open offline. */
export function registerServiceWorker(): void {
	if (import.meta.env.DEV || !("serviceWorker" in navigator)) return;

	window.addEventListener("load", () => {
		void navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {
			// Local snapshots remain useful in an open tab. Registration failure is
			// intentionally non-fatal because private browsing and browser policy may
			// refuse durable storage without making online chat unusable.
		});
	});
}
