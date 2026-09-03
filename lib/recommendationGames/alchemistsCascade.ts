export const CASCADE_BOARD_SIZE = 7;
export const CASCADE_INGREDIENT_COUNT = 6;
export const CASCADE_SAVE_SCHEMA = "alchemists_cascade_save_v1" as const;
export const CASCADE_EVENT_SCHEMA = "alchemists_cascade_event_v1" as const;
export const CASCADE_GAME_VERSION = "cascade_campaign_v1" as const;
export const CASCADE_TAXONOMY_VERSION = "novelideas_taste_v1" as const;
// Preference eligibility requires the normalized utility spread to be at most three hundredths.
export const CASCADE_EQUIVALENCE_TOLERANCE = 0.03;
export const CASCADE_MAX_RESOLUTION_STEPS = 64;
export const CASCADE_SAVE_KEY = "novelideas_alchemists_cascade_save_v1";
export const CASCADE_QUEUE_KEY = "novelideas_alchemists_cascade_queue_v1";

export const CASCADE_TAXONOMY = [
  "intensity", "novelty", "social_energy", "structure", "imagination",
  "emotional_depth", "humor", "pace", "challenge", "visual_aesthetic",
] as const;

export type CascadeTasteAxis = typeof CASCADE_TAXONOMY[number];
export type CascadeTasteVector = Partial<Record<CascadeTasteAxis, -2 | -1 | 1 | 2>>;
export type IngredientKind = 0 | 1 | 2 | 3 | 4 | 5;
export type SpecialKind = "none" | "row" | "column" | "burst";
export type Cell = { kind: IngredientKind; special: SpecialKind };
export type Board = Cell[][];
export type Coordinate = { row: number; column: number };
export type MatchGroup = { orientation: "row" | "column"; kind: IngredientKind; cells: Coordinate[] };
export type CascadeStep = {
  index: number;
  groups: MatchGroup[];
  cleared: Coordinate[];
  specialsCreated: { at: Coordinate; special: Exclude<SpecialKind, "none">; kind: IngredientKind }[];
  specialsActivated: { at: Coordinate; special: Exclude<SpecialKind, "none"> }[];
  score: number;
  boardBefore: string;
  boardAfter: string;
};
export type CascadeResolutionFallback = {
  boardBefore: Board;
  rngBefore: number;
  attempts: number;
  inventoryPreserved: boolean;
  reason: "cascade_cycle" | "cascade_safe_max";
  maxSteps: number;
};

export type Rng = { state: number };
export type LevelGoal = { kind: IngredientKind; target: number };
export type Realm = {
  id: string;
  name: string;
  fiction: string;
  background: string;
  surface: string;
  accent: string;
  emphasis: IngredientKind[];
};
export type LevelConfig = {
  id: string;
  number: number;
  realmId: string;
  name: string;
  seed: number;
  moves: number;
  scoreTarget: number;
  goals: LevelGoal[];
};

export const INGREDIENTS = [
  { id: "ember-saffron", name: "Ember Saffron", symbol: "✦", color: "#F36B42", ink: "#29110B" },
  { id: "moon-dew", name: "Moon Dew", symbol: "●", color: "#76D7F2", ink: "#071C25" },
  { id: "thorn-mint", name: "Thorn Mint", symbol: "◆", color: "#62C77C", ink: "#092116" },
  { id: "violet-echo", name: "Violet Echo", symbol: "☾", color: "#B995F4", ink: "#1B0D31" },
  { id: "sun-peel", name: "Sun Peel", symbol: "▲", color: "#F6C957", ink: "#2A2006" },
  { id: "inkberry", name: "Inkberry", symbol: "✚", color: "#F17CB0", ink: "#2E0B1D" },
] as const;

export const CASCADE_REALMS: Realm[] = [
  {
    id: "copper-garden", name: "The Copper Garden",
    fiction: "A greenhouse wakes beneath a rain of tiny brass bells.",
    background: "#171B25", surface: "#252A36", accent: "#F4A261", emphasis: [0, 2],
  },
  {
    id: "tidal-archive", name: "The Tidal Archive",
    fiction: "Every seventh wave returns a recipe the sea tried to forget.",
    background: "#10242C", surface: "#193842", accent: "#73D2DE", emphasis: [1, 3],
  },
  {
    id: "laughing-volcano", name: "The Laughing Volcano",
    fiction: "The mountain rumbles in riddles. Its fire is unusually ticklish.",
    background: "#29171A", surface: "#412327", accent: "#FFB45B", emphasis: [0, 4, 5],
  },
  {
    id: "astral-kitchen", name: "The Astral Kitchen",
    fiction: "Constellations gather around the stove, hungry for impossible soup.",
    background: "#16152E", surface: "#28264B", accent: "#C5A8FF", emphasis: [3, 1, 4],
  },
];

const LEVEL_NAMES = [
  "Bellweather Brew", "Roots Remember", "Copper Rain",
  "Salt-Page Tonic", "The Returning Tide", "Pearl Index",
  "A Joke in Cinders", "Pepper Comet", "The Grinning Crater",
  "Soup of Small Stars", "Midnight Mise en Place", "The Last Bright Flask",
];

export const CASCADE_LEVELS: LevelConfig[] = LEVEL_NAMES.map((name, index) => {
  const realm = CASCADE_REALMS[Math.floor(index / 3)];
  const primary = realm.emphasis[index % realm.emphasis.length];
  const secondary = realm.emphasis[(index + 1) % realm.emphasis.length];
  return {
    id: `level-${index + 1}`,
    number: index + 1,
    realmId: realm.id,
    name,
    seed: (0xA1C4E57 ^ Math.imul(index + 1, 0x9E3779B1)) >>> 0,
    moves: Math.max(17, 24 - Math.floor(index / 2)),
    scoreTarget: 900 + index * 180,
    goals: index < 2
      ? [{ kind: primary, target: 12 + index * 2 }]
      : [{ kind: primary, target: 13 + index }, { kind: secondary, target: 8 + Math.floor(index / 2) }],
  };
});

export function nextRandom(rng: Rng): number {
  rng.state = (Math.imul(rng.state >>> 0, 1664525) + 1013904223) >>> 0;
  return rng.state / 0x100000000;
}

export function createRng(seed: number): Rng {
  return { state: (seed >>> 0) || 0x6D2B79F5 };
}

function randomKind(rng: Rng, excluded: IngredientKind[] = []): IngredientKind {
  const candidates = ([0, 1, 2, 3, 4, 5] as IngredientKind[]).filter((kind) => !excluded.includes(kind));
  return candidates[Math.floor(nextRandom(rng) * candidates.length)] || 0;
}

export function cloneBoard(board: Board): Board {
  return board.map((row) => row.map((cell) => ({ ...cell })));
}

export function encodeBoard(board: Board): string {
  return board.flat().map((cell) => `${cell.kind}${cell.special === "none" ? "n" : cell.special[0]}`).join("");
}

export function decodeBoard(encoded: string): Board | null {
  if (encoded.length !== CASCADE_BOARD_SIZE * CASCADE_BOARD_SIZE * 2) return null;
  const specialMap: Record<string, SpecialKind> = { n: "none", r: "row", c: "column", b: "burst" };
  const board: Board = [];
  for (let row = 0; row < CASCADE_BOARD_SIZE; row += 1) {
    const cells: Cell[] = [];
    for (let column = 0; column < CASCADE_BOARD_SIZE; column += 1) {
      const offset = (row * CASCADE_BOARD_SIZE + column) * 2;
      const kind = Number(encoded[offset]);
      const special = specialMap[encoded[offset + 1]];
      if (!Number.isInteger(kind) || kind < 0 || kind >= CASCADE_INGREDIENT_COUNT || !special) return null;
      cells.push({ kind: kind as IngredientKind, special });
    }
    board.push(cells);
  }
  return board;
}

export function boardChecksum(encodedOrBoard: string | Board): string {
  const text = typeof encodedOrBoard === "string" ? encodedOrBoard : encodeBoard(encodedOrBoard);
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) hash = Math.imul(hash ^ text.charCodeAt(index), 16777619);
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function coordKey(value: Coordinate): string {
  return `${value.row},${value.column}`;
}

export function isAdjacent(a: Coordinate, b: Coordinate): boolean {
  return Math.abs(a.row - b.row) + Math.abs(a.column - b.column) === 1;
}

function inBoard(at: Coordinate): boolean {
  return at.row >= 0 && at.row < CASCADE_BOARD_SIZE && at.column >= 0 && at.column < CASCADE_BOARD_SIZE;
}

export function findMatches(board: Board): MatchGroup[] {
  const groups: MatchGroup[] = [];
  for (let row = 0; row < CASCADE_BOARD_SIZE; row += 1) {
    let start = 0;
    for (let column = 1; column <= CASCADE_BOARD_SIZE; column += 1) {
      if (column === CASCADE_BOARD_SIZE || board[row][column].kind !== board[row][start].kind) {
        if (column - start >= 3) groups.push({
          orientation: "row",
          kind: board[row][start].kind,
          cells: Array.from({ length: column - start }, (_, offset) => ({ row, column: start + offset })),
        });
        start = column;
      }
    }
  }
  for (let column = 0; column < CASCADE_BOARD_SIZE; column += 1) {
    let start = 0;
    for (let row = 1; row <= CASCADE_BOARD_SIZE; row += 1) {
      if (row === CASCADE_BOARD_SIZE || board[row][column].kind !== board[start][column].kind) {
        if (row - start >= 3) groups.push({
          orientation: "column",
          kind: board[start][column].kind,
          cells: Array.from({ length: row - start }, (_, offset) => ({ row: start + offset, column })),
        });
        start = row;
      }
    }
  }
  return groups;
}

