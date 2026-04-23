import type { RecommenderInput } from "./types";
import { tasteToQuerySignals as extractQuerySignals, type QuerySignals } from "./tasteToQuerySignals";

type Hypothesis = {
  label: string;
  query: string;
  parts: string[];
  score: number;
};

type QueryPack = {
  primary: string;
  variants: string[];
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
  "historical fiction",
  "betrayal",
  "redemption",
  "social commentary",
  "authority",
  "family conflict",
  "moral conflict",
  "fantasy",
  "horror",
  "political",
  "family saga",
  "gothic",
  "war",
  "rebellion",
  "character-driven",
  "relationship-focused",
  "psychological science fiction",
  "science fiction thriller",
  "romantic science fiction",
  "dark fantasy",
  "psychological mystery",
]);

const BANNED_PRIMARY_SCENARIOS = new Set([
  "collapse",
  "societal collapse",
  "governmental collapse",
]);

const NARRATIVE_ANCHORS = new Set([
  "science fiction",
  "psychological science fiction",
  "science fiction thriller",
  "dark fantasy",
  "psychological mystery",
  "dystopian",
  "historical fiction",
  "fantasy",
  "horror",
  "mystery",
  "thriller",
  "romance",
  "psychological",
  "survival",
  "investigation",
  "crime investigation",
  "literary fiction",
]);

const QUERY_DROP_TERMS = new Set([
  "hopeful",
  "hope",
  "cozy",
  "grounded",
  "realistic",
  "epic",
  "humorous",
  "funny",
  "warm",
]);

const ABSTRACT_QUERY_TERMS = new Set([
  "human connection",
  "connection",
  "relationship",
  "relationships",
]);

const RETRIEVAL_HYGIENE_TERMS = [
  "-writers",
  "-writer",
  "-writing",
  "-guide",
  "-reference",
  "-bibliography",
  "-analysis",
  "-criticism",
  "-review",
  "-summary",
  "-workbook",
  "-anthology",
  "-anthologies",
  "-collection",
  "-collections",
  "-philosophy",
  "-study",
  "-studies",
  "-encyclopedia",
  "-handbook",
  "-catalog",
  "-magazine",
  "-journal",
  "-readers",
  "-reader",
];

const QUERY_SUFFIXES = [
  "novel",
  "fiction",
];

const SHARED_QUALITY_TERMS = [
  "bestseller",
  "highly rated",
  "award winning",
];



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

  if (part === "realistic") return undefined;
  if (part === "grounded") return undefined;
  if (part === "hopeful") return undefined;
  if (part === "cozy") return "character-driven";
  if (part === "human connection") return "character-driven";
  if (part === "relationship") return "relationship-focused";
  if (part === "relationships") return "relationship-focused";
  if (part === "crime") return "mystery";
  if (part === "crime investigation") return "investigation";
  if (part === "institutional") return "political";
  if (part === "historical") return "historical fiction";
  if (part === "family") return "family saga";
  if (part === "identity") return "psychological";
  if (part === "societal collapse" || part === "governmental collapse" || part === "collapse") return undefined;

  return part;
}

function toRetrievalModifier(part?: string): string | undefined {
  if (!part) return undefined;
  if (part === "character-driven") return "psychological";
  if (part === "relationship-focused") return "romance";
  if (part === "family saga") return "family";
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
  return dedupe(
    parts
      .map(normalizeForQuery)
      .map((part) => toRetrievalModifier(part))
      .filter(Boolean) as string[]
  );
}

function sortPartsForSearch(parts: string[]): string[] {
  const priority = new Map<string, number>([
    ["dark fantasy", 8],
    ["psychological mystery", 1],
    ["psychological science fiction", 2],
    ["science fiction thriller", 3],
    ["psychological", 4],
    ["horror", 5],
    ["thriller", 6],
    ["mystery", 7],
    ["science fiction", 8],
    ["dystopian", 9],
    ["historical fiction", 10],
    ["fantasy", 11],
    ["romance", 12],
    ["survival", 13],
    ["investigation", 14],
    ["family", 15],
    ["moral conflict", 16],
    ["redemption", 17],
    ["technology", 18],
    ["political", 19],
    ["social commentary", 20],
    ["war", 21],
    ["rebellion", 22],
    ["gothic", 23],
    ["literary fiction", 24],
  ]);

  return [...parts].sort((a, b) => {
    const pa = priority.has(a) ? priority.get(a)! : 50;
    const pb = priority.has(b) ? priority.get(b)! : 50;
    if (pa !== pb) return pa - pb;
    return a.localeCompare(b);
  });
}

