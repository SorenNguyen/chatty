import { createServer } from "node:http";
import { createAdapter } from "@socket.io/redis-adapter";
import { createApp } from "./app.js";
import { env } from "./config/env.js";
import { logger } from "./lib/logger.js";
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
if (redis) {
	getIO().adapter(createAdapter(redis.pub, redis.sub));
	logger.info("socket.io using the redis adapter");
}

httpServer.listen(env.PORT, () => {
	logger.info(`chatty server listening on :${env.PORT}`);
});
