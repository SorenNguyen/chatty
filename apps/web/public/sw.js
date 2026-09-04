const SHELL_CACHE = "chatty-shell-v1";

async function cacheCurrentShell() {
	const response = await self.fetch("/");
	if (!response.ok) return;
	const markup = await response.clone().text();
	const paths = [
		"/",
		...Array.from(markup.matchAll(/(?:src|href)="([^"#]+)"/g), (match) => match[1]).filter(
			(path) => new URL(path, self.location.origin).origin === self.location.origin,
		),
	];
	const cache = await self.caches.open(SHELL_CACHE);
	await cache.put("/", response);
	await Promise.all(
		paths.slice(1).map(async (path) => {
			const asset = await self.fetch(path);
			if (asset.ok) await cache.put(path, asset);
		}),
	);
}

self.addEventListener("install", (event) => {
	event.waitUntil(cacheCurrentShell().then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
	event.waitUntil(
		self.caches
			.keys()
			.then((keys) =>
				Promise.all(keys.filter((key) => key !== SHELL_CACHE).map((key) => self.caches.delete(key))),
			)
			.then(() => self.clients.claim()),
	);
});

self.addEventListener("fetch", (event) => {
	const request = event.request;
	const url = new URL(request.url);
	if (request.method !== "GET" || url.origin !== self.location.origin) return;

	if (request.mode === "navigate") {
		event.respondWith(
			self
				.fetch(request)
				.then(async (response) => {
					if (response.ok) await (await self.caches.open(SHELL_CACHE)).put("/", response.clone());
					return response;
				})
				.catch(async () => (await self.caches.match("/")) ?? Response.error()),
		);
		return;
	}

	if (url.pathname.startsWith("/assets/") || url.pathname === "/theme.js") {
		event.respondWith(
			self.caches.match(request).then(
				(cached) =>
					cached ??
					self.fetch(request).then(async (response) => {
						if (response.ok) await (await self.caches.open(SHELL_CACHE)).put(request, response.clone());
						return response;
					}),
			),
		);
	}
});
