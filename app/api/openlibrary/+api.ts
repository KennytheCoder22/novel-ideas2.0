const OPEN_LIBRARY_PROXY_TIMEOUT_MS = 5000;

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
        return Response.json(
          {
            error: `OpenLibrary error: ${resp.status}`,
            httpStatus: resp.status,
            responseBodyPrefix: bodyPrefix,
            elapsedMs: Date.now() - startedAtMs,
            timedOut,
          },
          { status: resp.status }
        );
      }

      return Response.json({
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
    return Response.json(
      {
        error: "OpenLibrary proxy failed",
        details: err?.message || String(err),
        timedOut: err?.name === "AbortError" || /aborted|abort/i.test(String(err?.message || err || "")),
      },
      { status: 500 }
    );
  }
}
