import type { VercelRequest, VercelResponse } from '@vercel/node';

const OPEN_LIBRARY_PROXY_TIMEOUT_MS = 5_500;
const OPEN_LIBRARY_PROXY_RETRY_DELAY_MS = 250;
const OPEN_LIBRARY_PROXY_MAX_ATTEMPTS = 3;
const DEFAULT_OPEN_LIBRARY_FIELDS = [
  "key",
  "title",
  "subtitle",
  "author_name",
  "first_publish_year",
  "cover_i",
  "edition_key",
  "subject",
  "subject_key",
  "subject_facet",
  "first_sentence",
  "description",
].join(",");

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchOpenLibraryWithRetries(url: string) {
  let lastStatus = 0;
  let lastError = "";
  let lastBodyPrefix = "";
  let lastAttempt = 0;

  for (let attempt = 1; attempt <= OPEN_LIBRARY_PROXY_MAX_ATTEMPTS; attempt += 1) {
    lastAttempt = attempt;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), OPEN_LIBRARY_PROXY_TIMEOUT_MS);
    const startedAt = Date.now();
    try {
      const resp = await fetch(url, {
        signal: controller.signal,
        headers: {
          Accept: "application/json",
          "User-Agent": "NovelIdeas/1.0 OpenLibrary proxy health",
        },
      });
      const text = await resp.text();
      lastStatus = resp.status;
      lastBodyPrefix = text.trim().slice(0, 240);

      if (resp.ok) {
        return {
          ok: true,
          status: resp.status,
          json: JSON.parse(text),
          attempts: attempt,
          elapsedMs: Date.now() - startedAt,
        };
      }

      lastError = `OpenLibrary error: ${resp.status}`;
      if (resp.status < 500 && resp.status !== 429) break;
    } catch (err: any) {
      lastError = err?.name === "AbortError"
        ? "OpenLibrary upstream timeout"
        : err?.message || String(err);
    } finally {
      clearTimeout(timeout);
    }

    if (attempt < OPEN_LIBRARY_PROXY_MAX_ATTEMPTS) await sleep(OPEN_LIBRARY_PROXY_RETRY_DELAY_MS * attempt);
  }

  return {
    ok: false,
    status: lastStatus || 504,
    error: lastError || "OpenLibrary proxy failed",
    bodyPrefix: lastBodyPrefix || undefined,
    attempts: lastAttempt || OPEN_LIBRARY_PROXY_MAX_ATTEMPTS,
  };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const q = (req.query.q as string || "").trim();
    const limit = Math.max(1, Math.min(160, Number(req.query.limit || 40)));
    const fields = String(req.query.fields || DEFAULT_OPEN_LIBRARY_FIELDS).trim();

    if (!q) {
      return res.status(400).json({ error: "Missing query (q)" });
    }

    const url =
      `https://openlibrary.org/search.json` +
      `?q=${encodeURIComponent(q)}` +
      `&limit=${limit}` +
      `&fields=${encodeURIComponent(fields)}` +
      `&language=eng`;

    const upstream = await fetchOpenLibraryWithRetries(url);

    if (!upstream.ok) {
      return res.status(upstream.status >= 500 ? 502 : upstream.status).json({
        error: upstream.error,
        attempts: upstream.attempts,
        upstreamStatus: upstream.status,
        upstreamBodyPrefix: upstream.bodyPrefix,
      });
    }

    const json = upstream.json;
    res.setHeader("Cache-Control", "s-maxage=300, stale-while-revalidate=86400");

    return res.status(200).json({
      ok: true,
      docs: Array.isArray(json?.docs) ? json.docs : [],
      proxyAttempts: upstream.attempts,
    });
  } catch (err: any) {
    return res.status(502).json({
      error: "OpenLibrary proxy failed",
      details: err?.message || String(err),
    });
  }
}
