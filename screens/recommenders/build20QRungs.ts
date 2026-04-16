type QueryIntent = {
  baseGenre?: string;
  subgenres?: string[];
  themes?: string[];
  tones?: string[];
  hypotheses?: Array<{
    label?: string;
    query?: string;
    parts?: string[];
    score?: number;
  }>;
};

function clean(q: string) {
  return String(q || "").toLowerCase().replace(/\s+/g, " ").trim();
}

function dedupe(values: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();

  for (const value of values) {
    const cleaned = clean(value);
    if (!cleaned || seen.has(cleaned)) continue;
    seen.add(cleaned);
    out.push(cleaned);
  }

  return out;
}

function meaningfulTokens(query: string): string[] {
  return clean(query)
    .split(" ")
    .filter(Boolean)
    .filter((t) => !["novel", "fiction", "adult"].includes(t));
}

function queryKey(query: string): string {
  return meaningfulTokens(query).sort().join("|");
}

function distinctQueries(values: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();

  for (const value of values) {
    const cleaned = clean(value);
    if (!cleaned) continue;
    const tokens = meaningfulTokens(cleaned);
    if (!tokens.length) continue;
    const key = queryKey(cleaned);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(cleaned);
  }

  return out;
}

function combine(parts: Array<string | undefined | null>) {
  return clean(parts.filter(Boolean).join(" "));
}

function rungAnchor(query: string): string {
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

  return anchors.find((anchor) => q.includes(anchor)) || queryKey(q);
}

const BANNED_TOKENS = new Set([
  "writer",
  "writers",
  "writing",
  "guide",
  "reference",
  "bibliography",
  "analysis",
  "criticism",
  "critical",
  "review",
  "reviews",
  "summary",
  "workbook",
  "anthology",
  "anthologies",
  "collection",
  "collections",
  "philosophy",
  "study",
  "studies",
  "literature",
  "encyclopedia",
  "encyclopaedia",
  "handbook",
  "catalog",
  "catalogs",
  "catalogue",
  "catalogues",
  "magazine",
  "magazines",
  "journal",
  "journals",
  "readers",
  "reader",
  "textbook",
  "textbooks",
  "manual",
  "manuals",
  "essays",
  "essay",
  "companion",
  "companions",
  "history",
  "biography",
  "memoir",
  "nonfiction",
  "non-fiction",
  "screenplay",
  "scriptwriting",
  "film",
  "cinema",
  "movie",
  "television",
  "tv",
]);

const BASE_GENRE_REWRITES: Record<string, string[]> = {
  horror: ["psychological horror novel", "survival horror novel"],
  thriller: ["psychological thriller novel", "crime thriller novel"],
  mystery: ["murder investigation novel", "crime detective fiction"],
  fantasy: ["epic fantasy novel", "dark fantasy novel", "magic fantasy novel"],
  "science fiction": ["science fiction novel", "dystopian science fiction novel", "space opera science fiction"],
  scifi: ["science fiction novel", "dystopian science fiction novel", "space opera science fiction"],
  sci-fi: ["science fiction novel", "dystopian science fiction novel", "space opera science fiction"],
  romance: ["romance novel"],
  "historical fiction": ["historical fiction novel"],
  literary: ["literary fiction novel"],
};

const THEME_REWRITES: Array<{ pattern: RegExp; outputs: string[] }> = [
  { pattern: /\btechnology\b|\btech\b|\bai\b|\bartificial intelligence\b|\brobot\b|\brobots\b|\bmachine\b/, outputs: ["ai thriller novel", "technological dystopia novel"] },
  { pattern: /\bdystopi/, outputs: ["dystopian science fiction novel"] },
  { pattern: /\bspace\b|\bgalaxy\b|\bcosmic\b|\binterstellar\b/, outputs: ["space opera science fiction"] },
  { pattern: /\bmagic\b|\bmagical\b|\bwizard\b|\bwitch\b/, outputs: ["magic fantasy novel"] },
  { pattern: /\bghost\b|\bhaunted\b/, outputs: ["haunted house horror novel"] },
  { pattern: /\bsurvival\b/, outputs: ["survival horror novel"] },
  { pattern: /\bmurder\b|\binvestigation\b|\bdetective\b/, outputs: ["murder investigation novel", "crime detective fiction"] },
  { pattern: /\bspy\b|\bespionage\b/, outputs: ["spy thriller novel"] },
  { pattern: /\bpsychological\b|\bidentity\b|\bmind\b/, outputs: ["psychological thriller novel", "psychological horror novel"] },
];

function tokenize(value: string): string[] {
  return clean(value)
    .split(" ")
    .map((token) => token.replace(/[^a-z0-9-]/g, ""))
    .filter(Boolean);
}

function removeBannedTokens(value: string): string {
  return tokenize(value)
    .filter((token) => !BANNED_TOKENS.has(token))
    .join(" ")
    .trim();
}

function ensureBookNativeSuffix(value: string): string {
  const cleaned = clean(value);
  if (!cleaned) return "";
  if (/\b(novel|fiction)\b/.test(cleaned)) return cleaned;
  return `${cleaned} novel`;
}

