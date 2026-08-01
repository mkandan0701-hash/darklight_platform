// Engine strength levels, and the UCI options that produce them.
//
// Stockfish exposes two independent ways to play weaker, and they interact
// badly: `UCI_LimitStrength` + `UCI_Elo` (an Elo-calibrated handicap), and
// `Skill Level` 0-20 (deliberate blunder injection). When UCI_LimitStrength is
// on it *overrides* Skill Level entirely.
//
// So every level emits BOTH options every time — see optionCommandsForLevel.

export type EngineLevel = {
  id: string;
  label: string;
  blurb: string;
  /** 0-20. Ignored by the engine while limitStrength is on. */
  skillLevel: number;
  limitStrength: boolean;
  /** Only meaningful when limitStrength is true. */
  uciElo: number | null;
  /** The `go` command for this level. */
  go: string;
  /** Rough worst-case search time, used to size the caller's timeout guard. */
  budgetMs: number;
};

// The bottom three levels use Skill Level with a depth cap rather than
// UCI_Elo, because UCI_Elo bottoms out at 1320 — already stronger than most
// juniors at an academy.
//
// Labels are deliberately not Elo numbers. Skill Level 0 at depth 1 plays
// somewhere around 1100-1300 depending on position, and printing a specific
// rating we can't stand behind just generates support tickets.
export const ENGINE_LEVELS = [
  {
    id: "l1",
    label: "Level 1 — Learning",
    blurb: "Plays instantly and blunders often. For a first game.",
    skillLevel: 0,
    limitStrength: false,
    uciElo: null,
    go: "go depth 1",
    budgetMs: 1_000,
  },
  {
    id: "l2",
    label: "Level 2 — Beginner",
    blurb: "Sees one-move threats but misses tactics.",
    skillLevel: 3,
    limitStrength: false,
    uciElo: null,
    go: "go depth 3",
    budgetMs: 2_000,
  },
  {
    id: "l3",
    label: "Level 3 — Club",
    blurb: "Punishes hanging pieces and simple tactics.",
    skillLevel: 6,
    limitStrength: false,
    uciElo: null,
    go: "go depth 6",
    budgetMs: 4_000,
  },
  {
    id: "l4",
    label: "Level 4 — Strong",
    blurb: "Solid positional play. A real test for an improving student.",
    skillLevel: 12,
    limitStrength: true,
    uciElo: 1500,
    go: "go movetime 500",
    budgetMs: 1_500,
  },
  {
    id: "l5",
    label: "Level 5 — Expert",
    blurb: "Rarely misses. Expect to be outplayed.",
    skillLevel: 16,
    limitStrength: true,
    uciElo: 2000,
    go: "go movetime 800",
    budgetMs: 2_000,
  },
  {
    id: "l6",
    label: "Level 6 — Maximum",
    blurb: "Full strength, no handicap.",
    skillLevel: 20,
    limitStrength: false,
    uciElo: null,
    go: "go movetime 1000",
    budgetMs: 2_500,
  },
] as const satisfies readonly EngineLevel[];

export type EngineLevelId = (typeof ENGINE_LEVELS)[number]["id"];

export const DEFAULT_ENGINE_LEVEL_ID: EngineLevelId = "l2";

/** Guard for values arriving from a <select> or persisted client storage. */
export function isEngineLevelId(value: unknown): value is EngineLevelId {
  return (
    typeof value === "string" && ENGINE_LEVELS.some((level) => level.id === value)
  );
}

export function getEngineLevel(id: EngineLevelId): EngineLevel {
  const level = ENGINE_LEVELS.find((candidate) => candidate.id === id);
  // Unreachable via isEngineLevelId, but the engine must never be handed a
  // half-configured position.
  if (!level) throw new Error(`Unknown engine level: ${id}`);
  return level;
}

/**
 * The full option set for a level.
 *
 * Always emits Skill Level *and* UCI_LimitStrength, including an explicit
 * `false`. A UCI engine keeps options until told otherwise, so emitting only
 * the options a level "needs" leaves the previous level's handicap in place:
 * switching Level 5 (LimitStrength on, Elo 2000) down to Level 1 would keep
 * limit-strength on and quietly play the whole "Learning" game at 2000.
 */
export function optionCommandsForLevel(id: EngineLevelId): string[] {
  const level = getEngineLevel(id);
  const commands = [
    `setoption name Skill Level value ${level.skillLevel}`,
    `setoption name UCI_LimitStrength value ${level.limitStrength}`,
  ];
  if (level.limitStrength && level.uciElo !== null) {
    commands.push(`setoption name UCI_Elo value ${level.uciElo}`);
  }
  return commands;
}

export function goCommandForLevel(id: EngineLevelId): string {
  return getEngineLevel(id).go;
}

export function budgetMsForLevel(id: EngineLevelId): number {
  return getEngineLevel(id).budgetMs;
}
