import type { RecommenderInput } from "./types";
import { extractQuerySignals } from "./tasteToQuerySignals";

function topKeys(bucket: Record<string, number>, n = 2): string[] {
  return Object.entries(bucket)
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([k]) => k);
}

const NEGATIVE_TERMS = "-analysis -guide -summary -criticism -nonfiction -biography -memoir";

export function buildDescriptiveQueriesFromTaste(input: RecommenderInput) {
  const signals = extractQuerySignals(input);

  const tone = topKeys(signals.tone, 1);
  const scenario = topKeys(signals.scenario, 2);
  const genre = topKeys(signals.genre, 1);

  const queries = [
    [...tone, ...scenario, "novel"].join(" "),
    [...scenario, "novel"].join(" "),
    [...genre, ...scenario, "novel"].join(" "),
  ]
    .map(q => `${q} adult fiction ${NEGATIVE_TERMS}`)
    .filter(q => q.length > 10);

  return {
    queries,
    preview: queries[0],
    strategy: "composed-signal-queries",
    signals,
  };
}