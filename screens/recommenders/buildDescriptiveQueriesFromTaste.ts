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

function bucketScore(bucket: SignalBucket, keys: string[]): number {
  return keys.reduce((sum, key) => sum + Number(bucket[key] || 0), 0);
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
    `psychological thriller novel ${audience} ${NEGATIVE_TERMS}`,
    `crime thriller novel ${audience} ${NEGATIVE_TERMS}`,
    `detective mystery novel ${audience} ${NEGATIVE_TERMS}`,
  ];
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

function pushQuery(set: Set<string>, query: string) {
  const cleaned = dedupeWords(query.replace(/\s+/g, " ").trim());
  if (cleaned) set.add(`${cleaned} ${NEGATIVE_TERMS}`.trim());
}

type DominantIntent = {
  core: string;
  preview: string;
  variants: string[];
  family: string;
};

function dominantGenreFamily(signals: QuerySignals): "thriller_family" | "speculative_family" | "romance_family" | "historical_family" | "other" {
  const thrillerScore =
    bucketScore(signals.genre, ["crime", "thriller", "mystery"]) +
    bucketScore(signals.scenario, ["investigation", "crime investigation"]);
  const speculativeScore =
    bucketScore(signals.genre, ["science fiction", "fantasy", "horror", "dystopian"]);
  const romanceScore = bucketScore(signals.genre, ["romance"]);
  const historicalScore = bucketScore(signals.genre, ["historical"]);

  if (thrillerScore >= Math.max(0.25, speculativeScore + 0.35, romanceScore + 0.35, historicalScore + 0.35)) {
    return "thriller_family";
  }
  if (speculativeScore >= Math.max(0.25, romanceScore, historicalScore)) return "speculative_family";
  if (romanceScore >= Math.max(0.2, historicalScore)) return "romance_family";
  if (historicalScore >= 0.2) return "historical_family";
  return "other";
}

function buildThrillerIntent(
  signals: QuerySignals,
  genres: string[],
  tones: string[],
  textures: string[],
  scenarios: string[],
  deckKey: RecommenderInput["deckKey"]
): DominantIntent {
  const audience = audiencePhrase(deckKey);
  const variants = new Set<string>();
  const thrillerStrength = bucketScore(signals.genre, ["thriller", "crime", "mystery"]);
  const darkStrength = Number(signals.tone["dark"] || 0);
  const psychologicalStrength = Number(signals.texture["psychological"] || 0);
  const investigationStrength = bucketScore(signals.scenario, ["investigation", "crime investigation"]);

  const shouldForcePsychological =
    psychologicalStrength > 0.08 ||
    darkStrength > 0.18 ||
    thrillerStrength > 0.55;

  const shouldForceDetective =
    investigationStrength > 0.05 || genres.includes("mystery") || genres.includes("crime");

  pushQuery(variants, `crime thriller novel ${audience}`);

  if (shouldForcePsychological) {
    pushQuery(variants, `psychological thriller novel ${audience}`);
  }

  if (shouldForceDetective) {
    pushQuery(variants, `detective mystery novel ${audience}`);
  }

  if (variants.size < 3 && darkStrength > 0.08) {
    pushQuery(variants, `dark thriller novel ${audience}`);
  }

  if (variants.size < 3 && tones.includes("gritty")) {
    pushQuery(variants, `gritty crime thriller novel ${audience}`);
  }

  if (variants.size < 3 && textures.includes("realistic")) {
    pushQuery(variants, `crime investigation thriller novel ${audience}`);
  }

  const ordered = Array.from(variants).slice(0, 3);
  const preview = shouldForcePsychological ? "psychological thriller novel" : "crime thriller novel";

  return {
    core: preview,
    preview,
    variants: ordered,
    family: "thriller_family",
  };
}

function buildDominantIntent(
  signals: QuerySignals,
  genres: string[],
  tones: string[],
  textures: string[],
  scenarios: string[],
  deckKey: RecommenderInput["deckKey"]
): DominantIntent | null {
  const family = dominantGenreFamily(signals);
  const audience = audiencePhrase(deckKey);

  if (family === "thriller_family") {
    return buildThrillerIntent(signals, genres, tones, textures, scenarios, deckKey);
  }

  if (family === "speculative_family") {
    const variants = new Set<string>();
    if (genres.includes("science fiction")) pushQuery(variants, `science fiction novel ${audience}`);
    if (genres.includes("fantasy")) pushQuery(variants, `fantasy novel ${audience}`);
    if (genres.includes("horror")) pushQuery(variants, `horror novel ${audience}`);
    if (genres.includes("dystopian")) pushQuery(variants, `dystopian science fiction novel ${audience}`);
    if (!variants.size) pushQuery(variants, `science fiction novel ${audience}`);
    const preview = Array.from(variants)[0]?.replace(NEGATIVE_TERMS, "").trim() || "science fiction novel";
    return {
      core: preview,
      preview,
      variants: Array.from(variants).slice(0, 3),
      family,
    };
  }

  if (family === "romance_family") {
    const variants = new Set<string>();
    pushQuery(variants, `romance novel ${audience}`);
    if (textures.includes("character-driven")) pushQuery(variants, `character-driven romance novel ${audience}`);
    if (tones.includes("hopeful") || tones.includes("cozy")) pushQuery(variants, `romantic fiction novel ${audience}`);
    return {
      core: "romance novel",
      preview: "romance novel",
      variants: Array.from(variants).slice(0, 3),
      family,
    };
  }

  if (family === "historical_family") {
    const variants = new Set<string>();
    pushQuery(variants, `historical fiction novel ${audience}`);
    if (scenarios.includes("war")) pushQuery(variants, `war historical fiction novel ${audience}`);
    return {
      core: "historical fiction novel",
      preview: "historical fiction novel",
      variants: Array.from(variants).slice(0, 3),
      family,
    };
  }

  return null;
}

export function buildDescriptiveQueriesFromTaste(input: RecommenderInput) {
  const signals = extractSignals(input);

  const genres = topKeys(signals.genre, 4);
  const tones = topKeys(signals.tone, 3);
  const textures = topKeys(signals.texture, 3);
  const scenarios = topKeys(signals.scenario, 4);

  const dominantIntent = buildDominantIntent(signals, genres, tones, textures, scenarios, input.deckKey);
  let queries = dominantIntent?.variants || fallbackQueriesForDeck(input.deckKey).slice(0, 3);

  if (queries.length < 3 && dominantIntent?.family === "thriller_family") {
    queries = Array.from(new Set([
      ...queries,
      `psychological thriller novel ${audiencePhrase(input.deckKey)} ${NEGATIVE_TERMS}`,
      `crime thriller novel ${audiencePhrase(input.deckKey)} ${NEGATIVE_TERMS}`,
      `detective mystery novel ${audiencePhrase(input.deckKey)} ${NEGATIVE_TERMS}`,
    ])).slice(0, 3);
  }

  if (queries.length < 2 && dominantIntent?.core) {
    queries = Array.from(new Set([...queries, `${dominantIntent.core} ${NEGATIVE_TERMS}`])).slice(0, 2);
  }

  const preview = dominantIntent?.preview || fallbackQueriesForDeck(input.deckKey)[0];

  return {
    queries,
    strategy: "20q-intent-compression-v5-tight-thriller-hypothesis",
    preview,
    signals: {
      genres,
      tones,
      textures,
      scenarios,
      dominantIntent: dominantIntent?.core || null,
      dominantFamily: dominantIntent?.family || null,
    },
  };
}

export default buildDescriptiveQueriesFromTaste;
