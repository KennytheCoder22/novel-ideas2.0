// /screens/swipe/recommendationsByBand.ts
//
// Single routing point for age-band recommendation query shaping.
// Purpose: prevent drift by ensuring each deck selects exactly one band-specific
// final query builder (no cross-imports between bands).

import type { TagCounts } from "./openLibraryFromTags";

import { buildFinalQueryKids } from "./openLibraryKids";
import { buildFinalQueryPreTeen } from "./openLibraryPreTeen";
import { buildFinalQueryTeen } from "./openLibraryTeen";
import { buildFinalQueryAdult } from "./openLibraryAdult";


function enforceAnchorQueryBase(query: string, tagCounts: TagCounts): string {
  const trimmed = String(query || "").trim();
  if (!/^subject:fiction$/i.test(trimmed)) return query;

  const genreEntries = Object.entries(tagCounts || {})
    .filter(([k, v]) => k.startsWith("genre:") && v > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3);

  if (!genreEntries.length) return query;

  const genreTerms = genreEntries
    .map(([k]) => k.replace("genre:", "").replace(/_/g, " "))
    .map((g) => `subject:${g}`);

  return ["subject:fiction", ...genreTerms].join(" ");
}

function normalizeBranch(branch: string): string {
  return String(branch || "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

function branchTokenSet(branch: string): Set<string> {
  return new Set(
    normalizeBranch(branch)
      .split(" ")
      .map((token) => token.trim())
      .filter(Boolean)
  );
}

function isBranchSubset(branch: string, maybeSuperset: string): boolean {
  const a = branchTokenSet(branch);
  const b = branchTokenSet(maybeSuperset);
  if (a.size === 0 || b.size === 0 || a.size > b.size) return false;

  for (const token of a) {
    if (!b.has(token)) return false;
  }
  return true;
}

function dedupeTeenQueryBranches(query: string): string {
  const branches = String(query || "")
    .split("||")
    .map((part) => part.trim())
    .filter(Boolean);

  if (branches.length <= 1) return String(query || "").trim();

  const unique: string[] = [];
  const seen = new Set<string>();

  for (const branch of branches) {
    const normalized = normalizeBranch(branch);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    unique.push(branch);
  }

  const filtered = unique.filter((branch, idx) => {
    return !unique.some((other, otherIdx) => {
      if (idx === otherIdx) return false;
      const looksLikeGenericYAFallback =
        /subject:"young adult fiction"/i.test(branch) &&
        /subject:"juvenile fiction"/i.test(branch);

      if (!looksLikeGenericYAFallback) return false;
      return isBranchSubset(branch, other);
    });
  });

  return filtered.join(" || ");
}

function enforceAnchorQueryTeen(query: string, tagCounts: TagCounts): string {
  const anchored = enforceAnchorQueryBase(query, tagCounts);
  return dedupeTeenQueryBranches(anchored);
}

function enforceAnchorQueryAdult(query: string, tagCounts: TagCounts): string {
  return enforceAnchorQueryBase(query, tagCounts);
}

export function buildFinalQueryForDeck(deckKey: string, tagCounts: TagCounts): string {
  // Keep the deckKey matching logic aligned with SwipeDeckScreen's deck constraints.
  if (deckKey === "k-2" || deckKey === "k2" || deckKey === "kids") return buildFinalQueryKids(tagCounts);
  if (deckKey === "3-6" || deckKey === "36") return buildFinalQueryPreTeen(tagCounts);
  if (
    deckKey === "ms-hs" ||
    deckKey === "ms_hs" ||
    deckKey === "mshs" ||
    deckKey === "teen" ||
    deckKey === "teens" ||
    deckKey === "teens_school"
  )
    return enforceAnchorQueryTeen(buildFinalQueryTeen(tagCounts), tagCounts);
  if (deckKey === "adult") return enforceAnchorQueryAdult(buildFinalQueryAdult(tagCounts), tagCounts);

  // Unknown deck keys should not silently fall through into another age band.
  // Return an empty query so callers can fail-safe to curated fallback cards for that deck only.
  return "";
}
