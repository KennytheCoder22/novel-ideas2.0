import assert from 'node:assert/strict';
import { CASCADE_LEVELS, createActiveLevel, decodeBoard, encodeBoard, catalystOptions, applyCatalyst, applySwap, findLegalMoves, levelWon, type Board } from '../lib/recommendationGames/alchemistsCascade';

// Offline policy comparison, not a replay of a person's attempts or a human win-rate estimate.
const config = CASCADE_LEVELS[10];
const rulesVersion = process.argv.includes('--fair') ? 2 : 1;
const blues = (board: Board) => board.flat().filter(cell => cell.kind === 1).length;
for (const policy of ['random', 'visible-unmet-goals'] as const) {
  const runs: { won: boolean; supplied: number; collected: number }[] = [];
  for (let trial = 1; trial <= 100; trial++) {
    let randomState = trial;
    const random = () => { randomState = (Math.imul(randomState, 1664525) + 1013904223) >>> 0; return randomState / 4294967296; };
    let active = createActiveLevel(config, '2026-09-14T00:00:00.000Z');
    let board = decodeBoard(active.board)!;
    let supplied = blues(board);
    const boost = applyCatalyst(board, active.rngState, catalystOptions(board, 'audit', 0, active.rngState, config.goals)[0]);
    assert.ok(!boost.reshuffled || boost.reshuffleInventoryPreserved, 'Supply accounting requires inventory-preserving shuffle');
    supplied += blues(boost.board) - blues(board) + boost.collected[1];
    board = boost.board;
    active = { ...active, board: encodeBoard(board), rngState: boost.rng.state, score: boost.scoreDelta, collected: boost.collected, catalystUsed: true };
    while (active.movesRemaining > 0 && !levelWon(active, config)) {
      let moves = findLegalMoves(board, config.goals.filter(g => active.collected[g.kind] < g.target));
      if (!moves.length) break;
      if (policy === 'visible-unmet-goals') {
        const best = Math.max(...moves.map(m => m.estimatedGoalHits));
        moves = moves.filter(m => m.estimatedGoalHits === best);
      }
      const move = moves[Math.floor(random() * moves.length)];
      const result = applySwap(board, active.rngState, move.from, move.to, config.goals, rulesVersion);
      assert.ok(result.valid);
      assert.ok(!result.reshuffled || result.reshuffleInventoryPreserved, 'Supply accounting requires inventory-preserving shuffle');
      const added = blues(result.board) - blues(board) + result.collected[1];
      assert.ok(added >= 0, 'Blue inventory conservation');
      supplied += added;
      board = result.board;
      active = { ...active, board: encodeBoard(board), rngState: result.rng.state, score: active.score + result.scoreDelta, collected: active.collected.map((n, i) => n + result.collected[i]), movesRemaining: active.movesRemaining - 1 };
      assert.equal(supplied, active.collected[1] + blues(board));
    }
    runs.push({ won: levelWon(active, config), supplied, collected: active.collected[1] });
  }
  const range = (key: 'supplied' | 'collected') => { const values = runs.map(r => r[key]).sort((a,b) => a-b); return { min: values[0], median: (values[49]+values[50])/2, max: values[99] }; };
  if (rulesVersion === 2) {
    assert.ok(runs.every(r => r.supplied >= 23), 'fairness regression: required stock was unavailable');
    assert.ok(runs.every(r => r.won), 'fairness regression: a baseline policy path stopped winning');
  }
  console.log(JSON.stringify({ rulesVersion, policy, runs: runs.length, wins: runs.filter(r => r.won).length, insufficientTotalBlueSupply: runs.filter(r => r.supplied < 23).length, supplied: range('supplied'), collected: range('collected') }));
}
