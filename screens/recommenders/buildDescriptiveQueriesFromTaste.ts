import type { RecommenderInput } from "./types";

type SignalBucket = Record<string, number>;

type QuerySignals = {
  genre: SignalBucket;
  tone: SignalBucket;
  texture: SignalBucket;
  scenario: SignalBucket;
};

const NEGATIVE_TERMS = [
  "-analysis",
  "-guide",
  "-summary",
  "-criticism",
  "-literature",
  "-magazine",
  "-journal",
  "-catalog",
  "-catalogue",
  "-reference",
  "-companion",
  "-study",
  "-workbook",
  "-textbook",
  "-manual",
  "-encyclopedia",
  "-anthology",
  "-collection",
  "-essays",
  "-nonfiction",
  "-biography",
  "-memoir",
].join(" ");

const GENRE_RULES: Array<[RegExp, string]> = [
  [/(^|:|\b)fantasy(\b|:|$)/i, "fantasy"],
  [/(^|:|\b)thriller(\b|:|$)/i, "thriller"],
  [/(^|:|\b)mystery(\b|:|$)/i, "mystery"],
  [/(^|:|\b)crime(\b|:|$)/i, "crime"],
  [/(^|:|\b)horror(\b|:|$)/i, "horror"],
  [/(^|:|\b)science fiction(\b|:|$)|(^|:|\b)sci[-\s]?fi(\b|:|$)/i, "science fiction"],
  [/(^|:|\b)romance(\b|:|$)/i, "romance"],
  [/(^|:|\b)historical(\b|:|$)/i, "historical"],
  [/(^|:|\b)dystopian(\b|:|$)/i, "dystopian"],
];

const TONE_RULES: Array<[RegExp, string]> = [
  [/(^|:|\b)dark(\b|:|$)|(^|:|\b)bleak(\b|:|$)|(^|:|\b)grim(\b|:|$)/i, "dark"],
  [/(^|:|\b)hopeful(\b|:|$)|(^|:|\b)uplifting(\b|:|$)/i, "hopeful"],
  [/(^|:|\b)cozy(\b|:|$)|(^|:|\b)comfort(\b|:|$)/i, "cozy"],
  [/(^|:|\b)spooky(\b|:|$)|(^|:|\b)haunting(\b|:|$)|(^|:|\b)gothic(\b|:|$)/i, "spooky"],
  [/(^|:|\b)funny(\b|:|$)|(^|:|\b)humor(\b|:|$)|(^|:|\b)comedy(\b|:|$)/i, "funny"],
  [/(^|:|\b)gritty(\b|:|$)/i, "gritty"],
];

const TEXTURE_RULES: Array<[RegExp, string]> = [
  [/(^|:|\b)realistic(\b|:|$)|(^|:|\b)grounded(\b|:|$)/i, "realistic"],
  [/(^|:|\b)atmospheric(\b|:|$)/i, "atmospheric"],
  [/(^|:|\b)epic(\b|:|$)/i, "epic"],
  [/(^|:|\b)character(\b|:|$)|(^|:|\b)character driven(\b|:|$)/i, "character-driven"],
  [/(^|:|\b)psychological(\b|:|$)/i, "psychological"],
  [/(^|:|\b)fast[-\s]?paced(\b|:|$)|(^|:|\b)propulsive(\b|:|$)/i, "fast-paced"],
  [/(^|:|\b)slow[-\s]?burn(\b|:|$)/i, "slow-burn"],
];

const SCENARIO_RULES: Array<[RegExp, string]> = [
  [/(^|:|\b)authority(\b|:|$)|(^|:|\b)politic/i, "political struggle"],
  [/(^|:|\b)betrayal(\b|:|$)|(^|:|\b)family secrets(\b|:|$)/i, "betrayal"],
  [/(^|:|\b)adventure(\b|:|$)|(^|:|\b)quest(\b|:|$)|(^|:|\b)journey(\b|:|$)/i, "quest"],
  [/(^|:|\b)war(\b|:|$)|(^|:|\b)battle(\b|:|$)/i, "war"],
  [/(^|:|\b)murder(\b|:|$)|(^|:|\b)investigation(\b|:|$)|(^|:|\b)detective(\b|:|$)/i, "investigation"],
  [/(^|:|\b)survival(\b|:|$)/i, "survival"],
  [/(^|:|\b)family(\b|:|$)/i, "family conflict"],
  [/(^|:|\b)mythology(\b|:|$)|(^|:|\b)mythic(\b|:|$)/i, "mythic conflict"],
  [/(^|:|\b)dystopian(\b|:|$)/i, "societal collapse"],
  [/(^|:|\b)crime(\b|:|$)/i, "crime investigation"],
];