function swapCells(board: Board, a: Coordinate, b: Coordinate): void {
  const value = board[a.row][a.column];
  board[a.row][a.column] = board[b.row][b.column];
  board[b.row][b.column] = value;
}

export type LegalMove = { from: Coordinate; to: Coordinate; estimatedScore: number; estimatedGoalHits: number };

function createsMatch(board: Board, from: Coordinate, to: Coordinate): boolean {
  const copy = cloneBoard(board);
  swapCells(copy, from, to);
  return findMatches(copy).length > 0;
}

export function findLegalMoves(board: Board, goals: LevelGoal[] = []): LegalMove[] {
  const moves: LegalMove[] = [];
  for (let row = 0; row < CASCADE_BOARD_SIZE; row += 1) {
    for (let column = 0; column < CASCADE_BOARD_SIZE; column += 1) {
      const from = { row, column };
      for (const to of [{ row, column: column + 1 }, { row: row + 1, column }]) {
        if (!inBoard(to) || !createsMatch(board, from, to)) continue;
        const copy = cloneBoard(board);
        swapCells(copy, from, to);
        const groups = findMatches(copy);
        const unique = new Set(groups.flatMap((group) => group.cells.map(coordKey)));
        const goalKinds = new Set(goals.map((goal) => goal.kind));
        const goalHits = [...unique].filter((key) => {
          const [r, c] = key.split(",").map(Number);
          return goalKinds.has(copy[r][c].kind);
        }).length;
        moves.push({ from, to, estimatedScore: unique.size * 60 + Math.max(0, groups.length - 1) * 120, estimatedGoalHits: goalHits });
      }
    }
  }
  return moves;
}

export function createBoard(seedOrRng: number | Rng): { board: Board; rng: Rng } {
  const rng = typeof seedOrRng === "number" ? createRng(seedOrRng) : seedOrRng;
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const board: Board = [];
    for (let row = 0; row < CASCADE_BOARD_SIZE; row += 1) {
      const cells: Cell[] = [];
      for (let column = 0; column < CASCADE_BOARD_SIZE; column += 1) {
        const excluded: IngredientKind[] = [];
        if (column >= 2 && cells[column - 1].kind === cells[column - 2].kind) excluded.push(cells[column - 1].kind);
        if (row >= 2 && board[row - 1][column].kind === board[row - 2][column].kind) excluded.push(board[row - 1][column].kind);
        cells.push({ kind: randomKind(rng, excluded), special: "none" });
      }
      board.push(cells);
    }
    if (findMatches(board).length === 0 && findLegalMoves(board).length > 0) return { board, rng };
  }
  const template = [
    [0, 1, 0, 3, 3, 0, 2],
    [1, 2, 5, 5, 4, 5, 2],
    [1, 4, 3, 5, 2, 0, 1],
    [0, 3, 1, 2, 2, 3, 3],
    [4, 0, 3, 4, 0, 0, 1],
    [3, 4, 1, 3, 0, 5, 0],
    [4, 3, 0, 0, 5, 1, 4],
  ] as IngredientKind[][];
  const permutation = [0, 1, 2, 3, 4, 5] as IngredientKind[];
  for (let index = permutation.length - 1; index > 0; index -= 1) {
    const other = Math.floor(nextRandom(rng) * (index + 1));
    [permutation[index], permutation[other]] = [permutation[other], permutation[index]];
  }
  return {
    board: template.map((row) => row.map((kind) => ({ kind: permutation[kind], special: "none" }))),
    rng,
  };
}

function chooseSpecialCell(group: MatchGroup, preferred: Coordinate[]): Coordinate {
  return preferred.find((candidate) => group.cells.some((cell) => coordKey(cell) === coordKey(candidate)))
    || group.cells[Math.floor(group.cells.length / 2)];
}

function effectCells(board: Board, at: Coordinate, special: Exclude<SpecialKind, "none">): Coordinate[] {
  if (special === "row") return Array.from({ length: CASCADE_BOARD_SIZE }, (_, column) => ({ row: at.row, column }));
  if (special === "column") return Array.from({ length: CASCADE_BOARD_SIZE }, (_, row) => ({ row, column: at.column }));
  const cells: Coordinate[] = [];
  for (let row = at.row - 1; row <= at.row + 1; row += 1) {
    for (let column = at.column - 1; column <= at.column + 1; column += 1) {
      if (inBoard({ row, column })) cells.push({ row, column });
    }
  }
  return cells;
}

function refill(board: Board, rng: Rng): void {
  for (let column = 0; column < CASCADE_BOARD_SIZE; column += 1) {
    const survivors: Cell[] = [];
    for (let row = CASCADE_BOARD_SIZE - 1; row >= 0; row -= 1) {
      const cell = board[row][column];
      if (cell) survivors.push(cell);
    }
    for (let row = CASCADE_BOARD_SIZE - 1; row >= 0; row -= 1) {
      board[row][column] = survivors[CASCADE_BOARD_SIZE - 1 - row]
        || { kind: randomKind(rng), special: "none" };
    }
  }
}

export function resolveBoard(
  initialBoard: Board,
  rng: Rng,
  preferredSpecialCells: Coordinate[] = [],
  maxSteps = CASCADE_MAX_RESOLUTION_STEPS,
): {
  board: Board;
  rng: Rng;
  steps: CascadeStep[];
  score: number;
  collected: number[];
  fallback: CascadeResolutionFallback | null;
} {
  const board = cloneBoard(initialBoard);
  const steps: CascadeStep[] = [];
  const collected = Array(CASCADE_INGREDIENT_COUNT).fill(0) as number[];
  const resolutionLimit = Math.max(1, Math.min(CASCADE_MAX_RESOLUTION_STEPS, Math.floor(maxSteps)));
  const seenBoards = new Set<string>();
  let fallbackReason: CascadeResolutionFallback["reason"] = "cascade_safe_max";
  for (let cascade = 0; cascade < resolutionLimit; cascade += 1) {
    const groups = findMatches(board);
    if (!groups.length) break;
    const boardBefore = encodeBoard(board);
    if (seenBoards.has(boardBefore)) {
      fallbackReason = "cascade_cycle";
      break;
    }
    seenBoards.add(boardBefore);
    const matched = new Map<string, Coordinate>();
    groups.forEach((group) => group.cells.forEach((cell) => matched.set(coordKey(cell), cell)));
    const specialsCreated: CascadeStep["specialsCreated"] = [];
    const intersections = new Map<string, number>();
    groups.forEach((group) => group.cells.forEach((cell) => intersections.set(coordKey(cell), (intersections.get(coordKey(cell)) || 0) + 1)));
    const reserved = new Map<string, Cell>();
    for (const group of groups) {
      if (group.cells.length < 4) continue;
      const at = chooseSpecialCell(group, cascade === 0 ? preferredSpecialCells : []);
      const special: Exclude<SpecialKind, "none"> = group.cells.length >= 5
        ? "burst" : group.orientation === "row" ? "row" : "column";
      reserved.set(coordKey(at), { kind: group.kind, special });
    }
    for (const [key, count] of intersections) {
      if (count > 1) {
        const [row, column] = key.split(",").map(Number);
        reserved.set(key, { kind: board[row][column].kind, special: "burst" });
      }
    }
    const activated: CascadeStep["specialsActivated"] = [];
    const clear = new Map(matched);
    const pendingSpecials = [...matched.values()].filter((cell) => board[cell.row][cell.column].special !== "none");
    const seenSpecials = new Set<string>();
    while (pendingSpecials.length) {
      const cell = pendingSpecials.shift()!;
      const key = coordKey(cell);
      const special = board[cell.row][cell.column].special;
      if (special === "none" || seenSpecials.has(key)) continue;
      seenSpecials.add(key);
      activated.push({ at: cell, special });
      for (const effect of effectCells(board, cell, special)) {
        clear.set(coordKey(effect), effect);
        if (board[effect.row][effect.column].special !== "none") pendingSpecials.push(effect);
      }
    }
    for (const [key, cell] of reserved) {
      clear.delete(key);
      const [row, column] = key.split(",").map(Number);
      specialsCreated.push({ at: { row, column }, special: cell.special as Exclude<SpecialKind, "none">, kind: cell.kind });
    }
    for (const cell of clear.values()) {
      collected[board[cell.row][cell.column].kind] += 1;
      (board[cell.row] as (Cell | null)[])[cell.column] = null;
    }
    for (const [key, cell] of reserved) {
      const [row, column] = key.split(",").map(Number);
      board[row][column] = cell;
    }
    refill(board, rng);
    const multiplier = cascade + 1;
    const stepScore = clear.size * 60 * multiplier + specialsCreated.length * 180 + activated.length * 220;
    steps.push({
      index: cascade + 1, groups, cleared: [...clear.values()], specialsCreated,
      specialsActivated: activated, score: stepScore, boardBefore, boardAfter: encodeBoard(board),
    });
  }
  let fallback: CascadeResolutionFallback | null = null;
  let stableBoard = board;
  if (findMatches(board).length) {
    const rngBefore = rng.state;
    const shuffled = reshuffleDeadBoard(board, rng);
    stableBoard = shuffled.board;
    fallback = {
      boardBefore: cloneBoard(board),
      rngBefore,
      attempts: shuffled.attempts,
      inventoryPreserved: shuffled.attempts <= 200,
      reason: fallbackReason,
      maxSteps: resolutionLimit,
    };
  }
  return {
    board: stableBoard,
    rng,
    steps,
    score: steps.reduce((sum, step) => sum + step.score, 0),
    collected,
    fallback,
  };
}

