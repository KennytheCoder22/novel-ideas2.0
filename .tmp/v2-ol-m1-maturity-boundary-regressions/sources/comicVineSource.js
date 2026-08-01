"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.comicVineSourceAdapter = void 0;
const COMICVINE_DIRECT_API = "https://comicvine.gamespot.com/api/search/";
const COMICVINE_ADAPTER_VERSION = "v2";
const COMICVINE_LIMIT = 20;
const COMICVINE_DEFAULT_PROXY_PATH = "/api/comicvine";
function nowIso() {
    return new Date().toISOString();
}
function uniqueStrings(values, limit = 50) {
    const out = [];
    const seen = new Set();
    for (const value of values) {
        const cleaned = String(value || "").trim();
        if (!cleaned)
            continue;
        const key = cleaned.toLowerCase();
        if (seen.has(key))
            continue;
        seen.add(key);
        out.push(cleaned);
        if (out.length >= limit)
            break;
    }
    return out;
}
function parseYear(value) {
    const match = String(value || "").match(/\b(19|20)\d{2}\b/);
    if (!match)
        return undefined;
    const year = Number(match[0]);
    return Number.isFinite(year) ? year : undefined;
}
function fallbackCreators(item) {
    const people = Array.isArray(item.person_credits) ? item.person_credits : [];
    return uniqueStrings(people.map((person) => person?.name || "").filter(Boolean), 5);
}
function normalizeQueryTokens(query) {
    return uniqueStrings(String(query || "")
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, " ")
        .split(/\s+/)
        .filter(Boolean), 8);
}
function rowTitle(item) {
    const directName = String(item.name || "").trim();
    if (directName)
        return directName;
    const volumeName = String(item.volume?.name || "").trim();
    const issue = String(item.issue_number || "").trim();
    if (!volumeName)
        return "";
    return issue ? `${volumeName} #${issue}` : volumeName;
}
function toRawRow(item, query, queryFamily, queryCascadeIndex, facets) {
    const title = rowTitle(item);
    if (!title)
        return null;
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
function normalizedProxyUrl(value) {
    const trimmed = String(value || "").trim();
    if (!trimmed || trimmed === "undefined" || trimmed === "null")
        return "";
    return trimmed;
}
function absoluteUrlForProxy(baseProxyUrl) {
    if (/^https?:\/\//i.test(baseProxyUrl))
        return baseProxyUrl;
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
    if (/^[a-z0-9.-]+\.[a-z]{2,}/i.test(baseProxyUrl))
        return `https://${baseProxyUrl}`;
    return baseProxyUrl;
}
function buildProxyRequestUrl(baseProxyUrl, query, limit) {
    const asUrl = new URL(absoluteUrlForProxy(baseProxyUrl));
    asUrl.searchParams.set("q", query);
    asUrl.searchParams.set("limit", String(limit));
    return asUrl.toString();
}
function responseRows(payload) {
    if (Array.isArray(payload?.results))
        return { rows: payload.results, shape: "results_array" };
    if (Array.isArray(payload?.data))
        return { rows: payload.data, shape: "data_array" };
    if (Array.isArray(payload?.data?.results))
        return { rows: payload.data.results, shape: "nested_data_results_array" };
    if (Array.isArray(payload?.issues))
        return { rows: payload.issues, shape: "issues_array" };
    if (Array.isArray(payload?.resources))
        return { rows: payload.resources, shape: "resources_array" };
    return { rows: [], shape: "unknown" };
}
function buildRequestPlan(query) {
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
function skippedResult(plan) {
    const diagnostics = {
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
exports.comicVineSourceAdapter = {
    source: "comicVine",
    async search(plan, context) {
        if (!plan.enabled)
            return skippedResult(plan);
        const startedAt = nowIso();
        const fetches = [];
        const rawItems = [];
        const dedupe = new Set();
        let timedOut = false;
        let failedReason = "";
        let requestPath;
        const usedProxyUrls = new Set();
        for (let index = 0; index < plan.intents.length; index += 1) {
            const intent = plan.intents[index];
            if (!intent)
                continue;
            const query = String(intent.query || "").trim();
            if (!query)
                continue;
            const requestPlan = buildRequestPlan(query);
            requestPath = requestPath || requestPlan.path;
            if (requestPlan.normalizedProxyUrl)
                usedProxyUrls.add(requestPlan.normalizedProxyUrl);
            const fetchDiag = {
                query,
                queryFamily: String(intent.id || "").trim() || "generic",
                queryCascadeIndex: index,
                facets: intent.facets || [],
                timedOut: false,
                fetchStartedAt: nowIso(),
                fetchPath: requestPlan.path,
                requestUrl: requestPlan.path === "direct" ? COMICVINE_DIRECT_API : requestPlan.finalRequestUrl,
                configuredProxyUrl: requestPlan.configuredProxyUrl,
                normalizedProxyUrl: requestPlan.normalizedProxyUrl,
                finalRequestUrl: requestPlan.finalRequestUrl,
            };
            if (!requestPlan.finalRequestUrl) {
                fetchDiag.status = "failed";
                fetchDiag.failedReason = requestPlan.unavailableReason || "comicvine_unavailable";
                failedReason = failedReason || fetchDiag.failedReason || "comicvine_unavailable";
                fetchDiag.fetchFinishedAt = nowIso();
                fetches.push(fetchDiag);
                continue;
            }
            try {
                const response = await fetch(requestPlan.finalRequestUrl, {
                    method: "GET",
                    signal: context.signal,
                    headers: { Accept: "application/json" },
                });
                fetchDiag.httpStatus = response.status;
                fetchDiag.responseContentType = String(response.headers.get("content-type") || "").trim();
                const body = await response.text();
                fetchDiag.responseBodyPrefix = body.slice(0, 360);
                if (!response.ok) {
                    fetchDiag.status = "failed";
                    fetchDiag.failedReason = `http_${response.status}`;
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
                fetchDiag.status = rows.length > 0 ? "succeeded" : "empty";
                for (const row of rows) {
                    const normalized = toRawRow(row, query, String(intent.id || "").trim() || "generic", index, intent.facets || []);
                    if (!normalized)
                        continue;
                    const key = `${normalized.sourceId || normalized.id || normalized.title}`;
                    if (dedupe.has(String(key).toLowerCase()))
                        continue;
                    dedupe.add(String(key).toLowerCase());
                    rawItems.push(normalized);
                }
            }
            catch (error) {
                const errorObj = error;
                const message = String(errorObj?.message || error || "");
                fetchDiag.thrownErrorName = String(errorObj?.name || "");
                fetchDiag.thrownErrorMessage = message;
                fetchDiag.failedReason = message.includes("aborted") ? "aborted" : "fetch_error";
                fetchDiag.status = message.includes("aborted") ? "aborted" : "failed";
                fetchDiag.aborted = message.includes("aborted");
                if (message.includes("aborted"))
                    timedOut = true;
                failedReason = failedReason || fetchDiag.failedReason || "fetch_error";
            }
            finally {
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
        const diagnostics = {
            source: "comicVine",
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
            emptyReason: status === "empty" ? "comicvine_returned_no_rows" : undefined,
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
