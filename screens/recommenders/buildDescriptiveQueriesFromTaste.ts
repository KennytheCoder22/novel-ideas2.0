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
  "societal collapse",
  "governmental collapse",
]);

const WEAK_PRIMARY_SCENARIOS = new Set([
  "collapse",
  "societal collapse",
  "governmental collapse",
  "journey",
  "quest",
]);

const BAD_PRIMARY_PATTERNS = new Set([
  "dark collapse",
  "dark societal collapse",
  "dark governmental collapse",
  "grounded collapse",
  "grounded societal collapse",
  "grounded governmental collapse",
  "crime thriller",
  "dark crime",
  "dark mystery",
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

function topEntries(bucket: Record<string, number>, n = 3): Array<[string, number]> {
  return Object.entries(bucket)
    .filter(([, score]) => Number.isFinite(score) && score > 0.05)
    .sort((a, b) => b[1] - a[1])
    .slice(0, n);
}

function topKeys(bucket: Record<string, number>, n = 3): string[] {
  return topEntries(bucket, n).map(([key]) => key);
}

function domainEntries(signals: QuerySignals, domain: SignalDomain, n = 4): SignalCandidate[] {
  return topEntries(signals[domain], n).map(([key, score]) => ({ key, score, domain }));
}

function isGeneric(key?: string): boolean {
  return !!key && GENERIC_TERMS.has(key);
}

function isDistinctive(key?: string): boolean {
  return !!key && DISTINCTIVE_TERMS.has(key);
}

function isWeakPrimaryScenario(key?: string): boolean {
  return !!key && WEAK_PRIMARY_SCENARIOS.has(key);
}

function normalizeForQuery(part?: string): string | undefined {
  if (!part) return undefined;
  if (part === "realistic") return "grounded";
  if (part === "institutional") return "governmental collapse";
  if (part === "crime") return "crime investigation";
  return part;
}

function genericPenalty(parts: string[]): number {
  return parts.reduce((sum, part) => sum + (isGeneric(part) ? 0.16 : 0), 0);
}

function distinctiveReward(parts: string[]): number {
  return parts.reduce((sum, part) => sum + (isDistinctive(part) ? 0.22 : 0), 0);
}

function pairBonus(parts: string[]): number {
  const set = new Set(parts);
  let bonus = 0;

  if (set.has("identity") && set.has("science fiction")) bonus += 0.62;
  if (set.has("identity") && set.has("psychological")) bonus += 0.52;
  if (set.has("science fiction") && set.has("technology")) bonus += 0.38;
  if (set.has("crime investigation") && set.has("grounded")) bonus += 0.34;
  if (set.has("crime investigation") && set.has("psychological")) bonus += 0.26;
  if (set.has("dystopian") && set.has("survival")) bonus += 0.4;
  if (set.has("societal collapse") && set.has("survival")) bonus += 0.18;
  if (set.has("governmental collapse") && set.has("survival")) bonus += 0.12;
  if (set.has("historical") && set.has("survival")) bonus += 0.18;
  if (set.has("dark") && set.has("psychological")) bonus += 0.2;

  if (set.has("societal collapse") && !set.has("survival") && !set.has("dystopian")) bonus -= 0.45;
  if (set.has("governmental collapse") && !set.has("crime investigation") && !set.has("political struggle")) bonus -= 0.32;

  return bonus;
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
      penalty += (signals[antiBucketName][part] || 0) * 0.45;
    }
  }

  return penalty;
}

function hasDistinctiveAnchor(parts: string[]): boolean {
  return parts.some((part) => isDistinctive(part));
}

function looksTooGeneric(parts: string[]): boolean {
  if (parts.length < 2) return true;
  if (parts.every((part) => isGeneric(part))) return true;
  const firstTwo = safeJoin(parts.slice(0, 2));
  return BAD_PRIMARY_PATTERNS.has(firstTwo);
}

function cleanParts(parts: Array<string | undefined | null>): string[] {
  return dedupe(parts.map(normalizeForQuery).filter(Boolean) as string[]);
}

function weakScenarioPenalty(parts: string[], sources: SignalCandidate[]): number {
  const weakParts = parts.filter((part) => isWeakPrimaryScenario(part));
  if (!weakParts.length) return 0;

  const hasNarrativeAnchor = parts.some((part) =>
    ["identity", "science fiction", "technology", "crime investigation", "investigation", "survival", "psychological"].includes(part)
  );

  const scenarioSourceScore = sources
    .filter((item) => item.domain === "scenario" && weakParts.includes(item.key))
    .reduce((sum, item) => sum + item.score, 0);

  let penalty = 0.38 + scenarioSourceScore * 0.18;
  if (hasNarrativeAnchor) penalty *= 0.55;
  return penalty;
}

function insufficientClusterPenalty(parts: string[], sources: SignalCandidate[]): number {
  const domains = new Set(sources.map((item) => item.domain));
  const hasNarrativeAnchor = parts.some((part) =>
    ["identity", "science fiction", "technology", "crime investigation", "investigation", "survival", "psychological"].includes(part)
  );

  if (domains.size < 2) return 0.55;
  if (domains.size < 3 && !hasNarrativeAnchor) return 0.35;
  if (!hasNarrativeAnchor) return 0.22;
  return 0;
}

