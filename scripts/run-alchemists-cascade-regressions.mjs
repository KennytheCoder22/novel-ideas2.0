import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
const ts = require("typescript");
require.extensions[".ts"] = (module, filename) => {
  const source = readFileSync(filename, "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: {
      esModuleInterop: true,
      module: ts.ModuleKind.CommonJS,
      moduleResolution: ts.ModuleResolutionKind.Node10,
      target: ts.ScriptTarget.ES2020,
    },
  }).outputText;
  module._compile(output, filename);
};

const game = require(resolve(root, "lib/recommendationGames/alchemistsCascade.ts"));
const evidence = require(resolve(root, "lib/recommendationGames/alchemistsCascadeEvidenceClient.ts"));
const quota = require(resolve(root, "lib/recommendationGames/alchemistsCascadeQuota.ts"));
const api = require(resolve(root, "api/alchemists-cascade-event.ts"));

function assert(condition, message) {
  if (!condition) throw new Error(`FAIL: ${message}`);
}

class MemoryStorage {
  values = new Map();
  async getItem(key) { return this.values.get(key) ?? null; }
  async setItem(key, value) { this.values.set(key, value); }
}

class InterruptedCommitStorage extends MemoryStorage {
  failNextSave = false;
  async setItem(key, value) {
    if (this.failNextSave && key.startsWith(game.CASCADE_SAVE_KEY) && JSON.parse(value).revision === 1) {
      this.failNextSave = false;
      throw new Error("injected_save_failure");
    }
    return super.setItem(key, value);
  }
}

function inventory(board) {
  return board.flat().map((cell) => `${cell.kind}:${cell.special}`).sort().join("|");
}

function legacyFnv(input) {
  let hash = 2166136261;
  for (let index = 0; index < input.length; index += 1) hash = Math.imul(hash ^ input.charCodeAt(index), 16777619);
  return hash >>> 0;
}

function makeEvent(save, overrides = {}) {
  return game.createCascadeEvent({
    eventType: "board_presented",
    evidenceClass: "gameplay_telemetry",
    gameSessionId: "cascade-session-test-0001",
    anonymousPlayerId: save.anonymousPlayerId,
    libraryScopeId: save.libraryScopeId,
    occurredAt: "2026-09-02T00:00:00.000Z",
    timingBucket: "instant",
    preferenceInference: "none_from_gameplay",
    payload: {
      levelId: "level-1", board: overrides.board || game.createActiveLevel(game.CASCADE_LEVELS[0], "2026-09-02T00:00:00.000Z").board,
      boardChecksum: overrides.checksum || game.boardChecksum(overrides.board || game.createActiveLevel(game.CASCADE_LEVELS[0], "2026-09-02T00:00:00.000Z").board),
      rngState: game.createActiveLevel(game.CASCADE_LEVELS[0], "2026-09-02T00:00:00.000Z").rngState,
    },
  });
}

function specialBoard() {
  const pattern = [
    [0, 1, 2, 3, 4, 5, 0],
    [1, 2, 3, 4, 5, 0, 1],
    [2, 3, 4, 5, 0, 1, 2],
    [3, 4, 5, 0, 1, 2, 3],
    [4, 5, 0, 1, 2, 3, 4],
    [5, 0, 1, 2, 3, 4, 5],
    [0, 1, 2, 3, 4, 5, 0],
  ];
  return pattern.map((row) => row.map((kind) => ({ kind, special: "none" })));
}

