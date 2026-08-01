import express from "express";
import cors from "cors";
import { createServer } from "node:http";
import { Server, type Socket } from "socket.io";
import { createAdapter } from "@socket.io/redis-adapter";
import { createRedisClient } from "./redis";
import { authenticateSocket, type SocketSessionData } from "./socket/authenticate";
import { createBoardStore } from "./socket/boardStore";
import { registerLiveSessionHandlers } from "./socket/rooms";
import { stripeWebhookRouter } from "./webhooks/stripe";
import { razorpayWebhookRouter } from "./webhooks/razorpay";
import { whatsappWebhookRouter } from "./webhooks/whatsapp";

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, { cors: { origin: "*" } });

// Room broadcasts must reach clients held by *other* API instances. Without
// this, a second Railway instance silently splits every live session in two —
// a correctness bug the moment it scales past one process, not a performance
// one (chessplay-clone-spec.md §3.4).
const pubClient = createRedisClient();
const subClient = pubClient.duplicate();
io.adapter(createAdapter(pubClient, subClient));

// Authoritative board positions, shared across instances for the same reason.
const boardStore = createBoardStore(createRedisClient());

app.use(cors());

app.get("/health", (_req, res) => res.json({ ok: true }));

// Webhook routes need the raw body for signature verification — mount them
// with express.raw() *before* the app-wide express.json() below.
app.use("/webhooks/stripe", express.raw({ type: "application/json" }), stripeWebhookRouter);
app.use("/webhooks/razorpay", express.raw({ type: "application/json" }), razorpayWebhookRouter);
app.use("/webhooks/whatsapp", express.raw({ type: "application/json" }), whatsappWebhookRouter);

app.use(express.json());

// TODO (Wave 2+): mount cron-triggered routes (lichess-sync, chesscom-sync,
// report-generation) once those jobs exist — see chessplay-clone-spec.md §2.

io.use(async (socket: Socket, next) => {
  try {
    // Resolves the JWT *and* the backing User row, so a deleted account or a
    // token whose tenant claim no longer matches is refused at connect.
    const data = await authenticateSocket(socket.handshake.auth?.token);
    Object.assign(socket.data, data);
    next();
  } catch (err) {
    next(err instanceof Error ? err : new Error("Authentication failed"));
  }
});

io.on("connection", (socket) => {
  registerLiveSessionHandlers(io, socket as Socket & { data: SocketSessionData }, {
    boardStore,
  });
});

const port = Number(process.env.API_PORT ?? 4000);
httpServer.listen(port, () => {
  console.log(`API listening on :${port}`);
});
