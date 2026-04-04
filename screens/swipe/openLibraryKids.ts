// /screens/swipe/openLibraryKids.ts
//
// Kids (K–2) band query shaping + guardrail keywords.
// NOTE: "OpenLibrary" naming is legacy; we are building Google Books queries.

import { coreTagToKeywords, normalizeToken } from "./openLibraryCore";
import type { TagCounts } from "./openLibraryFromTags";
import { normalizeTag } from "../../data/tagNormalizationMap";

function normalizeTokenLocal(s: string) {
  return normalizeToken(s);
}

export function tagToKeywordsKids(tag: string): string[] {
  const [rawKey, rawVal] = tag.split(":");
  const key = (rawKey || "").trim();
  const val = normalizeTokenLocal((rawVal || "").trim());

  if (!key || !val) return [];

  // If a media signal contributes an "animation" tag, "illustrated" is more useful for finding picture books.
  if (val === "animation" || val === "animated") {
    return ["illustrated"];
  }

  // Age-band enforcement (used by deck constraints in SwipeDeckScreen)
  if (key === "audience") {
    if (val === "kids") {
      // Ken rule: no forced add-ons (and never negative tokens). The ONE guardrail lives in buildFinalQueryKids.
      return [];
    }
  }

  if (key === "age") {
    if (val === "k2") {
      // Ken rule: no forced add-ons (and never negative tokens). The ONE guardrail lives in buildFinalQueryKids.
      return [];
    }
  }

  return coreTagToKeywords(tag);
}


// --- Kids/Pre-Teens-specific Google Books query builder ---
// Goal: `"middle grade fiction"` first, followed only by kid-appropriate STORY/GENRE signals.

function quoteIfNeeded(s: string): string {
  const v = (s || "").trim();
  if (!v) return v;
  return v.includes(" ") ? `"${v.replaceAll('"', "")}"` : v;
}

// Block tokens that tend to produce catalogs, writers' markets, publishing guides, etc.
function isBlockedKidsToken(token: string): boolean {
  const t = (token || "").trim().toLowerCase();
  if (!t) return true;

  // overly generic / taxonomy-ish
  if (t === "fiction" || t === "literature" || t === "juvenile" || t === "juvenile fiction" || t === "juvenile literature" || t === "middle grade fiction") return true;

  // publishing / meta-books
  if (t.includes("writer") || t.includes("writers") || t.includes("publishing") || t.includes("publisher") || t.includes("market")) return true;

  // format-y / not story taste
  if (t === "picture book" || t === "picture books" || t === "board book" || t === "board books") return true;

  return false;
}

function kidsAllowedTermFromRawTag(rawTag: string): string | null {
  const raw = (rawTag || "").trim();
  if (!raw) return null;

  // Structured tags are expected to look like "genre:adventure", "vibe:cozy", etc.
  if (raw.includes(":")) {
    const [rawKey, ...rest] = raw.split(":");
    const key = normalizeTokenLocal((rawKey || "").trim()).toLowerCase();
    const value = normalizeTokenLocal(rest.join(":").trim());
    if (!key || !value) return null;

    // Drop "medium:*" and other medium-like keys.
    if (key === "medium") return null;

    const allowedPrefixes = new Set(["genre", "vibe", "tone", "mood", "theme", "trope", "setting", "topic"]);
    if (!allowedPrefixes.has(key)) return null;

    if (isBlockedKidsToken(value)) return null;
    return value;
  }

  // Unprefixed terms are allowed only if they are not blocked (usually from vibe cards).
  const v = normalizeTokenLocal(raw);
  if (!v || isBlockedKidsToken(v)) return null;
  return v;
}

// Build the final Kids Google Books query string.
// REQUIREMENT: exactly ONE guardrail must be first.
export function buildFinalQueryKids(tagCounts: TagCounts): string {
  // Requirements:
  // 1) "juvenile fiction" MUST be the first phrase in the query.
  // 2) Keep query length reasonable by limiting words after the guardrail.
  const base = `"juvenile fiction"`;

  // Word budget for EVERYTHING after the guardrail.
  const MAX_WORDS_AFTER_GUARDRAIL = 6;

  const entries = Object.entries(tagCounts || {})
    .map(([raw, score]) => ({ raw, score: Number(score) || 0 }))
    .filter((e) => e.score > 0);

  const seen = new Set<string>();
  const candidates: { term: string; score: number }[] = [];

  for (const e of entries) {
    const normalized = normalizeTag(e.raw);
    if (!normalized) continue;

    const term = kidsAllowedTermFromRawTag(normalized);
    if (!term) continue;

    const key = term.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);

    candidates.push({ term, score: e.score });
  }


  const isJuvenileToken = (t: string) => /^\s*"?juvenile(?:\s+fiction)?"?\s*$/i.test((t || "").trim());
  const filteredCandidates = candidates.filter((c) => !isJuvenileToken(c.term));

  filteredCandidates.sort((a, b) => {
    const aStrong = a.score >= 2 ? 1 : 0;
    const bStrong = b.score >= 2 ? 1 : 0;
    if (aStrong !== bStrong) return bStrong - aStrong;
    if (a.score !== b.score) return b.score - a.score;
    return a.term.localeCompare(b.term);
  });

  const chosen: string[] = [];
  let usedWords = 0;

  for (const c of filteredCandidates) {
    const words = c.term.trim().split(/\s+/).filter(Boolean);
    const cost = words.length;

    if (cost <= 0) continue;
    if (usedWords + cost > MAX_WORDS_AFTER_GUARDRAIL) continue;

    chosen.push(quoteIfNeeded(c.term));
    usedWords += cost;

    if (usedWords >= MAX_WORDS_AFTER_GUARDRAIL) break;
  }

  return chosen.length ? `${base} ${chosen.join(" ")}` : base;
}