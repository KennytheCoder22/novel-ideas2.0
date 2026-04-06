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
    `character-driven ${audience} ${NEGATIVE_TERMS}`,
    `atmospheric ${audience} ${NEGATIVE_TERMS}`,
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
};

function dominantGenre(genres: string[]): string | null {
  if (genres.includes("crime") && genres.includes("thriller")) return "crime-thriller";
  if (genres.includes("mystery") && genres.includes("thriller")) return "mystery-thriller";
  if (genres.includes("crime") && genres.includes("mystery")) return "crime-mystery";
  if (genres.includes("dystopian") && genres.includes("thriller")) return "dystopian-thriller";
  if (genres[0]) return genres[0];
  return null;
}

function buildDominantIntent(
  tones: string[],
  textures: string[],
  genres: string[],
  scenarios: string[],
  deckKey: RecommenderInput["deckKey"]
): DominantIntent | null {
  const genre = dominantGenre(genres);
  const audience = audiencePhrase(deckKey);
  if (!genre) return null;

  if (genre === "crime-thriller") {
    const psychological = textures.includes("psychological");
    const realistic = textures.includes("realistic") || tones.includes("gritty");
    const dark = tones.includes("dark");
    const variants = new Set<string>();

    if (psychological) pushQuery(variants, `psychological thriller novel ${audience}`);
    if (realistic) pushQuery(variants, `crime thriller novel ${audience}`);
    if (scenarios.includes("investigation") || genres.includes("mystery")) {
      pushQuery(variants, `detective mystery novel ${audience}`);
    }
    if (dark) pushQuery(variants, `dark crime thriller novel ${audience}`);
    if (variants.size === 0) pushQuery(variants, `crime thriller novel ${audience}`);

    return {
      core: "crime thriller novel",
      preview: psychological ? "psychological thriller novel" : "crime thriller novel",
      variants: Array.from(variants),
    };
  }

  if (genre === "mystery-thriller") {
    const variants = new Set<string>();
    pushQuery(variants, `psychological thriller novel ${audience}`);
    pushQuery(variants, `detective mystery novel ${audience}`);
    if (tones.includes("dark")) pushQuery(variants, `dark mystery thriller novel ${audience}`);
    return {
      core: "mystery thriller novel",
      preview: "psychological thriller novel",
      variants: Array.from(variants),
    };
  }

  if (genre === "crime-mystery") {
    const variants = new Set<string>();
    pushQuery(variants, `detective mystery novel ${audience}`);
    pushQuery(variants, `crime mystery novel ${audience}`);
    if (textures.includes("psychological")) pushQuery(variants, `psychological mystery novel ${audience}`);
    return {
      core: "crime mystery novel",
      preview: "detective mystery novel",
      variants: Array.from(variants),
    };
  }

  if (genre === "fantasy") {
    const variants = new Set<string>();
    if (textures.includes("character-driven")) pushQuery(variants, `character-driven fantasy novel ${audience}`);
    if (textures.includes("epic")) pushQuery(variants, `epic fantasy novel ${audience}`);
    if (tones.includes("dark")) pushQuery(variants, `dark fantasy novel ${audience}`);
    if (scenarios.includes("quest")) pushQuery(variants, `quest fantasy novel ${audience}`);
    if (variants.size === 0) pushQuery(variants, `fantasy novel ${audience}`);
    return {
      core: "fantasy novel",
      preview: Array.from(variants)[0]?.replace(NEGATIVE_TERMS, "").trim() || "fantasy novel",
      variants: Array.from(variants),
    };
  }

  if (genre === "science fiction") {
    const variants = new Set<string>();
    if (genres.includes("dystopian") || scenarios.includes("societal collapse")) {
      pushQuery(variants, `dystopian science fiction novel ${audience}`);
    }
    pushQuery(variants, `science fiction novel ${audience}`);
    return {
      core: "science fiction novel",
      preview: Array.from(variants)[0]?.replace(NEGATIVE_TERMS, "").trim() || "science fiction novel",
      variants: Array.from(variants),
    };
  }

  if (genre === "horror") {
    const variants = new Set<string>();
    if (tones.includes("spooky")) pushQuery(variants, `gothic horror novel ${audience}`);
    if (scenarios.includes("survival")) pushQuery(variants, `survival horror novel ${audience}`);
    if (variants.size === 0) pushQuery(variants, `horror novel ${audience}`);
    return {
      core: "horror novel",
      preview: Array.from(variants)[0]?.replace(NEGATIVE_TERMS, "").trim() || "horror novel",
      variants: Array.from(variants),
    };
  }

  if (genre === "romance") {
    const variants = new Set<string>();
    if (tones.includes("hopeful") || tones.includes("cozy")) pushQuery(variants, `romantic fiction novel ${audience}`);
    if (textures.includes("character-driven")) pushQuery(variants, `character-driven romance novel ${audience}`);
    if (variants.size === 0) pushQuery(variants, `romance novel ${audience}`);
    return {
      core: "romance novel",
      preview: Array.from(variants)[0]?.replace(NEGATIVE_TERMS, "").trim() || "romance novel",
      variants: Array.from(variants),
    };
  }

  const generic = `${genre} novel ${audience}`;
  return {
    core: generic,
    preview: generic,
    variants: [`${generic} ${NEGATIVE_TERMS}`],
  };
}

export function buildDescriptiveQueriesFromTaste(input: RecommenderInput) {
  const signals = extractSignals(input);

  const genres = topKeys(signals.genre, 4);
  const tones = topKeys(signals.tone, 3);
  const textures = topKeys(signals.texture, 3);
  const scenarios = topKeys(signals.scenario, 4);

  const dominantIntent = buildDominantIntent(tones, textures, genres, scenarios, input.deckKey);
  let queries = dominantIntent?.variants.slice(0, 3) || fallbackQueriesForDeck(input.deckKey).slice(0, 2);
  if (queries.length < 2 && dominantIntent?.core) {
    queries = Array.from(new Set([
      ...queries,
      `${dominantIntent.core} ${NEGATIVE_TERMS}`
    ])).slice(0, 2);
  }
  const preview = dominantIntent?.preview || fallbackQueriesForDeck(input.deckKey)[0];

  return {
    queries,
    strategy: "20q-intent-compression-v3",
    preview,
    signals: { genres, tones, textures, scenarios, dominantIntent: dominantIntent?.core || null },
  };
}

export default buildDescriptiveQueriesFromTaste;
