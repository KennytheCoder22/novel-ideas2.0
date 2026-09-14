export type StoryChoice = { title: string; detail: string; outcome: string; keepsake: string };
export type Discovery = { id: string; title: string; symbol: string; opening: string; first: [StoryChoice, StoryChoice]; next: [string, string]; endings: [[StoryChoice, StoryChoice], [StoryChoice, StoryChoice]] };
export const DISCOVERIES: Discovery[] = [
  { id: 'copper-garden', title: 'The greenhouse that remembers', symbol: '❧',
    opening: 'Your brew wakes a seed beneath the workbench. Inside its glass shell, a tiny gardener knocks. Beside it, a copper root draws a map toward a greenhouse erased from every book.',
    first: [
      { title: 'Open the glass seed', detail: 'Meet the gardener and follow its unfinished promise.', outcome: 'Pip tumbles out, brushes soil from a brass coat, and asks you to find the person who planted it. A small set of footprints now crosses your atlas.', keepsake: 'Pip, the brass gardener' },
      { title: 'Follow the copper root', detail: 'Leave the seed safe and investigate the missing greenhouse.', outcome: 'The root leads beneath the laboratory. There is no greenhouse—only a door-shaped shadow and a key made of sunlight. A hidden stair appears on your map.', keepsake: 'The sunlight key' },
    ], next: ['Pip recognizes the greenhouse keeper in an old portrait: she is a child who has not been born yet. The seed was a promise sent backward through time.', 'Your sunlight key opens the shadow. Inside, plants grow into rooms from forgotten homes. One room is yours, but a stranger is waiting in it.'],
    endings: [
      [{ title: 'Keep the promise safe', detail: 'Give Pip a home until the keeper arrives.', outcome: 'You build Pip a window garden. Each morning a new flower marks a day closer to the meeting. Your laboratory becomes a place where impossible promises can wait.', keepsake: 'The waiting garden' }, { title: 'Find the future keeper', detail: 'Let Pip lead an expedition beyond the calendar.', outcome: 'Pip plants a stair of seasons. Together you leave a trail of brass flowers through tomorrow. The atlas gains a path that ordinary maps cannot show.', keepsake: 'The stair of seasons' }],
      [{ title: 'Ask the stranger to stay', detail: 'Learn whose memories the greenhouse has been protecting.', outcome: 'The stranger is the house itself, remembering everyone it sheltered. You give it a name and a place beside your workbench. Lost travelers begin finding your door.', keepsake: 'A home for lost travelers' }, { title: 'Return the rooms', detail: 'Use the key to reconnect each room with its missing home.', outcome: 'At sunrise, windows open across the city. Forgotten homes return one room at a time. Your atlas holds the only record of the journeys between them.', keepsake: 'The atlas of returning rooms' }],
    ] },
  { id: 'tidal-archive', title: 'The letter beneath the tide', symbol: '≈',
    opening: 'The sea returns a bottle containing two things: a letter addressed to you in your own handwriting, and a map of a library that sinks whenever someone tells a lie.',
    first: [
      { title: 'Read the letter', detail: 'Discover why your future self needs your help.', outcome: '“Do not let me forget her,” the letter says. A name dissolves into salt before you can read it. You keep a silver ribbon that remembers the sound of her voice.', keepsake: 'The remembering ribbon' },
      { title: 'Find the sinking library', detail: 'Investigate the rule that is pulling its shelves underwater.', outcome: 'You descend at low tide. The librarian admits the building is sinking because a beloved history was invented. You take a compass that points toward unanswered questions.', keepsake: 'The question compass' },
    ], next: ['The ribbon sings when you reach the flooded reading room. The missing voice belongs to a friend who chose to become the tide so the city could survive.', 'Your compass reveals the invented history saved the city from a war. The truth could free the library, but its people must decide what their peace means now.'],
    endings: [
      [{ title: 'Bring your friend home', detail: 'Search for another way to protect the city.', outcome: 'You teach the harbor bells to hold back the water. Your friend returns with seashells in her pockets. Every high tide becomes a conversation instead of a farewell.', keepsake: 'The harbor of reunion' }, { title: 'Carry her stories ashore', detail: 'Honor her choice and keep her connected to the city.', outcome: 'You build listening posts along the shore. The tide tells stories to anyone who pauses. Your atlas becomes a record of a friendship that changed its shape.', keepsake: 'The listening shore' }],
      [{ title: 'Open the hidden history', detail: 'Let the city face its past together.', outcome: 'The library rises as neighbors read aloud, argue, and begin a new history with room for more than one voice.', keepsake: 'The book of many voices' }, { title: 'Investigate the first lie', detail: 'Find who created it before deciding how to reveal it.', outcome: 'The compass leads to the original peacemaker, still alive beneath the oldest pier. Your questions uncover a second mystery rather than a simple villain.', keepsake: 'The unfinished investigation' }],
    ] },
  { id: 'laughing-volcano', title: 'The mountain with stage fright', symbol: '△',
    opening: 'The volcano has stopped erupting. Its underground theater is full, the curtain is shaking, and an enormous voice whispers: “What if nobody laughs?”',
    first: [
      { title: 'Step onto the stage', detail: 'Become the mountain’s partner in a very risky comedy act.', outcome: 'Your first joke launches a shower of warm popcorn. The mountain laughs at itself for the first time. It gives you a mask that changes expression with the audience.', keepsake: 'The laughing mask' },
      { title: 'Explore behind the curtain', detail: 'Find out what frightened a mountain into silence.', outcome: 'Backstage, you find a tiny dragon rehearsing the mountain’s voice. It has been pretending to be enormous for a hundred years. It trusts you with its smallest ember.', keepsake: 'The dragon’s ember' },
    ], next: ['Opening night arrives. Your mask shows two audiences: miners who want a joyful escape, and stone giants who have never heard a joke. You can shape the show.', 'The dragon wants to stop pretending, but fears the miners will leave if they discover their mountain is not what they imagined.'],
    endings: [
      [{ title: 'Make the miners the stars', detail: 'Turn their everyday mishaps into a shared celebration.', outcome: 'The miners improvise a glorious disaster of a play. Nobody agrees on the ending, and everyone comes back tomorrow. The crater becomes the city’s meeting place.', keepsake: 'The crater theater' }, { title: 'Teach the giants to play', detail: 'Invent a comedy that needs no shared language.', outcome: 'You perform a silent dance with the mountain. The giants answer with a slow, thunderous giggle. New constellations appear where their laughter shakes the sky.', keepsake: 'The sky full of laughter' }],
      [{ title: 'Introduce the real dragon', detail: 'Help it tell the truth on its own terms.', outcome: 'The smallest performer receives the longest applause. The miners build a little chair at the council table; the dragon no longer needs a mountain-sized voice.', keepsake: 'The little council chair' }, { title: 'Build it a traveling stage', detail: 'Give it room to discover who it wants to become.', outcome: 'You fit wheels to an old cauldron. The dragon leaves with a suitcase of sparks, sending postcards from stages where nobody knows its old role.', keepsake: 'The traveling spark-show' }],
    ] },
  { id: 'astral-kitchen', title: 'Supper at the edge of tomorrow', symbol: '✧',
    opening: 'Your final ingredients arrange themselves into a dinner invitation. One guest is a lost constellation. The other is a clockmaker carrying a tomorrow that never happened.',
    first: [
      { title: 'Set a place for the constellation', detail: 'Help a wandering piece of sky find where it belongs.', outcome: 'The constellation folds itself into a paper bird and lands beside your plate. It has forgotten which stories its stars once told.', keepsake: 'The paper constellation' },
      { title: 'Open the clockmaker’s tomorrow', detail: 'Explore a day that vanished before anyone could live it.', outcome: 'Inside the clock is a city celebrating a discovery nobody remembers making. A stopped pocket watch lets you enter the missing day.', keepsake: 'The watch of the missing day' },
    ], next: ['The paper bird remembers two possible homes: the familiar sky above the city, or an uncharted darkness where new stories could begin. It asks you to help it choose.', 'At the center of the missing day, the clockmaker meets a younger version of herself. Restoring the day would change her life; recording it would preserve the life she knows.'],
    endings: [
      [{ title: 'Give the city its stars back', detail: 'Restore a shared story to the night sky.', outcome: 'The bird unfolds above the rooftops. Every window shines with someone remembering a different part of the same story. Your laboratory becomes its brightest star.', keepsake: 'The constellation of home' }, { title: 'Sail into the unknown', detail: 'Let the bird become a guide to unwritten stories.', outcome: 'You fold your invitation into a boat. Beyond the last familiar star, the atlas opens a blank page—not an ending, but a place to begin again.', keepsake: 'The invitation to elsewhere' }],
      [{ title: 'Restore the missing day', detail: 'Let the clockmaker choose a different future.', outcome: 'She turns the watch herself. The city gains one extraordinary day, and your atlas keeps a small mark where the old future once stood.', keepsake: 'The reclaimed tomorrow' }, { title: 'Keep its story alive', detail: 'Preserve the discovery without rewriting her life.', outcome: 'Together you write the missing day as a book. Someone else can now imagine what its people discovered—and perhaps build it in a future of their own.', keepsake: 'The book of possible tomorrows' }],
    ] },
];
export type Interest = 'more' | 'not-for-me' | 'unsure';
export type Entry = { first?: 0 | 1; ending?: 0 | 1; interest?: Interest };
export type DiscoveryJournal = { version: 1; entries: Record<string, Entry> };
export function readDiscoveryJournal(raw: string | null): DiscoveryJournal {
  if (!raw) return { version: 1, entries: {} };
  const data = JSON.parse(raw) as DiscoveryJournal;
  if (!data || data.version !== 1 || !data.entries || typeof data.entries !== 'object' || Array.isArray(data.entries)) throw Error('Invalid discovery journal');
  for (const [id, e] of Object.entries(data.entries)) {
    if (Array.isArray(e)) throw Error('Invalid discovery entry');
    if (!DISCOVERIES.some(d => d.id === id) || !e || typeof e !== 'object' || Object.keys(e).some(k => !['first','ending','interest'].includes(k)) || ![undefined,0,1].includes(e.first) || ![undefined,0,1].includes(e.ending) || (e.ending !== undefined && e.first === undefined) || ![undefined,'more','not-for-me','unsure'].includes(e.interest) || (e.interest !== undefined && e.ending === undefined)) throw Error('Invalid discovery entry');
  }
  return data;
}
export function chooseDiscovery(journal: DiscoveryJournal, realm: number, stage: 'first' | 'ending', choice: 0 | 1, stars: Record<string,number>): DiscoveryJournal {
  if (!Number.isInteger(realm) || realm < 0 || realm > 3 || !['first','ending'].includes(stage) || ![0,1].includes(choice)) throw Error('Invalid choice');
  const id = DISCOVERIES[realm].id, previous = journal.entries[id] || {};
  const level = realm * 3 + (stage === 'first' ? 1 : 3);
  if (!stars[`level-${level}`] || (stage === 'ending' && previous.first === undefined)) throw Error('Discovery is locked');
  if (previous[stage] !== undefined) return journal;
  return { version: 1, entries: { ...journal.entries, [id]: { ...previous, [stage]: choice } } };
}
