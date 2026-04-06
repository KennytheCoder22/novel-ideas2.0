import type { RecommenderInput } from "./types";

type SignalBucket = Record<string, number>;
type QuerySignals = {
  genre: SignalBucket;
  tone: SignalBucket;
  texture: SignalBucket;
  scenario: SignalBucket;
};

const GENRE_RULES: Array<[RegExp, string]> = [
  [/(^|:|\b)fantasy(\b|:|$)/i, "fantasy"],
  [/(^|:|\b)thriller(\b|:|$)/i, "thriller"],
  [/(^|:|\b)mystery(\b|:|$)/i, "mystery"],
  [/(^|:|\b)crime(\b|:|$)/i, "crime"],
  [/(^|:|\b)horror(\b|:|$)/i, "horror"],
  [/(^|:|\b)science fiction(\b|:|$)|(^|:|\b)sci[-\s]?fi(\b|:|$)/i, "science fiction"],
  [/(^|:|\b)romance(\b|:|$)/i, "romance"],
  [/(^|:|\b)historical(\b|:|$)/i, "historical"],
];

const TONE_RULES: Array<[RegExp, string]> = [
  [/(^|:|\b)dark(\b|:|$)|(^|:|\b)bleak(\b|:|$)|(^|:|\b)grim(\b|:|$)/i, "dark"],
  [/(^|:|\b)hopeful(\b|:|$)|(^|:|\b)uplifting(\b|:|$)/i, "hopeful"],
  [/(^|:|\b)cozy(\b|:|$)|(^|:|\b)comfort(\b|:|$)/i, "cozy"],
  [/(^|:|\b)spooky(\b|:|$)|(^|:|\b)haunting(\b|:|$)|(^|:|\b)gothic(\b|:|$)/i, "spooky"],
  [/(^|:|\b)funny(\b|:|$)|(^|:|\b)humor(\b|:|$)|(^|:|\b)comedy(\b|:|$)/i, "funny"],
];

const TEXTURE_RULES: Array<[RegExp, string]> = [
  [/(^|:|\b)realistic(\b|:|$)|(^|:|\b)grounded(\b|:|$)/i, "realistic"],
  [/(^|:|\b)atmospheric(\b|:|$)/i, "atmospheric"],
  [/(^|:|\b)epic(\b|:|$)/i, "epic"],
  [/(^|:|\b)character(\b|:|$)|(^|:|\b)character driven(\b|:|$)/i, "character-driven"],
  [/(^|:|\b)psychological(\b|:|$)/i, "psychological"],
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

  if ((axes.darkness || 0) > 0.15) addSignal(tone, "dark", axes.darkness);
  if ((axes.warmth || 0) > 0.15) addSignal(tone, "hopeful", axes.warmth);
  if ((axes.humor || 0) > 0.15) addSignal(tone, "funny", axes.humor);
  if ((axes.realism || 0) > 0.15) addSignal(texture, "realistic", axes.realism);
  if ((axes.realism || 0) < -0.15) addSignal(texture, "epic", Math.abs(axes.realism));
  if ((axes.characterFocus || 0) > 0.15) addSignal(texture, "character-driven", axes.characterFocus);
  if ((axes.ideaDensity || 0) > 0.15) addSignal(texture, "psychological", axes.ideaDensity);
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

function topKeys(bucket: SignalBucket, limit: number, threshold = 0.05): string[] {
  return Object.entries(bucket)
    .filter(([, score]) => score > threshold)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([key]) => key);
}

function fallbackQueriesForDeck(deckKey: RecommenderInput["deckKey"]): string[] {
  if (deckKey === "adult") {
    return [
      "character-driven novel with emotional tension",
      "high-stakes story with strong atmosphere",
      "psychological fiction with narrative momentum",
      "adult fiction focused on conflict and suspense",
    ];
  }
  if (deckKey === "ms_hs") {
    return [
      "young adult novel with emotional tension",
      "character-driven YA fiction with high stakes",
      "page-turning YA fiction with strong atmosphere",
      "teen fiction focused on conflict and suspense",
    ];
  }
  return [
    "fiction with emotional tension and strong characters",
    "story with adventure and high stakes",
    "page-turning fiction with vivid atmosphere",
    "character-driven fiction with narrative momentum",
  ];
}

function genreCore(genres: string[]): string {
  if (genres.includes("crime") && genres.includes("thriller")) return "crime thriller novel";
  if (genres.includes("mystery") && genres.includes("thriller")) return "mystery thriller novel";
  if (genres.includes("fantasy")) return "fantasy novel";
  if (genres.includes("thriller")) return "thriller novel";
  if (genres.includes("mystery")) return "mystery novel";
  if (genres.includes("crime")) return "crime novel";
  if (genres.includes("horror")) return "horror novel";
  if (genres.includes("science fiction")) return "science fiction novel";
  if (genres.includes("romance")) return "romance novel";
  if (genres.includes("historical")) return "historical fiction novel";
  return "";
}

function buildPrimaryPhrase(
  tones: string[],
  textures: string[],
  genres: string[],
  scenarios: string[]
): string | null {
  const core = genreCore(genres);
  if (!core) return null;

  const parts: string[] = [];
  if (tones[0]) parts.push(tones[0]);
  if (textures[0] && textures[0] !== tones[0]) parts.push(textures[0]);
  parts.push(core);
  if (scenarios[0]) parts.push(`about ${scenarios[0]}`);

  return parts.join(" ").replace(/\s+/g, " ").trim();
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

  if (!core) {
    for (const fallback of fallbackQueriesForDeck(deckKey)) queries.add(fallback);
    return Array.from(queries);
  }

  const primary = buildPrimaryPhrase(tones, textures, genres, scenarios);
  if (primary) queries.add(primary);
  if (tones[0] && scenarios[0]) queries.add(`${tones[0]} ${core} with ${scenarios[0]}`);
  if (textures[0] && scenarios[0]) queries.add(`${textures[0]} ${core} focused on ${scenarios[0]}`);
  if (tones[0] && textures[0]) queries.add(`${tones[0]} ${textures[0]} ${core}`);
  if (scenarios[1]) queries.add(`${core} about ${scenarios[1]}`);
  if (tones[1]) queries.add(`${tones[1]} ${core}`);
  if (textures[1]) queries.add(`${textures[1]} ${core}`);

  return Array.from(queries)
    .map((q) => q.replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

export function buildDescriptiveQueriesFromTaste(input: RecommenderInput) {
  const signals = extractSignals(input);

  const genres = topKeys(signals.genre, 3);
  const tones = topKeys(signals.tone, 2);
  const textures = topKeys(signals.texture, 2);
  const scenarios = topKeys(signals.scenario, 3);

  const queries = buildVariantPhrases(tones, textures, genres, scenarios, input.deckKey).slice(0, 6);
  const preview =
    buildPrimaryPhrase(tones, textures, genres, scenarios) ||
    fallbackQueriesForDeck(input.deckKey)[0];

  return {
    queries,
    strategy: "20q-descriptive-query-builder",
    preview,
    signals: { genres, tones, textures, scenarios },
  };
}

export default buildDescriptiveQueriesFromTaste;
