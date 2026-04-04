function normalizeTags(tags: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const t of tags || []) {
    const canon = normalizeTagPreservingStructuredPrefix(t);
    if (!canon) continue;
    const key = canon.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(canon);
  }
  return out;
}


// screens/swipe/swipeHelpers.ts
// Pure helpers extracted from SwipeDeckScreen.tsx to reduce file size and regression risk.
// Cleanup-only: no behavior changes intended.

import type { SwipeDeck } from "../../data/swipeDecks/types";
import type { TagCounts } from "./openLibraryFromTags";
import { openLibrarySearch } from "./openLibraryFromTags";
import { normalizeTag } from "../../data/tagNormalizationMap";

// Many parts of the app rely on structured tags like "genre:adventure".
// If we normalize the whole string, punctuation like ":" can be stripped,
// which breaks downstream parsing (ex: Kids query shaping).
//
// Preserve the "key:value" shape for known prefixes while still normalizing
// the VALUE portion.
function normalizeTagPreservingStructuredPrefix(raw: string): string | null {
  const s = String(raw || "").trim();
  if (!s) return null;

  const idx = s.indexOf(":");
  if (idx > 0) {
    const keyRaw = s.slice(0, idx).trim().toLowerCase();
    const valRaw = s.slice(idx + 1).trim();
    if (keyRaw && valRaw) {
      const knownPrefixes = new Set([
        "genre",
        "vibe",
        "tone",
        "mood",
        "theme",
        "trope",
        "setting",
        "topic",
        "format",
        "media",
        "layout",
        "age",
        "audience",
      ]);

      if (knownPrefixes.has(keyRaw)) {
        const normalizedVal = normalizeTag(valRaw);
        if (!normalizedVal) return null;
        return `${keyRaw}:${normalizedVal}`;
      }
    }
  }

  return normalizeTag(s);
}

export type DeckKey = SwipeDeck["deckKey"];

export type OLDoc = {
  key?: string;
  title?: string;
  author_name?: string[];
  first_publish_year?: number;
  cover_i?: number;
};

export type FallbackBook = {
  title: string;
  author: string;
  year?: number;
};

export type RecItem =
  | { kind: "open_library"; doc: OLDoc }
  | { kind: "fallback"; book: FallbackBook };

export type FeedbackKind = "already_read" | "not_interested" | "next";

export type RecFeedback = {
  itemId: string;
  kind: FeedbackKind;
  rating?: 1 | 2 | 3 | 4 | 5;
};

export function resolveDeckFromModule(mod: unknown, expectedKey: DeckKey, fallbackLabel: string): SwipeDeck {
  const candidates: any[] = [];
  if (mod && typeof mod === "object") {
    if ((mod as any).default) candidates.push((mod as any).default);
    for (const v of Object.values(mod)) candidates.push(v);
    candidates.push(mod);
  } else if (mod) {
    candidates.push(mod);
  }

  for (const c of candidates) {
    if (!c || typeof c !== "object") continue;

    const dk = (c as any).deckKey;
    const cards = (c as any).cards;

    if (dk === expectedKey && Array.isArray(cards)) {
      const rules = (c as any).rules;

      if (rules && typeof rules === "object") {
        return c as SwipeDeck;
      }

      const target = (c as any).targetSwipesBeforeRecommend;
      const allow = (c as any).allowUpToSwipesBeforeRecommend;

      if (typeof target === "number" && typeof allow === "number") {
        return {
          ...(c as any),
          rules: {
            targetSwipesBeforeRecommend: target,
            allowUpToSwipesBeforeRecommend: allow,
          },
        } as SwipeDeck;
      }

      return {
        ...(c as any),
        rules: {
          targetSwipesBeforeRecommend: 6,
          allowUpToSwipesBeforeRecommend: 10,
        },
      } as SwipeDeck;
    }
  }

  const maybeArr = (mod as any)?.default ?? mod;
  if (Array.isArray(maybeArr)) {
    return {
      deckKey: expectedKey,
      deckLabel: fallbackLabel,
      rules: {
        targetSwipesBeforeRecommend: 6,
        allowUpToSwipesBeforeRecommend: 10,
      },
      cards: maybeArr as any,
    } as SwipeDeck;
  }

  return ((mod as any)?.default ?? mod) as SwipeDeck;
}

