/**
 * NYT-F2A: Overview endpoint parity and depth audit (READ-ONLY).
 *
 * Fetches:
 *   1. /lists/overview.json                       — 1 call
 *   2. /lists/current/combined-print-and-e-book-fiction.json
 *   3. /lists/current/hardcover-fiction.json
 *   4. /lists/current/trade-fiction-paperback.json
 *
 * Compares field-by-field: slug, display name, list ID, rank, weeks_on_list,
 * title, author, description, publisher, ISBNs, cover URL, retailer links,
 * list dates (bestsellers_date, published_date), book count, ordering.
 *
 * Outputs a human-readable audit report + structured JSON artifact.
 * Makes NO production code changes.
 */

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, "..");
const outDir = resolve(scriptDir, "output");
mkdirSync(outDir, { recursive: true });

// ── env ──────────────────────────────────────────────────────────────────────

function parseDotEnv(path) {
  try {
    const raw = readFileSync(path, "utf8");
    const out = {};
    for (const line of raw.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const idx = trimmed.indexOf("=");
      if (idx <= 0) continue;
      out[trimmed.slice(0, idx).trim()] = trimmed.slice(idx + 1).trim();
    }
    return out;
  } catch {
    return {};
  }
}

const env = parseDotEnv(resolve(repoRoot, ".env"));
const apiKey = String(
  env.NYT_BOOKS_API_KEY
  || env.EXPO_PUBLIC_NYT_BOOKS_API_KEY
  || env.NEXT_PUBLIC_NYT_BOOKS_API_KEY
  || process.env.NYT_BOOKS_API_KEY
  || "",
).trim();

if (!apiKey) {
  console.error("FATAL: NYT_BOOKS_API_KEY not found in .env or environment.");
  process.exit(1);
}

const NYT_BASE = "https://api.nytimes.com/svc/books/v3";
const ADULT_LISTS = [
  "combined-print-and-e-book-fiction",
  "hardcover-fiction",
  "trade-fiction-paperback",
];

// ── helpers ──────────────────────────────────────────────────────────────────

function redact(url) {
  return url.replace(/([?&]api-key=)[^&]+/gi, "$1[redacted]");
}

async function fetchJson(url) {
  const start = Date.now();
  let status = 0;
  let body = "";
  try {
    const res = await fetch(url, { headers: { Accept: "application/json" } });
    status = res.status;
    body = await res.text();
    const json = body ? JSON.parse(body) : null;
    return { ok: res.ok, status, elapsedMs: Date.now() - start, json, error: null };
  } catch (err) {
    return { ok: false, status, elapsedMs: Date.now() - start, json: null, error: String(err) };
  }
}

function fieldPresence(book) {
  return {
    title: Boolean(book.title || book.book_title),
    author: Boolean(book.author || book.contributor),
    description: Boolean(book.description),
    publisher: Boolean(book.publisher),
    isbn10: Boolean(book.primary_isbn10),
    isbn13: Boolean(book.primary_isbn13),
    rank: book.rank !== undefined && book.rank !== null,
    weeks_on_list: book.weeks_on_list !== undefined && book.weeks_on_list !== null,
    amazon_product_url: Boolean(book.amazon_product_url),
    book_image: Boolean(book.book_image),
    age_group: Boolean(book.age_group),
    buy_links: Array.isArray(book.buy_links) && book.buy_links.length > 0,
    book_review_link: Boolean(book.book_review_link),
    first_chapter_link: Boolean(book.first_chapter_link),
    article_chapter_link: Boolean(book.article_chapter_link),
    sunday_review_uuid: Boolean(book.sunday_review_uuid),
  };
}

function pct(have, total) {
  if (!total) return "n/a";
  return `${Math.round((have / total) * 100)}%`;
}

