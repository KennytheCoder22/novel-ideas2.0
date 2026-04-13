import type { RecommenderInput } from "./types";
import { extractQuerySignals } from "./tasteToQuerySignals";
import { QUERY_TRANSLATIONS } from "./queryTranslations";
import { build20QRungs, rungToPreviewQuery } from "./build20QRungs";

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

// NEW: derive neutral axes instead of genre families
function deriveAxes(signals: any) {
  const sum = (obj: Record<string, number> = {}, keys: string[]) =>
    keys.reduce((s, k) => s + (obj[k] || 0), 0);

  return {
    darkness: sum(signals.tone, ["dark", "bleak", "grim"]),
    pacing: sum(signals.pacing, ["fast", "kinetic", "action", "thriller"]),
    ideaDensity: sum(signals.genre, ["science fiction", "philosophical"]),
    realism: sum(signals.genre, ["realistic", "historical"]),
    intimacy: sum(signals.tone, ["character", "relationship"]),
  };
}

// NEW: build neutral base queries
function buildAxisQueries(axes: any, ageBand: string): string[] {
  const withAudience = (q: string) =>
    ageBand === "teen" ? `young adult ${q}` : q;

  const queries = [
    axes.darkness > 0 ? "dark novel" : null,
    axes.pacing > 0 ? "fast paced novel" : null,
    axes.ideaDensity > 0 ? "thought provoking novel" : null,
    axes.realism > 0 ? "realistic fiction novel" : null,
    axes.realism < -0.2 ? "speculative fiction novel" : null,
    axes.intimacy > 0 ? "character driven novel" : null,
  ].filter(Boolean) as string[];

  return dedupeQueries(queries.map(withAudience));
}

export function buildBucketPlanFromTaste(input: RecommenderInput) {
  const signals = extractQuerySignals(input);

  const genreKeys = topKeys(signals.genre, 5);
  const toneKeys = topKeys(signals.tone, 4);
  const scenarioKeys = topKeys(signals.scenario, 3);
  const pacingKeys = topKeys(signals.pacing || {}, 2);

  const translatedGenres = expand(genreKeys, QUERY_TRANSLATIONS.genre as any);
  const translatedTones = expand(toneKeys, QUERY_TRANSLATIONS.tone as any);
  const translatedScenarios = expand(scenarioKeys, QUERY_TRANSLATIONS.scenario as any);
  const translatedPacing = expand(pacingKeys, (QUERY_TRANSLATIONS as any).pacing || {});

  const axes = deriveAxes(signals);

  const ageBand = ageBandForDeck(input.deckKey);

  // NEW: axis-driven queries
  const axisQueries = buildAxisQueries(axes, ageBand);

  // keep translated fragments (but do NOT filter by genre family)
  const fragments = dedupeQueries([
    ...translatedGenres,
    ...translatedTones,
    ...translatedScenarios,
  ]);

  const baseQuery = axisQueries[0] || fragments[0] || "novel";

  const rungs = build20QRungs(
    {
      ageBand,
      baseGenre: baseQuery,
      subgenres: fragments,
      themes: translatedScenarios,
      tones: translatedTones,
      pacing: translatedPacing,
      structures: [],
      settings: [],
      exclusions: [],
    },
    4
  );

  const rungQueries = dedupeQueries(rungs.map((r) => rungToPreviewQuery(r)));

  const queries = dedupeQueries([
    ...axisQueries,
    ...rungQueries,
  ]).slice(0, 6);

  return {
    rungs,
    queries,
    preview: rungQueries[0] || queries[0] || "",
    strategy: "20q-neutral-axis",
  };
}