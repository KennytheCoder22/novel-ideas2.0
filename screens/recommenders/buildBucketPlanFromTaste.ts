import type { RecommenderInput } from "./types";
import { extractQuerySignals } from "./tasteToQuerySignals";
import { QUERY_TRANSLATIONS } from "./queryTranslations";
import { build20QRungs } from "./build20QRungs";

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

function dedupeQueries(queries: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const query of queries) {
    const cleaned = String(query || "").replace(/\s+/g, " ").trim();
    if (!cleaned || seen.has(cleaned)) continue;
    seen.add(cleaned);
    out.push(cleaned);
  }
  return out;
}

export function buildBucketPlanFromTaste(input: RecommenderInput) {
  const signals = extractQuerySignals(input);

  const genreKeys = topKeys(signals.genre, 4);
  const toneKeys = topKeys(signals.tone, 2);
  const scenarioKeys = topKeys(signals.scenario, 2);

  const genreFragments = expand(genreKeys.slice(0, 2), QUERY_TRANSLATIONS.genre as Record<string, string[]>);
  const toneFragments = expand(toneKeys, QUERY_TRANSLATIONS.tone as Record<string, string[]>);
  const scenarioFragments = expand(scenarioKeys, QUERY_TRANSLATIONS.scenario as Record<string, string[]>);

  const baseGenre = genreFragments[0];

  const intent = {
    ageBand: input.ageBand ?? "adult",
    baseGenre: baseGenre,
    subgenres: genreFragments,
    themes: scenarioFragments,
    tones: toneFragments,
    pacing: [],
    structures: [],
    settings: [],
    exclusions: [],
  };

  const rungs = build20QRungs(intent, 4);

  return {
    queries: dedupeQueries(rungs.map(r => r.query)),
    strategy: "20q-rung-builder",
  };
}
