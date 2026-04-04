// /screens/swipe/openLibraryFromTags.ts
//
// Band-agnostic recommendation engine utilities.
// IMPORTANT: This file must contain NO age-band / audience logic.
// Age-related query guardrails belong ONLY in openLibraryKids/PreTeen/Teen/Adult.

export type TagCounts = Record<string, number>;

// Medium words (movie/game/etc.) are noise for book matching and often pull in
// non-story trade/reference results. We strip these from the final keyword set.
const MEDIUM_TOKEN_STOP = new Set<string>([
  "tv",
  "television",
  "tv series",
  "movie",
  "film",
  "animation",
  "animated",
  "cartoon",
  "cartoons",
  "pixar",
  "disney",
  "screenplay",
  "script",
  "console",
  "xbox",
  "playstation",
  "ps4",
  "ps5",
  "nintendo",
  "switch",
  "wii",
  "steam",
  "mobile game",
  "pc game",
  "computer game",
  "board game",
  "card game",
  "dvd",
  "game",
  "games",
  "gaming",
  "video game",
  "video games",
  "platformer",
  "rpg",
  "mmorpg",
  "album",
  "albums",
  "music",
  "song",
  "songs",
  "soundtrack",
  "ost",
  "playlist",
  "mixtape",
]);

// Structural words (series/chapter/etc.) are also noise for book matching.
// They disproportionately pull in serialized/self-pub "Chapter X" items.
const STRUCTURAL_TOKEN_STOP = new Set<string>([
  "series",
  "chapter",
  "chapters",
  "volume",
  "vol",
  "part",
  "episode",
  "episodes",
  "installment",
  "book",
  "books",
]);

// Phrases we explicitly want to KEEP even though they include stop tokens.
const STRUCTURAL_PHRASE_ALLOW = new Set<string>(["chapter book"]);