function summarizeFields(books) {
  const counts = {};
  for (const book of books) {
    const fp = fieldPresence(book);
    for (const [k, v] of Object.entries(fp)) {
      counts[k] = (counts[k] || 0) + (v ? 1 : 0);
    }
  }
  const n = books.length;
  return Object.fromEntries(Object.entries(counts).map(([k, v]) => [k, `${v}/${n} (${pct(v, n)})`]));
}

function extractTitlesWithRank(books) {
  return books.map((b) => ({
    rank: b.rank ?? null,
    title: String(b.title || b.book_title || "").trim(),
    author: String(b.author || b.contributor || "").replace(/^by\s+/i, "").trim(),
    weeks: b.weeks_on_list ?? null,
    isbn13: String(b.primary_isbn13 || "").trim() || null,
    isbn10: String(b.primary_isbn10 || "").trim() || null,
  }));
}

// ── fetch overview ────────────────────────────────────────────────────────────

console.log("\n──────────────────────────────────────────────────────────");
console.log("NYT-F2A: Overview Endpoint Parity and Depth Audit");
console.log("──────────────────────────────────────────────────────────\n");

const overviewUrl = `${NYT_BASE}/lists/overview.json?api-key=${encodeURIComponent(apiKey)}`;
console.log(`Fetching overview: ${redact(overviewUrl)}`);
const overviewResp = await fetchJson(overviewUrl);
console.log(`  HTTP ${overviewResp.status}  ${overviewResp.elapsedMs}ms`);

// ── fetch each individual adult list ─────────────────────────────────────────

const listResps = {};
for (const slug of ADULT_LISTS) {
  const url = `${NYT_BASE}/lists/current/${encodeURIComponent(slug)}.json?api-key=${encodeURIComponent(apiKey)}`;
  console.log(`Fetching list   : ${redact(url)}`);
  // Serialize with 13-second gaps to stay well within 5 req/60 s.
  await new Promise((r) => setTimeout(r, 13_000));
  const resp = await fetchJson(url);
  listResps[slug] = resp;
  console.log(`  HTTP ${resp.status}  ${resp.elapsedMs}ms`);
}

// ── parse overview ────────────────────────────────────────────────────────────

const overviewJson = overviewResp.json;
const overviewLists = overviewJson?.results?.lists ?? [];

// Build lookup by list_name_encoded from the overview
const overviewBySlug = {};
for (const lst of overviewLists) {
  const slug = String(lst.list_name_encoded || lst.list_id || "").toLowerCase().trim();
  if (slug) overviewBySlug[slug] = lst;
}

// ── compare ───────────────────────────────────────────────────────────────────

console.log("\n══════════════════════════════════════════════════════════");
console.log("COMPARISON RESULTS");
console.log("══════════════════════════════════════════════════════════\n");

const comparisons = [];

