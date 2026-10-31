// External video links (Google Meet first, Zoom/Teams equally) pasted by a
// coach onto a classroom or one session. Nothing here talks to those services:
// the link is stored and rendered, and the button is labelled from its host.

export type MeetingProvider = "MEET" | "ZOOM" | "TEAMS" | "OTHER";

export const MEETING_URL_MAX_LENGTH = 500;

const PROVIDER_LABELS: Record<MeetingProvider, string> = {
  MEET: "Join Meet",
  ZOOM: "Join Zoom",
  TEAMS: "Join Teams",
  OTHER: "Join meeting",
};

function hostMatches(host: string, domain: string): boolean {
  return host === domain || host.endsWith(`.${domain}`);
}

export function meetingProvider(url: string): MeetingProvider {
  let host: string;
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return "OTHER";
  }
  if (hostMatches(host, "meet.google.com")) return "MEET";
  if (hostMatches(host, "zoom.us") || hostMatches(host, "zoom.com")) return "ZOOM";
  if (hostMatches(host, "teams.microsoft.com") || hostMatches(host, "teams.live.com")) {
    return "TEAMS";
  }
  return "OTHER";
}

export function meetingButtonLabel(url: string): string {
  return PROVIDER_LABELS[meetingProvider(url)];
}

/**
 * Normalises a pasted link, or explains why it can't be used.
 *
 * https only. The value is rendered as an `href` to every student and parent
 * in the room, so `javascript:` and `data:` must never get through, and plain
 * `http:` has no business carrying a class's audio and video.
 */
export function parseMeetingUrl(
  raw: string
): { ok: true; url: string } | { ok: false; error: string } {
  const trimmed = raw.trim();
  if (trimmed.length > MEETING_URL_MAX_LENGTH) {
    return { ok: false, error: "That link is too long" };
  }
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return { ok: false, error: "Paste the full meeting link, starting with https://" };
  }
  if (parsed.protocol !== "https:") {
    return { ok: false, error: "Meeting links must start with https://" };
  }
  return { ok: true, url: parsed.toString() };
}

/** The session's own link wins over the room's standing one. */
export function effectiveMeetingUrl(
  session: { meetingUrl: string | null },
  classroom: { meetingUrl: string | null }
): string | null {
  return session.meetingUrl ?? classroom.meetingUrl ?? null;
}