async function main() {
  const checks = [];

  const first = game.createBoard(123456);
  const again = game.createBoard(123456);
  assert(game.encodeBoard(first.board) === game.encodeBoard(again.board), "seeded boards must be deterministic");
  assert(game.findMatches(first.board).length === 0, "initial board must not contain matches");
  assert(game.findLegalMoves(first.board).length > 0, "initial board must contain a legal move");
  checks.push("seeded_solvable_board");

  const legal = game.findLegalMoves(first.board)[0];
  const legalResult = game.applySwap(first.board, first.rng.state, legal.from, legal.to);
  assert(legalResult.valid && legalResult.steps.length > 0 && legalResult.scoreDelta > 0, "legal swap must resolve and score");
  const illegal = game.applySwap(first.board, first.rng.state, { row: 0, column: 0 }, { row: 6, column: 6 });
  assert(!illegal.valid && illegal.reason === "not_adjacent" && game.encodeBoard(illegal.board) === game.encodeBoard(first.board), "invalid swap must preserve board");
  assert(illegal.scoreDelta === 0, "invalid swap cannot consume score or moves");
  checks.push("legal_and_invalid_swaps");

  const horizontal = specialBoard();
  horizontal[3][1] = { kind: 4, special: "none" };
  horizontal[3][2] = { kind: 4, special: "none" };
  horizontal[3][3] = { kind: 4, special: "none" };
  horizontal[3][4] = { kind: 4, special: "none" };
  assert(game.findMatches(horizontal).some((group) => group.orientation === "row" && group.cells.length === 4), "horizontal four must be detected");
  const horizontalResolved = game.resolveBoard(horizontal, game.createRng(77), [{ row: 3, column: 3 }]);
  assert(horizontalResolved.steps[0].specialsCreated.some((item) => item.special === "row"), "horizontal four must create row special");
  const vertical = specialBoard();
  vertical[1][2] = vertical[2][2] = vertical[3][2] = vertical[4][2] = { kind: 5, special: "none" };
  assert(game.findMatches(vertical).some((group) => group.orientation === "column" && group.cells.length === 4), "vertical four must be detected");
  const verticalResolved = game.resolveBoard(vertical, game.createRng(91), [{ row: 3, column: 2 }]);
  assert(verticalResolved.steps[0].specialsCreated.some((item) => item.special === "column"), "vertical four must create column special");
  assert(horizontalResolved.steps[0].boardAfter !== horizontalResolved.steps[0].boardBefore, "gravity and refill must mutate board");
  assert(horizontalResolved.steps.every((step, index) => step.index === index + 1), "cascade combo steps must be ordered");
  const seed60 = game.createBoard(60);
  const seed60Move = game.findLegalMoves(seed60.board).find((move) =>
    move.from.row === 1 && move.from.column === 3 && move.to.row === 1 && move.to.column === 4);
  const seed60Result = game.applySwap(seed60.board, seed60.rng.state, seed60Move.from, seed60Move.to);
  assert(seed60Result.steps[1].specialsCreated[0].at.row === 2
    && seed60Result.steps[1].specialsCreated[0].at.column === 4,
  "later cascades must place specials at the match midpoint, not a stale swap coordinate");
  const seed60Swapped = game.cloneBoard(seed60.board);
  [seed60Swapped[seed60Move.from.row][seed60Move.from.column], seed60Swapped[seed60Move.to.row][seed60Move.to.column]]
    = [seed60Swapped[seed60Move.to.row][seed60Move.to.column], seed60Swapped[seed60Move.from.row][seed60Move.from.column]];
  const forcedFallback = game.resolveBoard(
    seed60Swapped,
    game.createRng(seed60.rng.state),
    [seed60Move.to, seed60Move.from],
    1,
  );
  const forcedFallbackReplay = game.resolveBoard(
    seed60Swapped,
    game.createRng(seed60.rng.state),
    [seed60Move.to, seed60Move.from],
    1,
  );
  assert(forcedFallback.fallback
    && !game.findMatches(forcedFallback.board).length
    && game.findLegalMoves(forcedFallback.board).length
    && game.encodeBoard(forcedFallback.board) === game.encodeBoard(forcedFallbackReplay.board)
    && JSON.stringify(forcedFallback.fallback) === JSON.stringify(forcedFallbackReplay.fallback),
  "resolution cap fallback must deterministically record and produce a stable solvable board");
  const cyclicalBoard = Array.from({ length: 7 }, () =>
    Array.from({ length: 7 }, () => ({ kind: 0, special: "none" })));
  const cycleFallback = game.resolveBoard(cyclicalBoard, game.createRng(991));
  assert(cycleFallback.fallback?.reason === "cascade_cycle"
    && cycleFallback.steps.length < game.CASCADE_MAX_RESOLUTION_STEPS
    && !game.findMatches(cycleFallback.board).length
    && game.findLegalMoves(cycleFallback.board).length,
  "pathological repeating cascades must be detected and stabilized before the safe maximum");
  const level9 = game.CASCADE_LEVELS[8];
  const level9Active = game.createActiveLevel(level9, "2026-09-02T00:00:00.000Z");
  const level9Board = game.decodeBoard(level9Active.board);
  assert(level9.seed === 2247035246 && game.boardChecksum(level9Board) === "314f312f",
    "level 9 release fixture seed and checksum must remain pinned");
  for (const move of game.findLegalMoves(level9Board, level9.goals)) {
    const result = game.applySwap(level9Board, level9Active.rngState, move.from, move.to, level9.goals);
    assert(result.valid && !game.findMatches(result.board).length,
      `level 9 move ${move.from.row},${move.from.column}-${move.to.row},${move.to.column} must stabilize`);
  }
  for (let seed = 1; seed <= 300; seed += 1) {
    const generated = game.createBoard(seed);
    for (const move of game.findLegalMoves(generated.board).slice(0, 4)) {
      const result = game.applySwap(generated.board, generated.rng.state, move.from, move.to);
      assert(result.valid && result.steps.length <= game.CASCADE_MAX_RESOLUTION_STEPS
        && !game.findMatches(result.board).length && game.findLegalMoves(result.board).length,
      `seed ${seed} move resolution must end stable and solvable`);
    }
  }
  checks.push("matches_gravity_cascades_and_specials");

  let deadCandidate = null;
  for (let seed = 1; seed < 25000 && !deadCandidate; seed += 1) {
    const rng = game.createRng(seed);
    const board = specialBoard();
    for (let row = 0; row < 7; row += 1) for (let column = 0; column < 7; column += 1) {
      board[row][column] = { kind: Math.floor(game.nextRandom(rng) * 6), special: "none" };
    }
    if (!game.findMatches(board).length && !game.findLegalMoves(board).length) deadCandidate = board;
  }
  assert(deadCandidate, "test fixture search must find a dead board");
  const beforeInventory = inventory(deadCandidate);
  const shuffled = game.reshuffleDeadBoard(deadCandidate, game.createRng(400));
  assert(!game.findMatches(shuffled.board).length && game.findLegalMoves(shuffled.board).length > 0, "reshuffle must produce a clean solvable board");
  if (shuffled.attempts <= 200) assert(inventory(shuffled.board) === beforeInventory, "normal reshuffle must preserve inventory");
  checks.push("dead_board_reshuffle");

  assert(game.CASCADE_LEVELS.length >= 12 && new Set(game.CASCADE_LEVELS.map((level) => level.realmId)).size >= 4, "campaign needs twelve levels across four realms");
  const scopeA = game.createCascadeScope("patron-a", "north");
  const scopeB = game.createCascadeScope("patron-a", "south");
  assert(scopeA.scopeKey !== scopeB.scopeKey && scopeA.anonymousPlayerId !== scopeB.anonymousPlayerId, "library scopes must isolate anonymous saves");
  assert(scopeA.scopeKey.startsWith("north:") && scopeA.scopeKey.split(":")[1].length === 64
    && scopeA.anonymousPlayerId.length === "cascade-player-".length + 64,
  "scope identifiers must preserve the normalized library prefix and use a full SHA-256 digest");
  const fnvScopePlayerA = "scope-probe-4pfs";
  const fnvScopePlayerB = "scope-probe-lvja";
  assert(legacyFnv(`north:${fnvScopePlayerA}`) === legacyFnv(`north:${fnvScopePlayerB}`)
    && game.createCascadeScope(fnvScopePlayerA, "north").scopeKey
      !== game.createCascadeScope(fnvScopePlayerB, "north").scopeKey,
  "known legacy FNV collision must produce distinct Cascade scopes");
  const save = game.createInitialCascadeSave(scopeA.anonymousPlayerId, scopeA.libraryScopeId, "2026-09-02T00:00:00.000Z");
  const active = game.createActiveLevel(game.CASCADE_LEVELS[0], save.updatedAt);
  const progressed = {
    ...save,
    catalystOccasion: 1,
    unlockedLevel: 3,
    levelStars: { "level-1": 3 },
    activeLevel: { ...active, movesRemaining: 7, catalystUsed: true },
  };
  assert(JSON.stringify(game.restoreCascadeSave(JSON.stringify(progressed), "north")) === JSON.stringify(progressed), "save and active loss state must roundtrip exactly");
  assert(game.restoreCascadeSave(JSON.stringify(progressed), "south") === null, "restore must enforce library isolation");
  assert(game.encodeBoard(game.decodeBoard(active.board)) === active.board, "resume board must be lossless and deterministic");
  assert(active.attempt === 1 && game.restoreCascadeSave(JSON.stringify(progressed), "north").activeLevel.attempt === 1,
    "initial attempt and resumed attempt must remain durable");
  assert(game.activeLevelPhase(active, game.CASCADE_LEVELS[0]) === "catalyst"
    && game.activeLevelPhase({ ...active, catalystUsed: true }, game.CASCADE_LEVELS[0]) === "play"
    && game.activeLevelPhase({ ...active, catalystUsed: true, movesRemaining: 0 }, game.CASCADE_LEVELS[0]) === "lost",
  "resume phase must derive from persisted catalyst and terminal state");
  assert(game.restoreCascadeSave(JSON.stringify({
    ...save,
    activeLevel: { ...active, score: 999 },
  }), "north") === null,
  "resume must reject forged progress before the catalyst is consumed");
  checks.push("campaign_progression_and_resume");

  const collisionA = "event-130co39-1703";
  const collisionB = "event-f7i73j-1mwl";
  assert(legacyFnv(collisionA) === legacyFnv(collisionB)
    && game.sha256Digest(collisionA) !== game.sha256Digest(collisionB)
    && game.sha256Digest("abc") === "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
  "event identity must use a correct collision-resistant SHA-256 digest");

  const canonicalCatalystBoard = game.decodeBoard(active.board);
  const options0 = game.catalystOptions(canonicalCatalystBoard, save.anonymousPlayerId, 0, active.rngState, game.CASCADE_LEVELS[0].goals);
  const options1 = game.catalystOptions(canonicalCatalystBoard, save.anonymousPlayerId, 1, active.rngState, game.CASCADE_LEVELS[0].goals);
  const options1Again = game.catalystOptions(canonicalCatalystBoard, save.anonymousPlayerId, 1, active.rngState, game.CASCADE_LEVELS[0].goals);
  const options2 = game.catalystOptions(canonicalCatalystBoard, save.anonymousPlayerId, 2, active.rngState, game.CASCADE_LEVELS[0].goals);
  assert(options1.map((item) => item.id).join() === options1Again.map((item) => item.id).join(), "counterbalancing must be deterministic");
  assert(new Set([options0, options1, options2].map((options) => options.map((item) => item.id).join())).size === 3,
    "zero-based consecutive catalyst occasions must produce three distinct deterministic rotations");
  assert(new Set(options1.map((option) => JSON.stringify(option.mechanic))).size === 1
    && new Set(options1.map((option) => option.title)).size === 3
    && new Set(options1.map((option) => option.manifestation.color)).size === 3
    && new Set(options1.map((option) => option.manifestation.outcomeText)).size === 3,
  "catalysts must share one real mechanic while retaining distinct semantic and visual manifestations");
  for (const option of options1) {
    const applied = game.applyCatalyst(canonicalCatalystBoard, active.rngState, option);
    assert(applied.cleared.length === 7 && applied.scoreDelta >= 420, "each catalyst mechanic must clear exactly seven and score");
    assert(option.normalizedMechanicalEstimate === game.catalystOutcomeUtility(applied, game.CASCADE_LEVELS[0].goals),
      "catalyst estimates must equal deterministic simulated utility");
  }
  for (const level of game.CASCADE_LEVELS) {
    for (const attempt of [1, 2, 7]) {
      const levelActive = game.createActiveLevel(level, save.updatedAt, attempt);
      const levelBoard = game.decodeBoard(levelActive.board);
      for (const occasion of [0, 1, 2, 19]) {
        for (const playerId of [save.anonymousPlayerId, `${save.anonymousPlayerId.slice(0, -1)}a`]) {
          const choices = game.catalystOptions(
            levelBoard, playerId, occasion, levelActive.rngState, level.goals);
          const outcomes = choices.map((choice) => game.applyCatalyst(levelBoard, levelActive.rngState, choice));
          const mechanicallyReal = choices.every((choice, index) => choice.mechanic.target !== undefined
            && choice.normalizedMechanicalEstimate === game.catalystOutcomeUtility(outcomes[index], level.goals)
            && !game.findMatches(outcomes[index].board).length);
          const eligibility = game.mechanicalEquivalence(
            choices.map((option) => option.normalizedMechanicalEstimate),
          );
          const normalizedOutcomes = outcomes.map((outcome) => JSON.stringify({
            board: game.encodeBoard(outcome.board),
            rng: outcome.rng.state,
            cleared: outcome.cleared,
            score: outcome.scoreDelta,
            collected: outcome.collected,
            cascadeSteps: outcome.cascadeSteps,
          }));
          assert(mechanicallyReal && eligibility.eligible && new Set(normalizedOutcomes).size === 1,
          `level ${level.number} attempt ${attempt} occasion ${occasion} catalyst offer must be truly equivalent`);
        }
      }
    }
  }
  const equivalent = game.mechanicalEquivalence([1, 1.03, 1.01]);
  const unequal = game.mechanicalEquivalence([1, 1.0301, 1.01]);
  assert(equivalent.eligible && !unequal.eligible, "strict mechanical equivalence boundary must be enforced");
  checks.push("catalysts_counterbalancing_and_equivalence");

  const presentationId = "cascade-session-test-0001:level-1:1:1:catalyst-v3";
  const choiceEligibility = game.mechanicalEquivalence(options1.map((item) => item.normalizedMechanicalEstimate));
  const catalystBoard = active.board;
  const selectedApplied = game.applyCatalyst(canonicalCatalystBoard, active.rngState, options1[0]);
  const catalystGoalsBefore = game.CASCADE_LEVELS[0].goals.map((goal) => ({
    ingredientId: game.INGREDIENTS[goal.kind].id, target: goal.target, collected: 0,
  }));
  const catalystGoalsAfter = game.CASCADE_LEVELS[0].goals.map((goal) => ({
    ingredientId: game.INGREDIENTS[goal.kind].id, target: goal.target,
    collected: selectedApplied.collected[goal.kind],
  }));
  const canonicalCatalyst = {
    levelId: "level-1", realmId: game.CASCADE_LEVELS[0].realmId, levelAttempt: 1,
    presentationId, catalystBoard,
    catalystBoardChecksum: game.boardChecksum(catalystBoard), catalystRngState: active.rngState,
    catalystGoals: game.CASCADE_LEVELS[0].goals, catalystOccasion: 1,
    movesBefore: game.CASCADE_LEVELS[0].moves, scoreBefore: 0,
    goalsBefore: catalystGoalsBefore, catalystUsed: false,
    options: options1, presentedOrder: options1.map((item) => item.id), eligibility: choiceEligibility,
  };
  const selectedPayload = {
    ...canonicalCatalyst, selectedSlot: 0, selectedOption: options1[0],
    boardBefore: catalystBoard, boardAfter: game.encodeBoard(selectedApplied.board),
    beforeChecksum: game.boardChecksum(catalystBoard), afterChecksum: game.boardChecksum(selectedApplied.board),
    cleared: selectedApplied.cleared, scoreAfter: selectedApplied.scoreDelta,
    scoreDelta: selectedApplied.scoreDelta, rngAfter: selectedApplied.rng.state,
    goalsBefore: catalystGoalsBefore, goalsAfter: catalystGoalsAfter,
  };
  const selectedEvent = game.createCascadeEvent({
    eventType: "catalyst_selected", evidenceClass: choiceEligibility.eligible ? "preference_observation" : "gameplay_telemetry",
    gameSessionId: "cascade-session-test-0001", anonymousPlayerId: save.anonymousPlayerId,
    libraryScopeId: save.libraryScopeId, occurredAt: "2026-09-02T00:00:01.000Z", timingBucket: "quick",
    preferenceInference: choiceEligibility.eligible ? "eligible_balanced_semantic_choice" : "none_mechanically_unequal",
    payload: selectedPayload,
  });
  assert(game.normalizeCascadeEvent(selectedEvent), "canonical catalyst choice must validate");
  const presentedEvent = game.createCascadeEvent({
    eventType: "catalyst_presented", evidenceClass: "gameplay_telemetry",
    gameSessionId: "cascade-session-test-0001", anonymousPlayerId: save.anonymousPlayerId,
    libraryScopeId: save.libraryScopeId, occurredAt: "2026-09-02T00:00:00.500Z", timingBucket: "instant",
    preferenceInference: "none_from_gameplay", payload: canonicalCatalyst,
  });
  assert(game.normalizeCascadeEvent(presentedEvent), "canonical catalyst presentation must validate");
  const unequalOptions = options1.map((option, index) => index === 0
    ? { ...option, normalizedMechanicalEstimate: 1.1 }
    : option);
  const unequalEligibility = game.mechanicalEquivalence(unequalOptions.map((item) => item.normalizedMechanicalEstimate));
  let unequalRejected = false;
  try {
    game.createCascadeEvent({
      ...selectedEvent,
      eventId: undefined,
      payload: {
        ...selectedPayload, options: unequalOptions, selectedOption: unequalOptions[0],
        eligibility: unequalEligibility,
      },
    });
  } catch { unequalRejected = true; }
  assert(unequalRejected, "forged catalyst estimates cannot become evidence");
  const duplicateOptions = [options1[0], options1[0], options1[2]];
  assert(!game.normalizeCascadeEvent({
    ...selectedEvent,
    payload: { ...selectedPayload, options: duplicateOptions, presentedOrder: duplicateOptions.map((item) => item.id) },
  }), "duplicate catalyst options must be rejected");
  assert(!game.normalizeCascadeEvent({
    ...selectedEvent,
    payload: { ...selectedPayload, selectedSlot: 1, selectedOption: options1[0] },
  }), "forged selected slots must be rejected");
  const skipEvent = game.createCascadeEvent({
    eventType: "catalyst_skipped", evidenceClass: "gameplay_telemetry",
    gameSessionId: "cascade-session-test-0001", anonymousPlayerId: save.anonymousPlayerId,
    libraryScopeId: save.libraryScopeId, occurredAt: "2026-09-02T00:00:02.000Z", timingBucket: "considered",
    preferenceInference: "none_neutral_skip",
    payload: { ...canonicalCatalyst, selectedSlot: null, neutralEffect: true },
  });
  assert(game.normalizeCascadeEvent(skipEvent) && skipEvent.evidenceClass === "gameplay_telemetry", "skip must be neutral gameplay telemetry");
  const rejectsCatalystPayload = (event, payload) => {
    try {
      game.createCascadeEvent({ ...event, eventId: undefined, payload });
      return false;
    } catch {
      return true;
    }
  };
  const unrelatedActive = game.createActiveLevel(game.CASCADE_LEVELS[1], save.updatedAt);
  assert([
    { ...selectedPayload, catalystBoard: unrelatedActive.board, catalystBoardChecksum: game.boardChecksum(unrelatedActive.board) },
    { ...selectedPayload, catalystRngState: (active.rngState + 1) >>> 0 },
    { ...selectedPayload, scoreBefore: 999 },
    { ...selectedPayload, goalsBefore: selectedPayload.goalsBefore.map((goal, index) => ({ ...goal, collected: index ? 0 : 1 })) },
    { ...selectedPayload, movesBefore: game.CASCADE_LEVELS[0].moves - 1 },
    { ...selectedPayload, catalystUsed: true },
    { ...selectedPayload, realmId: game.CASCADE_LEVELS[3].realmId },
    { ...selectedPayload, levelAttempt: 0 },
    {
      ...selectedPayload,
      levelAttempt: 2,
      catalystOccasion: 0,
      presentationId: "cascade-session-test-0001:level-1:2:0:catalyst-v3",
    },
  ].every((payload) => rejectsCatalystPayload(selectedEvent, payload)),
  "catalyst evidence must reject noncanonical state, forged progress, realm, attempt, and occasion");
  assert(rejectsCatalystPayload(presentedEvent, {
    ...canonicalCatalyst,
    catalystBoard: unrelatedActive.board,
    catalystBoardChecksum: game.boardChecksum(unrelatedActive.board),
  }) && rejectsCatalystPayload(skipEvent, {
    ...skipEvent.payload,
    scoreBefore: 999,
  }), "presentation and skip must enforce the same canonical catalyst state");
  checks.push("preference_eligibility_and_skip");

  const boardEvent = makeEvent(save);
  assert(game.normalizeCascadeEvent(boardEvent), "canonical gameplay event must validate");
  assert(!game.normalizeCascadeEvent({ ...boardEvent, email: "student@example.org" }), "extra personal fields must be rejected");
  assert(!game.normalizeCascadeEvent({ ...boardEvent, payload: { ...boardEvent.payload, responseTimeMs: 42 } }), "exact timing and payload extras must be rejected");
  const substringLibrarySave = {
    ...save,
    libraryScopeId: "email-studentid-ipaddress-library",
  };
  const substringValueEvent = makeEvent(substringLibrarySave);
  assert(game.normalizeCascadeEvent(substringValueEvent)
    && !game.containsCascadeProhibitedField({
      libraryScopeId: "email-studentid-ipaddress-library",
      note: "email studentId IPAddress are harmless substrings in this value",
    }),
  "privacy validation must not scan arbitrary serialized values for key-name substrings");
  assert([
    { email: "reader@example.test" },
    { profile: { emailAddress: "reader@example.test" } },
    { rows: [{ studentId: "123" }] },
    { request: { IPAddress: "203.0.113.1" } },
    { profile: { firstName: "Ada" } },
    { profile: { last_name: "Lovelace" } },
    { profile: { fullName: "Ada Lovelace" } },
  ].every(game.containsCascadeProhibitedField),
  "prohibited identifier field keys must be rejected structurally at every nesting depth");
  assert(boardEvent.preferenceInference === "none_from_gameplay", "ordinary board activity cannot be semantic evidence");
  const decoded = game.decodeBoard(boardEvent.payload.board);
  assert(decoded && game.boardChecksum(decoded) === boardEvent.payload.boardChecksum, "board event must reconstruct exactly");
  const rebound = { ...boardEvent, payload: { ...boardEvent.payload, rngState: 999 } };
  assert(!game.normalizeCascadeEvent(rebound), "event ID must bind exact payload");
  const activeBoard = game.decodeBoard(active.board);
  const representativeMove = game.findLegalMoves(activeBoard, game.CASCADE_LEVELS[0].goals)[0];
  const representativeResult = game.applySwap(activeBoard, active.rngState, representativeMove.from, representativeMove.to, game.CASCADE_LEVELS[0].goals);
  const goalsBefore = game.CASCADE_LEVELS[0].goals.map((goal) => ({
    ingredientId: game.INGREDIENTS[goal.kind].id, target: goal.target, collected: 0,
  }));
  const goalsAfter = game.CASCADE_LEVELS[0].goals.map((goal) => ({
    ingredientId: game.INGREDIENTS[goal.kind].id, target: goal.target,
    collected: representativeResult.collected[goal.kind],
  }));
  const moveEvent = game.createCascadeEvent({
    eventType: "move_applied", evidenceClass: "gameplay_telemetry",
    gameSessionId: "cascade-session-test-0001", anonymousPlayerId: save.anonymousPlayerId,
    libraryScopeId: save.libraryScopeId, occurredAt: "2026-09-02T00:00:02.500Z", timingBucket: "instant",
    preferenceInference: "none_from_gameplay",
    payload: {
      levelId: "level-1", from: representativeMove.from, to: representativeMove.to,
      boardBefore: active.board, boardAfter: game.encodeBoard(representativeResult.board),
      beforeChecksum: game.boardChecksum(active.board), afterChecksum: game.boardChecksum(representativeResult.board),
      rngBefore: active.rngState, rngAfter: representativeResult.rng.state,
      legalMoves: representativeResult.legalMovesBefore.slice(0, 24), cascadeSteps: representativeResult.steps,
      scoreBefore: 0, scoreAfter: representativeResult.scoreDelta, scoreDelta: representativeResult.scoreDelta,
      movesBefore: game.CASCADE_LEVELS[0].moves, movesAfter: game.CASCADE_LEVELS[0].moves - 1,
      goalsBefore, goalsAfter, ordinaryMoveSemanticEvidence: false,
      reshuffled: representativeResult.reshuffled,
      reshuffleInventoryPreserved: representativeResult.reshuffleInventoryPreserved,
      reshuffleRngBefore: representativeResult.reshuffleRngBefore,
      reshuffleAttempts: representativeResult.reshuffleAttempts,
    },
  });
  assert(game.normalizeCascadeEvent(moveEvent) && moveEvent.payload.boardBefore === active.board
    && moveEvent.payload.boardAfter === game.encodeBoard(representativeResult.board),
  "representative move event must losslessly reconstruct before/after state");
  const eventOf = (eventType, payload, overrides = {}) => game.createCascadeEvent({
    eventType, evidenceClass: "gameplay_telemetry", gameSessionId: "cascade-session-test-0001",
    anonymousPlayerId: save.anonymousPlayerId, libraryScopeId: save.libraryScopeId,
    occurredAt: overrides.occurredAt || "2026-09-02T00:00:05.000Z", timingBucket: "instant",
    preferenceInference: "none_from_gameplay", payload,
  });
  const attemptedEvent = eventOf("move_attempted", {
    levelId: "level-1", from: representativeMove.from, to: representativeMove.to,
    boardBefore: active.board, beforeChecksum: game.boardChecksum(active.board), rngBefore: active.rngState,
    legalMoves: representativeResult.legalMovesBefore.slice(0, 24), scoreBefore: 0,
    movesBefore: game.CASCADE_LEVELS[0].moves, goalsBefore,
  });
  const invalidFrom = { row: 0, column: 0 };
  const invalidTo = { row: 0, column: 2 };
  const invalidResult = game.applySwap(activeBoard, active.rngState, invalidFrom, invalidTo, game.CASCADE_LEVELS[0].goals);
  const invalidEvent = eventOf("move_invalid", {
    levelId: "level-1", from: invalidFrom, to: invalidTo, reason: invalidResult.reason,
    boardBefore: active.board, beforeChecksum: game.boardChecksum(active.board),
    rngBefore: active.rngState, rngAfter: active.rngState,
    legalMoves: invalidResult.legalMovesBefore.slice(0, 24), scoreBefore: 0, scoreAfter: 0,
    movesBefore: game.CASCADE_LEVELS[0].moves, movesAfter: game.CASCADE_LEVELS[0].moves,
    goalsBefore, goalsAfter: goalsBefore, ordinaryMoveSemanticEvidence: false,
  });
  const cascadeEvent = eventOf("cascade_resolved", {
    levelId: "level-1", sourceMoveEventId: moveEvent.eventId,
    sourceMoveOccurredAt: moveEvent.occurredAt, sourceMoveTimingBucket: moveEvent.timingBucket,
    from: representativeMove.from, to: representativeMove.to,
    boardBefore: active.board, boardAfter: game.encodeBoard(representativeResult.board),
    beforeChecksum: game.boardChecksum(active.board), afterChecksum: game.boardChecksum(representativeResult.board),
    rngBefore: active.rngState, rngAfter: representativeResult.rng.state,
    legalMoves: representativeResult.legalMovesBefore.slice(0, 24), cascadeSteps: representativeResult.steps,
    scoreBefore: 0, scoreAfter: representativeResult.scoreDelta, scoreDelta: representativeResult.scoreDelta,
    movesBefore: game.CASCADE_LEVELS[0].moves, movesAfter: game.CASCADE_LEVELS[0].moves - 1,
    goalsBefore, goalsAfter, ordinaryMoveSemanticEvidence: false,
    reshuffled: representativeResult.reshuffled,
    reshuffleInventoryPreserved: representativeResult.reshuffleInventoryPreserved,
    reshuffleRngBefore: representativeResult.reshuffleRngBefore,
    reshuffleAttempts: representativeResult.reshuffleAttempts,
  });
  const rejectsMovePayload = (event, payload) => {
    try {
      game.createCascadeEvent({ ...event, eventId: undefined, payload });
      return false;
    } catch {
      return true;
    }
  };
  const differentFinal = game.createActiveLevel(game.CASCADE_LEVELS[1], save.updatedAt).board;
  const intermediateBoardTamper = structuredClone(moveEvent.payload);
  intermediateBoardTamper.cascadeSteps[0].boardAfter = active.board;
  const clearTamper = structuredClone(moveEvent.payload);
  clearTamper.cascadeSteps[0].cleared = clearTamper.cascadeSteps[0].cleared.slice(1);
  const stepScoreTamper = structuredClone(moveEvent.payload);
  stepScoreTamper.cascadeSteps[0].score += 60;
  const resolutionTampering = [
    { ...moveEvent.payload, boardAfter: differentFinal, afterChecksum: game.boardChecksum(differentFinal) },
    intermediateBoardTamper,
    clearTamper,
    stepScoreTamper,
    { ...moveEvent.payload, scoreAfter: moveEvent.payload.scoreAfter + 1 },
    { ...moveEvent.payload, rngAfter: (moveEvent.payload.rngAfter + 1) >>> 0 },
    {
      ...moveEvent.payload,
      goalsAfter: moveEvent.payload.goalsAfter.map((goal, index) => ({
        ...goal, collected: goal.collected + (index === 0 ? 1 : 0),
      })),
    },
  ];
  assert(resolutionTampering.every((payload) => rejectsMovePayload(moveEvent, payload)),
  "move replay must reject final/intermediate boards, clear lists, scores, RNG, and goal tampering");
  assert(resolutionTampering.every((payload) => rejectsMovePayload(cascadeEvent, {
    ...cascadeEvent.payload,
    ...payload,
  })) && rejectsMovePayload(cascadeEvent, {
    ...cascadeEvent.payload,
    sourceMoveEventId: selectedEvent.eventId,
  }), "cascade_resolved must replay every field and bind the exact canonical move_applied view");
  const reshuffleBefore = game.encodeBoard(deadCandidate);
  const reshuffleAfter = game.encodeBoard(shuffled.board);
  const reshuffleEvent = eventOf("dead_board_reshuffled", {
    levelId: "level-1", sourceEventId: moveEvent.eventId,
    boardBefore: reshuffleBefore, boardAfter: reshuffleAfter,
    beforeChecksum: game.boardChecksum(reshuffleBefore), afterChecksum: game.boardChecksum(reshuffleAfter),
    rngBefore: 400, rngAfter: shuffled.rng.state, attempts: shuffled.attempts,
    inventoryPreserved: shuffled.attempts <= 200,
  });
  const completeGoals = game.CASCADE_LEVELS[0].goals.map((goal) => ({
    ingredientId: game.INGREDIENTS[goal.kind].id, target: goal.target, collected: goal.target,
  }));
  const zeroGoals = game.CASCADE_LEVELS[0].goals.map((goal) => ({
    ingredientId: game.INGREDIENTS[goal.kind].id, target: goal.target, collected: 0,
  }));
  const allEventTypes = [
    eventOf("session_started", { playSessionCount: 1 }),
    eventOf("session_continued", { playSessionCount: 2 }),
    eventOf("session_exited", {
      levelId: active.levelId, board: active.board, boardChecksum: game.boardChecksum(active.board),
      movesRemaining: active.movesRemaining, score: active.score,
    }),
    eventOf("session_completed", { unlockedLevel: game.CASCADE_LEVELS.length, totalStars: 12 }),
    eventOf("campaign_reset", {
      previousGameSessionId: "cascade-session-test-0001",
      nextGameSessionId: "cascade-session-reset-0002", previousRevision: 7,
    }),
    eventOf("level_started", {
      levelId: "level-1", levelSeed: game.CASCADE_LEVELS[0].seed, moves: game.CASCADE_LEVELS[0].moves,
      goals: game.CASCADE_LEVELS[0].goals, scoreTarget: game.CASCADE_LEVELS[0].scoreTarget,
    }),
    boardEvent, attemptedEvent, moveEvent, invalidEvent, cascadeEvent, reshuffleEvent,
    presentedEvent, selectedEvent, skipEvent,
    eventOf("level_completed", {
      levelId: "level-1", score: game.CASCADE_LEVELS[0].scoreTarget, stars: 1,
      movesRemaining: 1, goals: completeGoals,
    }),
    eventOf("level_failed", { levelId: "level-1", score: 0, movesRemaining: 0, goals: zeroGoals }),
    eventOf("level_retried", { levelId: "level-1", previousAttempt: 1, attempt: 2 }),
  ];
  assert(allEventTypes.length === 18 && allEventTypes.every((event) => game.normalizeCascadeEvent(event)),
    "every event type must pass its exhaustive canonical runtime validator");
  let forgedScoreRejected = false;
  try {
    game.createCascadeEvent({
      ...moveEvent, eventId: undefined,
      payload: { ...moveEvent.payload, scoreAfter: moveEvent.payload.scoreAfter + 1 },
    });
  } catch { forgedScoreRejected = true; }
  let forgedConfigRejected = false;
  try {
    eventOf("level_started", {
      levelId: "level-1", levelSeed: 99, moves: game.CASCADE_LEVELS[0].moves,
      goals: game.CASCADE_LEVELS[0].goals, scoreTarget: game.CASCADE_LEVELS[0].scoreTarget,
    });
  } catch { forgedConfigRejected = true; }
  assert(forgedScoreRejected && forgedConfigRejected,
    "cross-field score and level configuration forgeries must be rejected even with a recomputed event ID");
  let retriedActive = active;
  for (let retryCount = 0; retryCount < 3; retryCount += 1) {
    const previousAttempt = retriedActive.attempt;
    retriedActive = game.createActiveLevel(
      game.CASCADE_LEVELS[0],
      new Date(Date.parse(save.updatedAt) + retryCount + 1).toISOString(),
      previousAttempt + 1,
    );
    assert(game.normalizeCascadeEvent(eventOf("level_retried", {
      levelId: "level-1", previousAttempt, attempt: retriedActive.attempt,
    })), `retry ${retryCount + 1} must report its actual attempt transition`);
  }
  const threeRetrySave = { ...save, catalystOccasion: 3, activeLevel: retriedActive };
  assert(retriedActive.attempt === 4
    && game.restoreCascadeSave(JSON.stringify(threeRetrySave), "north").activeLevel.attempt === 4,
  "three retries must atomically advance and preserve attempt 4");
  let incoherentRetryRejected = false;
  try {
    eventOf("level_retried", { levelId: "level-1", previousAttempt: 1, attempt: 3 });
  } catch { incoherentRetryRejected = true; }
  assert(incoherentRetryRejected, "retry validator must reject skipped or incoherent attempt transitions");
  checks.push("event_integrity_privacy_and_reconstruction");

  const storage = new MemoryStorage();
  await evidence.initializeCascadeSave(storage, scopeA.scopeKey, save);
  const next = await evidence.transactCascade(storage, scopeA.scopeKey, "north", "operation-one", (current) => ({
    save: { ...current, updatedAt: "2026-09-02T00:00:03.000Z" }, event: boardEvent,
  }));
  assert(next.revision === 1 && next.committedEventIds.includes(boardEvent.eventId), "atomic event/save transaction must advance revision and ledger");
  let conflict = false;
  try {
    await evidence.transactCascade(storage, scopeA.scopeKey, "north", "operation-two", (current) => ({
      save: { ...current, updatedAt: "2026-09-02T00:00:04.000Z" },
      event: { ...boardEvent, payload: { ...boardEvent.payload, rngState: 999 } },
    }));
  } catch { conflict = true; }
  assert(conflict, "conflicting event content must not commit");
  const failedFlush = await evidence.flushCascadeEvents(storage, scopeA.scopeKey, async () => false);
  assert(failedFlush.sent === 0 && failedFlush.remaining === 1, "offline failure must preserve queue");
  const retried = await evidence.flushCascadeEvents(storage, scopeA.scopeKey, async () => true);
  assert(retried.sent === 1 && retried.remaining === 0, "retry must deliver durable event");
  const concurrentEvents = [10, 11].map((millisecond) => game.createCascadeEvent({
    ...boardEvent,
    eventId: undefined,
    occurredAt: `2026-09-02T00:00:03.${millisecond}Z`,
  }));
  await evidence.transactCascade(storage, scopeA.scopeKey, "north", "multi-event-op", (current) => ({
    save: { ...current, updatedAt: "2026-09-02T00:00:04.000Z" },
    events: concurrentEvents,
  }));
  const sendCounts = new Map();
  await Promise.all([
    evidence.flushCascadeEvents(storage, scopeA.scopeKey, async (event) => {
      sendCounts.set(event.eventId, (sendCounts.get(event.eventId) || 0) + 1);
      await new Promise((resolvePromise) => setTimeout(resolvePromise, 5));
      return true;
    }),
    evidence.flushCascadeEvents(storage, scopeA.scopeKey, async (event) => {
      sendCounts.set(event.eventId, (sendCounts.get(event.eventId) || 0) + 1);
      return true;
    }),
  ]);
  assert(concurrentEvents.every((event) => sendCounts.get(event.eventId) === 1)
    && (await evidence.readCascadeQueue(storage, scopeA.scopeKey)).length === 0,
  "concurrent flushes must claim each event once and merge successful delivery safely");

  const interruptedStorage = new InterruptedCommitStorage();
  await evidence.initializeCascadeSave(interruptedStorage, scopeA.scopeKey, save);
  const auxiliaryEvent = game.createCascadeEvent({
    ...boardEvent, eventId: undefined, occurredAt: "2026-09-02T00:00:00.001Z",
  });
  interruptedStorage.failNextSave = true;
  let recoveryDerivations = 0;
  const recovered = await evidence.transactCascade(interruptedStorage, scopeA.scopeKey, "north", "recoverable-op", (current) => {
    recoveryDerivations += 1;
    return {
      save: { ...current, updatedAt: "2026-09-02T00:00:03.000Z" },
      events: [boardEvent, auxiliaryEvent],
    };
  });
  await evidence.transactCascade(interruptedStorage, scopeA.scopeKey, "north", "recoverable-op", () => {
    recoveryDerivations += 1;
    throw new Error("idempotent replay must not derive twice");
  });
  assert(recovered.revision === 1 && recovered.lastOperationId === "recoverable-op"
    && recoveryDerivations === 1
    && (await evidence.readCascadeQueue(interruptedStorage, scopeA.scopeKey)).length === 2
    && (await evidence.readCascadeQueue(interruptedStorage, scopeA.scopeKey)).every((entry) => entry.committed),
  "prepared multi-event transaction must recover before returning and replay idempotently");

  const moveFaultStorage = new InterruptedCommitStorage();
  const playableSave = {
    ...save,
    gameSessionId: "cascade-session-test-0001",
    catalystOccasion: 1,
    activeLevel: { ...active, catalystUsed: true },
  };
  await evidence.initializeCascadeSave(moveFaultStorage, scopeA.scopeKey, playableSave);
  moveFaultStorage.failNextSave = true;
  let moveDerivations = 0;
  const recoveredMove = await evidence.transactCascade(
    moveFaultStorage,
    scopeA.scopeKey,
    "north",
    "faulted-move-op",
    (current) => {
      moveDerivations += 1;
      const currentActive = current.activeLevel;
      const currentBoard = game.decodeBoard(currentActive.board);
      const result = game.applySwap(
        currentBoard,
        currentActive.rngState,
        representativeMove.from,
        representativeMove.to,
        game.CASCADE_LEVELS[0].goals,
      );
      return {
        save: {
          ...current,
          activeLevel: {
            ...currentActive,
            board: game.encodeBoard(result.board),
            rngState: result.rng.state,
            movesRemaining: currentActive.movesRemaining - 1,
            score: currentActive.score + result.scoreDelta,
          },
          updatedAt: "2026-09-02T00:00:03.000Z",
        },
        event: moveEvent,
      };
    },
  );
  const replayedMove = await evidence.transactCascade(
    moveFaultStorage,
    scopeA.scopeKey,
    "north",
    "faulted-move-op",
    () => {
      moveDerivations += 1;
      throw new Error("faulted move replay must not derive");
    },
  );
  assert(moveDerivations === 1 && recoveredMove.revision === 1 && replayedMove.revision === 1
    && replayedMove.activeLevel.movesRemaining === active.movesRemaining - 1
    && (await evidence.readCascadeQueue(moveFaultStorage, scopeA.scopeKey)).length === 1,
  "faulted move recovery must expose the committed board and never hide a double move");

  const resetFaultStorage = new InterruptedCommitStorage();
  await evidence.initializeCascadeSave(resetFaultStorage, scopeA.scopeKey, playableSave);
  const nextSessionId = "cascade-session-reset-fault-0002";
  resetFaultStorage.failNextSave = true;
  let resetDerivations = 0;
  const recoveredReset = await evidence.transactCascade(
    resetFaultStorage,
    scopeA.scopeKey,
    "north",
    "faulted-reset-op",
    (current) => {
      resetDerivations += 1;
      const resetAt = "2026-09-02T00:00:04.000Z";
      return {
        save: {
          ...game.createInitialCascadeSave(
            current.anonymousPlayerId,
            current.libraryScopeId,
            resetAt,
            nextSessionId,
          ),
          revision: current.revision,
          committedEventIds: current.committedEventIds,
        },
        event: game.createCascadeEvent({
          eventType: "campaign_reset",
          evidenceClass: "gameplay_telemetry",
          gameSessionId: current.gameSessionId,
          anonymousPlayerId: current.anonymousPlayerId,
          libraryScopeId: current.libraryScopeId,
          occurredAt: resetAt,
          timingBucket: "instant",
          preferenceInference: "none_from_gameplay",
          payload: {
            previousGameSessionId: current.gameSessionId,
            nextGameSessionId: nextSessionId,
            previousRevision: current.revision,
          },
        }),
      };
    },
  );
  const replayedReset = await evidence.transactCascade(
    resetFaultStorage,
    scopeA.scopeKey,
    "north",
    "faulted-reset-op",
    () => {
      resetDerivations += 1;
      throw new Error("faulted reset replay must not derive");
    },
  );
  assert(resetDerivations === 1 && recoveredReset.gameSessionId === nextSessionId
    && replayedReset.gameSessionId === nextSessionId && replayedReset.activeLevel === null
    && (await evidence.loadCascadeSave(resetFaultStorage, scopeA.scopeKey, "north")).gameSessionId === nextSessionId,
  "faulted reset recovery must expose the new durable session boundary without repeating reset");

  const staleTabStorage = new MemoryStorage();
  const staleSessionId = "cascade-session-stale-tab-0001";
  const resetSessionId = "cascade-session-cross-tab-reset-0002";
  const levelTwelve = game.CASCADE_LEVELS[11];
  const staleSnapshot = {
    ...game.createInitialCascadeSave(
      scopeA.anonymousPlayerId,
      scopeA.libraryScopeId,
      "2026-09-02T01:00:00.000Z",
      staleSessionId,
    ),
    unlockedLevel: 12,
  };
  await evidence.initializeCascadeSave(staleTabStorage, scopeA.scopeKey, staleSnapshot);
  await evidence.transactCascade(staleTabStorage, scopeA.scopeKey, "north", "cross-tab-reset", (current) => ({
    save: {
      ...game.createInitialCascadeSave(
        current.anonymousPlayerId,
        current.libraryScopeId,
        "2026-09-02T01:00:01.000Z",
        resetSessionId,
      ),
      revision: current.revision,
      committedEventIds: current.committedEventIds,
    },
    event: game.createCascadeEvent({
      eventType: "campaign_reset",
      evidenceClass: "gameplay_telemetry",
      gameSessionId: current.gameSessionId,
      anonymousPlayerId: current.anonymousPlayerId,
      libraryScopeId: current.libraryScopeId,
      occurredAt: "2026-09-02T01:00:01.000Z",
      timingBucket: "instant",
      preferenceInference: "none_from_gameplay",
      payload: {
        previousGameSessionId: current.gameSessionId,
        nextGameSessionId: resetSessionId,
        previousRevision: current.revision,
      },
    }),
  }));
  const beforeStaleOpenSave = await evidence.loadCascadeSave(staleTabStorage, scopeA.scopeKey, "north");
  const beforeStaleOpenQueue = await evidence.readCascadeQueue(staleTabStorage, scopeA.scopeKey);
  let staleOpenError = null;
  try {
    await evidence.transactCascade(staleTabStorage, scopeA.scopeKey, "north", "stale-level-12-open", (current) => {
      const durableLevel = game.assertCascadeLevelOpenCurrent(
        current,
        levelTwelve.id,
        levelTwelve.number,
        staleSnapshot.gameSessionId,
        staleSnapshot.revision,
      );
      const activeLevel = game.createActiveLevel(durableLevel, "2026-09-02T01:00:02.000Z");
      return {
        save: { ...current, activeLevel, updatedAt: "2026-09-02T01:00:02.000Z" },
        event: game.createCascadeEvent({
          eventType: "level_started",
          evidenceClass: "gameplay_telemetry",
          gameSessionId: current.gameSessionId,
          anonymousPlayerId: current.anonymousPlayerId,
          libraryScopeId: current.libraryScopeId,
          occurredAt: "2026-09-02T01:00:02.000Z",
          timingBucket: "instant",
          preferenceInference: "none_from_gameplay",
          payload: {
            levelId: durableLevel.id,
            levelSeed: durableLevel.seed,
            moves: durableLevel.moves,
            goals: durableLevel.goals,
            scoreTarget: durableLevel.scoreTarget,
          },
        }),
      };
    });
  } catch (error) {
    staleOpenError = error;
  }
  const afterStaleOpenSave = await evidence.loadCascadeSave(staleTabStorage, scopeA.scopeKey, "north");
  const afterStaleOpenQueue = await evidence.readCascadeQueue(staleTabStorage, scopeA.scopeKey);
  assert(staleOpenError?.message === "stale_cascade_session"
    && JSON.stringify(afterStaleOpenSave) === JSON.stringify(beforeStaleOpenSave)
    && JSON.stringify(afterStaleOpenQueue) === JSON.stringify(beforeStaleOpenQueue)
    && afterStaleOpenSave.gameSessionId === resetSessionId
    && afterStaleOpenSave.unlockedLevel === 1
    && afterStaleOpenSave.activeLevel === null,
  "cross-tab reset must make a stale level-12 open reject without save or event mutation");
  let lockedLevelError = null;
  try {
    game.assertCascadeLevelOpenCurrent(
      afterStaleOpenSave,
      levelTwelve.id,
      levelTwelve.number,
      afterStaleOpenSave.gameSessionId,
      afterStaleOpenSave.revision,
    );
  } catch (error) {
    lockedLevelError = error;
  }
  assert(lockedLevelError?.message === "cascade_level_locked_or_invalid",
    "latest durable unlocked level must be revalidated independently of the session boundary");
  checks.push("cross_tab_reset_stale_open");

  const staleUiCases = [
    {
      name: "catalyst",
      rendered: { ...playableSave, activeLevel: { ...active, catalystUsed: false } },
      concurrent: (current) => ({
        ...current,
        activeLevel: { ...current.activeLevel, catalystUsed: true },
        catalystOccasion: current.catalystOccasion + 1,
      }),
      staleAction: (current) => ({
        ...current,
        activeLevel: { ...current.activeLevel, catalystUsed: true },
        catalystOccasion: current.catalystOccasion + 1,
      }),
    },
    {
      name: "move",
      rendered: playableSave,
      concurrent: (current) => ({
        ...current,
        activeLevel: { ...current.activeLevel, movesRemaining: current.activeLevel.movesRemaining - 1 },
      }),
      staleAction: (current) => ({
        ...current,
        activeLevel: { ...current.activeLevel, movesRemaining: current.activeLevel.movesRemaining - 1 },
      }),
    },
    {
      name: "retry",
      rendered: { ...playableSave, activeLevel: { ...active, catalystUsed: true, movesRemaining: 0 } },
      concurrent: (current) => ({
        ...current,
        activeLevel: game.createActiveLevel(
          game.CASCADE_LEVELS[0],
          "2026-09-02T02:00:01.000Z",
          current.activeLevel.attempt + 1,
        ),
      }),
      staleAction: (current) => ({
        ...current,
        activeLevel: game.createActiveLevel(
          game.CASCADE_LEVELS[0],
          "2026-09-02T02:00:02.000Z",
          current.activeLevel.attempt + 1,
        ),
      }),
    },
    {
      name: "close",
      rendered: { ...playableSave, activeLevel: { ...active, catalystUsed: true, movesRemaining: 0 } },
      concurrent: (current) => ({
        ...current,
        activeLevel: game.createActiveLevel(
          game.CASCADE_LEVELS[0],
          "2026-09-02T02:00:01.000Z",
          current.activeLevel.attempt + 1,
        ),
      }),
      staleAction: (current) => ({ ...current, activeLevel: null }),
    },
  ];
  for (const testCase of staleUiCases) {
    const caseStorage = new MemoryStorage();
    await evidence.initializeCascadeSave(caseStorage, scopeA.scopeKey, testCase.rendered);
    const rendered = await evidence.loadCascadeSave(caseStorage, scopeA.scopeKey, "north");
    const expected = game.captureCascadeExpectedState(rendered);
    assert(expected.libraryScopeId === "north"
      && expected.activeLevelId === rendered.activeLevel.levelId
      && expected.activeAttempt === rendered.activeLevel.attempt
      && expected.activeBoard === rendered.activeLevel.board
      && expected.activeBoardChecksum === game.boardChecksum(rendered.activeLevel.board),
    `${testCase.name} expected state must bind normalized library, session, revision, attempt, and board`);
    await evidence.transactCascade(
      caseStorage,
      scopeA.scopeKey,
      "north",
      `other-tab-${testCase.name}`,
      (current) => ({
        save: {
          ...testCase.concurrent(current),
          updatedAt: "2026-09-02T02:00:01.000Z",
        },
      }),
    );
    const beforeRejectedSave = await evidence.loadCascadeSave(caseStorage, scopeA.scopeKey, "north");
    const beforeRejectedQueue = await evidence.readCascadeQueue(caseStorage, scopeA.scopeKey);
    let staleError = null;
    try {
      await evidence.transactCascade(
        caseStorage,
        scopeA.scopeKey,
        "north",
        `stale-tab-${testCase.name}`,
        (current) => {
          game.assertCascadeExpectedState(current, expected);
          return {
            save: {
              ...testCase.staleAction(current),
              updatedAt: "2026-09-02T02:00:02.000Z",
            },
            event: boardEvent,
          };
        },
      );
    } catch (error) {
      staleError = error;
    }
    const afterRejectedSave = await evidence.loadCascadeSave(caseStorage, scopeA.scopeKey, "north");
    const afterRejectedQueue = await evidence.readCascadeQueue(caseStorage, scopeA.scopeKey);
    assert(staleError?.message === "stale_cascade_session"
      && JSON.stringify(afterRejectedSave) === JSON.stringify(beforeRejectedSave)
      && JSON.stringify(afterRejectedQueue) === JSON.stringify(beforeRejectedQueue),
    `cross-tab stale ${testCase.name} must reject without save or event mutation`);
  }
  checks.push("cross_tab_stale_ui_transactions");

  const capacityEntries = [];
  for (let index = 0; index < evidence.CASCADE_QUEUE_CAPACITY; index += 1) {
    const event = game.createCascadeEvent({
      ...boardEvent,
      eventId: undefined,
      occurredAt: new Date(Date.parse("2026-09-03T00:00:00.000Z") + index).toISOString(),
    });
    capacityEntries.push({ event, committed: true });
  }
  await storage.setItem(game.scopedCascadeKey(game.CASCADE_QUEUE_KEY, scopeA.scopeKey), JSON.stringify(capacityEntries));
  const beforeCapacitySave = await evidence.loadCascadeSave(storage, scopeA.scopeKey, "north");
  let capacityRejected = false;
  try {
    await evidence.transactCascade(storage, scopeA.scopeKey, "north", "capacity-op", (current) => ({
      save: { ...current, updatedAt: "2026-09-04T00:00:00.000Z" },
      event: game.createCascadeEvent({ ...boardEvent, eventId: undefined, occurredAt: "2026-09-04T00:00:00.000Z" }),
    }));
  } catch { capacityRejected = true; }
  const afterCapacitySave = await evidence.loadCascadeSave(storage, scopeA.scopeKey, "north");
  assert(capacityRejected && (await evidence.readCascadeQueue(storage, scopeA.scopeKey)).length === evidence.CASCADE_QUEUE_CAPACITY
    && afterCapacitySave.revision === beforeCapacitySave.revision,
  "full queue must reject atomically and never silently evict unsent evidence");
  checks.push("atomic_queue_offline_retry");

  assert(api.alchemistsCascadeEventPath(boardEvent).startsWith("recommendation-games/the-alchemists-cascade/v1/north/"), "API path must bind private library namespace");
  const apiSource = readFileSync(resolve(root, "api/alchemists-cascade-event.ts"), "utf8");
  const quotaSource = readFileSync(resolve(root, "lib/recommendationGames/alchemistsCascadeQuota.ts"), "utf8");
  assert(apiSource.includes('access: "private"') && apiSource.includes("allowOverwrite: false") && apiSource.includes("readExisting"), "Blob storage must be private and truly idempotent");
  assert(apiSource.includes("sameOrigin") && apiSource.includes("content-type") && apiSource.includes("sourceRateLimited")
    && apiSource.includes('headers["x-forwarded-for"]') && apiSource.includes("remoteAddress")
    && apiSource.includes("CASCADE_SOURCE_RATE_LIMIT") && apiSource.includes("enforceSharedCascadeQuota"),
  "API protections must combine same-origin, transient source, and durable shared quotas");
  assert(quotaSource.includes("CREATE TABLE IF NOT EXISTS alchemists_cascade_quota")
    && quotaSource.includes("ON CONFLICT (bucket_key, window_start_ms) DO UPDATE")
    && quotaSource.includes("request_count = alchemists_cascade_quota.request_count + 1")
    && quotaSource.includes("LIMIT 100")
    && !quotaSource.toLowerCase().includes("ipaddress")
    && !quotaSource.toLowerCase().includes("x-forwarded-for"),
  "shared quota must use one atomic upsert with bounded cleanup and never persist source addresses");
  const sourceGuardIndex = apiSource.indexOf("if (sourceRateLimited(req))");
  const bodySerializationIndex = apiSource.indexOf("let serializedBody");
  const sizeGuardIndex = apiSource.indexOf("if (serializedBody.length > 48_000)");
  const normalizeIndex = apiSource.indexOf("const event = normalizeCascadeEvent(req.body)");
  const sharedQuotaIndex = apiSource.indexOf("await enforceSharedCascadeQuota");
  const methodGuardIndex = apiSource.indexOf('if (req.method !== "POST")');
  const originGuardIndex = apiSource.indexOf("if (!sameOrigin(req))");
  const contentTypeGuardIndex = apiSource.indexOf('if (!String(req.headers["content-type"]');
  assert(methodGuardIndex > 0 && methodGuardIndex < originGuardIndex
    && originGuardIndex < contentTypeGuardIndex && contentTypeGuardIndex < sourceGuardIndex
    && sourceGuardIndex < bodySerializationIndex && bodySerializationIndex < sizeGuardIndex
    && sizeGuardIndex < normalizeIndex && normalizeIndex < sharedQuotaIndex,
  "transient source quota must precede body work and shared identity/global quota must follow canonical normalization");
  class MemoryQuotaStore {
    counts = new Map();
    queries = [];
    async increment(buckets, nowMs) {
      this.queries.push(buckets.map((bucket) => ({ ...bucket })));
      const expired = [...this.counts.entries()]
        .filter(([, value]) => value.expiresAtMs < nowMs)
        .sort((left, right) => left[1].expiresAtMs - right[1].expiresAtMs)
        .slice(0, 100);
      expired.forEach(([key]) => this.counts.delete(key));
      const rows = buckets.map((bucket) => {
        const key = `${bucket.key}:${bucket.windowStartMs}`;
        const prior = this.counts.get(key);
        const count = (prior?.count || 0) + 1;
        this.counts.set(key, { count, expiresAtMs: bucket.expiresAtMs });
        return { key: bucket.key, windowStartMs: bucket.windowStartMs, count };
      });
      return rows.reverse();
    }
  }
  const quotaNow = Date.parse("2026-09-02T15:32:11.123Z");
  const quotaBuckets = quota.buildCascadeQuotaBuckets(boardEvent, quotaNow);
  assert(quotaBuckets.map((bucket) => bucket.key).join("|")
    === `global:minute|global:hour|identity:north:${boardEvent.anonymousPlayerId}`
    && quotaBuckets[0].windowStartMs === Math.floor(quotaNow / 60_000) * 60_000
    && quotaBuckets[1].windowStartMs === Math.floor(quotaNow / 3_600_000) * 3_600_000,
  "quota buckets must use deterministic global minute/hour and normalized anonymous/library identity keys");
  const sharedQuotaStore = new MemoryQuotaStore();
  for (let index = 0; index < 105; index += 1) {
    sharedQuotaStore.counts.set(`expired:${index}`, { count: 1, expiresAtMs: quotaNow - index - 1 });
  }
  await quota.enforceSharedCascadeQuota(sharedQuotaStore, boardEvent, quotaNow);
  assert([...sharedQuotaStore.counts.keys()].filter((key) => key.startsWith("expired:")).length === 5,
    "shared quota cleanup must be expiry ordered and bounded to one hundred rows");
  let sharedQuotaResult;
  for (let index = 0; index <= quota.CASCADE_IDENTITY_MINUTE_LIMIT; index += 1) {
    sharedQuotaResult = await quota.enforceSharedCascadeQuota(sharedQuotaStore, boardEvent, quotaNow);
  }
  assert(!sharedQuotaResult.allowed
    && sharedQuotaResult.exceededBucketKeys.join() === `identity:north:${boardEvent.anonymousPlayerId}`
    && sharedQuotaStore.queries.every((query) => query.length === 3),
  "atomic shared quota must increment all buckets and enforce the identity limit independent of row ordering");
  let quotaUnavailable = false;
  try {
    await quota.enforceSharedCascadeQuota({
      async increment() { throw new Error("postgres_unavailable"); },
    }, boardEvent, quotaNow);
  } catch { quotaUnavailable = true; }
  assert(quotaUnavailable, "shared quota storage failure must fail closed instead of accepting an upload");
  assert(apiSource.includes('status(503).json({ error: "cascade_quota_storage_unavailable" })')
    && apiSource.includes('status(429).json({ error: "cascade_rate_limited" })'),
  "quota storage failure and exhausted quota must remain distinct 503 and 429 responses");
  api.resetCascadeRateLimitsForTests();
  const forwardedRequest = {
    headers: { "x-forwarded-for": "203.0.113.8, 10.0.0.1" },
    socket: { remoteAddress: "10.0.0.2" },
  };
  let forwardedLimited = false;
  for (let index = 0; index <= api.CASCADE_SOURCE_RATE_LIMIT; index += 1) {
    forwardedLimited = api.sourceRateLimited(forwardedRequest);
  }
  assert(forwardedLimited, "x-forwarded-for request source must enforce its generous shared-source quota");
  api.resetCascadeRateLimitsForTests();
  const remoteRequest = { headers: {}, socket: { remoteAddress: "198.51.100.44" } };
  let remoteLimited = false;
  for (let index = 0; index <= api.CASCADE_SOURCE_RATE_LIMIT; index += 1) {
    remoteLimited = api.sourceRateLimited(remoteRequest);
  }
  assert(remoteLimited, "remoteAddress fallback must enforce the request-source quota");
  const bucketCounts = api.cascadeRateBucketCountsForTests();
  assert(bucketCounts.source <= api.CASCADE_MAX_RATE_BUCKETS,
    "transient request-source quota buckets must remain bounded");
  assert(!JSON.stringify(boardEvent).includes("203.0.113.8")
    && !JSON.stringify(boardEvent).includes("198.51.100.44"),
  "transient request sources must never enter evidence");
  api.resetCascadeRateLimitsForTests();
  const previousBlobToken = process.env.BLOB_READ_WRITE_TOKEN;
  process.env.BLOB_READ_WRITE_TOKEN = "cascade-rate-limit-test-token";
  const invalidRequest = {
    method: "POST",
    headers: {
      origin: "https://cascade.example.test",
      host: "cascade.example.test",
      "content-type": "application/json",
      "x-forwarded-for": "203.0.113.99",
    },
    socket: { remoteAddress: "10.0.0.3" },
    body: { eventType: "forged_invalid_event" },
  };
  const invokeInvalidRequest = async () => {
    let statusCode = 200;
    const response = {
      setHeader() {},
      status(value) { statusCode = value; return response; },
      json(payload) { return { statusCode, payload }; },
    };
    return api.default(invalidRequest, response);
  };
  const oversizedRequest = {
    ...invalidRequest,
    body: { padding: "x".repeat(48_001) },
  };
  const invokeOversizedRequest = async () => {
    const originalBody = invalidRequest.body;
    invalidRequest.body = oversizedRequest.body;
    const result = await invokeInvalidRequest();
    invalidRequest.body = originalBody;
    return result;
  };
  const oversizedResponse = await invokeOversizedRequest();
  let firstInvalidResponse = null;
  let invalidQuotaResponse = null;
  for (let index = 1; index <= api.CASCADE_SOURCE_RATE_LIMIT; index += 1) {
    invalidQuotaResponse = await invokeInvalidRequest();
    if (index === 1) firstInvalidResponse = invalidQuotaResponse;
  }
  if (previousBlobToken === undefined) delete process.env.BLOB_READ_WRITE_TOKEN;
  else process.env.BLOB_READ_WRITE_TOKEN = previousBlobToken;
  assert(oversizedResponse.statusCode === 413
    && firstInvalidResponse.statusCode === 400
    && invalidQuotaResponse.statusCode === 429
    && invalidQuotaResponse.payload.error === "cascade_rate_limited",
  "oversized and schema-invalid events must consume source/global budget before body work");
  api.resetCascadeRateLimitsForTests();
  const originalFetch = globalThis.fetch;
  let rateLimitCalls = 0;
  globalThis.fetch = async () => {
    rateLimitCalls += 1;
    return new Response(JSON.stringify({ error: "cascade_rate_limited" }), {
      status: 429, headers: { "Retry-After": "60", "Content-Type": "application/json" },
    });
  };
  assert(!await evidence.sendCascadeEventRequest(boardEvent, "https://example.test/cascade-rate-limit")
    && !await evidence.sendCascadeEventRequest(boardEvent, "https://example.test/cascade-rate-limit")
    && rateLimitCalls === 1,
  "client must honor Retry-After without hammering the endpoint");

  globalThis.fetch = async () => new Response(JSON.stringify({
    status: "accepted",
    eventId: boardEvent.eventId,
    storageMode: "durable_blob",
  }), { status: 201, headers: { "Content-Type": "application/json; charset=utf-8" } });
  assert(await evidence.sendCascadeEventRequest(boardEvent, "https://example.test/cascade-accepted"),
    "client must accept the exact 201 durable acknowledgement");
  globalThis.fetch = async () => new Response(JSON.stringify({
    status: "accepted",
    eventId: boardEvent.eventId,
    storageMode: "durable_blob",
    idempotentReplay: true,
  }), { status: 200, headers: { "Content-Type": "application/json" } });
  assert(await evidence.sendCascadeEventRequest(boardEvent, "https://example.test/cascade-duplicate"),
    "client must accept the exact 200 durable replay acknowledgement");
  const rejectedAcknowledgements = [
    {
      status: 200,
      payload: { status: "accepted", eventId: boardEvent.eventId, storageMode: "durable_blob" },
      name: "unmarked accepted replay",
    },
    {
      status: 200,
      payload: { status: "duplicate", eventId: boardEvent.eventId, storageMode: "durable_blob" },
      name: "legacy duplicate",
    },
    {
      status: 201,
      payload: {
        status: "accepted", eventId: boardEvent.eventId,
        storageMode: "durable_blob", idempotentReplay: true,
      },
      name: "replay marker on create",
    },
    {
      status: 201,
      payload: {
        status: "accepted", eventId: boardEvent.eventId,
        storageMode: "durable_blob", extra: true,
      },
      name: "extra acknowledgement field",
    },
    {
      status: 201,
      payload: { status: "accepted", eventId: boardEvent.eventId, storageMode: "memory" },
      name: "non-durable storage",
    },
  ];
  for (const variant of rejectedAcknowledgements) {
    globalThis.fetch = async () => new Response(JSON.stringify(variant.payload), {
      status: variant.status, headers: { "Content-Type": "application/json" },
    });
    assert(!await evidence.sendCascadeEventRequest(
      boardEvent,
      `https://example.test/cascade-rejected-${variant.name.replaceAll(" ", "-")}`,
    ), `client must reject ${variant.name}`);
  }
  globalThis.fetch = async () => new Response("<!doctype html><title>NovelIdeas</title>", {
    status: 200,
    headers: { "Content-Type": "text/html" },
  });
  assert(!await evidence.sendCascadeEventRequest(boardEvent, "https://example.test/cascade-spa"),
    "HTML SPA fallback must never acknowledge an event");
  globalThis.fetch = async () => new Response(JSON.stringify({
    status: "accepted",
    eventId: "ace-".padEnd(68, "0"),
  }), { status: 200, headers: { "Content-Type": "application/json" } });
  assert(!await evidence.sendCascadeEventRequest(boardEvent, "https://example.test/cascade-wrong-event"),
    "unrelated JSON success must not acknowledge a different event ID");
  globalThis.fetch = async () => new Response(JSON.stringify({
    status: "ok",
    eventId: boardEvent.eventId,
  }), { status: 200, headers: { "Content-Type": "application/json" } });
  assert(!await evidence.sendCascadeEventRequest(boardEvent, "https://example.test/cascade-wrong-shape"),
    "unrelated JSON status must not acknowledge an event");

  const transportStorage = new MemoryStorage();
  await evidence.initializeCascadeSave(transportStorage, scopeA.scopeKey, save);
  await evidence.transactCascade(transportStorage, scopeA.scopeKey, "north", "transport-queue-op", (current) => ({
    save: { ...current, updatedAt: "2026-09-02T03:00:00.000Z" },
    event: boardEvent,
  }));
  globalThis.fetch = async () => new Response(JSON.stringify({
    status: "accepted",
    eventId: boardEvent.eventId,
    storageMode: "durable_blob",
  }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
  const rejectedTransportFlush = await evidence.flushCascadeEvents(
    transportStorage,
    scopeA.scopeKey,
    (event) => evidence.sendCascadeEventRequest(event, "https://example.test/cascade-queued-unmarked"),
  );
  assert(rejectedTransportFlush.sent === 0 && rejectedTransportFlush.remaining === 1
    && (await evidence.readCascadeQueue(transportStorage, scopeA.scopeKey))[0].event.eventId === boardEvent.eventId,
  "an unmarked 200 accepted response must leave the exact event queued");
  globalThis.fetch = originalFetch;
  checks.push("api_namespace_rate_order_and_transport");

  const route = readFileSync(resolve(root, "app/games/alchemists-cascade.tsx"), "utf8");
  const hub = readFileSync(resolve(root, "app/games/index.tsx"), "utf8");
  const layout = readFileSync(resolve(root, "app/_layout.tsx"), "utf8");
  assert(hub.includes("The Alchemist's Cascade") && hub.includes('pathname: "/games/alchemists-cascade"'), "games hub integration missing");
  assert(layout.includes('name="games/alchemists-cascade"'), "layout route registration missing");
  assert(route.includes("onPress={() => onCell(at)}") && route.includes('document.addEventListener("keydown"') && route.includes("accessibilityLabel={`Row"), "touch, keyboard, and cell accessibility wiring missing");
  assert(route.includes("What the cauldron remembers") && route.includes("IP addresses") && route.includes("never count as taste"), "privacy disclosure is incomplete");
  assert(route.includes('eventType: "campaign_reset"') && route.includes("sessionId.current = fresh.gameSessionId")
    && route.includes("synchronizeDurableUi") && route.includes("sessionId.current = durable.gameSessionId")
    && route.includes("activeLevelPhase(save.activeLevel, activeConfig)")
    && route.includes("assertCascadeLevelOpenCurrent")
    && route.includes("gameSessionId: args.save.gameSessionId")
    && route.includes("This game changed in another tab")
    && route.includes("captureCascadeExpectedState")
    && route.includes("assertCascadeExpectedState"),
  "reset boundaries, durable UI recovery, session rotation, and terminal move guards must remain wired");
  assert((route.match(/\bmutate\(/g) || []).length === 9
    && (route.match(/\bassertCascadeExpectedState\(current, expected\)/g) || []).length === 9,
  "every durable UI transaction must run the same expected-state guard inside its derivation");
  checks.push("route_touch_keyboard_accessibility");

  console.log(`The Alchemist's Cascade: ${checks.length} regression groups passed`);
  checks.forEach((check) => console.log(`  ✓ ${check}`));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
