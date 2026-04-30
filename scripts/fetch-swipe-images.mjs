#!/usr/bin/env node
import fs from "fs";
import path from "path";

const ROOT = process.cwd();
const DECK_FILES = [
  "data/swipeDecks/k2.ts",
  "data/swipeDecks/36.ts",
  "data/swipeDecks/ms_hs.ts",
  "data/swipeDecks/adult.ts",
];

const OUT_DIR = path.join(ROOT, "assets", "swipe-cards");
const MAP_FILE = path.join(ROOT, "data", "swipeCardImageMap.ts");

function normalizeKey(value = "") {
  return String(value).trim().toLowerCase();
}

function slugify(value = "") {
  return normalizeKey(value).replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80);
}

function parseCards() {
  const out = [];
  for (const file of DECK_FILES) {
    const full = path.join(ROOT, file);
    if (!fs.existsSync(full)) continue;
    const lines = fs.readFileSync(full, "utf8").split("\n");

    for (let i = 0; i < lines.length; i += 1) {
      const line = lines[i];
      if (!line.includes("title:")) continue;
      const titleMatch = line.match(/title:\s*"([^"]+)"/);
      if (!titleMatch) continue;

      const window = lines.slice(Math.max(0, i - 4), Math.min(lines.length, i + 5)).join(" ");
      const idMatch = window.match(/id:\s*"([^"]+)"/);
      const wikiMatch = window.match(/wikiTitle:\s*"([^"]+)"/);

      const title = titleMatch[1];
      const key = normalizeKey(idMatch?.[1] || title);
      const query = wikiMatch?.[1] || title;
      out.push({ key, title, query });
    }
  }

  const deduped = new Map();
  for (const entry of out) deduped.set(entry.key, entry);
  return Array.from(deduped.values());
}

async function getWikipediaThumb(query) {
  const url = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(query)}`;
  const res = await fetch(url, { headers: { "user-agent": "NovelIdeas/1.0 image fetcher" } });
  if (!res.ok) return null;
  const data = await res.json();
  return data?.thumbnail?.source || null;
}

async function download(url, outFile) {
  const res = await fetch(url, { headers: { "user-agent": "NovelIdeas/1.0 image fetcher" } });
  if (!res.ok) return false;
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length < 1024) return false;
  fs.writeFileSync(outFile, buf);
  return true;
}

function writeMap(entries) {
  const lines = [];
  lines.push('import { cardIdentityKey } from "../screens/swipe/adaptiveCardQueue";');
  lines.push("");
  lines.push("export const SWIPE_CARD_LOCAL_IMAGE_MAP: Record<string, any> = {");
  for (const e of entries.sort((a, b) => a.key.localeCompare(b.key))) {
    lines.push(`  "${e.key}": require("../assets/swipe-cards/${e.file}"),`);
  }
  lines.push("};");
  lines.push("");
  lines.push("export function localSwipeImageForCard(card: any): any | null {");
  lines.push("  if (!card) return null;");
  lines.push("  const key = cardIdentityKey(card);");
  lines.push("  return SWIPE_CARD_LOCAL_IMAGE_MAP[key] || null;");
  lines.push("}");
  fs.writeFileSync(MAP_FILE, lines.join("\n"));
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const cards = parseCards();
  const mapped = [];

  for (const card of cards) {
    const file = `${slugify(card.key)}.jpg`;
    const outFile = path.join(OUT_DIR, file);
    if (!fs.existsSync(outFile)) {
      const thumb = await getWikipediaThumb(card.query);
      if (!thumb) continue;
      const ok = await download(thumb, outFile);
      if (!ok) continue;
    }
    mapped.push({ key: card.key, file });
  }

  writeMap(mapped);
  console.log(`Mapped ${mapped.length}/${cards.length} cards.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

