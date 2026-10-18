import { describe, expect, it } from "vitest";
import {
  effectiveMeetingUrl,
  meetingButtonLabel,
  meetingProvider,
  parseMeetingUrl,
} from "./meetingLink";

describe("meetingProvider", () => {
  it("recognises Google Meet, Zoom and Teams by host", () => {
    expect(meetingProvider("https://meet.google.com/abc-defg-hij")).toBe("MEET");
    expect(meetingProvider("https://us02web.zoom.us/j/123456789")).toBe("ZOOM");
    expect(meetingProvider("https://teams.microsoft.com/l/meetup-join/x")).toBe("TEAMS");
  });

  it("does not trust a lookalike host", () => {
    expect(meetingProvider("https://meet.google.com.evil.test/abc")).toBe("OTHER");
    expect(meetingProvider("https://notzoom.us/j/1")).toBe("OTHER");
  });

  it("labels the button from the provider", () => {
    expect(meetingButtonLabel("https://meet.google.com/abc-defg-hij")).toBe("Join Meet");
    expect(meetingButtonLabel("https://whereby.com/room")).toBe("Join meeting");
  });
});

describe("parseMeetingUrl", () => {
  it("accepts an https link and trims whitespace", () => {
    expect(parseMeetingUrl("  https://meet.google.com/abc-defg-hij ")).toEqual({
      ok: true,
      url: "https://meet.google.com/abc-defg-hij",
    });
  });

  it.each(["http://meet.google.com/abc", "javascript:alert(1)", "data:text/html,hi", "meet.google.com/abc"])(
    "rejects %s",
    (raw) => {
      expect(parseMeetingUrl(raw).ok).toBe(false);
    }
  );

  it("rejects an overlong link", () => {
    expect(parseMeetingUrl(`https://x.test/${"a".repeat(600)}`).ok).toBe(false);
  });
});

describe("effectiveMeetingUrl", () => {
  it("prefers the session's own link over the classroom's", () => {
    expect(
      effectiveMeetingUrl({ meetingUrl: "https://a.test/s" }, { meetingUrl: "https://a.test/c" })
    ).toBe("https://a.test/s");
    expect(effectiveMeetingUrl({ meetingUrl: null }, { meetingUrl: "https://a.test/c" })).toBe(
      "https://a.test/c"
    );
    expect(effectiveMeetingUrl({ meetingUrl: null }, { meetingUrl: null })).toBeNull();
  });
});
