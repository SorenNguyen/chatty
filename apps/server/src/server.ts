import { createServer } from "node:http";
import { createShardedAdapter } from "@socket.io/redis-adapter";
import { createApp } from "./app.js";
import { env } from "./config/env.js";
import { logger } from "./lib/logger.js";
import { startOrphanedUploadSweeper } from "./lib/orphaned-uploads.js";
import { startOutboxWorker } from "./lib/outbox.js";
import { redis } from "./lib/redis.js";
import { getIO } from "./lib/socket-bus.js";
import { initSockets } from "./sockets/index.js";

const app = createApp();
const httpServer = createServer(app);

// Socket.io attaches to the same HTTP server as Express — one process,
// one port, for both REST and WebSocket traffic.
initSockets(httpServer);

// Rooms live in one process's memory by default, so a message broadcast by one
// instance reaches nobody connected to another — and `fetchSockets()`, which is
// how presence answers "who is online", would only ever see half the users. The
// adapter makes both cross-process. Attached after initSockets so the server it
// configures is the one that exists.
//
// **Sharded, not the classic adapter.** `createAdapter` publishes every emit to
// one channel that every node subscribes to and then filters locally: at two
// instances that is invisible, at twenty it means one message crossing Redis
// twenty times so nineteen nodes can discard it. `createShardedAdapter` uses
// Redis 7's sharded Pub/Sub to publish per room, so only the nodes actually
// holding a member of that conversation are woken. Both compose files pin
// `redis:7-alpine`, which is the version SSUBSCRIBE arrived in.
//
// The default `subscriptionMode: "dynamic"` is the right one here and is left
// implicit: it opens a channel per *public* room, and every room this app uses —
// a conversation id, `user:<id>` — is public. Socket-id rooms stay on the shared
// channel, which is what "dynamic" declines to fan out and what this app never
// addresses directly anyway.
//
// `fetchSockets()` is unaffected: broadcast-with-ack cannot ride a per-room
// channel (it needs `serverCount()` across every node), so the adapter routes it
// over the static channel regardless of mode. Presence keeps seeing everyone.
if (redis) {
	getIO().adapter(createShardedAdapter(redis.pub, redis.sub));
	logger.info("socket.io using the sharded redis adapter");
}

// Every instance runs one. They compete for the same rows and step over each
// other's claims (`FOR UPDATE SKIP LOCKED`), so more instances is more delivery
// throughput rather than duplicate mail — unlike rate limits and socket rooms,
// this one needs no Redis to behave correctly with several processes.
startOutboxWorker();

// Also one per instance, and also safe that way: two sweeps compute the same set
// and `rm --force` makes deleting a file twice a no-op. Unlike the outbox this
// one is not doing work anybody is waiting for — it reclaims the files left by
// uploads that died between writing the image and committing its row.
startOrphanedUploadSweeper();

httpServer.listen(env.PORT, () => {
	logger.info(`chatty server listening on :${env.PORT}`);
});