export function reshuffleDeadBoard(board: Board, rng: Rng): { board: Board; rng: Rng; attempts: number } {
  const inventory = board.flat().map((cell) => ({ ...cell }));
  for (let attempt = 1; attempt <= 200; attempt += 1) {
    const shuffled = inventory.map((cell) => ({ ...cell }));
    for (let index = shuffled.length - 1; index > 0; index -= 1) {
      const other = Math.floor(nextRandom(rng) * (index + 1));
      [shuffled[index], shuffled[other]] = [shuffled[other], shuffled[index]];
    }
    const candidate = Array.from({ length: CASCADE_BOARD_SIZE }, (_, row) =>
      shuffled.slice(row * CASCADE_BOARD_SIZE, (row + 1) * CASCADE_BOARD_SIZE));
    if (!findMatches(candidate).length && findLegalMoves(candidate).length) return { board: candidate, rng, attempts: attempt };
  }
  const generated = createBoard(rng);
  return { board: generated.board, rng: generated.rng, attempts: 201 };
}

export type MoveResolution = {
  valid: boolean;
  reason?: "not_adjacent" | "no_match";
  board: Board;
  rng: Rng;
  scoreDelta: number;
  collected: number[];
  steps: CascadeStep[];
  reshuffled: boolean;
  reshuffleInventoryPreserved: boolean;
  reshuffleRngBefore: number | null;
  reshuffleAttempts: number;
  legalMovesBefore: LegalMove[];
};

export function applySwap(board: Board, rngState: number, from: Coordinate, to: Coordinate, goals: LevelGoal[] = []): MoveResolution {
  const legalMovesBefore = findLegalMoves(board, goals);
  if (!inBoard(from) || !inBoard(to) || !isAdjacent(from, to)) {
    return { valid: false, reason: "not_adjacent", board: cloneBoard(board), rng: createRng(rngState), scoreDelta: 0, collected: Array(6).fill(0), steps: [], reshuffled: false, reshuffleInventoryPreserved: true, reshuffleRngBefore: null, reshuffleAttempts: 0, legalMovesBefore };
  }
  const swapped = cloneBoard(board);
  swapCells(swapped, from, to);
  if (!findMatches(swapped).length) {
    return { valid: false, reason: "no_match", board: cloneBoard(board), rng: createRng(rngState), scoreDelta: 0, collected: Array(6).fill(0), steps: [], reshuffled: false, reshuffleInventoryPreserved: true, reshuffleRngBefore: null, reshuffleAttempts: 0, legalMovesBefore };
  }
  const resolved = resolveBoard(swapped, createRng(rngState), [to, from]);
  let finalBoard = resolved.board;
  let reshuffled = Boolean(resolved.fallback);
  let reshuffleInventoryPreserved = resolved.fallback?.inventoryPreserved ?? true;
  let reshuffleRngBefore: number | null = resolved.fallback?.rngBefore ?? null;
  let reshuffleAttempts = resolved.fallback?.attempts ?? 0;
  if (!reshuffled && !findLegalMoves(finalBoard).length) {
    reshuffleRngBefore = resolved.rng.state;
    const shuffle = reshuffleDeadBoard(finalBoard, resolved.rng);
    finalBoard = shuffle.board;
    reshuffled = true;
    reshuffleAttempts = shuffle.attempts;
    reshuffleInventoryPreserved = shuffle.attempts <= 200;
  }
  return { valid: true, board: finalBoard, rng: resolved.rng, scoreDelta: resolved.score, collected: resolved.collected, steps: resolved.steps, reshuffled, reshuffleInventoryPreserved, reshuffleRngBefore, reshuffleAttempts, legalMovesBefore };
}

export type CatalystMechanic = {
  type: "clear_row" | "clear_column" | "distill_color";
  target: number;
  clearCount: 7;
};
export type CatalystOption = {
  id: string;
  version: 1;
  title: string;
  copy: string;
  mechanic: CatalystMechanic;
  normalizedMechanicalEstimate: number;
  taxonomyVersion: typeof CASCADE_TAXONOMY_VERSION;
  tasteVector: CascadeTasteVector;
  tags: readonly string[];
  manifestation: {
    symbol: string;
    color: string;
    outcomeText: string;
  };
};

const CATALYST_COPY = [
  {
    id: "hearth-song", title: "Sing to the flame", copy: "A bright, daring line of fire answers in kind.",
    vector: { intensity: 2, pace: 1, humor: 1 } satisfies CascadeTasteVector,
    tags: ["bold", "playful", "kinetic"],
    manifestation: {
      symbol: "✦", color: "#FF805C",
      outcomeText: "The chosen seven answer with a bright, laughing flare.",
    },
  },
  {
    id: "lunar-proof", title: "Follow the old notation", copy: "A measured silver column obeys a trusted recipe.",
    vector: { structure: 2, novelty: -1, emotional_depth: 1 } satisfies CascadeTasteVector,
    tags: ["ordered", "familiar", "reflective"],
    manifestation: {
      symbol: "☾", color: "#8EDDF4",
      outcomeText: "The chosen seven settle into a measured silver cadence.",
    },
  },
  {
    id: "wild-distillation", title: "Invite the impossible", copy: "Seven scattered sparks find a strange new pattern.",
    vector: { imagination: 2, novelty: 2, structure: -1 } satisfies CascadeTasteVector,
    tags: ["surreal", "unfamiliar", "wandering"],
    manifestation: {
      symbol: "◈", color: "#C6A1FF",
      outcomeText: "The chosen seven spiral away through an impossible violet door.",
    },
  },
] as const;
/** Read-only export of the catalyst copy library for illustrative, non-gameplay-affecting use
 * (e.g. developer screenshot fixtures) so any preview surface can show real catalyst titles
 * instead of fabricated placeholder names. */
export const CASCADE_CATALYST_COPY = CATALYST_COPY;

function hashText(input: string): number {
  let value = 2166136261;
  for (let index = 0; index < input.length; index += 1) value = Math.imul(value ^ input.charCodeAt(index), 16777619);
  return value >>> 0;
}

export function sha256Digest(input: string): string {
  const bytes = new TextEncoder().encode(input);
  const bitLength = bytes.length * 8;
  const paddedLength = Math.ceil((bytes.length + 9) / 64) * 64;
  const padded = new Uint8Array(paddedLength);
  padded.set(bytes);
  padded[bytes.length] = 0x80;
  const view = new DataView(padded.buffer);
  view.setUint32(paddedLength - 8, Math.floor(bitLength / 0x100000000));
  view.setUint32(paddedLength - 4, bitLength >>> 0);
  const constants = new Uint32Array([
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
  ]);
  const state = new Uint32Array([
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
    0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
  ]);
  const words = new Uint32Array(64);
  const rotate = (value: number, amount: number) => (value >>> amount) | (value << (32 - amount));
  for (let offset = 0; offset < paddedLength; offset += 64) {
    for (let index = 0; index < 16; index += 1) words[index] = view.getUint32(offset + index * 4);
    for (let index = 16; index < 64; index += 1) {
      const a = words[index - 15];
      const b = words[index - 2];
      const s0 = rotate(a, 7) ^ rotate(a, 18) ^ (a >>> 3);
      const s1 = rotate(b, 17) ^ rotate(b, 19) ^ (b >>> 10);
      words[index] = (words[index - 16] + s0 + words[index - 7] + s1) >>> 0;
    }
    let [a, b, c, d, e, f, g, h] = state;
    for (let index = 0; index < 64; index += 1) {
      const s1 = rotate(e, 6) ^ rotate(e, 11) ^ rotate(e, 25);
      const choice = (e & f) ^ (~e & g);
      const temp1 = (h + s1 + choice + constants[index] + words[index]) >>> 0;
      const s0 = rotate(a, 2) ^ rotate(a, 13) ^ rotate(a, 22);
      const majority = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (s0 + majority) >>> 0;
      h = g; g = f; f = e; e = (d + temp1) >>> 0;
      d = c; c = b; b = a; a = (temp1 + temp2) >>> 0;
    }
    [a, b, c, d, e, f, g, h].forEach((value, index) => { state[index] = (state[index] + value) >>> 0; });
  }
  return [...state].map((value) => value.toString(16).padStart(8, "0")).join("");
}

export function catalystOutcomeUtility(result: ReturnType<typeof applyCatalyst>, goals: LevelGoal[]): number {
  const goalTarget = goals.reduce((sum, goal) => sum + goal.target, 0);
  const goalProgress = goalTarget
    ? goals.reduce((sum, goal) => sum + Math.min(goal.target, result.collected[goal.kind]), 0) / goalTarget
    : 0;
  const legalMoves = findLegalMoves(result.board, goals);
  const bestMove = legalMoves.reduce((best, move) =>
    Math.max(best, Math.min(1, move.estimatedScore / 900) * 0.6 + Math.min(1, move.estimatedGoalHits / 5) * 0.4), 0);
  const specials = result.board.flat().filter((cell) => cell.special !== "none").length;
  const utility = Math.min(1, result.scoreDelta / 3_000) * 0.38
    + goalProgress * 0.34
    + Math.min(1, legalMoves.length / 18) * 0.13
    + bestMove * 0.09
    + Math.min(1, specials / 5) * 0.03
    + Math.min(1, result.cascadeSteps.length / 5) * 0.03;
  return Math.round(utility * 1_000_000) / 1_000_000;
}

