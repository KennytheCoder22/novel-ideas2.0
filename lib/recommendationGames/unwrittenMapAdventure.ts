import { UNWRITTEN_MAP_SCENARIOS, type UnwrittenMapSaveV2 } from './unwrittenMap';

// Adventure rewards derive from durable decisions, so undo, reload and arbitrary route order
// cannot leave stale quest flags. Puzzle attempts never enter the recommendation evidence.
export const ISLAND_CLUES: Record<string, { name: string; text: string }> = {
  'whisper-orchard': { name: 'The traveler’s direction', text: 'A traveler named Aster left a message in the trees: “Seek the shore that no light touches.”' },
  'clockwork-bridge': { name: 'The brass bearing', text: 'Beneath the bridge, Aster scratched a compass bearing pointing beyond the eastern coast.' },
  'mirror-marsh': { name: 'The reflected constellation', text: 'The stars in the water form an island. The sky above leaves that same space empty.' },
  'old-lighthouse': { name: 'The keeper’s secret', text: 'The island appears when the beacon turns toward land. Darkness is a doorway, not a danger.' },
};

export function adventureProgress(save: Pick<UnwrittenMapSaveV2, 'decisions'>) {
  const visited = new Set(save.decisions.map(d => d.scenarioId));
  const clues = Object.entries(ISLAND_CLUES).filter(([id]) => visited.has(id)).map(([id, clue]) => ({ id, ...clue }));
  return { clues, remaining: UNWRITTEN_MAP_SCENARIOS.filter(s => !visited.has(s.id)), ready: clues.length === 4 };
}

export function adventureEpilogue(save: Pick<UnwrittenMapSaveV2, 'decisions'>): string {
  const choices = save.decisions.filter(d => d.kind === 'choice').map(d => {
    const scenario = UNWRITTEN_MAP_SCENARIOS.find(s => s.id === d.scenarioId);
    return scenario?.choices.find(c => c.id === d.optionId);
  }).filter(c => c !== undefined);
  const discoveries = choices.slice(-3).map(c => c.result).join(' ');
  return `The bearing, the whispers, the reflected stars and the keeper’s secret finally agree. You turn the beacon inland. Aster’s island rises from the dark water—not lost, but waiting to be noticed. ${discoveries} On the shore, Aster’s unfinished atlas waits for its next cartographer. You leave your own field notes beside it. The next traveler will have a different story, but they will not have to begin alone.`;
}

export type AdventureActivity = { title: string; prompt: string; options: string[]; answer: number; hint: string; success: string };
export function hasAdventureActivity(scenarioId: string, optionId: string): boolean {
  return ({ 'whisper-orchard': 'decode-trees', 'clockwork-bridge': 'gear-puzzle', 'paper-dragon': 'dragon-riddle' } as Record<string, string>)[scenarioId] === optionId;
}
export const ADVENTURE_ACTIVITIES: Record<string, AdventureActivity> = {
  'whisper-orchard': { title: 'Piece together Aster’s message', prompt: 'Three whispers return: “the shore”, “seek”, “that no light touches”. Which message do they form?', options: ['Seek the shore that no light touches.', 'The shore seeks a brighter light.', 'Touch the light and leave the shore.'], answer: 0, hint: 'Begin with the invitation: “Seek…”', success: 'The whispers settle into a compass-shaped leaf. You tuck the direction into your journal.' },
  'clockwork-bridge': { title: 'Set the bridge in motion', prompt: 'Three touching gears sit in a row. The first turns clockwise. Which way must the third turn?', options: ['Counterclockwise', 'Clockwise', 'It cannot turn'], answer: 1, hint: 'Each neighboring gear reverses direction. There are two reversals.', success: 'The last gear clicks home. The bridge unfolds and a brass bearing drops into your palm.' },
  'paper-dragon': { title: 'A riddle for a paper dragon', prompt: 'The dragon curls around your question: “I have towns without people, rivers without water, and paths without footsteps. What am I?”', options: ['A cloud', 'A lantern', 'A map'], answer: 2, hint: 'You have been drawing one throughout this journey.', success: '“A map!” it cries. It folds itself into a tiny paper companion and perches on your shoulder.' },
};
