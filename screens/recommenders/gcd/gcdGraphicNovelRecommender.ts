// /screens/recommenders/gcd/gcdGraphicNovelRecommender.ts
//
// Grand Comics Database recommender (20Q-aligned).
// Teen-only auxiliary engine for comics / graphic novel sessions.
// Thin fetcher only: literal signal gating, literal query translation,
// no hardcoded fallback inventory, no manual reranking, no hidden shaping.

import type { RecommenderInput, RecommendationResult, RecommendationDoc } from "../types";
import type { TagCounts } from "../../swipe/openLibraryFromTags";

const GCD_BASE = "https://www.comics.org";

function normalizeText(value: any): string {
  return String(value || "")
    .toLowerCase()
    .replace(/[_\-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function safeNumber(value: any, fallback = 0): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function getDirectGraphicSignalWeight(tagCounts: TagCounts | undefined): number {
  return (
    Number(tagCounts?.["format:graphic_novel"] || 0) +
    Number(tagCounts?.["format:graphic novel"] || 0) +
    Number(tagCounts?.["format:comic"] || 0) +
    Number(tagCounts?.["format:comics"] || 0) +
    Number(tagCounts?.["topic:comics"] || 0) +
    Number(tagCounts?.["topic:graphic novels"] || 0) +
    Number(tagCounts?.["topic:graphic novel"] || 0)
  );
}

function hasTeenGraphicIntent(tagCounts: TagCounts | undefined): boolean {
  return getDirectGraphicSignalWeight(tagCounts) > 0;
}

function topPositiveTags(tagCounts: TagCounts | undefined, limit: number): string[] {
  return Object.entries(tagCounts || {})
    .filter(([, count]) => Number(count) > 0)
    .sort((a, b) => Number(b[1]) - Number(a[1]))
    .map(([tag]) => tag)
    .slice(0, limit);
}

function tagToGcdQuery(tag: string): string | null {
  const normalized = normalizeText(tag);
  const bare = normalized.includes(":") ? normalized.split(":").slice(1).join(":").trim() : normalized;

  if (!bare) return null;

  // Direct format/topic signals
  if (
    normalized === "format:graphic novel" ||
    normalized === "format:graphic_novel" ||
    normalized === "topic:graphic novel" ||
    normalized === "topic:graphic novels"
  ) {
    return "graphic novel";
  }

  if (
    normalized === "format:comic" ||
    normalized === "format:comics" ||
    normalized === "topic:comics"
  ) {
    return "comic";
  }

  // Literal downstream translations only
  if (normalized.startsWith("genre:")) return bare;
  if (normalized.startsWith("topic:")) return bare;
  if (normalized.startsWith("theme:")) return bare;
  if (normalized.startsWith("setting:")) return bare;
  if (normalized.startsWith("archetype:")) return bare;
  if (normalized.startsWith("vibe:")) return bare;
  if (normalized.startsWith("mood:")) return bare;
  if (normalized.startsWith("format:")) return bare;

  return null;
}

function buildGcdSearchTerms(tagCounts: TagCounts | undefined): string[] {
  const out: string[] = [];
  const seen = new Set<string>();

  const add = (q: string | null | undefined) => {
    const trimmed = normalizeText(q);
    if (!trimmed || seen.has(trimmed)) return;
    seen.add(trimmed);
    out.push(trimmed);
  };

  const positive = topPositiveTags(tagCounts, 25);
  for (const tag of positive) {
    add(tagToGcdQuery(tag));
  }

  // Minimal literal fallback only when direct comics/graphic evidence exists
  // but no other usable token was produced.
  if (!out.length && hasTeenGraphicIntent(tagCounts)) {
    add("graphic novel");
  }

  return out.slice(0, 8);
}

function hasFacet(tagCounts: TagCounts | undefined, re: RegExp): boolean {
  return Object.entries(tagCounts || {}).some(([k, v]) => Number(v) > 0 && re.test(normalizeText(k)));
}

function buildComicQueriesFromFacets(tagCounts: TagCounts | undefined): string[] {
  const queries: string[] = [];
  const add = (q: string) => {
    const n = normalizeText(q);
    if (n && !queries.includes(n)) queries.push(n);
  };

  if (hasFacet(tagCounts, /horror|dark|haunted|terror|ghost|occult/)) add("horror comics");
  if (hasFacet(tagCounts, /mystery|crime|detective|noir|investigation/)) add("dark mystery comics");
  if (hasFacet(tagCounts, /survival|post apocalyptic|apocalypse|wilderness/)) add("survival comics");
  if (hasFacet(tagCounts, /dystopian|future|rebellion|authoritarian/)) add("dystopian adventure comics");
  if (hasFacet(tagCounts, /teen|young adult|school|coming of age/)) add("teen graphic novel");
  if (hasFacet(tagCounts, /supernatural|paranormal|magic|myth|monster|vampire/)) add("supernatural comics");

  if (!queries.length) {
    add("teen graphic novel");
    add("horror comics");
    add("dark mystery comics");
  }

  return queries.slice(0, 6);
}

function buildGcdRungs(queries: string[]): Array<{ rung: number; query: string; audience: string; themes: string[] }> {
  return queries.map((query, i) => ({
    rung: i,
    query,
    audience: "teen comics",
    themes: query.split(" ").filter(Boolean).slice(0, 6),
  }));
}

async function fetchTextWithTimeout(url: string, timeoutMs: number): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const resp = await fetch(url, {
      signal: controller.signal,
      headers: {
        Accept: "text/html,application/json;q=0.9,*/*;q=0.8",
      },
    });
    if (!resp.ok) throw new Error(`GCD error: ${resp.status}`);
    return await resp.text();
  } finally {
    clearTimeout(timer);
  }
}

async function fetchJsonWithTimeout(url: string, timeoutMs: number): Promise<any> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const resp = await fetch(url, {
      signal: controller.signal,
      headers: {
        Accept: "application/json",
      },
    });
    if (!resp.ok) throw new Error(`GCD error: ${resp.status}`);
    return await resp.json();
  } finally {
    clearTimeout(timer);
  }
}

