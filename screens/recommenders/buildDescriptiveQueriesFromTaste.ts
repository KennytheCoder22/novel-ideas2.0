import type { RecommenderInput } from "./types";
import { tasteToQuerySignals as extractQuerySignals, type QuerySignals } from "./tasteToQuerySignals";

type Hypothesis = {
  label: string;
  query: string;
  parts: string[];
  score: number;
};

const NEGATIVE_TERMS = [
  "-analysis",
  "-guide",
  "-summary",
  "-criticism",
  "-literature",
  "-magazine",
  "-journal",
  "-catalog",
  "-catalogue",
  "-reference",
  "-companion",
  "-study",
  "-workbook",
  "-textbook",
  "-manual",
  "-encyclopedia",
  "-anthology",
  "-collection",
  "-essays",
  "-nonfiction",
  "-biography",
  "-memoir",
].join(" ");

function audiencePhrase(deckKey: RecommenderInput["deckKey"]): string {
  if (deckKey === "adult") return "adult fiction";
  if (deckKey === "ms_hs") return "young adult fiction";
  if (deckKey === "36") return "middle grade fiction";
  return "fiction";
}

function topEntries(bucket: Record<string, number>, n = 3): Array<[string, number]> {
  return Object.entries(bucket)
    .filter(([, score]) => Number.isFinite(score) && score > 0.05)
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
    const query = safeJoin([...cleanParts, "novel"]);
    if (!query || query === "novel") return;
    candidates.push({ label, query, parts: cleanParts, score });
  };

  push(
    "primary-composite",
    [
      mapToneToRetrieval(topTone[0]),
      mapWorldToRetrieval(topWorld[0]),
      topScenario[0],
    ],
    1.0
  );

  push(
    "scenario-theme",
    [
      topScenario[0],
      topTheme[0],
      mapWorldToRetrieval(topWorld[0]),
    ],
    0.92
  );

  push(
    "world-scenario",
    [
      mapWorldToRetrieval(topWorld[0]),
      topScenario[0],
      topScenario[1],
    ],
    0.9
  );

  push(
    "genre-scenario",
    [
      topGenre[0],
      topScenario[0],
      topTheme[0],
    ],
    0.84
  );

  push(
    "adjacent-interpretation",
    [
      mapToneToRetrieval(topTone[0]),
      mapWorldToRetrieval(topWorld[1]),
      topTheme[1] || topTheme[0],
    ],
    0.76
  );

  push(
    "secondary-composite",
    [
      mapToneToRetrieval(topTone[1] || topTone[0]),
      topScenario[1] || topScenario[0],
      topTheme[1] || topTheme[0],
    ],
    0.72
  );

  const deduped: Hypothesis[] = [];
  const seen = new Set<string>();

  for (const candidate of candidates.sort((a, b) => b.score - a.score)) {
    const key = candidate.query.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(candidate);
  }

  return deduped;
}

function applySuppression(query: string, signals: QuerySignals): string {
  const anti = [
    ...topKeys(signals.antiGenre, 2),
    ...topKeys(signals.antiWorld, 2),
    ...topKeys(signals.antiTheme, 2),
  ];

  const suppressions: string[] = [];

  if (anti.includes("romance")) suppressions.push("-romance");
  if (anti.includes("historical")) suppressions.push("-historical");
  if (anti.includes("fantasy")) suppressions.push("-fantasy");
  if (anti.includes("horror")) suppressions.push("-horror");

  return safeJoin([query, ...suppressions, NEGATIVE_TERMS]);
}

function fallbackQueries(signals: QuerySignals, audience: string): string[] {
  const scenario = topKeys(signals.scenario, 2);
  const world = topKeys(signals.world, 2);
  const tone = topKeys(signals.tone, 1);

  const base = [
    safeJoin([mapToneToRetrieval(tone[0]), mapWorldToRetrieval(world[0]), scenario[0], "novel"]),
    safeJoin([mapWorldToRetrieval(world[0]), scenario[0], "novel"]),
    safeJoin([scenario[0], scenario[1], "novel"]),
  ].filter(Boolean);

  return dedupe(
    base.map((q) => safeJoin([q, audience, NEGATIVE_TERMS]))
  ).filter((q) => q && q !== "novel");
}

export function buildDescriptiveQueriesFromTaste(input: RecommenderInput) {
  const audience = audiencePhrase(input.deckKey);
  const signals = extractQuerySignals(input);
  const hypotheses = buildHypotheses(signals);

  const hypothesisQueries = hypotheses
    .slice(0, 5)
    .map((h) => safeJoin([applySuppression(h.query, signals), audience]));

  const queries = dedupe(hypothesisQueries.length ? hypothesisQueries : fallbackQueries(signals, audience));

  return {
    queries,
    preview: queries[0] || "",
    strategy: "20q-hypothesis-composer",
    signals: {
      genres: topKeys(signals.genre, 3),
      tones: topKeys(signals.tone, 3),
      textures: topKeys(signals.world, 3),
      scenarios: [
        ...topKeys(signals.scenario, 3),
        ...topKeys(signals.theme, 2),
      ].slice(0, 5),
    },
    hypotheses: hypotheses.slice(0, 5).map((h) => ({
      label: h.label,
      query: h.query,
      parts: h.parts,
      score: h.score,
    })),
  };
}

export default buildDescriptiveQueriesFromTaste;