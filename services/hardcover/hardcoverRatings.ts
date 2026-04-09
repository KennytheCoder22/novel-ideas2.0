// services/hardcover/hardcoverRatings.ts

type HardcoverResult = {
  rating?: number;
  ratings_count?: number;
};

type CacheEntry = {
  value: HardcoverResult | null;
  expiresAt: number;
};

const hardcoverCache = new Map<string, CacheEntry>();
const SUCCESS_TTL_MS = 1000 * 60 * 60 * 6;
const FAILURE_TTL_MS = 1000 * 60 * 10;

function cacheKey(title: string, author?: string): string {
  return `${String(title || "").trim().toLowerCase()}::${String(author || "").trim().toLowerCase()}`;
}

export async function getHardcoverRatings(
  title: string,
  author?: string
): Promise<HardcoverResult | null> {
  const safeTitle = String(title || "").trim();
  const safeAuthor = String(author || "").trim();

  if (!safeTitle) return null;

  const key = cacheKey(safeTitle, safeAuthor);
  const now = Date.now();
  const cached = hardcoverCache.get(key);
  if (cached && cached.expiresAt > now) return cached.value;

  try {
    const params = new URLSearchParams();
    params.set("title", safeTitle);
    if (safeAuthor) params.set("author", safeAuthor);

    const response = await fetch(`/api/hardcover?${params.toString()}`);
    const json = await response.json();

    console.log("[Hardcover proxy response]", safeTitle, json);

    const book = json?.data;
    if (!book) {
      hardcoverCache.set(key, { value: null, expiresAt: now + FAILURE_TTL_MS });
      return null;
    }

    const result = {
      rating: book.rating ?? 0,
      ratings_count: book.ratings_count ?? 0,
    };

    hardcoverCache.set(key, { value: result, expiresAt: now + SUCCESS_TTL_MS });
    return result;
  } catch (err) {
    console.warn("[HardcoverRatings] proxy lookup failed:", err);
    hardcoverCache.set(key, { value: null, expiresAt: now + FAILURE_TTL_MS });
    return null;
  }
}
