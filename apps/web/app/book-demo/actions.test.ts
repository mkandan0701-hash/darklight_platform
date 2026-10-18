import { beforeEach, describe, expect, it, vi } from "vitest";

const createDemoBooking = vi.fn();
vi.mock("../../repositories/demoBookingRepository", () => ({
  createDemoBooking: (...a: unknown[]) => createDemoBooking(...a),
}));

const { bookDemoAction } = await import("./actions");

function form(over: Record<string, string>) {
  const fd = new FormData();
  const base = { name: "Asha", email: "asha@example.com", slotIso: "2099-01-05T05:00:00.000Z", timezone: "Asia/Kolkata" };
  for (const [k, v] of Object.entries({ ...base, ...over })) fd.set(k, v);
  return fd;
}

beforeEach(() => createDemoBooking.mockReset());

// Regression: the only anonymous write in the app accepted an unbounded name.
describe("bookDemoAction input bounds", () => {
  it("rejects an oversized name before touching the database", async () => {
    const result = await bookDemoAction(form({ name: "x".repeat(10_000) }));
    expect(result).toEqual({ ok: false, error: "That name is too long" });
    expect(createDemoBooking).not.toHaveBeenCalled();
  });

  it("rejects an oversized email", async () => {
    const result = await bookDemoAction(form({ email: `${"a".repeat(300)}@example.com` }));
    expect(result.ok).toBe(false);
    expect(createDemoBooking).not.toHaveBeenCalled();
  });
});
