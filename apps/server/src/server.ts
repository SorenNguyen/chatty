import { createServer } from "node:http";
import { createApp } from "./app.js";
import { env } from "./config/env.js";
import { logger } from "./lib/logger.js";
import { initSockets } from "./sockets/index.js";

const app = createApp();
const httpServer = createServer(app);

// Socket.io attaches to the same HTTP server as Express — one process,
// one port, for both REST and WebSocket traffic.
initSockets(httpServer);

httpServer.listen(env.PORT, () => {
	logger.info(`chatty server listening on :${env.PORT}`);
});
