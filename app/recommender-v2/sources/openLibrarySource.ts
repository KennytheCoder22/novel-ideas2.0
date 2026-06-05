import type { SourceAdapterV2, SourceDiagnosticV2, SourceFetchDiagnosticV2, SourcePlan, SourceResult, TasteProfile } from "../types";

const OPEN_LIBRARY_QUERY_LIMIT = 3;
const OPEN_LIBRARY_DOC_LIMIT = 10;
const OPEN_LIBRARY_MIN_CLEAN_DOCS = 6;
const OPEN_LIBRARY_DOCS_PER_QUERY = 8;
const OPEN_LIBRARY_DIAGNOSTIC_PROBE_QUERY = "fantasy";
const RESPONSE_BODY_PREFIX_LIMIT = 240;
const OPEN_LIBRARY_PER_QUERY_TIMEOUT_MS = 2_000;
const OPEN_LIBRARY_PROBE_TIMEOUT_MS = 1_500;

type OpenLibraryQueryPlan = {
  query: string;
  originalPlannedQuery: string;
  queryCascadeIndex: number;
  queryFamily: string;
  facets: string[];
  routingReason?: string;
};

const ABSTRACT_OPEN_LIBRARY_TERMS = new Set([
  "identity",
  "family",
  "friendship",
  "emotional",
  "growth",
  "emotional growth",
  "self discovery",
  "relationships",
  "belonging",
  "indie",
  "mshs",
  "teen",
  "teens",
]);

