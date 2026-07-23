import type { SourceAdapterV2, SourceDiagnosticV2, SourceFetchDiagnosticV2, SourcePlan, SourceResult, TasteProfile } from "../types";

const NYT_API_BASE = "https://api.nytimes.com/svc/books/v3/lists";
const NYT_ADAPTER_VERSION = "v1";
const NYT_DATE = "current";

type NytBook = {
  title: string;
  author: string;
  description?: string;
  publisher?: string;
  primary_isbn10?: string;
  primary_isbn13?: string;
  rank?: number;
  weeks_on_list?: number;
  amazon_product_url?: string;
  book_image?: string;
  age_group?: string;
  list_name?: string;
  list_name_encoded?: string;
  display_name?: string;
  bestsellers_date?: string;
  published_date?: string;
};

type NytListFetch = {
  requestedList: string;
  endpoint: string;
  httpStatus?: number;
  failedReason?: string;
  timedOut: boolean;
  quotaBlocked?: boolean;
  retryAfterMs?: number;
  cacheHit?: boolean;
  returnedListName?: string;
  returnedListEncoded?: string;
  books: NytBook[];
  fetch: SourceFetchDiagnosticV2;
};

function nowIso(): string {
  return new Date().toISOString();
}

function normalizeText(value: unknown): string {
  return String(value || "").toLowerCase().replace(/[^a-z0-9\s-]/g, " ").replace(/\s+/g, " ").trim();
}

function normalizeIsbn(value: unknown): string {
  return String(value || "").replace(/[^0-9xX]/g, "").toUpperCase().trim();
}

