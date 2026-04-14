// /screens/recommenders/openLibrary/openLibraryKidsQueryBuilder.ts
//
// Open Library Kids query builder (20Q-aligned).
// Literal signal translation only. No inferred mode preference, no
// handcrafted story-lane ranking, no hidden fallback shaping.

import type { TagCounts, DomainMode } from "../types";

function norm(s: string): string {
  return String(s || "")
    .toLowerCase()
    .replace(/_/g, " ")
    .replace(/["'“”‘’]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function pickTopTags(tagCounts: TagCounts, max = 25): string[] {
  return Object.entries(tagCounts || {})
    .filter(([, v]) => (Number(v) || 0) > 0)
    .sort((a, b) => (Number(b[1]) || 0) - (Number(a[1]) || 0))
    .slice(0, max)
    .map(([k]) => k);
}

function pushUnique(arr: string[], token: string, max: number) {
  const t = String(token || "").trim();
  if (!t) return;
  if (arr.includes(t)) return;
  if (arr.length >= max) return;
  arr.push(t);
}

function mapTagToQueryToken(tag: string): string | null {
  const t = norm(tag);

  // Format / domain constraints. These are retrieval constraints, not taste boosts.
  if (t.includes("format:picture book") || t.includes("picture book")) return '"picture books"';
  if (t.includes("read aloud")) return '"read aloud"';
  if (t.includes("illustrated")) return "illustrated";
  if (t.includes("format:chapter book") || t.includes("chapter book")) return '"chapter books"';
  if (t.includes("middle grade")) return '"middle grade"';
  if (t.includes("format:series")) return "series";
  if (t.includes("early reader")) return '"early reader"';

  // Genre / theme / topic signals.
  if (t.includes("genre:adventure") || t == "adventure") return "adventure";
  if (t.includes("genre:mystery") || t == "mystery") return "mystery";
  if (t.includes("genre:fantasy") || t == "fantasy") return "fantasy";
  if (t.includes("genre:comedy") || t == "comedy") return "comedy";

  if (t.includes("theme:school") || t == "school") return "school";
  if (t.includes("friendship")) return "friendship";
  if (t.includes("family")) return "family";
  if (t.includes("magic")) return "magic";
  if (t.includes("time travel")) return '"time travel"';
  if (t.includes("dragons")) return "dragons";
  if (t.includes("bears")) return "bears";
  if (t.includes("animals")) return "animals";

  // Vibe signals. Keep literal; do not promote above stronger evidence.
  if (t.includes("funny") || t.includes("humor") || t.includes("vibe:funny")) return "funny";
  if (t.includes("quirky")) return "quirky";
  if (t.includes("cozy")) return "cozy";
  if (t.includes("heartwarming")) return "heartwarming";
  if (t.includes("playful")) return "playful";
  if (t.includes("gentle")) return "gentle";

  return null;
}

export function inferKidsDomainMode(tagCounts: TagCounts): DomainMode {
  const top = pickTopTags(tagCounts, 25).map(norm);

  for (const t of top) {
    if (
      t.includes("format:picture book") ||
      t.includes("picture book") ||
      t.includes("read aloud") ||
      t.includes("illustrated")
    ) {
      return "picture";
    }

    if (
      t.includes("early reader")
    ) {
      return "earlyReader";
    }

    if (
      t.includes("format:series") ||
      t.includes("format:chapter book") ||
      t.includes("chapter book") ||
      t.includes("middle grade")
    ) {
      return "chapterMiddle";
    }
  }

  // No strong signal present: preserve ambiguity.
  return "default";
}

export function buildOpenLibraryKidsQ(tagCounts: TagCounts, domainModeOverride?: DomainMode) {
  const inferredMode = inferKidsDomainMode(tagCounts);
  const mode =
    domainModeOverride && domainModeOverride !== "default"
      ? domainModeOverride
      : inferredMode;

  const core: string[] = ['"juvenile fiction"'];
  const optional: string[] = [];

  // Domain mode override is honored literally when explicitly supplied.
  if (mode === "picture") pushUnique(optional, '"picture books"', 6);
  if (mode === "earlyReader") pushUnique(optional, '"early reader"', 6);
  if (mode === "chapterMiddle") pushUnique(optional, '"chapter books"', 6);

  // Translate top weighted tags directly, in evidence order.
  const top = pickTopTags(tagCounts, 25);
  for (const tag of top) {
    const token = mapTagToQueryToken(tag);
    if (!token) continue;
    pushUnique(optional, token, 6);
  }

  const coreClamped = core.slice(0, 1);
  const optionalClamped = optional.slice(0, 3);
  const q = [...coreClamped, ...optionalClamped].join(" ").trim();

  return {
    q,
    mode,
    parts: {
      core: coreClamped,
      optional: optionalClamped,
    },
  };
}