const MEDIA_FORMAT_TERMS = new Set(["anime", "game", "games", "gaming", "tv", "television", "movie", "movies", "film", "films"]);
const GENRE_QUERY_HINT = /\b(fantasy|romance|historical|history|mystery|thriller|horror|adventure|action|comedy|humor|science fiction|sci-fi|speculative|dystopian|paranormal|supernatural|western|sports|memoir|biography|realistic|contemporary|literary|drama|coming of age|graphic novel|manga|comic)\b/i;
const RELEVANCE_DRIFT_QUERY_HINT = /\b(classic|classics|shakespeare|twain|dickens|austen|wells|public domain|literary)\b/i;
const RELEVANCE_DRIFT_TITLE_HINT = /\b(complete works|selected works|collected works|works of|public domain)\b/i;
const ARTIFACT_QUERY_HINT = /\b(coloring|colouring|activity|activities|workbook|worksheet|lesson|classroom|teacher|writing|write)\b/i;
const ARTIFACT_TITLE_HINT = /\b(coloring|colouring|activity|activities|workbook|worksheet|lesson plan|lesson plans|classroom|teacher'?s? guide|study guide|kids write|writing prompts?|write!)\b/i;
const LITERARY_ANALYSIS_ARTIFACT_HINT = /\b(literary criticism|critical studies|critical study|criticism|analysis|analyses|case studies|essays on|companion to|guide to|teaching literature|about literature|consumption and identity|young adult fantasy fiction|fiction\s*-\s*history and criticism|history and criticism)\b/i;
const ADULT_LOW_TEEN_FIT_HINT = /\b(erotic|erotica|adult romance|new adult|college romance|college athletes?|seduction|sensual|dark lover|demoness|vixen|bret easton ellis|the informers|icebreaker)\b/i;

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

function dedupeOpenLibraryTerms(value: string): string {
  const protectedPhrases: [RegExp, string][] = [
    [/\bscience\s+fiction\b/g, "science-fiction"],
    [/\bgraphic\s+novel\b/g, "graphic-novel"],
    [/\bsci\s+fi\b/g, "sci-fi"],
  ];
  let protectedValue = value;
  for (const [pattern, replacement] of protectedPhrases) protectedValue = protectedValue.replace(pattern, replacement);
  const terms = protectedValue.split(/\s+/).filter(Boolean);
  return uniqueStrings(terms, 6).join(" ").replace(/science-fiction/g, "science fiction").replace(/graphic-novel/g, "graphic novel");
}

function finalOpenLibraryQueryDedupe(value: string): string {
  return dedupeOpenLibraryTerms(cleanOpenLibraryQueryPart(value));
}

function cleanOpenLibraryQueryPart(value: unknown): string {
  const normalized = String(value || "")
    .toLowerCase()
    .replace(/\b(indie\s+genre|mshs|middle\s+school\s+high\s+school|genre|genres|teen|teens|teenage|ya|young\s+adult|reader\s+discovery)\b/g, " ")
    .replace(/\b(identity|family|friendship|emotional\s+growth|emotional|growth|self\s+discovery|relationships?|belonging)\b/g, " ")
    .replace(/\b(anime|games?|gaming|tv|television|movies?|films?)\b/g, " ")
    .replace(/\b(book|books|story|stories|novel|novels)\b/g, " ")
    .replace(/[^a-z0-9\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return dedupeOpenLibraryTerms(normalized);
}

function isUsefulOpenLibraryQueryPart(value: string): boolean {
  if (!value) return false;
  if (value.length < 3) return false;
  if (/^(and|or|the|with|for|adult|kids|preteens|children)$/.test(value)) return false;
  if (ABSTRACT_OPEN_LIBRARY_TERMS.has(value)) return false;
  if (MEDIA_FORMAT_TERMS.has(value)) return false;
  return true;
}

function isGenreLikeOpenLibraryPart(value: string): boolean {
  return isUsefulOpenLibraryQueryPart(value) && GENRE_QUERY_HINT.test(value);
}

function queryFamilyForOpenLibraryQuery(query: string): string {
  const q = query.toLowerCase();
  if (/\b(contemporary|realistic|coming of age)\b/.test(q)) return "contemporary_drama";
  if (/\bfantasy|paranormal|supernatural\b/.test(q)) return "fantasy";
  if (/\bscience fiction|sci-fi|speculative|dystopian\b/.test(q)) return "speculative";
  if (/\bmystery|thriller|horror|suspense\b/.test(q)) return "mystery_thriller";
  if (/\badventure|action|survival\b/.test(q)) return "adventure";
  if (/\bdrama\b/.test(q)) return "contemporary_drama";
  if (/\bromance|historical\b/.test(q)) return "romance_historical";
  if (/\bcomedy|humor\b/.test(q)) return "comedy";
  if (/\bgraphic novel|manga|comic\b/.test(q)) return "graphic";
  return "open_library_broad";
}

function signalWeight(rows: { value: string; weight: number }[], pattern: RegExp): number {
  return rows.reduce((sum, row) => sum + (pattern.test(String(row.value || "").toLowerCase()) ? Math.abs(Number(row.weight || 0)) : 0), 0);
}

function combineOpenLibraryQueryParts(primary: string, modifier?: string): string {
  const parts = [primary, modifier || ""].map(cleanOpenLibraryQueryPart).filter(isUsefulOpenLibraryQueryPart);
  const uniqueParts = uniqueStrings(parts, 2);
  return finalOpenLibraryQueryDedupe(uniqueParts.join(" ").trim());
}

function buildOpenLibraryQueryPlans(plan: SourcePlan, profile: TasteProfile): OpenLibraryQueryPlan[] {
  const plannedIntents = plan.intents.length ? plan.intents : [{ query: OPEN_LIBRARY_DIAGNOSTIC_PROBE_QUERY, facets: [], id: "open-library-fallback", priority: 0, rationale: [] }];
  const originalPlannedQuery = finalOpenLibraryQueryDedupe(String(plannedIntents[0]?.query || ""));
  const genres = uniqueStrings(profile.genreFamily.map((row) => cleanOpenLibraryQueryPart(row.value)).filter(isGenreLikeOpenLibraryPart), 3);
  const plannedGenreFallbacks = uniqueStrings(plannedIntents
    .flatMap((intent) => [intent.query, ...(intent.facets || [])])
    .map(cleanOpenLibraryQueryPart)
    .filter(isGenreLikeOpenLibraryPart), 3);
  const genreTerms = uniqueStrings([...genres, ...plannedGenreFallbacks], 3);
  const fallbackTerms = uniqueStrings(plannedIntents
    .flatMap((intent) => [intent.query, ...(intent.facets || [])])
    .map(cleanOpenLibraryQueryPart)
    .filter(isUsefulOpenLibraryQueryPart)
    .map((query) => query.split(" ").filter(isUsefulOpenLibraryQueryPart).slice(0, 2).join(" "))
    .filter(isUsefulOpenLibraryQueryPart), 2);

  const profileText = [
    ...profile.genreFamily.map((row) => row.value),
    ...profile.themes.map((row) => row.value),
    originalPlannedQuery,
  ].join(" ").toLowerCase();
  const facetText = [...genreTerms, ...fallbackTerms, originalPlannedQuery].join(" ").toLowerCase();
  const hasFantasy = /\b(fantasy|paranormal|supernatural)\b/.test(facetText);
  const hasParanormal = /\b(paranormal|supernatural)\b/.test(facetText);
  const hasAdventure = /\b(adventure|action|survival)\b/.test(facetText);
  const hasAction = /\b(action)\b/.test(facetText);
  const hasComedy = /\b(comedy|humor)\b/.test(facetText);
  const hasDystopian = /\b(dystopian)\b/.test(facetText);
  const hasSciFi = /\b(science fiction|sci-fi|speculative)\b/.test(facetText);
  const hasSpeculative = hasDystopian || hasSciFi;
  const hasMystery = /\b(mystery|thriller|horror|suspense)\b/.test(facetText);
  const hasThriller = /\b(thriller|suspense)\b/.test(facetText);
  const hasStrongGenreSpecific = hasFantasy || hasAdventure || hasSpeculative || hasMystery || hasComedy;
  const contemporaryWeight = signalWeight([...profile.genreFamily, ...profile.themes], /\b(contemporary|realistic|coming of age)\b/);
  const speculativeWeight = signalWeight(profile.genreFamily, /\b(fantasy|adventure|action|survival|dystopian|science fiction|sci-fi|speculative|paranormal|supernatural|mystery|thriller|horror|suspense)\b/);
  const hasClearContemporarySignal = /\b(contemporary|realistic|coming of age)\b/.test(profileText);
  const wantsContemporaryDrama = hasClearContemporarySignal && (!hasStrongGenreSpecific || contemporaryWeight > speculativeWeight * 1.35);
  const genreSpecificQueries = [
    hasDystopian && hasMystery ? "dystopian mystery" : "",
    hasParanormal && hasMystery ? "paranormal mystery" : "",
    hasFantasy && hasMystery ? "fantasy mystery" : "",
    hasSciFi && hasThriller ? "sci-fi thriller" : "",
    hasAction && hasComedy && hasAdventure ? "action comedy adventure" : "",
    hasFantasy && hasDystopian ? "fantasy dystopian" : "",
    hasSpeculative && hasAdventure ? "dystopian adventure" : hasSpeculative ? "young adult dystopian" : "",
    hasFantasy && hasAdventure ? "fantasy adventure" : "",
    hasFantasy && /\bdrama\b/.test(facetText) ? "fantasy drama" : "",
    hasMystery && hasAdventure ? "mystery adventure" : "",
    hasMystery ? "mystery novel" : "",
    combineOpenLibraryQueryParts(genreTerms[0] || fallbackTerms[0] || "", genreTerms[1]),
    hasFantasy ? "young adult fantasy" : "",
    hasFantasy ? "fantasy" : "",
  ];
  const contemporaryQueries = [
    "young adult contemporary drama",
    "teen realistic fiction",
    "coming of age novel",
    combineOpenLibraryQueryParts(genreTerms[0] || fallbackTerms[0] || "", genreTerms[1]),
  ];
  const genericQueries = [
    combineOpenLibraryQueryParts(genreTerms[0] || fallbackTerms[0] || "", genreTerms[1]),
    combineOpenLibraryQueryParts(genreTerms[1] || "", genreTerms[2]),
    genreTerms[0] || fallbackTerms[0] || OPEN_LIBRARY_DIAGNOSTIC_PROBE_QUERY,
  ];
  const queryCandidates = hasStrongGenreSpecific
    ? [...genreSpecificQueries, ...(wantsContemporaryDrama ? contemporaryQueries : [])]
    : wantsContemporaryDrama
      ? contemporaryQueries
      : genericQueries;

  const preservedKnownGoodQueries = /^(young adult contemporary drama|teen realistic fiction|coming of age novel|young adult fantasy|young adult dystopian|mystery novel)$/;
  const preparedQueries = queryCandidates.map((query) => preservedKnownGoodQueries.test(query) ? query : finalOpenLibraryQueryDedupe(query));
  const uniqueQueries = uniqueStrings(preparedQueries.filter(isUsefulOpenLibraryQueryPart), OPEN_LIBRARY_QUERY_LIMIT);
  const specificQueryCount = uniqueQueries.filter((query) => !/^(young adult fantasy|fantasy|mystery novel)$/.test(query)).length;
  const broadFallbackUsed = uniqueQueries.some((query) => /^(young adult fantasy|fantasy|mystery novel)$/.test(query));
  const routingReason = wantsContemporaryDrama
    ? "contemporary_dominant"
    : hasStrongGenreSpecific
      ? broadFallbackUsed && specificQueryCount > 0
        ? "specific_facets_first_then_broad_fallback"
        : "specific_facets_preserved"
      : broadFallbackUsed
        ? "no_specific_mixed_facets_broad_fallback"
        : "generic_facets";
  return uniqueQueries.map((query, index) => ({
    query,
    originalPlannedQuery,
    queryCascadeIndex: index,
    queryFamily: queryFamilyForOpenLibraryQuery(query),
    facets: uniqueStrings([...(plannedIntents[index]?.facets || []), ...genreTerms].map(cleanOpenLibraryQueryPart).filter(isUsefulOpenLibraryQueryPart), 6),
    routingReason,
  }));
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

function normalizeOpenLibraryDoc(doc: any, queryPlan: OpenLibraryQueryPlan) {
  const query = queryPlan.query;
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
    originalPlannedQuery: queryPlan.originalPlannedQuery,
    simplifiedOpenLibraryQuery: query,
    queryCascadeIndex: queryPlan.queryCascadeIndex,
    queryFamily: queryPlan.queryFamily,
    facets: queryPlan.facets,
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

async function fetchOpenLibraryDocs(queryPlan: OpenLibraryQueryPlan, limit: number, signal?: AbortSignal, diagnosticOnly = false, timeoutMs = OPEN_LIBRARY_PER_QUERY_TIMEOUT_MS): Promise<{ docs: any[]; diagnostic: SourceFetchDiagnosticV2; responseBodyPrefix?: string }> {
  const query = queryPlan.query;
  const { url, fetchPath } = openLibraryRequest(query, limit);
  const fetchStartedAt = nowIso();
  const startedMs = Date.now();
  const diagnostic: SourceFetchDiagnosticV2 = {
    query,
    fetchStartedAt,
    timedOut: false,
    fetchPath,
    diagnosticOnly,
    originalPlannedQuery: queryPlan.originalPlannedQuery,
    queryCascadeIndex: queryPlan.queryCascadeIndex,
    queryFamily: queryPlan.queryFamily,
    facets: queryPlan.facets,
  };

  const queryController = new AbortController();
  const timeout = setTimeout(() => queryController.abort(), timeoutMs);
  const abortFromParent = () => queryController.abort();
  if (signal?.aborted) queryController.abort();
  else signal?.addEventListener("abort", abortFromParent, { once: true });

  try {
    const response = await fetch(url, { signal: queryController.signal });
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
      if (!Array.isArray(json?.docs)) {
        diagnostic.responseShape = "missing_docs_array";
        diagnostic.docsReturned = 0;
        diagnostic.responseBodyPrefix = bodyPrefix(text);
        diagnostic.failedReason = "openlibrary_unexpected_response_shape_missing_docs";
        return { docs: [], diagnostic, responseBodyPrefix: diagnostic.responseBodyPrefix };
      }
      const docs = json.docs;
      diagnostic.responseShape = "docs_array";
      diagnostic.docsReturned = docs.length;
      diagnostic.firstReturnedTitles = uniqueStrings(docs.map((doc: any) => doc?.title), 5);
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
    diagnostic.timedOut = Boolean(queryController.signal.aborted || signal?.aborted || /aborted|abort|timeout/i.test(message));
    diagnostic.failedReason = message;
    return { docs: [], diagnostic };
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener("abort", abortFromParent);
  }
}

function openLibraryEmptyReason(rawItems: unknown[], rawApiResultCount: number, dropReasons: Record<string, number>, fetches: SourceFetchDiagnosticV2[], failedReason: string): string | undefined {
  if (rawItems.length > 0) return undefined;
  const mainFetch = fetches.find((fetch) => !fetch.diagnosticOnly);
  const droppedBeforeDocCount = Object.values(dropReasons).reduce((sum, count) => sum + count, 0);
  if (!mainFetch) return "openlibrary_no_main_fetch_diagnostic";
  if (mainFetch.timedOut) return "openlibrary_main_fetch_timed_out";
  if (mainFetch.responseShape === "missing_docs_array") return "openlibrary_unexpected_response_shape";
  if (Number(mainFetch.docsReturned || 0) === 0) return "openlibrary_returned_zero_docs";
  if (rawApiResultCount > 0 && droppedBeforeDocCount >= rawApiResultCount) return "openlibrary_docs_dropped_before_normalization";
  if (rawApiResultCount > 0 && droppedBeforeDocCount > 0) return "openlibrary_docs_partially_dropped_before_normalization";
  if (failedReason) return `openlibrary_failed_before_normalized_rows:${failedReason}`;
  return "openlibrary_no_normalized_rows_after_fetch";
}

function isEnglishOpenLibraryDoc(doc: any): boolean {
  const languages = Array.isArray(doc?.language) ? doc.language.map((value: any) => String(value || "").toLowerCase()) : [];
  return languages.length === 0 || languages.includes("eng") || languages.includes("en");
}

function isRelevanceDriftOpenLibraryDoc(doc: any, query: string): boolean {
  if (RELEVANCE_DRIFT_QUERY_HINT.test(query)) return false;
  const title = String(doc?.title || "");
  const subjects = [
    ...(Array.isArray(doc?.subject) ? doc.subject : []),
    ...(Array.isArray(doc?.subject_facet) ? doc.subject_facet : []),
  ].join(" ");
  const firstPublishYear = Number(doc?.first_publish_year || 0);
  if (RELEVANCE_DRIFT_TITLE_HINT.test(`${title} ${subjects}`)) return true;
  return Boolean(firstPublishYear > 0 && firstPublishYear < 1900 && !/\bclassic|historical|history|literary\b/i.test(query) && !GENRE_QUERY_HINT.test(`${title} ${subjects}`));
}

function openLibraryDocText(doc: any): string {
  return [
    String(doc?.title || ""),
    String(doc?.subtitle || ""),
    Array.isArray(doc?.author_name) ? doc.author_name.join(" ") : "",
    ...(Array.isArray(doc?.subject) ? doc.subject : []),
    ...(Array.isArray(doc?.subject_facet) ? doc.subject_facet : []),
  ].join(" ");
}

function isOpenLibraryArtifactDoc(doc: any, query: string): boolean {
  if (ARTIFACT_QUERY_HINT.test(query)) return false;
  return ARTIFACT_TITLE_HINT.test(openLibraryDocText(doc));
}

function isLiteraryAnalysisArtifactDoc(doc: any, query: string): boolean {
  if (/\b(criticism|critical|analysis|study guide|literary study)\b/i.test(query)) return false;
  return LITERARY_ANALYSIS_ARTIFACT_HINT.test(openLibraryDocText(doc));
}

function openLibrarySeriesKey(doc: any): string {
  const title = String(doc?.title || "").toLowerCase();
  const cleaned = title
    .replace(/\b(volume|vol|book|chapter|episode|part)\s*[:.#-]?\s*\d+\b/g, " ")
    .replace(/\b(one piece|naruto|bleach|dragon ball|my hero academia|attack on titan|demon slayer|sailor moon)\b.*$/i, "$1")
    .replace(/\b\d+\b/g, " ")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return /\b(one piece|naruto|bleach|dragon ball|my hero academia|attack on titan|demon slayer|sailor moon)\b/.test(cleaned) ? cleaned : "";
}

function isTeenInappropriateOpenLibraryDoc(doc: any, profile: TasteProfile): boolean {
  if (profile.ageBand !== "teens") return false;
  const text = openLibraryDocText(doc).toLowerCase();
  if (/\b(lolita|nabokov|erotic|erotica|sexual abuse|incest|pornography)\b/.test(text)) return true;
  if (/\bnovels?\s+\d{4}\s*-\s*\d{4}\b/.test(text) && /\b(lolita|nabokov)\b/.test(text)) return true;
  if (ADULT_LOW_TEEN_FIT_HINT.test(text) && !/\b(young adult|juvenile|teen|adolescent)\b/.test(text)) return true;
  return false;
}

function isOmnibusBundleDriftOpenLibraryDoc(doc: any, query: string, profile: TasteProfile): boolean {
  if (profile.ageBand !== "teens") return false;
  if (/\bomnibus|collected|complete|screenplay|selected works|collection\b/i.test(query)) return false;
  const title = String(doc?.title || "");
  return /\b(omnibus|collected novels|complete novels|novels?\s+\d{4}\s*-\s*\d{4}|screenplay)\b/i.test(title);
}

function isTeenCompatibleOpenLibraryDoc(doc: any, profile: TasteProfile): boolean {
  if (profile.ageBand !== "teens") return true;
  const firstPublishYear = Number(doc?.first_publish_year || 0);
  if (!firstPublishYear || firstPublishYear >= 1950) return true;
  const subjects = [
    ...(Array.isArray(doc?.subject) ? doc.subject : []),
    ...(Array.isArray(doc?.subject_facet) ? doc.subject_facet : []),
  ].join(" ").toLowerCase();
  return /young adult|juvenile|teen|adolescent/.test(subjects);
}

function shouldKeepOpenLibraryDoc(doc: any, query: string, profile: TasteProfile): { keep: boolean; reason?: string } {
  if (!isEnglishOpenLibraryDoc(doc)) return { keep: false, reason: "non_english" };
  if (!Array.isArray(doc?.author_name) || doc.author_name.length === 0) return { keep: false, reason: "missing_author" };
  if (isRelevanceDriftOpenLibraryDoc(doc, query)) return { keep: false, reason: "relevance_drift" };
  if (isOpenLibraryArtifactDoc(doc, query)) return { keep: false, reason: "artifact_title" };
  if (isLiteraryAnalysisArtifactDoc(doc, query)) return { keep: false, reason: "literary_analysis_artifact" };
  if (isTeenInappropriateOpenLibraryDoc(doc, profile)) return { keep: false, reason: "teen_inappropriate_content" };
  if (isOmnibusBundleDriftOpenLibraryDoc(doc, query, profile)) return { keep: false, reason: "adult_literary_content" };
  if (!isTeenCompatibleOpenLibraryDoc(doc, profile)) return { keep: false, reason: "not_teen_compatible_publication_year" };
  return { keep: true };
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

    const queryPlans = buildOpenLibraryQueryPlans(plan, context.profile);
    const queries = queryPlans.map((queryPlan) => queryPlan.query);
    const openLibraryQueryRouting = {
      reason: queryPlans[0]?.routingReason || "unknown",
      broadFallbackQueries: queries.filter((query) => /^(young adult fantasy|fantasy|mystery novel)$/i.test(query)),
      specificQueries: queries.filter((query) => !/^(young adult fantasy|fantasy|mystery novel)$/i.test(query)),
      originalPlannedQuery: queryPlans[0]?.originalPlannedQuery || "",
    };
    if (!queryPlans.length) {
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
    const acceptedSeriesKeys = new Set<string>();
    const acceptedDocKeys = new Set<string>();
    const artifactSuppressedTitles: string[] = [];
    const seriesSuppressedTitles: string[] = [];
    let rawApiResultCount = 0;
    let failedReason = "";
    let openLibraryTopUpRan = false;

    for (const queryPlan of queryPlans) {
      const query = queryPlan.query;
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
            openLibraryProbeRan: fetches.some((fetch) => fetch.diagnosticOnly),
            openLibraryQueryRouting,
            fetches,
          }),
        };
      }

      const { docs, diagnostic } = await fetchOpenLibraryDocs(queryPlan, OPEN_LIBRARY_DOCS_PER_QUERY, context.signal);
      fetches.push(diagnostic);
      if (diagnostic.timedOut) {
        dropReasons.query_timeout = Number(dropReasons.query_timeout || 0) + 1;
        failedReason = diagnostic.failedReason || "openlibrary_fetch_timed_out";
        if (context.signal?.aborted) break;
        continue;
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
        const quality = shouldKeepOpenLibraryDoc(doc, query, context.profile);
        if (!quality.keep) {
          const reason = quality.reason || "quality_filter";
          dropReasons[reason] = Number(dropReasons[reason] || 0) + 1;
          if (reason === "artifact_title" || reason === "literary_analysis_artifact" || reason === "teen_inappropriate_content") artifactSuppressedTitles.push(title);
          continue;
        }
        const docKey = String(doc?.key || doc?.cover_edition_key || doc?.edition_key?.[0] || `${title}:${Array.isArray(doc?.author_name) ? doc.author_name[0] : ""}`).toLowerCase();
        if (acceptedDocKeys.has(docKey)) {
          dropReasons.duplicate_doc = Number(dropReasons.duplicate_doc || 0) + 1;
          continue;
        }
        const seriesKey = openLibrarySeriesKey(doc);
        if (seriesKey && acceptedSeriesKeys.has(seriesKey)) {
          dropReasons.series_duplicate = Number(dropReasons.series_duplicate || 0) + 1;
          seriesSuppressedTitles.push(title);
          continue;
        }
        if (seriesKey) acceptedSeriesKeys.add(seriesKey);
        acceptedDocKeys.add(docKey);
        rawItems.push(normalizeOpenLibraryDoc(doc, queryPlan));
        if (rawItems.length >= OPEN_LIBRARY_DOC_LIMIT) break;
      }
      if (rawItems.length >= OPEN_LIBRARY_MIN_CLEAN_DOCS || rawItems.length >= OPEN_LIBRARY_DOC_LIMIT) break;
      if (rawItems.length > 0) openLibraryTopUpRan = true;
    }

    if (!rawItems.length && !context.signal?.aborted) {
      const probeQuery = queries.some((query) => /\byoung adult fantasy\b/i.test(query)) ? OPEN_LIBRARY_DIAGNOSTIC_PROBE_QUERY : queries.some((query) => /\b(mystery|thriller|suspense)\b/i.test(query)) ? "mystery novel" : "young adult fantasy";
      const { diagnostic } = await fetchOpenLibraryDocs({ query: probeQuery, originalPlannedQuery: queries[0] || "", queryCascadeIndex: queryPlans.length, queryFamily: "diagnostic_probe", facets: [] }, 1, context.signal, true, OPEN_LIBRARY_PROBE_TIMEOUT_MS);
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
          emptyReason: openLibraryEmptyReason(rawItems, rawApiResultCount, dropReasons, fetches, failedReason || "openlibrary_aborted_after_query_complete"),
          openLibraryProbeRan: fetches.some((fetch) => fetch.diagnosticOnly),
          rawApiResultCount,
          droppedBeforeDocCount: Object.values(dropReasons).reduce((sum, count) => sum + count, 0),
          dropReasons,
          openLibraryTopUpRan,
          openLibraryTopUpTarget: OPEN_LIBRARY_MIN_CLEAN_DOCS,
          openLibraryFallbackQueriesExhausted: rawItems.length < OPEN_LIBRARY_MIN_CLEAN_DOCS && fetches.filter((fetch) => !fetch.diagnosticOnly).length >= queryPlans.length,
          usableRowsAfterFiltering: rawItems.length,
          openLibraryQueryRouting,
          fetches,
        }),
      };
    }

    const finishedAt = nowIso();
    const mainFetches = fetches.filter((fetch) => !fetch.diagnosticOnly);
    const allMainFetchesTimedOut = mainFetches.length > 0 && mainFetches.every((fetch) => fetch.timedOut);
    const status: SourceResult["status"] = rawItems.length ? "succeeded" : allMainFetchesTimedOut ? "timed_out" : failedReason ? "failed" : "empty";
    const emptyReason = !rawItems.length && (status === "empty" || status === "failed" || status === "timed_out") ? openLibraryEmptyReason(rawItems, rawApiResultCount, dropReasons, fetches, failedReason) : undefined;
    return {
      source: "openLibrary",
      status,
      rawItems,
      diagnostics: {
        source: "openLibrary",
        status,
        planned: true,
        attempted: true,
        timedOut: status === "timed_out",
        startedAt,
        finishedAt,
        elapsedMs: Date.parse(finishedAt) - Date.parse(startedAt),
        rawCount: rawItems.length,
        normalizedCount: rawItems.length,
        queries,
        rawTitles: uniqueStrings(rawTitles, 10),
        firstReturnedTitles: uniqueStrings(rawItems.map((item: any) => item?.title), 5),
        failedReason: rawItems.length ? undefined : failedReason || undefined,
        emptyReason,
        openLibraryProbeRan: fetches.some((fetch) => fetch.diagnosticOnly),
        rawApiResultCount,
        droppedBeforeDocCount: Object.values(dropReasons).reduce((sum, count) => sum + count, 0),
        dropReasons,
        openLibraryTopUpRan,
        openLibraryTopUpTarget: OPEN_LIBRARY_MIN_CLEAN_DOCS,
        openLibraryFallbackQueriesExhausted: rawItems.length < OPEN_LIBRARY_MIN_CLEAN_DOCS && mainFetches.length >= queryPlans.length,
        usableRowsAfterFiltering: rawItems.length,
        openLibraryQueryRouting,
        artifactSuppressedTitles: uniqueStrings(artifactSuppressedTitles, 20),
        seriesSuppressedTitles: uniqueStrings(seriesSuppressedTitles, 20),
        rawItemPreview: rawItems.slice(0, 12).map((item: any) => ({ title: item?.title, authors: item?.authors || item?.author_name || item?.creators, source: item?.source, queryText: item?.queryText, originalPlannedQuery: item?.originalPlannedQuery, simplifiedOpenLibraryQuery: item?.simplifiedOpenLibraryQuery, queryCascadeIndex: item?.queryCascadeIndex, queryFamily: item?.queryFamily, facets: item?.facets, first_publish_year: item?.first_publish_year })),
        fetches,
      },
    };
  },
};
