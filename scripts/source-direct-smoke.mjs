#!/usr/bin/env node

const openLibraryQueries = ["fantasy", "science fiction", "mystery"];
const kitsuQueries = ["fantasy", "fantasy romance", "mystery"];

async function hit(url) {
  const started = Date.now();
  try {
    const res = await fetch(url, { headers: { accept: "application/json" } });
    const text = await res.text();
    let parsedCount = null;
    try {
      const json = JSON.parse(text);
      if (Array.isArray(json?.docs)) parsedCount = json.docs.length;
      else if (Array.isArray(json?.items)) parsedCount = json.items.length;
      else if (Array.isArray(json?.data)) parsedCount = json.data.length;
      else if (Array.isArray(json)) parsedCount = json.length;
      else parsedCount = 0;
    } catch {
      parsedCount = null;
    }
    return {
      status: res.status,
      ok: res.ok,
      elapsedMs: Date.now() - started,
      bodyPrefix: text.slice(0, 300),
      parsedCount,
      error: null,
    };
  } catch (err) {
    return {
      status: null,
      ok: false,
      elapsedMs: Date.now() - started,
      bodyPrefix: null,
      parsedCount: null,
      error: String(err?.message || err),
    };
  }
}

async function main() {
  console.log("=== OpenLibrary proxy smoke ===");
  for (const q of openLibraryQueries) {
    const url = `http://localhost:3000/api/openlibrary?q=${encodeURIComponent(q)}`;
    const out = await hit(url);
    console.log(JSON.stringify({ source: "openlibrary", query: q, url, ...out }, null, 2));
  }

  console.log("=== Kitsu direct smoke ===");
  for (const q of kitsuQueries) {
    const url = `https://kitsu.io/api/edge/anime?filter[text]=${encodeURIComponent(q)}&page[limit]=10`;
    const out = await hit(url);
    console.log(JSON.stringify({ source: "kitsu", query: q, url, ...out }, null, 2));
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
