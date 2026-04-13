import type { RecommenderInput } from "./types";
import { tasteToQuerySignals as extractQuerySignals, type QuerySignals } from "./tasteToQuerySignals";

type Hypothesis = {
  label: string;
  semanticQuery: string;
  retrievalQuery: string;
  parts: string[];
  score: number;
};

function audiencePhrase(deckKey: RecommenderInput["deckKey"]): string {
  if (deckKey === "adult") return "adult fiction";
  if (deckKey === "ms_hs") return "young adult fiction";
  if (deckKey === "36") return "middle grade fiction";
  return "fiction";
}

function topEntries(bucket: Record<string, number>, n = 3): Array<[string, number]> {
  return Object.entries(bucket)
    .filter(([, score]) => Number.isFinite(score) && score > 0.08)
    .sort((a, b) => b[1] - a[1])
    .slice(0, n);
}

function topKeys(bucket: Record<string, number>, n = 3): string[] {
  return topEntries(bucket, n).map(([key]) => key);
}

function dedupe(values: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();

  for (const value of values) {
    const cleaned = String(value || "").replace(/\s+/g, " ").trim().toLowerCase();
    if (!cleaned || seen.has(cleaned)) continue;
    seen.add(cleaned);
    out.push(cleaned);
  }

  return out;
}

function safeJoin(parts: Array<string | undefined | null>): string {
  return dedupe(parts.filter(Boolean) as string[]).join(" ").trim();
}

function shortQuery(parts: Array<string | undefined | null>): string {
  const cleaned = dedupe(parts.filter(Boolean) as string[]).slice(0, 3);
  return safeJoin([...cleaned, "novel"]);
}

function mapWorldToRetrieval(world?: string): string | undefined {
  if (!world) return undefined;
  if (world === "science fiction") return "science fiction";
  if (world === "dystopian") return "dystopian";
  if (world === "historical") return "historical";
  if (world === "fantasy") return "fantasy";
  if (world === "horror") return "horror";
  if (world === "realistic") return "realistic";
  return world;
}

function mapToneToRetrieval(tone?: string): string | undefined {
  if (!tone) return undefined;
  if (tone === "grounded") return "grounded";
  return tone;
}

function buildHypotheses(signals: QuerySignals): Hypothesis[] {
  const topTone = topKeys(signals.tone, 2);
  const topScenario = topKeys(signals.scenario, 3);
  const topTheme = topKeys(signals.theme, 3);
  const topWorld = topKeys(signals.world, 2);
  const topGenre = topKeys(signals.genre, 2);

  const candidates: Hypothesis[] = [];

  const push = (label: string, parts: string[], score: number) => {
    const cleanParts = dedupe(parts.filter(Boolean));
    if (!cleanParts.length) return;

    const semanticQuery = safeJoin([...cleanParts, "novel"]);
    const retrievalQuery = shortQuery(cleanParts);

    if (!semanticQuery || semanticQuery === "novel") return;
    if (!retrievalQuery || retrievalQuery === "novel") return;

    candidates.push({
      label,
      semanticQuery,
      retrievalQuery,
      parts: cleanParts,
      score,
    });
  };

  push(
    "tone-theme",
    [mapToneToRetrieval(topTone[0]), topTheme[0]],
    1.0
  );

  push(
    "world-theme",
    [mapWorldToRetrieval(topWorld[0]), topTheme[0]],
    0.96
  );

  push(
    "world-scenario",
    [mapWorldToRetrieval(topWorld[0]), topScenario[0]],
    0.92
  );

  push(
    "tone-scenario",
    [mapToneToRetrieval(topTone[0]), topScenario[0]],
    0.88
  );

  push(
    "genre-theme",
    [topGenre[0], topTheme[0]],
    0.78
  );

  push(
    "adjacent-interpretation",
    [mapWorldToRetrieval(topWorld[1]), topTheme[1] || topTheme[0]],
    0.72
  );

  const deduped: Hypothesis[] = [];
  const seen = new Set<string>();

  for (const candidate of candidates.sort((a, b) => b.score - a.score)) {
    const key = candidate.retrievalQuery.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(candidate);
  }

  return deduped;
}

function suppressionTokens(signals: QuerySignals): string[] {
  const anti = [
    ...topKeys(signals.antiGenre, 2),
    ...topKeys(signals.antiWorld, 2),
    ...topKeys(signals.antiTheme, 2),
  ];

  const out: string[] = [];
  if (anti.includes("romance")) out.push("-romance");
  if (anti.includes("historical")) out.push("-historical");
  if (anti.includes("fantasy")) out.push("-fantasy");
  if (anti.includes("horror")) out.push("-horror");
  return out;
}

function fallbackQueries(signals: QuerySignals): string[] {
  const scenario = topKeys(signals.scenario, 2);
  const world = topKeys(signals.world, 2);
  const tone = topKeys(signals.tone, 1);
  const theme = topKeys(signals.theme, 2);

  return dedupe([
    shortQuery([mapToneToRetrieval(tone[0]), topTheme(theme, 0)]),
    shortQuery([mapWorldToRetrieval(world[0]), topTheme(theme, 0)]),
    shortQuery([mapWorldToRetrieval(world[0]), scenario[0]]),
    shortQuery([mapToneToRetrieval(tone[0]), scenario[0]]),
  ]).filter((q) => q && q !== "novel");

  function topTheme(values: string[], idx: number) {
    return values[idx];
  }
}

export function buildDescriptiveQueriesFromTaste(input: RecommenderInput) {
  const audience = audiencePhrase(input.deckKey);
  const signals = extractQuerySignals(input);
  const hypotheses = buildHypotheses(signals);
  const suppressions = suppressionTokens(signals);

  const queries = dedupe(
    (hypotheses.length ? hypotheses.map((h) => h.retrievalQuery) : fallbackQueries(signals))
      .map((q) => safeJoin([q, ...suppressions]))
  );

  return {
    queries,
    preview: queries[0] || "",
    strategy: "20q-short-hypothesis-composer",
    signals: {
      genres: topKeys(signals.genre, 3),
      tones: topKeys(signals.tone, 3),
      textures: topKeys(signals.world, 3),
      scenarios: [
        ...topKeys(signals.scenario, 3),
        ...topKeys(signals.theme, 2),
      ].slice(0, 5),
    },
    audience,
    hypotheses: hypotheses.slice(0, 5).map((h) => ({
      label: h.label,
      semanticQuery: h.semanticQuery,
      query: h.retrievalQuery,
      parts: h.parts,
      score: h.score,
    })),
  };
}

export default buildDescriptiveQueriesFromTaste;