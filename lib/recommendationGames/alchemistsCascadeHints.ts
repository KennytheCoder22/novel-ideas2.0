import { CASCADE_LEVELS, applyCatalyst, applySwap, catalystOptions, createActiveLevel, decodeBoard, encodeBoard, findLegalMoves, levelWon, type Board, type Coordinate, type LevelConfig, type LegalMove } from './alchemistsCascade';

// Replayed against the actual engine by regression tests. No save or RNG mutation.
const ELEVEN_ROUTE: [number, number, number, number][] = [
  [5, 0, 5, 1], [4, 1, 4, 2], [5, 1, 5, 2], [3, 5, 4, 5], [4, 4, 4, 5],
  [3, 5, 4, 5], [4, 3, 5, 3], [3, 5, 4, 5], [3, 5, 3, 6], [4, 3, 5, 3],
];
type GuideStep = { board: string; rng: number; collected: number[]; moves: number; score: number; from: Coordinate; to: Coordinate };
let verifiedGuide: GuideStep[] | undefined;
function guide(): GuideStep[] {
  if (verifiedGuide) return verifiedGuide;
  const config = CASCADE_LEVELS[10];
  const initial = createActiveLevel(config, '2026-09-13T00:00:00.000Z');
  const start = decodeBoard(initial.board)!;
  const boost = applyCatalyst(start, initial.rngState, catalystOptions(start, 'guide', 0, initial.rngState, config.goals)[0]);
  let board = boost.board, rng = boost.rng.state, collected = boost.collected, score = boost.scoreDelta;
  const steps: GuideStep[] = [];
  for (const [r, c, tr, tc] of ELEVEN_ROUTE) {
    const from = { row: r, column: c }, to = { row: tr, column: tc };
    if (!findLegalMoves(board).some(m => m.from.row === r && m.from.column === c && m.to.row === tr && m.to.column === tc)) return [];
    steps.push({ board: encodeBoard(board), rng, collected: [...collected], moves: config.moves - steps.length, score, from, to });
    const result = applySwap(board, rng, from, to, config.goals);
    board = result.board; rng = result.rng.state; score += result.scoreDelta;
    collected = collected.map((n, i) => n + result.collected[i]);
  }
  // Fail closed if later mechanics changes invalidate the solution.
  verifiedGuide = levelWon({ ...initial, collected, score }, config) ? steps : [];
  return verifiedGuide;
}

export function cascadeMoveHint(board: Board, config: LevelConfig, state: { rngState: number; collected: number[]; movesRemaining: number; score: number }): (LegalMove & { guided: boolean }) | undefined {
  const remaining = config.goals.filter(g => (state.collected[g.kind] || 0) < g.target);
  const legal = findLegalMoves(board, remaining);
  if (config.id === 'level-11') {
    const step = guide().find(s => s.board === encodeBoard(board) && s.rng === state.rngState && s.moves === state.movesRemaining && s.score === state.score && s.collected.every((n, i) => n === state.collected[i]));
    const move = step && legal.find(m => m.from.row === step.from.row && m.from.column === step.from.column && m.to.row === step.to.row && m.to.column === step.to.column);
    if (move) return { ...move, guided: true };
  }
  const move = legal.sort((a,b) => b.estimatedGoalHits-a.estimatedGoalHits || b.estimatedScore-a.estimatedScore)[0];
  return move ? { ...move, guided: false } : undefined;
}