for (const slug of ADULT_LISTS) {
  const perListResp = listResps[slug];
  const perListResult = perListResp?.json?.results ?? {};
  const perListBooks = Array.isArray(perListResult.books) ? perListResult.books : [];

  const overviewList = overviewBySlug[slug];
  const overviewBooks = Array.isArray(overviewList?.books) ? overviewList.books : [];

  const comparison = {
    slug,
    perList: {
      httpStatus: perListResp?.status,
      elapsedMs: perListResp?.elapsedMs,
      listName: perListResult.list_name ?? null,
      listNameEncoded: perListResult.list_name_encoded ?? null,
      listId: perListResult.list_id ?? null,
      bestsellersDate: perListResult.bestsellers_date ?? null,
      publishedDate: perListResult.published_date ?? null,
      nextPublishedDate: perListResult.next_published_date ?? null,
      previousPublishedDate: perListResult.previous_published_date ?? null,
      numResults: perListResult.num_results ?? null,
      bookCount: perListBooks.length,
      fieldCoverage: summarizeFields(perListBooks),
      titlesWithRank: extractTitlesWithRank(perListBooks),
    },
    overview: {
      found: Boolean(overviewList),
      listName: overviewList?.list_name ?? null,
      listNameEncoded: overviewList?.list_name_encoded ?? null,
      listId: overviewList?.list_id ?? null,
      bestsellersDate: overviewList?.bestsellers_date ?? null,
      publishedDate: overviewList?.published_date ?? null,
      updatedAt: overviewList?.updated ?? null,
      bookCount: overviewBooks.length,
      fieldCoverage: overviewBooks.length ? summarizeFields(overviewBooks) : {},
      titlesWithRank: extractTitlesWithRank(overviewBooks),
    },
    verdict: {},
  };

  // Compute verdicts
  const v = comparison.verdict;
  v.countMatch = comparison.perList.bookCount === comparison.overview.bookCount;
  v.perListCount = comparison.perList.bookCount;
  v.overviewCount = comparison.overview.bookCount;
  v.countDiff = comparison.overview.bookCount - comparison.perList.bookCount;

  // Compare ISBN coverage (key for dedup)
  const plCov = comparison.perList.fieldCoverage;
  const ovCov = comparison.overview.fieldCoverage;
  v.isbnCoverageMatch = (plCov.isbn13 === ovCov.isbn13) && (plCov.isbn10 === ovCov.isbn10);

  // Compare title ordering by rank
  const plTitles = comparison.perList.titlesWithRank.map((t) => t.title);
  const ovTitles = comparison.overview.titlesWithRank.map((t) => t.title);
  v.titleOrderMatch = JSON.stringify(plTitles) === JSON.stringify(ovTitles);
  v.titlesOnlyInPerList = plTitles.filter((t) => !ovTitles.includes(t));
  v.titlesOnlyInOverview = ovTitles.filter((t) => !plTitles.includes(t));

  // Fields missing from overview
  const overviewFieldNames = Object.keys(ovCov);
  const perListFieldNames = Object.keys(plCov);
  v.fieldsOnlyInPerList = perListFieldNames.filter((f) => !overviewFieldNames.includes(f));
  v.fieldsOnlyInOverview = overviewFieldNames.filter((f) => !perListFieldNames.includes(f));

  // Assess whether overview is a viable substitute
  v.overviewIsViableSubstitute = (
    comparison.overview.found
    && !v.countDiff // same book count
    && v.isbnCoverageMatch
    && v.titleOrderMatch
    && v.titlesOnlyInPerList.length === 0
  );

  comparisons.push(comparison);

  // Print summary
  console.log(`── ${slug} ──`);
  console.log(`  Per-list  HTTP ${comparison.perList.httpStatus}, books: ${comparison.perList.bookCount}, bestsellers_date: ${comparison.perList.bestsellersDate}`);
  console.log(`  Overview  found: ${comparison.overview.found}, books: ${comparison.overview.bookCount}, bestsellers_date: ${comparison.overview.bestsellersDate}`);
  console.log(`  Count diff: ${v.countDiff > 0 ? "+" : ""}${v.countDiff}  (overview has ${v.countDiff > 0 ? "more" : v.countDiff < 0 ? "FEWER" : "same"})`);
  console.log(`  Title order match: ${v.titleOrderMatch ? "YES" : "NO"}`);
  console.log(`  ISBN coverage match: ${v.isbnCoverageMatch ? "YES" : "NO"}`);
  if (v.titlesOnlyInPerList.length) console.log(`  Titles ONLY in per-list (${v.titlesOnlyInPerList.length}): ${v.titlesOnlyInPerList.slice(0, 5).join(", ")}`);
  if (v.titlesOnlyInOverview.length) console.log(`  Titles ONLY in overview (${v.titlesOnlyInOverview.length}): ${v.titlesOnlyInOverview.slice(0, 5).join(", ")}`);
  console.log(`  Viable substitute: ${v.overviewIsViableSubstitute ? "✓ YES" : "✗ NO"}`);
  console.log();
}

// ── overview metadata ─────────────────────────────────────────────────────────

