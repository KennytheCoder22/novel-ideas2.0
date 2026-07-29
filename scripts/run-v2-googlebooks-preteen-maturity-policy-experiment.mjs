/**
 * Pre-Teen Google Books maturity-mapping policy experiment.
 *
 * Runs a fixed canonical middle-grade set through the same post-fetch pipeline
 * (normalize -> score -> select) under two policies:
 *  1) current mapping
 *  2) hypothetical: "Juvenile Fiction" audience defaults to unknown (preteen-eligible)
 *
 * This is diagnostic-only. It does not change production behavior.
 */
import { createRequire } from "node:module";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, "..");
const outDir = resolve(scriptDir, "output");

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

const { normalizeSourceResults, scoreCandidates, selectRecommendations } = require(resolve(repoRoot, "app/recommender-v2/index.ts"));

const CANONICAL_BOOKS = [
  { id: "wonder", title: "Wonder", author: "R. J. Palacio" },
  { id: "holes", title: "Holes", author: "Louis Sachar" },
  { id: "lightning-thief", title: "The Lightning Thief", author: "Rick Riordan" },
  { id: "winn-dixie", title: "Because of Winn-Dixie", author: "Kate DiCamillo" },
  { id: "ivan", title: "The One and Only Ivan", author: "Katherine Applegate" },
  { id: "wild-robot", title: "The Wild Robot", author: "Peter Brown" },
  { id: "phantom-tollbooth", title: "The Phantom Tollbooth", author: "Norton Juster" },
  { id: "terabithia", title: "Bridge to Terabithia", author: "Katherine Paterson" },
  { id: "hatchet", title: "Hatchet", author: "Gary Paulsen" },
  { id: "despereaux", title: "The Tale of Despereaux", author: "Kate DiCamillo" },
  { id: "city-of-ember", title: "The City of Ember", author: "Jeanne DuPrau" },
  { id: "frindle", title: "Frindle", author: "Andrew Clements" },
  { id: "fish-in-a-tree", title: "Fish in a Tree", author: "Lynda Mullaly Hunt" },
  { id: "edward-tulane", title: "The Miraculous Journey of Edward Tulane", author: "Kate DiCamillo" },
  { id: "mysterious-benedict", title: "The Mysterious Benedict Society", author: "Trenton Lee Stewart" },
  { id: "lemoncello", title: "Escape from Mr. Lemoncello's Library", author: "Chris Grabenstein" },
  { id: "wrinkle-in-time", title: "A Wrinkle in Time", author: "Madeleine L'Engle" },
  { id: "last-kids-on-earth", title: "The Last Kids on Earth", author: "Max Brallier" },
  { id: "new-kid", title: "New Kid", author: "Jerry Craft" },
  { id: "front-desk", title: "Front Desk", author: "Kelly Yang" },
  { id: "maniac-magee", title: "Maniac Magee", author: "Jerry Spinelli" },
  { id: "giver", title: "The Giver", author: "Lois Lowry" },
  { id: "counting-by-7s", title: "Counting by 7s", author: "Holly Goldberg Sloan" },
  { id: "inside-out-back-again", title: "Inside Out and Back Again", author: "Thanhha Lai" },
  { id: "where-mountain-meets-moon", title: "Where the Mountain Meets the Moon", author: "Grace Lin" },
  { id: "greenglass-house", title: "Greenglass House", author: "Kate Milford" },
  { id: "moon-over-manifest", title: "Moon Over Manifest", author: "Clare Vanderpool" },
  { id: "okay-for-now", title: "Okay for Now", author: "Gary D. Schmidt" },
  { id: "pay-attention-carter-jones", title: "Pay Attention, Carter Jones", author: "Gary D. Schmidt" },
  { id: "elliot-midnight-supermarket", title: "The Midnight War of Mateo Martinez", author: "Robin Yardi" },
  { id: "from-mixed-up-files", title: "From the Mixed-Up Files of Mrs. Basil E. Frankweiler", author: "E. L. Konigsburg" },
  { id: "walk-two-moons", title: "Walk Two Moons", author: "Sharon Creech" },
  { id: "number-the-stars", title: "Number the Stars", author: "Lois Lowry" },
  { id: "island-blue-dolphins", title: "Island of the Blue Dolphins", author: "Scott O'Dell" },
  { id: "penderwicks", title: "The Penderwicks", author: "Jeanne Birdsall" },
  { id: "savvy", title: "Savvy", author: "Ingrid Law" },
  { id: "one-crazy-summer", title: "One Crazy Summer", author: "Rita Williams-Garcia" },
  { id: "roll-of-thunder", title: "Roll of Thunder, Hear My Cry", author: "Mildred D. Taylor" },
  { id: "bud-not-buddy", title: "Bud, Not Buddy", author: "Christopher Paul Curtis" },
  { id: "al-capone-does-my-shirts", title: "Al Capone Does My Shirts", author: "Gennifer Choldenko" },
  { id: "school-story", title: "The School Story", author: "Andrew Clements" },
  { id: "fourteenth-goldfish", title: "The Fourteenth Goldfish", author: "Jennifer L. Holm" },
  { id: "paperboy", title: "Paperboy", author: "Vince Vawter" },
  { id: "ghost", title: "Ghost", author: "Jason Reynolds" },
  { id: "serafina-black-cloak", title: "Serafina and the Black Cloak", author: "Robert Beatty" },
  { id: "book-scavenger", title: "Book Scavenger", author: "Jennifer Chambliss Bertman" },
  { id: "kensukes-kingdom", title: "Kensuke's Kingdom", author: "Michael Morpurgo" },
  { id: "wolves-of-willoughby", title: "The Wolves of Willoughby Chase", author: "Joan Aiken" },
  { id: "when-you-reach-me", title: "When You Reach Me", author: "Rebecca Stead" },
  { id: "true-confessions-charlotte-doyle", title: "The True Confessions of Charlotte Doyle", author: "Avi" },
];

