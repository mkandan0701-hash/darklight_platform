"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ICON_PROPS, Search, Trophy } from "../../../../components/ui/icons";
import { PieceAvatar } from "../../../../components/chess/PieceAvatar";

export type LeaderboardPeriod = "day" | "week" | "month";

type Row = {
  studentId: string;
  userId: string;
  name: string;
  xp: number;
  puzzlesSolved: number;
  classesAttended: number;
  badges: number;
  rank: number | null;
  mine: boolean;
};

const PERIODS: { value: LeaderboardPeriod; label: string; badge: string }[] = [
  { value: "day", label: "Daily", badge: "DAILY" },
  { value: "week", label: "Weekly", badge: "WEEKLY" },
  { value: "month", label: "Monthly", badge: "MONTHLY" },
];

const PODIUM: Record<number, string> = {
  1: "bg-gold text-white",
  2: "bg-slate-light text-ink",
  3: "bg-orange-200 text-orange-900",
};

export function LeaderboardClient({
  period,
  rooms,
  roomId,
  isStaff,
  rows,
}: {
  period: LeaderboardPeriod;
  rooms: { id: string; name: string }[];
  roomId: string | null;
  isStaff: boolean;
  rows: Row[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [isPending, startTransition] = useTransition();
  const [draft, setDraft] = useState("");
  const [query, setQuery] = useState("");

  useEffect(() => {
    const t = setTimeout(() => setQuery(draft.trim().toLowerCase()), 250);
    return () => clearTimeout(t);
  }, [draft]);

  const navigate = (patch: Record<string, string>) => {
    const qs = new URLSearchParams(window.location.search);
    for (const [k, v] of Object.entries(patch)) qs.set(k, v);
    startTransition(() => router.push(`${pathname}?${qs.toString()}`, { scroll: false }));
  };

  const current = PERIODS.find((p) => p.value === period)!;
  const anyPoints = rows.some((r) => r.xp > 0);
  const visible = query ? rows.filter((r) => r.name.toLowerCase().includes(query)) : rows;

  return (
    <div className="mt-5 space-y-4">
      {/* Header card */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-orange-600 to-orange-400 p-5 text-white shadow-md">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 opacity-20 [background-image:radial-gradient(white_1px,transparent_1px)] [background-size:14px_14px]"
        />
        <div className="relative flex items-center gap-4">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-white/20">
            <Trophy {...ICON_PROPS} size={28} aria-hidden="true" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-display text-xl font-bold tracking-tight">Student Leaderboard</p>
            <p className="text-sm text-white/90">Rankings based on puzzle and class points</p>
          </div>
          <div className="hidden rounded-xl bg-white/20 px-4 py-2 text-center sm:block">
            <p className="font-display text-xl font-bold leading-tight">{current.badge}</p>
            <p className="text-[10px] font-semibold tracking-widest text-white/80">RANKINGS</p>
          </div>
        </div>
      </div>

      {rooms.length === 0 ? (
        <Empty
          title="No classrooms yet"
          body={
            isStaff
              ? "Leaderboards rank students within a classroom. Create one and enrol students to get started."
              : "You'll see a leaderboard here once you're enrolled in a classroom. Ask your academy."
          }
          action={
            isStaff ? (
              <Link href="/dashboard/classrooms" className="text-sm font-medium text-board hover:underline">
                Go to Classrooms
              </Link>
            ) : null
          }
        />
      ) : (
        <>
          {/* Controls */}
          <div className="flex flex-wrap items-center gap-3">
            <div role="tablist" aria-label="Period" className="flex rounded-full bg-parchment p-1">
              {PERIODS.map((p) => (
                <button
                  key={p.value}
                  type="button"
                  role="tab"
                  aria-selected={period === p.value}
                  onClick={() => navigate({ period: p.value })}
                  className={`rounded-full px-4 py-1.5 text-xs font-semibold ${
                    period === p.value ? "bg-white text-ink shadow-sm" : "text-slate hover:text-ink"
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
            {rooms.length > 1 && (
              <select
                aria-label="Classroom"
                value={roomId ?? ""}
                onChange={(e) => navigate({ room: e.target.value })}
                className="rounded-full border border-ink/10 bg-white px-3 py-1.5 text-xs font-medium text-ink"
              >
                {rooms.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>
            )}
            <label className="relative ml-auto w-full sm:w-52">
              <span className="sr-only">Search students</span>
              <Search
                {...ICON_PROPS}
                size={15}
                aria-hidden="true"
                className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate"
              />
              <input
                type="search"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="Search students..."
                className="w-full rounded-full border border-transparent bg-transparent py-1.5 pl-8 pr-3 text-sm text-ink placeholder:text-slate/70 focus-visible:border-board focus-visible:bg-white focus-visible:ring-2 focus-visible:ring-board"
              />
            </label>
          </div>

          {/* Board */}
          <div className={`transition-opacity ${isPending ? "opacity-60" : ""}`} aria-busy={isPending}>
            {!anyPoints ? (
              <Empty
                title="No activities recorded yet"
                body="Solve homework puzzles and attend classes to earn points and climb the rankings!"
              />
            ) : visible.length === 0 ? (
              <Empty title="No students match" body={`Nobody in this classroom matches "${draft}".`} />
            ) : (
              <ol className="divide-y divide-ink/5 overflow-hidden rounded-2xl border border-ink/10 bg-white shadow-sm">
                {visible.map((r) => (
                  <li
                    key={r.studentId}
                    className={`flex items-center gap-3 px-4 py-3 ${r.mine ? "bg-board-light/60" : ""}`}
                  >
                    <span
                      className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold tabular-nums ${
                        r.rank && PODIUM[r.rank] ? PODIUM[r.rank] : "bg-parchment text-slate"
                      }`}
                      aria-label={r.rank ? `Rank ${r.rank}` : "Unranked"}
                    >
                      {r.rank ?? "–"}
                    </span>
                    <PieceAvatar seed={r.userId} name={r.name} className="h-9 w-9" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-ink">
                        {r.name}
                        {r.mine && <span className="ml-2 text-xs font-normal text-board">(you)</span>}
                      </p>
                      <p className="truncate text-xs text-slate">
                        {r.puzzlesSolved} {r.puzzlesSolved === 1 ? "puzzle" : "puzzles"} · {r.classesAttended}{" "}
                        {r.classesAttended === 1 ? "class" : "classes"} · {r.badges}{" "}
                        {r.badges === 1 ? "badge" : "badges"}
                      </p>
                    </div>
                    <span className="font-display text-base font-bold tabular-nums text-ink">
                      {r.xp}
                      <span className="ml-1 text-xs font-medium text-slate">XP</span>
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function Empty({ title, body, action }: { title: string; body: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-2xl border border-ink/10 bg-white px-6 py-14 text-center shadow-sm">
      <Trophy {...ICON_PROPS} size={40} aria-hidden="true" className="text-slate/40" />
      <p className="mt-2 font-display text-base font-semibold text-ink">{title}</p>
      <p className="max-w-sm text-xs text-slate">{body}</p>
      {action}
    </div>
  );
}
