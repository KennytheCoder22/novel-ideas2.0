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
  if (band === "adult") return "";
  if (band === "teen") return "young adult";
  if (band === "pre-teen") return "middle grade";
  if (band === "kids") return "juvenile";
  return "";
}

function buildRung(
  rung: number,
  primary: string | null,
  secondary: string | null,
  themes: string[],
  audience: string
): StructuredFetchRung {
  return {
    rung,
    family: "general_family",
    primary,
    secondary,
    themes: uniqOrdered(themes),
    audience,
    query: "",
  };
}

function joinedIntentText(intent: QueryIntent): string {
  return [
    intent.baseGenre,
    ...(intent.subgenres || []),
    ...(intent.themes || []),
    ...(intent.tones || []),
    ...(intent.pacing || []),
    ...(intent.settings || []),
  ]
    .filter(Boolean)
    .map((value) => normalizePhrase(String(value)))
    .join(" ");
}

function deriveAxes(intent: QueryIntent) {
  const joined = joinedIntentText(intent);
  const tones = pickTop(intent.tones, 8);
  const pacing = pickTop(intent.pacing, 6);
  const themes = pickTop(intent.themes, 8);
  const subgenres = pickTop(intent.subgenres, 8);

  const darkness =
    (/\b(dark|bleak|grim|brooding|haunting|spooky|gothic|noir)\b/.test(joined) ? 1 : 0) +
    (hasAny(tones, [/\bdark\b/, /\bbleak\b/, /\bgrim\b/, /\bnoir\b/, /\bspooky\b/, /\batmospheric\b/]) ? 1 : 0);

  const pacingSignal =
    (hasAny(pacing, [/\bfast-paced\b/, /\bgripping\b/, /\bintense\b/, /\bpropulsive\b/]) ? 1 : 0) +
    (/\b(fast paced|gripping|intense|propulsive|action)\b/.test(joined) ? 1 : 0);

  const slowBurnSignal =
    hasAny(pacing, [/\bslow-burn\b/]) || /\bslow burn\b/.test(joined);

  const realism =
    (/\b(realistic|grounded|historical|contemporary|procedural)\b/.test(joined) ? 1 : 0) +
    (hasAny(tones, [/\brealistic\b/, /\bgrounded\b/, /\bprocedural\b/]) ? 1 : 0);

  const speculative =
    (/\b(science fiction|fantasy|horror|supernatural|paranormal|speculative|dystopian)\b/.test(joined) ? 1 : 0) +
    (subgenres.some((v) => /\b(science fiction|fantasy|horror)\b/.test(v)) ? 1 : 0);

  const intimacy =
    (/\b(character|relationship|family|love|emotional|intimate)\b/.test(joined) ? 1 : 0) +
    (themes.some((v) => /\bfamily\b/.test(v)) ? 1 : 0);

  const intrigue =
    /\b(mystery|crime|detective|investigation|murder|betrayal|secrets?|paranoia|psychological)\b/.test(joined);

  return {
    darkness,
    pacingSignal,
    slowBurnSignal,
    realism,
    speculative,
    intimacy,
    intrigue,
  };
}

function deriveThemeHints(intent: QueryIntent): string[] {
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

  if (hasAny(tones, [/\bdark\b/, /\bbleak\b/, /\bgrim\b/, /\bspooky\b/, /\batmospheric\b/])) add("dark");
  if (hasAny(tones, [/\brealistic\b/, /\bgrounded\b/])) add("grounded");
  if (hasAny(pacing, [/\bfast-paced\b/, /\bgripping\b/, /\bintense\b/, /\bpropulsive\b/])) add("fast-paced");
  if (hasAny(pacing, [/\bslow-burn\b/])) add("slow-burn");

  for (const theme of themes) {
    if (/survival/.test(theme)) add("survival");
    else if (/betrayal|family secrets/.test(theme)) add("betrayal");
    else if (/family/.test(theme)) add("family");
    else add(theme);
  }

  for (const structure of structures) add(structure);
  for (const setting of settings) add(setting);

  return out.slice(0, 3);
}