export function catalystOptions(
  board: Board,
  playerId: string,
  occasion: number,
  rngState = hashText(encodeBoard(board)),
  goals: LevelGoal[] = [],
): CatalystOption[] {
  let sharedMechanic: CatalystMechanic = { type: "clear_row", target: 0, clearCount: 7 };
  let sharedUtility = -1;
  for (const candidate of [
    { type: "clear_row" as const, targets: 7 },
    { type: "clear_column" as const, targets: 7 },
    { type: "distill_color" as const, targets: 6 },
  ]) {
    for (let target = 0; target < candidate.targets; target += 1) {
      const mechanic: CatalystMechanic = { type: candidate.type, target, clearCount: 7 };
      const utility = catalystOutcomeUtility(applyCatalyst(board, rngState, {
        id: CATALYST_COPY[0].id,
        title: CATALYST_COPY[0].title,
        copy: CATALYST_COPY[0].copy,
        tags: CATALYST_COPY[0].tags,
        manifestation: CATALYST_COPY[0].manifestation,
        version: 1,
        mechanic,
        normalizedMechanicalEstimate: 0,
        taxonomyVersion: CASCADE_TAXONOMY_VERSION,
        tasteVector: CATALYST_COPY[0].vector,
      }), goals);
      if (utility > sharedUtility) {
        sharedUtility = utility;
        sharedMechanic = mechanic;
      }
    }
  }
  const options = CATALYST_COPY.map((copy) => {
    const mechanic = { ...sharedMechanic };
    const simulatedUtility = catalystOutcomeUtility(applyCatalyst(board, rngState, {
      id: copy.id,
      title: copy.title,
      copy: copy.copy,
      tags: copy.tags,
      manifestation: copy.manifestation,
      version: 1,
      mechanic,
      normalizedMechanicalEstimate: 0,
      taxonomyVersion: CASCADE_TAXONOMY_VERSION,
      tasteVector: copy.vector,
    }), goals);
    return {
      id: copy.id, title: copy.title, copy: copy.copy, tags: copy.tags, manifestation: copy.manifestation,
      version: 1 as const, mechanic,
      normalizedMechanicalEstimate: simulatedUtility,
      taxonomyVersion: CASCADE_TAXONOMY_VERSION, tasteVector: copy.vector,
    };
  });
  const start = (hashText(`${playerId}:catalyst-v2`) + occasion) % options.length;
  return options.map((_, index) => options[(index + start) % options.length]);
}

export function mechanicalEquivalence(estimates: number[], tolerance = CASCADE_EQUIVALENCE_TOLERANCE): {
  eligible: boolean; spread: number; tolerance: number;
} {
  if (estimates.length < 2 || estimates.some((value) => !Number.isFinite(value) || value < 0 || value > 2)) {
    return { eligible: false, spread: Number.POSITIVE_INFINITY, tolerance };
  }
  const spread = Math.max(...estimates) - Math.min(...estimates);
  return { eligible: spread <= tolerance + Number.EPSILON, spread, tolerance };
}

function catalystCoordinates(board: Board, mechanic: CatalystMechanic): Coordinate[] {
  if (mechanic.type === "clear_row") return Array.from({ length: 7 }, (_, column) => ({ row: mechanic.target, column }));
  if (mechanic.type === "clear_column") return Array.from({ length: 7 }, (_, row) => ({ row, column: mechanic.target }));
  const matching: Coordinate[] = [];
  const fallback: Coordinate[] = [];
  for (let row = 0; row < 7; row += 1) for (let column = 0; column < 7; column += 1) {
    const at = { row, column };
    (board[row][column].kind === mechanic.target ? matching : fallback).push(at);
  }
  return [...matching, ...fallback].slice(0, 7);
}

export function applyCatalyst(board: Board, rngState: number, option: CatalystOption): {
  board: Board; rng: Rng; cleared: Coordinate[]; scoreDelta: number; collected: number[];
  reshuffled: boolean; reshuffleInventoryPreserved: boolean; boardBeforeReshuffle: Board;
  cascadeSteps: CascadeStep[]; reshuffleRngBefore: number | null; reshuffleAttempts: number;
} {
  const next = cloneBoard(board);
  const rng = createRng(rngState);
  const cleared = catalystCoordinates(next, option.mechanic);
  const collected = Array(6).fill(0) as number[];
  for (const at of cleared) {
    collected[next[at.row][at.column].kind] += 1;
    (next[at.row] as (Cell | null)[])[at.column] = null;
  }
  refill(next, rng);
  const resolved = resolveBoard(next, rng);
  resolved.collected.forEach((count, index) => { collected[index] += count; });
  const needsDeadBoardShuffle = !resolved.fallback && !findLegalMoves(resolved.board).length;
  const reshuffleRngBefore = resolved.fallback?.rngBefore ?? (needsDeadBoardShuffle ? rng.state : null);
  const shuffle = needsDeadBoardShuffle ? reshuffleDeadBoard(resolved.board, rng) : null;
  const fallbackBoard = resolved.fallback?.boardBefore;
  return {
    board: shuffle?.board || resolved.board, rng, cleared, scoreDelta: 420 + resolved.score, collected,
    reshuffled: Boolean(shuffle || resolved.fallback),
    reshuffleInventoryPreserved: resolved.fallback?.inventoryPreserved ?? (!shuffle || shuffle.attempts <= 200),
    boardBeforeReshuffle: fallbackBoard || resolved.board,
    cascadeSteps: resolved.steps,
    reshuffleRngBefore,
    reshuffleAttempts: resolved.fallback?.attempts ?? shuffle?.attempts ?? 0,
  };
}

export type ActiveLevel = {
  levelId: string;
  attempt: number;
  board: string;
  rngState: number;
  movesRemaining: number;
  score: number;
  collected: number[];
  catalystUsed: boolean;
  startedAt: string;
};

export type CascadeSaveV1 = {
  schemaVersion: typeof CASCADE_SAVE_SCHEMA;
  revision: number;
  anonymousPlayerId: string;
  libraryScopeId: string;
  gameSessionId: string;
  unlockedLevel: number;
  levelStars: Record<string, number>;
  activeLevel: ActiveLevel | null;
  tutorialSeen: boolean;
  catalystOccasion: number;
  playSessionCount: number;
  committedEventIds: string[];
  lastOperationId: string | null;
  updatedAt: string;
};

export type CascadeExpectedState = {
  libraryScopeId: string;
  gameSessionId: string;
  revision: number;
  activeLevelId: string | null;
  activeAttempt: number | null;
  activeBoard: string | null;
  activeBoardChecksum: string | null;
  activeLevelState: string | null;
};

export function captureCascadeExpectedState(rendered: CascadeSaveV1): CascadeExpectedState {
  const active = rendered.activeLevel;
  return {
    libraryScopeId: normalizeLibraryScope(rendered.libraryScopeId),
    gameSessionId: rendered.gameSessionId,
    revision: rendered.revision,
    activeLevelId: active?.levelId || null,
    activeAttempt: active?.attempt || null,
    activeBoard: active?.board || null,
    activeBoardChecksum: active ? boardChecksum(active.board) : null,
    activeLevelState: active ? JSON.stringify(active) : null,
  };
}

export function assertCascadeExpectedState(
  current: CascadeSaveV1,
  expected: CascadeExpectedState,
): void {
  const active = current.activeLevel;
  const currentBoardChecksum = active ? boardChecksum(active.board) : null;
  if (expected.libraryScopeId !== normalizeLibraryScope(expected.libraryScopeId)
    || current.libraryScopeId !== expected.libraryScopeId
    || current.gameSessionId !== expected.gameSessionId
    || current.revision !== expected.revision
    || (active?.levelId || null) !== expected.activeLevelId
    || (active?.attempt || null) !== expected.activeAttempt
    || (active?.board || null) !== expected.activeBoard
    || currentBoardChecksum !== expected.activeBoardChecksum
    || (active ? JSON.stringify(active) : null) !== expected.activeLevelState) {
    throw new Error("stale_cascade_session");
  }
}

export function assertCascadeLevelOpenCurrent(
  current: CascadeSaveV1,
  requestedLevelId: string,
  requestedLevelNumber: number,
  expectedGameSessionId: string,
  expectedRevision: number,
): LevelConfig {
  if (current.gameSessionId !== expectedGameSessionId || current.revision !== expectedRevision) {
    throw new Error("stale_cascade_session");
  }
  const level = CASCADE_LEVELS[requestedLevelNumber - 1];
  if (!level || level.id !== requestedLevelId || requestedLevelNumber > current.unlockedLevel) {
    throw new Error("cascade_level_locked_or_invalid");
  }
  return level;
}

export function normalizeLibraryScope(value: unknown): string {
  const normalized = String(value || "default").trim().toLowerCase().replace(/[^a-z0-9_-]/g, "-").replace(/-+/g, "-").slice(0, 64);
  return normalized || "default";
}

export function createCascadeScope(playerId: unknown, libraryId: unknown): {
  scopeKey: string; anonymousPlayerId: string; libraryScopeId: string;
} {
  const libraryScopeId = normalizeLibraryScope(libraryId);
  const player = String(playerId || "guest").trim().slice(0, 120);
  const digest = sha256Digest(`${libraryScopeId}:${player}`);
  return { scopeKey: `${libraryScopeId}:${digest}`, anonymousPlayerId: `cascade-player-${digest}`, libraryScopeId };
}

