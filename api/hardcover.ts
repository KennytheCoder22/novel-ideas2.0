const HARDCOVER_API_URL = "https://api.hardcover.app/v1/graphql";

function norm(value: any): string {
  return String(value || "")
    .toLowerCase()
    .replace(/[_\-:;,.!?()[\]{}'"`]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenSet(value: string): Set<string> {
  return new Set(norm(value).split(" ").filter(Boolean));
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (!a.size || !b.size) return 0;
  let intersection = 0;
  for (const item of a) {
    if (b.has(item)) intersection += 1;
  }
  const union = new Set([...a, ...b]).size;
  return union ? intersection / union : 0;
}

function extractCandidateDocs(json: any): any[] {
  const hits = json?.data?.search?.results?.hits;
  if (Array.isArray(hits)) {
    return hits
      .map((hit: any) => hit?.document || null)
      .filter(Boolean);
  }

  const results = json?.data?.search?.results;
  if (Array.isArray(results)) {
    return results.filter(Boolean);
  }

  return [];
}

function pickBestLiteralMatch(docs: any[], title: string, author?: string): any | null {
  const titleNorm = norm(title);
  const authorNorm = norm(author || "");
  const titleTokens = tokenSet(title);
  const authorTokens = tokenSet(author || "");

  let bestDoc: any | null = null;
  let bestScore = -1;

  for (const doc of docs) {
    const docTitle = String(
      doc?.title ||
      doc?.name ||
      doc?.book?.title ||
      ""
    ).trim();

    const docAuthor = String(
      doc?.author ||
      doc?.author_name ||
      doc?.authors?.[0]?.name ||
      doc?.book?.author ||
      ""
    ).trim();

    if (!docTitle) continue;

    const docTitleNorm = norm(docTitle);
    const docAuthorNorm = norm(docAuthor);
    const titleSimilarity = jaccard(titleTokens, tokenSet(docTitle));
    const authorSimilarity = authorNorm ? jaccard(authorTokens, tokenSet(docAuthor)) : 0;

    let score = 0;

    if (docTitleNorm === titleNorm) score += 100;
    else if (docTitleNorm.includes(titleNorm) || titleNorm.includes(docTitleNorm)) score += 40;
    else score += Math.round(titleSimilarity * 30);

    if (authorNorm) {
      if (docAuthorNorm === authorNorm) score += 30;
      else if (docAuthorNorm && (docAuthorNorm.includes(authorNorm) || authorNorm.includes(docAuthorNorm))) score += 15;
      else score += Math.round(authorSimilarity * 10);
    }

    if (score > bestScore) {
      bestScore = score;
      bestDoc = doc;
    }
  }

  const strongTitleMatch =
    bestDoc &&
    (norm(bestDoc?.title || bestDoc?.name || bestDoc?.book?.title || "") === titleNorm ||
      jaccard(titleTokens, tokenSet(String(bestDoc?.title || bestDoc?.name || bestDoc?.book?.title || ""))) >= 0.8);

  const strongAuthorMatch =
    !authorNorm ||
    (bestDoc &&
      (norm(bestDoc?.author || bestDoc?.author_name || bestDoc?.authors?.[0]?.name || bestDoc?.book?.author || "") === authorNorm ||
       jaccard(authorTokens, tokenSet(String(bestDoc?.author || bestDoc?.author_name || bestDoc?.authors?.[0]?.name || bestDoc?.book?.author || ""))) >= 0.7));

  if (strongTitleMatch && strongAuthorMatch) return bestDoc;
  return null;
}

export default async function handler(req: any, res: any) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const token = process.env.HARDCOVER_API_TOKEN;
    const title = String(req.query?.title || "").trim();
    const author = String(req.query?.author || "").trim();

    if (!token) {
      return res.status(500).json({ error: "Missing HARDCOVER_API_TOKEN on server." });
    }

    if (!title) {
      return res.status(400).json({ error: "Missing required query parameter: title" });
    }

    const query = `
      query SearchBooks($query: String!) {
        search(query: $query) {
          ids
          results
        }
      }
    `;

    const response = await fetch(HARDCOVER_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        query,
        variables: {
          query: author ? `${title} ${author}` : title,
        },
      }),
    });

    const rawText = await response.text();

    let json: any;
    try {
      json = JSON.parse(rawText);
    } catch {
      return res.status(502).json({
        error: "Invalid JSON from Hardcover API.",
        status: response.status,
        raw: rawText.slice(0, 1000),
      });
    }

    if (!response.ok) {
      return res.status(response.status).json({
        error: "Hardcover API request failed.",
        status: response.status,
        raw: json,
      });
    }

    const docs = extractCandidateDocs(json);
    const matched = pickBestLiteralMatch(docs, title, author);

    return res.status(200).json({
      ok: true,
      title,
      author,
      data: matched,
      match_found: Boolean(matched),
      candidate_count: docs.length,
    });
  } catch (error: any) {
    return res.status(502).json({
      error: "Hardcover proxy request failed.",
      details: error instanceof Error ? error.message : String(error),
    });
  }
}