function scoreCluster(parts: string[], sources: SignalCandidate[], signals: QuerySignals): number {
  const sourceWeight = sources.reduce((sum, item) => sum + item.score, 0);
  const domainCount = new Set(sources.map((item) => item.domain)).size;
  const distinctives = distinctiveReward(parts);
  const generics = genericPenalty(parts);
  const pairings = pairBonus(parts);
  const anti = antiPenalty(parts, signals);
  const domainBonus = domainCount >= 3 ? 0.42 : domainCount === 2 ? 0.18 : 0;
  const anchorPenalty = hasDistinctiveAnchor(parts) ? 0 : 0.52;
  const genericShapePenalty = looksTooGeneric(parts) ? 0.5 : 0;
  const weakPenalty = weakScenarioPenalty(parts, sources);
  const clusterPenalty = insufficientClusterPenalty(parts, sources);

  return sourceWeight + distinctives + pairings + domainBonus - generics - anti - anchorPenalty - genericShapePenalty - weakPenalty - clusterPenalty;
}

function addCandidate(
  bag: Hypothesis[],
  label: string,
  partsInput: Array<string | undefined | null>,
  sources: SignalCandidate[],
  signals: QuerySignals,
  scoreBias = 0
) {
  const parts = cleanParts(partsInput);
  if (!parts.length || parts.length < 2) return;
  if (looksTooGeneric(parts) && !hasDistinctiveAnchor(parts)) return;

  const query = safeJoin([...parts, "novel"]);
  if (!query || query === "novel") return;

  const score = scoreCluster(parts, sources, signals) + scoreBias;
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
  const topScenario = scenarios[0]?.key;
  const secondScenario = scenarios[1]?.key;
  const thirdScenario = scenarios[2]?.key;
  const topTheme = themes[0]?.key;
  const secondTheme = themes[1]?.key;
  const topWorld = worlds[0]?.key;
  const secondWorld = worlds[1]?.key;
  const topGenre = genres[0]?.key;

  const candidates: Hypothesis[] = [];

  addCandidate(
    candidates,
    "identity-sf-core",
    [topTone, topTheme, topWorld],
    [tones[0], themes[0], worlds[0]].filter(Boolean) as SignalCandidate[],
    signals,
    0.42
  );

  addCandidate(
    candidates,
    "crime-investigation-core",
    [topTone, topScenario, topGenre],
    [tones[0], scenarios[0], genres[0]].filter(Boolean) as SignalCandidate[],
    signals,
    0.24
  );

  addCandidate(
    candidates,
    "world-theme-core",
    [topWorld, topTheme, secondTheme],
    [worlds[0], themes[0], themes[1]].filter(Boolean) as SignalCandidate[],
    signals,
    0.2
  );

  addCandidate(
    candidates,
    "dystopian-survival-core",
    [topTone, topWorld, topScenario],
    [tones[0], worlds[0], scenarios[0]].filter(Boolean) as SignalCandidate[],
    signals,
    0.18
  );

  addCandidate(
    candidates,
    "theme-scenario-core",
    [topTone, topTheme, topScenario],
    [tones[0], themes[0], scenarios[0]].filter(Boolean) as SignalCandidate[],
    signals,
    0.15
  );

  addCandidate(
    candidates,
    "secondary-lane",
    [secondTone || topTone, secondTheme || topTheme, secondScenario || topScenario],
    [tones[1] || tones[0], themes[1] || themes[0], scenarios[1] || scenarios[0]].filter(Boolean) as SignalCandidate[],
    signals,
    0.08
  );

  addCandidate(
    candidates,
    "world-scenario-secondary",
    [secondWorld || topWorld, secondScenario || topScenario, thirdScenario || topScenario],
    [worlds[1] || worlds[0], scenarios[1] || scenarios[0], scenarios[2] || scenarios[0]].filter(Boolean) as SignalCandidate[],
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
      candidate.parts.find((part) =>
        ["identity", "science fiction", "technology", "crime investigation", "investigation", "survival", "psychological", "dystopian"].includes(part)
      ) || candidate.parts[0];

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
  if (anti.includes("horror")) suppressions.push("-horror");
  if (anti.includes("historical")) suppressions.push("-historical");
  return suppressions;
}

function compactQuery(baseQuery: string, signals: QuerySignals): string {
  return safeJoin([baseQuery, ...lightweightSuppressions(signals)]);
}

function fallbackQueries(signals: QuerySignals): string[] {
  const scenario = topKeys(signals.scenario, 3);
  const world = topKeys(signals.world, 2);
  const tone = topKeys(signals.tone, 2);
  const theme = topKeys(signals.theme, 2);

  const base = [
    safeJoin([tone[0], theme[0], world[0], "novel"]),
    safeJoin([tone[0], scenario[0], theme[0], "novel"]),
    safeJoin([world[0], scenario[0], theme[0], "novel"]),
    safeJoin([tone[1] || tone[0], scenario[1] || scenario[0], theme[1] || theme[0], "novel"]),
    safeJoin(["psychological", "thriller", "novel"]),
    safeJoin(["crime investigation", "novel"]),
  ].filter(Boolean);

  return dedupe(base.map((q) => compactQuery(q, signals))).filter((q) => q && q !== "novel");
}

export function buildDescriptiveQueriesFromTaste(input: RecommenderInput) {
  const signals = extractQuerySignals(input);
  const hypotheses = buildHypotheses(signals);

  const hypothesisQueries = hypotheses
    .slice(0, 5)
    .map((h) => compactQuery(h.query, signals));

  const queries = dedupe(hypothesisQueries.length ? hypothesisQueries : fallbackQueries(signals));

  return {
    queries,
    preview: queries[0] || "",
    strategy: "20q-hypothesis-composer-v4-compact",
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
