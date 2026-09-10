import test from 'node:test';
import assert from 'node:assert/strict';
import { adventureProgress, adventureEpilogue, ISLAND_CLUES, hasAdventureActivity } from './unwrittenMapAdventure';
import { UNWRITTEN_MAP_SCENARIOS, type UnwrittenMapSaveV2 } from './unwrittenMap';
import { adaptUnwrittenMapChoiceToSignal } from './gameRecommendationEvidenceAdapters';

const decisions = Object.keys(ISLAND_CLUES).map(scenarioId => ({ scenarioId, kind: 'skip', optionId: null })) as UnwrittenMapSaveV2['decisions'];
test('activities follow the selected approach without forcing puzzles on other choices', () => {
  assert.equal(hasAdventureActivity('whisper-orchard', 'decode-trees'), true);
  assert.equal(hasAdventureActivity('clockwork-bridge', 'gear-puzzle'), true);
  assert.equal(hasAdventureActivity('paper-dragon', 'dragon-riddle'), true);
  assert.equal(hasAdventureActivity('paper-dragon', 'repair-tail'), false);
});
test('clues work in any order, allow a skipped preference, and retract with undo', () => {
  assert.equal(adventureProgress({ decisions }).ready, true);
  assert.equal(adventureProgress({ decisions: [...decisions].reverse() }).ready, true);
  assert.equal(adventureProgress({ decisions: decisions.slice(1) }).ready, false);
  assert.equal(adventureProgress({ decisions: [] }).remaining.length, 12);
});
test('epilogue handles an all-skip journey without inventing chosen outcomes', () => {
  assert.ok(adventureEpilogue({ decisions }).includes('Aster'));
  assert.ok(!adventureEpilogue({ decisions }).includes('undefined'));
});
test('whimsical activity semantics do not manufacture fantasy/comedy genre votes', () => {
  const scenario = UNWRITTEN_MAP_SCENARIOS.find(s => s.id === 'frog-parliament')!;
  const option = scenario.choices.find(c => c.id === 'moon-experiment')!;
  const signal = adaptUnwrittenMapChoiceToSignal({ scenarioId: scenario.id, option });
  assert.deepEqual(signal.genres, []);
  assert.ok(signal.themes?.includes('puzzle-solving'));
});
