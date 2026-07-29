import type { SourceAdapterV2, SourceDiagnosticV2, SourceFetchDiagnosticV2, SourcePlan, SourceResult, TasteProfile } from "../types";

const KITSU_API_BASE = String(process.env.EXPO_PUBLIC_KITSU_API_BASE_URL || process.env.KITSU_API_BASE_URL || "https://kitsu.app/api/edge").replace(/\/+$/, "");
const KITSU_ADAPTER_VERSION = "v2";
const KITSU_PAGE_LIMIT = 20;
const KITSU_CATEGORIES_LIMIT = 10;

type KitsuItem = {
  id?: string;
  attributes?: Record<string, unknown>;
};

type PendingKitsuItem = {
  item: KitsuItem;
  query: string;
  queryFamily: string;
  queryCascadeIndex: number;
  facets: string[];
};

function nowIso(): string {
  return new Date().toISOString();
}

function uniqueStrings(values: unknown[], limit = 50): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    const cleaned = String(value || "").trim();
    if (!cleaned) continue;
    const key = cleaned.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(cleaned);
    if (out.length >= limit) break;
  }
  return out;
}

function normalizeText(value: unknown): string {
  return String(value || "").toLowerCase().replace(/[^a-z0-9\s-]/g, " ").replace(/\s+/g, " ").trim();
}

function parseYear(value: unknown): number | undefined {
  const match = String(value || "").match(/\b(19|20)\d{2}\b/);
  if (!match) return undefined;
  const year = Number(match[0]);
  return Number.isFinite(year) ? year : undefined;
}

function kitsuSubtypeToFormat(subtype: string): "manga" | "book" | "unknown" {
  if (!subtype) return "manga";
  if (subtype.includes("manga") || subtype.includes("manhwa") || subtype.includes("manhua")) return "manga";
  if (subtype.includes("novel")) return "book";
  return "unknown";
}

function sourceUrlForItem(slug: string, id: string): string | undefined {
  const resolved = slug || id;
  return resolved ? `https://kitsu.app/manga/${encodeURIComponent(resolved)}` : undefined;
}

async function fetchKitsuCategories(id: string, signal?: AbortSignal): Promise<string[]> {
  if (!id) return [];
  const url = `${KITSU_API_BASE}/manga/${encodeURIComponent(id)}/categories?page[limit]=${KITSU_CATEGORIES_LIMIT}`;
  try {
    const res = await fetch(url, {
      method: "GET",
      signal,
      headers: { Accept: "application/vnd.api+json, application/json" },
    });
    if (!res.ok) return [];
    const body = await res.text();
    const payload = body ? JSON.parse(body) : {};
    const items = Array.isArray(payload?.data) ? payload.data as Array<{ attributes?: Record<string, unknown> }> : [];
    return uniqueStrings(
      items.map((item) => String(item?.attributes?.title || "").trim().toLowerCase()),
      KITSU_CATEGORIES_LIMIT,
    );
  } catch {
    return [];
  }
}