function enforceSearchableStructure(parts: string[]): string[] {
  let out = dedupe(parts)
    .filter((part) => !QUERY_DROP_TERMS.has(part))
    .filter((part) => !ABSTRACT_QUERY_TERMS.has(part));

  if (out.includes("psychological") && out.includes("science fiction") && !out.includes("thriller")) {
    out.push("thriller");
  }

  if (out.includes("psychological") && out.includes("science fiction")) {
    out.push("psychological science fiction");
  }

  if (out.includes("science fiction") && out.includes("thriller")) {
    out.push("science fiction thriller");
  }

  if (out.includes("psychological") && out.includes("fantasy")) {
    // Do not force dark fantasy for fantasy sessions; allow broader fantasy variants.
  }

  if (out.includes("psychological") && out.includes("mystery")) {
    out.push("psychological mystery");
  }

  if (out.includes("fantasy")) {
    out = out.filter((part) => part !== "literary fiction");
  }

  if (out.includes("romance")) {
    if (out.includes("fantasy")) out.push("fantasy romance");
    if (out.includes("historical fiction")) out.push("historical romance");
    if (out.includes("gothic") || out.includes("dark") || out.includes("mystery")) out.push("gothic romance");
    if (out.includes("redemption") || out.includes("betrayal")) out.push("second chance romance");
    if (out.includes("authority") || out.includes("rebellion")) out.push("forbidden love romance");
    if (out.includes("character-driven") || out.includes("relationship-focused")) out.push("emotional romance");
  }

  return dedupe(sortPartsForSearch(out));
}

