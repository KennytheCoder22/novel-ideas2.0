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
    `psychological thriller novel ${audience} ${NEGATIVE_TERMS}`,
    `crime thriller novel ${audience} ${NEGATIVE_TERMS}`,
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

function dominantGenreFamily(genres: string[]): "thriller_family" | "speculative_family" | "romance_family" | "historical_family" | "other" {
  if (genres.some((genre) => ["crime", "thriller", "mystery", "dystopian"].includes(genre))) return "thriller_family";
  if (genres.some((genre) => ["science fiction", "fantasy", "horror"].includes(genre))) return "speculative_family";
  if (genres.includes("romance")) return "romance_family";
  if (genres.includes("historical")) return "historical_family";
  return "other";
}

function buildDominantIntent(
  tones: string[],
  textures: string[],
  genres: string[],
  scenarios: string[],
  deckKey: RecommenderInput["deckKey"]
): DominantIntent | null {
  const family = dominantGenreFamily(genres);
  const audience = audiencePhrase(deckKey);

  if (family === "thriller_family") {
    const variants = new Set<string>();
    const psychological = textures.includes("psychological");
    const dark = tones.includes("dark");
    const investigative = scenarios.includes("investigation") || genres.includes("mystery") || genres.includes("crime");

    if (psychological) pushQuery(variants, `psychological thriller novel ${audience}`);
    pushQuery(variants, `crime thriller novel ${audience}`);
    if (investigative) pushQuery(variants, `detective mystery novel ${audience}`);
    if (dark) pushQuery(variants, `dark thriller novel ${audience}`);

    return {
      core: psychological ? "psychological thriller novel" : "crime thriller novel",
      preview: psychological ? "psychological thriller novel" : "crime thriller novel",
      variants: Array.from(variants).slice(0, 3),
      family,
    };
  }

  if (family === "speculative_family") {
    const variants = new Set<string>();
    if (genres.includes("science fiction")) pushQuery(variants, `science fiction novel ${audience}`);
    if (genres.includes("fantasy")) pushQuery(variants, `fantasy novel ${audience}`);
    if (genres.includes("horror")) pushQuery(variants, `horror novel ${audience}`);
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

  const dominantIntent = buildDominantIntent(tones, textures, genres, scenarios, input.deckKey);
  let queries = dominantIntent?.variants || fallbackQueriesForDeck(input.deckKey).slice(0, 2);
  if (queries.length < 2 && dominantIntent?.core) {
    queries = Array.from(new Set([...queries, `${dominantIntent.core} ${NEGATIVE_TERMS}`])).slice(0, 2);
  }
  const preview = dominantIntent?.preview || fallbackQueriesForDeck(input.deckKey)[0];

  return {
    queries,
    strategy: "20q-intent-compression-v4-family-locked",
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
