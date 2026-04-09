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

function broadFamilyPrimary(intent: QueryIntent): string {
  const family = canonicalFamily(intent);
  const subs = pickTop(intent.subgenres, 8).join(" ");

  if (family === "thriller_family") {
    if (/detective|mystery/.test(subs)) return "detective mystery";
    if (/crime/.test(subs)) return "crime thriller";
    return "mystery thriller";
  }
  if (family === "speculative_family") {
    if (/science fiction/.test(subs)) return "science fiction";
    if (/fantasy/.test(subs)) return "fantasy";
    if (/horror/.test(subs)) return "horror";
    return "science fiction";
  }
  if (family === "romance_family") return "romance";
  if (family === "historical_family") return "historical fiction";
  return normalizePhrase(intent.baseGenre || "fiction");
}

function deriveHypothesisPrimaries(intent: QueryIntent): string[] {
  const family = canonicalFamily(intent);
  const subgenres = pickTop(intent.subgenres, 8);
  const tones = pickTop(intent.tones, 6);
  const pacing = pickTop(intent.pacing, 4);
  const themes = pickTop(intent.themes, 6);

  const joinedSubs = subgenres.join(" ");
  const hasMystery = /\bmystery\b|\bdetective\b/.test(joinedSubs);
  const hasThriller = /\bthriller\b/.test(joinedSubs);
  const hasCrime = /\bcrime\b/.test(joinedSubs);
  const hasSciFi = /\bscience fiction\b/.test(joinedSubs);
  const hasFantasy = /\bfantasy\b/.test(joinedSubs);
  const hasHorror = /\bhorror\b/.test(joinedSubs);
  const hasRomance = /\bromance\b/.test(joinedSubs);
  const hasHistorical = /\bhistorical fiction\b/.test(joinedSubs);

  const dark = hasAny(tones, [/\bdark\b/, /\bbleak\b/, /\bgrim\b/, /\bpsychological\b/, /\bnoir\b/]);
  const procedural = hasAny(tones, [/\bprocedural\b/, /\brealistic\b/, /\bgrounded\b/]);
  const investigation = hasAny(themes, [/\binvestigation\b/, /\bmurder mystery\b/, /\bcrime\b/]);
  const survival = hasAny(themes, [/\bsurvival\b/]);
  const betrayal = hasAny(themes, [/\bbetrayal\b/, /\bfamily secrets\b/]);

  const out: string[] = [];
  const add = (value?: string | null) => {
    const cleaned = normalizePhrase(value || "");
    if (!cleaned) return;
    if (!out.includes(cleaned)) out.push(cleaned);
  };

  if (family === "thriller_family") {
    if ((hasMystery || investigation) && hasThriller) {
      if (dark) add("mystery thriller");
      if (investigation || procedural) add("detective mystery");
      if (hasCrime || investigation || betrayal) add("crime thriller");
      if (survival) add("survival thriller");
      add("mystery thriller");
      add("detective mystery");
    } else if (hasMystery || investigation) {
      if (procedural) add("detective mystery");
      add("detective mystery");
      add("mystery thriller");
    } else if (hasCrime && hasThriller) {
      if (dark) add("crime thriller");
      if (survival) add("survival thriller");
      add("crime thriller");
      add("mystery thriller");
    } else if (hasThriller) {
      if (dark) add("mystery thriller");
      if (survival) add("survival thriller");
      add("crime thriller");
      add("mystery thriller");
    } else {
      add("mystery thriller");
      add("detective mystery");
    }
  } else if (family === "speculative_family") {
    if (hasSciFi) {
      if (survival) add("survival science fiction");
      add("science fiction");
    }
    if (hasFantasy) add("fantasy");
    if (hasHorror) add("horror");
  } else if (family === "romance_family") {
    if (hasRomance) add("romance");
    add("romance");
  } else if (family === "historical_family") {
    if (hasHistorical) add("historical fiction");
    add("historical fiction");
  }

  if (!out.length) add(familyLockedFallback(family));
  add(familyLockedFallback(family));
  return uniqOrdered(out);
}

function deriveSecondary(primary: string | null, intent: QueryIntent): string | null {
  const tones = pickTop(intent.tones, 6);
  const pacing = pickTop(intent.pacing, 4);
  const themes = pickTop(intent.themes, 6);

  const dark = hasAny(tones, [/\bdark\b/, /\bbleak\b/, /\bgrim\b/, /\bpsychological\b/, /\bnoir\b/]);
  const procedural = hasAny(tones, [/\bprocedural\b/, /\brealistic\b/, /\bgrounded\b/]);
  const fast = hasAny(pacing, [/\bfast-paced\b/, /\bgripping\b/, /\bintense\b/, /\bpropulsive\b/]);
  const survival = hasAny(themes, [/\bsurvival\b/]);
  const investigation = hasAny(themes, [/\binvestigation\b/, /\bmurder mystery\b/, /\bcrime\b/]);

  const p = normalizePhrase(primary || "");
  if (!p) return null;
  if (p === "mystery thriller") {
    if (dark) return "psychological thriller";
    if (investigation || procedural) return "detective mystery";
    return "crime thriller";
  }
  if (p === "detective mystery") {
    if (procedural) return "procedural mystery";
    if (dark) return "psychological thriller";
    return "mystery thriller";
  }
  if (p === "crime thriller") {
    if (fast) return "fast-paced";
    if (dark) return "psychological thriller";
    return "mystery thriller";
  }
  if (p === "survival thriller") return "mystery thriller";
  if (p === "survival science fiction") return "science fiction";
  if (p === "science fiction" && survival) return "survival";
  return null;
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

export function rungToPreviewQuery(rung: StructuredFetchRung): string {
  return uniqOrdered([...rung.themes.slice(0, 2), rung.primary, rung.secondary, rung.audience, "novel"]).join(" ").trim();
}

export function build20QRungs(intent: QueryIntent, maxRungs = 4): StructuredFetchRung[] {
  const audience = audiencePhrase(intent.ageBand);
  const family = intent.family || canonicalFamily(intent);
  const primaries = deriveHypothesisPrimaries({ ...intent, family });

  const candidates: StructuredFetchRung[] = primaries.slice(0, Math.max(1, maxRungs)).map((primary, index) => {
    const secondary = deriveSecondary(primary, { ...intent, family });
    const themes = deriveThemeHints(primary, { ...intent, family });
    return buildRung(index, family, primary, secondary, themes, audience);
  });

  if (candidates.length < Math.max(1, maxRungs)) {
    const fallbackPrimary = familyLockedFallback(canonicalFamily({ ...intent, family }));
    candidates.push(
      buildRung(
        candidates.length,
        family,
        fallbackPrimary,
        null,
        deriveThemeHints(fallbackPrimary, { ...intent, family }).slice(0, 1),
        audience
      )
    );
  }

  const seen = new Set<string>();
  const out: StructuredFetchRung[] = [];
  for (const rung of candidates.slice(0, Math.max(1, maxRungs))) {
    const query = rungToPreviewQuery(rung);
    if (!query || seen.has(query)) continue;
    seen.add(query);
    out.push({ ...rung, query });
  }

  if (!out.length) {
    const primary = familyLockedFallback(canonicalFamily({ ...intent, family }));
    out.push({ rung: 0, family, primary, secondary: null, themes: [], audience, query: `${primary} ${audience} novel` });
  }
  return out;
}
