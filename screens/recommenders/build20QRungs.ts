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

  // Historical queries need independent anchors; otherwise every query containing
  // "historical fiction" collapses into the same anchor and destroys rung diversity.
  if (/\b(19th century|american society|new york society|civil war|world war|family saga|high society|war historical|period fiction)\b/.test(q)) {
    return q;
  }

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
  horror: [
    "psychological horror novel",
    "survival horror novel",
    "haunted psychological horror novel",
    "psychological horror thriller novel"
  ],
thriller: [
  "missing person thriller novel",
  "serial killer investigation thriller novel",
  "crime conspiracy thriller novel",
  "obsession psychological thriller novel",
  "procedural crime thriller novel"
],
mystery: [
  "murder investigation novel",
  "crime detective fiction",
  "psychological mystery novel",
  "private investigator mystery novel",
  "cold case mystery novel",
],
  fantasy: [
    "epic fantasy novel",
    "high fantasy novel",
    "magic fantasy novel",
    "quest fantasy novel",
    "character driven fantasy novel",
  ],
  "science fiction": ["science fiction novel", "dystopian science fiction novel", "space opera science fiction"],
  romance: [
    "second chance romance novel",
    "forbidden love romance novel",
    "fantasy romance novel",
    "gothic romance novel",
    "historical romance novel",
    "emotional romance novel",
  ],
  "historical fiction": ["historical fiction novel"],
  literary: ["literary fiction novel"],
};

const THEME_REWRITES: Array<{ pattern: RegExp; outputs: string[] }> = [
  { pattern: /\btechnology\b|\btech\b|\bai\b|\bartificial intelligence\b|\brobot\b|\brobots\b|\bmachine\b/, outputs: ["artificial intelligence science fiction novel", "technological dystopia novel"] },
  { pattern: /\bdystopi/, outputs: ["dystopian science fiction novel"] },
  { pattern: /\bspace\b|\bgalaxy\b|\bcosmic\b|\binterstellar\b/, outputs: ["space opera science fiction"] },
  { pattern: /\bmagic\b|\bmagical\b|\bwizard\b|\bwitch\b/, outputs: ["magic fantasy novel"] },
  { pattern: /\bghost\b|\bhaunted\b/, outputs: ["haunted house horror novel"] },
  { pattern: /\bmurder\b|\binvestigation\b|\bdetective\b/, outputs: ["murder investigation novel", "crime detective fiction", "psychological mystery novel"] },
  { pattern: /\bspy\b|\bespionage\b/, outputs: ["spy thriller novel"] },
  { pattern: /\bpsychological\b|\bidentity\b|\bmind\b/, outputs: ["psychological mystery novel", "psychological thriller novel", "psychological horror novel"] },
  { pattern: /\blove\b|\bromance\b|\brelationship\b|\brelationships\b|\bhuman connection\b/, outputs: ["emotional romance novel", "second chance romance novel"] },
  { pattern: /\bbetrayal\b|\bredemption\b|\breunion\b/, outputs: ["second chance romance novel"] },
  { pattern: /\bforbidden\b|\bauthority\b|\brebellion\b/, outputs: ["forbidden love romance novel"] },
  { pattern: /\bfantasy\b|\bmagic\b|\bfae\b|\bgothic\b/, outputs: ["fantasy romance novel", "gothic romance novel"] },
  { pattern: /\bhistorical\b|\bperiod\b|\bvictorian\b|\bwar\b/, outputs: ["historical romance novel"] },
];

function survivalAwareRewrite(intent: QueryIntent): string[] {
  const base = normalizedBaseGenre(intent);

  if (base === "horror") {
    return ["survival horror novel"];
  }

  if (base === "thriller") {
    return ["survival thriller novel"];
  }

  if (base === "mystery") {
    return ["cold case mystery novel"];
  }

  return [];
}

function tokenize(value: string): string[] {
  return clean(value)
    .split(" ")
    .map((token) => token.trim())
    .filter(Boolean)
    .filter((token) => !token.startsWith("-"))
    .filter((token) => token !== "or" && token !== "and")
    .map((token) => token.replace(/[^a-z0-9-]/g, ""))
    .filter(Boolean);
}

function removeBannedTokens(value: string): string {
  return tokenize(value)
    .filter((token) => !BANNED_TOKENS.has(token))
    .filter((token) => token !== "science-fiction")
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

  const noOperators = cleaned
    .split(" ")
    .filter(Boolean)
    .filter((token) => !token.startsWith("-"))
    .join(" ")
    .trim();

  if (!noOperators) return "";
  if (/\bsurvival mystery\b/.test(noOperators)) return "";
  if (/\bmodern psychological horror\b/.test(noOperators)) return "";
  if (/\bdark psychological fiction fiction\b/.test(noOperators)) return "";
  if (/\bmystery book\b/.test(noOperators)) return "";
  if (/\bomnibus\b/.test(noOperators)) return "";
  if (/\bbestseller\b/.test(noOperators)) return "";
  if (/\baward winning\b/.test(noOperators)) return "";
  return ensureBookNativeSuffix(noOperators);
}

