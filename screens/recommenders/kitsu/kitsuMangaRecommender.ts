// /screens/recommenders/kitsu/kitsuMangaRecommender.ts
//
// Kitsu manga recommender (20Q-aligned).
// Teen-only auxiliary engine for manga / anime / graphic sessions.
// Thin fetcher only: literal signal gating, literal query translation,
// no popularity sorting, no inferred market/category shaping.

import type { RecommenderInput, RecommendationResult, RecommendationDoc } from "../types";
import type { TagCounts } from "../../swipe/openLibraryFromTags";

export const KITSU_API_BASE = String(
  process.env.EXPO_PUBLIC_KITSU_API_BASE_URL ||
  process.env.KITSU_API_BASE_URL ||
  "https://kitsu.app/api/edge"
).replace(/\/+$/, "");

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

function getDirectMangaSignalWeight(tagCounts: TagCounts | undefined): number {
  return (
    Number(tagCounts?.["topic:manga"] || 0) +
    Number(tagCounts?.["media:anime"] || 0) +
    Number(tagCounts?.["format:graphic_novel"] || 0) +
    Number(tagCounts?.["format:graphic novel"] || 0) +
    Number(tagCounts?.["format:manga"] || 0)
  );
}

function hasTeenMangaIntent(tagCounts: TagCounts | undefined): boolean {
  return getDirectMangaSignalWeight(tagCounts) > 0;
}

function isAdultKitsuOnlyRun(input: RecommenderInput): boolean {
  if (input.deckKey !== "adult") return false;
  const sourceEnabled = (input as any)?.sourceEnabled || {};
  const kitsuEnabled = sourceEnabled?.kitsu !== false;
  return kitsuEnabled &&
    sourceEnabled?.googleBooks === false &&
    sourceEnabled?.openLibrary === false &&
    sourceEnabled?.localLibrary === false &&
    sourceEnabled?.comicVine !== true &&
    sourceEnabled?.gcd !== true &&
    sourceEnabled?.nyt !== true;
}

function topPositiveTags(tagCounts: TagCounts | undefined, limit: number): string[] {
  return Object.entries(tagCounts || {})
    .filter(([, count]) => Number(count) > 0)
    .sort((a, b) => Number(b[1]) - Number(a[1]))
    .map(([tag]) => tag)
    .slice(0, limit);
}

function tagToKitsuQuery(tag: string): string | null {
  const normalized = normalizeText(tag);
  const bare = normalized.includes(":") ? normalized.split(":").slice(1).join(":").trim() : normalized;

  if (!bare) return null;

  // Direct media / format signals
  if (normalized === "topic:manga" || normalized === "format:manga") return "manga";
  if (normalized === "media:anime") return "anime";
  if (normalized === "format:graphic novel" || normalized === "format:graphic_novel") return "graphic novel";

  // Literal genre/topic translation only
  if (normalized.startsWith("genre:")) return bare;
  if (normalized.startsWith("topic:")) return bare;
  if (normalized.startsWith("theme:")) return bare;
  if (normalized.startsWith("setting:")) return bare;
  if (normalized.startsWith("archetype:")) return bare;
  if (normalized.startsWith("vibe:")) return bare;
  if (normalized.startsWith("mood:")) return bare;

  return null;
}

function buildKitsuQueries(tagCounts: TagCounts | undefined): string[] {
  const queries: string[] = [];
  const seen = new Set<string>();

  const add = (q: string | null | undefined) => {
    const v = normalizeText(q);
    if (!v || seen.has(v)) return;
    seen.add(v);
    queries.push(v);
  };

  const tags = Object.entries(tagCounts || {})
    .filter(([, count]) => Number(count) > 0)
    .map(([tag]) => normalizeText(tag));
  const has = (re: RegExp) => tags.some((tag) => re.test(tag));

  if (has(/horror|dark|haunted|terror|ghost|occult/)) add("horror anime");
  if (has(/dark|noir|grim|bleak/)) add("dark anime");
  if (has(/supernatural|paranormal|magic|myth|monster|vampire/)) add("supernatural anime");
  if (has(/dystopian|future|rebellion|authoritarian|apocalypse|post apocalyptic/)) add("dystopian anime");
  if (has(/action|battle|adventure|combat|war|survival/)) add("action anime");

  const topTags = topPositiveTags(tagCounts, 25);
  for (const tag of topTags) add(tagToKitsuQuery(tag));

  add("anime");
  add("popular anime");

  return queries.slice(0, 6);
}