function sanitizeQuery(value: string): string {
  const stripped = removeBannedTokens(value);
  const cleaned = clean(stripped);
  if (!cleaned) return "";
  return ensureBookNativeSuffix(cleaned);
}

function normalizedBaseGenre(intent: QueryIntent): string {
  const candidates = [intent.baseGenre || "", ...(intent.subgenres || [])];
  for (const value of candidates) {
    const cleaned = clean(value);
    if (!cleaned) continue;
    if (/science fiction|sci fi|sci-fi|scifi/.test(cleaned)) return "science fiction";
    if (/historical fiction/.test(cleaned)) return "historical fiction";
    if (/literary fiction|literary/.test(cleaned)) return "literary";
    if (/fantasy/.test(cleaned)) return "fantasy";
    if (/horror/.test(cleaned)) return "horror";
    if (/thriller/.test(cleaned)) return "thriller";
    if (/mystery|detective|crime/.test(cleaned)) return "mystery";
    if (/romance/.test(cleaned)) return "romance";
  }
  return "";
}

function expandBaseGenre(intent: QueryIntent): string[] {
  const base = normalizedBaseGenre(intent);
  if (!base) return [];
  return BASE_GENRE_REWRITES[base] || [ensureBookNativeSuffix(base)];
}

function extractThemeSeeds(intent: QueryIntent): string[] {
  const seeds: string[] = [];

  seeds.push(...(intent.themes || []));
  seeds.push(...(intent.tones || []));
  seeds.push(...(intent.subgenres || []));

  for (const hypothesis of Array.isArray(intent.hypotheses) ? intent.hypotheses : []) {
    if (hypothesis?.label) seeds.push(hypothesis.label);
    if (Array.isArray(hypothesis?.parts)) seeds.push(...hypothesis.parts);
    if (hypothesis?.query) seeds.push(hypothesis.query);
  }

  return dedupe(seeds.map((seed) => clean(seed)).filter(Boolean));
}

function themeFallbackQueries(intent: QueryIntent): string[] {
  const outputs: string[] = [];
  for (const seed of extractThemeSeeds(intent)) {
    for (const rewrite of THEME_REWRITES) {
      if (rewrite.pattern.test(seed)) outputs.push(...rewrite.outputs);
    }
  }
  return distinctQueries(outputs.map(sanitizeQuery).filter(Boolean));
}

function buildFallbackRungs(intent: QueryIntent): string[] {
  return distinctQueries([
    ...expandBaseGenre(intent),
    ...themeFallbackQueries(intent),
    sanitizeQuery(clean(intent.baseGenre || "")),
    ...dedupe(intent.subgenres || []).map((query) => sanitizeQuery(query)),
  ].filter(Boolean)).slice(0, 6);
}

function hypothesisToBookQuery(hypothesis: QueryIntent["hypotheses"][number], intent: QueryIntent): string {
  const raw = clean(hypothesis?.query || combine(hypothesis?.parts || []) || hypothesis?.label || "");
  if (!raw) return "";

  const rewrittenThemeQueries = themeFallbackQueries({
    ...intent,
    hypotheses: [hypothesis || {}],
    themes: [...(intent.themes || []), raw],
    subgenres: [...(intent.subgenres || []), raw],
  });

  for (const candidate of rewrittenThemeQueries) {
    if (candidate) return candidate;
  }

  const sanitized = sanitizeQuery(raw);
  if (!sanitized) return "";

  const base = normalizedBaseGenre(intent);
  if (base && !new RegExp(`\\b${base.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&")}\\b`).test(sanitized)) {
    return distinctQueries([sanitizeQuery(`${raw} ${base}`), sanitized]).find(Boolean) || sanitized;
  }

  return sanitized;
}

export function build20QRungs(intent: QueryIntent, maxRungs = 4) {
  const hypotheses = Array.isArray(intent.hypotheses) ? intent.hypotheses : [];

  const rankedHypothesisQueries = distinctQueries(
    hypotheses
      .slice()
      .sort((a, b) => Number(b?.score || 0) - Number(a?.score || 0))
      .map((h) => hypothesisToBookQuery(h, intent))
      .filter(Boolean)
  );

  const fallbackQueries =
    rankedHypothesisQueries.length >= Math.max(1, maxRungs)
      ? []
      : buildFallbackRungs(intent);

  const selected: string[] = [];
  const seenAnchors = new Set<string>();

  for (const query of distinctQueries([
    ...rankedHypothesisQueries,
    ...fallbackQueries,
  ])) {
    const anchor = rungAnchor(query);
    if (seenAnchors.has(anchor)) continue;
    seenAnchors.add(anchor);
    selected.push(query);
    if (selected.length >= Math.max(1, maxRungs)) break;
  }

  const queries = selected.length ? selected : buildFallbackRungs(intent).slice(0, Math.max(1, maxRungs));

  return queries.map((query, i) => ({
    rung: i,
    query,
  }));
}

export function rungToPreviewQuery(r: any) {
  return r?.query || "";
}
