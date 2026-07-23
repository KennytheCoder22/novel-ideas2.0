import type { SourceAdapterV2, SourceDiagnosticV2, SourceFetchDiagnosticV2, SourcePlan, SourceResult } from "../types";

const KITSU_API_BASE = String(process.env.EXPO_PUBLIC_KITSU_API_BASE_URL || process.env.KITSU_API_BASE_URL || "https://kitsu.app/api/edge").replace(/\/+$/, "");
const KITSU_ADAPTER_VERSION = "v1";
const KITSU_PAGE_LIMIT = 20;

type KitsuItem = {
  id?: string;
  attributes?: Record<string, unknown>;
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

function toRawRow(item: KitsuItem, query: string, queryFamily: string, queryCascadeIndex: number, facets: string[]): Record<string, unknown> | null {
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

  const genres = uniqueStrings([
    ...facets,
    ...queryTokens,
    mangaSubtype,
  ], 12);
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
    raw: item,
  };
}

function skippedResult(plan: SourcePlan): SourceResult {
  const diagnostics: SourceDiagnosticV2 = {
    source: "kitsu",
    status: "skipped",
    planned: plan.enabled,
    attempted: false,
    timedOut: false,
    rawCount: 0,
    queries: [],
    skippedReason: "source_disabled",
  };
  return { source: "kitsu", status: "skipped", rawItems: [], diagnostics };
}

export const kitsuSourceAdapter: SourceAdapterV2 = {
  source: "kitsu",
  async search(plan, context) {
    if (!plan.enabled) return skippedResult(plan);

    const startedAt = nowIso();
    const fetches: SourceFetchDiagnosticV2[] = [];
    const rawItems: Record<string, unknown>[] = [];
    const dedupe = new Set<string>();
    let timedOut = false;
    let failedReason = "";

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

        for (const row of rows) {
          const normalized = toRawRow(
            row,
            query,
            String(intent.id || "").trim() || "generic",
            index,
            intent.facets || [],
          );
          if (!normalized) continue;
          const key = `${normalized.sourceId || normalized.id || normalized.title}`;
          if (dedupe.has(String(key).toLowerCase())) continue;
          dedupe.add(String(key).toLowerCase());
          rawItems.push(normalized);
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

    return {
      source: "kitsu",
      status,
      rawItems,
      diagnostics,
    };
  },
};