export function scopedCascadeKey(base: string, scopeKey: string): string {
  return `${base}:${scopeKey.replace(/[^a-zA-Z0-9:_-]/g, "-").slice(0, 150)}`;
}

export function createInitialCascadeSave(
  playerId: string,
  libraryScopeId: string,
  now: string,
  gameSessionId = `cascade-session-${sha256Digest(`${playerId}:${now}`).slice(0, 24)}`,
): CascadeSaveV1 {
  return {
    schemaVersion: CASCADE_SAVE_SCHEMA, revision: 0, anonymousPlayerId: playerId,
    libraryScopeId: normalizeLibraryScope(libraryScopeId), gameSessionId, unlockedLevel: 1, levelStars: {},
    activeLevel: null, tutorialSeen: false, catalystOccasion: 0, playSessionCount: 0,
    committedEventIds: [], lastOperationId: null, updatedAt: now,
  };
}

export function createActiveLevel(config: LevelConfig, now: string, attempt = 1): ActiveLevel {
  if (!Number.isSafeInteger(attempt) || attempt < 1 || attempt > 10_000) {
    throw new Error("invalid_cascade_level_attempt");
  }
  const generated = createBoard(config.seed);
  return {
    levelId: config.id, attempt, board: encodeBoard(generated.board), rngState: generated.rng.state,
    movesRemaining: config.moves, score: 0, collected: Array(6).fill(0),
    catalystUsed: false, startedAt: now,
  };
}

export function levelWon(active: ActiveLevel, config: LevelConfig): boolean {
  return active.score >= config.scoreTarget && config.goals.every((goal) => active.collected[goal.kind] >= goal.target);
}

export function levelStars(active: ActiveLevel, config: LevelConfig): number {
  if (!levelWon(active, config)) return 0;
  if (active.score >= config.scoreTarget * 1.8) return 3;
  if (active.score >= config.scoreTarget * 1.35) return 2;
  return 1;
}

export type ActiveLevelPhase = "catalyst" | "play" | "won" | "lost";

export function activeLevelPhase(active: ActiveLevel, config: LevelConfig): ActiveLevelPhase {
  if (levelWon(active, config)) return "won";
  if (active.movesRemaining <= 0) return "lost";
  return active.catalystUsed ? "play" : "catalyst";
}

export function restoreCascadeSave(raw: string | null, libraryScopeId: string): CascadeSaveV1 | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Partial<CascadeSaveV1>;
    if (value.schemaVersion !== CASCADE_SAVE_SCHEMA || value.libraryScopeId !== normalizeLibraryScope(libraryScopeId)
      || typeof value.anonymousPlayerId !== "string" || !/^cascade-player-[a-z0-9]{7,64}$/.test(value.anonymousPlayerId)
      || !Number.isInteger(value.revision) || value.revision! < 0
      || typeof value.gameSessionId !== "string" || !/^cascade-session-[a-zA-Z0-9-]{8,120}$/.test(value.gameSessionId)
      || !Number.isInteger(value.unlockedLevel) || value.unlockedLevel! < 1 || value.unlockedLevel! > CASCADE_LEVELS.length
      || !value.levelStars || typeof value.levelStars !== "object" || Array.isArray(value.levelStars)
      || Object.entries(value.levelStars).some(([levelId, stars]) =>
        !CASCADE_LEVELS.some((level) => level.id === levelId) || !Number.isInteger(stars) || stars < 0 || stars > 3)
      || !Array.isArray(value.committedEventIds) || value.committedEventIds.length > 2048
      || new Set(value.committedEventIds).size !== value.committedEventIds.length
      || value.committedEventIds.some((eventId) => !/^ace-[a-f0-9]{64}$/.test(eventId))
      || !Number.isSafeInteger(value.catalystOccasion) || value.catalystOccasion! < 0
      || value.catalystOccasion! > CASCADE_LEVELS.length * 10_000
      || !Number.isInteger(value.playSessionCount) || value.playSessionCount! < 0
      || typeof value.tutorialSeen !== "boolean" || typeof value.updatedAt !== "string"
      || !Number.isFinite(Date.parse(value.updatedAt))
      || !(value.lastOperationId === null || (typeof value.lastOperationId === "string" && value.lastOperationId.length <= 200))) return null;
    if (value.activeLevel) {
      const active = value.activeLevel;
      const config = CASCADE_LEVELS.find((level) => level.id === active.levelId);
      if (!config || !decodeBoard(active.board)
        || !Number.isSafeInteger(active.attempt) || active.attempt < 1 || active.attempt > 10_000
        || !Number.isInteger(active.rngState) || active.rngState < 0 || active.rngState > 0xFFFFFFFF
        || !Number.isInteger(active.movesRemaining) || active.movesRemaining < 0 || active.movesRemaining > config.moves
        || !Number.isInteger(active.score) || active.score < 0 || !Array.isArray(active.collected) || active.collected.length !== 6
        || active.collected.some((count) => !Number.isInteger(count) || count < 0)
        || typeof active.catalystUsed !== "boolean" || typeof active.startedAt !== "string"
        || !Number.isFinite(Date.parse(active.startedAt))) return null;
      const minimumOccasion = active.attempt - (active.catalystUsed ? 0 : 1);
      if (value.catalystOccasion! < minimumOccasion) return null;
      if (!active.catalystUsed) {
        const canonical = createActiveLevel(config, active.startedAt, active.attempt);
        if (active.board !== canonical.board || active.rngState !== canonical.rngState
          || active.movesRemaining !== canonical.movesRemaining || active.score !== 0
          || JSON.stringify(active.collected) !== JSON.stringify(canonical.collected)) return null;
      }
    }
    return value as CascadeSaveV1;
  } catch {
    return null;
  }
}

export type TimingBucket = "instant" | "quick" | "considered" | "long" | "returned";
export type CascadeEventType =
  | "session_started" | "session_continued" | "session_exited" | "session_completed"
  | "campaign_reset"
  | "level_started" | "board_presented" | "move_attempted" | "move_applied" | "move_invalid"
  | "cascade_resolved" | "dead_board_reshuffled" | "catalyst_presented"
  | "catalyst_selected" | "catalyst_skipped" | "level_completed" | "level_failed" | "level_retried";
export type EvidenceClass = "gameplay_telemetry" | "preference_observation";

export type CascadeEventPayload = Record<string, unknown>;
export type CascadeEvidenceEvent = {
  schemaVersion: typeof CASCADE_EVENT_SCHEMA;
  eventId: string;
  eventType: CascadeEventType;
  evidenceClass: EvidenceClass;
  gameId: "the_alchemists_cascade";
  gameVersion: typeof CASCADE_GAME_VERSION;
  gameSessionId: string;
  anonymousPlayerId: string;
  libraryScopeId: string;
  occurredAt: string;
  timingBucket: TimingBucket;
  preferenceInference: "none_from_gameplay" | "eligible_balanced_semantic_choice" | "none_neutral_skip" | "none_mechanically_unequal";
  payload: CascadeEventPayload;
};

const EVENT_TYPES: CascadeEventType[] = [
  "session_started", "session_continued", "session_exited", "session_completed", "campaign_reset", "level_started",
  "board_presented", "move_attempted", "move_applied", "move_invalid", "cascade_resolved",
  "dead_board_reshuffled", "catalyst_presented", "catalyst_selected", "catalyst_skipped",
  "level_completed", "level_failed", "level_retried",
];
const TIMING_BUCKETS: TimingBucket[] = ["instant", "quick", "considered", "long", "returned"];
const BASE_EVENT_KEYS = [
  "schemaVersion", "eventId", "eventType", "evidenceClass", "gameId", "gameVersion",
  "gameSessionId", "anonymousPlayerId", "libraryScopeId", "occurredAt", "timingBucket",
  "preferenceInference", "payload",
] as const;