function addSignal(bucket: SignalBucket, key: string, value: number) {
  if (!Number.isFinite(value) || value <= 0) return;
  bucket[key] = (bucket[key] || 0) + value;
}

function applyRules(
  tag: string,
  value: number,
  rules: Array<[RegExp, string]>,
  bucket: SignalBucket
) {
  for (const [pattern, key] of rules) {
    if (pattern.test(tag)) addSignal(bucket, key, value);
  }
}

function addTasteAxisHints(input: RecommenderInput, tone: SignalBucket, texture: SignalBucket) {
  const axes = input.tasteProfile?.axes;
  if (!axes) return;

  if ((axes.darkness || 0) > 0.12) addSignal(tone, "dark", axes.darkness);
  if ((axes.warmth || 0) > 0.12) addSignal(tone, "hopeful", axes.warmth);
  if ((axes.humor || 0) > 0.12) addSignal(tone, "funny", axes.humor);
  if ((axes.realism || 0) > 0.12) addSignal(texture, "realistic", axes.realism);
  if ((axes.realism || 0) < -0.12) addSignal(texture, "epic", Math.abs(axes.realism));
  if ((axes.characterFocus || 0) > 0.12) addSignal(texture, "character-driven", axes.characterFocus);
  if ((axes.ideaDensity || 0) > 0.12) addSignal(texture, "psychological", axes.ideaDensity);
  if ((axes.pacing || 0) > 0.12) addSignal(texture, "fast-paced", axes.pacing);
  if ((axes.pacing || 0) < -0.12) addSignal(texture, "slow-burn", Math.abs(axes.pacing));
}

function extractSignals(input: RecommenderInput): QuerySignals {
  const genre: SignalBucket = {};
  const tone: SignalBucket = {};
  const texture: SignalBucket = {};
  const scenario: SignalBucket = {};

  for (const [tag, raw] of Object.entries(input.tagCounts || {})) {
    const value = Number(raw || 0);
    if (!Number.isFinite(value) || value <= 0) continue;

    applyRules(tag, value, GENRE_RULES, genre);
    applyRules(tag, value, TONE_RULES, tone);
    applyRules(tag, value, TEXTURE_RULES, texture);
    applyRules(tag, value, SCENARIO_RULES, scenario);
  }

  addTasteAxisHints(input, tone, texture);
  return { genre, tone, texture, scenario };
}

function topKeys(bucket: SignalBucket, limit: number, threshold = 0.04): string[] {
  return Object.entries(bucket)
    .filter(([, score]) => score > threshold)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([key]) => key);
}

function audiencePhrase(deckKey: RecommenderInput["deckKey"]): string {
  if (deckKey === "adult") return "adult fiction";
  if (deckKey === "ms_hs") return "young adult fiction";
  if (deckKey === "3_6") return "middle grade fiction";
  return "fiction";
}

function fallbackQueriesForDeck(deckKey: RecommenderInput["deckKey"]): string[] {
  const audience = audiencePhrase(deckKey);
  return [
    `character-driven ${audience} with emotional tension ${NEGATIVE_TERMS}`,
    `high-stakes ${audience} with strong atmosphere ${NEGATIVE_TERMS}`,
    `psychological ${audience} with narrative momentum ${NEGATIVE_TERMS}`,
    `${audience} focused on conflict and suspense ${NEGATIVE_TERMS}`,
  ];
}

