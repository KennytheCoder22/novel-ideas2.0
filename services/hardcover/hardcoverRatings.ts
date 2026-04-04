// services/hardcover/hardcoverRatings.ts

type HardcoverResult = {
  rating?: number;
  ratings_count?: number;
};

export async function getHardcoverRatings(
  title: string,
  author?: string
): Promise<HardcoverResult | null> {
  const safeTitle = String(title || "").trim();
  const safeAuthor = String(author || "").trim();

  if (!safeTitle) {
    return null;
  }

  try {
    const params = new URLSearchParams();
    params.set("title", safeTitle);
    if (safeAuthor) params.set("author", safeAuthor);

    const response = await fetch(`/api/hardcover?${params.toString()}`);
    const json = await response.json();

    console.log("[Hardcover proxy response]", safeTitle, json);

    const book = json?.data;
    if (!book) return null;

    return {
      rating: book.rating ?? 0,
      ratings_count: book.ratings_count ?? 0,
    };
  } catch (err) {
    console.warn("[HardcoverRatings] proxy lookup failed:", err);
    return null;
  }
}
