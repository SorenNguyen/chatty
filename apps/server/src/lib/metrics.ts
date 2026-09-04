import { Counter, Gauge, Histogram, Registry, collectDefaultMetrics } from "@prometheus-io/client";

export const metricsRegistry = new Registry();

collectDefaultMetrics({
	register: metricsRegistry,
	prefix: "chatty_",
});

const httpRequests = new Counter({
	name: "chatty_http_requests_total",
	help: "Completed HTTP requests, grouped without user-controlled or resource-id labels.",
	labelNames: ["method", "route_group", "status_class"] as const,
	registers: [metricsRegistry],
});

const httpRequestDuration = new Histogram({
	name: "chatty_http_request_duration_seconds",
	help: "HTTP request duration in seconds.",
	labelNames: ["method", "route_group", "status_class"] as const,
	buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
	registers: [metricsRegistry],
});

const httpRequestBytes = new Histogram({
	name: "chatty_http_request_body_bytes",
	help: "Declared HTTP request body size in bytes when Content-Length is present.",
	labelNames: ["route_group"] as const,
	buckets: [256, 1_024, 4_096, 16_384, 65_536, 262_144, 1_048_576, 5_242_880, 10_485_760, 26_214_400],
	registers: [metricsRegistry],
});

const messageSendDuration = new Histogram({
	name: "chatty_message_send_duration_seconds",
	help: "End-to-end server time for a message command after its multipart body has been parsed.",
	labelNames: ["kind", "outcome"] as const,
	buckets: [0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
	registers: [metricsRegistry],
});

const messageUploadBytes = new Histogram({
	name: "chatty_message_upload_bytes",
	help: "Bytes of validated attachment buffers entering a message command.",
	labelNames: ["kind"] as const,
	buckets: [1_024, 16_384, 65_536, 262_144, 1_048_576, 5_242_880, 10_485_760, 26_214_400],
	registers: [metricsRegistry],
});

const imageNormalizationDuration = new Histogram({
	name: "chatty_image_normalization_duration_seconds",
	help: "Server-side attachment image normalization and persistence time.",
	labelNames: ["outcome"] as const,
	buckets: [0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
	registers: [metricsRegistry],
});

const imageBytes = new Histogram({
	name: "chatty_image_bytes",
	help: "Image bytes before and after authoritative server normalization.",
	labelNames: ["stage"] as const,
	buckets: [1_024, 16_384, 65_536, 262_144, 1_048_576, 5_242_880, 10_485_760],
	registers: [metricsRegistry],
});

const databaseQueryDuration = new Histogram({
	name: "chatty_database_query_duration_seconds",
	help: "Prisma query duration by bounded model and action names.",
	labelNames: ["model", "action", "outcome"] as const,
	buckets: [0.001, 0.0025, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5],
	registers: [metricsRegistry],
});

const socketConnections = new Gauge({
	name: "chatty_socket_connections",
	help: "Current Socket.IO connections on this API process.",
	registers: [metricsRegistry],
});

const socketConnectionEvents = new Counter({
	name: "chatty_socket_connection_events_total",
	help: "Socket.IO connect and disconnect events on this API process.",
	labelNames: ["event", "reason"] as const,
	registers: [metricsRegistry],
});

const socketSetupDuration = new Histogram({
	name: "chatty_socket_setup_duration_seconds",
	help: "Time to join authorized rooms and announce presence after a socket connects.",
	labelNames: ["outcome"] as const,
	buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5],
	registers: [metricsRegistry],
});

const ROUTE_GROUPS = new Set([
	"attachments",
	"auth",
	"blocks",
	"conversations",
	"health",
	"me",
	"metrics",
	"ready",
	"restrictions",
	"search",
	"stickers",
	"users",
]);

export type MessageMetricKind = "text" | "image" | "file" | "voice" | "sticker" | "forward";

export function getRouteGroup(url: string): string {
	const firstSegment = url.split("?", 1)[0]?.split("/").filter(Boolean)[0] ?? "root";

	return ROUTE_GROUPS.has(firstSegment) ? firstSegment : "other";
}

export function startHttpRequestTimer(method: string, routeGroup: string): (statusCode: number) => void {
	const startedAt = process.hrtime.bigint();

	return (statusCode) => {
		const statusClass = `${Math.floor(statusCode / 100)}xx`;
		const labels = { method, route_group: routeGroup, status_class: statusClass };
		httpRequests.inc(labels);
		httpRequestDuration.observe(labels, Number(process.hrtime.bigint() - startedAt) / 1_000_000_000);
	};
}

export function observeHttpRequestBytes(routeGroup: string, contentLength: string | undefined): void {
	if (!contentLength) return;
	const bytes = Number(contentLength);
	if (Number.isFinite(bytes) && bytes >= 0) httpRequestBytes.observe({ route_group: routeGroup }, bytes);
}

export function startMessageSendTimer(kind: MessageMetricKind): (outcome: "success" | "error") => void {
	const stopTimer = messageSendDuration.startTimer({ kind });

	return (outcome) => stopTimer({ outcome });
}

export function observeMessageUploadBytes(kind: MessageMetricKind, bytes: number): void {
	if (bytes > 0) messageUploadBytes.observe({ kind }, bytes);
}

export function startImageNormalization(
	inputBytes: number,
): (outcome: "success" | "error", outputBytes?: number) => void {
	imageBytes.observe({ stage: "input" }, inputBytes);
	const stopTimer = imageNormalizationDuration.startTimer();

	return (outcome, outputBytes) => {
		stopTimer({ outcome });
		if (outputBytes !== undefined) imageBytes.observe({ stage: "output" }, outputBytes);
	};
}

export function startDatabaseQuery(model: string | undefined, action: string): (outcome: "success" | "error") => void {
	const stopTimer = databaseQueryDuration.startTimer({ model: model ?? "raw", action });

	return (outcome) => stopTimer({ outcome });
}

export function recordSocketConnected(): void {
	socketConnections.inc();
	socketConnectionEvents.inc({ event: "connect", reason: "accepted" });
}

export function recordSocketDisconnected(reason: string): void {
	socketConnections.dec();
	socketConnectionEvents.inc({ event: "disconnect", reason });
}

export function startSocketSetup(): (outcome: "success" | "error") => void {
	const stopTimer = socketSetupDuration.startTimer();

	return (outcome) => stopTimer({ outcome });
}
