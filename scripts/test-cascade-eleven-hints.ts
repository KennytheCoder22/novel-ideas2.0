import assert from 'node:assert/strict';
import { CASCADE_LEVELS, createActiveLevel, decodeBoard, encodeBoard, catalystOptions, applyCatalyst, applySwap, levelWon } from '../lib/recommendationGames/alchemistsCascade';
import { cascadeMoveHint } from '../lib/recommendationGames/alchemistsCascadeHints';
const config = CASCADE_LEVELS[10];
for (let slot = 0; slot < 3; slot++) {
  let state = createActiveLevel(config, '2026-09-13T00:00:00.000Z', 10);
  let board = decodeBoard(state.board)!;
  const boost = applyCatalyst(board, state.rngState, catalystOptions(board, 'qa-hints', 7, state.rngState, config.goals)[slot]);
  state = { ...state, board: encodeBoard(boost.board), rngState: boost.rng.state, collected: boost.collected, score: boost.scoreDelta, catalystUsed: true };
  const before = JSON.stringify(state);
  assert.equal(cascadeMoveHint(boost.board, config, { ...state, rngState: state.rngState + 1 })?.guided, false, 'mismatched RNG must not claim a tested path');
  assert.equal(JSON.stringify(state), before);
  for (let count = 0; count < 10; count++) {
    board = decodeBoard(state.board)!;
    const snapshot = JSON.stringify({ board, state });
    const hint = cascadeMoveHint(board, config, state);
    assert.ok(hint?.guided, 'every solution step must be a verified hint');
    assert.equal(JSON.stringify({ board, state }), snapshot, 'hints must not mutate campaign');
    const move = applySwap(board, state.rngState, hint.from, hint.to, config.goals);
    state = { ...state, board: encodeBoard(move.board), rngState: move.rng.state, movesRemaining: state.movesRemaining - 1, score: state.score + move.scoreDelta, collected: state.collected.map((n,i) => n + move.collected[i]) };
  }
  assert.ok(levelWon(state, config));
  assert.equal(state.movesRemaining, 9);
  assert.ok(state.collected[1] >= 23);
}
console.log('Recipe 11: all three opening offers win via 10 verified hints, with 9 moves left; mismatch and non-mutation checks passed. Neutral uses the same mechanic.');
