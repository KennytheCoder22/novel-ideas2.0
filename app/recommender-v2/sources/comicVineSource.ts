import type { SourceAdapterV2, SourceDiagnosticV2, SourceFetchDiagnosticV2, SourcePlan, SourceResult } from "../types";

const COMICVINE_DIRECT_API = "https://comicvine.gamespot.com/api/search/";
const COMICVINE_ADAPTER_VERSION = "v2";
const COMICVINE_LIMIT = 20;
const COMICVINE_DEFAULT_PROXY_PATH = "/api/comicvine";

type ComicVineResultItem = {
  id?: number | string;
  resource_type?: string;
  aliases?: string;
  publisher?: { name?: string };
  name?: string;
  volume?: { name?: string; id?: number | string };
  issue_number?: string;
  deck?: string;
  description?: string;
  cover_date?: string;
  site_detail_url?: string;
  person_credits?: Array<{ name?: string }>;
};

type ComicVineRequestPlan = {
  path: "proxy" | "direct";
  configuredProxyUrl: string;
  normalizedProxyUrl: string;
  finalRequestUrl: string;
  unavailableReason?: string;
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

function parseYear(value: unknown): number | undefined {
  const match = String(value || "").match(/\b(19|20)\d{2}\b/);
  if (!match) return undefined;
  const year = Number(match[0]);
  return Number.isFinite(year) ? year : undefined;
}

function fallbackCreators(item: ComicVineResultItem): string[] {
  const people = Array.isArray(item.person_credits) ? item.person_credits : [];
  return uniqueStrings(people.map((person) => person?.name || "").filter(Boolean), 5);
}

function normalizeQueryTokens(query: string): string[] {
  return uniqueStrings(
    String(query || "")
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, " ")
      .split(/\s+/)
      .filter(Boolean),
    8,
  );
}

function rowTitle(item: ComicVineResultItem): string {
  const directName = String(item.name || "").trim();
  if (directName) return directName;
  const volumeName = String(item.volume?.name || "").trim();
  const issue = String(item.issue_number || "").trim();
  if (!volumeName) return "";
  return issue ? `${volumeName} #${issue}` : volumeName;
}

function toRawRow(item: ComicVineResultItem, query: string, queryFamily: string, queryCascadeIndex: number, facets: string[]): Record<string, unknown> | null {
  const title = rowTitle(item);
  if (!title) return null;
  const volumeName = String(item.volume?.name || "").trim();
  const issueNumber = String(item.issue_number || "").trim();
  const itemId = String(item.id || `${volumeName || title}-${issueNumber || "issue"}`).trim();
  const queryTokens = normalizeQueryTokens(query);
  const description = String(item.deck || item.description || "").trim();
  const creators = fallbackCreators(item);
  const genres = uniqueStrings([
    ...facets,
    ...queryTokens,
    "graphic novels",
    "comics",
  ], 14);
  const themes = uniqueStrings([volumeName, issueNumber ? `issue ${issueNumber}` : ""], 6);

  return {
    id: `comicVine:${itemId}`,
    sourceId: `comicVine:${itemId}`,
    title,
    subtitle: volumeName && volumeName.toLowerCase() !== title.toLowerCase() ? volumeName : undefined,
    creators,
    description: description || undefined,
    formats: ["comic"],
    genres,
    themes,
    tones: [],
    characterDynamics: [],
    publicationYear: parseYear(item.cover_date),
    sourceUrl: String(item.site_detail_url || "").trim() || undefined,
    queryText: query,
    queryFamily,
    queryCascadeIndex,
    facets,
    routingReason: "comicvine_v2_intent_adapter",
    adapterVersion: COMICVINE_ADAPTER_VERSION,
    raw: item,
  };
}

function normalizedProxyUrl(value: string): string {
  const trimmed = String(value || "").trim();
  if (!trimmed || trimmed === "undefined" || trimmed === "null") return "";
  return trimmed;
}