console.log("── Overview metadata ──");
console.log(`  HTTP ${overviewResp.status}  ${overviewResp.elapsedMs}ms`);
console.log(`  Total lists in overview response: ${overviewLists.length}`);
console.log(`  List slugs present: ${overviewLists.map((l) => l.list_name_encoded).filter(Boolean).join(", ")}`);
console.log(`  Adult fiction slugs present: ${ADULT_LISTS.map((s) => overviewBySlug[s] ? `${s} ✓` : `${s} ✗`).join(", ")}`);
console.log();

// ── field-by-field comparison table ──────────────────────────────────────────

console.log("══════════════════════════════════════════════════════════");
console.log("FIELD COVERAGE COMPARISON (per-list vs overview)");
console.log("══════════════════════════════════════════════════════════");

const FIELDS = ["title", "author", "description", "publisher", "isbn10", "isbn13",
  "rank", "weeks_on_list", "amazon_product_url", "book_image", "age_group",
  "buy_links", "book_review_link", "first_chapter_link", "article_chapter_link", "sunday_review_uuid"];

for (const cmp of comparisons) {
  console.log(`\n  ${cmp.slug}`);
  console.log(`  ${"Field".padEnd(26)} Per-list      Overview`);
  console.log(`  ${"─".repeat(52)}`);
  for (const f of FIELDS) {
    const pl = String(cmp.perList.fieldCoverage[f] ?? "—").padEnd(14);
    const ov = String(cmp.overview.fieldCoverage[f] ?? "— (not in overview)");
    console.log(`  ${f.padEnd(26)} ${pl}  ${ov}`);
  }
}

// ── final recommendation ──────────────────────────────────────────────────────

const allViable = comparisons.every((c) => c.verdict.overviewIsViableSubstitute);
const anyShallower = comparisons.some((c) => (c.verdict.countDiff ?? 0) < 0);

console.log("\n══════════════════════════════════════════════════════════");
console.log("AUDIT CONCLUSION");
console.log("══════════════════════════════════════════════════════════\n");

if (allViable) {
  console.log("✓ OVERVIEW IS A VIABLE SUBSTITUTE for all 3 adult lists.");
  console.log("  Recommendation: switch to single overview call (1 req vs 3 req per run).");
  console.log("  This would reduce adult quota consumption by ~67% with no data loss.");
} else if (anyShallower) {
  console.log("✗ OVERVIEW RETURNS FEWER BOOKS on at least one list.");
  console.log("  Recommendation: keep per-list fetches; overview is NOT a safe substitute.");
  for (const c of comparisons) {
    if ((c.verdict.countDiff ?? 0) < 0) {
      console.log(`  ${c.slug}: per-list=${c.verdict.perListCount} overview=${c.verdict.overviewCount} (missing ${Math.abs(c.verdict.countDiff ?? 0)} books)`);
    }
  }
} else {
  console.log("⚠ MIXED RESULT: some lists match, some differ.");
  for (const c of comparisons) {
    const icon = c.verdict.overviewIsViableSubstitute ? "✓" : "✗";
    console.log(`  ${icon} ${c.slug}: viable=${c.verdict.overviewIsViableSubstitute}, countDiff=${c.verdict.countDiff}`);
  }
  console.log("  Recommendation: investigate mismatched lists before switching.");
}

// ── save artifacts ────────────────────────────────────────────────────────────

const artifact = {
  auditTimestamp: new Date().toISOString(),
  overviewHttpStatus: overviewResp.status,
  overviewListCount: overviewLists.length,
  overviewElapsedMs: overviewResp.elapsedMs,
  adultListSlugs: ADULT_LISTS,
  comparisons,
  conclusion: {
    allListsViable: allViable,
    anyOverviewShallower: anyShallower,
    recommendation: allViable
      ? "switch_to_overview"
      : anyShallower
        ? "keep_per_list_fetches"
        : "mixed_investigate",
  },
};

const jsonPath = resolve(outDir, "nyt-f2a-overview-audit.json");
writeFileSync(jsonPath, JSON.stringify(artifact, null, 2));
console.log(`\nArtifact saved: ${jsonPath}`);
