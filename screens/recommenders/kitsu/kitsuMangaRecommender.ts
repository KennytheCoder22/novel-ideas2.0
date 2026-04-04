// /screens/recommenders/kitsu/kitsuMangaRecommender.ts
//
// Kitsu manga recommender.
// Teen-only auxiliary engine for manga / anime / graphic sessions.
// Thin fetcher only: build lightweight search queries, fetch raw docs, and
// project them into the shared RecommendationDoc shape.

import type { RecommenderInput, RecommendationResult, RecommendationDoc, DeckKey } from "../types";
import type { TagCounts } from "../../swipe/openLibraryFromTags";

const KITSU_BASE = "https://kitsu.io/api/edge";

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

function hasTeenMangaIntent(tagCounts: TagCounts | undefined): boolean {
  const mangaWeight =
    Number(tagCounts?.["topic:manga"] || 0) +
    Number(tagCounts?.["media:anime"] || 0) +
    Number(tagCounts?.["format:graphic_novel"] || 0) +
    Number(tagCounts?.["format:graphic novel"] || 0);

  return mangaWeight >= 1;
}

function topPositiveValues(tagCounts: TagCounts | undefined, prefixes: string[], limit: number): string[] {
  return Object.entries(tagCounts || {})
    .filter(([tag, count]) => Number(count) > 0 && prefixes.some((prefix) => tag.startsWith(prefix)))
    .sort((a, b) => Number(b[1]) - Number(a[1]))
    .map(([tag]) => tag.split(":").slice(1).join(":").replace(/_/g, " ").trim())
    .filter(Boolean)
    .slice(0, limit);
}

function buildKitsuQueries(tagCounts: TagCounts | undefined): string[] {
  const queries: string[] = [];
  const seen = new Set<string>();

  const add = (q: string) => {
    const v = normalizeText(q);
    if (!v || seen.has(v)) return;
    seen.add(v);
    queries.push(v);
  };

  const has = (k: string) => Number(tagCounts?.[k] || 0) > 0;

  // Always include base
  add("manga");

  if (has("genre:action")) add("action");
  if (has("genre:fantasy")) add("fantasy");
  if (has("genre:adventure")) add("adventure");
  if (has("genre:science_fiction")) add("science fiction");
  if (has("genre:superheroes")) add("superhero");
  if (has("genre:sports")) add("sports");
  if (has("genre:mystery")) add("mystery");
  if (has("genre:horror")) add("horror");
  if (has("archetype:training") || has("archetype:found_family")) add("shonen");

  return queries.slice(0, 6);
}

async function fetchJsonWithTimeout(url: string, timeoutMs: number): Promise<any> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const resp = await fetch(url, {
      signal: controller.signal,
      headers: {
        Accept: "application/vnd.api+json",
      },
    });
    if (!resp.ok) throw new Error(`Kitsu error: ${resp.status}`);
    return await resp.json();
  } finally {
    clearTimeout(timer);
  }
}

function parseStartYear(value: any): number | undefined {
  const raw = String(value || "");
  const match = raw.match(/(18|19|20)\d{2}/);
  return match ? Number(match[0]) : undefined;
}

function toTitleCase(value: string): string {
  return value
    .split(/\s+/)
    .map((word) => (word ? word[0].toUpperCase() + word.slice(1) : word))
    .join(" ");
}

