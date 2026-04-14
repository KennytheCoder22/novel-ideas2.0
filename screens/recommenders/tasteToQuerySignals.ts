import type { RecommenderInput } from "./types";

export type QuerySignalMap = Record<string, number>;

export type QuerySignals = {
  genre: QuerySignalMap;
  tone: QuerySignalMap;
  scenario: QuerySignalMap;
  pacing: QuerySignalMap;
  theme: QuerySignalMap;
  world: QuerySignalMap;
  antiGenre: QuerySignalMap;
  antiTone: QuerySignalMap;
  antiScenario: QuerySignalMap;
  antiTheme: QuerySignalMap;
  antiWorld: QuerySignalMap;
};

const GENRE_RULES: Array<[RegExp, string]> = [
  [/(^|:|\b)thriller(\b|:|$)/i, "thriller"],
  [/(^|:|\b)mystery(\b|:|$)|(^|:|\b)detective(\b|:|$)/i, "mystery"],
  [/(^|:|\b)crime(\b|:|$)/i, "crime"],
  [/(^|:|\b)science fiction(\b|:|$)|(^|:|\b)sci[-\s]?fi(\b|:|$)/i, "science fiction"],
  [/(^|:|\b)fantasy(\b|:|$)/i, "fantasy"],
  [/(^|:|\b)horror(\b|:|$)|(^|:|\b)spooky(\b|:|$)/i, "horror"],
  [/(^|:|\b)romance(\b|:|$)/i, "romance"],
  [/(^|:|\b)historical(\b|:|$)/i, "historical"],
  [/(^|:|\b)drama(\b|:|$)/i, "drama"],
];

const TONE_RULES: Array<[RegExp, string]> = [
  [/(dark|bleak|grim|noir)/i, "dark"],
  [/(hopeful|uplifting|warm)/i, "hopeful"],
  [/(funny|humor|humorous|comedy)/i, "humorous"],
  [/(atmospheric|moody|gothic)/i, "atmospheric"],
  [/(realistic|grounded|procedural)/i, "grounded"],
  [/(psychological)/i, "psychological"],
  [/(epic)/i, "epic"],
  [/(weird)/i, "weird"],
];

const SCENARIO_RULES: Array<[RegExp, string]> = [
  [/(investigation|detective|case)/i, "investigation"],
  [/(crime|criminal|gangster)/i, "crime"],
  [/(survival)/i, "survival"],
  [/(societal collapse|civilizational collapse|social collapse|post[-\s]?apocalyptic|dystopian)/i, "societal collapse"],
  [/(governmental collapse|state collapse|regime collapse)/i, "governmental collapse"],
  [/(rebellion|resistance|revolution)/i, "rebellion"],
  [/(authority|institution|system|politic|systemic)/i, "institutional"],
  [/(family secrets|betrayal)/i, "betrayal"],
  [/(quest|journey|adventure)/i, "journey"],
  [/(war|battle)/i, "war"],
  [/(relationship|love|romance)/i, "relationship"],
  [/(murder|killer|serial killer)/i, "murder"],
];

const THEME_RULES: Array<[RegExp, string]> = [
  [/(identity|self|memory)/i, "identity"],
  [/(family)/i, "family"],
  [/(betrayal)/i, "betrayal"],
  [/(redemption)/i, "redemption"],
  [/(human connection|connection|loneliness|isolation)/i, "human connection"],
  [/(authority|power)/i, "authority"],
  [/(social commentary|class|inequality|systemic injustice)/i, "social commentary"],
  [/(ai|artificial intelligence|technology)/i, "technology"],
  [/(survival)/i, "survival"],
  [/(moral conflict)/i, "moral conflict"],
];

