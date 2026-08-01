// End-to-end smoke test for the live session realtime layer, driving real
// socket.io-client connections against a running API.
//
// Vitest covers the handlers against a fake socket and a fake Redis. What it
// cannot cover is the part most likely to be wrong: JWT verification, the
// Redis adapter, the real compare-and-set, Postgres persistence of the
// reference board, and whether room isolation actually holds over the wire.
//
// Tokens are signed locally with SUPABASE_JWT_SECRET rather than minted
// through Supabase — verifySupabaseJwt only checks the signature and claims,
// and apps/api has no Supabase dependency. The hook that produces these claims
// in production is proven separately by apps/web's verify:auth-hook.
//
// Needs REDIS_URL set and the API running (`npm run dev`). Then, from apps/api:
//   npm run verify:live

import jwt from "jsonwebtoken";
import { io, type Socket } from "socket.io-client";
import { prismaBase } from "@chessplay-clone/db";
import { createRedisClient } from "../src/redis";
import { createBoardStore, START_FEN } from "../src/socket/boardStore";

const API_URL = process.env.API_URL ?? `http://localhost:${process.env.API_PORT ?? 4000}`;
const SUBDOMAIN = "demo-academy";

let failures = 0;
function check(ok: boolean, label: string, detail = "") {
  if (ok) console.log(`  ok    ${label}`);
  else {
    failures += 1;
    console.error(`  FAIL  ${label}${detail ? ` — ${detail}` : ""}`);
  }
}
function section(name: string) {
  console.log(`\n${name}`);
}

function signToken(user: { authProviderId: string; tenantId: string; role: string }) {
  return jwt.sign(
    { sub: user.authProviderId, tenant_id: user.tenantId, role: user.role },
    process.env.SUPABASE_JWT_SECRET!,
    { expiresIn: "10m" }
  );
}

function connect(token: string): Promise<Socket> {
  return new Promise((resolve, reject) => {
    const socket = io(API_URL, { auth: { token }, transports: ["websocket"] });
    socket.once("connect", () => resolve(socket));
    socket.once("connect_error", (err) => reject(new Error(`connect_error: ${err.message}`)));
    setTimeout(() => reject(new Error("connect timed out")), 8000);
  });
}

