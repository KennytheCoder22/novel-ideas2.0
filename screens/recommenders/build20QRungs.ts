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

function audiencePhrase(ageBand?: string | null): string {
  const band = normalizePhrase(ageBand || "");
  if (band === "adult") return "adult fiction";
  if (band === "teen") return "young adult fiction";
  if (band === "pre-teen") return "middle grade fiction";
  if (band === "kids") return "juvenile fiction";
  return "adult fiction";
}

function canonicalPrimary(intent: QueryIntent): string | null {
  const subs = pickTop(intent.subgenres, 3);
  const joined = subs.join(" ");

  if (/crime/.test(joined) && /thriller/.test(joined)) return "crime thriller";
  if (/mystery/.test(joined) && /thriller/.test(joined)) return "mystery thriller";
  if (/detective/.test(joined) && /mystery/.test(joined)) return "detective mystery";
  if (/science fiction/.test(joined)) return "science fiction";
  if (/fantasy/.test(joined)) return "fantasy";
  if (/horror/.test(joined)) return "horror";
  if (/romance/.test(joined)) return "romance";
  if (/historical fiction/.test(joined)) return "historical fiction";

  return subs[0] || (intent.baseGenre ? normalizePhrase(intent.baseGenre) : null);
}

function canonicalSecondary(intent: QueryIntent, primary: string | null): string | null {
  const subs = pickTop(intent.subgenres, 4).filter((v) => v !== primary);
  const themes = pickTop(intent.themes, 3);

  if (subs.length) return subs[0];
  if (themes.length) return themes[0];
  return null;
}

function toneSignals(intent: QueryIntent): string[] {
  const tones = pickTop(intent.tones, 3);
  const pacing = pickTop(intent.pacing, 2);
  const settings = pickTop(intent.settings, 1);
  const structures = pickTop(intent.structures, 1);

  const out: string[] = [];

  const add = (value?: string | null) => {
    const cleaned = normalizePhrase(value || "");
    if (!cleaned) return;
    if (!out.includes(cleaned)) out.push(cleaned);
  };

  for (const tone of tones) {
    if (/dark|bleak|grim|gothic|psychological|haunting|disturbing|noir/.test(tone)) add("dark");
    if (/cozy|warm|gentle/.test(tone)) add("cozy");
    if (/atmospheric|moody/.test(tone)) add("atmospheric");
    if (/realistic|grounded|procedural/.test(tone)) add("procedural");
  }

  for (const pace of pacing) {
    if (/fast|gripping|intense|propulsive|page-turning/.test(pace)) add("fast-paced");
    if (/slow|deliberate/.test(pace)) add("slow-burn");
  }

  for (const setting of settings) add(setting);
  for (const structure of structures) add(structure);

  return out.slice(0, 2);
}

function semanticThemeSignals(intent: QueryIntent): string[] {
  const topThemes = pickTop(intent.themes, 4);
  const out: string[] = [];

  const add = (value?: string | null) => {
    const cleaned = normalizePhrase(value || "");
    if (!cleaned) return;
    if (!out.includes(cleaned)) out.push(cleaned);
  };

  for (const theme of topThemes) {
    if (/investigation|murder mystery|crime/.test(theme)) add("investigation");
    else if (/survival/.test(theme)) add("survival");
    else if (/betrayal|family secrets/.test(theme)) add("betrayal");
    else add(theme);
  }

  return out.slice(0, 2);
}

function buildRung(
  rung: number,
  family: string | undefined,
  primary: string | null,
  secondary: string | null,
  themes: string[],
  audience: string
): StructuredFetchRung {
  return {
    rung,
    family,
    primary,
    secondary,
    themes: uniqOrdered(themes),
    audience,
    query: "",
  };
}

export function rungToPreviewQuery(rung: StructuredFetchRung): string {
  return uniqOrdered([
    rung.primary,
    rung.secondary,
    ...rung.themes.slice(0, 2),
    rung.audience,
    "novel",
  ]).join(" ").trim();
}

export function build20QRungs(intent: QueryIntent, maxRungs = 4): StructuredFetchRung[] {
  const audience = audiencePhrase(intent.ageBand);
  const family = intent.family || undefined;
  const primary = canonicalPrimary(intent);
  const secondary = canonicalSecondary(intent, primary);
  const toneHints = toneSignals(intent);
  const themeHints = semanticThemeSignals(intent);

  const candidates: StructuredFetchRung[] = [
    buildRung(
      0,
      family,
      primary,
      secondary,
      [...toneHints, ...themeHints.slice(0, 1)],
      audience
    ),
    buildRung(
      1,
      family,
      primary,
      secondary,
      [...themeHints.slice(0, 1)],
      audience
    ),
    buildRung(
      2,
      family,
      primary,
      null,
      [...toneHints.slice(0, 1)],
      audience
    ),
    buildRung(
      3,
      family,
      intent.baseGenre ? normalizePhrase(intent.baseGenre) : primary,
      null,
      [],
      audience
    ),
  ].slice(0, Math.max(1, maxRungs));

  const seen = new Set<string>();
  const out: StructuredFetchRung[] = [];

  for (const rung of candidates) {
    const query = rungToPreviewQuery(rung);
    if (!query || seen.has(query)) continue;
    seen.add(query);
    out.push({ ...rung, query });
  }

  if (!out.length) {
    out.push({
      rung: 0,
      family,
      primary: intent.baseGenre ? normalizePhrase(intent.baseGenre) : "fiction",
      secondary: null,
      themes: [],
      audience,
      query: `${intent.baseGenre ? normalizePhrase(intent.baseGenre) : "fiction"} ${audience} novel`,
    });
  }

  return out;
}
