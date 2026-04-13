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

const GENERIC_TERMS = new Set(["thriller", "crime", "mystery", "drama", "dark", "grounded"]);
const DISTINCTIVE_TERMS = new Set([
  "identity",
  "science fiction",
  "dystopian",
  "technology",
  "survival",
  "investigation",
  "psychological",
  "historical",
  "redemption",
  "betrayal",
  "social commentary",
  "authority",
  "human connection",
  "collapse",
]);

const BAD_PRIMARY_PATTERNS = new Set([
  "dark collapse",
  "dark thriller",
  "crime thriller",
  "dark crime",
  "crime mystery",
  "dark mystery",
]);

function audiencePhrase(deckKey: RecommenderInput["deckKey"]): string {
  if (deckKey === "adult") return "adult fiction";
  if (deckKey === "ms_hs") return "young adult fiction";
  if (deckKey === "36") return "middle grade fiction";
  return "fiction";
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

function mapGenreToRetrieval(genre?: string): string | undefined {
  if (!genre) return undefined;
  if (genre === "mystery") return "mystery";
  if (genre === "crime") return "crime";
  if (genre === "thriller") return "thriller";
  if (genre === "science fiction") return "science fiction";
  return genre;
}

function normalizeForQuery(part?: string): string | undefined {
  if (!part) return undefined;
  if (part === "realistic") return "grounded";
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

  if (set.has("identity") && set.has("science fiction")) bonus += 0.5;
  if (set.has("identity") && set.has("psychological")) bonus += 0.42;
  if (set.has("dystopian") && set.has("survival")) bonus += 0.38;
  if (set.has("investigation") && set.has("crime")) bonus += 0.34;
  if (set.has("investigation") && set.has("mystery")) bonus += 0.32;
  if (set.has("dark") && set.has("psychological")) bonus += 0.24;
  if (set.has("dark") && set.has("investigation")) bonus += 0.14;
  if (set.has("historical") && set.has("survival")) bonus += 0.2;
  if (set.has("technology") && set.has("science fiction")) bonus += 0.28;

  if (set.has("collapse") && !set.has("dystopian") && !set.has("survival")) bonus -= 0.28;

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

function scoreCluster(parts: string[], sources: SignalCandidate[], signals: QuerySignals): number {
  const sourceWeight = sources.reduce((sum, item) => sum + item.score, 0);
  const domainCount = new Set(sources.map((item) => item.domain)).size;
  const distinctives = distinctiveReward(parts);
  const generics = genericPenalty(parts);
  const pairings = pairBonus(parts);
  const anti = antiPenalty(parts, signals);
  const domainBonus = domainCount >= 3 ? 0.4 : domainCount === 2 ? 0.18 : 0;
  const anchorPenalty = hasDistinctiveAnchor(parts) ? 0 : 0.5;
  const genericShapePenalty = looksTooGeneric(parts) ? 0.45 : 0;

  return sourceWeight + distinctives + pairings + domainBonus - generics - anti - anchorPenalty - genericShapePenalty;
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
  if (!parts.length) return;
  if (parts.length < 2) return;
  if (looksTooGeneric(parts) && !hasDistinctiveAnchor(parts)) return;

  const query = safeJoin([...parts, "novel"]);
  if (!query || query === "novel") return;

  const score = scoreCluster(parts, sources, signals) + scoreBias;
  bag.push({ label, query, parts, score });
}

function buildHypotheses(signals: QuerySignals): Hypothesis[] {
  const tones = domainEntries(signals, "tone", 4);
  const scenarios = domainEntries(signals, "scenario", 4);
  const themes = domainEntries(signals, "theme", 4);
  const worlds = domainEntries(signals, "world", 4);
  const genres = domainEntries(signals, "genre", 4);

  const topTone = tones[0]?.key;
  const topScenario = scenarios[0]?.key;
  const secondScenario = scenarios[1]?.key;
  const topTheme = themes[0]?.key;
  const secondTheme = themes[1]?.key;
  const topWorld = worlds[0]?.key;
  const secondWorld = worlds[1]?.key;
  const topGenre = genres[0]?.key;
  const secondGenre = genres[1]?.key;

  const candidates: Hypothesis[] = [];

  addCandidate(
    candidates,
    "identity-core",
    [mapToneToRetrieval(topTone), topTheme, mapWorldToRetrieval(topWorld)],
    [tones[0], themes[0], worlds[0]].filter(Boolean) as SignalCandidate[],
    signals,
    0.35
  );

  addCandidate(
    candidates,
    "investigative-core",
    [mapToneToRetrieval(topTone), topScenario, mapGenreToRetrieval(topGenre)],
    [tones[0], scenarios[0], genres[0]].filter(Boolean) as SignalCandidate[],
    signals,
    0.24
  );

  addCandidate(
    candidates,
    "survival-core",
    [mapWorldToRetrieval(topWorld), topScenario, topTheme],
    [worlds[0], scenarios[0], themes[0]].filter(Boolean) as SignalCandidate[],
    signals,
    0.2
  );

  addCandidate(
    candidates,
    "theme-scenario",
    [mapToneToRetrieval(topTone), topTheme, topScenario],
    [tones[0], themes[0], scenarios[0]].filter(Boolean) as SignalCandidate[],
    signals,
    0.18
  );

  addCandidate(
    candidates,
    "world-theme",
    [mapWorldToRetrieval(topWorld), topTheme, secondTheme],
    [worlds[0], themes[0], themes[1]].filter(Boolean) as SignalCandidate[],
    signals,
    0.16
  );

  addCandidate(
    candidates,
    "world-scenario",
    [mapWorldToRetrieval(topWorld), topScenario, secondScenario],
    [worlds[0], scenarios[0], scenarios[1]].filter(Boolean) as SignalCandidate[],
    signals,
    0.12
  );

  addCandidate(
    candidates,
    "genre-theme",
    [mapToneToRetrieval(topTone), mapGenreToRetrieval(topGenre), topTheme],
    [tones[0], genres[0], themes[0]].filter(Boolean) as SignalCandidate[],
    signals,
    0.12
  );

  addCandidate(
    candidates,
    "secondary-world",
    [mapToneToRetrieval(topTone), mapWorldToRetrieval(secondWorld), topTheme],
    [tones[0], worlds[1], themes[0]].filter(Boolean) as SignalCandidate[],
    signals,
    0.08
  );

  addCandidate(
    candidates,
    "secondary-lane",
    [mapToneToRetrieval(tones[1]?.key || topTone), secondScenario || topScenario, secondTheme || topTheme],
    [tones[1] || tones[0], scenarios[1] || scenarios[0], themes[1] || themes[0]].filter(Boolean) as SignalCandidate[],
    signals,
    0.08
  );

  addCandidate(
    candidates,
    "crime-investigation",
    [mapToneToRetrieval(topTone), topScenario === "crime" ? "investigation" : topScenario, mapGenreToRetrieval(topGenre === "thriller" ? secondGenre || topGenre : topGenre)],
    [tones[0], scenarios[0], genres[0]].filter(Boolean) as SignalCandidate[],
    signals,
    0.06
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
    const anchor = candidate.parts.find((part) => isDistinctive(part)) || candidate.parts[0];
    if (coveredAnchors.has(anchor) && diversified.length >= 3) continue;
    coveredAnchors.add(anchor);
    diversified.push(candidate);
    if (diversified.length >= 5) break;
  }

  return diversified.length ? diversified : deduped.slice(0, 5);
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
  const scenario = topKeys(signals.scenario, 3);
  const world = topKeys(signals.world, 2);
  const tone = topKeys(signals.tone, 2);
  const theme = topKeys(signals.theme, 2);

  const base = [
    safeJoin([mapToneToRetrieval(tone[0]), theme[0], mapWorldToRetrieval(world[0]), "novel"]),
    safeJoin([mapToneToRetrieval(tone[0]), scenario[0], theme[0], "novel"]),
    safeJoin([mapWorldToRetrieval(world[0]), scenario[0], theme[0], "novel"]),
    safeJoin([mapToneToRetrieval(tone[1] || tone[0]), scenario[1] || scenario[0], theme[1] || theme[0], "novel"]),
  ].filter(Boolean);

  return dedupe(base.map((q) => safeJoin([q, audience, NEGATIVE_TERMS]))).filter((q) => q && q !== "novel");
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
    strategy: "20q-hypothesis-composer-v2",
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
