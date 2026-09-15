import assert from 'node:assert/strict';
import * as game from '../lib/recommendationGames/alchemistsCascade';
import { cascadeMoveHint } from '../lib/recommendationGames/alchemistsCascadeHints';

const config = game.CASCADE_LEVELS[10];
const now = '2026-09-14T00:00:00.000Z';
const scope = game.createCascadeScope('qa-fairness', 'default');
const base = game.createInitialCascadeSave(scope.anonymousPlayerId, 'default', now);
const snapshot = (collected: number[]) => config.goals.map(g => ({ ingredientId: game.INGREDIENTS[g.kind].id, target: g.target, collected: collected[g.kind] }));
let certificates = 0;
let minimumSlack = config.moves;
for (const attempt of [1, 2, 100, 10000]) for (let slot = 0; slot < 3; slot++) {
  let state = game.createActiveLevel(config, now, attempt, 2);
  const initial = game.decodeBoard(state.board)!;
  const boosted = game.applyCatalyst(initial, state.rngState, game.catalystOptions(initial, 'qa', 3, state.rngState, config.goals)[slot]);
  state = { ...state, board: game.encodeBoard(boosted.board), rngState: boosted.rng.state, collected: boosted.collected, score: boosted.scoreDelta, catalystUsed: true };
  while (!game.levelWon(state, config) && state.movesRemaining > 0) {
    const board = game.decodeBoard(state.board)!;
    const before = JSON.stringify(state);
    const hint = cascadeMoveHint(board, config, state);
    assert.ok(hint?.guided, 'entire route must be certified, not just a legal hint');
    assert.equal(JSON.stringify(state), before, 'hint is read-only');
    assert.equal(cascadeMoveHint(board, config, { ...state, rngState: state.rngState + 1 })?.guided, false);
    const result = game.applySwap(board, state.rngState, hint.from, hint.to, config.goals, 2);
    assert.ok(result.valid);
    assert.deepEqual(result, game.applySwap(board, state.rngState, hint.from, hint.to, config.goals, 2), 'deterministic replay');
    const collected = state.collected.map((n, i) => n + result.collected[i]);
    const payload = {
      levelId: config.id, from: hint.from, to: hint.to, boardBefore: state.board, boardAfter: game.encodeBoard(result.board),
      beforeChecksum: game.boardChecksum(state.board), afterChecksum: game.boardChecksum(result.board),
      rngBefore: state.rngState, rngAfter: result.rng.state, legalMoves: result.legalMovesBefore.slice(0, 24), cascadeSteps: result.steps,
      scoreBefore: state.score, scoreAfter: state.score + result.scoreDelta, scoreDelta: result.scoreDelta,
      movesBefore: state.movesRemaining, movesAfter: state.movesRemaining - 1,
      goalsBefore: snapshot(state.collected), goalsAfter: snapshot(collected), ordinaryMoveSemanticEvidence: false,
      reshuffled: result.reshuffled, reshuffleInventoryPreserved: result.reshuffleInventoryPreserved,
      reshuffleRngBefore: result.reshuffleRngBefore, reshuffleAttempts: result.reshuffleAttempts, rulesVersion: 2,
    };
    const eventInput = { evidenceClass: 'gameplay_telemetry' as const, gameSessionId: base.gameSessionId, anonymousPlayerId: base.anonymousPlayerId, libraryScopeId: 'default', occurredAt: now, timingBucket: 'instant' as const, preferenceInference: 'none_from_gameplay' as const };
    const event = game.createCascadeEvent({ ...eventInput, eventType: 'move_applied', payload });
    assert.ok(game.normalizeCascadeEvent(event));
    const { rulesVersion: _rules, ...legacyPayload } = payload;
    assert.throws(() => game.createCascadeEvent({ ...eventInput, eventType: 'move_applied', payload: legacyPayload }), 'fair moves must not be accepted as legacy');
    assert.throws(() => game.createCascadeEvent({ ...eventInput, eventType: 'move_applied', payload: { ...payload, rulesVersion: 3 } }));
    const cascade = game.createCascadeEvent({ ...eventInput, eventType: 'cascade_resolved', payload: {
      levelId: config.id, sourceMoveEventId: event.eventId, sourceMoveOccurredAt: now, sourceMoveTimingBucket: 'instant',
      ...Object.fromEntries(Object.entries(payload).filter(([key]) => key !== 'levelId')),
    } });
    assert.ok(game.normalizeCascadeEvent(cascade), 'source binding retains rule version');
    state = { ...state, board: payload.boardAfter, rngState: result.rng.state, collected, score: payload.scoreAfter, movesRemaining: payload.movesAfter };
    const saved = { ...base, unlockedLevel: 11, catalystOccasion: attempt, activeLevel: state };
    assert.deepEqual(game.restoreCascadeSave(JSON.stringify(saved), 'default'), saved);
  }
  assert.ok(game.levelWon(state, config), 'every opening offer has a winning path');
  assert.ok(state.movesRemaining >= 3, 'route must leave meaningful slack');
  minimumSlack = Math.min(minimumSlack, state.movesRemaining);
  certificates++;
}
for (const rules of [1, 2] as const) {
  const saved = { ...base, unlockedLevel: 11, activeLevel: game.createActiveLevel(config, now, 1, rules) };
  assert.deepEqual(game.restoreCascadeSave(JSON.stringify(saved), 'default'), saved, 'unstarted old and new boards round-trip unchanged');
}
console.log(`${certificates} fair-recipe route certificates passed, with at least ${minimumSlack} moves left, save round trips, event replay, version rejection and source binding.`);