function toRawRow(
  item: KitsuItem,
  query: string,
  queryFamily: string,
  queryCascadeIndex: number,
  facets: string[],
  categoryNames: string[] | null,
): Record<string, unknown> | null {
  const attrs = (item.attributes || {}) as Record<string, unknown>;
  const canonicalTitle = String(attrs.canonicalTitle || "").trim();
  const title = canonicalTitle || String(attrs.titles && typeof attrs.titles === "object" ? (attrs.titles as Record<string, unknown>).en || (attrs.titles as Record<string, unknown>).en_jp || (attrs.titles as Record<string, unknown>).ja_jp || "" : "").trim();
  if (!title) return null;

  const subtype = normalizeText(attrs.subtype);
  const mangaSubtype = String(attrs.mangaType || attrs.subtype || "").trim();
  const ageRating = String(attrs.ageRating || "").trim();
  const ageRatingGuide = String(attrs.ageRatingGuide || "").trim();
  const synopsis = String(attrs.synopsis || "").trim();
  const startDate = String(attrs.startDate || "").trim();
  const slug = String(attrs.slug || "").trim();
  const itemId = String(item.id || "").trim() || title;
  const queryTokens = uniqueStrings(normalizeText(query).split(" ").filter(Boolean), 8);

  // Use real category tags from the Kitsu categories API when available;
  // fall back to deduplicated query tokens only when the categories fetch failed or returned nothing.
  const hasApiCategories = Array.isArray(categoryNames) && categoryNames.length > 0;
  const genres = hasApiCategories
    ? uniqueStrings([...facets, ...categoryNames], 12)
    : uniqueStrings([...facets, ...queryTokens, mangaSubtype], 12);
  const genreSource: "categories_api" | "query_fallback" = hasApiCategories ? "categories_api" : "query_fallback";
  const tones = uniqueStrings([String(attrs.serialization || "").trim()], 4);
  const themes = uniqueStrings([ageRatingGuide, ageRating, mangaSubtype], 6);

  return {
    id: `kitsu:${itemId}`,
    sourceId: `kitsu:${itemId}`,
    title,
    subtitle: String(attrs.abbreviatedTitles && Array.isArray(attrs.abbreviatedTitles) ? attrs.abbreviatedTitles[0] || "" : "").trim() || undefined,
    creators: uniqueStrings(["Kitsu"], 2),
    description: synopsis || undefined,
    formats: [kitsuSubtypeToFormat(subtype)],
    genres,
    themes,
    tones,
    characterDynamics: [],
    maturityBand: ageRating.toUpperCase() === "R" ? "adult" : undefined,
    publicationYear: parseYear(startDate),
    sourceUrl: sourceUrlForItem(slug, itemId),
    queryText: query,
    queryFamily,
    queryCascadeIndex,
    facets,
    routingReason: "kitsu_v2_intent_adapter",
    adapterVersion: KITSU_ADAPTER_VERSION,
    // Kitsu-specific diagnostic fields (GAP-K2, GAP-K6)
    kitsuSubtype: mangaSubtype || subtype,
    kitsuAgeRating: ageRating || null,
    kitsuMaturityFlagged: !ageRating || ageRating.toUpperCase() === "G",
    genreSource,
    raw: item,
  };
}

const KITSU_MANGA_FORMAT_VALUES = new Set(["manga", "anime"]);

function hasMangaFormatPreference(profile: TasteProfile): boolean {
  return profile.formatPreference.some(
    (fp) => KITSU_MANGA_FORMAT_VALUES.has(String(fp.value || "").toLowerCase()) && fp.weight > 0,
  );
}

function skippedResult(plan: SourcePlan, reason: string = "source_disabled"): SourceResult {
  const diagnostics: SourceDiagnosticV2 = {
    source: "kitsu",
    status: "skipped",
    planned: plan.enabled,
    attempted: false,
    timedOut: false,
    rawCount: 0,
    queries: [],
    skippedReason: reason,
  };
  return { source: "kitsu", status: "skipped", rawItems: [], diagnostics };
}

