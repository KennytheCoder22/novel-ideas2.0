import type { RecommenderInput } from "./types";
import { extractQuerySignals } from "./tasteToQuerySignals";
import { QUERY_TRANSLATIONS } from "./queryTranslations";
import { build20QRungs, rungToPreviewQuery } from "./build20QRungs";
import { buildDescriptiveQueriesFromTaste } from "./buildDescriptiveQueriesFromTaste";

type Family = "thriller_family" | "speculative_family" | "romance_family" | "historical_family" | "general_family";

type HypothesisLike = {
  label?: string;
  query?: string;
  parts?: string[];
  score?: number;
};

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

function filterCompatibleQueries(queries: string[], family: Family): string[] {
  if (family === "general_family") return dedupeQueries(queries);
  return dedupeQueries(queries).filter((query) => isFamilyCompatibleQuery(query, family));
}

function translateSignalBucket(
  keys: string[],
  dictionary: Record<string, readonly string[] | string[]>,
  family: Family
): string[] {
  return filterCompatibleQueries(expand(keys, dictionary), family);
}
function familyForGenres(genreKeys: string[]): Family {
  if (genreKeys.some((key) => ["crime", "mystery", "thriller"].includes(key))) return "thriller_family";
  if (genreKeys.some((key) => ["science fiction", "fantasy", "horror", "dystopian"].includes(key))) return "speculative_family";
  if (genreKeys.includes("romance")) return "romance_family";
  if (genreKeys.includes("historical fiction") || genreKeys.includes("historical")) return "historical_family";
  return "general_family";
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

function familyCompatibleHypotheses(hypotheses: HypothesisLike[], family: Family): HypothesisLike[] {
  return hypotheses.filter((hypothesis) => isFamilyCompatibleQuery(hypothesis.query || "", family));
}

function guaranteedFamilyFallbacks(family: Family): string[] {
  if (family === "speculative_family") return ["epic fantasy novel", "dark fantasy novel", "magic fantasy novel"];
  if (family === "thriller_family") return ["psychological thriller novel", "domestic thriller novel", "mystery thriller novel"];
  if (family === "historical_family") return ["historical fiction novel"];
  if (family === "romance_family") return ["romance novel"];
  return ["fiction novel"];
}

export function buildBucketPlanFromTaste(input: RecommenderInput) {
  const signals = extractQuerySignals(input);
  const descriptive = buildDescriptiveQueriesFromTaste(input);

  const genreKeys = topKeys(signals.genre, 5);
  const toneKeys = topKeys(signals.tone, 4);
  const scenarioKeys = topKeys(signals.scenario, 3);
  const themeKeys = topKeys(signals.theme, 3);

  const family = familyForGenres(genreKeys);

  const translatedGenres = translateSignalBucket(
    genreKeys,
    QUERY_TRANSLATIONS.genre as unknown as Record<string, readonly string[] | string[]>,
    family
  );

  const translatedTones = dedupeQueries(
    expand(
      toneKeys,
      QUERY_TRANSLATIONS.tone as unknown as Record<string, readonly string[] | string[]>
    )
  );

  const translatedScenarios = dedupeQueries([
    ...expand(
      scenarioKeys,
      QUERY_TRANSLATIONS.scenario as unknown as Record<string, readonly string[] | string[]>
    ),
    ...expand(
      themeKeys,
      QUERY_TRANSLATIONS.scenario as unknown as Record<string, readonly string[] | string[]>
    ),
  ]);

  const descriptiveQueries = filterCompatibleQueries(
    dedupeQueries(descriptive.queries || []),
    family
  );

  const descriptiveHypotheses = (descriptive.hypotheses || []) as HypothesisLike[];
  const hypotheses = familyCompatibleHypotheses(descriptiveHypotheses, family);
  const activeHypotheses = hypotheses.length ? hypotheses : descriptiveHypotheses;

  const baseGenre =
    translatedGenres[0] ||
    activeHypotheses[0]?.query ||
    descriptiveQueries[0] ||
    guaranteedFamilyFallbacks(family)[0] ||
    "fiction novel";

  const subgenres = filterCompatibleQueries([
    ...translatedGenres,
    ...descriptiveQueries,
    ...activeHypotheses.map((h) => h.query || "").filter(Boolean),
  ], family).slice(0, 6);

  const rungs = build20QRungs({
    baseGenre,
    subgenres,
    themes: translatedScenarios,
    tones: translatedTones,
    hypotheses: activeHypotheses,
  }, 4);

  const rungQueries = dedupeQueries(rungs.map((r) => rungToPreviewQuery(r)));
  const queries = dedupeQueries([
    ...descriptiveQueries,
    ...rungQueries,
    ...guaranteedFamilyFallbacks(family),
  ]).slice(0, 6);

  return {
    rungs,
    queries,
    preview: queries[0] || descriptive.preview || baseGenre,
    strategy: `20q-signal-bucket-plan:${family}`,
    family,
    hypotheses: activeHypotheses,
  };
}

export default buildBucketPlanFromTaste;
