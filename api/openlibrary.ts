import type { VercelRequest, VercelResponse } from '@vercel/node';

const OPEN_LIBRARY_PROXY_TIMEOUT_MS = 5000;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const q = (req.query.q as string || "").trim();
    const limit = Math.max(1, Math.min(160, Number(req.query.limit || 40)));

    if (!q) {
      return res.status(400).json({ error: "Missing query (q)" });
    }

    const url =
      `https://openlibrary.org/search.json` +
      `?q=${encodeURIComponent(q)}` +
      `&limit=${limit}` +
      `&language=eng`;

    const startedAtMs = Date.now();
    const controller = new AbortController();
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, OPEN_LIBRARY_PROXY_TIMEOUT_MS);

    try {
      const resp = await fetch(url, {
        signal: controller.signal,
        headers: {
          Accept: "application/json",
        },
      });
      const text = await resp.text();
      const bodyPrefix = text.slice(0, 240);
      let json: any = {};
      try {
        json = text ? JSON.parse(text) : {};
      } catch {
        json = {};
      }

      if (!resp.ok) {
        return res.status(resp.status).json({
          error: `OpenLibrary error: ${resp.status}`,
          httpStatus: resp.status,
          responseBodyPrefix: bodyPrefix,
          elapsedMs: Date.now() - startedAtMs,
          timedOut,
        });
      }

      return res.status(200).json({
        ok: true,
        docs: Array.isArray(json?.docs) ? json.docs : [],
        diagnostics: {
          upstream: "direct",
          httpStatus: resp.status,
          elapsedMs: Date.now() - startedAtMs,
          timedOut,
        },
      });
    } finally {
      clearTimeout(timer);
    }
  } catch (err: any) {
    return res.status(500).json({
      error: "OpenLibrary proxy failed",
      details: err?.message || String(err),
      timedOut: err?.name === "AbortError" || /aborted|abort/i.test(String(err?.message || err || "")),
    });
  }
}
