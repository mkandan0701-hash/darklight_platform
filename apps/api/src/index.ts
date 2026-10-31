import express from "express";
import { requireTenantContext } from "@chessplay-clone/db";
import cors from "cors";
import { createServer } from "node:http";
import { Server, type Socket } from "socket.io";
import { createAdapter } from "@socket.io/redis-adapter";
import { createRedisClient } from "./redis";
import { authenticateSocket, type SocketSessionData } from "./socket/authenticate";
import { createBoardStore } from "./socket/boardStore";
import { registerLiveSessionHandlers } from "./socket/rooms";
import { registerSimulHandlers } from "./socket/simulRooms";
import { registerTournamentHandlers } from "./socket/tournamentRooms";
import { startTournamentBroadcaster } from "./socket/tournamentBroadcaster";
import { stripeWebhookRouter } from "./webhooks/stripe";
import { razorpayWebhookRouter } from "./webhooks/razorpay";
import { whatsappWebhookRouter } from "./webhooks/whatsapp";

// Every tenant-scoped query in this process runs inside runWithTenant (socket
// handlers, webhooks, jobs), so one that doesn't is a bug: refuse it rather
// than fall back to tenantScope's presence-only check.
requireTenantContext(true);

// Node's default for an unhandled rejection is already to crash, but silently
// enough that Railway shows a restart with no cause. Logging first is the whole
// point of this handler; the exit is what the default would have done anyway,
// and Railway restarts us. Clients reconnect and re-join their room, so a
// restart costs a live session a few seconds rather than the lesson — which is
// why the webhook handlers catch their own errors instead of reaching here.
process.on("unhandledRejection", (reason, promise) => {
  console.error("Unhandled rejection at:", promise, "reason:", reason);
  process.exit(1);
});

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

// Live tournament pushes originate in apps/web, which has no way to reach this
// process's io instance. It enqueues; this consumes and re-emits. BullMQ hands
// each job to exactly one instance, and the redis adapter above fans the emit
// out to sockets held by all of them — so a viewer gets it once, not once per
// instance. Unlike the jobs in worker.ts this one belongs in the API process,
// because the broadcast needs io.
const tournamentBroadcaster = startTournamentBroadcaster(io);
// An EventEmitter with no error listener throws, and the handler above turns
// that into a process exit — so without this a Redis blip would take down
// every live lesson on this instance to protect a feature nobody would miss.
// Logged rather than swallowed: a silently dead broadcaster looks exactly
// like a working one until someone notices the page has stopped updating.
tournamentBroadcaster.on("error", (err) => {
  console.error("[tournament-events] broadcaster error:", err);
});
tournamentBroadcaster.on("failed", (job, err) => {
  console.error(`[tournament-events] job ${job?.id} failed:`, err);
});

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
  const authed = socket as Socket & { data: SocketSessionData };
  registerLiveSessionHandlers(io, authed, { boardStore });
  // Simul boards are separate rooms on the same connection: a coach giving an
  // exhibition holds one socket and sits at every board through it.
  registerSimulHandlers(io, authed, { boardStore });
  // Watch-only, and open to anyone in the academy — no board state to sync,
  // so no boardStore.
  registerTournamentHandlers(authed);
});

const port = Number(process.env.API_PORT ?? 4000);
httpServer.listen(port, () => {
  console.log(`API listening on :${port}`);
});