function parseDotEnv(filePath) {
  if (!existsSync(filePath)) return {};
  const text = readFileSync(filePath, "utf8");
  const env = {};
  for (const line of text.split(/\r?\n/)) {
    const trimmed = String(line || "").trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const index = trimmed.indexOf("=");
    if (index <= 0) continue;
    const key = trimmed.slice(0, index).trim();
    const value = trimmed.slice(index + 1).trim().replace(/^"(.*)"$/, "$1").replace(/^'(.*)'$/, "$1");
    env[key] = value;
  }
  return env;
}

function normalizeText(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s|]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function inferGoogleBooksAudienceBandCurrent({ title, subtitle, description, categories, publisher }) {
  const text = normalizeText([title, subtitle, description, (categories || []).join(" | "), publisher].join(" | "));
  if (!text) return "unknown";
  if (/\b(young adult|ya\b|teen(?:s|age|ager)?|high school|new adult)\b/.test(text)) return "teens";
  if (/\b(adult fiction|literary criticism|history and criticism|critical studies?|poetry|poems?|essays?|academic|monograph|scholarship)\b/.test(text)) return "adult";
  if (/\b(middle grade|grades?\s*[3-8]|ages?\s*(?:8|9|10|11|12)\b)\b/.test(text)) return "preteens";
  if (/\b(juvenile fiction|children'?s fiction|picture books?|picture book|early readers?|easy readers?|beginning readers?|read aloud|ages?\s*(?:3|4|5|6|7|8)\b|grades?\s*(?:k|1|2)\b|kindergarten|preschool)\b/.test(text)) return "kids";
  return "unknown";
}

function kidsOnlyAudienceMarkers(text) {
  return /\b(picture books?|picture book|early readers?|easy readers?|beginning readers?|read aloud|ages?\s*(?:3|4|5|6|7|8)\b|grades?\s*(?:k|1|2)\b|kindergarten|preschool)\b/.test(text);
}

function relaxAudienceIfJuvenileFiction(currentAudienceBand, text) {
  if (currentAudienceBand !== "kids") return { audienceBand: currentAudienceBand, reason: "unchanged_non_kids" };
  const hasJuvenileFiction = /\b(juvenile fiction|children'?s fiction)\b/.test(text);
  if (!hasJuvenileFiction) return { audienceBand: currentAudienceBand, reason: "unchanged_kids_non_juvenile_fiction" };
  if (kidsOnlyAudienceMarkers(text)) return { audienceBand: currentAudienceBand, reason: "unchanged_kids_explicit_early_reader_marker" };
  return { audienceBand: "unknown", reason: "juvenile_fiction_relaxed_to_unknown" };
}

function likelyElementaryReader(row) {
  const categories = Array.isArray(row.categories) ? row.categories.join(" | ") : "";
  const text = normalizeText([row.title, row.subtitle, row.description, categories].join(" | "));
  const pageCount = Number(row.pageCount || 0);
  if (/\b(picture books?|board book|early readers?|easy readers?|beginning readers?|learn to read|leveled reader|kindergarten|preschool|grade k|grade 1|grade 2|ages? (?:3|4|5|6|7)\b)\b/.test(text)) return true;
  if (pageCount > 0 && pageCount < 90 && /\bjuvenile fiction\b/.test(text) && !/\bmiddle grade\b/.test(text)) return true;
  return false;
}

const TITLE_STOP_WORDS = new Set(["the", "a", "an", "of", "and", "to", "for", "from", "mr", "mrs", "book", "series", "edition", "complete", "collection"]);
const TITLE_GENERIC_WORDS = new Set(["one", "only", "story", "stories", "guide", "graphic", "novel", "newbery", "honor", "deluxe", "annotated", "tie", "in"]);

function titleTokens(value) {
  return normalizeText(value)
    .split(" ")
    .map((token) => token.trim())
    .filter((token) => token.length >= 3 && !TITLE_STOP_WORDS.has(token));
}

function canonicalMatchLikely(canonicalTitle, candidateTitle) {
  const canonicalTokens = titleTokens(canonicalTitle);
  const candidateTokens = new Set(titleTokens(candidateTitle));
  if (canonicalTokens.length === 0) return false;
  const overlap = canonicalTokens.filter((token) => candidateTokens.has(token));
  const overlapRatio = overlap.length / canonicalTokens.length;
  const distinctiveOverlap = overlap.filter((token) => !TITLE_GENERIC_WORDS.has(token));
  return overlapRatio >= 0.5 && distinctiveOverlap.length >= 1;
}

function makePreteenProfile() {
  const makeSignals = (values, base = 100) => values.map((value, index) => ({
    value,
    weight: Math.max(10, base - index * 8),
    evidence: ["like:canonical-middle-grade-set"],
  }));
  return {
    ageBand: "preteens",
    maturityBand: "preteens",
    genreFamily: makeSignals(["adventure", "fantasy", "mystery", "science fiction", "contemporary", "historical", "humorous", "mythology"], 100),
    tone: makeSignals(["hopeful", "funny", "suspenseful", "heartwarming"], 80),
    pacing: makeSignals(["fast paced", "steady"], 60),
    themes: makeSignals(["friendship", "family", "school", "belonging", "courage", "survival", "identity"], 90),
    characterDynamics: makeSignals(["outsider hero", "teamwork", "found family"], 70),
    formatPreference: makeSignals(["novel", "chapter book"], 65),
    avoidSignals: makeSignals(["picture book", "early reader", "board book", "preschool"], 85),
    sourceHints: ["googleBooks"],
    diagnostics: {},
  };
}

function toSourceRow(volume, canonical, policyName, policyAudienceBand, relaxedReason) {
  const info = (volume && volume.volumeInfo) || {};
  const categories = Array.isArray(info.categories) ? info.categories.map(String) : [];
  const publishedDate = String(info.publishedDate || "");
  const publicationYearMatch = publishedDate.match(/\b(18|19|20)\d{2}\b/);
  const publicationYear = publicationYearMatch ? Number(publicationYearMatch[0]) : undefined;
  const maturityRating = String(info.maturityRating || "").trim() || "unknown";
  return {
    id: `canonical:${canonical.id}:${volume.id || info.title || Math.random().toString(36).slice(2)}`,
    sourceId: String(volume.id || ""),
    title: String(info.title || "").trim(),
    subtitle: String(info.subtitle || "").trim(),
    creators: Array.isArray(info.authors) ? info.authors.map(String) : [],
    authors: Array.isArray(info.authors) ? info.authors.map(String) : [],
    description: String(info.description || "").trim(),
    categories,
    genres: categories,
    themes: [],
    tones: [],
    characterDynamics: [],
    formats: ["book"],
    publicationYear,
    pageCount: Number.isFinite(Number(info.pageCount)) ? Number(info.pageCount) : undefined,
    printType: String(info.printType || "BOOK"),
    language: String(info.language || "en"),
    maturityBand: maturityRating,
    maturityRating,
    sourceMaturityRating: maturityRating,
    contentMaturity: String(maturityRating).toUpperCase() === "NOT_MATURE" ? "not_mature" : String(maturityRating).toUpperCase() === "MATURE" ? "mature" : "unknown",
    audienceBand: policyAudienceBand,
    requestedAgeBand: "preteens",
    ageBand: "preteens",
    sourceUrl: String(info.infoLink || ""),
    queryText: `intitle:${canonical.title} inauthor:${canonical.author}`,
    originalPlannedQuery: `intitle:${canonical.title} inauthor:${canonical.author}`,
    queryFamily: "canonical_lookup",
    routingReason: "canonical_policy_experiment",
    facets: ["canonical_middle_grade"],
    canonicalId: canonical.id,
    canonicalTitle: canonical.title,
    canonicalAuthor: canonical.author,
    policyName,
    policyAudienceBandReason: relaxedReason || "baseline",
    googleBooksAudiencePolicyOverride: policyName === "current_mapping"
      ? "strict_preserve_source_audience"
      : "force_relaxed_preteen_policy",
    likelyElementaryReader: likelyElementaryReader({
      title: info.title,
      subtitle: info.subtitle,
      description: info.description,
      categories,
      pageCount: info.pageCount,
    }),
  };
}

async function sleep(ms) {
  await new Promise((resolvePromise) => setTimeout(resolvePromise, ms));
}

async function fetchWithRetry(url, attemptLimit = 4) {
  for (let attempt = 1; attempt <= attemptLimit; attempt += 1) {
    const response = await fetch(url, { headers: { Accept: "application/json" } });
    if (response.ok) return await response.json();
    const status = Number(response.status || 0);
    if (status !== 429 && status < 500) return null;
    const backoff = Math.min(4000, 350 * (2 ** attempt));
    await sleep(backoff);
  }
  return null;
}

async function fetchCanonicalVolumeSets(apiKey) {
  const byBook = new Map();
  for (const canonical of CANONICAL_BOOKS) {
    const queries = [
      `intitle:${canonical.title} inauthor:${canonical.author}`,
      `intitle:${canonical.title}`,
      `${canonical.title} ${canonical.author}`,
    ];
    const collected = [];
    let selectedQuery = queries[0];
    let maxTotalItems = 0;
    for (const q of queries) {
      const params = new URLSearchParams({
        q,
        maxResults: "8",
        orderBy: "relevance",
        printType: "books",
        projection: "full",
        langRestrict: "en",
        filter: "partial",
        key: apiKey,
      });
      const json = await fetchWithRetry(`https://www.googleapis.com/books/v1/volumes?${params.toString()}`);
      const items = Array.isArray(json?.items) ? json.items : [];
      maxTotalItems = Math.max(maxTotalItems, Number(json?.totalItems || 0));
      const matched = items.filter((volume) => canonicalMatchLikely(canonical.title, String(volume?.volumeInfo?.title || "")));
      if (matched.length > 0 && collected.length === 0) selectedQuery = q;
      for (const volume of matched) {
        const key = String(volume?.id || volume?.volumeInfo?.title || Math.random().toString(36));
        if (!collected.some((entry) => String(entry?.id || entry?.volumeInfo?.title) === key)) {
          collected.push(volume);
        }
      }
      if (collected.length >= 2) break;
      await sleep(220);
    }
    const items = collected.slice(0, 3);
    byBook.set(canonical.id, {
      canonical,
      query: selectedQuery,
      totalItems: maxTotalItems,
      items,
    });
    await sleep(220);
  }
  return byBook;
}

function makeSourceResult(rawItems) {
  return {
    source: "googleBooks",
    status: "succeeded",
    rawItems,
    diagnostics: {
      source: "googleBooks",
      status: "succeeded",
      planned: true,
      attempted: true,
      timedOut: false,
      rawCount: rawItems.length,
      queries: rawItems.map((row) => String(row.queryText || "")).filter(Boolean),
    },
  };
}

function buildPolicyRows(fetchedByBook, policyName) {
  const rawRows = [];
  const perBook = [];
  for (const { canonical, query, totalItems, items } of fetchedByBook.values()) {
    const chosen = Array.isArray(items) ? items : [];
    const rows = [];
    for (const volume of chosen) {
      const info = (volume && volume.volumeInfo) || {};
      const categories = Array.isArray(info.categories) ? info.categories.map(String) : [];
      const text = normalizeText([
        info.title,
        info.subtitle,
        info.description,
        categories.join(" | "),
        info.publisher,
      ].join(" | "));
      const currentBand = inferGoogleBooksAudienceBandCurrent({
        title: String(info.title || ""),
        subtitle: String(info.subtitle || ""),
        description: String(info.description || ""),
        categories,
        publisher: String(info.publisher || ""),
      });
      const relaxed = relaxAudienceIfJuvenileFiction(currentBand, text);
      const chosenAudienceBand = policyName === "current_mapping" ? currentBand : relaxed.audienceBand;
      const row = toSourceRow(volume, canonical, policyName, chosenAudienceBand, policyName === "current_mapping" ? "baseline" : relaxed.reason);
      rows.push(row);
      rawRows.push(row);
    }
    perBook.push({
      canonicalId: canonical.id,
      title: canonical.title,
      author: canonical.author,
      query,
      totalItems,
      editionsCaptured: rows.length,
      audienceBands: rows.map((row) => row.audienceBand),
      relaxedReasons: rows.map((row) => row.policyAudienceBandReason),
      rows,
    });
  }
  return { rawRows, perBook };
}

function histogram(values) {
  const out = {};
  for (const value of values) {
    const key = String(value || "unknown");
    out[key] = Number(out[key] || 0) + 1;
  }
  return out;
}

function median(values) {
  const nums = values.map(Number).filter((value) => Number.isFinite(value)).sort((a, b) => a - b);
  if (nums.length === 0) return null;
  const m = Math.floor(nums.length / 2);
  if (nums.length % 2) return nums[m];
  return (nums[m - 1] + nums[m]) / 2;
}

function runPipelineForPolicy(policyName, rawRows, profile) {
  const sourceResults = [makeSourceResult(rawRows)];
  const normalized = normalizeSourceResults(sourceResults);
  const scored = scoreCandidates(normalized, profile);
  const scoredSorted = [...scored].sort((a, b) => b.score - a.score);
  const scoredForSelection = scored.map((candidate) => ({
    ...candidate,
    rejectedReasons: Array.isArray(candidate.rejectedReasons) ? [...candidate.rejectedReasons] : [],
    scoreBreakdown: { ...(candidate.scoreBreakdown || {}) },
    diagnostics: { ...(candidate.diagnostics || {}) },
  }));
  const selection = selectRecommendations(scoredForSelection, profile, 50);
  const selectedIds = new Set(selection.selected.map((candidate) => candidate.id));

  const rankById = new Map();
  scoredSorted.forEach((candidate, index) => rankById.set(candidate.id, index + 1));

  const candidateRows = scoredForSelection.map((candidate) => {
    const raw = candidate.raw || {};
    const reasons = Array.isArray(candidate.rejectedReasons) ? candidate.rejectedReasons.map(String) : [];
    return {
      policy: policyName,
      canonicalId: String(raw.canonicalId || ""),
      canonicalTitle: String(raw.canonicalTitle || ""),
      canonicalAuthor: String(raw.canonicalAuthor || ""),
      candidateTitle: candidate.title,
      audienceBand: String(candidate.diagnostics?.googleBooksAudienceBand || raw.audienceBand || ""),
      maturityBand: String(candidate.maturityBand || ""),
      sourceMaturityRating: String(candidate.diagnostics?.googleBooksSourceMaturityRating || raw.sourceMaturityRating || ""),
      likelyElementaryReader: Boolean(raw.likelyElementaryReader),
      score: Number(candidate.score || 0),
      rank: Number(rankById.get(candidate.id) || 0),
      selected: selectedIds.has(candidate.id),
      rejectedReasons: reasons,
      maturityMismatchRejected: reasons.includes("maturity_band_mismatch"),
    };
  });

  const byCanonical = new Map();
  for (const row of candidateRows) {
    const key = row.canonicalId;
    if (!key) continue;
    const existing = byCanonical.get(key);
    if (!existing || row.score > existing.score) byCanonical.set(key, row);
  }

  const bestPerCanonical = Array.from(byCanonical.values());
  const selectedRows = candidateRows.filter((row) => row.selected);
  const maturityMismatchRejectCount = candidateRows.filter((row) => row.maturityMismatchRejected).length;
  const likelyElementarySelected = selectedRows.filter((row) => row.likelyElementaryReader).length;
  const likelyElementaryPassingMaturity = candidateRows.filter((row) => !row.maturityMismatchRejected && row.likelyElementaryReader).length;
  const positiveScoreCount = candidateRows.filter((row) => row.score > 0).length;

  return {
    policy: policyName,
    sourceRawCount: rawRows.length,
    normalizedCount: normalized.length,
    scoredCount: scored.length,
    candidateAudienceBandHistogram: histogram(candidateRows.map((row) => row.audienceBand || "unknown")),
    maturityBandHistogram: histogram(candidateRows.map((row) => row.maturityBand || "none")),
    rejectedReasonsHistogram: selection.rejectedReasons,
    maturityMismatchRejectCount,
    positiveScoreCount,
    selectedCount: selectedRows.length,
    selectedLikelyElementaryCount: likelyElementarySelected,
    likelyElementaryPassingMaturityCount: likelyElementaryPassingMaturity,
    selectedAverageScore: selectedRows.length > 0
      ? Number((selectedRows.reduce((sum, row) => sum + row.score, 0) / selectedRows.length).toFixed(3))
      : 0,
    selectedMedianScore: median(selectedRows.map((row) => row.score)),
    selectedTitles: selectedRows
      .sort((a, b) => a.rank - b.rank)
      .slice(0, 20)
      .map((row) => `${row.candidateTitle} [${row.canonicalTitle}]`),
    bestPerCanonicalCount: bestPerCanonical.length,
    bestPerCanonicalMaturityMismatchCount: bestPerCanonical.filter((row) => row.maturityMismatchRejected).length,
    bestPerCanonicalSelectedCount: bestPerCanonical.filter((row) => row.selected).length,
    bestPerCanonicalMedianRank: median(bestPerCanonical.map((row) => row.rank)),
    bestPerCanonicalMedianScore: median(bestPerCanonical.map((row) => row.score)),
    bestPerCanonicalLikelyElementaryCount: bestPerCanonical.filter((row) => row.likelyElementaryReader).length,
    bestPerCanonical: bestPerCanonical.sort((a, b) => a.rank - b.rank),
    candidateRows: candidateRows.sort((a, b) => a.rank - b.rank),
  };
}

function summarizeDelta(currentResult, relaxedResult) {
  return {
    canonicalBestEntriesMovedOffMismatch: currentResult.bestPerCanonicalMaturityMismatchCount - relaxedResult.bestPerCanonicalMaturityMismatchCount,
    selectedCountDelta: relaxedResult.selectedCount - currentResult.selectedCount,
    selectedLikelyElementaryDelta: relaxedResult.selectedLikelyElementaryCount - currentResult.selectedLikelyElementaryCount,
    positiveScoreCountDelta: relaxedResult.positiveScoreCount - currentResult.positiveScoreCount,
    bestPerCanonicalSelectedDelta: relaxedResult.bestPerCanonicalSelectedCount - currentResult.bestPerCanonicalSelectedCount,
  };
}

function csvEscape(value) {
  const text = String(value ?? "");
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, "\"\"")}"` : text;
}

async function main() {
  const localEnv = parseDotEnv(resolve(repoRoot, ".env"));
  process.env.EXPO_PUBLIC_GOOGLE_BOOKS_API_KEY = process.env.EXPO_PUBLIC_GOOGLE_BOOKS_API_KEY || localEnv.EXPO_PUBLIC_GOOGLE_BOOKS_API_KEY || "";
  const apiKey = process.env.EXPO_PUBLIC_GOOGLE_BOOKS_API_KEY || "";
  if (!apiKey) {
    throw new Error("Missing EXPO_PUBLIC_GOOGLE_BOOKS_API_KEY in environment or .env.");
  }

  console.log(`Running maturity policy experiment over ${CANONICAL_BOOKS.length} canonical middle-grade titles...`);
  const fetchedByBook = await fetchCanonicalVolumeSets(apiKey);
  const profile = makePreteenProfile();

  const currentRows = buildPolicyRows(fetchedByBook, "current_mapping");
  const relaxedRows = buildPolicyRows(fetchedByBook, "juvenile_fiction_relaxed_to_unknown");
  const currentResult = runPipelineForPolicy("current_mapping", currentRows.rawRows, profile);
  const relaxedResult = runPipelineForPolicy("juvenile_fiction_relaxed_to_unknown", relaxedRows.rawRows, profile);
  const delta = summarizeDelta(currentResult, relaxedResult);

  const allCandidateRows = [...currentResult.candidateRows, ...relaxedResult.candidateRows];

  if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });
  const jsonPath = resolve(outDir, "preteen-googlebooks-maturity-policy-experiment.json");
  const csvPath = resolve(outDir, "preteen-googlebooks-maturity-policy-experiment.csv");

  const byCanonicalCurrent = new Map(currentResult.bestPerCanonical.map((row) => [row.canonicalId, row]));
  const byCanonicalRelaxed = new Map(relaxedResult.bestPerCanonical.map((row) => [row.canonicalId, row]));
  const canonicalComparisons = CANONICAL_BOOKS.map((book) => ({
    canonicalId: book.id,
    canonicalTitle: book.title,
    canonicalAuthor: book.author,
    current: byCanonicalCurrent.get(book.id) || null,
    relaxed: byCanonicalRelaxed.get(book.id) || null,
  }));

  const reclassified = [];
  for (const row of relaxedRows.rawRows) {
    if (row.policyAudienceBandReason === "juvenile_fiction_relaxed_to_unknown") {
      reclassified.push({
        canonicalId: row.canonicalId,
        canonicalTitle: row.canonicalTitle,
        candidateTitle: row.title,
        originalAudienceBand: "kids",
        relaxedAudienceBand: row.audienceBand,
      });
    }
  }

  const output = {
    generatedAt: new Date().toISOString(),
    canonicalTitleCount: CANONICAL_BOOKS.length,
    canonicalBooks: CANONICAL_BOOKS,
    experimentProfile: {
      ageBand: profile.ageBand,
      maturityBand: profile.maturityBand,
      topGenreSignals: profile.genreFamily.slice(0, 6).map((row) => row.value),
      topThemeSignals: profile.themes.slice(0, 6).map((row) => row.value),
    },
    dataCapture: {
      editionsCapturedCurrent: currentRows.rawRows.length,
      editionsCapturedRelaxed: relaxedRows.rawRows.length,
      reclassifiedFromKidsToUnknownCount: reclassified.length,
      reclassifiedSample: reclassified.slice(0, 25),
    },
    policies: {
      current_mapping: currentResult,
      juvenile_fiction_relaxed_to_unknown: relaxedResult,
    },
    delta,
    canonicalComparisons,
  };

  writeFileSync(jsonPath, `${JSON.stringify(output, null, 2)}\n`, "utf8");

  const csvHeader = [
    "policy",
    "canonicalId",
    "canonicalTitle",
    "canonicalAuthor",
    "candidateTitle",
    "audienceBand",
    "maturityBand",
    "sourceMaturityRating",
    "score",
    "rank",
    "selected",
    "maturityMismatchRejected",
    "likelyElementaryReader",
    "rejectedReasons",
  ];
  const csvLines = [csvHeader.join(",")];
  for (const row of allCandidateRows) {
    csvLines.push([
      row.policy,
      row.canonicalId,
      row.canonicalTitle,
      row.canonicalAuthor,
      row.candidateTitle,
      row.audienceBand,
      row.maturityBand,
      row.sourceMaturityRating,
      row.score,
      row.rank,
      row.selected,
      row.maturityMismatchRejected,
      row.likelyElementaryReader,
      row.rejectedReasons.join("|"),
    ].map(csvEscape).join(","));
  }
  writeFileSync(csvPath, `${csvLines.join("\n")}\n`, "utf8");

  console.log(`JSON written: ${jsonPath}`);
  console.log(`CSV written:  ${csvPath}`);
  console.log("");
  console.log("=== SUMMARY ===");
  console.log(`Canonical titles: ${CANONICAL_BOOKS.length}`);
  console.log(`Editions captured: current=${currentResult.sourceRawCount}, relaxed=${relaxedResult.sourceRawCount}`);
  console.log(`Best-per-title maturity mismatches: current=${currentResult.bestPerCanonicalMaturityMismatchCount}, relaxed=${relaxedResult.bestPerCanonicalMaturityMismatchCount}`);
  console.log(`Best-per-title selected: current=${currentResult.bestPerCanonicalSelectedCount}, relaxed=${relaxedResult.bestPerCanonicalSelectedCount}`);
  console.log(`Selected likely-elementary: current=${currentResult.selectedLikelyElementaryCount}, relaxed=${relaxedResult.selectedLikelyElementaryCount}`);
  console.log(`Delta (titles moved off mismatch): ${delta.canonicalBestEntriesMovedOffMismatch}`);
}

main().catch((error) => {
  console.error("Experiment failed:", error?.message || error);
  process.exit(1);
});
