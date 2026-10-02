// Deliberately standalone: no campaign save, catalyst evidence, or recommender imports.
import { applySwap, boardChecksum, CASCADE_LEVELS, cloneBoard, createBoard, createRng, decodeBoard, encodeBoard, findLegalMoves, nextRandom, type Board, type Coordinate, type LevelConfig } from './alchemistsCascade';

export const EXPERIMENT = 'cascade-schools-v1' as const;
export const BOARD_VERSION = 'cascade-core-v1-schools-v1' as const;
export const RECIPE: LevelConfig = { ...CASCADE_LEVELS[2], name: 'Copper Rain · The Hidden Bell', moves: 20, scoreTarget: 2700, goals: [{ kind: 0, target: 18 }, { kind: 2, target: 14 }] };
export type School = 'oracle' | 'veiled';
export type Choice = School | 'fate';
export type Stage = 'trial' | 'choose' | 'play' | 'midpoint' | 'won' | 'lost';
export type Context = {
  board: string; checksum: string; rng: number; moves: number; score: number; goals: number[];
  opportunities: Record<School, number>; uses: Record<School, number>; previewsPlayed: number;
  useMeaning: 'oracle_voluntary_preview_veiled_automatic_transformation';
};
export type Observation = {
  experiment: typeof EXPERIMENT; boardVersion: typeof BOARD_VERSION; sequence: number;
  recipeId: string; ageBand: string; seed: number; attempt: number; trialOrder: School[]; bothTrialsCompleted: boolean;
  kind: 'trial_completed' | 'first_choice' | 'midpoint_choice' | 'result' | 'retry' | 'leave';
  alternatives: string[]; choice: string | null; activeSchool: School; context: Context;
  diagnostics: ReturnType<typeof diagnostics> | null;
  recommendationEligible: false;
};
export type ExperimentSave = {
  version: typeof EXPERIMENT; scope: string; ageBand: string; seed: number; attempt: number;
  order: [School, School]; trialsDone: number; trialMoves: number; stage: Stage; school: School;
  board: string; rng: number; moves: number; score: number; collected: number[]; turns: number;
  midpointDone: boolean; previewUsed: boolean; previewMove: string | null;
  opportunities: Record<School, number>; uses: Record<School, number>; previewsPlayed: number;
  events: Observation[]; notice: string;
};
export const schoolName = (school: School) => school === 'oracle' ? 'Oracle’s Lens' : 'Veiled Crucible';
const counts = () => ({ oracle: 0, veiled: 0 });
const moveKey = (a: Coordinate, b: Coordinate) => `${a.row},${a.column}:${b.row},${b.column}`;
const remainingGoals = (s: ExperimentSave) => RECIPE.goals.map(g => ({ ...g, target: Math.max(0, g.target - s.collected[g.kind]) }));
function freshBoard(seed: number) { const b = createBoard(seed); return { board: encodeBoard(b.board), rng: b.rng.state }; }
export function createExperiment(scope: string, ageBand: string, seed = RECIPE.seed): ExperimentSave {
  const order: [School, School] = seed % 2 ? ['oracle', 'veiled'] : ['veiled', 'oracle'];
  return { version: EXPERIMENT, scope, ageBand, seed: seed >>> 0, attempt: 1, order, trialsDone: 0, trialMoves: 0, stage: 'trial', school: order[0], ...freshBoard(seed ^ 0x57a1), moves: RECIPE.moves, score: 0, collected: Array(6).fill(0), turns: 0, midpointDone: false, previewUsed: false, previewMove: null, opportunities: counts(), uses: counts(), previewsPlayed: 0, events: [], notice: 'Two moves with each method. These are practice, not preferences.' };
}
function context(s: ExperimentSave): Context { return { board: s.board, checksum: boardChecksum(s.board), rng: s.rng, moves: s.moves, score: s.score, goals: [...s.collected], opportunities: { ...s.opportunities }, uses: { ...s.uses }, previewsPlayed: s.previewsPlayed, useMeaning: 'oracle_voluntary_preview_veiled_automatic_transformation' }; }
function record(s: ExperimentSave, kind: Observation['kind'], choice: string | null = null, alternatives: string[] = [], measured: Observation['diagnostics'] = null): ExperimentSave {
  return { ...s, events: [...s.events, { experiment: EXPERIMENT, boardVersion: BOARD_VERSION, sequence: s.events.length + 1, recipeId: RECIPE.id, ageBand: s.ageBand, seed: s.seed, attempt: s.attempt, trialOrder: [...s.order], bothTrialsCompleted: s.trialsDone === 2, kind, alternatives, choice, activeSchool: s.school, context: context(s), diagnostics: measured, recommendationEligible: false }] };
}
export function forecast(s: ExperimentSave, from: Coordinate, to: Coordinate) {
  return applySwap(decodeBoard(s.board)!, s.rng, from, to, remainingGoals(s));
}
export function preview(s: ExperimentSave, from: Coordinate, to: Coordinate): ExperimentSave {
  if (!['trial', 'play'].includes(s.stage) || s.school !== 'oracle' || s.previewUsed) throw new Error('Lens unavailable');
  const result = forecast(s, from, to);
  if (!result.valid) throw new Error('Choose a matching pair');
  return { ...s, previewUsed: true, previewMove: moveKey(from, to), uses: { ...s.uses, oracle: s.uses.oracle + 1 } };
}
// A surprise grants no points or collected ingredients on its own. It must be matched.
// Independent RNG prevents the surprise from changing the existing refill sequence.
function transform(board: Board, seed: number): { board: Board; at: Coordinate | null; special: string } {
  const next = cloneBoard(board), rng = createRng(seed);
  const candidates: Coordinate[] = [];
  next.forEach((row, r) => row.forEach((cell, c) => { if (cell.special === 'none') candidates.push({ row: r, column: c }); }));
  if (!candidates.length) return { board: next, at: null, special: '' };
  const at = candidates[Math.floor(nextRandom(rng) * candidates.length)];
  const special = nextRandom(rng) < 0.5 ? 'row' : 'column';
  next[at.row][at.column].special = special;
  return { board: next, at, special };
}
export function playMove(s: ExperimentSave, from: Coordinate, to: Coordinate): ExperimentSave {
  if (!['trial', 'play'].includes(s.stage)) throw new Error('Choose a method before moving');
  if (s.stage === 'trial' && s.school === 'oracle' && !s.previewUsed) throw new Error('Try the Lens before making this practice move');
  const result = forecast(s, from, to);
  if (!result.valid) throw new Error('That swap does not make a match');
  const trial = s.stage === 'trial';
  const turns = s.turns + 1;
  let next: ExperimentSave = { ...s, board: encodeBoard(result.board), rng: result.rng.state, moves: s.moves - 1, score: s.score + result.scoreDelta, collected: s.collected.map((n,i) => n + result.collected[i]), turns, trialMoves: s.trialMoves + (trial ? 1 : 0), previewUsed: false, previewMove: null, opportunities: { ...s.opportunities, [s.school]: s.opportunities[s.school] + 1 }, previewsPlayed: s.previewsPlayed + (s.previewMove === moveKey(from,to) ? 1 : 0), notice: `${result.steps.length} reaction${result.steps.length === 1 ? '' : 's'} · +${result.scoreDelta} points.` };
  if (s.school === 'veiled') next.opportunities.veiled = s.opportunities.veiled + ((trial ? s.trialMoves === 0 : turns % 4 === 0) ? 1 : 0);
  if (s.school === 'veiled' && (trial ? s.trialMoves === 0 : turns % 4 === 0)) {
    const surprise = transform(result.board, s.seed ^ Math.imul(turns + s.attempt * 101, 0x9e3779b1));
    next = { ...next, board: encodeBoard(surprise.board), uses: { ...next.uses, veiled: next.uses.veiled + (surprise.at ? 1 : 0) }, notice: surprise.at ? `A ${surprise.special} rune appeared at row ${surprise.at.row+1}, column ${surprise.at.column+1}. Match it to release its reaction.` : 'The board is already full of runes.' };
  }
  if (trial && next.trialMoves === 2) {
    next = record({ ...next, trialsDone: s.trialsDone + 1 }, 'trial_completed', s.school);
    if (next.trialsDone === 2) return { ...next, ...freshBoard(s.seed), moves: RECIPE.moves, turns: 0, score: 0, collected: Array(6).fill(0), stage: 'choose', notice: 'You have tried both. This is your full recipe board. Choose how to brew.' };
    return { ...next, ...freshBoard(s.seed ^ 0x57a1), school: s.order[1], trialMoves: 0, turns: 0, score: 0, moves: RECIPE.moves, collected: Array(6).fill(0), previewUsed: false, previewMove: null, opportunities: counts(), uses: counts(), previewsPlayed: 0, notice: 'Same starting board. Try the other method for two moves.' };
  }
  if (!trial) {
    const won = next.score >= RECIPE.scoreTarget && RECIPE.goals.every(g => next.collected[g.kind] >= g.target);
    if (won || next.moves === 0) return record({ ...next, stage: won ? 'won' : 'lost' }, 'result', won ? 'won' : 'lost');
    if (!next.midpointDone && turns >= RECIPE.moves / 2) next = { ...next, stage: 'midpoint', notice: 'The brew settles. Keep your method or try the other?' };
  }
  return next;
}
// A bounded one-move probe, NOT a win probability or claim of psychological preference.
export function diagnostics(s: ExperimentSave) {
  const board = decodeBoard(s.board)!;
  const goals = remainingGoals(s);
  const utility = (r: ReturnType<typeof forecast>) => r.collected.reduce((n,c,i) => n + Math.min(c, goals.find(g => g.kind === i)?.target || 0), 0) + Math.min(r.scoreDelta, Math.max(0, RECIPE.scoreTarget-s.score))/300;
  const moves = findLegalMoves(board, goals);
  const best = (b: Board) => Math.max(0, ...findLegalMoves(b, goals).map(m => utility(applySwap(b, s.rng, m.from, m.to, goals))));
  const ordinary = best(board);
  const surprise = transform(board, s.seed ^ Math.imul(s.turns + 1 + s.attempt * 101, 0x9e3779b1));
  const surpriseBest = best(surprise.board);
  const immediateValues = moves.map(m => utility(forecast(s,m.from,m.to)));
  const spread = Math.max(0,...immediateValues) - Math.min(...immediateValues, ordinary);
  return { method: 'one-move-upper-bound-v1', legalMoves: moves.length, oracleBestProgress: ordinary, oracleInformationSpread: spread, veiledSpecialBestProgress: surpriseBest, estimatedProgressGap: surpriseBest - ordinary, winProbability: null, confounded: Math.abs(surpriseBest-ordinary) >= 3 || s.moves <= 4, reasons: [...(Math.abs(surpriseBest-ordinary) >= 3 ? ['tactical_advantage'] : []), ...(s.moves <= 4 ? ['low_moves'] : []), 'information_vs_power_not_equated'], recommendationEligible: false as const };
}
export function chooseSchool(s: ExperimentSave, choice: Choice): ExperimentSave {
  if (!['choose','midpoint'].includes(s.stage) || s.trialsDone !== 2 || !['oracle','veiled','fate'].includes(choice)) throw new Error('Complete both trials first');
  const initial = s.stage === 'choose';
  const base = initial ? { ...s, ...freshBoard((s.seed + s.attempt - 1) >>> 0), moves: RECIPE.moves, turns: 0, score: 0, collected: Array(6).fill(0), opportunities: counts(), uses: counts(), previewsPlayed: 0 } : s;
  const school = choice === 'fate' ? (nextRandom(createRng(s.seed ^ (initial ? 0xfade : 0xbe11) ^ s.attempt)) < 0.5 ? 'oracle' : 'veiled') : choice;
  const measured = diagnostics(base);
  return record({ ...base, school, stage: 'play', midpointDone: !initial, previewUsed: false, previewMove: null, notice: `${schoolName(school)} is ready. ${choice === 'fate' ? 'Fate is neutral.' : ''}` }, initial ? 'first_choice' : 'midpoint_choice', initial ? choice : choice === 'fate' ? 'fate' : school === s.school ? 'keep' : 'switch', initial ? ['oracle','veiled','fate'] : ['keep','switch','fate'], measured);
}
export function retryExperiment(s: ExperimentSave): ExperimentSave {
  if (!['won','lost'].includes(s.stage)) throw new Error('Finish the recipe first');
  return { ...record(s,'retry'), ...freshBoard((s.seed + s.attempt) >>> 0), moves: RECIPE.moves, turns: 0, score: 0, collected: Array(6).fill(0), stage: 'choose', attempt: s.attempt + 1, midpointDone: false, notice: 'Both methods are still available. This is your new seeded board.' };
}
export function leaveExperiment(s: ExperimentSave) { return record(s,'leave'); }
export function restoreExperiment(raw: string | null, scope: string): ExperimentSave | null {
  try {
    const s = JSON.parse(raw || 'null') as ExperimentSave;
    if (!s || s.version !== EXPERIMENT || s.scope !== scope || !decodeBoard(s.board) || !['trial','choose','play','midpoint','won','lost'].includes(s.stage) || !['oracle','veiled'].includes(s.school) || !Number.isInteger(s.seed) || s.seed < 0 || s.seed > 0xffffffff || !Number.isInteger(s.rng) || s.rng < 0 || s.rng > 0xffffffff || !Number.isInteger(s.moves) || s.moves < 0 || s.moves > RECIPE.moves || !Number.isInteger(s.turns) || s.turns < 0 || s.turns > RECIPE.moves || !Array.isArray(s.collected) || s.collected.length !== 6 || !s.collected.every(n => Number.isInteger(n) && n >= 0) || !Array.isArray(s.events) || s.events.some(e => e.experiment !== EXPERIMENT || e.recommendationEligible !== false) || !Array.isArray(s.order) || new Set(s.order).size !== 2 || !s.order.every(v => ['oracle','veiled'].includes(v)) || ![0,1,2].includes(s.trialsDone) || ![0,1,2].includes(s.trialMoves) || (s.stage !== 'trial' && s.trialsDone !== 2)) return null;
    if (![s.score,s.attempt,s.previewsPlayed,...Object.values(s.opportunities),...Object.values(s.uses)].every(n => Number.isSafeInteger(n) && n >= 0) || s.attempt < 1 || typeof s.midpointDone !== 'boolean' || typeof s.previewUsed !== 'boolean') return null;
    return s;
  } catch { return null; }
}
