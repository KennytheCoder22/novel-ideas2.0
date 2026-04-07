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

function primaryGenreFamily(genreKeys: string[]): "thriller_family" | "speculative_family" | "romance_family" | "historical_family" | "literary_family" | "general_family" {
  if (genreKeys.some((key) => ["thriller", "mystery", "crime", "dystopian"].includes(key))) return "thriller_family";
  if (genreKeys.some((key) => ["science fiction", "fantasy", "horror"].includes(key))) return "speculative_family";
  if (genreKeys.includes("romance")) return "romance_family";
  if (genreKeys.includes("historical")) return "historical_family";
  return "literary_family";
}

function inFamilyGenres(genreKeys: string[], family: ReturnType<typeof primaryGenreFamily>): string[] {
  if (family === "thriller_family") return genreKeys.filter((key) => ["thriller", "mystery", "crime", "dystopian"].includes(key));
  if (family === "speculative_family") return genreKeys.filter((key) => ["science fiction", "fantasy", "horror"].includes(key));
  if (family === "romance_family") return genreKeys.filter((key) => key === "romance");
  if (family === "historical_family") return genreKeys.filter((key) => key === "historical");
  return genreKeys;
}

export function buildBucketPlanFromTaste(input: RecommenderInput) {
  const signals = extractQuerySignals(input);

  const genreKeys = topKeys(signals.genre, 4);
  const toneKeys = topKeys(signals.tone, 2);
  const scenarioKeys = topKeys(signals.scenario, 2);

  const family = primaryGenreFamily(genreKeys);
  const lockedGenres = inFamilyGenres(genreKeys, family);
  const genreFragments = expand(lockedGenres.slice(0, 2), QUERY_TRANSLATIONS.genre as Record<string, string[]>);
  const toneFragments = expand(toneKeys, QUERY_TRANSLATIONS.tone as Record<string, string[]>);
  const scenarioFragments = expand(scenarioKeys, QUERY_TRANSLATIONS.scenario as Record<string, string[]>);

  const baseGenre = genreFragments[0];
  if (!baseGenre) {
    return {
      queries: [
        "psychological thriller novel",
        "crime thriller novel",
      ],
      strategy: "family-locked-fallback",
    };
  }

  const queries = new Set<string>();
  queries.add(baseGenre);

  if (family === "thriller_family") {
    if (toneFragments[0]) queries.add(`${toneFragments[0]} ${baseGenre}`);
    if (scenarioFragments[0]) queries.add(`${scenarioFragments[0]} ${baseGenre}`);
    if (genreFragments[1]) queries.add(genreFragments[1]);
  } else {
    if (toneFragments[0]) queries.add(`${toneFragments[0]} ${baseGenre}`);
    if (genreFragments[1]) queries.add(genreFragments[1]);
  }

  return {
    queries: dedupeQueries(Array.from(queries)).slice(0, 3),
    strategy: "taste-driven-family-locked",
  };
}
