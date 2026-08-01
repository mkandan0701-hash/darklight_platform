// Smoke test for the role-aware dashboard home and the pages beside it.
//
// Vitest can't reach any of this: these are async server components running
// real Prisma queries against real rows, and the failure mode is a 500 at
// request time, not a type error. A repository that returns a shape the page
// can't render, or a null profile, looks perfectly fine until someone loads
// the page.
//
// Signs in by minting a real Supabase link with admin.generateLink and walking
// /auth/callback, rather than hand-assembling @supabase/ssr's cookie format —
// same approach as verifyInviteFlow.ts, and it exercises the callback too.
//
// Seed first (scripts/seedHomeworkDemo.ts), start the dev server, then run
// from apps/web:
//   npm run verify:dashboards

import { request } from "node:http";
import { prismaBase } from "@chessplay-clone/db";
import { createSupabaseAdminClient } from "../lib/supabase/admin";

const SUBDOMAIN = process.argv[2] ?? "demo-academy";
// Next reads PORT natively; WEB_PORT is kept for existing .env.local files.
const PORT = Number(process.env.PORT ?? process.env.WEB_PORT ?? 3000);
const HOST = `${SUBDOMAIN}.localhost:${PORT}`;

type Response = { status: number; location: string | null; cookies: string[]; body: string };

// *.localhost doesn't resolve through the OS resolver on Windows, so connect
// to loopback and carry the tenant in the Host header — what middleware reads.
function get(path: string, cookies: string[] = []): Promise<Response> {
  return new Promise((resolve, reject) => {
    const req = request(
      {
        host: "127.0.0.1",
        port: PORT,
        path,
        method: "GET",
        headers: { host: HOST, ...(cookies.length ? { cookie: cookies.join("; ") } : {}) },
      },
      (res) => {
        let body = "";
        res.on("data", (chunk) => (body += chunk));
        res.on("end", () =>
          resolve({
            status: res.statusCode ?? 0,
            location: res.headers.location ?? null,
            cookies: (res.headers["set-cookie"] ?? []).map((c) => c.split(";")[0]),
            body,
          })
        );
      }
    );
    req.on("error", reject);
    req.end();
  });
}

let failures = 0;
const renderedTimes = new Map<string, string[]>();
let parentSawClassrooms = false;

function check(ok: boolean, label: string, detail = "") {
  if (ok) {
    console.log(`  ok    ${label}`);
  } else {
    failures += 1;
    console.error(`  FAIL  ${label}${detail ? ` — ${detail}` : ""}`);
  }
}

async function signIn(email: string): Promise<string[]> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.auth.admin.generateLink({ type: "magiclink", email });
  if (error || !data.properties?.hashed_token) {
    throw new Error(`Could not mint a link for ${email}: ${error?.message}`);
  }
  const res = await get(
    `/auth/callback?token_hash=${data.properties.hashed_token}&type=magiclink&next=/dashboard`
  );
  if (res.cookies.length === 0) {
    throw new Error(`Callback set no cookies for ${email} (status ${res.status})`);
  }
  return res.cookies;
}

// Markers are user-visible copy unique to each branch of the dashboard home.
// Deliberately not test ids: if the copy changes, this should be re-read, not
// silently keep passing against markup nobody looks at.
const ROLES = [
  {
    email: "admin@demo-academy.test",
    label: "ACADEMY_ADMIN",
    markers: ["Welcome back", "Students", "Coaches", "Upcoming sessions"],
    // Coaches and admins mark attendance; students and parents only read it.
    attendance: { navLink: true, paths: ["/dashboard/attendance"] },
  },
  {
    email: "coach@demo-academy.test",
    label: "COACH",
    markers: ["Welcome back", "Your classrooms", "Upcoming sessions"],
    attendance: { navLink: true, paths: ["/dashboard/attendance"] },
  },
  {
    email: "student@demo-academy.test",
    label: "STUDENT",
    markers: ["Welcome back", "Your next sessions", "Homework", "Attendance"],
    attendance: { navLink: false, paths: [] },
  },
  {
    email: "parent@demo-academy.test",
    label: "PARENT",
    markers: ["Welcome back", "Your children", "attendance"],
    attendance: { navLink: false, paths: [] },
  },
];

