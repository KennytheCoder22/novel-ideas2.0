import type { SourceAdapterV2, SourceDiagnosticV2, SourceFetchDiagnosticV2, SourcePlan, SourceResult, TasteProfile } from "../types";

const OPEN_LIBRARY_QUERY_LIMIT = 1;
const OPEN_LIBRARY_DOC_LIMIT = 10;
const OPEN_LIBRARY_DOCS_PER_QUERY = 8;
const OPEN_LIBRARY_DIAGNOSTIC_PROBE_QUERY = "fantasy";
const RESPONSE_BODY_PREFIX_LIMIT = 240;

function nowIso(): string {
  return new Date().toISOString();
}

function uniqueStrings(values: unknown[], limit = 24): string[] {
  const seen = new Set<string>();
  const output: string[] = [];
  for (const value of values) {
    const normalized = String(value || "").trim();
    if (!normalized) continue;
    const key = normalized.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    output.push(normalized);
    if (output.length >= limit) break;
  }
  return output;
}

function openLibraryRequest(query: string, limit: number): { url: string; fetchPath: "direct" | "proxy" } {
  const params = `q=${encodeURIComponent(query)}&limit=${Math.max(1, Math.min(20, limit))}`;
  if (typeof window !== "undefined") return { url: `/api/openlibrary?${params}`, fetchPath: "proxy" };
  return { url: `https://openlibrary.org/search.json?${params}&language=eng`, fetchPath: "direct" };
}

function bodyPrefix(value: string): string | undefined {
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, RESPONSE_BODY_PREFIX_LIMIT) : undefined;
}

function normalizeOpenLibraryDoc(doc: any, query: string) {
  const key = String(doc?.key || doc?.cover_edition_key || doc?.edition_key?.[0] || "").trim();
  const title = String(doc?.title || "").trim();
  const authors = uniqueStrings(Array.isArray(doc?.author_name) ? doc.author_name : []);
  const subjects = uniqueStrings([
    ...(Array.isArray(doc?.subject) ? doc.subject : []),
    ...(Array.isArray(doc?.subject_facet) ? doc.subject_facet : []),
  ]);
  const firstPublishYear = Number.isFinite(Number(doc?.first_publish_year)) ? Number(doc.first_publish_year) : undefined;
  const sourceUrl = key ? `https://openlibrary.org${key.startsWith("/") ? key : `/${key}`}` : undefined;
  return {
    id: key || `openlibrary:${title.toLowerCase()}`,
    sourceId: key || undefined,
    key: key || undefined,
    title,
    subtitle: String(doc?.subtitle || "").trim() || undefined,
    creators: authors,
    authors,
    author_name: authors,
    description: undefined,
    formats: ["book"],
    genres: subjects.slice(0, 12),
    themes: subjects.slice(0, 18),
    tones: [],
    characterDynamics: [],
    maturityBand: undefined,
    publicationYear: firstPublishYear,
    first_publish_year: firstPublishYear,
    sourceUrl,
    cover_i: doc?.cover_i,
    source: "openLibrary",
    queryText: query,
    rawOpenLibraryDoc: doc,
  };
}

function emptyDiagnostics(plan: SourcePlan, status: SourceDiagnosticV2["status"], startedAt: string, extra?: Partial<SourceDiagnosticV2>): SourceDiagnosticV2 {
  const finishedAt = nowIso();
  return {
    source: "openLibrary",
    status,
    planned: plan.enabled,
    attempted: status !== "skipped",
    timedOut: status === "timed_out",
    startedAt,
    finishedAt,
    elapsedMs: Date.parse(finishedAt) - Date.parse(startedAt),
    rawCount: 0,
    normalizedCount: 0,
    queries: [],
    ...extra,
  };
}

async function fetchOpenLibraryDocs(query: string, limit: number, signal?: AbortSignal, diagnosticOnly = false): Promise<{ docs: any[]; diagnostic: SourceFetchDiagnosticV2; responseBodyPrefix?: string }> {
  const { url, fetchPath } = openLibraryRequest(query, limit);
  const fetchStartedAt = nowIso();
  const startedMs = Date.now();
  const diagnostic: SourceFetchDiagnosticV2 = {
    query,
    fetchStartedAt,
    timedOut: false,
    fetchPath,
    diagnosticOnly,
  };

  try {
    const response = await fetch(url, signal ? { signal } : undefined);
    diagnostic.httpStatus = response.status;
    const text = await response.text();
    diagnostic.fetchFinishedAt = nowIso();
    diagnostic.elapsedMs = Date.now() - startedMs;

    if (!response.ok) {
      diagnostic.responseBodyPrefix = bodyPrefix(text);
      diagnostic.failedReason = `openlibrary_http_${response.status}`;
      return { docs: [], diagnostic, responseBodyPrefix: diagnostic.responseBodyPrefix };
    }

    try {
      const json = JSON.parse(text);
      const docs = Array.isArray(json?.docs) ? json.docs : [];
      diagnostic.docsReturned = docs.length;
      return { docs, diagnostic };
    } catch (error: any) {
      diagnostic.responseBodyPrefix = bodyPrefix(text);
      diagnostic.failedReason = `openlibrary_json_parse_failed:${error?.message || String(error)}`;
      return { docs: [], diagnostic, responseBodyPrefix: diagnostic.responseBodyPrefix };
    }
  } catch (error: any) {
    const cause = error?.cause;
    const causeDetail = cause?.code || cause?.message || "";
    const message = [String(error?.message || error || "openlibrary_fetch_failed"), causeDetail ? `cause:${causeDetail}` : ""].filter(Boolean).join(" ");
    diagnostic.fetchFinishedAt = nowIso();
    diagnostic.elapsedMs = Date.now() - startedMs;
    diagnostic.timedOut = Boolean(signal?.aborted || /aborted|abort|timeout/i.test(message));
    diagnostic.failedReason = message;
    return { docs: [], diagnostic };
  }
}