function extractIssueApiUrls(html: string, limit: number): string[] {
  const matches = Array.from(
    String(html || "").matchAll(/https:\/\/www\.comics\.org\/api\/issue\/\d+\/\?format=json/g)
  ).map((m) => m[0]);

  const unique: string[] = [];
  const seen = new Set<string>();
  for (const match of matches) {
    if (seen.has(match)) continue;
    seen.add(match);
    unique.push(match);
    if (unique.length >= limit) break;
  }
  return unique;
}

function parseYear(value: any): number | undefined {
  const raw = String(value || "");
  const match = raw.match(/(18|19|20)\d{2}/);
  return match ? Number(match[0]) : undefined;
}

function gcdIssueToDoc(issue: any, queryText: string, queryRung: number): RecommendationDoc | null {
  const title = String(issue?.series_name || issue?.title || issue?.descriptor || "").trim();
  if (!title) return null;

  const storySet = Array.isArray(issue?.story_set) ? issue.story_set : [];
  const storyGenres = storySet
    .map((story: any) => String(story?.genre || "").trim())
    .filter(Boolean);
  const storyFeatures = storySet
    .map((story: any) => String(story?.feature || "").trim())
    .filter(Boolean);
  const characters = storySet
    .flatMap((story: any) => String(story?.characters || "").split(/;|,/))
    .map((v: any) => String(v || "").trim())
    .filter(Boolean);

  const subjects = Array.from(
    new Set([
      "graphic novel",
      "comics",
      ...storyGenres,
      ...storyFeatures,
      ...characters,
      String(issue?.keywords || "").trim(),
      String(issue?.indicia_publisher || "").trim(),
    ].filter(Boolean))
  );

  return {
    key: issue?.api_url || `gcd:${issue?.series || issue?.series_name || title}`,
    title,
    author_name: storyFeatures.length ? [storyFeatures[0]] : ["Grand Comics Database"],
    first_publish_year: parseYear(issue?.key_date || issue?.publication_date),
    cover_i: issue?.cover,
    subject: subjects,
    edition_count: safeNumber(issue?.page_count, 0) > 0 ? 1 : 0,
    publisher: issue?.indicia_publisher || issue?.brand_emblem || "Grand Comics Database",
    language: undefined,
    source: "gcd",
    queryRung,
    queryText,
    subtitle: String(issue?.descriptor || "").trim() || undefined,
    description: String(issue?.notes || "").trim() || undefined,
    averageRating: 0,
    ratingsCount: 0,
    pageCount: safeNumber(issue?.page_count, 0),
    volumeInfo: {
      categories: subjects,
      imageLinks: {
        thumbnail: issue?.cover,
      },
    },
  } as any;
}

function buildSearchUrl(query: string): string {
  const encoded = encodeURIComponent(query);
  return `${GCD_BASE}/search/advanced/process/?target=issue&method=icontains&logic=False&title=${encoded}`;
}