const PAYLOAD_KEYS: Record<CascadeEventType, string[]> = {
  session_started: ["playSessionCount"], session_continued: ["playSessionCount"],
  session_exited: ["levelId", "board", "boardChecksum", "movesRemaining", "score"],
  session_completed: ["unlockedLevel", "totalStars"],
  campaign_reset: ["previousGameSessionId", "nextGameSessionId", "previousRevision"],
  level_started: ["levelId", "levelSeed", "moves", "goals", "scoreTarget"],
  board_presented: ["levelId", "board", "boardChecksum", "rngState"],
  move_attempted: ["levelId", "from", "to", "boardBefore", "beforeChecksum", "rngBefore", "legalMoves", "scoreBefore", "movesBefore", "goalsBefore"],
  move_applied: ["levelId", "from", "to", "boardBefore", "boardAfter", "beforeChecksum", "afterChecksum", "rngBefore", "rngAfter", "legalMoves", "cascadeSteps", "scoreBefore", "scoreAfter", "scoreDelta", "movesBefore", "movesAfter", "goalsBefore", "goalsAfter", "ordinaryMoveSemanticEvidence", "reshuffled", "reshuffleInventoryPreserved", "reshuffleRngBefore", "reshuffleAttempts"],
  move_invalid: ["levelId", "from", "to", "reason", "boardBefore", "beforeChecksum", "rngBefore", "rngAfter", "legalMoves", "scoreBefore", "scoreAfter", "movesBefore", "movesAfter", "goalsBefore", "goalsAfter", "ordinaryMoveSemanticEvidence"],
  cascade_resolved: ["levelId", "sourceMoveEventId", "sourceMoveOccurredAt", "sourceMoveTimingBucket", "from", "to", "boardBefore", "boardAfter", "beforeChecksum", "afterChecksum", "rngBefore", "rngAfter", "legalMoves", "cascadeSteps", "scoreBefore", "scoreAfter", "scoreDelta", "movesBefore", "movesAfter", "goalsBefore", "goalsAfter", "ordinaryMoveSemanticEvidence", "reshuffled", "reshuffleInventoryPreserved", "reshuffleRngBefore", "reshuffleAttempts"],
  dead_board_reshuffled: ["levelId", "sourceEventId", "boardBefore", "boardAfter", "beforeChecksum", "afterChecksum", "rngBefore", "rngAfter", "attempts", "inventoryPreserved"],
  catalyst_presented: ["levelId", "realmId", "levelAttempt", "presentationId", "catalystBoard", "catalystBoardChecksum", "catalystRngState", "catalystGoals", "catalystOccasion", "movesBefore", "scoreBefore", "goalsBefore", "catalystUsed", "options", "presentedOrder", "eligibility"],
  catalyst_selected: ["levelId", "realmId", "levelAttempt", "presentationId", "catalystBoard", "catalystBoardChecksum", "catalystRngState", "catalystGoals", "catalystOccasion", "movesBefore", "scoreBefore", "goalsBefore", "catalystUsed", "options", "presentedOrder", "selectedSlot", "selectedOption", "eligibility", "boardBefore", "boardAfter", "beforeChecksum", "afterChecksum", "cleared", "scoreAfter", "scoreDelta", "rngAfter", "goalsAfter"],
  catalyst_skipped: ["levelId", "realmId", "levelAttempt", "presentationId", "catalystBoard", "catalystBoardChecksum", "catalystRngState", "catalystGoals", "catalystOccasion", "movesBefore", "scoreBefore", "goalsBefore", "catalystUsed", "options", "presentedOrder", "selectedSlot", "eligibility", "neutralEffect"],
  level_completed: ["levelId", "score", "stars", "movesRemaining", "goals"],
  level_failed: ["levelId", "score", "movesRemaining", "goals"],
  level_retried: ["levelId", "previousAttempt", "attempt"],
};

function exactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  return actual.length === keys.length && actual.every((key, index) => key === [...keys].sort()[index]);
}

function serializableBounded(value: unknown, max = 48_000): boolean {
  try {
    const text = JSON.stringify(value);
    return text.length <= max && !containsCascadeProhibitedField(value);
  } catch {
    return false;
  }
}

const CASCADE_PROHIBITED_FIELD_KEYS = new Set([
  "email",
  "emailaddress",
  "studentid",
  "studentnumber",
  "ip",
  "ipaddress",
  "firstname",
  "lastname",
  "fullname",
  "responsetimems",
]);

export function containsCascadeProhibitedField(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(containsCascadeProhibitedField);
  if (!value || typeof value !== "object") return false;
  return Object.entries(value as Record<string, unknown>).some(([key, child]) => {
    const normalizedKey = key.toLowerCase().replace(/[^a-z]/g, "");
    return CASCADE_PROHIBITED_FIELD_KEYS.has(normalizedKey) || containsCascadeProhibitedField(child);
  });
}

function validCatalystOption(value: unknown): value is CatalystOption {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const option = value as Record<string, unknown>;
  if (!exactKeys(option, [
    "id", "version", "title", "copy", "mechanic", "manifestation", "normalizedMechanicalEstimate",
    "taxonomyVersion", "tasteVector", "tags",
  ]) || typeof option.id !== "string" || option.version !== 1 || typeof option.title !== "string"
    || typeof option.copy !== "string" || option.taxonomyVersion !== CASCADE_TAXONOMY_VERSION
    || typeof option.normalizedMechanicalEstimate !== "number"
    || option.normalizedMechanicalEstimate < 0 || option.normalizedMechanicalEstimate > 1
    || !Array.isArray(option.tags) || option.tags.length < 1 || option.tags.some((tag) => typeof tag !== "string" || tag.length > 40)
    || !option.tasteVector || typeof option.tasteVector !== "object" || Array.isArray(option.tasteVector)
    || !option.mechanic || typeof option.mechanic !== "object" || Array.isArray(option.mechanic)
    || !option.manifestation || typeof option.manifestation !== "object"
    || Array.isArray(option.manifestation)) return false;
  const vector = option.tasteVector as Record<string, unknown>;
  if (Object.keys(vector).some((axis) => !CASCADE_TAXONOMY.includes(axis as CascadeTasteAxis)
    || ![-2, -1, 1, 2].includes(vector[axis] as number))) return false;
  const mechanic = option.mechanic as Record<string, unknown>;
  const manifestation = option.manifestation as Record<string, unknown>;
  return exactKeys(manifestation, ["symbol", "color", "outcomeText"])
    && typeof manifestation.symbol === "string" && manifestation.symbol.length >= 1 && manifestation.symbol.length <= 4
    && typeof manifestation.color === "string" && /^#[0-9A-F]{6}$/.test(manifestation.color)
    && typeof manifestation.outcomeText === "string" && manifestation.outcomeText.length >= 10
    && manifestation.outcomeText.length <= 160
    && exactKeys(mechanic, ["type", "target", "clearCount"])
    && ["clear_row", "clear_column", "distill_color"].includes(String(mechanic.type))
    && Number.isInteger(mechanic.target) && (mechanic.target as number) >= 0 && (mechanic.target as number) < 7
    && mechanic.clearCount === 7;
}

function validLevelGoals(value: unknown, config: LevelConfig): boolean {
  return Array.isArray(value) && JSON.stringify(value) === JSON.stringify(config.goals);
}

function validCatalystPayload(
  payload: Record<string, unknown>,
  eventType: CascadeEventType,
  event: Record<string, unknown>,
): boolean {
  const config = CASCADE_LEVELS.find((level) => level.id === payload.levelId);
  const board = typeof payload.catalystBoard === "string" ? decodeBoard(payload.catalystBoard) : null;
  if (!config || !board
    || !Number.isSafeInteger(payload.levelAttempt) || (payload.levelAttempt as number) < 1
    || (payload.levelAttempt as number) > 10_000
    || payload.realmId !== config.realmId
    || payload.catalystBoardChecksum !== boardChecksum(payload.catalystBoard as string)
    || !validUint32(payload.catalystRngState) || !validLevelGoals(payload.catalystGoals, config)
    || !Number.isSafeInteger(payload.catalystOccasion) || (payload.catalystOccasion as number) < 0
    || (payload.catalystOccasion as number) > CASCADE_LEVELS.length * 10_000
    || (payload.catalystOccasion as number) < (payload.levelAttempt as number) - 1
    || payload.presentationId !== `${event.gameSessionId}:${config.id}:${payload.levelAttempt}:${payload.catalystOccasion}:catalyst-v3`) return false;
  const active = createActiveLevel(config, "2000-01-01T00:00:00.000Z", payload.levelAttempt as number);
  const zeroGoals = config.goals.map((goal) => ({
    ingredientId: INGREDIENTS[goal.kind].id,
    target: goal.target,
    collected: 0,
  }));
  if (payload.catalystBoard !== active.board || payload.catalystRngState !== active.rngState
    || payload.movesBefore !== config.moves || payload.scoreBefore !== 0
    || payload.catalystUsed !== false
    || JSON.stringify(payload.goalsBefore) !== JSON.stringify(zeroGoals)) return false;
  const canonical = catalystOptions(
    decodeBoard(active.board)!,
    String(event.anonymousPlayerId),
    payload.catalystOccasion as number,
    active.rngState,
    config.goals,
  );
  if (!Array.isArray(payload.options) || payload.options.length !== 3
    || !payload.options.every(validCatalystOption)
    || new Set((payload.options as CatalystOption[]).map((option) => option.id)).size !== 3
    || JSON.stringify(payload.options) !== JSON.stringify(canonical)
    || !Array.isArray(payload.presentedOrder)
    || payload.presentedOrder.length !== 3
    || payload.presentedOrder.some((id, index) => id !== (payload.options as CatalystOption[])[index].id)
    || !payload.eligibility || typeof payload.eligibility !== "object" || Array.isArray(payload.eligibility)) return false;
  const eligibility = payload.eligibility as Record<string, unknown>;
  if (!exactKeys(eligibility, ["eligible", "spread", "tolerance"])) return false;
  const calculated = mechanicalEquivalence(
    (payload.options as CatalystOption[]).map((option) => option.normalizedMechanicalEstimate),
    CASCADE_EQUIVALENCE_TOLERANCE,
  );
  if (eligibility.eligible !== calculated.eligible || eligibility.spread !== calculated.spread
    || eligibility.tolerance !== calculated.tolerance) return false;
  if (eventType === "catalyst_selected") {
    if (!Number.isInteger(payload.selectedSlot) || (payload.selectedSlot as number) < 0 || (payload.selectedSlot as number) >= 3) return false;
    const option = canonical[payload.selectedSlot as number];
    if (JSON.stringify(payload.selectedOption) !== JSON.stringify(option)
      || payload.boardBefore !== payload.catalystBoard || payload.beforeChecksum !== payload.catalystBoardChecksum
      || !validGoalSnapshots(payload.goalsBefore, config)) return false;
    const applied = applyCatalyst(board, payload.catalystRngState as number, option);
    return payload.boardAfter === encodeBoard(applied.board)
      && payload.afterChecksum === boardChecksum(applied.board)
      && JSON.stringify(payload.cleared) === JSON.stringify(applied.cleared)
      && payload.scoreDelta === applied.scoreDelta
      && payload.scoreAfter === (payload.scoreBefore as number) + applied.scoreDelta
      && payload.rngAfter === applied.rng.state
      && validGoalTransition(payload.goalsBefore, payload.goalsAfter, config, applied.collected);
  }
  if (eventType === "catalyst_skipped") return payload.selectedSlot === null && payload.neutralEffect === true;
  return true;
}