function normalizedBaseGenre(intent: QueryIntent): string {
  const candidates = [intent.baseGenre || "", ...(intent.subgenres || [])];
  for (const value of candidates) {
    const cleaned = clean(value);
    if (!cleaned) continue;
    if (/science fiction|sci fi|sci-fi|scifi/.test(cleaned)) return "science fiction";
    if (/fantasy/.test(cleaned)) return "fantasy";
    if (/horror/.test(cleaned)) return "horror";
    if (/thriller/.test(cleaned)) return "thriller";
    if (/mystery|detective|crime/.test(cleaned)) return "mystery";
    if (/historical fiction/.test(cleaned)) return "historical fiction";
    if (/romance/.test(cleaned)) return "romance";
    if (/literary fiction|literary/.test(cleaned)) return "literary";
  }
  return "";
}

function allowDomesticSuspenseForThriller(intent: QueryIntent): boolean {
  const joined = clean([
    ...(intent.themes || []),
    ...(intent.subgenres || []),
    ...(intent.tones || []),
  ].join(" "));

  const hasDomesticSignals = /\bfamily secrets\b|\bbetrayal\b|\bmarriage\b|\brelationship\b|\bdomestic\b/.test(joined);
  const hasCrimeSignals = /\bserial killer\b|\binvestigation\b|\bprocedural\b|\bcrime\b|\bdetective\b|\bfbi\b|\bmissing\b/.test(joined);

  return hasDomesticSignals && !hasCrimeSignals;
}


function queryGenre(query: string): string {
  const q = clean(query);
  if (/second chance romance|forbidden love romance|fantasy romance|gothic romance|historical romance|emotional romance|romance/.test(q)) return "romance";
  if (/science fiction|space opera|dystopian|technological dystopia|scifi|sci fi|sci-fi|ai thriller/.test(q)) return "science fiction";
  if (/psychological horror|survival horror|haunted|horror/.test(q)) return "horror";
  if (/crime thriller|psychological thriller|spy thriller|thriller/.test(q)) return "thriller";
  if (/murder investigation|crime detective|detective|mystery/.test(q)) return "mystery";
  if (/epic fantasy|dark fantasy|magic fantasy|fantasy/.test(q)) return "fantasy";
  if (/historical fiction/.test(q)) return "historical fiction";
  if (/literary/.test(q)) return "literary";
  return "";
}

function allowedGenresForBase(base: string): Set<string> {
  switch (base) {
    case "science fiction":
      return new Set(["science fiction"]);
    case "horror":
      return new Set(["horror"]);
    case "thriller":
      return new Set(["thriller", "mystery"]);
    case "mystery":
      return new Set(["mystery", "thriller"]);
    case "fantasy":
      return new Set(["fantasy"]);
    case "romance":
      return new Set(["romance"]);
    case "historical fiction":
      return new Set(["historical fiction"]);
    case "literary":
      return new Set(["literary"]);
    default:
      return new Set(["science fiction","horror","thriller","mystery","fantasy","romance","historical fiction","literary"]);
  }
}

function isQueryAllowedForBase(query: string, base: string): boolean {
  const family = queryGenre(query);
  if (!base || !family) return true;
  return allowedGenresForBase(base).has(family);
}

function expandBaseGenre(intent: QueryIntent): string[] {
  const base = normalizedBaseGenre(intent);
  if (!base) return [];
  return BASE_GENRE_REWRITES[base] || [ensureBookNativeSuffix(base)];
}

