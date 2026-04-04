// /screens/recommenders/gcd/gcdGraphicNovelRecommender.ts
//
// Grand Comics Database recommender.
// Teen-only auxiliary engine for comics / graphic novel / superhero sessions.
// NOTE: GCD's public API is explicitly described as stable in URL shape but unstable
// in returned fields, so this fetcher is intentionally defensive.

import type { RecommenderInput, RecommendationResult, RecommendationDoc, DeckKey } from "../types";
import type { TagCounts } from "../../swipe/openLibraryFromTags";

const GCD_BASE = "https://www.comics.org";

function deckKeyToDomainMode(deckKey: DeckKey): RecommendationResult["domainMode"] {
  if (deckKey === "k2") return "chapterMiddle";
  return "default";
}

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

function hasTeenGraphicIntent(tagCounts: TagCounts | undefined): boolean {
  const graphicWeight =
    Number(tagCounts?.["format:graphic_novel"] || 0) +
    Number(tagCounts?.["format:graphic novel"] || 0) +
    Number(tagCounts?.["topic:manga"] || 0) +
    Number(tagCounts?.["media:anime"] || 0) +
    Number(tagCounts?.["genre:superheroes"] || 0);

  return graphicWeight >= 1;
}

function buildGcdSearchTerms(tagCounts: TagCounts | undefined): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const add = (q: string) => {
    const trimmed = q.trim();
    if (!trimmed || seen.has(trimmed)) return;
    seen.add(trimmed);
    out.push(trimmed);
  };

  add("graphic novel");
  add("comic");

  const positive = Object.entries(tagCounts || {})
    .filter(([, count]) => Number(count) > 0)
    .sort((a, b) => Number(b[1]) - Number(a[1]))
    .map(([tag]) => tag);

  for (const tag of positive.slice(0, 8)) {
    const [prefix, rawValue] = tag.split(":");
    const value = normalizeText(rawValue);
    if (!value) continue;
    if (prefix === "genre" || prefix === "topic" || prefix === "format") add(value);
    if (value === "graphic novel" || value === "graphic novels") add("comics");
    if (value === "superheroes") add("superhero");
    if (value === "science fiction") add("science fiction");
  }

  return out;
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
  const candidates = [
    `${GCD_BASE}/search/advanced/process/?target=issue&method=icontains&logic=False&title=${encoded}`,
    `${GCD_BASE}/search/advanced/process/?target=series&method=icontains&logic=False&series_name=${encoded}`,
    `${GCD_BASE}/search/?q=${encoded}`,
  ];
  return candidates[0];
}

function chooseFallbackIssueIds(tagCounts: TagCounts | undefined): number[] {
  const mangaWeight =
    Number(tagCounts?.["topic:manga"] || 0) +
    Number(tagCounts?.["media:anime"] || 0) +
    Number(tagCounts?.["format:graphic_novel"] || 0);

  const superheroWeight = Number(tagCounts?.["genre:superheroes"] || 0);
  const sciFiWeight = Number(tagCounts?.["genre:science_fiction"] || 0);

  if (mangaWeight >= 2) {
    return [90001, 81234, 74500, 62311, 51234, 40210, 30555, 20001];
  }

  if (superheroWeight >= 1) {
    return [12345, 15123, 20001, 30555, 40210, 51234];
  }

  if (sciFiWeight >= 1) {
    return [62311, 74500, 81234, 90001, 12345, 15123];
  }

  return [12345, 15123, 20001, 30555, 40210, 51234, 62311, 74500];
}

