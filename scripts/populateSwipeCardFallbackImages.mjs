#!/usr/bin/env node
import fs from "fs/promises";
import path from "path";

const ROOT = process.cwd();
const FORCE = process.argv.includes("--force");
const OUT_DIR = path.join(ROOT, "assets", "swipeCardFallback", "images");
const INDEX_FILE = path.join(ROOT, "assets", "swipeCardFallback", "index.ts");

const DECKS = [
  { deckKey: "k2", file: path.join(ROOT, "data", "swipeDecks", "k2.ts") },
  { deckKey: "36", file: path.join(ROOT, "data", "swipeDecks", "36.ts") },
  { deckKey: "ms_hs", file: path.join(ROOT, "data", "swipeDecks", "ms_hs.ts") },
  { deckKey: "adult", file: path.join(ROOT, "data", "swipeDecks", "adult.ts") },
];

const slugify = (s) =>
  String(s || "")
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, "-")
    .replace(/^-+|-+$/g, "");

async function fetchJson(url) {
  try {
    const res = await fetch(url, { headers: { "user-agent": "novelideas-swipe-fallback-script/1.0" } });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

async function fetchBuffer(url) {
  try {
    const res = await fetch(url, { headers: { "user-agent": "novelideas-swipe-fallback-script/1.0" } });
    if (!res.ok) return null;
    return Buffer.from(await res.arrayBuffer());
  } catch {
    return null;
  }
}

function parseDeckCards(tsContent) {
  const cards = [];
  const cardRegex = /\{[^{}]*title:\s*"([^"]+)"[\s\S]*?\}/g;
  let match;
  while ((match = cardRegex.exec(tsContent))) {
    const chunk = match[0];
    const title = match[1]?.trim();
    const author = (chunk.match(/author:\s*"([^"]+)"/)?.[1] || "").trim();
    const wikiTitle = (chunk.match(/wikiTitle:\s*"([^"]+)"/)?.[1] || "").trim();
    if (!title) continue;
    cards.push({ title, author, wikiTitle });
  }
  return cards;
}

async function fromWikipedia(wikiTitle) {
  if (!wikiTitle) return null;
  const url = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(wikiTitle)}`;
  const json = await fetchJson(url);
  const img = json?.thumbnail?.source || json?.originalimage?.source;
  return typeof img === "string" ? img : null;
}

async function fromOpenLibrary(title, author) {
  const q = encodeURIComponent(`${title} ${author || ""}`.trim());
  const url = `https://openlibrary.org/search.json?limit=1&q=${q}`;
  const json = await fetchJson(url);
  const doc = Array.isArray(json?.docs) ? json.docs[0] : null;
  const coverId = doc?.cover_i;
  if (!coverId) return null;
  return `https://covers.openlibrary.org/b/id/${coverId}-L.jpg`;
}

async function fromGoogleBooks(title, author) {
  const q = encodeURIComponent(`intitle:${title}${author ? `+inauthor:${author}` : ""}`);
  const url = `https://www.googleapis.com/books/v1/volumes?maxResults=1&q=${q}`;
  const json = await fetchJson(url);
  const img = json?.items?.[0]?.volumeInfo?.imageLinks?.thumbnail || json?.items?.[0]?.volumeInfo?.imageLinks?.smallThumbnail;
  return typeof img === "string" ? img.replace("http://", "https://") : null;
}

function renderIndex(mapByDeck) {
  const decks = ["adult", "k2", "36", "ms_hs"];
  const lines = [];
  lines.push("export const swipeCardFallbackImages = {");
  for (const deck of decks) {
    lines.push(`  ${JSON.stringify(deck)}: {`);
    const entries = Object.entries(mapByDeck[deck] || {}).sort((a, b) => String(a[0]).localeCompare(String(b[0])));
    for (const [title, reqPath] of entries) {
      const cleanPath = String(reqPath).replace(/^require\("(.+)"\)$/, "$1");
      lines.push(`    ${JSON.stringify(title)}: require(${JSON.stringify(cleanPath)}),`);
    }
    lines.push("  },");
  }
  lines.push("} as const;");
  lines.push("");
  lines.push("export function getSwipeCardFallbackImage(deckKey: string, title: string) {");
  lines.push("  return (swipeCardFallbackImages as any)?.[deckKey]?.[title] ?? null;");
  lines.push("}");
  lines.push("");
  return lines.join("\n");
}

async function main() {
  await fs.mkdir(OUT_DIR, { recursive: true });
  const mapByDeck = { adult: {}, k2: {}, "36": {}, ms_hs: {} };
  let downloaded = 0;
  let skippedMissing = 0;
  let alreadyExisted = 0;

  for (const deck of DECKS) {
    const content = await fs.readFile(deck.file, "utf8");
    const cards = parseDeckCards(content);
    for (const card of cards) {
      const slug = slugify(card.title);
      if (!slug) continue;
      const filename = `${deck.deckKey === "ms_hs" ? "mshs" : deck.deckKey}__${slug}.jpg`;
      const rel = `./images/${filename}`;
      const abs = path.join(OUT_DIR, filename);
      mapByDeck[deck.deckKey][card.title] = `require("${rel}")`;

      const exists = await fs.access(abs).then(() => true).catch(() => false);
      if (exists && !FORCE) {
        alreadyExisted++;
        continue;
      }

      const wiki = await fromWikipedia(card.wikiTitle);
      const ol = wiki ? null : await fromOpenLibrary(card.title, card.author);
      const gb = wiki || ol ? null : await fromGoogleBooks(card.title, card.author);
      const source = wiki || ol || gb;
      if (!source) {
        skippedMissing++;
        console.log(`[missing] ${deck.deckKey} :: ${card.title}`);
        continue;
      }
      const buf = await fetchBuffer(source);
      if (!buf) {
        skippedMissing++;
        console.log(`[missing] ${deck.deckKey} :: ${card.title}`);
        continue;
      }
      await fs.writeFile(abs, buf);
      downloaded++;
      console.log(`[downloaded] ${filename}`);
    }
  }

  await fs.writeFile(INDEX_FILE, renderIndex(mapByDeck));
  console.log(`\nDone. downloaded=${downloaded} skipped_missing=${skippedMissing} already_existed=${alreadyExisted}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
