const OPEN_LIBRARY_PROXY_TIMEOUT_MS = 5_500;
const OPEN_LIBRARY_PROXY_RETRY_DELAY_MS = 250;
const OPEN_LIBRARY_PROXY_MAX_ATTEMPTS = 3;

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

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);

    const q = (searchParams.get("q") || "").trim();
    const limit = Math.max(1, Math.min(160, Number(searchParams.get("limit") || 40)));

    if (!q) {
      return Response.json({ error: "Missing query (q)" }, { status: 400 });
    }

    const url =
      `https://openlibrary.org/search.json` +
      `?q=${encodeURIComponent(q)}` +
      `&limit=${limit}` +
      `&language=eng`;

    const upstream = await fetchOpenLibraryWithRetries(url);

    if (!upstream.ok) {
      return Response.json(
        {
          error: upstream.error,
          attempts: upstream.attempts,
          upstreamStatus: upstream.status,
          upstreamBodyPrefix: upstream.bodyPrefix,
        },
        { status: upstream.status >= 500 ? 502 : upstream.status }
      );
    }

    const json = upstream.json;

    return Response.json(
      {
        ok: true,
        docs: Array.isArray(json?.docs) ? json.docs : [],
        proxyAttempts: upstream.attempts,
      },
      {
        headers: {
          "Cache-Control": "s-maxage=300, stale-while-revalidate=86400",
        },
      }
    );
  } catch (err: any) {
    return Response.json(
      {
        error: "OpenLibrary proxy failed",
        details: err?.message || String(err),
      },
      { status: 502 }
    );
  }
}