const ALSO_VISIT = ["/dashboard/classrooms", "/dashboard/homework"];

// "Sat, 03 Aug 2026 at 10:00 GMT+5:30" — the shape formatInZone produces.
function extractSessionTimes(html: string): string[] {
  return [...html.matchAll(/\w{3}, \d{2} \w{3} \d{4} at \d{2}:\d{2} [^<"]*/g)].map((m) =>
    m[0].trim()
  );
}

async function main() {
  const health = await get("/login").catch(() => null);
  if (!health || health.status >= 500) {
    console.error(
      `Dev server not reachable on 127.0.0.1:${PORT}. Start it with \`npm run dev:web\` first.`
    );
    process.exit(1);
  }

  for (const role of ROLES) {
    console.log(`\n${role.label}  (${role.email})`);
    const user = await prismaBase.user.findFirst({
      where: { email: role.email, deletedAt: null },
    });
    if (!user) {
      check(false, "seeded account exists", "run scripts/seedHomeworkDemo.ts first");
      continue;
    }
    check(user.role === role.label, `User.role is ${role.label}`, `got ${user.role}`);

    const cookies = await signIn(role.email);
    const dashboard = await get("/dashboard", cookies);
    check(dashboard.status === 200, "GET /dashboard is 200", `got ${dashboard.status}`);

    for (const marker of role.markers) {
      check(dashboard.body.includes(marker), `renders "${marker}"`);
    }

    // Next renders a generic error page rather than a 500 for a thrown server
    // component, so status alone isn't enough to know the page is healthy.
    check(
      !dashboard.body.includes("Application error") &&
        !dashboard.body.includes("digest"),
      "no server-component error boundary"
    );

    renderedTimes.set(role.label, extractSessionTimes(dashboard.body));

    // The nav link is the visible half of the role gate; the 404 below is the
    // half that actually matters.
    check(
      dashboard.body.includes('href="/dashboard/attendance"') === role.attendance.navLink,
      role.attendance.navLink
        ? "attendance appears in the nav"
        : "attendance is absent from the nav"
    );

    for (const path of ALSO_VISIT) {
      const res = await get(path, cookies);
      check(res.status === 200, `GET ${path} is 200`, `got ${res.status}`);
      if (role.label === "PARENT" && path === "/dashboard/classrooms") {
        parentSawClassrooms = res.body.includes("Demo Classroom");
      }
    }

    for (const path of role.attendance.paths) {
      const res = await get(path, cookies);
      check(res.status === 200, `GET ${path} is 200`, `got ${res.status}`);
      check(res.body.includes("Demo Classroom"), `${path} lists the classroom`);
    }

    // Hiding a nav link is not authorization — a student requesting the URL
    // directly must be refused by the page itself.
    if (!role.attendance.navLink) {
      const res = await get("/dashboard/attendance", cookies);
      check(res.status === 404, "direct /dashboard/attendance request is refused", `got ${res.status}`);
    }
  }

  // The wedge feature, asserted against real rows rather than a unit test:
  // the coach is Asia/Kolkata and the student America/New_York, so the one
  // seeded session must not render as the same wall-clock time for both.
  console.log("\nTime zones");
  const coachTimes = renderedTimes.get("COACH") ?? [];
  const studentTimes = renderedTimes.get("STUDENT") ?? [];
  if (coachTimes.length === 0 || studentTimes.length === 0) {
    check(false, "both roles render the upcoming session", "no formatted time found");
  } else {
    console.log(`  coach   sees: ${coachTimes[0]}`);
    console.log(`  student sees: ${studentTimes[0]}`);
    check(
      coachTimes[0] !== studentTimes[0],
      "same session renders in each viewer's own zone"
    );
  }

  if (parentSawClassrooms) {
    console.warn(
      "\nWARN  A PARENT can see 'Demo Classroom' on /dashboard/classrooms.\n" +
        "      listClassrooms is not role-filtered, so parents and students see\n" +
        "      every classroom in the academy and every roster email. Known gap,\n" +
        "      tracked separately — not a tenant-isolation failure."
    );
  }

  console.log(
    failures === 0
      ? "\nAll dashboards render for all four roles."
      : `\n${failures} check(s) failed.`
  );
  process.exit(failures === 0 ? 0 : 1);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prismaBase.$disconnect());