export function randomIntInclusive(min: number, max: number) {
  const lo = Math.ceil(min);
  const hi = Math.floor(max);
  return Math.floor(Math.random() * (hi - lo + 1)) + lo;
}

export function shuffleArray<T>(arr: T[]) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = a[i];
    a[i] = a[j];
    a[j] = tmp;
  }
  return a;
}

export function addTags(counts: TagCounts, tags: string[]) {
  const normalized = normalizeTags(tags);
  const next: TagCounts = { ...counts };
  for (const t of normalized) next[t] = (next[t] || 0) + 1;
  return next;
}

// Apply tags with a signed weight (e.g., +1 for right-swipes, -1 for left-swipes).
// Negative counts are intentional: the query builder can turn them into "-term" exclusions.
export function applyTags(counts: TagCounts, tags: string[], delta: number) {
  if (!delta) return { ...counts };
  const next: TagCounts = { ...counts };
  const normalized = normalizeTags(tags);

  for (const t of normalized) {
    if (!t) continue;

    // Positive-only counts:
    // - Right swipes add weight
    // - Left swipes subtract weight (down to zero) but never create negative tokens in the query
    const current = next[t] || 0;
    const val = current + delta;

    if (val <= 0) delete next[t];
    else next[t] = val;
  }

  return next;
}


export function topTags(counts: TagCounts, n = 12) {
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, n);
}

export function hasAnyLikedTags(counts: TagCounts) {
  return Object.keys(counts).length > 0;
}

