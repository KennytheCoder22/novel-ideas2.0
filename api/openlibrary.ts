import type { VercelRequest, VercelResponse } from '@vercel/node';

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

    const resp = await fetch(url, {
      headers: {
        Accept: "application/json",
      },
    });

    if (!resp.ok) {
      return res.status(resp.status).json({
        error: `OpenLibrary error: ${resp.status}`,
      });
    }

    const json = await resp.json();

    return res.status(200).json({
      ok: true,
      docs: Array.isArray(json?.docs) ? json.docs : [],
    });
  } catch (err: any) {
    return res.status(500).json({
      error: "OpenLibrary proxy failed",
      details: err?.message || String(err),
    });
  }
}