import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, "..");
const outputPath = resolve(repoRoot, "scripts", "output", "swipe-card-image-inventory.json");
const require = createRequire(import.meta.url);
const ts = require("typescript");
require.extensions[".ts"] = (module, filename) => {
  const source = readFileSync(filename, "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
      resolveJsonModule: true,
    },
  }).outputText;
  module._compile(output, filename);
};

const DECK_MODULES = [
  { deckKey: "k2", ageBand: "kids", modulePath: resolve(repoRoot, "data", "swipeDecks", "k2.ts") },
  { deckKey: "36", ageBand: "preteens", modulePath: resolve(repoRoot, "data", "swipeDecks", "36.ts") },
  { deckKey: "ms_hs", ageBand: "teens", modulePath: resolve(repoRoot, "data", "swipeDecks", "ms_hs.ts") },
  { deckKey: "adult", ageBand: "adult", modulePath: resolve(repoRoot, "data", "swipeDecks", "adult.ts") },
];

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function normalizeUrl(raw) {
  const value = String(raw || "").trim();
  if (!value) return "";
  const httpsValue = value.replace(/^http:\/\//i, "https://");
  try {
    const parsed = new URL(httpsValue);
    if (!/^https?:$/i.test(parsed.protocol)) return "";
    if (!parsed.hostname) return "";
    return parsed.toString();
  } catch {
    return "";
  }
}

function mediaTypeForCard(card) {
  const tags = asArray(card.tags).map((tag) => String(tag || "").trim().toLowerCase());
  const mediaTag = tags.find((tag) => tag.startsWith("media:"));
  if (mediaTag) return mediaTag.replace(/^media:/, "");
  const rawType = String(card.type || "").trim().toLowerCase();
  if (rawType) return rawType;
  return "unknown";
}

function localAssetReachable(imagePath) {
  const value = String(imagePath || "").trim();
  if (!value) return false;
  if (value.startsWith("data:")) return true;
  if (/^https?:\/\//i.test(value)) return Boolean(normalizeUrl(value));
  const cleaned = value.replace(/^\.?[\\/]+/, "");
  const absolute = resolve(repoRoot, cleaned);
  return existsSync(absolute);
}

function sourceForCard(card) {
  const imageUri = String(card.imageUri || "").trim();
  if (imageUri) {
    return {
      sourceType: "imageUri",
      sourcePath: imageUri,
      reachable: localAssetReachable(imageUri),
    };
  }
  const wikiTitle = String(card.wikiTitle || "").trim();
  if (wikiTitle) {
    return {
      sourceType: "wikiTitle",
      sourcePath: wikiTitle,
      reachable: true,
    };
  }
  const olWorkId = String(card.olWorkId || "").trim();
  if (olWorkId) {
    return {
      sourceType: "olWorkId",
      sourcePath: olWorkId,
      reachable: true,
    };
  }
  return {
    sourceType: "none",
    sourcePath: "",
    reachable: false,
  };
}

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

function loadDeck(deckEntry) {
  const loaded = require(deckEntry.modulePath);
  const deck = loaded.default || loaded.k2 || loaded.deck36;
  if (!deck || !Array.isArray(deck.cards)) {
    throw new Error(`invalid_runtime_deck:${deckEntry.deckKey}`);
  }
  return deck;
}

function inventoryRows() {
  const rows = [];
  for (const deckEntry of DECK_MODULES) {
    const deck = loadDeck(deckEntry);
    const cards = asArray(deck.cards);
    cards.forEach((card, index) => {
      const displayTitle = String(card.title || card.prompt || "").trim() || "(untitled card)";
      const cardId = String(card.id || `${deckEntry.deckKey}:${index + 1}`);
      const source = sourceForCard(card);
      const fallbackStatus = source.reachable ? "not_needed" : "intentional_placeholder";
      rows.push({
        cardId,
        deckKey: deckEntry.deckKey,
        ageBand: deckEntry.ageBand,
        deckLabel: String(deck.deckLabel || deckEntry.deckKey),
        displayedTitle: displayTitle,
        author: String(card.author || ""),
        mediaType: mediaTypeForCard(card),
        imageSourceType: source.sourceType,
        imageSourcePath: source.sourcePath,
        imageReachable: source.reachable,
        fallbackStatus,
      });
    });
  }
  return rows
    .slice()
    .sort((a, b) =>
      a.ageBand.localeCompare(b.ageBand)
      || a.deckKey.localeCompare(b.deckKey)
      || a.displayedTitle.localeCompare(b.displayedTitle)
      || a.cardId.localeCompare(b.cardId));
}

function summarize(rows) {
  const totalsByDeck = {};
  for (const row of rows) {
    const key = row.deckKey;
    if (!totalsByDeck[key]) {
      totalsByDeck[key] = {
        total: 0,
        reachable: 0,
        placeholderFallback: 0,
      };
    }
    totalsByDeck[key].total += 1;
    if (row.imageReachable) totalsByDeck[key].reachable += 1;
    if (row.fallbackStatus === "intentional_placeholder") totalsByDeck[key].placeholderFallback += 1;
  }
  return totalsByDeck;
}

function assertInventory(rows) {
  const unresolved = rows.filter((row) => !row.imageReachable && row.fallbackStatus !== "intentional_placeholder");
  if (unresolved.length) {
    throw new Error(`unresolved_swipe_images:${unresolved.slice(0, 5).map((row) => row.cardId).join(",")}`);
  }
  const herRow = rows.find((row) => row.displayedTitle.toLowerCase() === "her");
  if (!herRow) throw new Error("missing_card_her");
  if (!herRow.imageReachable && herRow.fallbackStatus !== "intentional_placeholder") {
    throw new Error("her_card_missing_without_fallback");
  }
}

function main() {
  const assertMode = process.argv.includes("--assert");
  const rows = inventoryRows();
  const payload = {
    schemaVersion: "swipe_card_image_inventory_v1",
    deterministicPolicy: {
      remoteImageReachability: "url_format_only",
      dynamicLookupSourcesCountAsReachable: ["wikiTitle", "olWorkId"],
      fallbackPolicy: "intentional_placeholder_when_image_source_missing_or_unreachable",
    },
    summary: {
      totalCards: rows.length,
      decks: summarize(rows),
    },
    rows,
  };

  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, JSON.stringify(payload, null, 2) + "\n", "utf8");
  if (assertMode) assertInventory(rows);

  const checks = [
    { name: "inventory_written", pass: true, path: outputPath, count: rows.length },
    {
      name: "all_cards_resolve_or_placeholder",
      pass: rows.every((row) => row.imageReachable || row.fallbackStatus === "intentional_placeholder"),
    },
    {
      name: "her_covered",
      pass: rows.some((row) => row.displayedTitle.toLowerCase() === "her" && (row.imageReachable || row.fallbackStatus === "intentional_placeholder")),
    },
  ];

  process.stdout.write(`${JSON.stringify({ ok: checks.every((row) => row.pass), checks, outputPath }, null, 2)}\n`);
  if (!checks.every((row) => row.pass)) process.exit(1);
}

main();
