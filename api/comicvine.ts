import type { VercelRequest, VercelResponse } from "@vercel/node";

const COMIC_VINE_BASE = "https://comicvine.gamespot.com/api";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const apiKey = String(process.env.COMICVINE_API_KEY || "").trim();
  const hasServerComicVineKey = Boolean(apiKey);
  const keyLength = apiKey.length;
  const q = String(req.query.q || "").trim();
  const limit = Math.max(1, Math.min(50, Number(req.query.limit || 20)));

  if (!apiKey) {
    return res.status(500).json({
      error: "COMICVINE_API_KEY missing on server runtime.",
      hasServerComicVineKey,
      keyLength,
      receivedQuery: q,
    });
  }

  if (!q) {
    return res.status(400).json({
      error: "Missing query (q).",
      hasServerComicVineKey,
      keyLength,
      receivedQuery: q,
    });
  }

  try {
    const params = new URLSearchParams({
      api_key: apiKey,
      format: "json",
      resources: "issue",
      query: q,
      limit: String(limit),
    });
    const outboundUrl = `${COMIC_VINE_BASE}/search/?${params.toString()}`;

    const resp = await fetch(outboundUrl, { headers: { Accept: "application/json" } });
    console.log("COMICVINE_PROXY_FETCH_RESPONSE", { status: resp.status, ok: resp.ok, query: q });
    if (!resp.ok) {
      const outboundErrorBody = await resp.text().catch(() => "");
      return res.status(resp.status).json({
        error: `ComicVine error: ${resp.status}`,
        hasServerComicVineKey,
        keyLength,
        outboundUrlHost: new URL(outboundUrl).host,
        outboundStatus: resp.status,
        outboundErrorBody,
        receivedQuery: q,
      });
    }

    const payload = await resp.json();
    console.log("COMICVINE_PROXY_PARSE_COMPLETE", {
      parsedTopLevelKeys: payload && typeof payload === "object" ? Object.keys(payload) : [],
      resultsLength: Array.isArray(payload?.results) ? payload.results.length : 0,
      firstResultTitle: Array.isArray(payload?.results) && payload.results[0] ? String(payload.results[0]?.name || payload.results[0]?.volume?.name || "") : "",
    });
    return res.status(200).json({
      ok: true,
      results: Array.isArray(payload?.results) ? payload.results : [],
      number_of_page_results: Number(payload?.number_of_page_results || 0),
      hasServerComicVineKey,
      keyLength,
      outboundUrlHost: new URL(outboundUrl).host,
      outboundStatus: resp.status,
      outboundErrorBody: null,
      receivedQuery: q,
    });
  } catch (error: any) {
    return res.status(500).json({
      error: "ComicVine proxy failed",
      details: error?.message || String(error),
      hasServerComicVineKey,
      keyLength,
      outboundUrlHost: new URL(COMIC_VINE_BASE).host,
      outboundStatus: null,
      outboundErrorBody: null,
      receivedQuery: q,
    });
  }
}
