import type { SourceAdapterV2, SourceDiagnosticV2, SourcePlan, SourceResult, TasteProfile } from "../types";

const OPEN_LIBRARY_QUERY_LIMIT = 2;
const OPEN_LIBRARY_DOC_LIMIT = 10;
const OPEN_LIBRARY_DOCS_PER_QUERY = 8;

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

function openLibraryUrl(query: string, limit: number): string {
  const params = `q=${encodeURIComponent(query)}&limit=${Math.max(1, Math.min(20, limit))}`;
  if (typeof window !== "undefined") return `/api/openlibrary?${params}`;
  return `https://openlibrary.org/search.json?${params}&language=eng`;
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
            failedReason: "openlibrary_aborted_before_query_complete",
          }),
        };
      }

      try {
        const response = await fetch(openLibraryUrl(query, OPEN_LIBRARY_DOCS_PER_QUERY), context.signal ? { signal: context.signal } : undefined);
        if (!response.ok) {
          failedReason = `openlibrary_http_${response.status}`;
          break;
        }
        const json = await response.json();
        const docs = Array.isArray(json?.docs) ? json.docs : [];
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
      } catch (error: any) {
        const cause = error?.cause;
        const causeDetail = cause?.code || cause?.message || "";
        const message = [String(error?.message || error || "openlibrary_fetch_failed"), causeDetail ? `cause:${causeDetail}` : ""].filter(Boolean).join(" ");
        if (context.signal?.aborted || /aborted|abort|timeout/i.test(message)) {
          return {
            source: "openLibrary",
            status: "timed_out",
            rawItems,
            diagnostics: emptyDiagnostics(plan, "timed_out", startedAt, {
              queries,
              rawCount: rawItems.length,
              normalizedCount: rawItems.length,
              rawTitles: uniqueStrings(rawTitles, 10),
              failedReason: message,
              rawApiResultCount,
              droppedBeforeDocCount: Object.values(dropReasons).reduce((sum, count) => sum + count, 0),
              dropReasons,
            }),
          };
        }
        failedReason = message;
        break;
      }
      if (rawItems.length >= OPEN_LIBRARY_DOC_LIMIT) break;
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
      },
    };
  },
};
