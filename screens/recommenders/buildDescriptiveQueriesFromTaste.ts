import type { RecommenderInput } from "./types";

type SignalBucket = Record<string, number>;

type QuerySignals = {
  genre: SignalBucket;
  tone: SignalBucket;
  texture: SignalBucket;
  scenario: SignalBucket;
};

const VIBE_WORDS = new Set([
  'dark','gritty','bleak','hopeful','emotional','grounded',
  'psychological','intense','moody','character-driven'
]);

function stripVibeWords(query: string): string {
  return query
    .split(' ')
    .filter(w => !VIBE_WORDS.has(w.toLowerCase()))
    .join(' ');
}

const NEGATIVE_TERMS = [
  "-analysis","-guide","-summary","-criticism","-literature","-magazine","-journal",
  "-catalog","-catalogue","-reference","-companion","-study","-workbook","-textbook",
  "-manual","-encyclopedia","-anthology","-collection","-essays","-nonfiction",
  "-biography","-memoir",
].join(" ");

function audiencePhrase(deckKey: RecommenderInput["deckKey"]): string {
  if (deckKey === "adult") return "adult fiction";
  if (deckKey === "ms_hs") return "young adult fiction";
  if (deckKey === "36") return "middle grade fiction";
  return "fiction";
}

function scoreFromTags(tagCounts: Record<string, number> | undefined, keys: string[]): number {
  const counts = tagCounts || {};
  return keys.reduce((sum, key) => sum + Number(counts[key] || 0), 0);
}

function uniqueQueries(values: Array<string | undefined | null>): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const cleaned = String(value || "").replace(/\s+/g, " ").trim();
    if (!cleaned) continue;
    const key = cleaned.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(cleaned);
  }
  return out;
}

function fallbackQueriesForDeck(deckKey: RecommenderInput["deckKey"]): string[] {
  const audience = audiencePhrase(deckKey);
  return [
    `fiction novel ${audience} ${NEGATIVE_TERMS}`,
    `character driven novel ${audience} ${NEGATIVE_TERMS}`,
    `contemporary novel ${audience} ${NEGATIVE_TERMS}`,
  ];
}

function buildDescriptiveAxisQueries(input: RecommenderInput): { queries: string[]; signals: QuerySignals } {
  const audience = audiencePhrase(input.deckKey);
  const tagCounts = input.tagCounts || {};
  const axes = input.tasteProfile?.axes || {};

  const darkScore = scoreFromTags(tagCounts, ["dark", "betrayal", "spooky", "horror"]);
  const fastScore = scoreFromTags(tagCounts, ["thriller", "action", "adventure"]);
  const realisticScore = scoreFromTags(tagCounts, ["realistic", "historical", "grounded", "authority"]);
  const speculativeScore = scoreFromTags(tagCounts, ["science fiction", "fantasy", "horror", "spooky", "dystopian"]);
  const intimacyScore = scoreFromTags(tagCounts, ["family", "love", "relationship", "romance"]);
  const intrigueScore = scoreFromTags(tagCounts, ["mystery", "crime", "betrayal", "identity"]);

  const useDark =
    darkScore >= 2 || Number(axes.darkness || 0) >= 0.18;

  const useFast =
    fastScore >= 2 || Number(axes.pacing || 0) >= 0.18;

  const useRealism =
    realisticScore >= 2 || Number(axes.realism || 0) >= 0.18;

  const useSpeculative =
    speculativeScore >= 2 || Number(axes.ideaDensity || 0) >= 0.18;

  const useIntimacy =
    intimacyScore >= 2 || Number(axes.characterFocus || 0) >= 0.18;

  const useIntrigue =
    intrigueScore >= 2 || useDark || useFast;

  const primary = [
    useDark ? "dark" : undefined,
    useFast ? "fast paced" : undefined,
    useRealism ? "realistic" : undefined,
    useSpeculative && !useRealism ? "speculative" : undefined,
    "novel",
    audience,
    NEGATIVE_TERMS,
  ].filter(Boolean).join(" ");

  const secondary = [
    useIntimacy ? "character driven" : undefined,
    useDark ? "dark" : undefined,
    "novel",
    audience,
    NEGATIVE_TERMS,
  ].filter(Boolean).join(" ");

  const tertiary = [
    useIntrigue ? "suspense" : undefined,
    useRealism ? "grounded" : undefined,
    "fiction novel",
    audience,
    NEGATIVE_TERMS,
  ].filter(Boolean).join(" ");

  const speculativeQuery = [
    useSpeculative ? "speculative fiction novel" : undefined,
    audience,
    NEGATIVE_TERMS,
  ].filter(Boolean).join(" ");

  const psychologicalQuery = [
    useDark ? "psychological" : undefined,
    useIntrigue ? "suspense novel" : undefined,
    audience,
    NEGATIVE_TERMS,
  ].filter(Boolean).join(" ");

  const slowBurnQuery = [
    Number(axes.pacing || 0) < -0.12 ? "slow burn novel" : undefined,
    useIntimacy ? "character driven" : undefined,
    audience,
    NEGATIVE_TERMS,
  ].filter(Boolean).join(" ");

  const queries = uniqueQueries([
    primary,
    secondary,
    tertiary,
    speculativeQuery,
    psychologicalQuery,
    slowBurnQuery,
  ]);

  const signals: QuerySignals = {
    genre: {
      speculative: useSpeculative ? 1 : 0,
      realism: useRealism ? 1 : 0,
      intrigue: useIntrigue ? 1 : 0,
    },
    tone: {
      dark: useDark ? 1 : 0,
      intimate: useIntimacy ? 1 : 0,
      fast: useFast ? 1 : 0,
    },
    texture: {
      grounded: useRealism ? 1 : 0,
      imaginative: useSpeculative ? 1 : 0,
    },
    scenario: {
      suspense: useIntrigue ? 1 : 0,
      personal: useIntimacy ? 1 : 0,
    },
  };

  return { queries, signals };
}

export function buildDescriptiveQueriesFromTaste(input: RecommenderInput) {
  const descriptive = buildDescriptiveAxisQueries(input);
const queries = descriptive.queries.length
  ? descriptive.queries.map(q => {
      const cleaned = stripVibeWords(q);
      return cleaned.length > 5 ? cleaned : 'novel';
    })
  : fallbackQueriesForDeck(input.deckKey);

  return {
    queries,
    preview: queries[0],
    strategy: "signal-driven-descriptive-queries",
    signals: descriptive.signals,
  };
}

export default buildDescriptiveQueriesFromTaste;