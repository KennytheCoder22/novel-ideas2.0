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

    const resp = await fetch(url, {
      headers: {
        Accept: "application/json",
      },
    });

    if (!resp.ok) {
      return Response.json(
        { error: `OpenLibrary error: ${resp.status}` },
        { status: resp.status }
      );
    }

    const json = await resp.json();

    return Response.json({
      ok: true,
      docs: Array.isArray(json?.docs) ? json.docs : [],
    });
  } catch (err: any) {
    return Response.json(
      {
        error: "OpenLibrary proxy failed",
        details: err?.message || String(err),
      },
      { status: 500 }
    );
  }
}