function absoluteUrlForProxy(baseProxyUrl: string): string {
  if (/^https?:\/\//i.test(baseProxyUrl)) return baseProxyUrl;
  if (baseProxyUrl.startsWith("/")) {
    if (typeof window !== "undefined" && String(window.location?.origin || "").trim()) {
      return new URL(baseProxyUrl, window.location.origin).toString();
    }
    const fallbackOrigin = String(process.env.EXPO_PUBLIC_SITE_ORIGIN || process.env.SITE_ORIGIN || process.env.VERCEL_URL || "").trim();
    if (fallbackOrigin) {
      const normalizedOrigin = /^https?:\/\//i.test(fallbackOrigin) ? fallbackOrigin : `https://${fallbackOrigin}`;
      return new URL(baseProxyUrl, normalizedOrigin).toString();
    }
    return `http://localhost${baseProxyUrl}`;
  }
  if (/^[a-z0-9.-]+\.[a-z]{2,}/i.test(baseProxyUrl)) return `https://${baseProxyUrl}`;
  return baseProxyUrl;
}

function buildProxyRequestUrl(baseProxyUrl: string, query: string, limit: number): string {
  const asUrl = new URL(absoluteUrlForProxy(baseProxyUrl));
  asUrl.searchParams.set("q", query);
  asUrl.searchParams.set("limit", String(limit));
  return asUrl.toString();
}

function responseRows(payload: any): { rows: ComicVineResultItem[]; shape: SourceFetchDiagnosticV2["proxyResponseShape"] } {
  if (Array.isArray(payload?.results)) return { rows: payload.results as ComicVineResultItem[], shape: "results_array" };
  if (Array.isArray(payload?.data)) return { rows: payload.data as ComicVineResultItem[], shape: "data_array" };
  if (Array.isArray(payload?.data?.results)) return { rows: payload.data.results as ComicVineResultItem[], shape: "nested_data_results_array" };
  if (Array.isArray(payload?.issues)) return { rows: payload.issues as ComicVineResultItem[], shape: "issues_array" };
  if (Array.isArray(payload?.resources)) return { rows: payload.resources as ComicVineResultItem[], shape: "resources_array" };
  return { rows: [], shape: "unknown" };
}

function normalizedErrorMessage(error: unknown): string {
  const errorObj = error as { message?: string };
  return String(errorObj?.message || error || "");
}

function abortReasonFromSignal(signal?: AbortSignal): string {
  const reason = String((signal as any)?.reason || "").trim();
  return reason || "abort_without_reason";
}

function sourceEmptyReason(input: {
  planEnabled: boolean;
  queryAttemptCount: number;
  requestDispatchedCount: number;
  requestAbortedCount: number;
  requestTimedOutCount: number;
  upstreamErrorCount: number;
  rawApiResultCount: number;
  convertedCount: number;
  normalizedCount: number;
  duplicateCount: number;
}): string | undefined {
  if (!input.planEnabled) return "source_disabled";
  if (input.queryAttemptCount <= 0) return "no_comicvine_query_planned";
  if (input.requestDispatchedCount <= 0) return "request_never_dispatched";
  if (input.requestTimedOutCount > 0) return "request_timed_out";
  if (input.requestAbortedCount > 0) return "request_aborted";
  if (input.upstreamErrorCount > 0) return "upstream_error";
  if (input.rawApiResultCount <= 0) return "valid_empty_response";
  if (input.convertedCount <= 0) return "conversion_removed_all_rows";
  if (input.normalizedCount <= 0) return "normalization_removed_all_rows";
  if (input.duplicateCount > 0 && input.normalizedCount <= 0) return "duplicate_rows_removed_all";
  return "later_pipeline_stage_removed_all_candidates";
}

function buildRequestPlan(query: string): ComicVineRequestPlan {
  const configuredPublicProxyUrl = String(process.env.EXPO_PUBLIC_COMICVINE_PROXY_URL || "").trim();
  const configuredServerProxyUrl = String(process.env.COMICVINE_PROXY_URL || "").trim();
  const apiKey = String(process.env.COMICVINE_API_KEY || process.env.EXPO_PUBLIC_COMICVINE_API_KEY || "").trim();

  const normalizedPublicProxyUrl = normalizedProxyUrl(configuredPublicProxyUrl);
  const normalizedServerProxyUrl = normalizedProxyUrl(configuredServerProxyUrl);
  const normalizedProxy = normalizedPublicProxyUrl || normalizedServerProxyUrl || COMICVINE_DEFAULT_PROXY_PATH;
  const configuredProxyUrl = configuredPublicProxyUrl || configuredServerProxyUrl;

  if (normalizedProxy) {
    return {
      path: "proxy",
      configuredProxyUrl,
      normalizedProxyUrl: normalizedProxy,
      finalRequestUrl: buildProxyRequestUrl(normalizedProxy, query, COMICVINE_LIMIT),
    };
  }

  if (apiKey) {
    return {
      path: "direct",
      configuredProxyUrl,
      normalizedProxyUrl: "",
      finalRequestUrl: `${COMICVINE_DIRECT_API}?api_key=${encodeURIComponent(apiKey)}&format=json&resources=issue&query=${encodeURIComponent(query)}&limit=${COMICVINE_LIMIT}`,
    };
  }

  return {
    path: "proxy",
    configuredProxyUrl,
    normalizedProxyUrl: "",
    finalRequestUrl: "",
    unavailableReason: "comicvine_proxy_or_api_key_missing",
  };
}

function skippedResult(plan: SourcePlan): SourceResult {
  const diagnostics: SourceDiagnosticV2 = {
    source: "comicVine",
    status: "skipped",
    planned: plan.enabled,
    attempted: false,
    timedOut: false,
    rawCount: 0,
    queries: [],
    skippedReason: "source_disabled",
  };
  return { source: "comicVine", status: "skipped", rawItems: [], diagnostics };
}

export const comicVineSourceAdapter: SourceAdapterV2 = {
  source: "comicVine",
  async search(plan, context) {
    if (!plan.enabled) return skippedResult(plan);

    const startedAt = nowIso();
    const fetches: SourceFetchDiagnosticV2[] = [];
    const rawItems: Record<string, unknown>[] = [];
    const dedupe = new Set<string>();
    let timedOut = false;
    let failedReason = "";
    let requestPath: "proxy" | "direct" | undefined;
    const usedProxyUrls = new Set<string>();
    let queryAttemptCount = 0;
    let requestDispatchedCount = 0;
    let requestCompletedCount = 0;
    let requestAbortedCount = 0;
    let requestTimedOutCount = 0;
    let requestNeverDispatchedCount = 0;
    let upstreamErrorCount = 0;
    let validEmptyResponseCount = 0;
    let conversionRemovedAllRowsCount = 0;
    let convertedCount = 0;
    let duplicateCount = 0;
    const normalizedCandidateCount = 0;

    for (let index = 0; index < plan.intents.length; index += 1) {
      const intent = plan.intents[index];
      if (!intent) continue;
      const query = String(intent.query || "").trim();
      if (!query) continue;
      queryAttemptCount += 1;

      const requestPlan = buildRequestPlan(query);
      requestPath = requestPath || requestPlan.path;
      if (requestPlan.normalizedProxyUrl) usedProxyUrls.add(requestPlan.normalizedProxyUrl);
      const fetchDiag: SourceFetchDiagnosticV2 = {
        query,
        attemptNumber: index + 1,
        queryFamily: String(intent.id || "").trim() || "generic",
        queryCascadeIndex: index,
        facets: intent.facets || [],
        timedOut: false,
        fetchStartedAt: nowIso(),
        requestStart: nowIso(),
        requestDispatched: false,
        requestCompleted: false,
        convertedCount: 0,
        duplicateCount: 0,
        fetchPath: requestPlan.path,
        requestUrl: requestPlan.path === "direct" ? COMICVINE_DIRECT_API : requestPlan.finalRequestUrl,
        configuredProxyUrl: requestPlan.configuredProxyUrl,
        normalizedProxyUrl: requestPlan.normalizedProxyUrl,
        finalRequestUrl: requestPlan.finalRequestUrl,
      };

      if (!requestPlan.finalRequestUrl) {
        fetchDiag.status = "failed";
        fetchDiag.failedReason = requestPlan.unavailableReason || "comicvine_unavailable";
        fetchDiag.requestNotDispatchedReason = fetchDiag.failedReason;
        fetchDiag.emptyResultReason = "request_never_dispatched";
        requestNeverDispatchedCount += 1;
        failedReason = failedReason || fetchDiag.failedReason || "comicvine_unavailable";
        fetchDiag.fetchFinishedAt = nowIso();
        fetchDiag.requestEnd = fetchDiag.fetchFinishedAt;
        fetchDiag.elapsedMs = Date.parse(fetchDiag.fetchFinishedAt) - Date.parse(fetchDiag.fetchStartedAt || fetchDiag.fetchFinishedAt);
        fetches.push(fetchDiag);
        continue;
      }

      try {
        fetchDiag.requestDispatched = true;
        requestDispatchedCount += 1;
        const response = await fetch(requestPlan.finalRequestUrl, {
          method: "GET",
          signal: context.signal,
          headers: { Accept: "application/json" },
        });
        requestCompletedCount += 1;
        fetchDiag.requestCompleted = true;
        fetchDiag.httpStatus = response.status;
        fetchDiag.responseContentType = String(response.headers.get("content-type") || "").trim();
        const body = await response.text();
        fetchDiag.responseBodyPrefix = body.slice(0, 360);
        if (!response.ok) {
          fetchDiag.status = "failed";
          fetchDiag.failedReason = `http_${response.status}`;
          upstreamErrorCount += 1;
          failedReason = failedReason || fetchDiag.failedReason;
          continue;
        }

        const payload = body ? JSON.parse(body) : {};
        const parsed = responseRows(payload);
        const rows = parsed.rows;
        fetchDiag.proxyResponseShape = parsed.shape;
        fetchDiag.rawApiCount = rows.length;
        fetchDiag.docsReturned = rows.length;
        fetchDiag.rawRetrieved = rows.length;
        fetchDiag.firstReturnedTitles = uniqueStrings(rows.map((row) => rowTitle(row)).filter(Boolean), 8);
        if (rows.length === 0) {
          fetchDiag.emptyResultReason = "valid_empty_response";
          validEmptyResponseCount += 1;
        }
        fetchDiag.status = rows.length > 0 ? "succeeded" : "empty";

        let fetchConvertedCount = 0;
        let fetchDuplicateCount = 0;
        for (const row of rows) {
          const normalized = toRawRow(
            row,
            query,
            String(intent.id || "").trim() || "generic",
            index,
            intent.facets || [],
          );
          if (!normalized) continue;
          fetchConvertedCount += 1;
          const key = `${normalized.sourceId || normalized.id || normalized.title}`;
          if (dedupe.has(String(key).toLowerCase())) {
            fetchDuplicateCount += 1;
            continue;
          }
          dedupe.add(String(key).toLowerCase());
          rawItems.push(normalized);
        }
        fetchDiag.convertedCount = fetchConvertedCount;
        fetchDiag.duplicateCount = fetchDuplicateCount;
        convertedCount += fetchConvertedCount;
        duplicateCount += fetchDuplicateCount;
        if (rows.length > 0 && fetchConvertedCount === 0) {
          fetchDiag.emptyResultReason = "conversion_removed_all_rows";
          conversionRemovedAllRowsCount += 1;
        }
      } catch (error) {
        const errorObj = error as { name?: string; message?: string };
        const message = normalizedErrorMessage(error);
        const parentAborted = Boolean(context.signal?.aborted);
        const signalReason = abortReasonFromSignal(context.signal);
        const aborted = errorObj?.name === "AbortError" || /\babort(ed)?\b/i.test(message);
        const timeoutAbort = aborted && /timeout|source_timeout/i.test(`${signalReason} ${message}`);
        fetchDiag.thrownErrorName = String(errorObj?.name || "");
        fetchDiag.thrownErrorMessage = message;
        fetchDiag.aborted = aborted;
        fetchDiag.abortReason = aborted ? (parentAborted ? signalReason : (message || "request_aborted")) : undefined;
        fetchDiag.abortOrigin = aborted
          ? parentAborted
            ? (timeoutAbort ? "local_timeout" : "router_or_parent")
            : "fetch_abort_without_local_signal"
          : undefined;
        fetchDiag.timedOut = timeoutAbort;
        fetchDiag.failedReason = aborted ? (timeoutAbort ? "request_timed_out" : "request_aborted") : "upstream_error";
        fetchDiag.status = aborted ? (timeoutAbort ? "timed_out" : "aborted") : "failed";
        fetchDiag.emptyResultReason = aborted
          ? (timeoutAbort ? "request_timed_out" : "request_aborted")
          : "upstream_error";
        if (aborted) {
          requestAbortedCount += 1;
          if (timeoutAbort) requestTimedOutCount += 1;
        } else {
          upstreamErrorCount += 1;
        }
        if (timeoutAbort) timedOut = true;
        failedReason = failedReason || fetchDiag.failedReason || "fetch_error";
      } finally {
        fetchDiag.fetchFinishedAt = nowIso();
        fetchDiag.requestEnd = fetchDiag.fetchFinishedAt;
        fetchDiag.elapsedMs = Date.parse(fetchDiag.fetchFinishedAt) - Date.parse(fetchDiag.fetchStartedAt || fetchDiag.fetchFinishedAt);
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
      source: "comicVine",
      status,
      planned: true,
      attempted: true,
      timedOut,
      startedAt,
      finishedAt,
      elapsedMs: Date.parse(finishedAt) - Date.parse(startedAt),
      rawCount: rawItems.length,
      convertedCount,
      duplicateCount,
      scoringHandoffCount: 0,
      finalEligibleCount: 0,
      selectedCount: 0,
      renderedCount: 0,
      queryAttemptCount,
      queryAttemptedCount: fetches.length,
      requestDispatchedCount,
      requestCompletedCount,
      requestAbortedCount,
      requestTimedOutCount,
      requestNeverDispatchedCount,
      upstreamErrorCount,
      validEmptyResponseCount,
      conversionRemovedAllRowsCount,
      normalizationRemovedAllRowsCount: 0,
      laterStageRemovedAllCandidatesCount: 0,
      rawApiResultCount: fetches.reduce((sum, fetchDiag) => sum + Number(fetchDiag.rawApiCount || 0), 0),
      queries: fetches.map((fetchDiag) => fetchDiag.query),
      rawTitles: uniqueStrings(rawItems.map((row) => row.title), 30),
      firstReturnedTitles: uniqueStrings(fetches.flatMap((fetchDiag) => fetchDiag.firstReturnedTitles || []), 20),
      failedReason: status === "failed" || status === "timed_out" ? failedReason || undefined : undefined,
      emptyReason: status === "empty"
        ? sourceEmptyReason({
            planEnabled: plan.enabled,
            queryAttemptCount,
            requestDispatchedCount,
            requestAbortedCount,
            requestTimedOutCount,
            upstreamErrorCount,
            rawApiResultCount: fetches.reduce((sum, fetchDiag) => sum + Number(fetchDiag.rawApiCount || 0), 0),
            convertedCount,
            normalizedCount: normalizedCandidateCount,
            duplicateCount,
          })
        : undefined,
      sourceStageEmptyReason: status === "empty"
        ? sourceEmptyReason({
            planEnabled: plan.enabled,
            queryAttemptCount,
            requestDispatchedCount,
            requestAbortedCount,
            requestTimedOutCount,
            upstreamErrorCount,
            rawApiResultCount: fetches.reduce((sum, fetchDiag) => sum + Number(fetchDiag.rawApiCount || 0), 0),
            convertedCount,
            normalizedCount: normalizedCandidateCount,
            duplicateCount,
          })
        : undefined,
      fetches,
      droppedBeforeDocCount: 0,
      dropReasons: {},
      rawItemPreview: [
        { comicVineFetchPath: requestPath || "unknown" },
        ...Array.from(usedProxyUrls).map((url) => ({ comicVineNormalizedProxyUrl: url })),
      ],
    };

    return {
      source: "comicVine",
      status,
      rawItems,
      diagnostics,
    };
  },
};
