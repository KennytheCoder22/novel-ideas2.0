import type { VercelRequest, VercelResponse } from "@vercel/node";

const COMIC_VINE_BASE = "https://comicvine.gamespot.com/api";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const apiKey = String(process.env.COMICVINE_API_KEY || "").trim();
    if (!apiKey) {
      return res.status(500).json({ error: "COMICVINE_API_KEY missing on server runtime." });
    }

    const q = String(req.query.q || "").trim();
    const limit = Math.max(1, Math.min(50, Number(req.query.limit || 20)));
    if (!q) return res.status(400).json({ error: "Missing query (q)." });

    const params = new URLSearchParams({
      api_key: apiKey,
      format: "json",
      resources: "issue",
      query: q,
      limit: String(limit),
    });
    const url = `${COMIC_VINE_BASE}/search/?${params.toString()}`;

    const resp = await fetch(url, { headers: { Accept: "application/json" } });
    if (!resp.ok) return res.status(resp.status).json({ error: `ComicVine error: ${resp.status}` });

    const payload = await resp.json();
    return res.status(200).json({
      ok: true,
      results: Array.isArray(payload?.results) ? payload.results : [],
      number_of_page_results: Number(payload?.number_of_page_results || 0),
    });
  } catch (error: any) {
    return res.status(500).json({
      error: "ComicVine proxy failed",
      details: error?.message || String(error),
    });
  }
}
