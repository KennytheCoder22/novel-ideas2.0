import { createRequire } from "node:module";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  analyzeQueryPopulation,
  inferPrimaryCause,
  sortQueriesForComparison,
} from "./lib/googlebooks-query-refinement-analysis.mjs";

const require = createRequire(import.meta.url);
const ts = require("typescript");

require.extensions[".ts"] = (module, filename) => {
  const source = readFileSync(filename, "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: {
      esModuleInterop: true,
      module: ts.ModuleKind.CommonJS,
      moduleResolution: ts.ModuleResolutionKind.Node10,
      target: ts.ScriptTarget.ES2020,
    },
  }).outputText;
  module._compile(output, filename);
};

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, "..");
const outDir = resolve(scriptDir, "output");
const {
  inferGoogleBooksPublicationShape,
  googleBooksPublicationShapeDropReason,
} = require(resolve(repoRoot, "app/recommender-v2/sources/googleBooksSource.ts"));

const GOOGLE_BOOKS_API_BASE = "https://www.googleapis.com/books/v1/volumes";
const localEnv = parseDotEnv(resolve(repoRoot, ".env"));
const GOOGLE_BOOKS_API_KEY =
  process.env.EXPO_PUBLIC_GOOGLE_BOOKS_API_KEY ||
  process.env.GOOGLE_BOOKS_API_KEY ||
  localEnv.EXPO_PUBLIC_GOOGLE_BOOKS_API_KEY ||
  localEnv.GOOGLE_BOOKS_API_KEY ||
  "";

const FAMILY_QUERIES = {
  science_fiction: {
    current: "young adult science fiction novel",
    alternatives: [
      "\"young adult\" dystopian novel",
      "\"young adult\" speculative fiction novel",
      "\"young adult\" space opera novel",
      "\"young adult\" science fiction adventure novel",
      "\"young adult\" sci fi novel",
    ],
  },
  general: {
    current: "young adult contemporary fiction novel",
    alternatives: [
      "\"young adult\" contemporary novel",
      "\"young adult\" coming of age novel",
      "\"young adult\" realistic fiction novel",
      "\"young adult\" contemporary romance novel",
      "\"young adult\" social issues novel",
    ],
  },
};

function stringArray(values) {
  if (!Array.isArray(values)) return [];
  return values.map((value) => String(value || "").trim()).filter(Boolean);
}

function parsePublicationYear(value) {
  if (typeof value === "number" && Number.isFinite(value)) return Number(value);
  const match = String(value || "").match(/\b(18|19|20)\d{2}\b/);
  return match ? Number(match[0]) : undefined;
}

function parseDotEnv(path) {
  try {
    const raw = readFileSync(path, "utf8");
    const out = {};
    for (const line of raw.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const idx = trimmed.indexOf("=");
      if (idx <= 0) continue;
      const key = trimmed.slice(0, idx).trim();
      const value = trimmed.slice(idx + 1).trim();
      out[key] = value;
    }
    return out;
  } catch {
    return {};
  }
}

function hasIsbn(industryIdentifiers) {
  return stringArray(industryIdentifiers).length > 0;
}

function classifyVolume(item) {
  const volumeInfo = item && typeof item === "object" ? item.volumeInfo || {} : {};
  const title = String(volumeInfo.title || "").trim();
  const subtitle = String(volumeInfo.subtitle || "").trim();
  const authors = stringArray(volumeInfo.authors);
  const categories = stringArray(volumeInfo.categories);
  const description = String(volumeInfo.description || "").trim();
  const publisher = String(volumeInfo.publisher || "").trim();
  const publicationYear = parsePublicationYear(volumeInfo.publishedDate);
  const pageCount = typeof volumeInfo.pageCount === "number" ? volumeInfo.pageCount : undefined;
  const analysis = inferGoogleBooksPublicationShape({
    title,
    subtitle: subtitle || undefined,
    description,
    categories,
    publisher,
    authors,
    publicationYear,
    isbnPresent: hasIsbn(volumeInfo.industryIdentifiers),
    pageCount,
  });
  const dropReason = googleBooksPublicationShapeDropReason(analysis);
  const isNarrativeCandidate = ["novel", "series_installment", "story_collection"].includes(String(analysis.shape || ""));
  const publicationPass = Boolean(title) && authors.length > 0 && !dropReason;
  let rejectionReason = "";
  if (!publicationPass) {
    if (!title) rejectionReason = "missing_title";
    else if (authors.length === 0) rejectionReason = "missing_author";
    else rejectionReason = String(dropReason || "unknown_rejection");
  }
  return {
    shape: String(analysis.shape || "unknown"),
    categories,
    isNarrativeCandidate,
    publicationPass,
    rejectionReason,
  };
}

async function fetchGoogleBooksTop100(query) {
  const batches = [0, 20, 40, 60, 80].map((startIndex) => ({ startIndex, maxResults: 20 }));
  const items = [];
  for (const batch of batches) {
    const url = new URL(GOOGLE_BOOKS_API_BASE);
    url.searchParams.set("q", query);
    url.searchParams.set("startIndex", String(batch.startIndex));
    url.searchParams.set("maxResults", String(batch.maxResults));
    url.searchParams.set("printType", "books");
    if (GOOGLE_BOOKS_API_KEY) url.searchParams.set("key", GOOGLE_BOOKS_API_KEY);
    const response = await fetchWithRetry(url.toString(), query);
    if (!response.ok) {
      throw new Error(`Google Books fetch failed for "${query}" (${response.status})`);
    }
    const payload = await response.json();
    const batchItems = Array.isArray(payload?.items) ? payload.items : [];
    items.push(...batchItems);
    await sleep(350);
  }
  return items.slice(0, 100);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchWithRetry(url, query) {
  const maxAttempts = 10;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const response = await fetch(url);
    if (response.ok) return response;
    const retryable = response.status === 429 || response.status === 500 || response.status === 502 || response.status === 503 || response.status === 504;
    if (!retryable || attempt === maxAttempts) {
      throw new Error(`Google Books fetch failed for "${query}" (${response.status})`);
    }
    const delayMs = 1500 * attempt + Math.floor(Math.random() * 250);
    await sleep(delayMs);
  }
  throw new Error(`Google Books fetch failed for "${query}" (retry_exhausted)`);
}