function validBoardBindings(payload: Record<string, unknown>): boolean {
  for (const [boardKey, checksumKey] of [
    ["board", "boardChecksum"], ["boardBefore", "beforeChecksum"], ["boardAfter", "afterChecksum"],
    ["catalystBoard", "catalystBoardChecksum"],
  ] as const) {
    if (!(boardKey in payload) || payload[boardKey] === null) continue;
    if (typeof payload[boardKey] !== "string" || !decodeBoard(payload[boardKey] as string)
      || payload[checksumKey] !== boardChecksum(payload[boardKey] as string)) return false;
  }
  return true;
}

function validCoordinate(value: unknown): value is Coordinate {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const at = value as Record<string, unknown>;
  return exactKeys(at, ["row", "column"]) && Number.isInteger(at.row) && Number.isInteger(at.column)
    && (at.row as number) >= 0 && (at.row as number) < 7 && (at.column as number) >= 0 && (at.column as number) < 7;
}

function validGoalSnapshot(value: unknown): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const goal = value as Record<string, unknown>;
  return exactKeys(goal, ["ingredientId", "target", "collected"])
    && INGREDIENTS.some((ingredient) => ingredient.id === goal.ingredientId)
    && Number.isInteger(goal.target) && (goal.target as number) > 0 && (goal.target as number) <= 10_000
    && Number.isInteger(goal.collected) && (goal.collected as number) >= 0;
}

function validGoalSnapshots(value: unknown, config: LevelConfig): boolean {
  return Array.isArray(value) && value.length === config.goals.length && value.every((snapshot, index) => {
    if (!validGoalSnapshot(snapshot)) return false;
    const goal = snapshot as { ingredientId: string; target: number; collected: number };
    const expected = config.goals[index];
    return goal.ingredientId === INGREDIENTS[expected.kind].id && goal.target === expected.target;
  });
}

function validGoalTransition(
  beforeValue: unknown,
  afterValue: unknown,
  config: LevelConfig,
  additions: number[],
): boolean {
  if (!validGoalSnapshots(beforeValue, config) || !validGoalSnapshots(afterValue, config)) return false;
  return (beforeValue as { collected: number }[]).every((before, index) =>
    (afterValue as { collected: number }[])[index].collected
      === before.collected + additions[config.goals[index].kind]);
}

function validNonNegativeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0;
}

function validUint32(value: unknown): value is number {
  return Number.isInteger(value) && (value as number) >= 0 && (value as number) <= 0xFFFFFFFF;
}

function validLegalMove(value: unknown): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const move = value as Record<string, unknown>;
  return exactKeys(move, ["from", "to", "estimatedScore", "estimatedGoalHits"])
    && validCoordinate(move.from) && validCoordinate(move.to)
    && validNonNegativeInteger(move.estimatedScore) && validNonNegativeInteger(move.estimatedGoalHits);
}

function validMatchGroup(value: unknown): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const group = value as Record<string, unknown>;
  return exactKeys(group, ["orientation", "kind", "cells"])
    && ["row", "column"].includes(String(group.orientation))
    && Number.isInteger(group.kind) && (group.kind as number) >= 0 && (group.kind as number) < 6
    && Array.isArray(group.cells) && group.cells.length >= 3 && group.cells.every(validCoordinate);
}

function validCascadeStep(value: unknown): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const step = value as Record<string, unknown>;
  if (!exactKeys(step, [
    "index", "groups", "cleared", "specialsCreated", "specialsActivated",
    "score", "boardBefore", "boardAfter",
  ]) || !Number.isInteger(step.index) || typeof step.score !== "number"
    || typeof step.boardBefore !== "string" || !decodeBoard(step.boardBefore)
    || typeof step.boardAfter !== "string" || !decodeBoard(step.boardAfter)
    || !Array.isArray(step.groups) || !step.groups.every(validMatchGroup)
    || !Array.isArray(step.cleared) || !step.cleared.every(validCoordinate)
    || !Array.isArray(step.specialsCreated) || !Array.isArray(step.specialsActivated)) return false;
  const before = decodeBoard(step.boardBefore as string);
  if (!before || JSON.stringify(step.groups) !== JSON.stringify(findMatches(before))) return false;
  const created = step.specialsCreated.every((value) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) return false;
    const special = value as Record<string, unknown>;
    return exactKeys(special, ["at", "special", "kind"]) && validCoordinate(special.at)
      && ["row", "column", "burst"].includes(String(special.special))
      && Number.isInteger(special.kind) && (special.kind as number) >= 0 && (special.kind as number) < 6;
  });
  const activated = step.specialsActivated.every((value) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) return false;
    const special = value as Record<string, unknown>;
    return exactKeys(special, ["at", "special"]) && validCoordinate(special.at)
      && ["row", "column", "burst"].includes(String(special.special))
      && before[(special.at as Coordinate).row][(special.at as Coordinate).column].special === special.special;
  });
  return created && activated && validNonNegativeInteger(step.score)
    && new Set((step.cleared as Coordinate[]).map(coordKey)).size === (step.cleared as Coordinate[]).length;
}

function validCascadeSteps(value: unknown): value is CascadeStep[] {
  return Array.isArray(value) && value.length >= 1 && value.length <= CASCADE_MAX_RESOLUTION_STEPS
    && value.every((step, index) => validCascadeStep(step)
      && (step as CascadeStep).index === index + 1
      && (index === 0 || (value[index - 1] as CascadeStep).boardAfter === (step as CascadeStep).boardBefore));
}

function validMovePayload(payload: Record<string, unknown>, eventType: CascadeEventType): boolean {
  const config = CASCADE_LEVELS.find((level) => level.id === payload.levelId);
  const board = typeof payload.boardBefore === "string" ? decodeBoard(payload.boardBefore) : null;
  if (!config || !board || !validCoordinate(payload.from) || !validCoordinate(payload.to)
    || !validUint32(payload.rngBefore) || !validNonNegativeInteger(payload.scoreBefore)
    || !validNonNegativeInteger(payload.movesBefore) || (payload.movesBefore as number) > config.moves
    || (payload.movesBefore as number) === 0 || !validGoalSnapshots(payload.goalsBefore, config)
    || findMatches(board).length !== 0) return false;
  const result = applySwap(
    board,
    payload.rngBefore as number,
    payload.from as Coordinate,
    payload.to as Coordinate,
    config.goals,
  );
  const canonicalMoves = result.legalMovesBefore.slice(0, 24);
  if (!Array.isArray(payload.legalMoves) || !payload.legalMoves.every(validLegalMove)
    || JSON.stringify(payload.legalMoves) !== JSON.stringify(canonicalMoves)) return false;
  if (eventType === "move_attempted") return true;
  if (payload.ordinaryMoveSemanticEvidence !== false || !validUint32(payload.rngAfter)
    || !validNonNegativeInteger(payload.scoreAfter) || !validNonNegativeInteger(payload.movesAfter)
    || !validGoalSnapshots(payload.goalsAfter, config)) return false;
  if (eventType === "move_invalid") {
    return !result.valid && payload.reason === result.reason
      && payload.scoreAfter === payload.scoreBefore && payload.movesAfter === payload.movesBefore
      && payload.rngAfter === payload.rngBefore
      && JSON.stringify(payload.goalsAfter) === JSON.stringify(payload.goalsBefore);
  }
  return result.valid
    && payload.boardAfter === encodeBoard(result.board)
    && payload.afterChecksum === boardChecksum(result.board)
    && payload.rngAfter === result.rng.state
    && payload.scoreDelta === result.scoreDelta
    && payload.scoreAfter === (payload.scoreBefore as number) + result.scoreDelta
    && payload.movesAfter === (payload.movesBefore as number) - 1
    && validCascadeSteps(payload.cascadeSteps)
    && JSON.stringify(payload.cascadeSteps) === JSON.stringify(result.steps)
    && validGoalTransition(payload.goalsBefore, payload.goalsAfter, config, result.collected)
    && payload.reshuffled === result.reshuffled
    && payload.reshuffleInventoryPreserved === result.reshuffleInventoryPreserved
    && payload.reshuffleRngBefore === result.reshuffleRngBefore
    && payload.reshuffleAttempts === result.reshuffleAttempts;
}

function validCascadeSourceBinding(
  payload: Record<string, unknown>,
  event: Record<string, unknown>,
): boolean {
  if (typeof payload.sourceMoveOccurredAt !== "string"
    || !Number.isFinite(Date.parse(payload.sourceMoveOccurredAt))
    || !TIMING_BUCKETS.includes(payload.sourceMoveTimingBucket as TimingBucket)) return false;
  const movePayload: Record<string, unknown> = {};
  for (const key of PAYLOAD_KEYS.move_applied) movePayload[key] = payload[key];
  const sourceBody = {
    schemaVersion: CASCADE_EVENT_SCHEMA,
    eventType: "move_applied",
    evidenceClass: "gameplay_telemetry",
    gameId: "the_alchemists_cascade",
    gameVersion: CASCADE_GAME_VERSION,
    gameSessionId: event.gameSessionId,
    anonymousPlayerId: event.anonymousPlayerId,
    libraryScopeId: event.libraryScopeId,
    occurredAt: payload.sourceMoveOccurredAt,
    timingBucket: payload.sourceMoveTimingBucket,
    preferenceInference: "none_from_gameplay",
    payload: movePayload,
  };
  return payload.sourceMoveEventId === `ace-${sha256Digest(JSON.stringify(sourceBody))}`;
}

