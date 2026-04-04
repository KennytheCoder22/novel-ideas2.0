// /screens/recommenders/openLibrary/openLibraryKidsQueryBuilder.ts
//
// Open Library Kids query builder (spec-aligned, v1).
// Uses Open Library's subject headings + light vibe keywords.

import type { TagCounts, DomainMode } from "../types";

function norm(s: string): string {
  return String(s || "")
    .toLowerCase()
    .replace(/_/g, " ")
    .replace(/["'“”‘’]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function hasTag(tagCounts: TagCounts, predicate: (k: string) => boolean): boolean {
  for (const [k, v] of Object.entries(tagCounts || {})) {
    if (!v || v <= 0) continue;
    if (predicate(k)) return true;
  }
  return false;
}

function pickTopTags(tagCounts: TagCounts, max = 25): string[] {
  return Object.entries(tagCounts || {})
    .filter(([, v]) => (Number(v) || 0) > 0)
    .sort((a, b) => (Number(b[1]) || 0) - (Number(a[1]) || 0))
    .slice(0, max)
    .map(([k]) => k);
}

function pushUnique(arr: string[], token: string, max: number) {
  const t = token.trim();
  if (!t) return;
  if (arr.includes(t)) return;
  if (arr.length >= max) return;
  arr.push(t);
}

export function inferKidsDomainMode(tagCounts: TagCounts): DomainMode {
  const isPicture =
    hasTag(tagCounts, (k) => norm(k).includes("format:picture book")) ||
    hasTag(tagCounts, (k) => norm(k).includes("picture book")) ||
    hasTag(tagCounts, (k) => norm(k).includes("read aloud")) ||
    hasTag(tagCounts, (k) => norm(k).includes("illustrated"));

  const isChapterMiddle =
    hasTag(tagCounts, (k) => norm(k).includes("format:series")) ||
    hasTag(tagCounts, (k) => norm(k).includes("format:chapter book")) ||
    hasTag(tagCounts, (k) => norm(k).includes("chapter book")) ||
    hasTag(tagCounts, (k) => norm(k).includes("middle grade")) ||
    hasTag(tagCounts, (k) => norm(k).includes("genre:adventure")) ||
    hasTag(tagCounts, (k) => norm(k).includes("genre:mystery")) ||
    hasTag(tagCounts, (k) => norm(k).includes("genre:fantasy")) ||
    hasTag(tagCounts, (k) => norm(k).includes("theme:school")) ||
    hasTag(tagCounts, (k) => norm(k).includes("school")) ||
    hasTag(tagCounts, (k) => norm(k).includes("vibe:funny")) ||
    hasTag(tagCounts, (k) => norm(k).includes("humor"));

  if (isPicture && !isChapterMiddle) return "picture";
  if (isChapterMiddle) return "chapterMiddle";
  // default: lean toward chapterMiddle so we can surface Magic Tree House / Judy Moody zones.
  return "chapterMiddle";
}

export function buildOpenLibraryKidsQ(tagCounts: TagCounts, domainModeOverride?: DomainMode) {
  const mode = domainModeOverride && domainModeOverride !== "default" ? domainModeOverride : inferKidsDomainMode(tagCounts);

  // NOTE: Open Library *does* support fielded search syntax like subject:"...",
  // but in practice multiple subject clauses often over-intersect into 0 hits.
  // For Kids we favor high-recall keyword/phrase tokens and rely on downstream
  // post-filtering to keep results age-appropriate.
  // IMPORTANT: Open Library search ANDs tokens by default.
  // If we push too many phrases/keywords, we *guarantee* 0 hits.
  // So: keep a very small "core" query (high recall), and treat
  // everything else as optional hints for fallback.
  const core: string[] = [];
  const optional: string[] = [];

  // (1) Domain lock (always first)
  // Keep this FIRST per spec, but emit as a plain phrase for recall.
  core.push('"juvenile fiction"');

  // (2) Mode anchors
  if (mode === "picture") {
    // For picture books, this is usually safe and high-recall.
    optional.push('"picture books"');
    optional.push("illustrated");
  } else if (mode === "earlyReader") {
    // OL taxonomy is inconsistent here; keyword steering is safer than strict subject.
    optional.push("readers");
  } else {
    // chapterMiddle
    // Choose up to 2 story-lane subjects, based on top tags.
    const top = pickTopTags(tagCounts, 25).map(norm);
    const wantsHumor = top.some((t) => t.includes("humor") || t.includes("funny") || t.includes("genre:comedy") || t.includes("vibe:funny"));
    const wantsAdventure = top.some((t) => t.includes("genre:adventure") || t.includes("adventure"));
    const wantsSchool = top.some((t) => t.includes("theme:school") || t.includes("school"));
    const wantsMystery = top.some((t) => t.includes("genre:mystery") || t.includes("mystery"));
    const wantsFantasy = top.some((t) => t.includes("genre:fantasy") || t.includes("fantasy") || t.includes("magic"));

    // Pick *one* strongest story lane. More than that often collapses to zero.
    const storyCandidates: string[] = [];
    if (wantsAdventure) storyCandidates.push('"adventure stories"');
    if (wantsHumor) storyCandidates.push('"humorous stories"');
    if (wantsSchool) storyCandidates.push('"school stories"');
    if (wantsMystery) storyCandidates.push('"mystery fiction"');
    if (wantsFantasy) storyCandidates.push('"fantasy fiction"');

    if (storyCandidates.length > 0) {
      // Use the first candidate (already preference-ordered by our heuristics).
      optional.push(storyCandidates[0]);
    }
  }

  // (3) Pick ONE concrete topic/theme (optional)
  const topNorm = pickTopTags(tagCounts, 25).map(norm);

  const topicCandidates: string[] = [];
  if (topNorm.some((t) => t.includes("friendship"))) topicCandidates.push("friendship");
  if (topNorm.some((t) => t.includes("family"))) topicCandidates.push("family");
  if (topNorm.some((t) => t.includes("magic"))) topicCandidates.push("magic");
  if (topNorm.some((t) => t.includes("time travel"))) topicCandidates.push('"time travel"');
  if (topNorm.some((t) => t.includes("dragons"))) topicCandidates.push("dragons");
  if (topNorm.some((t) => t.includes("bears"))) topicCandidates.push("bears");
  if (topNorm.some((t) => t.includes("animals"))) topicCandidates.push("animals");

  if (topicCandidates.length > 0) {
    optional.push(topicCandidates[0]);
  }

  // (4) Pick ONE vibe keyword (optional)
  // These are *very* lossy on OL, so keep them as the first thing we drop.
  const vibeCandidates: string[] = [];
  if (topNorm.some((t) => t.includes("funny") || t.includes("humor"))) vibeCandidates.push("funny");
  if (topNorm.some((t) => t.includes("quirky"))) vibeCandidates.push("quirky");
  if (topNorm.some((t) => t.includes("cozy"))) vibeCandidates.push("cozy");
  if (topNorm.some((t) => t.includes("heartwarming"))) vibeCandidates.push("heartwarming");
  if (topNorm.some((t) => t.includes("playful"))) vibeCandidates.push("playful");
  if (topNorm.some((t) => t.includes("gentle"))) vibeCandidates.push("gentle");

  if (vibeCandidates.length > 0) {
    optional.push(vibeCandidates[0]);
  }

  // Hard caps (guardrail against accidental over-constraint)
  const coreClamped = core.slice(0, 2);
  const optionalClamped = optional.filter(Boolean).slice(0, 3);

  const q = [...coreClamped, ...optionalClamped].join(" ").trim();

  return { q, mode, parts: { core: coreClamped, optional: optionalClamped } };
}