function comparisonDelta(currentRow, row) {
  const passDelta = row.publicationIdentityPasses - currentRow.publicationIdentityPasses;
  const narrativeDelta = Number((row.narrativeYield - currentRow.narrativeYield).toFixed(1));
  return {
    publicationPassDelta: passDelta,
    narrativeYieldDelta: narrativeDelta,
    deltaLabel: `pass ${passDelta >= 0 ? "+" : ""}${passDelta}, yield ${narrativeDelta >= 0 ? "+" : ""}${narrativeDelta}pp`,
  };
}

const familyOutputs = [];
const comparisonRows = [];
const perQueryRaw = [];

for (const [family, querySet] of Object.entries(FAMILY_QUERIES)) {
  const queryLabels = [
    { label: "current", query: querySet.current },
    ...querySet.alternatives.map((query, index) => ({ label: `alt_${index + 1}`, query })),
  ];
  const analyzedRows = [];
  for (const queryDef of queryLabels) {
    const rawRows = await fetchGoogleBooksTop100(queryDef.query);
    perQueryRaw.push({
      family,
      queryLabel: queryDef.label,
      query: queryDef.query,
      rawCount: rawRows.length,
    });
    analyzedRows.push(analyzeQueryPopulation({
      family,
      queryLabel: queryDef.label,
      query: queryDef.query,
      rawRows,
      classifyRow: classifyVolume,
    }));
  }
  const currentRow = analyzedRows.find((row) => row.queryLabel === "current") || analyzedRows[0];
  const sortedRows = sortQueriesForComparison(analyzedRows);
  const cause = inferPrimaryCause(analyzedRows);
  familyOutputs.push({
    family,
    primaryCause: cause,
    current: currentRow,
    rankedQueries: sortedRows.map((row) => ({
      ...row,
      ...comparisonDelta(currentRow, row),
    })),
  });
  for (const row of sortedRows) {
    comparisonRows.push({
      family,
      queryLabel: row.queryLabel,
      query: row.query,
      rawApiResults: row.rawApiResults,
      narrativeCandidates: row.narrativeCandidates,
      publicationIdentityPasses: row.publicationIdentityPasses,
      publicationSurvival: row.publicationSurvival,
      dominantReject: row.dominantReject,
      ...comparisonDelta(currentRow, row),
    });
  }
}

const jsonOut = resolve(outDir, "googlebooks-query-refinement-root-cause.json");
const csvOut = resolve(outDir, "googlebooks-query-refinement-root-cause.csv");
const summaryOut = resolve(outDir, "googlebooks-query-refinement-root-cause-summary.txt");
mkdirSync(outDir, { recursive: true });

writeFileSync(jsonOut, JSON.stringify({
  generatedAt: new Date().toISOString(),
  familyOutputs,
  comparisonRows,
  perQueryRaw,
}, null, 2));

const csvHeader = [
  "family",
  "queryLabel",
  "query",
  "rawApiResults",
  "narrativeCandidates",
  "publicationIdentityPasses",
  "publicationSurvivalPct",
  "dominantReject",
  "publicationPassDeltaVsCurrent",
  "narrativeYieldDeltaVsCurrentPct",
  "deltaVsCurrent",
].join(",");
const csvRows = comparisonRows.map((row) => [
  row.family,
  row.queryLabel,
  `"${String(row.query).replace(/"/g, "\"\"")}"`,
  row.rawApiResults,
  row.narrativeCandidates,
  row.publicationIdentityPasses,
  row.publicationSurvival,
  row.dominantReject,
  row.publicationPassDelta,
  row.narrativeYieldDelta,
  `"${row.deltaLabel}"`,
].join(","));
writeFileSync(csvOut, [csvHeader, ...csvRows].join("\n"));

const summaryLines = ["GOOGLE BOOKS QUERY REFINEMENT ROOT CAUSE", ""];
for (const familyRow of familyOutputs) {
  summaryLines.push(`Family: ${familyRow.family}`);
  summaryLines.push(`Primary cause: ${familyRow.primaryCause}`);
  summaryLines.push("Ranked queries (publication pass, then narrative yield):");
  familyRow.rankedQueries.forEach((row, index) => {
    summaryLines.push(
      `${index + 1}. [${row.queryLabel}] ${row.query} | raw=${row.rawApiResults} narrative=${row.narrativeCandidates} publicationPass=${row.publicationIdentityPasses} survival=${row.publicationSurvival}% dominantReject=${row.dominantReject} delta=${row.deltaLabel}`,
    );
  });
  summaryLines.push("");
}
writeFileSync(summaryOut, summaryLines.join("\n"));

console.log(`JSON written to: ${jsonOut}`);
console.log(`CSV written to: ${csvOut}`);
console.log(`Summary written to: ${summaryOut}`);
for (const familyRow of familyOutputs) {
  const best = familyRow.rankedQueries[0];
  console.log(`Best ${familyRow.family}: ${best.queryLabel} | pass=${best.publicationIdentityPasses} | narrative=${best.narrativeCandidates} | cause=${familyRow.primaryCause}`);
}
