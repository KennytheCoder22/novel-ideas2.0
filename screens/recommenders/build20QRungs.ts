type QueryIntent = {
  ageBand?: string | null;
  baseGenre?: string | null;
  subgenres?: string[];
  themes?: string[];
  tones?: string[];
  pacing?: string[];
  structures?: string[];
  settings?: string[];
  exclusions?: string[];
};

type BuiltRung = {
  rung: number;
  query: string;
};

const GENERIC_COLLAPSE_PATTERNS = [
  /^detective novel$/i,
  /^mystery novel$/i,
  /^thriller novel$/i,
  /^crime novel$/i,
  /^fantasy novel$/i,
  /^science fiction novel$/i,
  /^horror novel$/i,
  /^romance novel$/i,
  /^historical fiction novel$/i,
  /^novel$/i,
];

function normalizePhrase(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[“”"]/g, "")
    .replace(/\s+/g, " ");
}

function uniqOrdered(values: Array<string | null | undefined>): string[] {
  const out: string[] = [];
  const seen = new Set<string>();

  for (const raw of values) {
    if (!raw) continue;
    const cleaned = normalizePhrase(raw);
    if (!cleaned || seen.has(cleaned)) continue;
    seen.add(cleaned);
    out.push(cleaned);
  }

  return out;
}

function pickTop(values: string[] | undefined, count: number): string[] {
  if (!values?.length || count <= 0) return [];
  return uniqOrdered(values).slice(0, count);
}

function audiencePhrase(ageBand?: string | null): string {
  const band = normalizePhrase(ageBand || "");
  if (band === "adult") return "adult fiction";
  if (band === "teen") return "young adult fiction";
  if (band === "pre-teen") return "middle grade fiction";
  if (band === "kids") return "juvenile fiction";
  return "adult fiction";
}

function safeGenrePhrase(baseGenre?: string | null): string {
  const genre = normalizePhrase(baseGenre ?? "");
  if (!genre) return "novel";
  return genre.endsWith("novel") ? genre : `${genre} novel`;
}

function buildCoreIdentity(intent: QueryIntent): string[] {
  const topSubgenres = pickTop(intent.subgenres, 2);
  const topThemes = pickTop(intent.themes, 2);
  const topTones = pickTop(intent.tones, 2);
  const topPacing = pickTop(intent.pacing, 1);
  const topStructures = pickTop(intent.structures, 1);
  const topSettings = pickTop(intent.settings, 1);

  return uniqOrdered([
    ...topSubgenres,
    ...topThemes,
    ...topTones,
    ...topPacing,
    ...topStructures,
    ...topSettings,
    audiencePhrase(intent.ageBand),
    "novel",
  ]);
}

function compressForRung(identity: string[], rung: number, baseGenre?: string | null): string[] {
  const genrePhrase = safeGenrePhrase(baseGenre);
  const audience = identity.find((x) =>
    x === "adult fiction" || x === "young adult fiction" || x === "middle grade fiction" || x === "juvenile fiction"
  ) || "adult fiction";

  const learnedAnchors = identity.filter((x) => x !== audience && x !== "novel");

  const kept: string[] = [];
  const add = (value?: string) => {
    const cleaned = normalizePhrase(value || "");
    if (!cleaned) return;
    if (!kept.includes(cleaned)) kept.push(cleaned);
  };

  if (rung <= 0) {
    return uniqOrdered([...identity]);
  }

  if (rung === 1) {
    add(learnedAnchors[0]);
    add(learnedAnchors[1]);
    add(audience);
    add("novel");
    return uniqOrdered(kept);
  }

  if (rung === 2) {
    add(learnedAnchors[0] || genrePhrase);
    add(audience);
    add("novel");
    return uniqOrdered(kept);
  }

  add(genrePhrase);
  add(audience);
  add("novel");
  return uniqOrdered(kept);
}

function finalizePhrase(tokens: string[], baseGenre?: string | null): string {
  const phrase = uniqOrdered(tokens)
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();

  const normalized = normalizePhrase(phrase);
  const collapsed = GENERIC_COLLAPSE_PATTERNS.some((rx) => rx.test(normalized));

  if (!collapsed) return phrase;

  return uniqOrdered([
    safeGenrePhrase(baseGenre),
    "adult fiction",
    "novel",
  ]).join(" ").trim();
}

export function build20QRungs(intent: QueryIntent, maxRungs = 4): BuiltRung[] {
  const identity = buildCoreIdentity(intent);

  const rungs: BuiltRung[] = [];
  const seen = new Set<string>();

  for (let rung = 0; rung < maxRungs; rung += 1) {
    const tokens = compressForRung(identity, rung, intent.baseGenre);
    const query = finalizePhrase(tokens, intent.baseGenre);

    if (!query || seen.has(query)) continue;
    seen.add(query);
    rungs.push({ rung, query });
  }

  if (!rungs.length) {
    rungs.push({ rung: 0, query: finalizePhrase([safeGenrePhrase(intent.baseGenre), audiencePhrase(intent.ageBand), "novel"], intent.baseGenre) });
  }

  return rungs;
}