async function fetchJsonWithTimeout(url: string, timeoutMs: number): Promise<{ json: any; status: number; bodyPrefix: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const resp = await fetch(url, {
      signal: controller.signal,
      headers: {
        Accept: "application/vnd.api+json",
      },
    });
    const text = await resp.text();
    const bodyPrefix = text.slice(0, 180);
    if (!resp.ok) {
      const err: any = new Error(`Kitsu error: ${resp.status}`);
      err.name = "KitsuHttpError";
      err.httpStatus = resp.status;
      err.bodyPrefix = bodyPrefix;
      throw err;
    }
    return { json: text ? JSON.parse(text) : {}, status: resp.status, bodyPrefix };
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
  const popularityRank = safeNumber(attrs?.popularityRank, 999999);

  return {
    key: `kitsu:${item.id}`,
    sourceId: `kitsu:${item.id}`,
    canonicalId: `kitsu:${item.id}`,
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
    subtitle: undefined,
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
    kitsuSubtype: subtype || undefined,
    kitsuRatingCount: ratingCount,
    kitsuPopularityRank: popularityRank,
  } as any;
}

function facetMatchesForDoc(doc: RecommendationDoc, tagCounts: TagCounts | undefined): number {
  const tags = Object.entries(tagCounts || {})
    .filter(([, count]) => Number(count) > 0)
    .map(([tag]) => normalizeText(tag));
  const text = normalizeText([doc?.title, doc?.description, ...(Array.isArray(doc?.subject) ? doc.subject : [])].join(" "));
  const cues: Array<{ re: RegExp; token: string }> = [
    { re: /horror|dark|haunted|terror|ghost|occult/, token: "dark" },
    { re: /mystery|crime|detective|noir|investigation/, token: "mystery" },
    { re: /supernatural|paranormal|magic|myth|monster|vampire/, token: "supernatural" },
    { re: /dystopian|future|rebellion|authoritarian|apocalypse/, token: "dystopian" },
    { re: /action|battle|adventure|combat|war|survival/, token: "action" },
  ];
  return cues.reduce((acc, cue) => (tags.some((t) => cue.re.test(t)) && text.includes(cue.token) ? acc + 1 : acc), 0);
}

function shouldKeepKitsuDoc(doc: RecommendationDoc, tagCounts: TagCounts | undefined): boolean {
  const subtype = normalizeText((doc as any)?.kitsuSubtype);
  const tags = Object.entries(tagCounts || {}).map(([k]) => normalizeText(k));
  const explicitlyWantsNovel = tags.some((t) => /\bnovel|light novel\b/.test(t));
  if (subtype === "novel" && !explicitlyWantsNovel) return false;
  return true;
}