// Internal search function used by openLibrarySearchWithTimeout.
// Despite the name, this currently queries Google Books, then normalizes into an OL-style { docs: [...] } shape.
async function openLibrarySearch(query: string, limit: number): Promise<{ docs: OLDoc[] }> {
  const apiKey = process.env.EXPO_PUBLIC_GOOGLE_BOOKS_API_KEY;
  const params = new URLSearchParams();
  params.set('q', query);
  params.set('maxResults', String(Math.min(Math.max(limit, 1), 40)));
  // Optional key (works without it for many requests, but helps avoid quota/IP issues)
  if (apiKey) params.set('key', apiKey);

  const url = `https://www.googleapis.com/books/v1/volumes?${params.toString()}`;
  const res = await fetch(url);

  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw new Error(`Google Books search failed: ${res.status} ${res.statusText}${txt ? ` - ${txt}` : ''}`);
  }

  const data: any = await res.json();
  const items: any[] = Array.isArray(data?.items) ? data.items : [];

  const docs: OLDoc[] = items.map((it) => {
    const vi = it?.volumeInfo ?? {};
    const title: string = vi?.title ?? 'Untitled';
    const author_name: string[] | undefined = Array.isArray(vi?.authors) ? vi.authors : undefined;

    const publishedDate: string | undefined = typeof vi?.publishedDate === 'string' ? vi.publishedDate : undefined;
    const yearMatch = publishedDate ? publishedDate.match(/^(\d{4})/) : null;
    const first_publish_year = yearMatch ? Number(yearMatch[1]) : undefined;

    const categories: string[] | undefined = Array.isArray(vi?.categories) ? vi.categories : undefined;

    // Prefer a https URL for thumbnails
    const thumb: string | undefined =
      typeof vi?.imageLinks?.thumbnail === 'string'
        ? vi.imageLinks.thumbnail.replace(/^http:\/\//, 'https://')
        : typeof vi?.imageLinks?.smallThumbnail === 'string'
          ? vi.imageLinks.smallThumbnail.replace(/^http:\/\//, 'https://')
          : undefined;

    // We store Google IDs in OL fields to avoid refactors elsewhere.
    const key: string | undefined = typeof it?.id === 'string' ? it.id : undefined;

    return {
      key,
      title,
      author_name,
      first_publish_year,
      subject: categories,
      cover_i: thumb,
    };
  });

  return { docs };
}

export async function openLibrarySearchWithTimeout(query: string, limit: number, timeoutMs: number) {
  const timeoutPromise = new Promise<never>((_, reject) => {
    const id = setTimeout(() => {
      clearTimeout(id);
      reject(new Error("Google Books request timed out (network blocked or slow)."));
    }, timeoutMs);
  });

  return Promise.race([openLibrarySearch(query, limit), timeoutPromise]);
}

export function docId(d: OLDoc): string {
  return String(d.key || `${d.title || "untitled"}::${d.author_name?.[0] || "unknown"}`);
}

export function fallbackId(b: FallbackBook): string {
  return `fallback::${b.title}::${b.author}`;
}

export function ratingLabel(r: 1 | 2 | 3 | 4 | 5) {
  if (r === 5) return "Loved it";
  if (r === 4) return "Liked it";
  if (r === 3) return "It was ok";
  if (r === 2) return "Didn't like it";
  return "Hated it";
}

export function buildCoverUrlFromOlid(olWorkId: string, size: "S" | "M" | "L" = "L"): string {
  // Legacy helper (disabled). Disabled to keep NovelIdeas Google-Books-only.
  return "";
}

export async function lookupOpenLibraryCover(title: string, author?: string): Promise<{ coverUrl?: string; olWorkId?: string }> {
  // NOTE: Despite historical naming, NovelIdeas uses GOOGLE BOOKS.
  // This helper fetches a single cover thumbnail when a card has no cover image.
  // Fail-closed: if we can't confidently find a cover, return nothing.
  const parts: string[] = [];
  if (title?.trim()) parts.push(`intitle:${title.trim()}`);
  if (author?.trim()) parts.push(`inauthor:${author.trim()}`);

  const q = parts.length > 0 ? parts.join(" ") : (title || "");
  const url = `https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(q)}&maxResults=1`;

  const res = await fetch(url);
  if (!res.ok) return {};
  const json = await res.json();

  const item = Array.isArray(json?.items) ? json.items[0] : undefined;
  const thumb: string | undefined =
    item?.volumeInfo?.imageLinks?.thumbnail ||
    item?.volumeInfo?.imageLinks?.smallThumbnail;

  if (!thumb || typeof thumb !== "string") return {};
  return { coverUrl: thumb.replace(/^http:\/\//, "https://") };
}


export async function lookupWikipediaThumbnail(wikiTitle: string): Promise<{ imageUrl?: string }> {
  try {
    const safeTitle = encodeURIComponent(wikiTitle.replace(/\s+/g, " ").trim());
    const url = `https://en.wikipedia.org/api/rest_v1/page/summary/${safeTitle}`;
    const res = await fetch(url);
    if (!res.ok) return {};
    const data: any = await res.json();
    const thumb = data?.thumbnail?.source as string | undefined;
    if (thumb && typeof thumb === "string" && thumb.startsWith("http")) return { imageUrl: thumb };
    return {};
  } catch {
    return {};
  }
}


export function pickFallbackBooks(deckKey: DeckKey, tagCounts: TagCounts, count = 10): FallbackBook[] {
  const k2: FallbackBook[] = [
    { title: "Pete the Cat", author: "James Dean & Eric Litwin" },
    { title: "Elephant & Piggie", author: "Mo Willems" },
    { title: "The Very Hungry Caterpillar", author: "Eric Carle" },
    { title: "Don't Let the Pigeon Drive the Bus!", author: "Mo Willems" },
    { title: "Brown Bear, Brown Bear, What Do You See?", author: "Bill Martin Jr." },
    { title: "The Day the Crayons Quit", author: "Drew Daywalt" },
    { title: "Dragons Love Tacos", author: "Adam Rubin" },
    { title: "Giraffes Can't Dance", author: "Giles Andreae" },
    { title: "Where the Wild Things Are", author: "Maurice Sendak" },
    { title: "Frog and Toad", author: "Arnold Lobel" },
  ];

  const g36: FallbackBook[] = [
    { title: "Percy Jackson: The Lightning Thief", author: "Rick Riordan" },
    { title: "Harry Potter and the Sorcerer’s Stone", author: "J.K. Rowling" },
    { title: "Wings of Fire", author: "Tui T. Sutherland" },
    { title: "Diary of a Wimpy Kid", author: "Jeff Kinney" },
    { title: "Wonder", author: "R.J. Palacio" },
    { title: "The One and Only Ivan", author: "Katherine Applegate" },
    { title: "Holes", author: "Louis Sachar" },
    { title: "The Wild Robot", author: "Peter Brown" },
    { title: "Keeper of the Lost Cities", author: "Shannon Messenger" },
    { title: "Amulet", author: "Kazu Kibuishi" },
  ];

  const msHs: FallbackBook[] = [
    { title: "The Hunger Games", author: "Suzanne Collins" },
    { title: "Divergent", author: "Veronica Roth" },
    { title: "The Maze Runner", author: "James Dashner" },
    { title: "Ready Player One", author: "Ernest Cline" },
    { title: "Ender’s Game", author: "Orson Scott Card" },
    { title: "Scythe", author: "Neal Shusterman" },
    { title: "Legend", author: "Marie Lu" },
    { title: "Six of Crows", author: "Leigh Bardugo" },
    { title: "Steelheart", author: "Brandon Sanderson" },
    { title: "The Hate U Give", author: "Angie Thomas" },
  ];

  const adult: FallbackBook[] = [
    { title: "The Martian", author: "Andy Weir" },
    { title: "Project Hail Mary", author: "Andy Weir" },
    { title: "Gone Girl", author: "Gillian Flynn" },
    { title: "The Girl with the Dragon Tattoo", author: "Stieg Larsson" },
    { title: "Dune", author: "Frank Herbert" },
    { title: "1984", author: "George Orwell" },
    { title: "The Handmaid’s Tale", author: "Margaret Atwood" },
    { title: "Sapiens", author: "Yuval Noah Harari" },
  ];

  const base = deckKey === "k2" ? k2 : deckKey === "36" ? g36 : deckKey === "ms_hs" ? msHs : adult;

  const tags = Object.keys(tagCounts);
  const has = (prefix: string, value: string) => tags.includes(`${prefix}:${value}`);

  let pool = base;

  if (deckKey === "ms_hs") {
    if (has("genre", "dystopian") || has("topic", "post_apocalyptic")) {
      pool = base.filter((b) =>
        ["The Hunger Games", "Divergent", "The Maze Runner", "Scythe", "Legend"].includes(b.title)
      );
    } else if (has("topic", "gaming") || has("topic", "video_games")) {
      pool = base.filter((b) => ["Ready Player One"].includes(b.title)).concat(base);
    }
  }

  const shuffled = shuffleArray(pool.length ? pool : base);
  return shuffled.slice(0, count);
}


/**
 * Local re-ranking to reduce popularity bias.
 * Higher score = better match.
 */
export function scoreCandidateBook(book: any, tasteTags: string[]) {
  let score = 0;

  // Tight subject overlap
  if (book?.subjects && Array.isArray(book.subjects)) {
    const overlap = book.subjects.filter((s: string) =>
      tasteTags.some(t => s.toLowerCase().includes(t.toLowerCase()))
    ).length;
    score += overlap * 3;
  }


  return score;
}

export function weightedPick<T extends { __score?: number }>(items: T[]) {
  const total = items.reduce((sum, i) => sum + (i.__score ?? 0), 0);
  let r = Math.random() * total;
  for (const i of items) {
    r -= i.__score ?? 0;
    if (r <= 0) return i;
  }
  return items[0];
}