function validStructuredPayload(payload: Record<string, unknown>, eventType: CascadeEventType): boolean {
  const config = CASCADE_LEVELS.find((level) => level.id === payload.levelId);
  switch (eventType) {
    case "session_started":
    case "session_continued":
      return Number.isInteger(payload.playSessionCount) && (payload.playSessionCount as number) >= 1
        && (payload.playSessionCount as number) <= 1_000_000;
    case "session_exited": {
      const absent = payload.levelId === null && payload.board === null && payload.boardChecksum === null
        && payload.movesRemaining === null && payload.score === null;
      return absent || (Boolean(config) && typeof payload.board === "string"
        && validNonNegativeInteger(payload.movesRemaining) && (payload.movesRemaining as number) <= config!.moves
        && validNonNegativeInteger(payload.score));
    }
    case "session_completed":
      return payload.unlockedLevel === CASCADE_LEVELS.length
        && validNonNegativeInteger(payload.totalStars) && (payload.totalStars as number) <= CASCADE_LEVELS.length * 3;
    case "campaign_reset":
      return typeof payload.previousGameSessionId === "string" && typeof payload.nextGameSessionId === "string"
        && payload.previousGameSessionId !== payload.nextGameSessionId
        && /^cascade-session-[a-zA-Z0-9-]{8,120}$/.test(payload.previousGameSessionId)
        && /^cascade-session-[a-zA-Z0-9-]{8,120}$/.test(payload.nextGameSessionId)
        && validNonNegativeInteger(payload.previousRevision);
    case "level_started":
      return Boolean(config) && payload.levelSeed === config!.seed && payload.moves === config!.moves
        && payload.scoreTarget === config!.scoreTarget && validLevelGoals(payload.goals, config!);
    case "board_presented": {
      if (!config || !validUint32(payload.rngState) || typeof payload.board !== "string") return false;
      const initial = createActiveLevel(config, "2000-01-01T00:00:00.000Z");
      return payload.board === initial.board && payload.rngState === initial.rngState;
    }
    case "move_attempted":
    case "move_applied":
    case "move_invalid":
      return validMovePayload(payload, eventType);
    case "cascade_resolved":
      return Boolean(config) && /^ace-[a-f0-9]{64}$/.test(String(payload.sourceMoveEventId))
        && validMovePayload(payload, eventType);
    case "dead_board_reshuffled": {
      const before = typeof payload.boardBefore === "string" ? decodeBoard(payload.boardBefore) : null;
      const after = typeof payload.boardAfter === "string" ? decodeBoard(payload.boardAfter) : null;
      if (!config || !before || !after || !/^ace-[a-f0-9]{64}$/.test(String(payload.sourceEventId))
        || !validUint32(payload.rngBefore) || !validUint32(payload.rngAfter)
        || !Number.isInteger(payload.attempts) || (payload.attempts as number) < 1 || (payload.attempts as number) > 201
        || findMatches(after).length || !findLegalMoves(after, config.goals).length
        || payload.boardBefore === payload.boardAfter || typeof payload.inventoryPreserved !== "boolean") return false;
      const regenerated = reshuffleDeadBoard(before, createRng(payload.rngBefore as number));
      return payload.boardAfter === encodeBoard(regenerated.board)
        && payload.rngAfter === regenerated.rng.state
        && payload.attempts === regenerated.attempts
        && payload.inventoryPreserved === (regenerated.attempts <= 200);
    }
    case "catalyst_presented":
    case "catalyst_selected":
    case "catalyst_skipped":
      return true;
    case "level_completed":
    case "level_failed": {
      if (!config || !validNonNegativeInteger(payload.score) || !validNonNegativeInteger(payload.movesRemaining)
        || (payload.movesRemaining as number) > config.moves || !validGoalSnapshots(payload.goals, config)) return false;
      const collected = Array(6).fill(0);
      (payload.goals as { collected: number }[]).forEach((goal, index) => {
        collected[config.goals[index].kind] = goal.collected;
      });
      const active = {
        levelId: config.id, attempt: 1, board: "", rngState: 0, movesRemaining: payload.movesRemaining as number,
        score: payload.score as number, collected, catalystUsed: true, startedAt: "",
      };
      const won = levelWon(active, config);
      if (eventType === "level_failed") return !won && payload.movesRemaining === 0;
      return won && payload.stars === levelStars(active, config);
    }
    case "level_retried":
      return Boolean(config)
        && Number.isSafeInteger(payload.previousAttempt) && (payload.previousAttempt as number) >= 1
        && Number.isSafeInteger(payload.attempt) && (payload.attempt as number) === (payload.previousAttempt as number) + 1
        && (payload.attempt as number) <= 10_000;
    default:
      return false;
  }
}

export function normalizeCascadeEvent(value: unknown): CascadeEvidenceEvent | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const event = value as Record<string, unknown>;
  if (!exactKeys(event, BASE_EVENT_KEYS) || event.schemaVersion !== CASCADE_EVENT_SCHEMA
    || event.gameId !== "the_alchemists_cascade" || event.gameVersion !== CASCADE_GAME_VERSION
    || typeof event.eventId !== "string" || !/^ace-[a-f0-9]{64}$/.test(event.eventId)
    || typeof event.gameSessionId !== "string" || !/^cascade-session-[a-zA-Z0-9-]{8,120}$/.test(event.gameSessionId)
    || typeof event.anonymousPlayerId !== "string" || !/^cascade-player-[a-z0-9]{7,64}$/.test(event.anonymousPlayerId)
    || typeof event.libraryScopeId !== "string" || event.libraryScopeId !== normalizeLibraryScope(event.libraryScopeId)
    || typeof event.occurredAt !== "string" || !Number.isFinite(Date.parse(event.occurredAt))
    || Date.parse(event.occurredAt) < Date.parse("2020-01-01T00:00:00.000Z")
    || Date.parse(event.occurredAt) > Date.parse("2100-01-01T00:00:00.000Z")
    || !EVENT_TYPES.includes(event.eventType as CascadeEventType)
    || !TIMING_BUCKETS.includes(event.timingBucket as TimingBucket)
    || !event.payload || typeof event.payload !== "object" || Array.isArray(event.payload)) return null;
  const eventType = event.eventType as CascadeEventType;
  const payload = event.payload as Record<string, unknown>;
  if (!exactKeys(payload, PAYLOAD_KEYS[eventType]) || !serializableBounded(event)
    || !validBoardBindings(payload) || !validStructuredPayload(payload, eventType)) return null;
  if (eventType === "campaign_reset" && payload.previousGameSessionId !== event.gameSessionId) return null;
  if (eventType.startsWith("catalyst_") && !validCatalystPayload(payload, eventType, event)) return null;
  if (eventType === "cascade_resolved" && !validCascadeSourceBinding(payload, event)) return null;
  const preference = event.preferenceInference;
  const evidence = event.evidenceClass;
  if (eventType === "catalyst_selected") {
    const payload = event.payload as Record<string, unknown>;
    const eligibility = payload.eligibility as { eligible?: boolean } | undefined;
    if (eligibility?.eligible) {
      if (preference !== "eligible_balanced_semantic_choice" || evidence !== "preference_observation") return null;
    } else if (preference !== "none_mechanically_unequal" || evidence !== "gameplay_telemetry") return null;
  } else if (eventType === "catalyst_skipped") {
    if (preference !== "none_neutral_skip" || evidence !== "gameplay_telemetry") return null;
  } else if (preference !== "none_from_gameplay" || evidence !== "gameplay_telemetry") return null;
  const { eventId: _eventId, ...body } = event;
  if (`ace-${sha256Digest(JSON.stringify(body))}` !== event.eventId) return null;
  return event as CascadeEvidenceEvent;
}

export function createCascadeEvent(input: Omit<CascadeEvidenceEvent, "schemaVersion" | "eventId" | "gameId" | "gameVersion">): CascadeEvidenceEvent {
  const body = {
    schemaVersion: CASCADE_EVENT_SCHEMA,
    eventType: input.eventType,
    evidenceClass: input.evidenceClass,
    gameId: "the_alchemists_cascade" as const,
    gameVersion: CASCADE_GAME_VERSION,
    gameSessionId: input.gameSessionId,
    anonymousPlayerId: input.anonymousPlayerId,
    libraryScopeId: normalizeLibraryScope(input.libraryScopeId),
    occurredAt: input.occurredAt,
    timingBucket: input.timingBucket,
    preferenceInference: input.preferenceInference,
    payload: input.payload,
  };
  const event = { ...body, eventId: `ace-${sha256Digest(JSON.stringify(body))}` };
  if (!normalizeCascadeEvent(event)) throw new Error("invalid_alchemists_cascade_event");
  return event;
}

export function monotonicCascadeTimestamp(previous: string | null, now = Date.now()): string {
  const prior = previous ? Date.parse(previous) : 0;
  return new Date(Math.max(now, Number.isFinite(prior) ? prior + 1 : now)).toISOString();
}