function deriveHypothesisPrimaries(intent: QueryIntent, maxRungs: number): string[] {
  const axes = deriveAxes(intent);
  const out: string[] = [];

  const add = (value?: string | null) => {
    const cleaned = normalizePhrase(value || "");
    if (!cleaned) return;
    if (!out.includes(cleaned)) out.push(cleaned);
  };

  if (axes.intrigue) add("suspense novel");
  if (axes.speculative > 0) add("speculative fiction novel");
  if (axes.pacingSignal > 0 && axes.intrigue) add("fast paced suspense novel");
  if (axes.speculative > 0 && axes.pacingSignal > 0) add("speculative fiction novel");
  if (axes.realism > 0 && axes.intrigue) add("grounded suspense novel");
  if (axes.intimacy > 0) add("character driven novel");
  if (axes.realism > 0 && axes.intimacy > 0) add("family drama novel");
  if (axes.realism > 0 && axes.intrigue) add("crime drama novel");
  if (axes.slowBurnSignal) add("slow burn novel");
  if (axes.speculative > 0) add("speculative fiction novel");

  add(intent.baseGenre || "fiction novel");

  while (out.length < Math.max(1, maxRungs)) {
    add("fiction novel");
    if (out.length < Math.max(1, maxRungs)) add("literary fiction");
    if (out.length < Math.max(1, maxRungs)) add("contemporary novel");
  }

  return out.slice(0, Math.max(1, maxRungs));
}

function deriveSecondaryForRung(primary: string | null, rungIndex: number): string | null {
  const p = normalizePhrase(primary || "");
  if (!p) return null;

  if (rungIndex === 0) return "novel";
  if (rungIndex === 1 && /\b(speculative|fiction)\b/.test(p)) return "novel";
  if (rungIndex === 1) return "fiction";
  if (rungIndex === 2) return null;
  return "fiction";
}

function ensureNovelAnchor(parts: string[]): string[] {
  const joined = parts.join(" ");
  if (/\b(novel|fiction)\b/i.test(joined)) return parts;
  return [...parts, "novel"];
}

function marketFacingRungParts(rung: StructuredFetchRung): string[] {
  let baseParts = uniqOrdered([
    rung.primary,
    rung.secondary,
    rung.audience,
  ]).filter(Boolean);

  const joined = baseParts.join(" ");

  if (/\bnovel\b/.test(joined)) {
    baseParts = baseParts.filter((p) => p !== "novel");
  }
  if (/\bfiction\b/.test(joined)) {
    baseParts = baseParts.filter((p) => p !== "fiction");
  }

  return ensureNovelAnchor(
    uniqOrdered([
      ...rung.themes.slice(0, 1),
      ...baseParts,
    ])
  );
}

export function rungToPreviewQuery(rung: StructuredFetchRung): string {
  return marketFacingRungParts(rung).join(" ").trim();
}

export function build20QRungs(intent: QueryIntent, maxRungs = 4): StructuredFetchRung[] {
  const audience = audiencePhrase(intent.ageBand);
  const primaries = deriveHypothesisPrimaries(intent, maxRungs);

  const out: StructuredFetchRung[] = [];
  const seenQueries = new Set<string>();

  for (let index = 0; index < Math.max(1, maxRungs); index += 1) {
    const primary = primaries[index] || "fiction novel";
    const secondary = deriveSecondaryForRung(primary, index);
    const themes = deriveThemeHints(intent);
    const rung = buildRung(index, primary, secondary, themes, audience);
    const query = rungToPreviewQuery(rung);

    if (!query || seenQueries.has(query)) continue;
    seenQueries.add(query);
    out.push({ ...rung, query });
  }

  if (!out.length) {
    out.push({
      rung: 0,
      family: "general_family",
      primary: "fiction novel",
      secondary: "novel",
      themes: [],
      audience,
      query: `${audience ? `${audience} ` : ""}fiction novel`.trim(),
    });
  }

  return out;
}