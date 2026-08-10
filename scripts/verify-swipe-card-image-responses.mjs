import { existsSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const repoRoot = process.cwd();
const inventory = JSON.parse(
  readFileSync(resolve(repoRoot, "scripts", "output", "swipe-card-image-inventory.json"), "utf8"),
);
const coverUrls = JSON.parse(readFileSync(resolve(repoRoot, "assets", "coverUrls.json"), "utf8"));
const fallbackIndex = readFileSync(resolve(repoRoot, "assets", "swipeCardFallback", "index.ts"), "utf8");
const envText = existsSync(resolve(repoRoot, ".env"))
  ? readFileSync(resolve(repoRoot, ".env"), "utf8")
  : "";
const googleBooksApiKey = process.env.EXPO_PUBLIC_GOOGLE_BOOKS_API_KEY
  || envText.match(/^\s*EXPO_PUBLIC_GOOGLE_BOOKS_API_KEY\s*=\s*["']?([^"'\r\n]+)["']?\s*$/m)?.[1]
  || "";
const outputPath = resolve(repoRoot, "scripts", "output", "swipe-card-image-live-verification.json");
const timeoutMs = 20_000;
const requestDelayMs = 350;
const responseCache = new Map();
const imageCache = new Map();

const sleep = (ms) => new Promise((resolveDelay) => setTimeout(resolveDelay, ms));

function staticCoverKey(value) {
  return String(value || "").toLowerCase().trim().replace(/[^a-z0-9 ]/g, "").replace(/\s+/g, " ");
}

function wikipediaCandidates(row) {
  const title = String(row.imageSourcePath || "").replace(/\s+/g, " ").trim();
  if (!title) return [];
  const parenthetical = title.match(/^(.*?)\s+\([^()]+\)\s*$/);
  if (parenthetical) return [title, parenthetical[1].trim()];
  const suffix = {
    tv: "TV series",
    movie: "film",
    game: "video game",
    album: "album",
    anime: "TV series",
    podcast: "podcast",
  }[String(row.mediaType || "").toLowerCase()];
  return suffix ? [`${title} (${suffix})`, title] : [title];
}

async function fetchWithRetry(url, init = {}) {
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, {
        ...init,
        signal: controller.signal,
        headers: {
          "user-agent": "NovelIdeas/1.0 (https://novelideas.app; swipe image verification)",
          ...(init.headers || {}),
        },
      });
      if (response.status !== 429) {
        await sleep(requestDelayMs);
        return response;
      }
      await response.body?.cancel();
    } finally {
      clearTimeout(timer);
    }
    await sleep(2000 * (attempt + 1));
  }
  throw new Error("http_429_retry_exhausted");
}

function verifyLocalImage(sourcePath) {
  const absolute = resolve(repoRoot, ...String(sourcePath || "").split(/[\\/]+/).filter(Boolean));
  if (!existsSync(absolute)) return { ok: false, source: "local", path: sourcePath, error: "missing_file" };
  const bytes = readFileSync(absolute);
  const png = bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  const jpeg = bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  return {
    ok: (png || jpeg) && statSync(absolute).size > 0,
    source: "local",
    path: sourcePath,
    contentType: png ? "image/png" : jpeg ? "image/jpeg" : "unknown",
    bytes: statSync(absolute).size,
    error: png || jpeg ? undefined : "invalid_image_signature",
  };
}

async function verifyImageUrl(url) {
  if (imageCache.has(url)) return imageCache.get(url);
  let result;
  try {
    let response = await fetchWithRetry(url, { method: "HEAD" });
    if (response.status === 405) {
      response = await fetchWithRetry(url, { headers: { Range: "bytes=0-1023" } });
    }
    const contentType = String(response.headers.get("content-type") || "").toLowerCase();
    await response.body?.cancel();
    result = {
      ok: response.ok && contentType.startsWith("image/"),
      status: response.status,
      contentType,
      url,
    };
  } catch (error) {
    result = {
      ok: false,
      status: 0,
      contentType: "",
      url,
      error: error instanceof Error ? error.message : String(error),
    };
  }
  imageCache.set(url, result);
  return result;
}

