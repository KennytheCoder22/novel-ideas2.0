import type { RecommenderInput } from "./types";
import { tasteToQuerySignals as extractQuerySignals, type QuerySignals } from "./tasteToQuerySignals";

type Hypothesis = {
  label: string;
  query: string;
  parts: string[];
  score: number;
};

type SignalDomain = "genre" | "tone" | "scenario" | "theme" | "world";

type SignalCandidate = {
  key: string;
  score: number;
  domain: SignalDomain;
};

const GENERIC_TERMS = new Set([
  "thriller",
  "crime",
  "mystery",
  "drama",
  "dark",
  "grounded",
  "realistic",
]);

const DISTINCTIVE_TERMS = new Set([
  "identity",
  "science fiction",
  "technology",
  "psychological",
  "investigation",
  "crime investigation",
  "survival",
  "dystopian",
  "historical",
  "betrayal",
  "redemption",
  "social commentary",
  "authority",
  "family conflict",
]);

const BANNED_PRIMARY_SCENARIOS = new Set([
  "collapse",
  "societal collapse",
  "governmental collapse",
]);

const NARRATIVE_ANCHORS = new Set([
  "identity",
  "science fiction",
  "technology",
  "crime investigation",
  "investigation",
  "survival",
  "psychological",
  "dystopian",
]);

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

function topEntries(bucket: Record<string, number>, n = 4): Array<[string, number]> {
  return Object.entries(bucket)
    .filter(([, score]) => Number.isFinite(score) && score > 0.05)
    .sort((a, b) => b[1] - a[1])
    .slice(0, n);
}

function topKeys(bucket: Record<string, number>, n = 4): string[] {
  return topEntries(bucket, n).map(([key]) => key);
}

function domainEntries(signals: QuerySignals, domain: SignalDomain, n = 4): SignalCandidate[] {
  return topEntries(signals[domain], n).map(([key, score]) => ({ key, score, domain }));
}

function normalizeForQuery(part?: string): string | undefined {
  if (!part) return undefined;
  if (part === "realistic") return "grounded";
  if (part === "crime") return "crime investigation";
  if (part === "institutional") return "governmental";
  if (part === "societal collapse" || part === "governmental collapse" || part === "collapse") return undefined;
  return part;
}

function isGeneric(key?: string): boolean {
  return !!key && GENERIC_TERMS.has(key);
}

function isDistinctive(key?: string): boolean {
  return !!key && DISTINCTIVE_TERMS.has(key);
}

function hasNarrativeAnchor(parts: string[]): boolean {
  return parts.some((part) => NARRATIVE_ANCHORS.has(part));
}




function antiPenalty(parts: string[], signals: QuerySignals): number {
  let penalty = 0;
  const antiLookup: Partial<Record<SignalDomain, keyof QuerySignals>> = {
    genre: "antiGenre",
    tone: "antiTone",
    scenario: "antiScenario",
    theme: "antiTheme",
    world: "antiWorld",
  };

  for (const part of parts) {
    for (const domain of Object.keys(antiLookup) as SignalDomain[]) {
      const antiBucketName = antiLookup[domain];
      if (!antiBucketName) continue;
      penalty += (signals[antiBucketName][part] || 0) * 0.5;
    }
  }

  return penalty;
}

function cleanParts(parts: Array<string | undefined | null>): string[] {
  return dedupe(parts.map(normalizeForQuery).filter(Boolean) as string[]);
}

function looksTooGeneric(parts: string[]): boolean {
  if (parts.length < 2) return true;
  if (parts.every((part) => isGeneric(part))) return true;
  const joined = safeJoin(parts);
  if (joined === "dark crime") return true;
  if (joined === "dark mystery") return true;
  if (joined === "crime thriller") return true;
  return false;
}

function bannedScenarioLeak(parts: string[], rawSources: SignalCandidate[]): boolean {
  const rawScenarioKeys = rawSources.filter((s) => s.domain === "scenario").map((s) => s.key);
  const onlyCollapseScenario =
    rawScenarioKeys.length > 0 &&
    rawScenarioKeys.every((key) => BANNED_PRIMARY_SCENARIOS.has(key));

  return onlyCollapseScenario && !hasNarrativeAnchor(parts);
}

function scoreCluster(parts: string[], sources: SignalCandidate[], signals: QuerySignals): number {
  const sourceWeight = sources.reduce((sum, item) => sum + item.score, 0);
  const domainCount = new Set(sources.map((item) => item.domain)).size;
  const anti = antiPenalty(parts, signals);
  const domainBonus = domainCount >= 3 ? 0.3 : domainCount === 2 ? 0.1 : 0;
  const anchorPenalty = hasNarrativeAnchor(parts) ? 0 : 0.7;
  return sourceWeight + domainBonus - anti - anchorPenalty;
}

function addCandidate(
  bag: Hypothesis[],
  label: string,
  partsInput: Array<string | undefined | null>,
  rawSources: SignalCandidate[],
  signals: QuerySignals,
  scoreBias = 0
) {
  const parts = cleanParts(partsInput);
  if (parts.length < 2) return;
  if (!hasNarrativeAnchor(parts) && !parts.includes("historical")) return;
  if (looksTooGeneric(parts) && !parts.some((p) => isDistinctive(p))) return;
  if (bannedScenarioLeak(parts, rawSources)) return;

  const query = safeJoin([...parts, "novel"]);
  if (!query || query === "novel") return;

  const score = scoreCluster(parts, rawSources, signals) + scoreBias;
  bag.push({ label, query, parts, score });
}