function kitsuMangaToDoc(item: any, queryText: string, queryRung: number): RecommendationDoc | null {
  const attrs = item?.attributes || {};
  const canonicalTitle =
    attrs?.canonicalTitle || attrs?.titles?.en || attrs?.titles?.en_jp || attrs?.titles?.en_us || attrs?.slug;

  const title = String(canonicalTitle || "").trim();
  if (!title) return null;

  const subtype = normalizeText(attrs?.subtype);
  const ageRatingGuide = String(attrs?.ageRatingGuide || "").trim();
  const categories = Array.isArray(attrs?.categories) ? attrs.categories : [];
  const tagSubjects = [
    "manga",
    subtype ? `manga:${subtype}` : "",
    ageRatingGuide ? `audience:${ageRatingGuide}` : "",
    ...categories
      .map((c: any) => c?.title || c?.name || c)
      .map((c: any) => String(c || "").trim())
      .filter(Boolean),
  ].filter(Boolean);

  const averageRating = Math.max(0, Math.min(5, safeNumber(attrs?.averageRating, 0) / 20));
  const ratingCount = safeNumber(attrs?.userCount, 0);

  return {
    key: `kitsu:${item.id}`,
    title,
    author_name: attrs?.mangaType ? [toTitleCase(String(attrs.mangaType))] : ["Kitsu Manga"],
    first_publish_year: parseStartYear(attrs?.startDate),
    cover_i: attrs?.posterImage?.small || attrs?.posterImage?.tiny || attrs?.posterImage?.medium,
    subject: tagSubjects,
    edition_count: safeNumber(attrs?.chapterCount, 0),
    publisher: attrs?.serialization || attrs?.publisher || "Kitsu",
    language: attrs?.slug ? ["jpn"] : undefined,
    source: "kitsu",
    queryRung,
    queryText,
    subtitle: typeof attrs?.synopsis === "string" ? undefined : undefined,
    description: typeof attrs?.synopsis === "string" ? attrs.synopsis : undefined,
    averageRating,
    ratingsCount: ratingCount,
    pageCount: safeNumber(attrs?.volumeCount, 0) > 0 ? safeNumber(attrs?.volumeCount, 0) * 180 : undefined,
    volumeInfo: {
      categories: tagSubjects,
      imageLinks: {
        thumbnail: attrs?.posterImage?.small || attrs?.posterImage?.tiny || attrs?.posterImage?.medium,
      },
    },
  } as any;
}

export async function getKitsuMangaRecommendations(input: RecommenderInput): Promise<RecommendationResult> {
  const deckKey = input.deckKey;
  const domainMode = deckKeyToDomainMode(deckKey);
  const finalLimit = Math.max(1, Math.min(40, input.limit ?? 12));
  const fetchLimit = Math.max(10, Math.min(20, Math.max(finalLimit * 2, 12)));
  const timeoutMs = Math.max(2500, Math.min(15000, input.timeoutMs ?? 10000));

  if (deckKey !== "ms_hs" || !hasTeenMangaIntent(input.tagCounts)) {
    return {
      engineId: "kitsu",
      engineLabel: "Kitsu Manga",
      deckKey,
      domainMode,
      builtFromQuery: "",
      items: [],
    };
  }

  const queriesToTry = buildKitsuQueries(input.tagCounts);
  const docs: RecommendationDoc[] = [];
  const seen = new Set<string>();
  let builtFromQuery = queriesToTry[0] || "manga";

  for (let i = 0; i < queriesToTry.length; i += 1) {
    const q = queriesToTry[i];
    const url =
      `${KITSU_BASE}/manga` +
      `?filter[text]=${encodeURIComponent(q)}` +
      `&page[limit]=${encodeURIComponent(String(fetchLimit))}` +
      `&sort=-userCount`;

    let data: any;
    try {
      data = await fetchJsonWithTimeout(url, timeoutMs);
    } catch {
      continue;
    }

    const items = Array.isArray(data?.data) ? data.data : [];
    if (!items.length) continue;
    if (!docs.length) builtFromQuery = q;

    for (const item of items) {
      const doc = kitsuMangaToDoc(item, q, i);
      if (!doc?.title) continue;
      const dedupeKey = String(doc.key || `${doc.title}|${doc.author_name?.[0] || ""}`).toLowerCase();
      if (seen.has(dedupeKey)) continue;
      seen.add(dedupeKey);
      docs.push(doc);
      if (docs.length >= fetchLimit) break;
    }

    if (docs.length >= fetchLimit) break;
    if (i === 0 && docs.length >= Math.max(6, finalLimit)) break;
  }

  return {
    engineId: "kitsu",
    engineLabel: "Kitsu Manga",
    deckKey,
    domainMode,
    builtFromQuery,
    items: docs.slice(0, fetchLimit).map((doc) => ({ kind: "open_library", doc })),
  };
}
