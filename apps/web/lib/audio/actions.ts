"use server";

import { getCurrentSession } from "../auth/session";
import { ForbiddenRoleError } from "../auth/errors";
import { getLiveSession } from "../../repositories/liveSessionRepository";
import { getClassroom } from "../../repositories/classroomRepository";
import { stunOnlyIceServers, type IceServer } from "./iceServers";
import { mintTurnCredential, parseTurnUrls } from "./turnCredentials";

// Hands the browser the ICE configuration for one live session.
//
// This exists as a server action rather than a NEXT_PUBLIC_ variable because
// TURN is metered bandwidth we pay for. A relay password shipped to the client
// would be readable by anyone who loads the site, and they could relay their
// own traffic on our account indefinitely. Here the shared secret stays on the
// server and the browser only ever sees a credential that expires.

export async function getIceServersAction(liveSessionId: string): Promise<IceServer[]> {
  const session = await getCurrentSession();

  // Being signed in is not enough — credentials are only minted for people
  // who could actually join this session. Mirrors canAccessLiveSession in
  // apps/api/src/socket/rooms.ts, including that an academy admin who isn't
  // teaching or enrolled is not a participant.
  const liveSession = await getLiveSession(session.tenantId, liveSessionId);
  if (!liveSession) {
    throw new ForbiddenRoleError("No such live session");
  }
  const classroom = await getClassroom(session.tenantId, liveSession.classroomId);
  const isMember =
    classroom !== null &&
    (classroom.coaches.some((c) => c.coach.user.id === session.id) ||
      classroom.students.some((s) => s.student.user.id === session.id));
  if (!isMember) {
    throw new ForbiddenRoleError("Not a participant in this session");
  }

  const iceServers = stunOnlyIceServers();

  // Inert until a relay is provisioned: with no TURN_URLS/TURN_SECRET this
  // returns exactly what the product returned before TURN existed.
  const turnUrls = parseTurnUrls(process.env.TURN_URLS);
  const secret = process.env.TURN_SECRET;
  if (turnUrls.length === 0 || !secret) {
    return iceServers;
  }

  const ttlSeconds = Number(process.env.TURN_TTL_SECONDS) || undefined;
  const { username, credential } = mintTurnCredential({
    secret,
    userId: session.id,
    ttlSeconds,
  });

  return [...iceServers, { urls: turnUrls, username, credential }];
}
