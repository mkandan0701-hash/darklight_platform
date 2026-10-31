import { describe, expect, it } from "vitest";
import { displayName } from "./displayName";

describe("displayName", () => {
  it("prefers the name the user set", () => {
    expect(displayName({ displayName: "Dev Iyer", email: "dev@demo.test" })).toBe("Dev Iyer");
  });

  it("trims a set name", () => {
    expect(displayName({ displayName: "  Dev Iyer  ", email: "dev@demo.test" })).toBe(
      "Dev Iyer"
    );
  });

  describe("falls back to the email local part", () => {
    it("when displayName is null", () => {
      expect(displayName({ displayName: null, email: "dev@demo.test" })).toBe("dev");
    });

    it("when displayName is absent entirely", () => {
      expect(displayName({ email: "asha.rao-k@academy.test" })).toBe("asha.rao-k");
    });

    // A user who clears the field means "no name set", not "render nothing".
    // The repository normalizes blanks to null, but a row written before that
    // existed — or by a direct DB edit — must not blank the UI either.
    it("when displayName is empty or whitespace", () => {
      expect(displayName({ displayName: "", email: "dev@demo.test" })).toBe("dev");
      expect(displayName({ displayName: "   ", email: "dev@demo.test" })).toBe("dev");
    });
  });

  // Rendering "" here would leave a blank space where a child's name goes on
  // the parent portal, which reads as a broken page rather than a missing name.
  it("falls back to the full address when the local part is empty too", () => {
    expect(displayName({ email: "@academy.test" })).toBe("@academy.test");
  });

  it("returns the input unchanged when there is no @", () => {
    expect(displayName({ email: "nobody" })).toBe("nobody");
  });
});
