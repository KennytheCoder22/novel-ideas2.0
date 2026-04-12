
import type { RecommenderInput } from "./types";

type SignalBucket = Record<string, number>;

type QuerySignals = {
  genre: SignalBucket;
  tone: SignalBucket;
  texture: SignalBucket;
  scenario: SignalBucket;
};

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
    `psychological suspense fiction ${audience} ${NEGATIVE_TERMS}`,
    `psychological crime thriller novel ${audience} ${NEGATIVE_TERMS}`,
    `crime investigation novel ${audience} ${NEGATIVE_TERMS}`,
  ];
}

function buildThrillerQueries(input: RecommenderInput): { queries: string[]; signals: QuerySignals } {
  const audience = audiencePhrase(input.deckKey);
  const tagCounts = input.tagCounts || {};
  const axes = input.tasteProfile?.axes || {};

  const crimeScore = scoreFromTags(tagCounts, ["crime", "mystery", "systemic injustice"]);
  const thrillerScore = scoreFromTags(tagCounts, ["thriller"]);
  const darkScore = scoreFromTags(tagCounts, ["dark", "betrayal"]);
  const realisticScore = scoreFromTags(tagCounts, ["realistic", "family", "authority"]);
  const investigativeScore = scoreFromTags(tagCounts, ["mystery", "crime", "systemic injustice"]);
  const dystopianScore = scoreFromTags(tagCounts, ["dystopian", "survival"]);
  const negativeSpeculativeScore = Math.abs(scoreFromTags(tagCounts, ["science fiction", "horror", "spooky", "adventure"]));

  const psychologicalFromAxes =
    Number(axes.darkness || 0) >= 0.18 ||
    Number(axes.realism || 0) >= 0.18 ||
    darkScore >= 2;

  const useCrime = crimeScore + thrillerScore >= 3;
  const useInvestigation = investigativeScore >= 2;
  const useRealism = realisticScore >= 2 || Number(axes.realism || 0) >= 0.18;
  const useDark = darkScore >= 2 || Number(axes.darkness || 0) >= 0.18;
  const suppressSpeculative = negativeSpeculativeScore >= 1;
  const useDystopian = dystopianScore >= 2 && !useCrime;

  const primary = [
    psychologicalFromAxes ? "psychological" : undefined,
    useDark ? "dark" : undefined,
    useCrime ? "crime" : undefined,
    useInvestigation ? "investigation" : undefined,
    "thriller novel",
    audience,
    suppressSpeculative ? "-science fiction -horror -fantasy" : undefined,
    NEGATIVE_TERMS,
  ].filter(Boolean).join(" ");

  const secondary = [
    psychologicalFromAxes ? "psychological" : undefined,
    useCrime ? "crime" : undefined,
    "thriller novel",
    audience,
    NEGATIVE_TERMS,
  ].filter(Boolean).join(" ");

  const tertiary = [
    useInvestigation ? "investigation" : "murder investigation",
    useCrime ? "crime novel" : "thriller novel",
    audience,
    NEGATIVE_TERMS,
  ].filter(Boolean).join(" ");

  const realismQuery = [
    useDark ? "dark" : undefined,
    useRealism ? "realistic" : undefined,
    useCrime ? "crime" : undefined,
    "suspense novel",
    audience,
    NEGATIVE_TERMS,
  ].filter(Boolean).join(" ");

  const dystopianQuery = [
    useDystopian ? "dystopian psychological thriller novel" : undefined,
    audience,
    NEGATIVE_TERMS,
  ].filter(Boolean).join(" ");

  const domesticQuery = [
    psychologicalFromAxes ? "psychological" : undefined,
    "domestic suspense novel",
    audience,
    NEGATIVE_TERMS,
  ].filter(Boolean).join(" ");

  const queries = uniqueQueries([
    primary,
    secondary,
    tertiary,
    realismQuery,
    domesticQuery,
    useDystopian ? dystopianQuery : undefined,
  ])

  signals: QuerySignals = {
    genre: {
      thriller: thrillerScore,
      crime: crimeScore,
      dystopian: dystopianScore,
    },
    tone: {
      dark: darkScore,
      realistic: realisticScore,
      psychological: psychologicalFromAxes ? 1 : 0,
    },
    texture: {
      grounded: useRealism ? 1 : 0,
      anti_speculative: suppressSpeculative ? 1 : 0,
    },
    scenario: {
      investigation: useInvestigation ? 1 : 0,
    },
  };

  return { queries, signals };
}

export function buildDescriptiveQueriesFromTaste(input: RecommenderInput) {
  const thriller = buildThrillerQueries(input);
  const queries = thriller.queries.length ? thriller.queries : fallbackQueriesForDeck(input.deckKey);

  return {
    queries,
    preview: queries[0],
    strategy: "signal-driven-descriptive-queries",
    signals: thriller.signals,
  };
}

export default buildDescriptiveQueriesFromTaste;