function uniqueStrings(values: unknown[], limit = 80): string[] {
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

function getNytApiKey(): string {
  return String(
    process.env.NYT_BOOKS_API_KEY
    || process.env.EXPO_PUBLIC_NYT_BOOKS_API_KEY
    || process.env.NEXT_PUBLIC_NYT_BOOKS_API_KEY
    || "",
  ).trim();
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function redactApiKeyFromUrl(url: string): string {
  return url.replace(/([?&]api-key=)[^&]+/gi, "$1[redacted]");
}

// Sliding-window rate limiter: max 5 requests per 60 s to stay within NYT's limit.
class NytWindowRateLimiter {
  private readonly max: number;
  private readonly windowMs: number;
  private readonly timestamps: number[] = [];

  constructor(max: number, windowMs: number) {
    this.max = max;
    this.windowMs = windowMs;
  }

  async waitTurn(): Promise<void> {
    const prune = (): void => {
      const cutoff = Date.now() - this.windowMs;
      while (this.timestamps.length > 0 && (this.timestamps[0] ?? 0) < cutoff) this.timestamps.shift();
    };
    prune();
    if (this.timestamps.length >= this.max) {
      const waitUntil = (this.timestamps[0] ?? 0) + this.windowMs + 100;
      const waitMs = waitUntil - Date.now();
      if (waitMs > 0) await sleep(waitMs);
      prune();
    }
    this.timestamps.push(Date.now());
  }
}

const nytRateLimiter = new NytWindowRateLimiter(5, 60_000);

// Day-keyed in-process cache. NYT bestseller lists update weekly so a same-day cache is safe.
type NytCacheEntry = {
  day: string;
  books: NytBook[];
  returnedListName?: string;
  returnedListEncoded?: string;
  endpoint: string;
  httpStatus: number;
};

const nytDailyCache = new Map<string, NytCacheEntry>();

function todayUtcDate(): string {
  return new Date().toISOString().slice(0, 10);
}

function getCachedList(listSlug: string): NytListFetch | null {
  const entry = nytDailyCache.get(listSlug);
  if (!entry) return null;
  if (entry.day !== todayUtcDate()) { nytDailyCache.delete(listSlug); return null; }
  const fetchDiag: SourceFetchDiagnosticV2 = {
    query: listSlug,
    timedOut: false,
    cacheHit: true,
    status: entry.books.length > 0 ? "succeeded" : "empty",
    rawApiCount: entry.books.length,
    docsReturned: entry.books.length,
    rawRetrieved: entry.books.length,
    firstReturnedTitles: uniqueStrings(entry.books.map((b) => b.title), 10),
  };
  return { requestedList: listSlug, endpoint: entry.endpoint, httpStatus: entry.httpStatus, timedOut: false, cacheHit: true, returnedListName: entry.returnedListName, returnedListEncoded: entry.returnedListEncoded, books: entry.books, fetch: fetchDiag };
}

function setCachedList(listSlug: string, result: NytListFetch): void {
  if (!result.failedReason && !result.quotaBlocked) {
    nytDailyCache.set(listSlug, { day: todayUtcDate(), books: result.books, returnedListName: result.returnedListName, returnedListEncoded: result.returnedListEncoded, endpoint: result.endpoint, httpStatus: result.httpStatus ?? 200 });
  }
}

function inflightKey(listSlug: string): string {
  return `${listSlug}:${todayUtcDate()}`;
}

// In-flight promise map: coalesces concurrent requests for the same list/date
// so two simultaneous cold instances never duplicate a live fetch.
const nytInflight = new Map<string, Promise<NytListFetch>>();

function inferFamilyFromQuery(query: string): string {
  const q = normalizeText(query);
  if (!q) return "general";
  if (/\b(psychological thriller|crime thriller|conspiracy thriller|fugitive thriller|manhunt thriller|abduction thriller|thriller)\b/.test(q)) return "thriller";
  if (/\b(psychological mystery|detective mystery|cold case mystery|mystery)\b/.test(q)) return "mystery";
  if (/\b(psychological horror|survival horror|haunted|horror)\b/.test(q)) return "horror";
  if (/\b(science fiction|sci fi|sci-fi|dystopian|space opera|speculative)\b/.test(q)) return "science_fiction";
  if (/\b(epic fantasy|dark fantasy|magic fantasy|fantasy)\b/.test(q)) return "fantasy";
  if (/\b(historical fiction|historical novel|period fiction|historical|19th century|victorian|gilded age|civil war)\b/.test(q)) return "historical";
  if (/\b(romance|love story|second chance romance|gothic romance|historical romance)\b/.test(q)) return "romance";
  return "general";
}

function nytListsForFamily(family: string): string[] {
  if (family === "romance") {
    return ["combined-print-and-e-book-fiction", "trade-fiction-paperback"];
  }
  if (family === "science_fiction" || family === "speculative" || family === "fantasy" || family === "horror") {
    return ["combined-print-and-e-book-fiction", "hardcover-fiction", "trade-fiction-paperback"];
  }
  if (family === "mystery" || family === "thriller") {
    return ["combined-print-and-e-book-fiction", "hardcover-fiction", "trade-fiction-paperback"];
  }
  if (family === "historical") {
    return ["combined-print-and-e-book-fiction", "trade-fiction-paperback"];
  }
  return ["combined-print-and-e-book-fiction", "hardcover-fiction"];
}

function selectRequestedLists(plan: SourcePlan, _profile: TasteProfile): string[] {
  const explicit = String(process.env.V2_NYT_LISTS_OVERRIDE || "").trim();
  if (explicit) {
    return uniqueStrings(
      explicit
        .split(/[|,]/)
        .map((value) => String(value || "").trim().toLowerCase())
        .filter(Boolean),
      6,
    );
  }

  const fromQueries = new Set<string>();
  for (const intent of plan.intents || []) {
    const family = inferFamilyFromQuery(intent.query);
    for (const list of nytListsForFamily(family)) fromQueries.add(list);
  }
  const selected = Array.from(fromQueries);
  return selected.length ? selected : nytListsForFamily("general");
}

// Shared book-parsing core used by both the per-list path and the overview path.
// `root` is either `payload.results` (per-list) or an overview list-entry object.
function parseNytBooksFromRoot(root: any, fallbackList: string): NytBook[] {
  const books = Array.isArray(root?.books) ? root.books : [];
  return books
    .filter((book: any) => book && (book.title || book.book_title))
    .map((book: any) => ({
      title: String(book.title || book.book_title || "").trim(),
      author: String(book.author || book.contributor || "").replace(/^by\s+/i, "").trim(),
      description: typeof book.description === "string" ? book.description.trim() : undefined,
      publisher: typeof book.publisher === "string" ? book.publisher.trim() : undefined,
      primary_isbn10: typeof book.primary_isbn10 === "string" ? book.primary_isbn10.trim() : undefined,
      primary_isbn13: typeof book.primary_isbn13 === "string" ? book.primary_isbn13.trim() : undefined,
      rank: Number.isFinite(Number(book.rank)) ? Number(book.rank) : undefined,
      weeks_on_list: Number.isFinite(Number(book.weeks_on_list)) ? Number(book.weeks_on_list) : undefined,
      amazon_product_url: typeof book.amazon_product_url === "string" ? book.amazon_product_url.trim() : undefined,
      book_image: typeof book.book_image === "string" ? book.book_image.trim() : undefined,
      age_group: typeof book.age_group === "string" ? book.age_group.trim() : undefined,
      list_name: typeof root?.list_name === "string" ? root.list_name.trim() : fallbackList,
      list_name_encoded: typeof root?.list_name_encoded === "string" ? root.list_name_encoded.trim() : fallbackList,
      display_name: typeof root?.display_name === "string" ? root.display_name.trim() : (typeof root?.list_name === "string" ? root.list_name.trim() : fallbackList),
      bestsellers_date: typeof root?.bestsellers_date === "string" ? root.bestsellers_date.trim() : undefined,
      published_date: typeof root?.published_date === "string" ? root.published_date.trim() : undefined,
    }));
}

// Thin wrapper for the per-list endpoint response shape (`payload.results` as root).
function parseNytBooks(payload: any, fallbackList: string): NytBook[] {
  return parseNytBooksFromRoot(payload?.results ?? {}, fallbackList);
}

// Fetch the overview endpoint once and populate the per-slug daily cache for all
// `requestedLists` found in the response.  Returns the fetch diagnostic so the
// caller can record it; returns null only on a non-quota network failure so the
// caller can fall back to per-list fetches.
type NytOverviewPopulateResult = {
  fetch: SourceFetchDiagnosticV2;
  quotaBlocked?: boolean;
  retryAfterMs?: number;
  listsPopulatedFromOverview: string[];
};

async function fetchAndPopulateFromOverview(
  requestedLists: string[],
  apiKey: string,
  signal?: AbortSignal,
): Promise<NytOverviewPopulateResult | null> {
  const fullEndpoint = `${NYT_API_BASE}/overview.json?api-key=${encodeURIComponent(apiKey)}`;
  const endpoint = redactApiKeyFromUrl(fullEndpoint);
  const fetchStartedAt = nowIso();
  const fetchDiag: SourceFetchDiagnosticV2 = { query: "__overview__", fetchStartedAt, timedOut: false };

  const doFetch = async (): Promise<{ ok: boolean; status: number; json: any; quotaBlocked?: boolean; retryAfterMs?: number }> => {
    try {
      const res = await fetch(fullEndpoint, { method: "GET", headers: { Accept: "application/json" }, signal });
      const fetchFinishedAt = nowIso();
      fetchDiag.fetchFinishedAt = fetchFinishedAt;
      fetchDiag.elapsedMs = Date.parse(fetchFinishedAt) - Date.parse(fetchStartedAt);
      fetchDiag.httpStatus = res.status;
      const text = await res.text();
      let json: any = null;
      try { json = text ? JSON.parse(text) : null; } catch { /* ignore */ }
      if (res.status === 429) {
        const retryAfterHeader = res.headers.get("Retry-After");
        const retryAfterMs = retryAfterHeader ? (Number(retryAfterHeader) || 0) * 1000 : undefined;
        return { ok: false, status: 429, json, quotaBlocked: true, retryAfterMs };
      }
      return { ok: res.ok, status: res.status, json };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      const timedOut = Boolean(signal?.aborted) || /aborted|abort|timeout/i.test(msg);
      const finAt = nowIso();
      fetchDiag.fetchFinishedAt = finAt;
      fetchDiag.elapsedMs = Date.parse(finAt) - Date.parse(fetchStartedAt);
      fetchDiag.timedOut = timedOut;
      fetchDiag.status = timedOut ? "timed_out" : "failed";
      fetchDiag.failedReason = msg || "nyt_overview_fetch_failed";
      return { ok: false, status: 0, json: null };
    }
  };

  await nytRateLimiter.waitTurn();
  let result = await doFetch();

  if (result.quotaBlocked) {
    // One bounded retry after 429, same as per-list path.
    const waitMs = result.retryAfterMs ?? 15_000;
    await sleep(waitMs);
    await nytRateLimiter.waitTurn();
    result = await doFetch();
    if (result.quotaBlocked) {
      fetchDiag.status = "failed";
      fetchDiag.failedReason = "quota_blocked";
      fetchDiag.quotaBlocked = true;
      return { fetch: fetchDiag, quotaBlocked: true, retryAfterMs: result.retryAfterMs, listsPopulatedFromOverview: [] };
    }
  }

  if (!result.ok || !result.json) {
    // Non-quota failure: record the diagnostic so the caller can observe the
    // failed attempt, then fall back to per-list fetches (listsPopulatedFromOverview
    // is empty → usedOverview stays false, per-list loop runs as normal).
    if (!fetchDiag.status) {
      fetchDiag.status = "failed";
      fetchDiag.failedReason = result.status ? `http_${result.status}` : "nyt_overview_empty_response";
    }
    return { fetch: fetchDiag, listsPopulatedFromOverview: [] };
  }

  // Extract requested lists from the overview and populate the per-slug cache.
  const overviewLists: any[] = Array.isArray(result.json?.results?.lists) ? result.json.results.lists : [];
  const bySlug = new Map<string, any>();
  for (const lst of overviewLists) {
    const slug = String(lst?.list_name_encoded || "").toLowerCase().trim();
    if (slug) bySlug.set(slug, lst);
  }

  const populated: string[] = [];
  for (const requestedSlug of requestedLists) {
    const listEntry = bySlug.get(requestedSlug);
    if (!listEntry) continue;
    const books = parseNytBooksFromRoot(listEntry, requestedSlug);
    const mockFetch: NytListFetch = {
      requestedList: requestedSlug,
      endpoint,
      httpStatus: result.status,
      timedOut: false,
      returnedListName: String(listEntry.list_name || "").trim() || undefined,
      returnedListEncoded: String(listEntry.list_name_encoded || "").trim() || undefined,
      books,
      fetch: { query: requestedSlug, timedOut: false, status: books.length > 0 ? "succeeded" : "empty", rawApiCount: books.length, docsReturned: books.length, rawRetrieved: books.length, firstReturnedTitles: uniqueStrings(books.map((b) => b.title), 10) },
    };
    setCachedList(requestedSlug, mockFetch);
    populated.push(requestedSlug);
  }

  fetchDiag.status = populated.length > 0 ? "succeeded" : "empty";
  fetchDiag.rawApiCount = overviewLists.length;
  return { fetch: fetchDiag, listsPopulatedFromOverview: populated };
}

async function fetchNytList(requestedList: string, apiKey: string, signal?: AbortSignal): Promise<NytListFetch> {
  const safeList = encodeURIComponent(String(requestedList || "").trim().toLowerCase());
  const fullEndpoint = `${NYT_API_BASE}/${NYT_DATE}/${safeList}.json?api-key=${encodeURIComponent(apiKey)}`;
  const endpoint = redactApiKeyFromUrl(fullEndpoint);
  const fetchStartedAt = nowIso();
  const fetchDiagnostic: SourceFetchDiagnosticV2 = {
    query: requestedList,
    fetchStartedAt,
    timedOut: false,
  };

  try {
    const response = await fetch(fullEndpoint, {
      method: "GET",
      headers: { Accept: "application/json" },
      signal,
    });
    const fetchFinishedAt = nowIso();
    fetchDiagnostic.fetchFinishedAt = fetchFinishedAt;
    fetchDiagnostic.elapsedMs = Date.parse(fetchFinishedAt) - Date.parse(fetchStartedAt);
    fetchDiagnostic.httpStatus = response.status;

    const text = await response.text();
    let payload: any = null;
    try {
      payload = text ? JSON.parse(text) : null;
    } catch {
      fetchDiagnostic.status = "failed";
      fetchDiagnostic.failedReason = "nyt_invalid_json";
      return { requestedList, endpoint, httpStatus: response.status, failedReason: "nyt_invalid_json", timedOut: false, books: [], fetch: fetchDiagnostic };
    }

    if (!response.ok) {
      const failedReason = String(payload?.fault?.faultstring || payload?.message || `nyt_http_${response.status}`).trim();
      const isQuotaBlocked = response.status === 429;
      const retryAfterHeader = response.headers.get("Retry-After");
      const retryAfterMs = retryAfterHeader ? (Number(retryAfterHeader) || 0) * 1000 : undefined;
      fetchDiagnostic.status = "failed";
      fetchDiagnostic.failedReason = failedReason;
      fetchDiagnostic.quotaBlocked = isQuotaBlocked;
      if (retryAfterMs) fetchDiagnostic.retryAfterMs = retryAfterMs;
      return { requestedList, endpoint, httpStatus: response.status, failedReason, timedOut: false, quotaBlocked: isQuotaBlocked, retryAfterMs, books: [], fetch: fetchDiagnostic };
    }

    const books = parseNytBooks(payload, requestedList);
    fetchDiagnostic.status = books.length > 0 ? "succeeded" : "empty";
    fetchDiagnostic.rawApiCount = books.length;
    fetchDiagnostic.docsReturned = books.length;
    fetchDiagnostic.rawRetrieved = books.length;
    fetchDiagnostic.firstReturnedTitles = uniqueStrings(books.map((book) => book.title), 10);
    return {
      requestedList, endpoint, httpStatus: response.status, timedOut: false,
      returnedListName: String(payload?.results?.list_name || "").trim() || undefined,
      returnedListEncoded: String(payload?.results?.list_name_encoded || "").trim() || undefined,
      books, fetch: fetchDiagnostic,
    };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    const timedOut = Boolean(signal?.aborted) || /aborted|abort|timeout/i.test(message);
    const fetchFinishedAt = nowIso();
    fetchDiagnostic.fetchFinishedAt = fetchFinishedAt;
    fetchDiagnostic.elapsedMs = Date.parse(fetchFinishedAt) - Date.parse(fetchStartedAt);
    fetchDiagnostic.timedOut = timedOut;
    fetchDiagnostic.status = timedOut ? "timed_out" : "failed";
    fetchDiagnostic.failedReason = message || "nyt_fetch_failed";
    return { requestedList, endpoint, failedReason: fetchDiagnostic.failedReason, timedOut, books: [], fetch: fetchDiagnostic };
  }
}

function inferredMaturityFromAgeGroup(value: unknown): string | undefined {
  const normalized = normalizeText(value);
  if (!normalized) return undefined;
  if (normalized.includes("young adult")) return "teens";
  if (normalized.includes("juvenile")) return "kids";
  return undefined;
}

function publicationYearFromDate(value: unknown): number | undefined {
  const text = String(value || "").trim();
  const year = Number(text.slice(0, 4));
  return Number.isFinite(year) && year > 0 ? year : undefined;
}

export const nytSourceAdapter: SourceAdapterV2 = {
  source: "nyt",
  async search(plan, context): Promise<SourceResult> {
    const startedAt = nowIso();
    const requestedLists = selectRequestedLists(plan, context.profile);
    const apiKey = getNytApiKey();

    if (!apiKey) {
      const diagnostics: SourceDiagnosticV2 = {
        source: "nyt",
        status: "failed",
        planned: true,
        attempted: true,
        failedReason: "nyt_missing_api_key",
        timedOut: false,
        startedAt,
        finishedAt: nowIso(),
        elapsedMs: 0,
        rawCount: 0,
        queries: plan.intents.map((intent) => intent.query),
        nytAdapterVersion: NYT_ADAPTER_VERSION,
        nytRequestedLists: requestedLists,
        nytReturnedLists: [],
        nytBooksPerList: {},
        nytEndpointCalledByList: {},
        nytHttpStatusByList: {},
        nytRawBookCount: 0,
        nytConvertedCount: 0,
        nytDroppedCount: 0,
        nytDropReasons: { nyt_missing_api_key: 1 },
        nytTitlePresentCount: 0,
        nytAuthorPresentCount: 0,
        nytIsbnPresentCount: 0,
        nytNormalizedTitles: [],
      };
      return { source: "nyt", status: "failed", rawItems: [], diagnostics };
    }

    const settled: NytListFetch[] = [];
    let runQuotaBlocked = false;
    let runRetryAfterMs: number | undefined;
    let usedOverview = false;
    const overviewFetchDiags: SourceFetchDiagnosticV2[] = [];

    // Overview fast-path: if 3 or more requested lists are not yet cached, fetch
    // the overview endpoint once (1 API call) to populate the per-slug cache for
    // all of them.  The existing per-list loop then serves everything from cache.
    // Threshold is 3 so 2-list plans (general/romance/historical families) always
    // use the per-list path, preserving retry attribution in their fetch diags.
    const uncachedLists = requestedLists.filter((l) => !getCachedList(l));
    if (uncachedLists.length >= 3) {
      const ifKey = inflightKey("__overview__");
      const existingOverviewInflight = nytInflight.get(ifKey);
      const overviewPromise = existingOverviewInflight
        ? existingOverviewInflight.then(() => null) // wait then fall through; cache now populated
        : (async (): Promise<null> => {
            const ovRes = await fetchAndPopulateFromOverview(uncachedLists, apiKey, context.signal);
            if (ovRes) {
              overviewFetchDiags.push(ovRes.fetch);
              usedOverview = usedOverview || ovRes.listsPopulatedFromOverview.length > 0;
              if (ovRes.quotaBlocked && !runQuotaBlocked) {
                runQuotaBlocked = true;
                runRetryAfterMs = ovRes.retryAfterMs;
              }
            }
            return null;
          })();
      if (!existingOverviewInflight) {
        nytInflight.set(ifKey, overviewPromise as any);
      }
      try {
        await overviewPromise;
      } finally {
        if (!existingOverviewInflight && nytInflight.get(ifKey) === overviewPromise) nytInflight.delete(ifKey);
      }
    }

    for (const list of requestedLists) {
      // Serve from daily cache when available — no API call needed.
      const cached = getCachedList(list);
      if (cached) {
        settled.push(cached);
        continue;
      }

      // Once quota is blocked this run, skip remaining live fetches.
      if (runQuotaBlocked) {
        const skippedDiag: SourceFetchDiagnosticV2 = { query: list, timedOut: false, status: "failed", failedReason: "quota_blocked_skipped", quotaBlocked: true };
        settled.push({ requestedList: list, endpoint: "", httpStatus: 429, failedReason: "quota_blocked_skipped", timedOut: false, quotaBlocked: true, books: [], fetch: skippedDiag });
        continue;
      }

      // Coalesce concurrent in-flight requests for the same list/date so two
      // simultaneous cold callers never duplicate the same live fetch.
      const ifKey = inflightKey(list);
      const existingInflight = nytInflight.get(ifKey);
      if (existingInflight) {
        const r = await existingInflight;
        if (r.quotaBlocked && !runQuotaBlocked) { runQuotaBlocked = true; runRetryAfterMs = r.retryAfterMs; }
        settled.push(r);
        continue;
      }

      // Wrap rate-limit + fetch + backoff + cache into a single shared promise.
      const liveFetch = (async (): Promise<NytListFetch> => {
        // Gate on rate limiter before every live request.
        await nytRateLimiter.waitTurn();
        let r = await fetchNytList(list, apiKey, context.signal);
        // On 429: wait (up to) 15 s, consume one more rate-limiter slot, retry once.
        if (r.quotaBlocked) {
          const waitMs = r.retryAfterMs ?? 15_000;
          await sleep(waitMs);
          await nytRateLimiter.waitTurn();
          const retry = await fetchNytList(list, apiKey, context.signal);
          r = retry.quotaBlocked
            ? { ...retry, fetch: { ...retry.fetch, retryAttempted: true, retrySucceeded: false } }
            : { ...retry, fetch: { ...retry.fetch, retryAttempted: true, retrySucceeded: true } };
        }
        setCachedList(list, r);
        return r;
      })();

      nytInflight.set(ifKey, liveFetch);
      try {
        const result = await liveFetch;
        if (result.quotaBlocked && !runQuotaBlocked) {
          // Still throttled after retry — stop live fetches for this run.
          runQuotaBlocked = true;
          runRetryAfterMs = result.retryAfterMs;
        }
        settled.push(result);
      } finally {
        if (nytInflight.get(ifKey) === liveFetch) nytInflight.delete(ifKey);
      }
    }

    const endpointCalledByList: Record<string, string> = {};
    const httpStatusByList: Record<string, number> = {};
    const booksPerList: Record<string, number> = {};
    const cacheHitByList: Record<string, boolean> = {};
    const returnedLists: string[] = [];
    const fetches: SourceFetchDiagnosticV2[] = [...overviewFetchDiags];
    let firstFailure = "";

    for (const row of settled) {
      endpointCalledByList[row.requestedList] = row.endpoint;
      if (Number.isFinite(Number(row.httpStatus))) httpStatusByList[row.requestedList] = Number(row.httpStatus);
      const returnedList = String(row.returnedListEncoded || row.returnedListName || "").trim();
      if (returnedList) returnedLists.push(returnedList);
      booksPerList[row.requestedList] = row.books.length;
      cacheHitByList[row.requestedList] = Boolean(row.cacheHit);
      fetches.push(row.fetch);
      if (!firstFailure && row.failedReason) firstFailure = row.failedReason;
    }

    const allBooks = settled.flatMap((row) => row.books);
    const dropReasons: Record<string, number> = {};
    const normalizedTitles: string[] = [];
    let titlePresentCount = 0;
    let authorPresentCount = 0;
    let isbnPresentCount = 0;
    let droppedCount = 0;

    const seen = new Set<string>();
    const rawItems: Record<string, unknown>[] = [];
    for (const book of allBooks) {
      const title = String(book.title || "").trim();
      const author = String(book.author || "").trim();
      const isbn13 = normalizeIsbn(book.primary_isbn13);
      const isbn10 = normalizeIsbn(book.primary_isbn10);
      const sourceKey = isbn13 || isbn10 || `${normalizeText(title)}:${normalizeText(author)}`;
      if (!title) {
        dropReasons.missing_title = Number(dropReasons.missing_title || 0) + 1;
        droppedCount += 1;
        continue;
      }
      titlePresentCount += 1;
      if (author) authorPresentCount += 1;
      if (isbn13 || isbn10) isbnPresentCount += 1;
      if (seen.has(sourceKey)) {
        dropReasons.duplicate_book = Number(dropReasons.duplicate_book || 0) + 1;
        droppedCount += 1;
        continue;
      }
      seen.add(sourceKey);
      normalizedTitles.push(title);
      const listLabel = String(book.display_name || book.list_name || "nyt-bestsellers").trim();
      rawItems.push({
        id: `nyt:${sourceKey}`,
        sourceId: `nyt:${sourceKey}`,
        source: "nyt",
        title,
        subtitle: undefined,
        authors: author ? [author] : [],
        description: book.description || `New York Times bestseller from ${listLabel}.`,
        genres: uniqueStrings(["fiction", "bestseller", "new york times bestseller", book.display_name, book.list_name], 8),
        themes: [],
        tones: [],
        characterDynamics: [],
        formats: ["book"],
        first_publish_year: publicationYearFromDate(book.published_date),
        publicationYear: publicationYearFromDate(book.published_date),
        sourceUrl: String(book.amazon_product_url || "").trim() || undefined,
        url: String(book.amazon_product_url || "").trim() || undefined,
        maturityBand: inferredMaturityFromAgeGroup(book.age_group),
        queryText: `nyt bestseller ${listLabel}`.trim(),
        queryFamily: inferFamilyFromQuery(plan.intents.map((intent) => intent.query).join(" ")),
        facets: uniqueStrings(plan.intents.flatMap((intent) => intent.facets || []), 8),
        isbn10: isbn10 ? [isbn10] : [],
        isbn13: isbn13 ? [isbn13] : [],
        publisher: book.publisher ? [book.publisher] : [],
        nyt: {
          list_name: book.list_name,
          list_name_encoded: book.list_name_encoded,
          display_name: book.display_name,
          rank: book.rank,
          weeks_on_list: book.weeks_on_list,
          bestsellers_date: book.bestsellers_date,
          published_date: book.published_date,
          age_group: book.age_group,
        },
      });
    }

    const successfulListFetches = settled.filter((row) => !row.failedReason).length;
    const anyTimedOut = fetches.some((row) => Boolean(row.timedOut));
    const finishedAt = nowIso();
    const status: SourceResult["status"] = rawItems.length > 0
      ? "succeeded"
      : successfulListFetches > 0
        ? "empty"
        : anyTimedOut
          ? "timed_out"
          : "failed";

    const diagnostics: SourceDiagnosticV2 = {
      source: "nyt",
      status,
      planned: true,
      attempted: true,
      failedReason: status === "failed" || status === "timed_out" ? (runQuotaBlocked ? "quota_blocked" : firstFailure || "nyt_no_successful_list_fetches") : undefined,
      emptyReason: status === "empty" ? "nyt_lists_returned_no_books" : undefined,
      timedOut: anyTimedOut,
      startedAt,
      finishedAt,
      elapsedMs: Date.parse(finishedAt) - Date.parse(startedAt),
      rawCount: rawItems.length,
      queries: plan.intents.map((intent) => intent.query),
      rawTitles: uniqueStrings(rawItems.map((item) => item.title), 40),
      firstReturnedTitles: uniqueStrings(rawItems.map((item) => item.title), 10),
      rawApiResultCount: allBooks.length,
      droppedBeforeDocCount: droppedCount,
      dropReasons,
      fetches,
      rawItemPreview: rawItems.slice(0, 15).map((item) => item as Record<string, unknown>),
      nytAdapterVersion: NYT_ADAPTER_VERSION,
      nytRequestedLists: requestedLists,
      nytReturnedLists: uniqueStrings(returnedLists, 12),
      nytBooksPerList: booksPerList,
      nytEndpointCalledByList: endpointCalledByList,
      nytHttpStatusByList: httpStatusByList,
      nytRawBookCount: allBooks.length,
      nytConvertedCount: rawItems.length,
      nytDroppedCount: droppedCount,
      nytDropReasons: dropReasons,
      nytTitlePresentCount: titlePresentCount,
      nytAuthorPresentCount: authorPresentCount,
      nytIsbnPresentCount: isbnPresentCount,
      nytNormalizedTitles: uniqueStrings(normalizedTitles, 80),
      nytQuotaBlocked: runQuotaBlocked || undefined,
      nytRetryAfterMs: runRetryAfterMs,
      nytCacheHitByList: cacheHitByList,
      nytUsedOverview: usedOverview || undefined,
    };

    return {
      source: "nyt",
      status,
      rawItems,
      diagnostics,
    };
  },
};
