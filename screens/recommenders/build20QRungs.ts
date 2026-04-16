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

function buildFallbackRungs(intent: QueryIntent): string[] {
  return distinctQueries([
    clean(intent.baseGenre || ""),
    ...dedupe(intent.subgenres || []).map((query) => clean(query)),
  ]).slice(0, 4);
}

export function build20QRungs(intent: QueryIntent, maxRungs = 4) {
  const hypotheses = Array.isArray(intent.hypotheses) ? intent.hypotheses : [];

  const rankedHypothesisQueries = distinctQueries(
    hypotheses
      .slice()
      .sort((a, b) => Number(b?.score || 0) - Number(a?.score || 0))
      .map((h) => clean(h?.query || ""))
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

  const queries = selected;

  return queries.map((query, i) => ({
    rung: i,
    query,
  }));
}

export function rungToPreviewQuery(r: any) {
  return r?.query || "";
}