function buildHypotheses(signals: QuerySignals): Hypothesis[] {
  const tones = domainEntries(signals, "tone", 4);
  const scenarios = domainEntries(signals, "scenario", 5);
  const themes = domainEntries(signals, "theme", 5);
  const worlds = domainEntries(signals, "world", 4);
  const genres = domainEntries(signals, "genre", 4);

  const topTone = tones[0]?.key;
  const secondTone = tones[1]?.key;
  const topTheme = themes[0]?.key;
  const secondTheme = themes[1]?.key;
  const thirdTheme = themes[2]?.key;
  const topWorld = worlds[0]?.key;
  const secondWorld = worlds[1]?.key;
  const topGenre = genres[0]?.key;
  const secondGenre = genres[1]?.key;
  const topScenario = scenarios.find((s) => !BANNED_PRIMARY_SCENARIOS.has(s.key))?.key;
  const secondScenario = scenarios.filter((s) => !BANNED_PRIMARY_SCENARIOS.has(s.key))[1]?.key;

  const candidates: Hypothesis[] = [];

  addCandidate(
    candidates,
    "identity-sf-core",
    [topTone, topTheme, topWorld],
    [tones[0], themes[0], worlds[0]].filter(Boolean) as SignalCandidate[],
    signals,
    0.55
  );

  addCandidate(
    candidates,
    "crime-investigation-core",
    [topTone, topGenre, topTheme],
    [tones[0], genres[0], themes[0]].filter(Boolean) as SignalCandidate[],
    signals,
    0.3
  );

  addCandidate(
    candidates,
    "dystopian-survival-core",
    [topTone, topWorld, topTheme],
    [tones[0], worlds[0], themes[0]].filter(Boolean) as SignalCandidate[],
    signals,
    0.28
  );

  addCandidate(
    candidates,
    "theme-world-secondary",
    [secondTone || topTone, secondTheme || topTheme, secondWorld || topWorld],
    [tones[1] || tones[0], themes[1] || themes[0], worlds[1] || worlds[0]].filter(Boolean) as SignalCandidate[],
    signals,
    0.12
  );

  addCandidate(
    candidates,
    "theme-scenario-secondary",
    [topTone, secondTheme || topTheme, topScenario],
    [tones[0], themes[1] || themes[0], scenarios.find((s) => s.key === topScenario)].filter(Boolean) as SignalCandidate[],
    signals,
    0.08
  );

  addCandidate(
    candidates,
    "genre-world-bridge",
    [topGenre, topWorld, thirdTheme || secondTheme || topTheme],
    [genres[0], worlds[0], themes[2] || themes[1] || themes[0]].filter(Boolean) as SignalCandidate[],
    signals,
    0.06
  );

  addCandidate(
    candidates,
    "secondary-lane",
    [secondGenre || topGenre, secondTheme || topTheme, secondScenario || topScenario],
    [genres[1] || genres[0], themes[1] || themes[0], scenarios.find((s) => s.key === (secondScenario || topScenario))].filter(Boolean) as SignalCandidate[],
    signals,
    0.04
  );

  const deduped: Hypothesis[] = [];
  const seen = new Set<string>();
  for (const candidate of candidates.sort((a, b) => b.score - a.score)) {
    const key = candidate.query.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(candidate);
  }

  const diversified: Hypothesis[] = [];
  const coveredAnchors = new Set<string>();
  for (const candidate of deduped) {
    const anchor =
      candidate.parts.find((part) => NARRATIVE_ANCHORS.has(part)) ||
      candidate.parts[0];
    if (coveredAnchors.has(anchor) && diversified.length >= 3) continue;
    coveredAnchors.add(anchor);
    diversified.push(candidate);
    if (diversified.length >= 5) break;
  }

  return diversified.length ? diversified : deduped.slice(0, 5);
}

function lightweightSuppressions(signals: QuerySignals): string[] {
  const anti = [
    ...topKeys(signals.antiGenre, 2),
    ...topKeys(signals.antiWorld, 2),
    ...topKeys(signals.antiTheme, 2),
  ];

  const suppressions: string[] = [];
  if (anti.includes("romance")) suppressions.push("-romance");
  if (anti.includes("fantasy")) suppressions.push("-fantasy");
  if (anti.includes("historical")) suppressions.push("-historical");
  return suppressions;
}

function compactQuery(baseQuery: string, signals: QuerySignals): string {
  return safeJoin([baseQuery, ...lightweightSuppressions(signals)]);
}

function fallbackQueries(signals: QuerySignals): string[] {
  const tone = topKeys(signals.tone, 2);
  const theme = topKeys(signals.theme, 2);
  const world = topKeys(signals.world, 2);

  const base = [
    safeJoin([tone[0], theme[0], world[0], "novel"]),
    safeJoin([tone[0], theme[0], "novel"]),
  ].filter(Boolean);

  return dedupe(base);
}

export function buildDescriptiveQueriesFromTaste(input: RecommenderInput) {
  const signals = extractQuerySignals(input);
  const hypotheses = buildHypotheses(signals);
  const hypothesisQueries = hypotheses.slice(0, 5).map((h) => compactQuery(h.query, signals));
  const queries = dedupe(hypothesisQueries.length ? hypothesisQueries : fallbackQueries(signals));

  return {
    queries,
    preview: queries[0] || "",
    strategy: "20q-hypothesis-composer-v5-no-collapse-primary",
    signals: {
      genres: topKeys(signals.genre, 3),
      tones: topKeys(signals.tone, 3),
      textures: topKeys(signals.world, 3),
      scenarios: [...topKeys(signals.scenario, 3), ...topKeys(signals.theme, 2)].slice(0, 5),
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
