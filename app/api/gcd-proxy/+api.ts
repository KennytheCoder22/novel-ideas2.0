export async function GET(request: Request) {
  const start = Date.now();
  try {
    const { searchParams } = new URL(request.url);
    const target = String(searchParams.get("url") || "").trim();
    if (!target) return Response.json({ error: "Missing url param" }, { status: 400 });
    if (!/^https:\/\/www\.comics\.org\//i.test(target)) {
      return Response.json({ error: "Target must be https://www.comics.org/*" }, { status: 400 });
    }

    const upstream = await fetch(target, {
      headers: {
        Accept: "text/html,application/json;q=0.9,*/*;q=0.8",
        "User-Agent": "NovelIdeas-GCD-Proxy/1.0",
      },
    });

    const body = await upstream.text();
    console.log("[GCD PROXY]", JSON.stringify({ status: upstream.status, target, ms: Date.now() - start }));

    return new Response(body, {
      status: upstream.status,
      headers: {
        "content-type": upstream.headers.get("content-type") || "text/plain; charset=utf-8",
        "cache-control": "no-store",
      },
    });
  } catch (err: any) {
    console.error("[GCD PROXY ERROR]", err?.message || String(err));
    return Response.json({ error: "GCD proxy failed", details: err?.message || String(err) }, { status: 500 });
  }
}