export async function getGcdGraphicNovelRecommendations(input: RecommenderInput): Promise<RecommendationResult> {
  const deckKey = input.deckKey;
  const domainMode: RecommendationResult["domainMode"] = "default";
  const finalLimit = Math.max(1, Math.min(40, input.limit ?? 12));
  const fetchLimit = Math.max(8, Math.min(36, Math.max(finalLimit * 2, 12)));
  const timeoutMs = Math.max(2500, Math.min(15000, input.timeoutMs ?? 10000));

  const directQueries = buildGcdSearchTerms(input.tagCounts);
  const facetQueries = buildComicQueriesFromFacets(input.tagCounts);
  const queriesToTry = Array.from(new Set([...directQueries, ...facetQueries])).slice(0, 10);
  const gcdRungs = buildGcdRungs(queriesToTry);
  const sourceEnabled = (input as any)?.sourceEnabled || {};
  const gcdOnlyMode =
    sourceEnabled?.gcd !== false &&
    sourceEnabled?.googleBooks === false &&
    sourceEnabled?.openLibrary === false &&
    sourceEnabled?.localLibrary === false &&
    sourceEnabled?.kitsu === false;
  if (!queriesToTry.length) {
    if (gcdOnlyMode) {
      throw new Error("GCD_ONLY_NO_QUERIES: GCD is the only enabled source but no comic queries were generated.");
    }
    return {
      engineId: "gcd",
      engineLabel: "Grand Comics Database",
      deckKey,
      domainMode,
      builtFromQuery: "",
      items: [],
      debugRungStats: { byRung: {}, byRungSource: {}, total: 0 } as any,
      debugFilterAudit: [{ source: "gcd", reason: "no_queries_generated", detail: "No GCD queries could be generated from tag counts." }],
      gcdQueriesGenerated: [],
      gcdFetchAttempted: false,
      gcdZeroResultReason: "no_queries_generated",
    };
  }

  const docs: RecommendationDoc[] = [];
  const seen = new Set<string>();
  let builtFromQuery = queriesToTry[0] || "";
  const gcdFetchResults: Array<{ query: string; status: "ok" | "no_matches" | "error"; rawCount: number; error: string | null }> = [];

  for (let i = 0; i < queriesToTry.length; i += 1) {
    const q = queriesToTry[i];
    const searchUrl = buildSearchUrl(q);

    let issueUrls: string[] = [];
    let queryError: string | null = null;
    try {
      const html = await fetchTextWithTimeout(searchUrl, timeoutMs);
      issueUrls = extractIssueApiUrls(html, fetchLimit);
    } catch (err: any) {
      issueUrls = [];
      queryError = String(err?.message || err || "search_fetch_failed");
    }

    if (!issueUrls.length) {
      gcdFetchResults.push({ query: q, status: queryError ? "error" : "no_matches", rawCount: 0, error: queryError });
      continue;
    }
    if (!docs.length) builtFromQuery = q;
    const docsBeforeQuery = docs.length;

    for (const issueUrl of issueUrls) {
      let issue: any;
      try {
        issue = await fetchJsonWithTimeout(issueUrl, timeoutMs);
      } catch (err: any) {
        queryError = queryError || String(err?.message || err || "issue_fetch_failed");
        continue;
      }

      const doc = gcdIssueToDoc(issue, q, i);
      if (!doc?.title) continue;

      const dedupeKey = String(doc.key || `${doc.title}|${doc.author_name?.[0] || ""}`).toLowerCase();
      if (seen.has(dedupeKey)) continue;
      seen.add(dedupeKey);
      docs.push(doc);
      if (docs.length >= fetchLimit) break;
    }
    const queryRawCount = Math.max(0, docs.length - docsBeforeQuery);
    gcdFetchResults.push({
      query: q,
      status: queryRawCount > 0 ? "ok" : queryError ? "error" : "no_matches",
      rawCount: queryRawCount,
      error: queryError,
    });

    if (docs.length >= fetchLimit) break;
    if (i === 0 && docs.length >= Math.max(4, finalLimit)) break;
  }

  return {
    engineId: "gcd",
    engineLabel: "Grand Comics Database",
    deckKey,
    domainMode,
    builtFromQuery,
    items: docs.slice(0, fetchLimit).map((doc) => ({ kind: "gcd", doc })),
    debugRawFetchedCount: docs.length,
    gcdQueriesGenerated: queriesToTry,
    gcdQueryTexts: queriesToTry,
    gcdFetchResults,
    gcdFetchAttempted: true,
    gcdZeroResultReason: docs.length ? null : "no_issue_api_matches",
    debugRungStats: {
      byRung: Object.fromEntries(gcdRungs.map((r) => [String(r.rung), 0])),
      byRungSource: { gcd: Object.fromEntries(gcdRungs.map((r) => [String(r.rung), 0])) },
      total: docs.length,
    } as any,
    debugRawPool: docs.slice(0, fetchLimit),
    debugFilterAudit: [
      {
        source: "gcd",
        rungs: gcdRungs,
        generatedQueries: queriesToTry,
        reason: docs.length ? "results_found" : "no_results_from_generated_queries",
        detail: docs.length
          ? `Fetched ${docs.length} docs from GCD.`
          : "Generated teen-comic queries but GCD returned no issue API matches.",
      },
    ],
  };
}
