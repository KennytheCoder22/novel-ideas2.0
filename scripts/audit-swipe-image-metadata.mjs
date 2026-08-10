#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, "..");

const DECK_FILES = [
  { deckKey: "k2", ageBand: "kids", file: resolve(repoRoot, "data", "swipeDecks", "k2.ts") },
  { deckKey: "36", ageBand: "preteens", file: resolve(repoRoot, "data", "swipeDecks", "36.ts") },
  { deckKey: "ms_hs", ageBand: "teens", file: resolve(repoRoot, "data", "swipeDecks", "ms_hs.ts") },
  { deckKey: "adult", ageBand: "adult", file: resolve(repoRoot, "data", "swipeDecks", "adult.ts") },
];

function parseTopLevelObjectsFromArrayLiteral(sourceText, arrayStartIndex) {
  const objects = [];
  let bracketDepth = 1;
  let braceDepth = 0;
  let objectStart = -1;
  let inString = false;
  let stringQuote = "";
  let escaped = false;
  for (let i = arrayStartIndex + 1; i < sourceText.length; i += 1) {
    const ch = sourceText[i];
    if (inString) {
      if (escaped) {
        escaped = false;
        continue;
      }
      if (ch === "\\") {
        escaped = true;
        continue;
      }
      if (ch === stringQuote) {
        inString = false;
        stringQuote = "";
      }
      continue;
    }
    if (ch === "'" || ch === "\"" || ch === "`") {
      inString = true;
      stringQuote = ch;
      continue;
    }
    if (ch === "[") {
      bracketDepth += 1;
      continue;
    }
    if (ch === "]") {
      bracketDepth -= 1;
      if (bracketDepth <= 0) break;
      continue;
    }
    if (bracketDepth !== 1) continue;
    if (ch === "{") {
      if (braceDepth === 0) objectStart = i;
      braceDepth += 1;
      continue;
    }
    if (ch === "}") {
      braceDepth -= 1;
      if (braceDepth === 0 && objectStart >= 0) {
        objects.push(sourceText.slice(objectStart, i + 1));
        objectStart = -1;
      }
    }
  }
  return objects;
}

function propertyString(objectText, key) {
  const pattern = new RegExp(`\\b${key}\\s*:\\s*(["'])([\\s\\S]*?)\\1`);
  const match = objectText.match(pattern);
  return match ? String(match[2] || "").trim() : "";
}

function propertyStringArray(objectText, key) {
  const arrMatch = objectText.match(new RegExp(`\\b${key}\\s*:\\s*\\[([\\s\\S]*?)\\]`));
  if (!arrMatch) return [];
  const values = [];
  const regex = /(["'])(.*?)\1/g;
  let next;
  while ((next = regex.exec(arrMatch[1])) !== null) {
    const text = String(next[2] || "").trim();
    if (text) values.push(text);
  }
  return values;
}

function extractCardsFromDeckTs(deckEntry) {
  const sourceText = readFileSync(deckEntry.file, "utf8");
  const cardsIndex = sourceText.search(/\bcards\s*:/);
  if (cardsIndex < 0) return [];
  const arrayStart = sourceText.indexOf("[", cardsIndex);
  if (arrayStart < 0) return [];
  const objects = parseTopLevelObjectsFromArrayLiteral(sourceText, arrayStart);
  return objects.map((objectText, index) => ({
    index,
    deckKey: deckEntry.deckKey,
    ageBand: deckEntry.ageBand,
    title: propertyString(objectText, "title"),
    prompt: propertyString(objectText, "prompt"),
    wikiTitle: propertyString(objectText, "wikiTitle"),
    imageUri: propertyString(objectText, "imageUri"),
    olWorkId: propertyString(objectText, "olWorkId"),
    tags: propertyStringArray(objectText, "tags"),
  })).filter((card) => card.title || card.prompt);
}

function summarize(rows) {
  const unresolved = { kids: [], preteens: [], teens: [], adult: [] };
  let withMeta = 0;
  for (const row of rows) {
    if (row.wikiTitle || row.imageUri || row.olWorkId) {
      withMeta += 1;
    } else {
      unresolved[row.ageBand].push(row.title || row.prompt || "(untitled)");
    }
  }
  return {
    total: rows.length,
    withMeta,
    withoutMeta: rows.length - withMeta,
    unresolved,
  };
}

const rows = DECK_FILES.flatMap(extractCardsFromDeckTs);
console.log(JSON.stringify(summarize(rows), null, 2));
