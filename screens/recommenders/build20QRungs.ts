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

function buildFallbackRungs(intent: QueryIntent): string[] {
  const tones = intent.tones || [];
  const themes = intent.themes || [];
  const subs = intent.subgenres || [];

  return distinctQueries([
    combine([tones[0], themes[0], "novel"]),
    combine([subs[0], themes[0], "novel"]),
    combine([tones[0], subs[0], "novel"]),
    combine([themes[0], themes[1], "novel"]),
  ]);
}

export function build20QRungs(intent: QueryIntent, maxRungs = 4) {
  const hypotheses = Array.isArray(intent.hypotheses) ? intent.hypotheses : [];

  const rankedHypothesisQueries = hypotheses
    .sort((a, b) => Number(b?.score || 0) - Number(a?.score || 0))
    .map((h) => clean(h?.query || ""))
    .filter(Boolean);

  const fallbackQueries = buildFallbackRungs(intent);
  const queries = distinctQueries([...rankedHypothesisQueries, ...fallbackQueries]).slice(0, Math.max(1, maxRungs));

  return queries.map((query, i) => ({
    rung: i,
    query,
  }));
}

export function rungToPreviewQuery(r: any) {
  return r?.query || "";
}