function normalizeStopToken(s: string) {
  return String(s || "")
    .toLowerCase()
    .replace(/["'“”‘’]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeToken(s: string) {
  return String(s || "").replace(/_/g, " ").trim();
}

function stripStructuralNoiseKeepOrder(items: string[]) {
  const out: string[] = [];

  for (const kw of items) {
    const token = normalizeStopToken(kw);
    if (!token) continue;

    if (STRUCTURAL_PHRASE_ALLOW.has(token)) {
      out.push(kw);
      continue;
    }

    if (STRUCTURAL_TOKEN_STOP.has(token)) continue;

    const parts = token.split(" ");
    if (parts.some((p) => STRUCTURAL_TOKEN_STOP.has(p))) continue;

    out.push(kw);
  }

  return out;
}

function stripMediumNoiseKeepOrder(items: string[]) {
  const out: string[] = [];

  for (const kw of items) {
    const token = normalizeStopToken(kw);
    if (!token) continue;

    if (MEDIUM_TOKEN_STOP.has(token)) continue;

    const parts = token.split(" ");
    if (parts.some((p) => MEDIUM_TOKEN_STOP.has(p))) continue;

    out.push(kw);
  }

  return out;
}

function dedupeKeepOrder(items: string[]) {
  const seen = new Set<string>();
  const out: string[] = [];

  for (const it of items) {
    const key = normalizeStopToken(it);
    if (!key) continue;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(it);
  }

  return out;
}

function isExcludedPhrase(s: string) {
  const t = normalizeStopToken(s);
  return (
    !t ||
    MEDIUM_TOKEN_STOP.has(t) ||
    STRUCTURAL_TOKEN_STOP.has(t) ||
    /^(fast|illustrated|wholesome|heartwarming|adventurous)$/i.test(t)
  );
}

export type TagToKeywordsFn = (tag: string) => string[];

/**
 * Build a band-agnostic "swipe terms" query (NO age guardrails).
 * Pass a band-specific tag→keywords mapper from openLibraryKids/PreTeen/Teen/Adult.
 */
export function buildSwipeTermsQueryFromTagCounts(
  tagCounts: TagCounts,
  tagToKeywords: TagToKeywordsFn
): string {
  const scoreForSort = (tag: string, count: number) => {
    const base = Math.abs(count);
    const isVibe =
      tag.startsWith("vibe:") ||
      tag.startsWith("tone:") ||
      tag.startsWith("theme:") ||
      tag.startsWith("pacing:") ||
      tag.startsWith("pace:") ||
      tag.startsWith("mood:") ||
      tag.startsWith("style:");
    return base * (isVibe ? 3 : tag.startsWith("genre:") ? 0.75 : 1);
  };

  const sorted = Object.entries(tagCounts || {})
    .filter(([tag, count]) => count > 0 && !tag.startsWith("media:"))
    .sort(([aTag, aCount], [bTag, bCount]) => scoreForSort(bTag, bCount) - scoreForSort(aTag, aCount));

  const likedTags = sorted.map(([tag]) => tag);

  const keywordPairs = likedTags.map((tag) => ({
    tag,
    keywords: tagToKeywords(tag) || [],
  }));

  const flatten = (pairs: { tag: string; keywords: string[] }[]) => pairs.flatMap((p) => p.keywords);

  let positiveRaw = dedupeKeepOrder(
    stripStructuralNoiseKeepOrder(stripMediumNoiseKeepOrder(flatten(keywordPairs)))
  );

  const isQuotedPhrase = (k: string) => {
    const t = String(k || "").trim();
    return t.length >= 2 && t.startsWith('"') && t.endsWith('"');
  };

  const isConstraint = (k: string) => {
    const t = String(k || "").trim();
    return t.includes(" OR ") || t.startsWith('subject:"') || t.startsWith("subject:") || isQuotedPhrase(t);
  };

  const constraintPriority = (k: string) => {
    const t = normalizeStopToken(k);

    if (t.includes("middle grade") || t.includes("chapter book")) return 3;

    if (
      t.includes("picture book") ||
      t.includes("children's book") ||
      t.includes("childrens book") ||
      t.includes("children's story") ||
      t.includes("childrens story") ||
      t.includes("read aloud") ||
      t.includes("early reader") ||
      t.includes("chapter book") ||
      t.includes("middle grade") ||
      t.includes("graphic novel") ||
      t.includes("illustrated")
    ) {
      return 2;
    }

    if (t.includes("juvenile fiction") || t.includes("young adult fiction") || t.includes("ya fiction")) {
      return 0;
    }

    return 1;
  };

  const vibeishTag = (tag: string) =>
    tag.startsWith("vibe:") ||
    tag.startsWith("tone:") ||
    tag.startsWith("theme:") ||
    tag.startsWith("pacing:") ||
    tag.startsWith("pace:") ||
    tag.startsWith("mood:") ||
    tag.startsWith("style:");

  const vibePos = dedupeKeepOrder(
    stripMediumNoiseKeepOrder(
      keywordPairs
        .filter((p) => vibeishTag(p.tag))
        .flatMap((p) => p.keywords)
        .filter((k) => !isConstraint(k) && !String(k).trim().startsWith("-"))
    )
  );

  const otherPos = positiveRaw.filter(
    (k) => !isConstraint(k) && !String(k).trim().startsWith("-") && !vibePos.includes(k)
  );

  const basePos = positiveRaw
    .filter(isConstraint)
    .slice()
    .sort((a, b) => constraintPriority(b) - constraintPriority(a));

  const MAX_BASE = 1;
  const MAX_VIBE = 4;
  const MAX_OTHER = 4;

  const positiveList = [
    ...basePos.slice(0, MAX_BASE),
    ...vibePos.slice(0, MAX_VIBE),
    ...otherPos.slice(0, MAX_OTHER),
  ]
    .filter(Boolean)
    .filter((t) => !/^(fast|illustrated|wholesome|heartwarming|adventurous)$/i.test(String(t).replace(/["'“”]/g, "").trim()))
    .filter((t) => !String(t).trim().startsWith("-"));

  if (!positiveList.length) {
    const fallback = Object.entries(tagCounts)
      .filter(([tag, count]) => count > 0 && !isConstraint(tag))
      .map(([tag, count]) => {
        const raw = tag.includes(":") ? tag.split(":").slice(1).join(":") : tag;
        return { term: raw.replace(/[-_]/g, " ").trim(), w: Math.min(3, count) };
      })
      .filter((x) => x.term.length > 1 && !isExcludedPhrase(x.term))
      .sort((a, b) => b.w - a.w);

    const seen = new Set<string>();
    const picked: string[] = [];
    for (const f of fallback) {
      if (seen.has(f.term)) continue;
      seen.add(f.term);
      picked.push(f.term);
      if (picked.length >= 3) break;
    }
    return picked.join(" ");
  }

  return positiveList.join(" ");
}

function tokenizeLooseQuery(input: string): string[] {
  const tokens = String(input || "")
    .trim()
    .match(/"[^"]+"|\S+/g);
  return tokens ? tokens.map((t) => t.trim()).filter(Boolean) : [];
}

function cleanDiscoveryToken(token: string): string | null {
  const raw = String(token || "").trim();
  if (!raw) return null;

  if (/^subject:/i.test(raw)) {
    const inner = raw.replace(/^subject:/i, "").replace(/^"+|"+$/g, "").trim();
    if (!inner) return null;
    return inner;
  }

  const unquoted = raw.replace(/^"+|"+$/g, "").trim();
  if (!unquoted) return null;

  return unquoted;
}

const WEAK_DISCOVERY_TERMS = new Set<string>([
  "competition",
  "everyday",
  "everyday life",
  "life",
  "daily life",
  "drama",
  "family",
  "friendship",
  "friends",
  "school",
  "teen",
  "young adult",
  "fiction",
]);

const OPEN_LIBRARY_NOISE_TERMS = new Set<string>([
  "novel",
  "novels",
  "story",
  "stories",
  "book",
  "books",
  "life",
  "daily life",
  "everyday",
  "everyday life",
  "drama",
]);

const OPEN_LIBRARY_STOP_PHRASES = new Set<string>([
  "young adult fiction",
  "juvenile fiction",
  "middle grade fiction",
]);

const OPEN_LIBRARY_HIGH_SIGNAL_TERMS = new Set<string>([
  "survival",
  "mystery",
  "fantasy",
  "science fiction",
  "dystopian",
  "romance",
  "adventure",
  "exploration",
  "rebellion",
  "quest",
  "magic",
  "school",
  "friendship",
  "horror",
  "paranormal",
  "historical",
  "sports",
  "competition",
  "coming of age",
  "found family",
  "psychological",
]);

function splitDiscoveryPhrase(input: string): string[] {
  return String(input || "")
    .split(/[\/|,;]+/)
    .map((x) => x.trim())
    .filter(Boolean);
}

function normalizeOpenLibraryDiscoveryTerm(term: string): string {
  return String(term || "")
    .replace(/\bYA\b/gi, "young adult")
    .replace(/\bYoung Adult Fiction\b/gi, "young adult")
    .replace(/\bJuvenile Fiction\b/gi, "children")
    .replace(/\bMiddle Grade Fiction\b/gi, "middle grade")
    .replace(/\s+/g, " ")
    .trim();
}

function isOpenLibraryUsefulTerm(term: string): boolean {
  const t = normalizeStopToken(term);
  if (!t) return false;
  if (OPEN_LIBRARY_STOP_PHRASES.has(t)) return false;
  if (OPEN_LIBRARY_NOISE_TERMS.has(t)) return false;
  if (/^(fiction|young adult|children|middle grade)$/i.test(t)) return false;
  return true;
}

function rankOpenLibraryTerms(terms: string[]): string[] {
  const scored = terms.map((term, idx) => {
    const t = normalizeStopToken(term);
    let score = 0;

    if (OPEN_LIBRARY_HIGH_SIGNAL_TERMS.has(t)) score += 5;
    if (t.includes(" ")) score += 1;
    if (t.length >= 6) score += 1;
    if (/^(survival|mystery|fantasy|science fiction|dystopian|romance|adventure|exploration|rebellion|quest|magic|horror|paranormal|historical|sports|competition|coming of age|found family|psychological)$/i.test(t)) {
      score += 2;
    }

    return { term, score, idx };
  });

  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.idx - b.idx;
  });

  return scored.map((x) => x.term);
}

/**
 * Build an Open Library discovery query from the Google-shaped query.
 * This intentionally strips Google-specific syntax and reshapes the output
 * into a shorter, OL-friendlier keyword query.
 */
export function buildOpenLibraryDiscoveryQuery(
  rawQuery: string,
  opts?: {
    anchors?: string[];
    maxTerms?: number;
  }
): string {
  const rawTokens = tokenizeLooseQuery(rawQuery)
    .map(cleanDiscoveryToken)
    .filter((t): t is string => Boolean(t));

  const expanded = rawTokens.flatMap((t) =>
    splitDiscoveryPhrase(t).map(normalizeOpenLibraryDiscoveryTerm)
  );

  let cleaned = dedupeKeepOrder(
    stripStructuralNoiseKeepOrder(stripMediumNoiseKeepOrder(expanded))
  ).filter((t) => !String(t).trim().startsWith("-"));

  const normalized = cleaned.map((t) => normalizeOpenLibraryDiscoveryTerm(t));

  const hasYoungAdultSignal = normalized.some((t) => {
    const n = normalizeStopToken(t);
    return n.includes("young adult") || n === "teen" || n === "ya";
  });

  const hasChildrenSignal = normalized.some((t) => {
    const n = normalizeStopToken(t);
    return n.includes("children") || n.includes("juvenile");
  });

  const hasMiddleGradeSignal = normalized.some((t) => {
    const n = normalizeStopToken(t);
    return n.includes("middle grade");
  });

  const meaningful = normalized.filter(
    (t) => !WEAK_DISCOVERY_TERMS.has(normalizeStopToken(t))
  );
  const weakQuery = meaningful.length < 2;

  const rawAnchors = dedupeKeepOrder(
    (opts?.anchors || [])
      .map((x) => normalizeOpenLibraryDiscoveryTerm(normalizeToken(x)))
      .flatMap((x) => splitDiscoveryPhrase(x))
      .filter((x) => x.length > 1)
  );

  const usefulAnchors = rawAnchors.filter(isOpenLibraryUsefulTerm);
  const usefulTerms = normalized.filter(isOpenLibraryUsefulTerm);

  const rankedTerms = rankOpenLibraryTerms(
    dedupeKeepOrder([
      ...usefulTerms,
      ...(weakQuery ? usefulAnchors : []),
    ])
  ).filter((term) => {
    const t = normalizeStopToken(term);

    // Be much stricter about vague carryover terms.
    if (
      t === "family" ||
      t === "friendship" ||
      t === "friends" ||
      t === "school" ||
      t === "drama" ||
      t === "life" ||
      t === "daily life" ||
      t === "everyday" ||
      t === "everyday life"
    ) {
      return false;
    }

    return true;
  });

  const subjectAnchors: string[] = ["fiction"];
  if (hasYoungAdultSignal) {
    subjectAnchors.push("young adult");
  } else if (hasMiddleGradeSignal) {
    subjectAnchors.push("middle grade");
  } else if (hasChildrenSignal) {
    subjectAnchors.push("children");
  }

  // Keep OL much shorter/tighter than before.
  const maxTerms = Math.max(3, Math.min(5, opts?.maxTerms ?? 4));
  const contentLimit = Math.max(1, maxTerms - subjectAnchors.length);

  const strongestTerms = rankedTerms.slice(0, contentLimit);

  const merged = dedupeKeepOrder([
    ...subjectAnchors,
    ...strongestTerms,
  ]);

  return merged.slice(0, maxTerms).join(" ").trim();
}
/**
 * Generic Google Books search.
 * NOTE: no age-band behavior here; callers may pass maxAllowedMaturityRating if desired.
 */
export async function openLibrarySearch(
  query: string,
  limit = 24,
  opts?: {
    orderBy?: "relevance" | "newest";
    langRestrict?: string;
    maxAllowedMaturityRating?: "not-mature" | "mature";
    timeoutMs?: number;
  }
) {
  const maxResults = Math.max(1, Math.min(80, limit));
  const apiKey = (process as any)?.env?.EXPO_PUBLIC_GOOGLE_BOOKS_API_KEY as string | undefined;

  const q = String(query || "").trim();
  const orderBy = opts?.orderBy ?? "relevance";
  const langRestrict = opts?.langRestrict ?? "en";
  const maxAllowedMaturityRating = opts?.maxAllowedMaturityRating;
  const timeoutMs = opts?.timeoutMs ?? 15000;

  const url =
    `https://www.googleapis.com/books/v1/volumes` +
    `?q=${encodeURIComponent(q)}` +
    `&printType=books` +
    `&orderBy=${orderBy}` +
    `&maxResults=${maxResults}` +
    `&langRestrict=${encodeURIComponent(langRestrict)}` +
    (maxAllowedMaturityRating
      ? `&maxAllowedMaturityRating=${encodeURIComponent(maxAllowedMaturityRating)}`
      : ``) +
    (apiKey ? `&key=${encodeURIComponent(apiKey)}` : "");

  const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
  const timer =
    controller && timeoutMs
      ? setTimeout(() => {
          try {
            controller.abort();
          } catch {}
        }, timeoutMs)
      : null;

  try {
    const resp = await fetch(url, controller ? { signal: controller.signal } : undefined);
    if (!resp.ok) throw new Error(`Google Books error: ${resp.status}`);
    const data = await resp.json();
    const items = Array.isArray(data?.items) ? data.items : [];

    const titleBans =
      /\b(journal|newsletter|periodical|proceedings|thesis|dissertation|catalog(ue)?|index|handbook|manual|textbook|workbook|curriculum|lesson|teaching|teacher|pedagogy|study guide|analysis|criticism|research|reference|encyclopedia|dictionary|publishing record|book publishing record|cumulative|review|book review|magazine|newspaper)\b/i;

    const categoryBans =
      /\b(periodicals|newspapers|magazines|bibliography|reference|catalogs?|indexes?|publishing|book industry|library science)\b/i;

    const descriptionBans = titleBans;

    const docs = items
      .filter((it: any) => {
        const v = it?.volumeInfo;
        if (!v) return false;
        if (v.printType && String(v.printType).toUpperCase() !== "BOOK") return false;

        const title = `${v.title ?? ""} ${v.subtitle ?? ""}`.trim();
        if (titleBans.test(title)) return false;

        const cats = Array.isArray(v.categories) ? v.categories.join(" ") : "";
        if (cats && categoryBans.test(cats)) return false;

        const desc = typeof v.description === "string" ? v.description : "";
        if (desc && descriptionBans.test(desc)) return false;

        const hasAuthor = Array.isArray(v.authors) && v.authors.length > 0;
        const hasPublisher = typeof v.publisher === "string" && v.publisher.trim().length > 0;
        if (!hasAuthor && !hasPublisher) return false;

        const ids = Array.isArray(v.industryIdentifiers) ? v.industryIdentifiers : [];
        if (ids.length) {
          const hasIsbn = ids.some((x: any) => {
            const t = String(x?.type ?? "").toUpperCase();
            return t === "ISBN_10" || t === "ISBN_13";
          });
          if (!hasIsbn) return false;
        }

        return true;
      })
      .slice(0, limit)
      .map((it: any) => {
        const vi = it?.volumeInfo || {};
        const imageLinks = vi?.imageLinks || {};
        const publishedDate = vi?.publishedDate ? String(vi.publishedDate) : "";
        const m = publishedDate.match(/(\d{4})/);
        const year = m ? Number(m[1]) : undefined;

        const thumb =
          (typeof imageLinks?.thumbnail === "string" && imageLinks.thumbnail) ||
          (typeof imageLinks?.smallThumbnail === "string" && imageLinks.smallThumbnail) ||
          undefined;

        const cleanThumb = thumb ? String(thumb).replace(/^http:\/\//, "https://") : undefined;

        return {
          key: it?.id,
          id: it?.id,
          title: vi?.title,
          subtitle: vi?.subtitle,
          author_name: Array.isArray(vi?.authors) ? vi.authors : undefined,
          authors: Array.isArray(vi?.authors) ? vi.authors : undefined,
          first_publish_year: Number.isFinite(year as any) ? (year as number) : undefined,
          cover_i: cleanThumb,
          publisher: typeof vi?.publisher === "string" ? vi.publisher : undefined,
          categories: Array.isArray(vi?.categories) ? vi.categories : undefined,
          description: typeof vi?.description === "string" ? vi.description : undefined,
          averageRating:
            Number.isFinite(Number(vi?.averageRating)) ? Number(vi.averageRating) : undefined,
          ratingsCount:
            Number.isFinite(Number(vi?.ratingsCount)) ? Number(vi.ratingsCount) : undefined,
          source: "googleBooks",
          volumeInfo: vi,
        };
      });

    return docs;
  } finally {
    if (timer) clearTimeout(timer as any);
  }
}

export async function openLibraryHttpSearch(
  query: string,
  limit = 24,
  opts?: {
    lang?: string;
    timeoutMs?: number;
  }
) {
  const q = String(query || "").trim();
  if (!q) return [];

  const maxResults = Math.max(1, Math.min(80, limit));
  const lang = opts?.lang ?? "eng";
  const timeoutMs = opts?.timeoutMs ?? 15000;

  const url =
    `/api/openlibrary?q=${encodeURIComponent(q)}&limit=${maxResults}`;

  const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
  const timer =
    controller && timeoutMs
      ? setTimeout(() => {
          try {
            controller.abort();
          } catch {}
        }, timeoutMs)
      : null;

  try {
    const resp = await fetch(url, controller ? { signal: controller.signal } : undefined);
    if (!resp.ok) throw new Error(`Open Library error: ${resp.status}`);
    const data = await resp.json();
    const docs = Array.isArray(data?.docs) ? data.docs : [];

    const titleBans =
      /\b(journal|newsletter|periodical|proceedings|thesis|dissertation|catalog(ue)?|index|handbook|manual|textbook|workbook|curriculum|lesson|teaching|teacher|pedagogy|study guide|analysis|criticism|research|reference|encyclopedia|dictionary|publishing record|book publishing record|cumulative|review|book review|magazine|newspaper)\b/i;

    return docs
      .filter((d: any) => {
        const title = `${d?.title ?? ""} ${d?.subtitle ?? ""}`.trim();
        if (!title) return false;
        if (titleBans.test(title)) return false;

        const hasAuthor = Array.isArray(d?.author_name) && d.author_name.length > 0;
        const hasYear = Number.isFinite(Number(d?.first_publish_year));
        if (!hasAuthor && !hasYear) return false;

        return true;
      })
      .slice(0, limit)
      .map((d: any) => ({
        key: d?.key,
        id: d?.key,
        title: d?.title,
        subtitle: d?.subtitle,
        author_name: Array.isArray(d?.author_name) ? d.author_name : undefined,
        authors: Array.isArray(d?.author_name) ? d.author_name : undefined,
        first_publish_year: Number.isFinite(Number(d?.first_publish_year))
          ? Number(d.first_publish_year)
          : undefined,
        cover_i: Number.isFinite(Number(d?.cover_i)) ? Number(d.cover_i) : d?.cover_i,
        publisher: Array.isArray(d?.publisher) && d.publisher.length ? String(d.publisher[0]) : undefined,
        subjects: Array.isArray(d?.subject) ? d.subject : undefined,
        categories: Array.isArray(d?.subject) ? d.subject : undefined,
        description: undefined,
        ratingsCount: undefined,
        averageRating: undefined,
        edition_count: Number.isFinite(Number(d?.edition_count)) ? Number(d.edition_count) : undefined,
        source: "openLibrary",
      }));
  } finally {
    if (timer) clearTimeout(timer as any);
  }
}

export function coverUrlFromCoverId(
  coverId?: number | string,
  size: "S" | "M" | "L" = "M"
) {
  if (!coverId) return null;

  if (typeof coverId === "string" && /^https?:\/\//i.test(coverId)) {
    return coverId.replace(/^http:\/\//, "https://");
  }

  return `https://covers.openlibrary.org/b/id/${coverId}-${size}.jpg`;
}

// Backward-compatible alias: older code imported openLibrarySearch from this file.
export const googleBooksSearch = openLibrarySearch;