function emit<T extends unknown[]>(socket: Socket, event: string, payload: unknown): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${event} ack timed out`)), 8000);
    socket.emit(event, payload, (...ack: unknown[]) => {
      clearTimeout(timer);
      resolve(ack as T);
    });
  });
}

/** Resolves with the next payload for `event`, or null if none arrives in time. */
function once<T>(socket: Socket, event: string, ms = 2500): Promise<T | null> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      socket.off(event, handler);
      resolve(null);
    }, ms);
    const handler = (payload: T) => {
      clearTimeout(timer);
      socket.off(event, handler);
      resolve(payload);
    };
    socket.on(event, handler);
  });
}

/** Records every frame for the given events, for "this must never arrive" checks. */
function record(socket: Socket, events: string[]): string[] {
  const seen: string[] = [];
  for (const event of events) socket.on(event, () => seen.push(event));
  return seen;
}

async function main() {
  if (!process.env.SUPABASE_JWT_SECRET) throw new Error("SUPABASE_JWT_SECRET is not set");

  const health = await fetch(`${API_URL}/health`).catch(() => null);
  if (!health?.ok) {
    console.error(`API not reachable at ${API_URL}. Start it with \`npm run dev\` first.`);
    process.exit(1);
  }

  const tenant = await prismaBase.tenant.findUnique({ where: { subdomain: SUBDOMAIN } });
  if (!tenant) throw new Error("No demo tenant — run apps/web's `npm run seed:demo` first");

  const [coach, student] = await Promise.all([
    prismaBase.user.findFirstOrThrow({ where: { tenantId: tenant.id, role: "COACH" } }),
    prismaBase.user.findFirstOrThrow({ where: { tenantId: tenant.id, role: "STUDENT" } }),
  ]);
  const liveSession = await prismaBase.liveSession.findFirstOrThrow({
    where: { tenantId: tenant.id },
    orderBy: { scheduledAtUtc: "desc" },
  });
  const id = liveSession.id;

  // Board state survives in Redis between runs, so a second run would start
  // from an already-advanced position and every move assertion would drift.
  const redis = createRedisClient();
  const store = createBoardStore(redis);
  await store.clearFen(id);
  await store.clearFen(id, "ref");
  await prismaBase.referenceBoard.deleteMany({ where: { tenantId: tenant.id, liveSessionId: id } });

  const coachSocket = await connect(signToken(coach));
  const studentSocket = await connect(signToken(student));
  // Nothing reference-board-shaped may ever reach the student.
  const studentLeaks = record(studentSocket, [
    "ref-board-state",
    "ref-board-move",
    "ref-board-load",
    "ref-board-clear",
  ]);

  section("Authorization");
  const [studentCoachOk, , studentCoachErr] = await emit<[boolean, string?, string?]>(
    studentSocket,
    "join-room",
    { liveSessionId: id, room: "coach" }
  );
  check(studentCoachOk === false, "student refused the coach-only room", String(studentCoachErr));

  const [coachSharedOk, coachSharedFen] = await emit<[boolean, string?]>(coachSocket, "join-room", {
    liveSessionId: id,
    room: "shared",
  });
  check(coachSharedOk === true, "coach admitted to the shared room");
  check(coachSharedFen === START_FEN, "join ack carries the current position");

  const [coachRefOk] = await emit<[boolean]>(coachSocket, "join-room", {
    liveSessionId: id,
    room: "coach",
  });
  check(coachRefOk === true, "coach admitted to the coach-only room");

  const [studentSharedOk] = await emit<[boolean]>(studentSocket, "join-room", {
    liveSessionId: id,
    room: "shared",
  });
  check(studentSharedOk === true, "enrolled student admitted to the shared room");

  section("Moves");
  const studentSeesMove = once<{ fen: string }>(studentSocket, "game-state");
  const [moveOk, movedFen] = await emit<[boolean, string?]>(coachSocket, "move", {
    liveSessionId: id,
    from: "e2",
    to: "e4",
  });
  check(moveOk === true, "coach's legal move accepted");
  check((await studentSeesMove)?.fen === movedFen, "student receives the broadcast position");

  const [illegalOk, , illegalErr] = await emit<[boolean, string?, string?]>(coachSocket, "move", {
    liveSessionId: id,
    from: "a1",
    to: "a8",
  });
  check(illegalOk === false && illegalErr === "illegal move", "illegal move rejected");

  const [secondOk, secondFen] = await emit<[boolean, string?]>(studentSocket, "move", {
    liveSessionId: id,
    from: "e7",
    to: "e5",
  });
  check(secondOk === true, "second move accepted");
  check(
    typeof secondFen === "string" && secondFen.includes("4p3") && secondFen.includes("4P3"),
    "second move built on the first (Redis CAS holding state)"
  );

  section("Late join");
  const lateSocket = await connect(signToken(student));
  const [lateOk, lateFen] = await emit<[boolean, string?]>(lateSocket, "join-room", {
    liveSessionId: id,
    room: "shared",
  });
  check(lateOk === true, "late joiner admitted");
  check(lateFen === secondFen, "late joiner hydrated with the current position, not the start");

  section("Arrows and flip");
  const coachSeesArrow = once<{ authorRole: string; from: string }>(coachSocket, "draw-arrow");
  await emit(studentSocket, "draw-arrow", { liveSessionId: id, from: "g8", to: "f6" });
  const arrow = await coachSeesArrow;
  check(arrow?.from === "g8", "student's arrow reaches the coach");
  check(arrow?.authorRole === "STUDENT", "arrow stamped with the server's view of the author");

  const [clearOk, clearErr] = await emit<[boolean, string?]>(studentSocket, "clear-arrows", {
    liveSessionId: id,
  });
  check(clearOk === false, "student refused clear-arrows", String(clearErr));
  const [coachClearOk] = await emit<[boolean]>(coachSocket, "clear-arrows", { liveSessionId: id });
  check(coachClearOk === true, "coach may clear arrows");

  const [flipOk] = await emit<[boolean, string?]>(studentSocket, "flip-board", {
    liveSessionId: id,
  });
  check(flipOk === false, "student refused flip-board");

  section("Chat");
  const coachSeesChat = once<Record<string, string>>(coachSocket, "chat-message");
  await emit(studentSocket, "chat-message", {
    liveSessionId: id,
    body: "why not Nf3?",
    // Ignored: identity comes from the socket's session, not the payload.
    authorUserId: "spoofed",
    authorName: "spoofed",
  });
  const chat = await coachSeesChat;
  check(chat?.body === "why not Nf3?", "chat reaches the room");
  check(chat?.authorUserId === student.id, "authorUserId stamped from the session, not the payload");
  check(chat?.authorName !== "spoofed", "authorName not taken from the payload");
  check(typeof chat?.sentAtUtc === "string" && chat.sentAtUtc.endsWith("Z"), "sentAtUtc is UTC");

  section("Reference board");
  const prep = "r1bqkbnr/pppp1ppp/2n5/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R b KQkq - 3 3";
  const [loadOk, loadErr] = await emit<[boolean, string?]>(coachSocket, "ref-board-load", {
    liveSessionId: id,
    fen: prep,
  });
  check(loadOk === true, "coach loads a prep position", String(loadErr));

  const [badFenOk, badFenErr] = await emit<[boolean, string?]>(coachSocket, "ref-board-load", {
    liveSessionId: id,
    fen: "not a position",
  });
  check(badFenOk === false && badFenErr === "invalid FEN", "invalid FEN rejected");

  const persisted = await prismaBase.referenceBoard.findFirst({
    where: { tenantId: tenant.id, liveSessionId: id },
  });
  check(persisted?.fen === prep, "reference board persisted to Postgres");

  const [refIllegalOk, refIllegalErr] = await emit<[boolean, string?]>(
    coachSocket,
    "ref-board-move",
    { liveSessionId: id, from: "a1", to: "a8" }
  );
  check(refIllegalOk === false && refIllegalErr === "illegal move", "illegal ref move rejected");

  // A fresh connection proves durability, not just that the sender kept state.
  const coachAgain = await connect(signToken(coach));
  const refState = once<{ fen: string }>(coachAgain, "ref-board-state");
  await emit(coachAgain, "join-room", { liveSessionId: id, room: "coach" });
  check((await refState)?.fen === prep, "reconnecting coach re-hydrates the prep position");

  section("Audio");
  const coachSeesPeer = once<{ peerId: string; name: string }>(coachSocket, "audio-peer-joined");
  const [coachAudioOk, coachPeerId] = await emit<[boolean, string?]>(coachSocket, "audio-join", {
    liveSessionId: id,
  });
  check(coachAudioOk === true, "coach joins audio");
  await coachSeesPeer;

  const studentSeesPeer = once<{ peerId: string }>(studentSocket, "audio-peer-joined");
  const [studentAudioOk, studentPeerId] = await emit<[boolean, string?]>(
    studentSocket,
    "audio-join",
    { liveSessionId: id }
  );
  check(studentAudioOk === true, "student joins audio");
  check((await studentSeesPeer) !== null, "peers are announced to the room");

  const coachSeesSignal = once<{ fromPeerId: string }>(coachSocket, "audio-signal");
  const [signalOk, signalErr] = await emit<[boolean, string?]>(studentSocket, "audio-signal", {
    liveSessionId: id,
    toPeerId: coachPeerId,
    signal: { kind: "description", description: { type: "offer", sdp: "v=0" } },
  });
  check(signalOk === true, "signal relayed to a peer in the same call", String(signalErr));
  check((await coachSeesSignal)?.fromPeerId === studentPeerId, "relay stamped with fromPeerId");

  // The check that stops this handler being a way to push SDP at any client.
  const [strangerOk, strangerErr] = await emit<[boolean, string?]>(studentSocket, "audio-signal", {
    liveSessionId: id,
    toPeerId: "some-other-sockets-id",
    signal: { kind: "candidate", candidate: {} },
  });
  check(strangerOk === false, "signal to a socket outside the call refused", String(strangerErr));

  const coachSeesLeft = once<{ peerId: string }>(coachSocket, "audio-peer-left");
  studentSocket.disconnect();
  check((await coachSeesLeft)?.peerId === studentPeerId, "disconnect announces the departure");

  section("Isolation");
  check(
    studentLeaks.length === 0,
    "student never received any reference-board frame",
    studentLeaks.join(", ")
  );

  for (const s of [coachSocket, coachAgain, lateSocket]) s.disconnect();
  await redis.quit();

  console.log(
    failures === 0 ? "\nLive session realtime layer is working." : `\n${failures} check(s) failed.`
  );
  process.exit(failures === 0 ? 0 : 1);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prismaBase.$disconnect());
