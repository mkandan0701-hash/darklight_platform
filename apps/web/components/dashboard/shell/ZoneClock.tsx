"use client";

import { useEffect, useState } from "react";
import { DateTime } from "luxon";
import { Clock, ICON_PROPS } from "../../ui/icons";

/**
 * The viewer's timezone, with their own wall clock beside it.
 *
 * Read-only on purpose. The reference design puts a dropdown here, but nothing
 * in this app changes a timezone from the header — User.timezone is edited on
 * the profile page — and a control that looks like a picker and silently is
 * not is worse than a label. So this states which zone the times on screen are
 * in, which is the genuinely useful part for an academy whose coach is in IST
 * and whose students are not.
 *
 * `initialNow` is rendered on the server so the chip has its final width in the
 * first paint; the effect then keeps it ticking. suppressHydrationWarning
 * covers the case where the server and client land either side of a minute.
 */
export function ZoneClock({ zone, initialNow }: { zone: string; initialNow: string }) {
  const [now, setNow] = useState(initialNow);

  useEffect(() => {
    const tick = () => setNow(DateTime.now().setZone(zone).toFormat("h:mm a"));
    tick();
    const id = setInterval(tick, 30_000);
    return () => clearInterval(id);
  }, [zone]);

  const label = DateTime.now().setZone(zone).offsetNameLong ?? zone;

  return (
    <span
      className="hidden items-center gap-2 rounded-lg border border-ink/10 bg-white px-3 py-1.5 text-xs shadow-sm sm:inline-flex"
      title={`Times on this page are shown in ${zone}`}
    >
      <Clock {...ICON_PROPS} size={15} aria-hidden="true" className="text-slate" />
      <span className="flex flex-col leading-tight">
        <span className="font-medium text-ink">{label}</span>
        <span className="text-slate" suppressHydrationWarning>
          {now}
        </span>
      </span>
    </span>
  );
}
