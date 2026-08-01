"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { getCurrentSession } from "../../../../lib/auth/session";
import { requireRole } from "../../../../lib/auth/requireRole";
import {
  isValidPuzzle,
  parsePgnPuzzles,
  type ParsedPuzzle,
  type PuzzleParseError,
} from "../../../../lib/puzzles/parsePgnPuzzles";
import { createUploadedPuzzles } from "../../../../repositories/puzzleRepository";

type PreviewResult =
  | { ok: true; puzzles: ParsedPuzzle[]; errors: PuzzleParseError[] }
  | { ok: false; error: string };

export async function previewPgnPuzzlesAction(formData: FormData): Promise<PreviewResult> {
  const session = await getCurrentSession();
  try {
    requireRole(session, ["ACADEMY_ADMIN", "COACH"]);
  } catch {
    return { ok: false, error: "Only coaches and academy admins can upload puzzles" };
  }

  const file = formData.get("pgnFile");
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: "Choose a .pgn file to upload" };
  }

  const text = await file.text();
  if (!text.trim()) {
    return { ok: false, error: "That file is empty" };
  }

  const { puzzles, errors } = parsePgnPuzzles(text);
  if (puzzles.length === 0 && errors.length === 0) {
    return { ok: false, error: "No games found in that file" };
  }

  return { ok: true, puzzles, errors };
}

const ImportSchema = z.array(z.object({ fen: z.string().min(1), moves: z.string().min(1) }));

type ImportResult = { ok: true; imported: number } | { ok: false; error: string };

export async function importPgnPuzzlesAction(puzzles: ParsedPuzzle[]): Promise<ImportResult> {
  const session = await getCurrentSession();
  try {
    requireRole(session, ["ACADEMY_ADMIN", "COACH"]);
  } catch {
    return { ok: false, error: "Only coaches and academy admins can upload puzzles" };
  }

  const parsed = ImportSchema.safeParse(puzzles);
  if (!parsed.success) {
    return { ok: false, error: "Invalid puzzle data" };
  }

  // Never trust the client-held preview data as-is — re-check legality
  // server-side before writing anything.
  const valid = parsed.data.filter(isValidPuzzle);
  if (valid.length === 0) {
    return { ok: false, error: "None of the selected puzzles were valid" };
  }

  await createUploadedPuzzles(session.tenantId, session.id, valid);
  revalidatePath("/dashboard/puzzles");
  return { ok: true, imported: valid.length };
}