function choosePrimaryAnchor(parts: string[]): string | undefined {
  const set = new Set(parts);

  if (set.has("psychological mystery")) return "psychological mystery";
  if (set.has("murder investigation")) return "murder investigation";
  if (set.has("crime detective")) return "crime detective";
  if (set.has("private investigator mystery")) return "private investigator mystery";
  if (set.has("cold case mystery")) return "cold case mystery";
  if (set.has("dark fantasy")) return "dark fantasy";
  if (set.has("fantasy")) return "fantasy";
  if (set.has("psychological science fiction")) return "psychological science fiction";
  if (set.has("science fiction thriller")) return "science fiction thriller";
  if (set.has("psychological") && set.has("horror")) return "psychological horror";
  if ((set.has("psychological") && set.has("mystery")) || (set.has("psychological") && set.has("investigation"))) return "psychological mystery";
  if (set.has("psychological") && set.has("thriller")) return "psychological thriller";
  if (set.has("horror")) return "horror";
  if (set.has("thriller")) return "thriller";
  if (set.has("mystery")) return "mystery";
  if (set.has("dystopian")) return "dystopian";
  if (set.has("science fiction")) return "science fiction";
  if (set.has("historical romance")) return "historical romance";
  if (set.has("fantasy romance")) return "fantasy romance";
  if (set.has("gothic romance")) return "gothic romance";
  if (set.has("second chance romance")) return "second chance romance";
  if (set.has("forbidden love romance")) return "forbidden love romance";
  if (set.has("emotional romance")) return "emotional romance";
  if (set.has("historical fiction")) return "historical fiction";
  if (set.has("romance")) return "romance";
  if (set.has("survival")) return "science fiction";
  if (set.has("investigation")) return "murder investigation";

  return undefined;
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


function titleSafeJoin(parts: Array<string | undefined | null>): string {
  return String(parts.filter(Boolean).join(" "))
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function alternateAnchors(parts: string[], primaryAnchor: string): string[] {
  const set = new Set(parts);
  const alternates: string[] = [];

  if (primaryAnchor === "psychological horror") {
    alternates.push("dark psychological fiction");
    alternates.push("literary horror");
    if (set.has("thriller")) alternates.push("psychological thriller");
    if (set.has("gothic") || set.has("fantasy") || set.has("dark fantasy")) alternates.push("gothic horror");
  }

  if (primaryAnchor === "horror") {
    alternates.push("literary horror");
    if (set.has("psychological")) alternates.push("psychological horror");
    if (set.has("gothic") || set.has("fantasy")) alternates.push("gothic horror");
  }

  if (primaryAnchor === "psychological mystery") {
    alternates.push("murder investigation");
    alternates.push("crime detective");
    alternates.push("private investigator mystery");
    alternates.push("cold case mystery");
  }

  if (primaryAnchor === "psychological thriller") {
    alternates.push("dark psychological fiction");
    alternates.push("psychological suspense");
    if (set.has("mystery") || set.has("investigation")) alternates.push("psychological mystery");
  }

  if (primaryAnchor === "mystery" || primaryAnchor === "murder investigation" || primaryAnchor === "crime detective" || primaryAnchor === "private investigator mystery") {
    alternates.push("psychological mystery");
    alternates.push("crime detective");
    alternates.push("murder investigation");
    alternates.push("private investigator mystery");
    alternates.push("cold case mystery");
  }

  if (primaryAnchor === "science fiction") {
    alternates.push("science fiction thriller");
    alternates.push("literary science fiction");
    if (set.has("psychological")) alternates.push("psychological science fiction");
    if (set.has("dystopian")) alternates.push("dystopian science fiction");
  }

  if (primaryAnchor === "science fiction thriller") {
    alternates.push("psychological science fiction");
    alternates.push("dystopian science fiction");
    alternates.push("literary science fiction");
  }

  if (primaryAnchor === "dark fantasy") {
    alternates.push("gothic fantasy");
    alternates.push("dark fantasy fiction");
    alternates.push("character driven fantasy");
  }

  if (primaryAnchor === "historical fiction") {
    alternates.push("literary historical fiction");
    if (set.has("war")) alternates.push("war historical fiction");
    if (set.has("family")) alternates.push("family saga historical fiction");
  }

  if (primaryAnchor === "romance" || primaryAnchor === "emotional romance") {
    alternates.push("second chance romance");
    alternates.push("forbidden love romance");
    alternates.push("emotional romance");
    if (set.has("fantasy")) alternates.push("fantasy romance");
    if (set.has("historical fiction")) alternates.push("historical romance");
    if (set.has("gothic") || set.has("dark") || set.has("mystery")) alternates.push("gothic romance");
  }

  return dedupe(alternates).filter((anchor) => anchor !== primaryAnchor);
}

function modifiersForQueries(parts: string[], anchor: string): { strong: string[]; generic: string[] } {
  const anchorTokens = new Set(anchor.split(" "));
  const modifiers = parts.filter(
    (part) =>
      !QUERY_DROP_TERMS.has(part) &&
      !ABSTRACT_QUERY_TERMS.has(part) &&
      !anchorTokens.has(part) &&
      part !== anchor
  );

  return {
    strong: dedupe(modifiers.filter((m) => !GENERIC_TERMS.has(m))),
    generic: dedupe(modifiers),
  };
}


type RungRole =
  | "core"
  | "intensify"
  | "adjacent_recall"
  | "controlled_explore";

function strongestModifiers(parts: string[]): string[] {
  return dedupe(
    parts.filter(
      (part) =>
        !QUERY_DROP_TERMS.has(part) &&
        !ABSTRACT_QUERY_TERMS.has(part) &&
        !GENERIC_TERMS.has(part)
    )
  );
}

function sameFamilyExpansions(anchor: string, parts: string[]): string[] {
  const set = new Set(parts);
  const out: string[] = [];

  if (anchor === "psychological horror" || anchor === "horror") {
    if (set.has("survival")) out.push("survival horror");
    if (set.has("gothic")) out.push("gothic horror");
    if (set.has("dark")) out.push("dark psychological horror");
    out.push("haunted psychological horror");
    out.push("haunted house horror");
    out.push("psychological horror thriller");
  }

  if (anchor === "psychological thriller" || anchor === "thriller") {
    out.push("psychological thriller");
    out.push("crime thriller");
    out.push("mystery thriller");
    out.push("serial killer investigation thriller");
    out.push("missing person thriller");
    out.push("missing child thriller");
    out.push("abduction thriller");
    out.push("fugitive thriller");
    out.push("manhunt thriller");
    out.push("conspiracy thriller");
    out.push("crime conspiracy thriller");
    out.push("domestic suspense thriller");
    out.push("small town murder thriller");
    out.push("fbi investigation thriller");
    out.push("procedural crime thriller");
    out.push("obsession psychological thriller");
  }

  if (anchor === "mystery") {
    out.push("psychological mystery");
    out.push("crime thriller");
    out.push("mystery thriller");
    out.push("detective investigation thriller");
    out.push("procedural crime thriller");
    out.push("serial killer investigation thriller");
    out.push("missing person thriller");
  }

  if (anchor === "science fiction" || anchor === "science fiction thriller") {
    out.push("psychological science fiction");
    out.push("dystopian science fiction");
    out.push("science fiction thriller");
  }

  if (anchor === "fantasy" || anchor === "dark fantasy") {
    out.push("dark fantasy");
    out.push("gothic fantasy");
    out.push("magic fantasy");
  }

  if (anchor.includes("romance") || anchor === "romance") {
    out.push("second chance romance");
    out.push("forbidden love romance");
    out.push("emotional romance");
    if (set.has("fantasy")) out.push("fantasy romance");
    if (set.has("historical fiction")) out.push("historical romance");
    if (set.has("gothic") || set.has("dark") || set.has("mystery")) out.push("gothic romance");
  }

  return dedupe(out).filter(Boolean);
}

function exploratoryExpansions(anchor: string, parts: string[]): string[] {
  const out: string[] = [];

  if (anchor.includes("horror")) {
    out.push("dark psychological horror");
    out.push("gothic horror");
    out.push("supernatural horror");
  } else if (anchor.includes("thriller") || anchor.includes("mystery")) {
    out.push("psychological suspense");
    out.push("crime conspiracy thriller");
    out.push("investigation thriller");
    out.push("detective investigation thriller");
    out.push("fugitive thriller");
    out.push("manhunt thriller");
  } else if (anchor.includes("science fiction")) {
    out.push("literary science fiction");
  } else if (anchor.includes("fantasy")) {
    out.push("character driven fantasy");
  } else if (anchor.includes("romance") || anchor === "romance") {
    out.push("second chance romance");
    out.push("forbidden love romance");
    out.push("gothic romance");
  }

  return dedupe(out).filter(Boolean);
}

function buildRoleQueries(parts: string[], role: RungRole): string[] {
  const primaryAnchor = choosePrimaryAnchor(parts);
  if (!primaryAnchor) return [];

  const strong = strongestModifiers(parts);
  const first = strong[0];
  const second = strong[1];

  const out: string[] = [];
  const push = (...queryParts: Array<string | undefined | null>) => {
    const q = titleSafeJoin(queryParts);
    if (q && q !== "novel" && q !== "fiction") out.push(q);
  };

  if (role === "core") {
    push(first, primaryAnchor, "novel");
    push(primaryAnchor, "novel");
    return dedupe(out);
  }

  if (role === "intensify") {
    for (const expansion of sameFamilyExpansions(primaryAnchor, parts).slice(0, 5)) {
      push(expansion, "novel");
      if (first) push(first, expansion, "novel");
    }
    return dedupe(out);
  }

  if (role === "adjacent_recall") {
    for (const expansion of sameFamilyExpansions(primaryAnchor, parts).slice(0, 8)) {
      push(expansion, "novel");
      if (second) push(second, expansion, "novel");
    }
    return dedupe(out);
  }

  if (role === "controlled_explore") {
    for (const expansion of exploratoryExpansions(primaryAnchor, parts).slice(0, 5)) {
      push(expansion, "novel");
    }
    return dedupe(out);
  }

  return [];
}

function stripWeakHorrorVariants(queries: string[], parts: string[]): string[] {
  const isHorrorFamily =
    parts.includes("horror") ||
    (parts.includes("psychological") && parts.includes("horror"));

  if (!isHorrorFamily) return dedupe(queries);

  return dedupe(
    queries.filter((query) => {
      const q = titleSafeJoin([query]);
      if (/\bfiction\b/.test(q)) return false;
      if (/\bpsychological suspense\b/.test(q)) return false;
      if (/\bdomestic (thriller|suspense)\b/.test(q)) return false;
      if (/\bliterary horror\b/.test(q)) return false;
      return true;
    })
  );
}

function buildQueryVariants(parts: string[]): QueryPack | undefined {
  const roleOrdered = [
    ...buildRoleQueries(parts, "core"),
    ...buildRoleQueries(parts, "intensify"),
    ...buildRoleQueries(parts, "adjacent_recall"),
    ...buildRoleQueries(parts, "controlled_explore"),
  ];

  const deduped = stripWeakHorrorVariants(roleOrdered, parts).slice(0, 12);
  if (!deduped.length) return undefined;

  return {
    primary: deduped[0],
    variants: deduped,
  };
}

function buildSearchQuery(parts: string[]): string | undefined {
  return buildQueryVariants(parts)?.primary;
}

function addCandidate(
  bag: Hypothesis[],
  label: string,
  partsInput: Array<string | undefined | null>,
  rawSources: SignalCandidate[],
  signals: QuerySignals,
  scoreBias = 0
) {
  let parts = cleanParts(partsInput);
  parts = enforceSearchableStructure(parts);

  if (parts.length < 2) return;
  if (!hasNarrativeAnchor(parts) && !parts.includes("historical fiction") && !parts.includes("psychological")) return;
  if (looksTooGeneric(parts) && !parts.some((p) => isDistinctive(p))) return;
  if (bannedScenarioLeak(parts, rawSources)) return;

  const query = buildSearchQuery(parts);
  if (!query || query === "novel") return;

  const score = scoreCluster(parts, rawSources, signals) + scoreBias;
  bag.push({ label, query, parts, score });
}

function clean(q: string) {
  return String(q || "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function anchorOf(query: string): string {
  const q = clean(query || "");
  const anchors = [
    "psychological science fiction",
    "science fiction thriller",
    "psychological thriller",
    "psychological horror",
    "dark fantasy",
    "psychological mystery",
    "historical fiction",
    "literary fiction",
    "science fiction",
    "dystopian",
    "fantasy",
    "horror",
    "thriller",
    "mystery",
    "romance",
  ];

  return anchors.find((anchor) => q.includes(anchor)) || q;
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
  const seenAnchors = new Set<string>();
  for (const candidate of deduped) {
    const anchor = anchorOf(candidate.query);
    if (seenAnchors.has(anchor)) continue;
    seenAnchors.add(anchor);
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
  if (anti.includes("science fiction")) suppressions.push("-science-fiction");
  return suppressions;
}

function compactQuery(baseQuery: string, signals: QuerySignals): string {
  return safeJoin([
    baseQuery,
    ...lightweightSuppressions(signals),
    ...RETRIEVAL_HYGIENE_TERMS,
  ]);
}

function compactQueryPack(pack: QueryPack, signals: QuerySignals): string[] {
  return dedupe(pack.variants.map((query) => compactQuery(query, signals)));
}


function fallbackQueries(signals: QuerySignals): string[] {
  const genre = topKeys(signals.genre, 2);
  const world = topKeys(signals.world, 2);
  const theme = topKeys(signals.theme, 2);

  const fallbackPartsA = enforceSearchableStructure([genre[0], world[0], theme[0]]);
  const fallbackPartsB = enforceSearchableStructure([genre[0], world[0]]);
  const fallbackPartsC = enforceSearchableStructure([genre[0], theme[0] || world[0]]);
  const fallbackPartsD = enforceSearchableStructure([theme[0], world[0], "psychological"]);

  const packs = [
    buildQueryVariants(fallbackPartsA),
    buildQueryVariants(fallbackPartsB),
    buildQueryVariants(fallbackPartsC),
    buildQueryVariants(fallbackPartsD),
  ].filter(Boolean) as QueryPack[];

  return dedupe(packs.flatMap((pack) => pack.variants));
}

function guaranteedGenreFallbacks(signals: QuerySignals): string[] {
  const genres = new Set(topKeys(signals.genre, 3));
  if (genres.has("fantasy")) return ["epic fantasy novel", "dark fantasy novel", "magic fantasy novel"];
  if (genres.has("horror")) return ["psychological horror novel", "survival horror novel", "haunted house horror novel"];
  if (genres.has("science fiction")) return ["science fiction novel", "dystopian science fiction novel", "space opera science fiction"];
  if (genres.has("mystery") || genres.has("crime")) return ["murder investigation novel", "crime detective fiction", "psychological mystery novel", "private investigator mystery novel", "cold case mystery novel"];
  if (genres.has("thriller")) return [
    "missing person thriller novel",
    "missing child thriller novel",
    "serial killer investigation thriller novel",
    "crime conspiracy thriller novel",
    "obsession psychological thriller novel",
    "procedural crime thriller novel",
    "detective investigation thriller novel",
    "fugitive thriller novel",
    "manhunt thriller novel",
    "abduction thriller novel",
    "small town murder thriller novel",
    "fbi investigation thriller novel",
  ];
  if (genres.has("historical")) return ["historical fiction novel"];
  if (genres.has("romance")) return [
    "second chance romance novel",
    "forbidden love romance novel",
    "fantasy romance novel",
    "gothic romance novel",
    "historical romance novel",
    "emotional romance novel",
  ];
  return [];
}

export function buildDescriptiveQueriesFromTaste(input: RecommenderInput) {
  const signals = extractQuerySignals(input);
  const hypotheses = buildHypotheses(signals);

  const queryPacks = hypotheses
    .slice(0, 5)
    .map((h) => buildQueryVariants(h.parts))
    .filter(Boolean) as QueryPack[];

  const hypothesisQueries = queryPacks.flatMap((pack) => compactQueryPack(pack, signals));
  const fallback = fallbackQueries(signals);
  const guaranteed = guaranteedGenreFallbacks(signals);
  const queries = dedupe(
    hypothesisQueries.length
      ? hypothesisQueries
      : (fallback.length ? fallback : guaranteed)
  );

  return {
    queries,
    preview: queries[0] || "",
    strategy: "20q-hypothesis-composer-v12-multi-anchor-query-packs",
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