async function wikipediaImage(title) {
  if (responseCache.has(title)) return responseCache.get(title);
  let result;
  try {
    const url = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`;
    const response = await fetchWithRetry(url);
    if (!response.ok) {
      result = { ok: false, source: "wikipedia", title, status: response.status };
    } else {
      const payload = await response.json();
      const imageUrl = payload?.thumbnail?.source || payload?.originalimage?.source || "";
      if (imageUrl) {
        result = { source: "wikipedia", title, ...(await verifyImageUrl(imageUrl)) };
      } else {
        const params = new URLSearchParams({
          action: "parse",
          page: title,
          prop: "text",
          section: "0",
          format: "json",
          formatversion: "2",
          origin: "*",
        });
        if (googleBooksApiKey) params.set("key", googleBooksApiKey);
        const parseResponse = await fetchWithRetry(`https://en.wikipedia.org/w/api.php?${params.toString()}`);
        const parsePayload = parseResponse.ok ? await parseResponse.json() : null;
        const html = String(parsePayload?.parse?.text || "");
        const source = html.match(/<table[^>]*class="[^"]*\binfobox\b[^"]*"[\s\S]*?<img[^>]+src="([^"]+)"/i)?.[1] || "";
        const decoded = source.replace(/&amp;/g, "&");
        const infoboxUrl = decoded.startsWith("//") ? `https:${decoded}` : decoded;
        result = infoboxUrl
          ? { source: "wikipedia_infobox", title, ...(await verifyImageUrl(infoboxUrl)) }
          : { ok: false, source: "wikipedia", title, status: response.status, error: "missing_thumbnail" };
      }
    }
  } catch (error) {
    result = {
      ok: false,
      source: "wikipedia",
      title,
      status: 0,
      error: error instanceof Error ? error.message : String(error),
    };
  }
  responseCache.set(title, result);
  return result;
}