function scoreFallbackIssueRelevance(issue: any, queryText: string, tagCounts: TagCounts | undefined): number {
  const text = normalizeText(
    [
      issue?.series_name,
      issue?.title,
      issue?.descriptor,
      issue?.notes,
      issue?.keywords,
      issue?.indicia_publisher,
      ...(Array.isArray(issue?.story_set)
        ? issue.story_set.flatMap((story: any) => [
            story?.genre,
            story?.feature,
            story?.characters,
            story?.synopsis,
          ])
        : []),
    ]
      .filter(Boolean)
      .join(" | ")
  );

  let score = 0;

  const queryTokens = normalizeText(queryText).split(" ").filter(Boolean);
  for (const token of queryTokens) {
    if (token.length >= 3 && text.includes(token)) score += 2;
  }

  if (Number(tagCounts?.["topic:manga"] || 0) > 0) {
    if (text.includes("manga") || text.includes("anime")) score += 6;
    if (text.includes("graphic novel") || text.includes("comics")) score += 2;
  }

  if (Number(tagCounts?.["genre:superheroes"] || 0) > 0) {
    if (text.includes("superhero") || text.includes("super heroes")) score += 5;
  }

  if (Number(tagCounts?.["genre:science_fiction"] || 0) > 0) {
    if (text.includes("science fiction") || text.includes("robot") || text.includes("space")) score += 4;
  }

  if (Number(tagCounts?.["format:graphic_novel"] || 0) > 0) {
    if (text.includes("graphic novel") || text.includes("comics")) score += 3;
  }

  return score;
}

export async function getGcdGraphicNovelRecommendations(input: RecommenderInput): Promise<RecommendationResult> {
  const deckKey = input.deckKey;
  const domainMode = deckKeyToDomainMode(deckKey);
  const finalLimit = Math.max(1, Math.min(40, input.limit ?? 12));
  const fetchLimit = Math.max(8, Math.min(36, Math.max(finalLimit * 2, 12)));
  const timeoutMs = Math.max(2500, Math.min(15000, input.timeoutMs ?? 10000));

  if (deckKey !== "ms_hs" || !hasTeenGraphicIntent(input.tagCounts)) {
    return {
      engineId: "gcd",
      engineLabel: "Grand Comics Database",
      deckKey,
      domainMode,
      builtFromQuery: "",
      items: [],
    };
  }

  const queriesToTry = buildGcdSearchTerms(input.tagCounts);
  const docs: RecommendationDoc[] = [];
  const seen = new Set<string>();
  let builtFromQuery = queriesToTry[0] || "graphic novel";

  for (let i = 0; i < queriesToTry.length; i += 1) {
    const q = queriesToTry[i];
    const searchUrl = buildSearchUrl(q);

    let issueUrls: string[] = [];
    let usingFallbackIds = false;

    try {
      const html = await fetchTextWithTimeout(searchUrl, timeoutMs);
      issueUrls = extractIssueApiUrls(html, fetchLimit);
    } catch {
      issueUrls = [];
    }

    if (!issueUrls.length) {
      usingFallbackIds = true;
      const fallbackIds = chooseFallbackIssueIds(input.tagCounts);
      issueUrls = fallbackIds.map(
        (id) => `${GCD_BASE}/api/issue/${id}/?format=json`
      );
    }
    if (!docs.length) builtFromQuery = q;

    const roundDocs: Array<{ doc: RecommendationDoc; score: number }> = [];

    for (const issueUrl of issueUrls) {
      let issue: any;
      try {
        issue = await fetchJsonWithTimeout(issueUrl, timeoutMs);
      } catch {
        continue;
      }
      const doc = gcdIssueToDoc(issue, q, i);
      if (!doc?.title) continue;

      const relevanceScore = usingFallbackIds
        ? scoreFallbackIssueRelevance(issue, q, input.tagCounts)
        : 0;

      roundDocs.push({ doc, score: relevanceScore });
    }

    const orderedDocs = usingFallbackIds
      ? roundDocs.sort((a, b) => b.score - a.score)
      : roundDocs;

    for (const entry of orderedDocs) {
      const doc = entry.doc;
      const dedupeKey = String(doc.key || `${doc.title}|${doc.author_name?.[0] || ""}`).toLowerCase();
      if (seen.has(dedupeKey)) continue;
      seen.add(dedupeKey);
      docs.push(doc);
      if (docs.length >= fetchLimit) break;
    }

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
  };
}
