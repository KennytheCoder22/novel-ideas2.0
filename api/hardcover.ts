const HARDCOVER_API_URL = "https://api.hardcover.app/v1/graphql";

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

    return res.status(200).json({
      ok: true,
      title,
      author,
      data: json?.data?.search?.results?.[0] ?? null,
      raw: json,
    });
  } catch (error: any) {
    return res.status(502).json({
      error: "Hardcover proxy request failed.",
      details: error instanceof Error ? error.message : String(error),
    });
  }
}