function fallbackPathFor(row) {
  const escapedTitle = String(row.displayedTitle || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const deckStart = fallbackIndex.indexOf(`${JSON.stringify(row.deckKey)}: {`);
  if (deckStart < 0) return "";
  const nextDeck = fallbackIndex.indexOf("\n  },", deckStart);
  const block = fallbackIndex.slice(deckStart, nextDeck);
  const match = block.match(new RegExp(`${JSON.stringify(escapedTitle)}:\\s*require\\("([^"]+)"\\)`));
  return match ? `assets/swipeCardFallback/${match[1].replace(/^\.\//, "")}` : "";
}

async function googleBooksCover(row) {
  const query = [`intitle:${row.displayedTitle}`];
  if (row.author) query.push(`inauthor:${row.author}`);
  const params = new URLSearchParams({
    q: query.join(" "),
    printType: "books",
    orderBy: "relevance",
    maxResults: "1",
    langRestrict: "en",
  });
  try {
    const response = await fetchWithRetry(`https://www.googleapis.com/books/v1/volumes?${params.toString()}`);
    if (!response.ok) return { ok: false, source: "google_books", status: response.status };
    const payload = await response.json();
    const links = payload?.items?.[0]?.volumeInfo?.imageLinks || {};
    const url = String(links.thumbnail || links.smallThumbnail || "").replace(/^http:\/\//, "https://");
    return url
      ? { source: "google_books", ...(await verifyImageUrl(url)) }
      : { ok: false, source: "google_books", status: response.status, error: "missing_thumbnail" };
  } catch (error) {
    return {
      ok: false,
      source: "google_books",
      status: 0,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function openLibraryCover(row) {
  const params = new URLSearchParams({ limit: "1", title: row.displayedTitle });
  if (row.author) params.set("author", row.author);
  try {
    const response = await fetchWithRetry(`https://openlibrary.org/search.json?${params.toString()}`);
    if (!response.ok) return { ok: false, source: "open_library", status: response.status };
    const payload = await response.json();
    const doc = Array.isArray(payload?.docs) ? payload.docs[0] : null;
    const coverId = Number(doc?.cover_i || 0);
    return coverId > 0
      ? { source: "open_library", ...(await verifyImageUrl(`https://covers.openlibrary.org/b/id/${coverId}-L.jpg`)) }
      : { ok: false, source: "open_library", status: response.status, error: "missing_cover" };
  } catch (error) {
    return {
      ok: false,
      source: "open_library",
      status: 0,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function verifyRow(row) {
  const attempts = [];
  if (row.imageSourceType === "imageUri") {
    const path = String(row.imageSourcePath || "");
    const result = /^https?:\/\//i.test(path)
      ? { source: "image_uri", ...(await verifyImageUrl(path)) }
      : verifyLocalImage(path);
    attempts.push(result);
    if (result.ok) return { ...row, ok: true, attempts };
  }

  if (row.imageSourceType === "wikiTitle") {
    for (const title of wikipediaCandidates(row)) {
      const result = await wikipediaImage(title);
      attempts.push(result);
      if (result.ok) return { ...row, ok: true, attempts };
    }
  }

  const titleKey = staticCoverKey(row.displayedTitle);
  const authorKey = staticCoverKey(row.author);
  const staticUrl = coverUrls[[titleKey, authorKey].filter(Boolean).join("|")] || coverUrls[titleKey] || "";
  if (staticUrl) {
    const result = { source: "static_cover_map", ...(await verifyImageUrl(staticUrl)) };
    attempts.push(result);
    if (result.ok) return { ...row, ok: true, attempts };
  }

  if (row.mediaType === "unknown" || row.mediaType === "book") {
    const googleResult = await googleBooksCover(row);
    attempts.push(googleResult);
    if (googleResult.ok) return { ...row, ok: true, attempts };
    const openLibraryResult = await openLibraryCover(row);
    attempts.push(openLibraryResult);
    if (openLibraryResult.ok) return { ...row, ok: true, attempts };
  }

  const fallbackPath = fallbackPathFor(row);
  if (fallbackPath) {
    const result = verifyLocalImage(fallbackPath);
    attempts.push(result);
    if (result.ok) return { ...row, ok: true, attempts };
  }
  return { ...row, ok: false, attempts };
}

async function main() {
  const retryFailures = process.argv.includes("--retry-failures");
  const previous = retryFailures && existsSync(outputPath)
    ? JSON.parse(readFileSync(outputPath, "utf8"))
    : null;
  const cardKey = (row) => `${row.deckKey}:${row.cardId}`;
  const imageFingerprint = (row) => JSON.stringify({
    displayedTitle: row.displayedTitle,
    author: row.author,
    mediaType: row.mediaType,
    imageSourceType: row.imageSourceType,
    imageSourcePath: row.imageSourcePath,
  });
  const previousByKey = new Map((previous?.results || []).map((row) => [cardKey(row), row]));
  const currentRows = Array.isArray(inventory.rows) ? inventory.rows : [];
  const rows = currentRows.filter((row) => {
    if (!retryFailures) return true;
    const prior = previousByKey.get(cardKey(row));
    return !prior || !prior.ok || imageFingerprint(prior) !== imageFingerprint(row);
  });
  const rechecked = [];
  for (const row of rows) rechecked.push(await verifyRow(row));
  const recheckedByKey = new Map(rechecked.map((row) => [cardKey(row), row]));
  const results = retryFailures
    ? currentRows.map((row) => recheckedByKey.get(cardKey(row)) || previousByKey.get(cardKey(row)))
    : rechecked;
  const failures = results.filter((row) => !row.ok);
  const summary = {
    checked: results.length,
    passed: results.length - failures.length,
    failed: failures.length,
    byDeck: Object.fromEntries(
      [...new Set(results.map((row) => row.deckKey))].sort().map((deckKey) => {
        const deckRows = results.filter((row) => row.deckKey === deckKey);
        return [deckKey, {
          checked: deckRows.length,
          passed: deckRows.filter((row) => row.ok).length,
          failed: deckRows.filter((row) => !row.ok).length,
        }];
      }),
    ),
  };
  writeFileSync(outputPath, `${JSON.stringify({ summary, failures, results }, null, 2)}\n`, "utf8");
  process.stdout.write(`${JSON.stringify({ summary, failures, outputPath }, null, 2)}\n`);
  if (failures.length) process.exitCode = 1;
}

await main();
