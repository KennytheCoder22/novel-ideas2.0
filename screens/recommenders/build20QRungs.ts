import type { StructuredFetchRung } from "./types";

type QueryIntent = {
  ageBand?: string | null;
  family?: string | null;
  baseGenre?: string | null;
  subgenres?: string[];
  themes?: string[];
  tones?: string[];
  pacing?: string[];
  structures?: string[];
  settings?: string[];
  exclusions?: string[];
};

type Family =
  | "thriller_family"
  | "speculative_family"
  | "romance_family"
  | "historical_family"
  | "general_family";

function normalizePhrase(value: string): string {
  return value.trim().toLowerCase().replace(/[“”"]/g, "").replace(/\s+/g, " ");
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

function hasAny(values: string[] | undefined, patterns: RegExp[]): boolean {
  const joined = pickTop(values, 8).join(" ");
  return patterns.some((pattern) => pattern.test(joined));
}

function audiencePhrase(ageBand?: string | null): string {
  const band = normalizePhrase(ageBand || "");
  if (band === "adult") return "adult fiction";
  if (band === "teen") return "young adult fiction";
  if (band === "pre-teen") return "middle grade fiction";
  if (band === "kids") return "juvenile fiction";
  return "adult fiction";
}

function canonicalFamily(intent: QueryIntent): Family {
  const explicit = normalizePhrase(intent.family || "");
  if (
    explicit === "thriller_family" ||
    explicit === "speculative_family" ||
    explicit === "romance_family" ||
    explicit === "historical_family" ||
    explicit === "general_family"
  ) {
    return explicit as Family;
  }

  const subs = pickTop(intent.subgenres, 8).join(" ");
  if (/crime|mystery|thriller|detective|dystopian/.test(subs)) return "thriller_family";
  if (/science fiction|fantasy|horror/.test(subs)) return "speculative_family";
  if (/romance/.test(subs)) return "romance_family";
  if (/historical fiction|historical/.test(subs)) return "historical_family";
  return "general_family";
}

function familyLockedFallback(family: Family): string {
  if (family === "thriller_family") return "mystery thriller";
  if (family === "speculative_family") return "science fiction";
  if (family === "romance_family") return "romance";
  if (family === "historical_family") return "historical fiction";
  return "fiction";
}

function deriveThemeHints(primary: string | null, intent: QueryIntent): string[] {
  const tones = pickTop(intent.tones, 6);
  const pacing = pickTop(intent.pacing, 4);
  const themes = pickTop(intent.themes, 6);
  const structures = pickTop(intent.structures, 2);
  const settings = pickTop(intent.settings, 2);

  const out: string[] = [];
  const add = (value?: string | null) => {
    const cleaned = normalizePhrase(value || "");
    if (!cleaned) return;
    if (!out.includes(cleaned)) out.push(cleaned);
  };

  if (hasAny(tones, [/\bdark\b/, /\bbleak\b/, /\bgrim\b/, /\bnoir\b/, /\bpsychological\b/])) add("dark");
  if (hasAny(tones, [/\bprocedural\b/, /\brealistic\b/, /\bgrounded\b/])) add("procedural");
  if (hasAny(pacing, [/\bfast-paced\b/, /\bgripping\b/, /\bintense\b/, /\bpropulsive\b/])) add("fast-paced");
  if (hasAny(pacing, [/\bslow-burn\b/])) add("slow-burn");

  for (const theme of themes) {
    if (/investigation|murder mystery|crime/.test(theme)) add("investigation");
    else if (/survival/.test(theme)) add("survival");
    else if (/betrayal|family secrets/.test(theme)) add("betrayal");
    else add(theme);
  }

  for (const structure of structures) add(structure);
  for (const setting of settings) add(setting);

  if (primary === "detective mystery" && !out.includes("investigation")) add("investigation");
  if (primary === "survival thriller" && !out.includes("survival")) add("survival");
  if (primary === "crime thriller" && !out.includes("dark")) add("dark");
  return out.slice(0, 3);
}

function buildRung(
  rung: number,
  family: string | undefined,
  primary: string | null,
  secondary: string | null,
  themes: string[],
  audience: string
): StructuredFetchRung {
  return { rung, family, primary, secondary, themes: uniqOrdered(themes), audience, query: "" };
}

function thrillerPrimaries(intent: QueryIntent): string[] {
  const joinedSubs = pickTop(intent.subgenres, 8).join(" ");
  const tones = pickTop(intent.tones, 6);
  const themes = pickTop(intent.themes, 6);

  const dark = hasAny(tones, [/\bdark\b/, /\bbleak\b/, /\bgrim\b/, /\bpsychological\b/, /\bnoir\b/]);
  const procedural = hasAny(tones, [/\bprocedural\b/, /\brealistic\b/, /\bgrounded\b/]);
  const survival = hasAny(themes, [/\bsurvival\b/]);
  const investigation = hasAny(themes, [/\binvestigation\b/, /\bmurder mystery\b/, /\bcrime\b/]);
  const betrayal = hasAny(themes, [/\bbetrayal\b/, /\bfamily secrets\b/]);

  const out: string[] = [];
  const add = (value?: string | null) => {
    const cleaned = normalizePhrase(value || "");
    if (!cleaned) return;
    if (!out.includes(cleaned)) out.push(cleaned);
  };

  if (/crime/.test(joinedSubs)) add("crime thriller");
  else if (/detective|mystery/.test(joinedSubs)) add("detective novel");
  else if (/thriller/.test(joinedSubs)) add("thriller novel");
  else add("crime thriller");

  if (dark) add("psychological thriller");
  else if (procedural || investigation) add("detective novel");
  else add("mystery thriller");

  if (procedural || investigation) add("detective mystery");
  else add("crime fiction");

  if (survival) add("survival thriller");
  else if (betrayal) add("domestic thriller");
  else if (dark) add("noir thriller");
  else add("suspense novel");

  return uniqOrdered(out);
}

function speculativePrimaries(intent: QueryIntent): string[] {
  const joinedSubs = pickTop(intent.subgenres, 8).join(" ");
  const themes = pickTop(intent.themes, 6);
  const survival = hasAny(themes, [/\bsurvival\b/]);

  const out: string[] = [];
  const add = (value?: string | null) => {
    const cleaned = normalizePhrase(value || "");
    if (!cleaned) return;
    if (!out.includes(cleaned)) out.push(cleaned);
  };

  if (/science fiction/.test(joinedSubs)) add("science fiction");
  else if (/fantasy/.test(joinedSubs)) add("fantasy");
  else if (/horror/.test(joinedSubs)) add("horror");
  else add("science fiction");

  if (/science fiction/.test(joinedSubs) && survival) add("survival science fiction");
  else if (/fantasy/.test(joinedSubs)) add("epic fantasy");
  else if (/horror/.test(joinedSubs)) add("horror novel");
  else add("speculative fiction");

  if (/science fiction/.test(joinedSubs)) add("space opera");
  else if (/fantasy/.test(joinedSubs)) add("dark fantasy");
  else if (/horror/.test(joinedSubs)) add("gothic horror");
  else add("fantasy");

  if (/science fiction/.test(joinedSubs)) add("dystopian fiction");
  else if (/fantasy/.test(joinedSubs)) add("magical fantasy");
  else if (/horror/.test(joinedSubs)) add("supernatural horror");
  else add("science fiction");

  return uniqOrdered(out);
}

function romancePrimaries(): string[] {
  return uniqOrdered([
    "romance",
    "romantic fiction",
    "relationship fiction",
    "love story",
  ]);
}

function historicalPrimaries(): string[] {
  return uniqOrdered([
    "historical fiction",
    "period novel",
    "historical mystery",
    "history-set fiction",
  ]);
}

function generalPrimaries(intent: QueryIntent): string[] {
  const base = normalizePhrase(intent.baseGenre || "fiction");
  return uniqOrdered([
    base,
    "character-driven fiction",
    "literary fiction",
    "popular fiction",
  ]);
}

function deriveHypothesisPrimaries(intent: QueryIntent, maxRungs: number): string[] {
  const family = canonicalFamily(intent);

  let primaries: string[];
  if (family === "thriller_family") primaries = thrillerPrimaries(intent);
  else if (family === "speculative_family") primaries = speculativePrimaries(intent);
  else if (family === "romance_family") primaries = romancePrimaries();
  else if (family === "historical_family") primaries = historicalPrimaries();
  else primaries = generalPrimaries(intent);

  const fallback = familyLockedFallback(family);
  const out = uniqOrdered([...primaries, fallback]);

  while (out.length < Math.max(1, maxRungs)) {
    out.push(`${fallback} ${out.length + 1}`);
  }

  return out.slice(0, Math.max(1, maxRungs));
}

function deriveSecondaryForRung(primary: string | null, family: Family, rungIndex: number): string | null {
  const p = normalizePhrase(primary || "");
  if (!p) return null;

  if (family === "thriller_family") {
    if (rungIndex === 0) return "adult crime fiction";
    if (rungIndex === 1) return "adult suspense fiction";
    if (rungIndex === 2) return "murder investigation";
    if (rungIndex === 3) return "adult mystery fiction";
  }

  if (family === "speculative_family") {
    if (rungIndex === 0) return "novel";
    if (rungIndex === 1) return "adult speculative fiction";
    if (rungIndex === 2) return "novel";
    if (rungIndex === 3) return "fiction";
  }

  if (family === "romance_family") {
    if (rungIndex === 0) return "adult romance novel";
    if (rungIndex === 1) return "relationship fiction";
    if (rungIndex === 2) return "love story";
    if (rungIndex === 3) return "adult fiction";
  }

  if (family === "historical_family") {
    if (rungIndex === 0) return "novel";
    if (rungIndex === 1) return "adult fiction";
    if (rungIndex === 2) return "historical mystery";
    if (rungIndex === 3) return "period fiction";
  }

  return rungIndex === 0 ? "novel" : "fiction";
}

export function rungToPreviewQuery(rung: StructuredFetchRung): string {
  return uniqOrdered([
    ...rung.themes.slice(0, 2),
    rung.primary,
    rung.secondary,
    rung.audience,
    "novel",
  ]).join(" ").trim();
}

export function build20QRungs(intent: QueryIntent, maxRungs = 4): StructuredFetchRung[] {
  const audience = audiencePhrase(intent.ageBand);
  const family = (intent.family || canonicalFamily(intent)) as Family;
  const primaries = deriveHypothesisPrimaries({ ...intent, family }, maxRungs);

  const out: StructuredFetchRung[] = [];
  const seenQueries = new Set<string>();

  for (let index = 0; index < Math.max(1, maxRungs); index += 1) {
    const primary = primaries[index] || familyLockedFallback(family);
    const secondary = deriveSecondaryForRung(primary, family, index);
    const themes = deriveThemeHints(primary, { ...intent, family });
    const rung = buildRung(index, family, primary, secondary, themes, audience);
    const query = rungToPreviewQuery(rung);

    if (!query || seenQueries.has(query)) continue;
    seenQueries.add(query);
    out.push({ ...rung, query });
  }

  if (!out.length) {
    const primary = familyLockedFallback(family);
    out.push({
      rung: 0,
      family,
      primary,
      secondary: "novel",
      themes: [],
      audience,
      query: `${primary} ${audience} novel`,
    });
  }

  return out;
}
