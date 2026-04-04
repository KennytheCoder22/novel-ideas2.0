// /screens/swipe/openLibraryCore.ts
//
// NOTE: Despite historical file naming, this module now supports Google Books lookup.
// Keep names stable to avoid routing churn elsewhere in the app.

export type TagCounts = Record<string, number>;

// Medium words (movie/game/etc.) are noise for "vibe" matching and often pull in
// non-story trade/reference results. We strip these from the final keyword set.
export const MEDIUM_TOKEN_STOP = new Set<string>([
  "tv",
  "television",
  "tv series",
  "series",
  "movie",
  "film",
  "animation",
  "dvd",
  "game",
  "games",
  "gaming",
  "video game",
  "video games",
  "platformer",
  "rpg",
  "mmorpg",
]);

export function normalizeStopToken(s: string) {
  return String(s || "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/^[\"\']+|[\"\']+$/g, "")
    .trim();
}

export function normalizeToken(s: string) {
  return String(s || "").replace(/_/g, " ").trim();
}

export function coreTagToKeywords(tag: string): string[] {
  // Tag formats we use: "genre:fantasy", "topic:space", "format:graphic_novel", etc.
  const [rawKey, rawVal] = tag.split(":");
  const key = (rawKey || "").trim();
  const val = normalizeToken((rawVal || "").trim());

  if (!key || !val) return [];

  // Higher-quality mappings for common tags
  if (key === "genre") {
    if (val === "scifi") return ["science fiction", "sci fi"];
    if (val === "dystopian") return ["dystopian", "post apocalyptic"];
    if (val === "urban fantasy") return ["urban fantasy", "magic in the real world"];
    if (val === "superheroes") return ["superheroes", "super hero"];
    if (val === "cyberpunk") return ["cyberpunk", "high tech noir"];
    return [val];
  }

  if (key === "topic") {
    if (val === "virtual reality") return ["virtual reality", "vr", "alternate reality"];
    if (val === "time travel") return ["time travel"];
    if (val === "ai") return ["artificial intelligence", "ai"];
    if (val === "gaming") return ["quest", "adventure", "competition", "strategy"];
    if (val === "magic school") return ["magic school", "training"];
    return [val];
  }

  if (key === "format") {
    if (val === "graphic novel") return ["graphic novel", "comics"];
    if (val === "audiobook friendly") return ["audiobook", "audio"];
    if (val === "short stories") return ["short stories"];
    if (val === "verse novel") return ["verse novel"];
    if (val === "series") return ["series"];
    if (val === "standalone") return ["standalone"];
    return [val];
  }

  if (key === "vibe") {
    if (val === "funny") return ["funny", "humor"];
    if (val === "dark") return ["dark"];
    if (val === "cozy") return ["cozy"];
    if (val === "twisty") return ["plot twist", "twisty"];
    if (val === "epic") return ["epic"];
    if (val === "weird") return ["weird"];
    if (val === "hype") return ["fast paced", "high energy"];
    return [val];
  }

  if (key === "pace") {
    if (val === "fast") return ["fast paced", "page turner"];
    if (val === "short chapters") return ["short chapters"];
    if (val === "not too long") return ["short", "quick read"];
    return [val];
  }

  if (key === "theme") {
    if (val === "found family") return ["found family"];
    if (val === "friendship") return ["friendship"];
    return [val];
  }

  if (key === "world") {
    if (val === "realistic") return ["realistic"];
    if (val === "fantasy") return ["fantasy"];
    return [val];
  }

  // phrase normalization additions
  if (val === "found family") return ["found family"];
  if (val === "coming of age") return ["coming of age"];

  // fallback: just use the value
  return [val];
}

export type OLDoc = {
  key?: string; // Google Books volume id
  title?: string;
  author_name?: string[];
  first_publish_year?: number;
  cover_i?: number | string; // historically Open Library cover id; now can be a URL string (Google Books)
};

function parseYear(publishedDate?: string): number | undefined {
  if (!publishedDate) return undefined;
  const m = String(publishedDate).match(/(\d{4})/);
  if (!m) return undefined;
  const y = Number(m[1]);
  return Number.isFinite(y) ? y : undefined;
}

function cleanGoogleThumb(url?: string): string | undefined {
  if (!url) return undefined;
  // Prefer https
  let u = url.replace(/^http:\/\//, "https://");
  // Many Google thumbs support zoom param; keep as-is but strip edge junk.
  return u;
}

export async function googleBooksSearch(query: string, limit = 12) {
  const maxResults = Math.max(1, Math.min(40, limit)); // Google Books caps maxResults at 40
  const url =
    `https://www.googleapis.com/books/v1/volumes` +
    `?q=${encodeURIComponent(query)}` +
    `&printType=books` +
    `&orderBy=relevance` +
    `&maxResults=${maxResults}` +
    `&langRestrict=en`;

  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`Google Books error: ${resp.status}`);
  const data = await resp.json();

  const items = Array.isArray(data?.items) ? data.items : [];
  const docs: OLDoc[] = items.slice(0, limit).map((it: any) => {
    const vi = it?.volumeInfo || {};
    const imageLinks = vi?.imageLinks || {};
    const cover =
      cleanGoogleThumb(imageLinks?.thumbnail) ||
      cleanGoogleThumb(imageLinks?.smallThumbnail) ||
      undefined;

    return {
      key: it?.id,
      title: vi?.title,
      author_name: Array.isArray(vi?.authors) ? vi.authors : undefined,
      first_publish_year: parseYear(vi?.publishedDate),
      cover_i: cover,
    };
  });

  console.log(
    "[NovelIdeas][GB] raw docs",
    docs.length,
    docs.slice(0, 3).map((d: any) => ({
      title: d?.title,
      author: d?.author_name?.[0],
      key: d?.key,
      cover: d?.cover_i,
      year: d?.first_publish_year,
    }))
  );

  return docs.slice(0, limit);
}

export function coverUrlFromCoverId(coverId?: number | string, size: "S" | "M" | "L" = "M") {
  if (!coverId) return null;
  if (typeof coverId === "string") return coverId; // Google Books thumbnail URL
  return `https://covers.openlibrary.org/b/id/${coverId}-${size}.jpg`;
}