export async function getKitsuMangaRecommendations(input: RecommenderInput): Promise<RecommendationResult> {
  const deckKey = input.deckKey;
  const domainMode: RecommendationResult["domainMode"] = "default";
  const finalLimit = Math.max(1, Math.min(40, input.limit ?? 12));
  const fetchLimit = Math.max(10, Math.min(20, Math.max(finalLimit * 2, 12)));
  const timeoutMs = Math.max(2500, Math.min(15000, input.timeoutMs ?? 10000));

  const forceKitsuRecoveryFetch = Boolean((input as any)?.forceKitsuRecoveryFetch);
  const allowNormalTeenKitsuFetch = deckKey === "ms_hs" && hasTeenMangaIntent(input.tagCounts);
  const allowNormalAdultKitsuFetch = isAdultKitsuOnlyRun(input);
  if (!forceKitsuRecoveryFetch && !allowNormalTeenKitsuFetch && !allowNormalAdultKitsuFetch) {
    return {
      engineId: "kitsu",
      engineLabel: "Kitsu Manga",
      deckKey,
      domainMode,
      builtFromQuery: "",
      items: [],
    };
  }

  const forcedBucketQueries = Array.isArray((input as any)?.bucketPlan?.queries)
    ? (input as any).bucketPlan.queries.map((q: any) => normalizeText(String(q || ""))).filter(Boolean)
    : [];
  const queriesToTry = forcedBucketQueries.length > 0 ? forcedBucketQueries : buildKitsuQueries(input.tagCounts);
  if (!queriesToTry.length) {
    return {
      engineId: "kitsu",
      engineLabel: "Kitsu Manga",
      deckKey,
      domainMode,
      builtFromQuery: "",
      items: [],
    };
  }

  const docs: RecommendationDoc[] = [];
  const seen = new Set<string>();
  let builtFromQuery = queriesToTry[0] || "";

  let lastFetchUrl = "";
  let lastFetchStatus = "not_attempted";
  let lastFetchHttpStatus = 0;
  let lastFetchError = "";
  let lastFetchErrorName = "";
  let lastFetchErrorMessage = "";
  let lastFetchBodyPrefix = "";
  for (let i = 0; i < queriesToTry.length; i += 1) {
    const q = queriesToTry[i];
    const url =
      `${KITSU_API_BASE}/manga` +
      `?filter[text]=${encodeURIComponent(q)}` +
      `&page[limit]=${encodeURIComponent(String(fetchLimit))}`;

    lastFetchUrl = url;
    let data: any;
    try {
      const fetched = await fetchJsonWithTimeout(url, timeoutMs);
      data = fetched.json;
      lastFetchStatus = "ok";
      lastFetchHttpStatus = fetched.status;
      lastFetchError = "";
      lastFetchErrorName = "";
      lastFetchErrorMessage = "";
      lastFetchBodyPrefix = fetched.bodyPrefix || "status=ok";
    } catch (e: any) {
      lastFetchStatus = "error";
      lastFetchHttpStatus = Number(e?.httpStatus || 0);
      lastFetchErrorName = String(e?.name || "Error");
      lastFetchErrorMessage = String(e?.message || e || "fetch_failed_or_timeout");
      lastFetchError = lastFetchErrorMessage || "fetch_failed_or_timeout";
      lastFetchBodyPrefix = String(e?.bodyPrefix || lastFetchErrorMessage || "").slice(0, 180);
      continue;
    }

    const items = Array.isArray(data?.data) ? data.data : [];
    if (!items.length) {
      lastFetchBodyPrefix = "[empty_kitsu_result]";
      continue;
    }
    lastFetchBodyPrefix = `items=${items.length}`;
    if (!docs.length) builtFromQuery = q;

    for (const item of items) {
      const doc = kitsuMangaToDoc(item, q, i);
      if (!doc?.title) continue;
      if (!shouldKeepKitsuDoc(doc, input.tagCounts)) continue;
      (doc as any).kitsuFacetMatches = facetMatchesForDoc(doc, input.tagCounts);
      const dedupeKey = String(doc.key || `${doc.title}|${doc.author_name?.[0] || ""}`).toLowerCase();
      if (seen.has(dedupeKey)) continue;
      seen.add(dedupeKey);
      docs.push(doc);
      if (docs.length >= fetchLimit) break;
    }

    if (docs.length >= fetchLimit) break;
    if (i === 0 && docs.length >= Math.max(6, finalLimit)) break;
  }

  docs.sort((a: any, b: any) => {
    const facetDelta = Number(b?.kitsuFacetMatches || 0) - Number(a?.kitsuFacetMatches || 0);
    if (facetDelta !== 0) return facetDelta;
    const ratingCountDelta = Number(b?.kitsuRatingCount || 0) - Number(a?.kitsuRatingCount || 0);
    if (ratingCountDelta !== 0) return ratingCountDelta;
    return Number(a?.kitsuPopularityRank || 999999) - Number(b?.kitsuPopularityRank || 999999);
  });

  return {
    engineId: "kitsu",
    engineLabel: "Kitsu Manga",
    deckKey,
    domainMode,
    builtFromQuery,
    items: docs.slice(0, fetchLimit).map((doc) => ({ kind: "open_library", doc })),
    debugSourceStatus: lastFetchStatus,
    debugResponseSnippet: lastFetchBodyPrefix,
    debugRawJsonSnippet: lastFetchBodyPrefix,
    debugFetchUrl: lastFetchUrl,
    debugFetchHttpStatus: lastFetchHttpStatus,
    debugFetchError: lastFetchError,
    debugFetchErrorName: lastFetchErrorName,
    debugFetchErrorMessage: lastFetchErrorMessage,
    debugFetchResponsePrefix: lastFetchBodyPrefix,
    debugParsedDataLength: docs.length,
    debugRawFetchedCount: docs.length,
    debugKitsuAdultOnlyMode: allowNormalAdultKitsuFetch,
    debugKitsuEligibilityMode: forceKitsuRecoveryFetch ? "forced_recovery" : allowNormalAdultKitsuFetch ? "adult_kitsu_only" : allowNormalTeenKitsuFetch ? "teen_manga_intent" : "not_eligible",
    debugRawPool: docs.slice(0, fetchLimit).map((doc: any) => ({ source: "kitsu", queryText: String(doc?.queryText || builtFromQuery || ""), title: String(doc?.title || "") })),
  };
}