function scrubCrossGenreLiterals(value: string, base: string): string {
  let cleaned = clean(value);
  if (!cleaned) return "";
  if (base === "fantasy") {
    cleaned = cleaned.replace(/\bliterary fiction\b/g, " ").replace(/\s+/g, " ").trim();
  }
  return cleaned;
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

function filterQueriesForBase(outputs: string[], base: string): string[] {
  if (!base) return outputs;

  if (base === "horror") {
    return outputs.filter((query) => {
      const q = clean(query);
      if (/\bpsychological thriller\b/.test(q)) return false;
      if (/\bpsychological suspense\b/.test(q)) return false;
      if (/\bdomestic (thriller|suspense)\b/.test(q)) return false;
      return true;
    });
  }

  return outputs;
}

function themeFallbackQueries(intent: QueryIntent): string[] {
  const outputs: string[] = [];
  const base = normalizedBaseGenre(intent);

  for (const seed of extractThemeSeeds(intent)) {
    for (const rewrite of THEME_REWRITES) {
      if (rewrite.pattern.test(seed)) outputs.push(...rewrite.outputs);
    }

    if (/\bsurvival\b/.test(seed)) {
      outputs.push(...survivalAwareRewrite(intent));
    }
  }

  const baseFiltered = filterQueriesForBase(outputs, base);

  return distinctQueries(baseFiltered.map(sanitizeQuery).filter(Boolean)).filter((query) =>
    isQueryAllowedForBase(query, base)
  );
}

function buildFallbackRungs(intent: QueryIntent): string[] {
  const base = normalizedBaseGenre(intent);
  const cleanedBase = scrubCrossGenreLiterals(intent.baseGenre || "", base);
  const cleanedSubgenres = dedupe(intent.subgenres || []).map((query) =>
    sanitizeQuery(scrubCrossGenreLiterals(query, base))
  );

  const guaranteed =
    base === "mystery"
      ? [
          "murder investigation novel",
          "crime detective fiction",
          "psychological mystery novel",
          "private investigator mystery novel",
          "cold case mystery novel",
        ]
      : base === "fantasy"
      ? [
          "epic fantasy novel",
          "high fantasy novel",
          "magic fantasy novel",
          "quest fantasy novel",
          "character driven fantasy novel",
        ]
      : [];

  const domesticAwareThemeQueries =
    base === "thriller"
      ? themeFallbackQueries(intent).filter((query) =>
          /\bdomestic secrets suspense\b/.test(query)
            ? allowDomesticSuspenseForThriller(intent)
            : true
        )
      : themeFallbackQueries(intent);

  return distinctQueries([
    ...expandBaseGenre(intent),
    ...guaranteed,
    ...domesticAwareThemeQueries,
    sanitizeQuery(cleanedBase),
    ...cleanedSubgenres,
  ].filter(Boolean))
    .filter((query) => isQueryAllowedForBase(query, base))
    .slice(0, 6);
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


type RungRole =
  | "core"
  | "intensify"
  | "adjacent_recall"
  | "controlled_explore";

type RungCandidate = {
  query: string;
  role: RungRole;
  anchor: string;
};

function classifyRungRole(query: string): RungRole {
  const q = clean(query);

  if (/\b(19th century|american society|new york society)\b/.test(q)) {
    return "core";
  }

  if (/\b(civil war|world war|war historical)\b/.test(q)) {
    return "intensify";
  }

  if (/\b(family saga|high society)\b/.test(q)) {
    return "adjacent_recall";
  }

  if (/\bliterary historical\b/.test(q)) {
    return "controlled_explore";
  }

  if (
    /psychological horror novel/.test(q) ||
    /missing person thriller novel/.test(q) ||
    /obsession psychological thriller novel/.test(q) ||
    /epic fantasy novel/.test(q) ||
    /science fiction novel/.test(q) ||
    /murder investigation novel/.test(q) ||
    /crime detective fiction/.test(q)
  ) {
    return "core";
  }

  if (
    /survival horror/.test(q) ||
    /procedural crime thriller/.test(q) ||
    /psychological mystery/.test(q) ||
    /private investigator mystery/.test(q) ||
    /cold case mystery/.test(q) ||
    /dystopian science fiction/.test(q) ||
    /high fantasy novel/.test(q) ||
    /quest fantasy novel/.test(q)
  ) {
    return "intensify";
  }

  if (
    /haunted psychological horror/.test(q) ||
    /psychological horror thriller/.test(q) ||
    /crime conspiracy thriller/.test(q) ||
    /serial killer investigation thriller/.test(q) ||
    /science fiction thriller/.test(q) ||
    /magic fantasy/.test(q) ||
    /character driven fantasy/.test(q)
  ) {
    return "adjacent_recall";
  }

  if (/dark fantasy novel/.test(q)) {
    return "controlled_explore";
  }

  return "controlled_explore";
}

function buildRungCandidates(queries: string[]): RungCandidate[] {
  return distinctQueries(queries).map((query) => ({
    query,
    role: classifyRungRole(query),
    anchor: rungAnchor(query),
  }));
}


function isHistoricalIntent(intent: QueryIntent, base: string): boolean {
  const joined = clean([
    base,
    intent.baseGenre || "",
    ...(intent.subgenres || []),
    ...(intent.themes || []),
    ...(intent.tones || []),
    ...(Array.isArray(intent.hypotheses) ? intent.hypotheses.flatMap((h) => [h?.label || "", h?.query || "", ...(h?.parts || [])]) : []),
  ].join(" "));

  return base === "historical fiction" || /\b(historical fiction|period fiction|victorian|edwardian|gilded age|19th century|civil war|world war|regency)\b/.test(joined);
}

function buildHistoricalRungs(intent: QueryIntent, maxRungs = 4) {
  const joined = clean([
    intent.baseGenre || "",
    ...(intent.subgenres || []),
    ...(intent.themes || []),
    ...(intent.tones || []),
    ...(Array.isArray(intent.hypotheses)
      ? intent.hypotheses.flatMap((h) => [
          h?.label || "",
          h?.query || "",
          ...(h?.parts || []),
        ])
      : []),
  ].join(" "));

  const queries: string[] = [];

  // Historical lane core: use proven, semantically distinct intake queries.
  // These avoid the generic "historical fiction novel" Google Books bucket,
  // which repeatedly pulls guides, criticism, catalogs, and writer-market books.
  queries.push(
    "19th century american novel",
    "american society novel 19th century",
    "new york society novel 19th century"
  );

  // Add taste-aware historical expansions without collapsing into modifier spam.
  if (/\b(war|battle|military|civil war|world war|soldier)\b/.test(joined)) {
    queries.push(
      "civil war historical fiction novel",
      "world war historical fiction novel"
    );
  }

  if (/\b(family|saga|generational|inheritance|dynasty)\b/.test(joined)) {
    queries.push("family saga historical novel");
  }

  if (/\b(politics|elite|wealth|class|society)\b/.test(joined)) {
    queries.push("high society historical fiction novel");
  }

  if (/\b(dark|gritty|realistic|literary|character|atmospheric|complex)\b/.test(joined)) {
    queries.push("literary historical fiction novel");
  }

  // Final broad fallback only after the more precise historical rung set.
  queries.push("historical fiction novel");

  return distinctQueries(queries)
    .slice(0, Math.max(1, maxRungs))
    .map((query, i) => ({
      rung: i,
      query,
    }));
}

export function build20QRungs(intent: QueryIntent, maxRungs = 4) {
  const hypotheses = Array.isArray(intent.hypotheses) ? intent.hypotheses : [];
  const base = normalizedBaseGenre(intent);

  const historicalQueries = isHistoricalIntent(intent, base)
    ? buildHistoricalRungs(intent, maxRungs).map((r) => r.query)
    : [];

  const rankedHypothesisQueries = distinctQueries(
    hypotheses
      .slice()
      .sort((a, b) => Number(b?.score || 0) - Number(a?.score || 0))
      .map((h) => hypothesisToBookQuery(h, intent))
      .filter(Boolean)
  ).filter((query) => isQueryAllowedForBase(query, base));

  const fallbackQueries =
    rankedHypothesisQueries.length >= Math.max(1, maxRungs)
      ? []
      : buildFallbackRungs(intent);

  const candidateQueries = distinctQueries([
    ...historicalQueries,
    ...rankedHypothesisQueries,
    ...fallbackQueries,
  ]);

  const rungCandidates = buildRungCandidates(candidateQueries)
    .filter((candidate) => {
      const safeQuery = sanitizeQuery(candidate.query);
      return !!safeQuery && isQueryAllowedForBase(safeQuery, base);
    })
    .map((candidate) => ({
      ...candidate,
      query: sanitizeQuery(candidate.query),
    }))
    .filter((candidate) => !!candidate.query);

  const selected: string[] = [];
  const usedQueries = new Set<string>();
  const anchorCounts = new Map<string, number>();
  const maxPerAnchor = 2;

  const roleOrder: RungRole[] = [
    "core",
    "intensify",
    "adjacent_recall",
    "controlled_explore",
  ];

  for (const role of roleOrder) {
    const candidatesForRole = rungCandidates.filter((item) => {
      if (item.role !== role) return false;
      if (usedQueries.has(item.query)) return false;
      const count = anchorCounts.get(item.anchor) || 0;
      return count < maxPerAnchor;
    });

    const candidate =
      candidatesForRole.find((item) => !/\b19th century american novel\b/.test(item.query)) ||
      candidatesForRole[0];

    if (!candidate) continue;
    selected.push(candidate.query);
    usedQueries.add(candidate.query);
    anchorCounts.set(candidate.anchor, (anchorCounts.get(candidate.anchor) || 0) + 1);
    if (selected.length >= Math.max(1, maxRungs)) break;
  }

  if (selected.length < Math.max(1, maxRungs)) {
    for (const candidate of rungCandidates) {
      if (usedQueries.has(candidate.query)) continue;
      const count = anchorCounts.get(candidate.anchor) || 0;
      if (count >= maxPerAnchor) continue;
      selected.push(candidate.query);
      usedQueries.add(candidate.query);
      anchorCounts.set(candidate.anchor, count + 1);
      if (selected.length >= Math.max(1, maxRungs)) break;
    }
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
