import { NextResponse } from "next/server";
import { getCurrentSession } from "../../../../../../lib/auth/session";
import { UnauthorizedError } from "../../../../../../lib/auth/errors";
import { getFileWithContent } from "../../../../../../repositories/pgnRepository";

// Downloads go through the app, not through a storage URL.
//
// getFileWithContent applies the folder's visibility rule, so this re-checks
// access on every request rather than trusting a link: a student who was sent
// a file id for an unshared folder gets a 404, and a link shared outside the
// academy is worthless because there is no session behind it.
//
// The bytes returned are exactly the bytes uploaded. A PGN that went through a
// parser and came back would have lost its comments and variations.

/** Keeps a quoted filename header well-formed whatever the name contains. */
function contentDisposition(name: string): string {
  const safe = name.replace(/["\\]/g, "_");
  const encoded = encodeURIComponent(name);
  return `attachment; filename="${safe}"; filename*=UTF-8''${encoded}`;
}

export async function GET(_request: Request, { params }: { params: { fileId: string } }) {
  let session;
  try {
    session = await getCurrentSession();
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return new NextResponse("Not signed in", { status: 401 });
    }
    throw err;
  }

  const file = await getFileWithContent(session, params.fileId);
  // Not 403: telling someone a file exists but is not theirs is itself a
  // disclosure, and this route is reachable by id.
  if (!file) {
    return new NextResponse("Not found", { status: 404 });
  }

  return new NextResponse(file.content, {
    status: 200,
    headers: {
      "Content-Type": "application/x-chess-pgn; charset=utf-8",
      "Content-Disposition": contentDisposition(file.name),
      // Coaching material, scoped to one signed-in person — never a shared cache.
      "Cache-Control": "private, no-store",
    },
  });
}