export const openLibrarySourceAdapter: SourceAdapterV2 = {
  source: "openLibrary",
  async search(plan: SourcePlan, context: { profile: TasteProfile; signal?: AbortSignal }): Promise<SourceResult> {
    const startedAt = nowIso();
    if (!plan.enabled) {
      return {
        source: "openLibrary",
        status: "skipped",
        rawItems: [],
        diagnostics: emptyDiagnostics(plan, "skipped", startedAt, {
          skippedReason: plan.skippedReason || "source_disabled",
          attempted: false,
        }),
      };
    }

    const queries = uniqueStrings(plan.intents.map((intent) => intent.query), OPEN_LIBRARY_QUERY_LIMIT);
    if (!queries.length) {
      return {
        source: "openLibrary",
        status: "skipped",
        rawItems: [],
        diagnostics: emptyDiagnostics(plan, "skipped", startedAt, {
          skippedReason: "no_search_intents",
          attempted: false,
        }),
      };
    }

    const rawItems: unknown[] = [];
    const rawTitles: string[] = [];
    const dropReasons: Record<string, number> = {};
    const fetches: SourceFetchDiagnosticV2[] = [];
    let rawApiResultCount = 0;
    let failedReason = "";

    for (const query of queries) {
      if (context.signal?.aborted) {
        return {
          source: "openLibrary",
          status: "timed_out",
          rawItems,
          diagnostics: emptyDiagnostics(plan, "timed_out", startedAt, {
            queries,
            rawCount: rawItems.length,
            normalizedCount: rawItems.length,
            rawTitles,
            failedReason: "openlibrary_aborted_before_query_start",
            fetches,
          }),
        };
      }

      const { docs, diagnostic } = await fetchOpenLibraryDocs(query, OPEN_LIBRARY_DOCS_PER_QUERY, context.signal);
      fetches.push(diagnostic);
      if (diagnostic.timedOut) {
        return {
          source: "openLibrary",
          status: "timed_out",
          rawItems,
          diagnostics: emptyDiagnostics(plan, "timed_out", startedAt, {
            queries,
            rawCount: rawItems.length,
            normalizedCount: rawItems.length,
            rawTitles: uniqueStrings(rawTitles, 10),
            failedReason: diagnostic.failedReason || "openlibrary_fetch_timed_out",
            rawApiResultCount,
            droppedBeforeDocCount: Object.values(dropReasons).reduce((sum, count) => sum + count, 0),
            dropReasons,
            fetches,
          }),
        };
      }
      if (diagnostic.failedReason) {
        failedReason = diagnostic.failedReason;
        break;
      }

      rawApiResultCount += docs.length;
      for (const doc of docs) {
        const title = String(doc?.title || "").trim();
        if (title) rawTitles.push(title);
        if (!title) {
          dropReasons.missing_title = Number(dropReasons.missing_title || 0) + 1;
          continue;
        }
        if (!Array.isArray(doc?.author_name) || doc.author_name.length === 0) {
          dropReasons.missing_author = Number(dropReasons.missing_author || 0) + 1;
          continue;
        }
        rawItems.push(normalizeOpenLibraryDoc(doc, query));
        if (rawItems.length >= OPEN_LIBRARY_DOC_LIMIT) break;
      }
      if (rawItems.length >= OPEN_LIBRARY_DOC_LIMIT) break;
    }

    if (!rawItems.length && !context.signal?.aborted && queries[0]?.toLowerCase() !== OPEN_LIBRARY_DIAGNOSTIC_PROBE_QUERY) {
      const { diagnostic } = await fetchOpenLibraryDocs(OPEN_LIBRARY_DIAGNOSTIC_PROBE_QUERY, 1, context.signal, true);
      fetches.push(diagnostic);
      if (diagnostic.timedOut && !failedReason) failedReason = diagnostic.failedReason || "openlibrary_probe_timed_out";
    }

    if (context.signal?.aborted) {
      return {
        source: "openLibrary",
        status: "timed_out",
        rawItems,
        diagnostics: emptyDiagnostics(plan, "timed_out", startedAt, {
          queries,
          rawCount: rawItems.length,
          normalizedCount: rawItems.length,
          rawTitles: uniqueStrings(rawTitles, 10),
          failedReason: failedReason || "openlibrary_aborted_after_query_complete",
          rawApiResultCount,
          droppedBeforeDocCount: Object.values(dropReasons).reduce((sum, count) => sum + count, 0),
          dropReasons,
          fetches,
        }),
      };
    }

    const finishedAt = nowIso();
    const status: SourceResult["status"] = failedReason ? "failed" : rawItems.length ? "succeeded" : "empty";
    return {
      source: "openLibrary",
      status,
      rawItems,
      diagnostics: {
        source: "openLibrary",
        status,
        planned: true,
        attempted: true,
        timedOut: false,
        startedAt,
        finishedAt,
        elapsedMs: Date.parse(finishedAt) - Date.parse(startedAt),
        rawCount: rawItems.length,
        normalizedCount: rawItems.length,
        queries,
        rawTitles: uniqueStrings(rawTitles, 10),
        firstReturnedTitles: uniqueStrings(rawItems.map((item: any) => item?.title), 5),
        failedReason: failedReason || undefined,
        rawApiResultCount,
        droppedBeforeDocCount: Object.values(dropReasons).reduce((sum, count) => sum + count, 0),
        dropReasons,
        fetches,
      },
    };
  },
};
