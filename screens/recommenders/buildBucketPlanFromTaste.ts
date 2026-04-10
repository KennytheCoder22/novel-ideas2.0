import type { RecommenderInput } from "./types";
import { extractQuerySignals } from "./tasteToQuerySignals";
import { QUERY_TRANSLATIONS } from "./queryTranslations";
import { build20QRungs, rungToPreviewQuery } from "./build20QRungs";

type Family = "thriller_family" | "speculative_family" | "romance_family" | "historical_family" | "general_family";

function topKeys(obj: Record<string, number>, limit: number): string[] {
  return Object.entries(obj)
    .filter(([, score]) => score > 0.05)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit || 3)
    .map(([key]) => key);
}
function expand(keys: string[], dictionary: Record<string, readonly string[] | string[]>): string[] {
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
  if (genreKeys.some((key) => ["crime", "mystery", "thriller", "dystopian"].includes(key))) return "thriller_family";
  if (genreKeys.some((key) => ["science fiction", "fantasy", "horror"].includes(key))) return "speculative_family";
  if (genreKeys.includes("romance")) return "romance_family";
  if (genreKeys.includes("historical fiction") || genreKeys.includes("historical")) return "historical_family";
  return "general_family";
}
function familyDefaults(family: Family): string[] {
  if (family === "thriller_family") return ["crime thriller novel", "detective mystery novel", "mystery thriller novel"];
  if (family === "speculative_family") return ["science fiction novel", "fantasy novel", "horror novel"];
  if (family === "romance_family") return ["romance novel"];
  if (family === "historical_family") return ["historical fiction novel"];
  return ["fiction novel"];
}
function softFamilyGenres(genreKeys: string[], family: Family): string[] {
  const primaryOrder = family === "thriller_family"
    ? ["crime", "mystery", "thriller", "dystopian"]
    : family === "speculative_family"
    ? ["science fiction", "fantasy", "horror"]
    : family === "romance_family"
    ? ["romance"]
    : family === "historical_family"
    ? ["historical fiction", "historical"]
    : [];

  const prioritized = primaryOrder.filter((key) => genreKeys.includes(key));
  const adjacent = genreKeys.filter((key) => !prioritized.includes(key));
  return [...prioritized, ...adjacent].slice(0, 4);
}
function isFamilyCompatibleQuery(query: string, family: Family): boolean {
  const q = String(query || "").toLowerCase();
  if (!q) return false;

  if (family === "thriller_family") {
    if (/\bscience fiction\b|\bfantasy\b|\bhorror\b|\bromance\b|\bhistorical fiction\b/.test(q)) return false;
    return /\bcrime\b|\bmystery\b|\bthriller\b|\bdetective\b|\bsuspense\b/.test(q);
  }
  if (family === "speculative_family") {
    if (/\bcrime thriller\b|\bdetective mystery\b|\bmystery thriller\b/.test(q)) return false;
    return /\bscience fiction\b|\bfantasy\b|\bhorror\b/.test(q);
  }
  if (family === "romance_family") return /\bromance\b/.test(q);
  if (family === "historical_family") return /\bhistorical\b/.test(q);
  return true;
}
function filterGenresToFamily(queries: string[], family: Family): string[] {
  return queries.filter((query) => isFamilyCompatibleQuery(query, family));
}

function mainstreamHarvestQueries(
  family: Family,
  deckKey: RecommenderInput["deckKey"],
  genreFragments: string[]
): string[] {
  const ageBand = ageBandForDeck(deckKey);

  const withAudience = (q: string) =>
    ageBand === "teen" ? `young adult ${q}` : q;

  if (family === "thriller_family") {
    return dedupeQueries([
      withAudience("bestselling psychological thriller novel"),
      withAudience("popular crime thriller novel"),
      withAudience("top rated mystery thriller novel"),
    ]);
  }

  if (family === "speculative_family") {
    return dedupeQueries([
      withAudience("bestselling science fiction novel"),
      withAudience("popular fantasy novel"),
    ]);
  }

  if (family === "romance_family") {
    return dedupeQueries([
      withAudience("bestselling romance novel"),
      withAudience("popular contemporary romance novel"),
    ]);
  }

  if (family === "historical_family") {
    return dedupeQueries([
      withAudience("bestselling historical fiction novel"),
      withAudience("popular historical fiction novel"),
    ]);
  }

  return dedupeQueries([
    withAudience("bestselling fiction novel"),
  ]);
}


export function buildBucketPlanFromTaste(input: RecommenderInput) {
  const signals = extractQuerySignals(input);
  const genreKeys = topKeys(signals.genre, 5);
  const toneKeys = topKeys(signals.tone, 4);
  const scenarioKeys = topKeys(signals.scenario, 3);
  const pacingKeys = topKeys(signals.pacing || {}, 2);

  const family = familyForGenres(genreKeys);
  const softGenreKeys = softFamilyGenres(genreKeys, family);

  const translatedGenresRaw = expand(softGenreKeys, QUERY_TRANSLATIONS.genre as Record<string, string[]>);
  const translatedGenres = filterGenresToFamily(translatedGenresRaw, family);
  const translatedTones = expand(toneKeys, QUERY_TRANSLATIONS.tone as Record<string, string[]>);
  const translatedScenarios = expand(scenarioKeys, QUERY_TRANSLATIONS.scenario as Record<string, string[]>);
  const translatedPacing = expand(pacingKeys, (QUERY_TRANSLATIONS as any).pacing || {});

  const genreFragments = dedupeQueries([
    ...translatedGenres,
    ...familyDefaults(family),
  ]).filter((query) => isFamilyCompatibleQuery(query, family));

  const baseGenre = genreFragments[0] || familyDefaults(family)[0] || "fiction novel";

  const rungs = build20QRungs({
    ageBand: ageBandForDeck(input.deckKey),
    family,
    baseGenre,
    subgenres: genreFragments,
    themes: translatedScenarios,
    tones: translatedTones,
    pacing: translatedPacing,
    structures: [],
    settings: [],
    exclusions: [],
  }, 4);

  const rungQueries = dedupeQueries(rungs.map((r) => rungToPreviewQuery(r)));
  const harvestQueries = mainstreamHarvestQueries(family, input.deckKey, genreFragments);
  const queries = dedupeQueries([
    ...harvestQueries,
    ...rungQueries,
  ]).slice(0, 6);

  return { rungs, queries, preview: queries[0] || "", strategy: `20q-mature-fetch:${family}:mainstream-harvest` };
}
