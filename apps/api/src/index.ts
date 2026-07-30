import express from "express";
import cors from "cors";
import { createServer } from "node:http";
import { Server, type Socket } from "socket.io";
import { verifySupabaseJwt } from "./auth/verifySession";
import { registerLiveSessionHandlers } from "./socket/rooms";
import { stripeWebhookRouter } from "./webhooks/stripe";
import { razorpayWebhookRouter } from "./webhooks/razorpay";
import { whatsappWebhookRouter } from "./webhooks/whatsapp";

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, { cors: { origin: "*" } });

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

io.use((socket: Socket, next) => {
  try {
    const token = socket.handshake.auth?.token;
    if (typeof token !== "string") {
      throw new Error("Missing auth token");
    }
    const session = verifySupabaseJwt(token);
    (socket.data as { session?: unknown }).session = session;
    next();
  } catch (err) {
    next(err instanceof Error ? err : new Error("Authentication failed"));
  }
});

io.on("connection", (socket) => {
  registerLiveSessionHandlers(io, socket as Socket & { data: { session: import("@chessplay-clone/shared").AuthedSession } });
});

const port = Number(process.env.API_PORT ?? 4000);
httpServer.listen(port, () => {
  console.log(`API listening on :${port}`);
});