export const kitsuSourceAdapter: SourceAdapterV2 = {
  source: "kitsu",
  async search(plan, context) {
    if (!plan.enabled) return skippedResult(plan, "source_disabled");
    if (!hasMangaFormatPreference(context.profile)) {
      return skippedResult(plan, "kitsu_no_manga_format_preference");
    }

    const startedAt = nowIso();
    const fetches: SourceFetchDiagnosticV2[] = [];
    const rawItems: Record<string, unknown>[] = [];
    const dedupe = new Set<string>();
    const pendingItems: PendingKitsuItem[] = [];
    let timedOut = false;
    let failedReason = "";

    // Phase 1: fetch primary search results for each intent
    for (let index = 0; index < plan.intents.length; index += 1) {
      const intent = plan.intents[index];
      if (!intent) continue;
      const query = String(intent.query || "").trim();
      if (!query) continue;
      const queryStartedAt = nowIso();
      const endpoint = `${KITSU_API_BASE}/manga?filter[text]=${encodeURIComponent(query)}&page[limit]=${KITSU_PAGE_LIMIT}`;
      const fetchDiag: SourceFetchDiagnosticV2 = {
        query,
        queryFamily: String(intent.id || "").trim() || "generic",
        queryCascadeIndex: index,
        facets: intent.facets || [],
        timedOut: false,
        fetchStartedAt: queryStartedAt,
        requestUrl: endpoint,
      };
      try {
        const response = await fetch(endpoint, {
          method: "GET",
          signal: context.signal,
          headers: {
            Accept: "application/vnd.api+json, application/json",
          },
        });
        fetchDiag.httpStatus = response.status;
        const body = await response.text();
        fetchDiag.responseBodyPrefix = body.slice(0, 240);
        if (!response.ok) {
          fetchDiag.status = "failed";
          fetchDiag.failedReason = `http_${response.status}`;
          failedReason = failedReason || fetchDiag.failedReason;
          fetchDiag.fetchFinishedAt = nowIso();
          fetches.push(fetchDiag);
          continue;
        }

        const payload = body ? JSON.parse(body) : {};
        const rows = Array.isArray(payload?.data) ? payload.data as KitsuItem[] : [];
        fetchDiag.rawApiCount = rows.length;
        fetchDiag.docsReturned = rows.length;
        fetchDiag.rawRetrieved = rows.length;
        fetchDiag.firstReturnedTitles = uniqueStrings(
          rows.map((row) => String(((row.attributes || {}) as Record<string, unknown>).canonicalTitle || "").trim()).filter(Boolean),
          8,
        );
        fetchDiag.status = rows.length > 0 ? "succeeded" : "empty";

        // Collect deduped pending items; categories will be fetched concurrently below
        for (const row of rows) {
          const itemId = String(row.id || "").trim() || String(((row.attributes || {}) as Record<string, unknown>).canonicalTitle || "").trim();
          const key = `kitsu:${itemId}`.toLowerCase();
          if (!itemId || dedupe.has(key)) continue;
          dedupe.add(key);
          pendingItems.push({
            item: row,
            query,
            queryFamily: String(intent.id || "").trim() || "generic",
            queryCascadeIndex: index,
            facets: intent.facets || [],
          });
        }
      } catch (error) {
        const message = String((error as { message?: string })?.message || error || "");
        fetchDiag.failedReason = message.includes("aborted") ? "aborted" : "fetch_error";
        fetchDiag.status = message.includes("aborted") ? "aborted" : "failed";
        fetchDiag.aborted = message.includes("aborted");
        if (message.includes("aborted")) timedOut = true;
        failedReason = failedReason || fetchDiag.failedReason || "fetch_error";
      } finally {
        fetchDiag.fetchFinishedAt = nowIso();
        fetches.push(fetchDiag);
      }
    }

    // Phase 2: concurrently fetch categories for all collected items (GAP-K2)
    const categoryResults = pendingItems.length > 0
      ? await Promise.allSettled(
          pendingItems.map((pending) => fetchKitsuCategories(String(pending.item.id || ""), context.signal)),
        )
      : [];

    // Phase 3: build raw rows with category data (or fall back per-item)
    for (let i = 0; i < pendingItems.length; i++) {
      const pending = pendingItems[i];
      const catResult = categoryResults[i];
      const categoryNames = catResult?.status === "fulfilled" ? catResult.value : null;
      const normalized = toRawRow(
        pending.item,
        pending.query,
        pending.queryFamily,
        pending.queryCascadeIndex,
        pending.facets,
        categoryNames,
      );
      if (normalized) rawItems.push(normalized);
    }

    const categoriesApiSuccessCount = categoryResults.filter((r) => r.status === "fulfilled" && r.value.length > 0).length;
    const categoriesApiFallbackCount = pendingItems.length - categoriesApiSuccessCount;

    const finishedAt = nowIso();
    const status = rawItems.length > 0
      ? "succeeded"
      : timedOut
        ? "timed_out"
        : failedReason
          ? "failed"
          : "empty";

    const diagnostics: SourceDiagnosticV2 = {
      source: "kitsu",
      status,
      planned: true,
      attempted: true,
      timedOut,
      startedAt,
      finishedAt,
      elapsedMs: Date.parse(finishedAt) - Date.parse(startedAt),
      rawCount: rawItems.length,
      rawApiResultCount: fetches.reduce((sum, fetchDiag) => sum + Number(fetchDiag.rawApiCount || 0), 0),
      queries: fetches.map((fetchDiag) => fetchDiag.query),
      rawTitles: uniqueStrings(rawItems.map((row) => row.title), 30),
      firstReturnedTitles: uniqueStrings(fetches.flatMap((fetchDiag) => fetchDiag.firstReturnedTitles || []), 20),
      failedReason: status === "failed" || status === "timed_out" ? failedReason || undefined : undefined,
      emptyReason: status === "empty" ? "kitsu_returned_no_rows" : undefined,
      fetches,
      droppedBeforeDocCount: 0,
      dropReasons: {},
    };

    // Add Kitsu-specific observability fields that extend the base diagnostic type
    const extendedDiagnostics = diagnostics as SourceDiagnosticV2 & Record<string, unknown>;
    extendedDiagnostics.kitsuCategoriesApiSuccessCount = categoriesApiSuccessCount;
    extendedDiagnostics.kitsuCategoriesApiFallbackCount = categoriesApiFallbackCount;

    return {
      source: "kitsu",
      status,
      rawItems,
      diagnostics: extendedDiagnostics,
    };
  },
};
