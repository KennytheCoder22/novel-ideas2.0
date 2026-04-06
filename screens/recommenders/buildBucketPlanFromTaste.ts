import type { RecommenderInput } from "./types";
import { extractQuerySignals } from "./tasteToQuerySignals";
import { QUERY_TRANSLATIONS } from "./queryTranslations";

function topKeys(obj: Record<string, number>, limit: number): string[] {
  return Object.entries(obj)
    .filter(([, score]) => score > 0.05)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit || 3)
    .map(([key]) => key);
}

function expand(
  keys: string[],
  dictionary: Record<string, readonly string[] | string[]>
): string[] {
  return keys.flatMap((key) => dictionary[key] || []);
}

function fallbackGenreForDeck(deckKey: RecommenderInput["deckKey"]): string {
  if (deckKey === "adult") return "fiction novel";
  if (deckKey === "ms_hs") return "young adult novel";
  if (deckKey === "3_6") return "middle grade novel";
  return "children's book";
}

export function buildBucketPlanFromTaste(input: RecommenderInput) {
  const signals = extractQuerySignals(input);

  const genreKeys = topKeys(signals.genre, 3);
  const toneKeys = topKeys(signals.tone, 2);
  const scenarioKeys = topKeys(signals.scenario, 3);

  const genreFragments = expand(genreKeys, QUERY_TRANSLATIONS.genre as Record<string, string[]>);
  const toneFragments = expand(toneKeys, QUERY_TRANSLATIONS.tone as Record<string, string[]>);
  const scenarioFragments = expand(scenarioKeys, QUERY_TRANSLATIONS.scenario as Record<string, string[]>);

  const queries = new Set<string>();

const baseGenre = genreFragments[0];

if (!baseGenre) {
  // HARD FAIL SAFE: do NOT allow generic fallback
  return {
    queries: [
      "character driven novel",
      "emotionally intense novel",
      "high stakes story novel",
      "psychological fiction novel",
    ],
    strategy: "fallback-non-generic",
  };
}
  for (const tone of toneFragments.slice(0, 3)) {
    queries.add(`${tone} ${baseGenre}`);
  }

  for (const scenario of scenarioFragments.slice(0, 3)) {
    queries.add(`${scenario} ${baseGenre}`);
  }

  if (toneFragments[0] && scenarioFragments[0]) {
    queries.add(`${toneFragments[0]} ${scenarioFragments[0]} ${baseGenre}`);
  }

  if (toneFragments[1] && scenarioFragments[0]) {
    queries.add(`${toneFragments[1]} ${scenarioFragments[0]} ${baseGenre}`);
  }

  if (genreFragments[1]) {
    queries.add(genreFragments[1]);
    if (scenarioFragments[0]) {
      queries.add(`${scenarioFragments[0]} ${genreFragments[1]}`);
    }
  }

  const finalQueries = Array.from(queries)
    .map((query) => query.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .slice(0, 8);

  return {
    queries: finalQueries,
    strategy: "taste-driven-multi-query",
  };
}