const WORLD_RULES: Array<[RegExp, string]> = [
  [/(science fiction|sci[-\s]?fi|ai|technology)/i, "science fiction"],
  [/(dystopian|post[-\s]?apocalyptic|collapse)/i, "dystopian"],
  [/(historical)/i, "historical"],
  [/(fantasy)/i, "fantasy"],
  [/(horror|spooky|ghost|haunting|paranormal)/i, "horror"],
  [/(realistic|grounded|procedural)/i, "realistic"],
];

const PACING_RULES: Array<[RegExp, string]> = [
  [/(fast[-\s]?paced|gripping|intense|propulsive|action)/i, "fast"],
  [/(slow burn|slow-burn|deliberate)/i, "slow"],
];

function addSignal(bucket: QuerySignalMap, key: string, value: number) {
  if (!Number.isFinite(value) || value === 0) return;
  bucket[key] = (bucket[key] || 0) + value;
}

function applyRules(
  tag: string,
  value: number,
  rules: Array<[RegExp, string]>,
  positiveBucket: QuerySignalMap,
  negativeBucket?: QuerySignalMap
) {
  for (const [pattern, key] of rules) {
    if (!pattern.test(tag)) continue;
    if (value > 0) addSignal(positiveBucket, key, value);
    else if (negativeBucket) addSignal(negativeBucket, key, Math.abs(value));
  }
}

function addTasteAxes(input: RecommenderInput, signals: QuerySignals) {
  const axes = input.tasteProfile?.axes;
  if (!axes) return;

  if ((axes.darkness || 0) > 0.12) addSignal(signals.tone, "dark", axes.darkness);
  if ((axes.darkness || 0) < -0.12) addSignal(signals.antiTone, "dark", Math.abs(axes.darkness));

  if ((axes.warmth || 0) > 0.12) addSignal(signals.tone, "hopeful", axes.warmth);
  if ((axes.warmth || 0) < -0.12) addSignal(signals.antiTone, "hopeful", Math.abs(axes.warmth));

  if ((axes.humor || 0) > 0.12) addSignal(signals.tone, "humorous", axes.humor);
  if ((axes.humor || 0) < -0.12) addSignal(signals.antiTone, "humorous", Math.abs(axes.humor));

  if ((axes.realism || 0) > 0.12) {
    addSignal(signals.tone, "grounded", axes.realism);
    addSignal(signals.world, "realistic", axes.realism);
  }
  if ((axes.realism || 0) < -0.12) {
    addSignal(signals.antiWorld, "realistic", Math.abs(axes.realism));
  }

  if ((axes.pacing || 0) > 0.12) addSignal(signals.pacing, "fast", axes.pacing);
  if ((axes.pacing || 0) < -0.12) addSignal(signals.pacing, "slow", Math.abs(axes.pacing));
}

function applyCrossSignalShaping(_signals: QuerySignals) {
  return;
}

export function tasteToQuerySignals(input: RecommenderInput): QuerySignals {
  const tagCounts = input.tagCounts || {};

  const signals: QuerySignals = {
    genre: {},
    tone: {},
    scenario: {},
    pacing: {},
    theme: {},
    world: {},
    antiGenre: {},
    antiTone: {},
    antiScenario: {},
    antiTheme: {},
    antiWorld: {},
  };

  for (const [tag, raw] of Object.entries(tagCounts)) {
    const value = Number(raw || 0);
    if (!Number.isFinite(value) || value === 0) continue;

    applyRules(tag, value, GENRE_RULES, signals.genre, signals.antiGenre);
    applyRules(tag, value, TONE_RULES, signals.tone, signals.antiTone);
    applyRules(tag, value, SCENARIO_RULES, signals.scenario, signals.antiScenario);
    applyRules(tag, value, THEME_RULES, signals.theme, signals.antiTheme);
    applyRules(tag, value, WORLD_RULES, signals.world, signals.antiWorld);
    applyRules(tag, value, PACING_RULES, signals.pacing);
  }

  addTasteAxes(input, signals);
  applyCrossSignalShaping(signals);

  return signals;
}

export const extractQuerySignals = tasteToQuerySignals;
export default tasteToQuerySignals;