function genreCore(genres: string[]): string {
  if (genres.includes("crime") && genres.includes("thriller")) return "crime thriller fiction novel";
  if (genres.includes("mystery") && genres.includes("thriller")) return "mystery thriller fiction novel";
  if (genres.includes("crime") && genres.includes("mystery")) return "crime mystery fiction novel";
  if (genres.includes("dystopian") && genres.includes("thriller")) return "dystopian thriller fiction novel";
  if (genres.includes("fantasy")) return "fantasy fiction novel";
  if (genres.includes("thriller")) return "thriller fiction novel";
  if (genres.includes("mystery")) return "mystery fiction novel";
  if (genres.includes("crime")) return "crime fiction novel";
  if (genres.includes("horror")) return "horror fiction novel";
  if (genres.includes("science fiction")) return "science fiction novel";
  if (genres.includes("romance")) return "romance fiction novel";
  if (genres.includes("historical")) return "historical fiction novel";
  if (genres.includes("dystopian")) return "dystopian fiction novel";
  return "";
}

function dedupeWords(value: string): string {
  const words = value.split(/\s+/);
  const out: string[] = [];
  const seen = new Set<string>();
  for (const word of words) {
    const normalized = word.toLowerCase();
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    out.push(word);
  }
  return out.join(" ").trim();
}

function buildPrimaryPhrase(
  tones: string[],
  textures: string[],
  genres: string[],
  scenarios: string[],
  deckKey: RecommenderInput["deckKey"]
): string | null {
  const core = genreCore(genres);
  if (!core) return null;

  const parts: string[] = [];
  if (scenarios[0]) parts.push(scenarios[0]);
  if (tones[0]) parts.push(tones[0]);
  if (textures[0] && textures[0] !== tones[0]) parts.push(textures[0]);
  parts.push(core);
  parts.push(audiencePhrase(deckKey));

  return dedupeWords(parts.join(" ").replace(/\s+/g, " ").trim());
}

function pushQuery(set: Set<string>, query: string) {
  const cleaned = dedupeWords(query.replace(/\s+/g, " ").trim());
  if (cleaned) set.add(`${cleaned} ${NEGATIVE_TERMS}`.trim());
}

function buildVariantPhrases(
  tones: string[],
  textures: string[],
  genres: string[],
  scenarios: string[],
  deckKey: RecommenderInput["deckKey"]
): string[] {
  const queries = new Set<string>();
  const core = genreCore(genres);
  const audience = audiencePhrase(deckKey);

  if (!core) {
    for (const fallback of fallbackQueriesForDeck(deckKey)) queries.add(fallback);
    return Array.from(queries);
  }

  const primary = buildPrimaryPhrase(tones, textures, genres, scenarios, deckKey);
  if (primary) pushQuery(queries, primary);

  if (scenarios[0] && tones[0] && textures[0]) {
    pushQuery(queries, `${scenarios[0]} ${tones[0]} ${textures[0]} ${core} ${audience}`);
  }
  if (scenarios[0] && tones[0]) {
    pushQuery(queries, `${scenarios[0]} ${tones[0]} ${core} ${audience}`);
  }
  if (scenarios[0] && textures[0]) {
    pushQuery(queries, `${scenarios[0]} ${textures[0]} ${core} ${audience}`);
  }
  if (tones[0] && textures[0]) {
    pushQuery(queries, `${tones[0]} ${textures[0]} ${core} ${audience}`);
  }
  if (scenarios[1]) {
    pushQuery(queries, `${scenarios[1]} ${core} ${audience}`);
  }
  if (tones[1]) {
    pushQuery(queries, `${tones[1]} ${core} ${audience}`);
  }
  if (textures[1]) {
    pushQuery(queries, `${textures[1]} ${core} ${audience}`);
  }

  return Array.from(queries);
}

export function buildDescriptiveQueriesFromTaste(input: RecommenderInput) {
  const signals = extractSignals(input);

  const genres = topKeys(signals.genre, 4);
  const tones = topKeys(signals.tone, 3);
  const textures = topKeys(signals.texture, 3);
  const scenarios = topKeys(signals.scenario, 4);

  const queries = buildVariantPhrases(tones, textures, genres, scenarios, input.deckKey).slice(0, 6);
  const preview =
    buildPrimaryPhrase(tones, textures, genres, scenarios, input.deckKey) ||
    fallbackQueriesForDeck(input.deckKey)[0];

  return {
    queries,
    strategy: "20q-descriptive-query-builder-v2",
    preview,
    signals: { genres, tones, textures, scenarios },
  };
}

export default buildDescriptiveQueriesFromTaste;
