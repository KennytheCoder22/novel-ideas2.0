// /api/nyt-books.ts

import type { VercelRequest, VercelResponse } from "@vercel/node";

const NYT_BASE_URL = "https://api.nytimes.com/svc/books/v3/lists";

function asSingle(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return String(value[0] || "").trim();
  return String(value || "").trim();
}

function toSafeDate(value: string): string {
  const cleaned = value.trim();
  if (!cleaned || cleaned.toLowerCase() === "current") return "current";
  if (/^\d{4}-\d{2}-\d{2}$/.test(cleaned)) return cleaned;
  return "current";
}

function toSafeList(value: string): string {
  return value.trim().toLowerCase();
}

function toSafeLimit(value: string): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 15;
  return Math.max(1, Math.min(40, parsed));
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const apiKey = process.env.NYT_BOOKS_API_KEY;

  if (!apiKey) {
    return res.status(500).json({ error: "Missing NYT_BOOKS_API_KEY" });
  }

  const rawList = asSingle(req.query.list);
  const rawDate = asSingle(req.query.date);
  const rawLimit = asSingle(req.query.limit);

  const list = toSafeList(rawList);
  const date = toSafeDate(rawDate);
  const limit = toSafeLimit(rawLimit);

  if (!list) {
    return res.status(400).json({ error: "Missing required query param: list" });
  }

  const url = new URL(`${NYT_BASE_URL}/${date}/${encodeURIComponent(list)}.json`);
  url.searchParams.set("api-key", apiKey);

  try {
    const response = await fetch(url.toString(), {
      headers: {
        Accept: "application/json",
      },
    });

    const text = await response.text();
    let payload: any = null;

    try {
      payload = text ? JSON.parse(text) : null;
    } catch {
      return res.status(502).json({ error: "Invalid JSON returned from NYT Books API" });
    }

    if (!response.ok) {
      return res.status(response.status).json({
        error:
          typeof payload?.fault?.faultstring === "string"
            ? payload.fault.faultstring
            : typeof payload?.message === "string"
            ? payload.message
            : "NYT Books API request failed",
      });
    }

    const books = Array.isArray(payload?.results?.books) ? payload.results.books.slice(0, limit) : [];

    return res.status(200).json({
      status: payload?.status || "OK",
      copyright: payload?.copyright,
      num_results: books.length,
      results: {
        ...payload?.results,
        books,
      },
    });
  } catch (error: any) {
    return res.status(500).json({
      error: typeof error?.message === "string" ? error.message : "Unexpected NYT proxy error",
    });
  }
}