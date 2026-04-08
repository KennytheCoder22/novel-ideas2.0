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
  const subs = pickTop(intent.subgenres, 2);
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
  const subs = pickTop(intent.subgenres, 3).filter((v) => v !== primary);
  const themes = pickTop(intent.themes, 2);
  if (subs.length) return subs[0];
  if (themes.length) return themes[0];
  return null;
}
export function rungToPreviewQuery(rung: StructuredFetchRung): string {
  return uniqOrdered([rung.primary, rung.secondary, ...rung.themes.slice(0, 1), rung.audience, "novel"]).join(" ").trim();
}
export function build20QRungs(intent: QueryIntent, maxRungs = 4): StructuredFetchRung[] {
  const audience = audiencePhrase(intent.ageBand);
  const primary = canonicalPrimary(intent);
  const secondary = canonicalSecondary(intent, primary);
  const topThemes = pickTop(intent.themes, 2);

  const candidates: StructuredFetchRung[] = [
    { rung: 0, family: intent.family || undefined, primary, secondary, themes: topThemes.slice(0, 1), audience, query: "" },
    { rung: 1, family: intent.family || undefined, primary, secondary: secondary && secondary !== primary ? secondary : null, themes: [], audience, query: "" },
    { rung: 2, family: intent.family || undefined, primary, secondary: null, themes: [], audience, query: "" },
    { rung: 3, family: intent.family || undefined, primary: intent.baseGenre ? normalizePhrase(intent.baseGenre) : primary, secondary: null, themes: [], audience, query: "" },
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
    out.push({ rung: 0, family: intent.family || undefined, primary: intent.baseGenre ? normalizePhrase(intent.baseGenre) : "fiction", secondary: null, themes: [], audience, query: `${intent.baseGenre ? normalizePhrase(intent.baseGenre) : "fiction"} ${audience} novel` });
  }
  return out;
}
