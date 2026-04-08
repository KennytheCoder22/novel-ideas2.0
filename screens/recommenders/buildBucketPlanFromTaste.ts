import type { RecommenderInput } from "./types";
import { extractQuerySignals } from "./tasteToQuerySignals";
import { QUERY_TRANSLATIONS } from "./queryTranslations";
import { build20QRungs } from "./build20QRungs";

type Family =
  | "thriller_family"
  | "speculative_family"
  | "romance_family"
  | "historical_family"
  | "general_family";

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
    if (!cleaned) continue;
    const key = cleaned.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(cleaned);
  }
  return out;
}

function ageBandForDeck(deckKey: RecommenderInput["deckKey"]): string {
  if (deckKey === "adult") return "adult";
  if (deckKey === "ms_hs") return "teen";
  if (deckKey === "36") return "pre-teen";
  return "kids";
}

function familyForGenres(genreKeys: string[]): Family {
  if (genreKeys.some((key) => ["thriller", "mystery", "crime", "dystopian"].includes(key))) {
    return "thriller_family";
  }
  if (genreKeys.some((key) => ["science fiction", "fantasy", "horror"].includes(key))) {
    return "speculative_family";
  }
  if (genreKeys.includes("romance")) return "romance_family";
  if (genreKeys.includes("historical fiction") || genreKeys.includes("historical")) {
    return "historical_family";
  }
  return "general_family";
}

function lockGenresToFamily(genreKeys: string[], family: Family): string[] {
  if (family === "thriller_family") {
    return genreKeys.filter((key) => ["thriller", "mystery", "crime", "dystopian"].includes(key));
  }
  if (family === "speculative_family") {
    return genreKeys.filter((key) => ["science fiction", "fantasy", "horror"].includes(key));
  }
  if (family === "romance_family") {
    return genreKeys.filter((key) => key === "romance");
  }
  if (family === "historical_family") {
    return genreKeys.filter((key) => key === "historical fiction" || key === "historical");
  }
  return genreKeys;
}

function themesForFamily(scenarioKeys: string[], family: Family): string[] {
  if (family === "thriller_family") {
    return scenarioKeys.filter((key) => ["investigation", "crime", "survival", "betrayal"].includes(key));
  }
  if (family === "speculative_family") {
    return scenarioKeys.filter((key) => ["survival", "quest", "war", "mythic"].includes(key));
  }
  if (family === "historical_family") {
    return scenarioKeys.filter((key) => ["war", "family", "betrayal"].includes(key));
  }
  return scenarioKeys;
}

export function buildBucketPlanFromTaste(input: RecommenderInput) {
  const signals = extractQuerySignals(input);

  const genreKeys = topKeys(signals.genre, 4);
  const toneKeys = topKeys(signals.tone, 2);
  const scenarioKeys = topKeys(signals.scenario, 2);

  const family = familyForGenres(genreKeys);
  const lockedGenreKeys = lockGenresToFamily(genreKeys, family);
  const lockedThemeKeys = themesForFamily(scenarioKeys, family);

  const genreFragments = expand(
    lockedGenreKeys.slice(0, 2),
    QUERY_TRANSLATIONS.genre as Record<string, string[]>
  );
  const toneFragments = expand(
    toneKeys,
    QUERY_TRANSLATIONS.tone as Record<string, string[]>
  );
  const scenarioFragments = expand(
    lockedThemeKeys,
    QUERY_TRANSLATIONS.scenario as Record<string, string[]>
  );

  const baseGenre = genreFragments[0] || "novel";

  const intent = {
    ageBand: ageBandForDeck(input.deckKey),
    baseGenre,
    subgenres: genreFragments,
    themes: scenarioFragments,
    tones: toneFragments,
    pacing: [],
    structures: [],
    settings: [],
    exclusions: [],
  };

  const rungs = build20QRungs(intent, 4);
  const queries = dedupeQueries(rungs.map((r) => r.query));

  return {
    queries,
    preview: queries[0] || "",
    strategy: `20q-rung-builder:${family}`,
  };
}
