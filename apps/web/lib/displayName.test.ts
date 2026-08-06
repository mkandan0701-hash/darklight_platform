import { describe, expect, it } from "vitest";
import { displayName } from "./displayName";

describe("displayName", () => {
  it("uses the email local part", () => {
    expect(displayName("dev@demo-academy.test")).toBe("dev");
  });

  it("keeps dots and hyphens in the local part", () => {
    expect(displayName("asha.rao-k@academy.test")).toBe("asha.rao-k");
  });

  // Rendering "" here would leave a blank space where a child's name goes on
  // the parent portal, which reads as a broken page rather than a missing name.
  it("falls back to the full address when the local part is empty", () => {
    expect(displayName("@academy.test")).toBe("@academy.test");
  });

  it("returns the input unchanged when there is no @", () => {
    expect(displayName("nobody")).toBe("nobody");
  });
});
