// /screens/swipe/openLibraryAdult.ts
//
// Adult band query shaping + guardrail keywords.
// NOTE: "OpenLibrary" naming is legacy; we are building Google Books queries.

import type { TagCounts } from "./openLibraryFromTags";
import { buildSwipeTermsQueryFromTagCounts } from "./openLibraryFromTags";
import { coreTagToKeywords, normalizeToken } from "./openLibraryCore";

function normalizeTokenLocal(s: string) {
  return normalizeToken(s);
}


export const DEFAULT_ADULT_CARDS: any[] = [
  // Thrillers / Mystery
  { title: "Gone Girl", author: "Gillian Flynn", genre: "Thriller / Mystery" },
  { title: "The Girl with the Dragon Tattoo", author: "Stieg Larsson", genre: "Thriller / Mystery" },
  { title: "The Da Vinci Code", author: "Dan Brown", genre: "Thriller / Mystery" },
  { title: "The Silent Patient", author: "Alex Michaelides", genre: "Thriller / Psychological" },
  { title: "And Then There Were None", author: "Agatha Christie", genre: "Mystery / Classic" },

  // Literary / Classics
  { title: "The Kite Runner", author: "Khaled Hosseini", genre: "Literary / Drama" },
  { title: "The Road", author: "Cormac McCarthy", genre: "Literary / Dystopian" },
  { title: "Beloved", author: "Toni Morrison", genre: "Literary / Classic" },
  { title: "Pride and Prejudice", author: "Jane Austen", genre: "Classic / Romance" },
  { title: "The Handmaid’s Tale", author: "Margaret Atwood", genre: "Dystopian / Literary" },

  // Sci-Fi / Fantasy
  { title: "Dune", author: "Frank Herbert", genre: "Sci-Fi / Epic" },
  { title: "Ender’s Game", author: "Orson Scott Card", genre: "Sci-Fi / Military" },
  { title: "The Martian", author: "Andy Weir", genre: "Sci-Fi / Survival" },
  { title: "The Hobbit", author: "J. R. R. Tolkien", genre: "Fantasy / Classic" },
  { title: "American Gods", author: "Neil Gaiman", genre: "Fantasy / Mythic" },

  // Romance
  { title: "It Ends With Us", author: "Colleen Hoover", genre: "Romance / Contemporary" },
  { title: "The Notebook", author: "Nicholas Sparks", genre: "Romance / Classic" },
  { title: "The Hating Game", author: "Sally Thorne", genre: "Romance / Contemporary" },

  // Multicultural + LGBTQ+
  { title: "The House in the Cerulean Sea", author: "TJ Klune", genre: "Fantasy / LGBTQ+" },
  { title: "Giovanni’s Room", author: "James Baldwin", genre: "Literary / LGBTQ+" },
  { title: "The Joy Luck Club", author: "Amy Tan", genre: "Literary / Multicultural" },
  { title: "Born a Crime", author: "Trevor Noah", genre: "Memoir / Multicultural" },
  { title: "The Seven Husbands of Evelyn Hugo", author: "Taylor Jenkins Reid", genre: "Romance / LGBTQ+" },

  // Nonfiction / Memoir
  { title: "Educated", author: "Tara Westover", genre: "Memoir" },
  { title: "Sapiens", author: "Yuval Noah Harari", genre: "Nonfiction / History" },
  { title: "Into Thin Air", author: "Jon Krakauer", genre: "Nonfiction / Adventure" },
];

// Band-specific tag → keyword mapping (NO guardrails here; guardrail is applied in buildFinalQueryAdult).
export function tagToKeywordsAdult(tag: string): string[] {
  const [rawKey, rawVal] = tag.split(":");
  const key = (rawKey || "").trim();
  const val = normalizeTokenLocal((rawVal || "").trim());

  if (!key || !val) return [];

  return coreTagToKeywords(tag);
}

function stripAgeMarkers(tagCounts: TagCounts): TagCounts {
  const out: TagCounts = {};
  for (const [k, v] of Object.entries(tagCounts || {})) {
    if (k.startsWith("age:") || k.startsWith("audience:") || k.startsWith("ageBand:") || k.startsWith("band:"))
      continue;
    out[k] = v;
  }
  return out;
}


const FICTION_GUARDRAIL = '"fiction novel"';

function pickAdultGuardrail(_tagCounts: TagCounts): string {
  return FICTION_GUARDRAIL;
}


// Adult final query starts with guardrails, followed by swipe terms.

function injectGenreAnchors(query: string, tagCounts: TagCounts): string {
  const base = String(query || "").trim();

  const genreEntries = Object.entries(tagCounts || {})
    .filter(([k, v]) => k.startsWith("genre:") && v > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3);

  if (!genreEntries.length) return base;

  const anchors = genreEntries
    .map(([k]) => k.replace("genre:", "").replace(/_/g, " "))
    .map((g) => `subject:${g}`);

  const hasAnyAnchor = anchors.some(a => base.toLowerCase().includes(a.toLowerCase()));

  if (hasAnyAnchor) return base;

  return `${base} ${anchors.join(" ")}`.trim();
}

function buildAdultAnchorBranches(tagCounts: TagCounts): string[] {
  const buckets: Record<string, string[]> = {
    genre: [],
    theme: [],
    tone: [],
    topic: [],
  };

  const entries = Object.entries(tagCounts || {})
    .filter(([, v]) => Number(v) > 0)
    .sort((a, b) => Number(b[1]) - Number(a[1]));

  for (const [k] of entries) {
    const [prefix, raw] = String(k).split(":");
    const key = String(prefix || "").trim().toLowerCase();
    const value = String(raw || "").trim().toLowerCase().replace(/_/g, " ");
    if (!value) continue;
    if (!(key in buckets)) continue;
    if (["adult", "fiction", "novel"].includes(value)) continue;
    if (buckets[key].includes(value)) continue;
    buckets[key].push(value);
  }

  const branches: string[] = [];
  for (const g of buckets.genre.slice(0, 2)) branches.push(`subject:${g} fiction novel`);
  for (const t of buckets.theme.slice(0, 1)) branches.push(`${t} fiction novel`);
  for (const t of buckets.tone.slice(0, 1)) branches.push(`${t} fiction novel`);
  for (const t of buckets.topic.slice(0, 1)) branches.push(`${t} fiction novel`);

  return Array.from(new Set(branches.map((b) => b.trim()).filter(Boolean))).slice(0, 4);
}

export function buildFinalQueryAdult(tagCounts: TagCounts): string {
  const cleaned = stripAgeMarkers(tagCounts);
  const guardrail = pickAdultGuardrail(cleaned);
  const swipeTerms = buildSwipeTermsQueryFromTagCounts(cleaned, tagToKeywordsAdult).trim();
  const baseQuery = swipeTerms ? `${guardrail} ${swipeTerms}`.trim() : guardrail;
  const anchored = injectGenreAnchors(baseQuery, cleaned);
  const branches = buildAdultAnchorBranches(cleaned);
  return branches.length ? `${anchored} || ${branches.join(" || ")}` : anchored;
}
