import type { RecommenderInput } from "./types";
import { extractQuerySignals } from "./tasteToQuerySignals";
import { QUERY_TRANSLATIONS } from "./queryTranslations";
import { build20QRungs, rungToPreviewQuery } from "./build20QRungs";

type Family = "thriller_family" | "speculative_family" | "romance_family" | "historical_family" | "general_family";

const THRILLER_DRIFT_TERMS = /\b(romance|romantic|fantasy romance|paranormal romance|urban romance|fantasy|magical|magic|witch|dragon|demon|fae|fairy|vampire|werewolf|shifter|office romance)\b/i;
const THRILLER_CORE_TERMS = /\b(crime|mystery|thriller|detective|psychological thriller|investigation|noir|procedural|serial killer|domestic thriller)\b/i;

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
  if (family === "thriller_family") return ["dark crime thriller novel", "dark psychological thriller novel", "dark mystery thriller novel"];
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
    if (THRILLER_DRIFT_TERMS.test(q)) return false;
    return THRILLER_CORE_TERMS.test(q);
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

function tightenThrillerGenreFragments(queries: string[]): string[] {
  const tightened = queries
    .map((query) => String(query || "").replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .filter((query) => !THRILLER_DRIFT_TERMS.test(query))
    .map((query) => {
      const lower = query.toLowerCase();
      const withoutSuspense = lower.replace(/\bsuspense\b/g, "").trim();
      if (/\bsuspense\b/.test(lower) && !THRILLER_CORE_TERMS.test(withoutSuspense)) {
        return "dark mystery thriller novel";
      }
      if (/\bsurvival thriller\b/.test(lower)) {
        return "dark mystery thriller novel";
      }
      return query;
    });

  return dedupeQueries([
    ...tightened,
    "dark crime thriller novel",
    "dark psychological thriller novel",
    "dark mystery thriller novel",
  ]);
}

function mainstreamHarvestQueries(
  family: Family,
  deckKey: RecommenderInput["deckKey"],
  genreFragments: string[]
): string[] {
  const ageBand = ageBandForDeck(deckKey);

  const withAudience = (q: string) =>
    ageBand === "teen" ? `young adult ${q}` : q;

  const dominant = (genreFragments[0] || "").toLowerCase().trim();

  if (family === "thriller_family") {
    const subtype = dominant || "dark psychological thriller novel";
    return dedupeQueries([
      withAudience(`bestselling ${subtype}`),
      withAudience(`popular ${subtype}`),
      withAudience(`top rated ${subtype}`),
      withAudience(`famous ${subtype} books`),
    ]);
  }

  if (family === "speculative_family") {
    const subtype = dominant || "science fiction novel";
    return dedupeQueries([
      withAudience(`bestselling ${subtype}`),
      withAudience(`popular ${subtype}`),
      withAudience(`famous ${subtype} books`),
    ]);
  }

  if (family === "romance_family") {
    const subtype = dominant || "romance novel";
    return dedupeQueries([
      withAudience(`bestselling ${subtype}`),
      withAudience(`popular ${subtype}`),
      withAudience(`famous ${subtype} books`),
    ]);
  }

  if (family === "historical_family") {
    const subtype = dominant || "historical fiction novel";
    return dedupeQueries([
      withAudience(`bestselling ${subtype}`),
      withAudience(`popular ${subtype}`),
      withAudience(`famous ${subtype} books`),
    ]);
  }

  const subtype = dominant || "fiction novel";
  return dedupeQueries([
    withAudience(`bestselling ${subtype}`),
    withAudience(`famous ${subtype} books`),
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

  const translatedGenresRaw = expand(softGenreKeys, QUERY_TRANSLATIONS.genre as unknown as Record<string, readonly string[] | string[]>);
  const translatedGenres = filterGenresToFamily(translatedGenresRaw, family);
  const translatedTones = expand(toneKeys, QUERY_TRANSLATIONS.tone as unknown as Record<string, readonly string[] | string[]>);
  const translatedScenarios = expand(scenarioKeys, QUERY_TRANSLATIONS.scenario as unknown as Record<string, readonly string[] | string[]>);
  const translatedPacing = expand(pacingKeys, (QUERY_TRANSLATIONS as any).pacing || {});

  const rawGenreFragments = dedupeQueries([
    ...translatedGenres,
    ...familyDefaults(family),
  ]).filter((query) => isFamilyCompatibleQuery(query, family));

  const genreFragments = family === "thriller_family"
    ? tightenThrillerGenreFragments(rawGenreFragments)
    : rawGenreFragments;

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
