// /screens/recommenders/gcd/gcdGraphicNovelRecommender.ts
//
// Grand Comics Database recommender (20Q-aligned).
// Teen-only auxiliary engine for comics / graphic novel sessions.
// Thin fetcher only: literal signal gating, literal query translation,
// no hardcoded fallback inventory, no manual reranking, no hidden shaping.

import type { RecommenderInput, RecommendationResult, RecommendationDoc } from "../types";
import type { TagCounts } from "../../swipe/openLibraryFromTags";

const GCD_BASE = "https://www.comics.org";
const GCD_PROXY_URL = String(process.env.EXPO_PUBLIC_GCD_PROXY_URL || "").trim();
const COMIC_VINE_PROXY_URL_RAW = String(process.env.EXPO_PUBLIC_COMICVINE_PROXY_URL ?? "").trim();
const COMIC_VINE_PROXY_URL =
  COMIC_VINE_PROXY_URL_RAW && COMIC_VINE_PROXY_URL_RAW !== "undefined" && COMIC_VINE_PROXY_URL_RAW !== "null"
    ? COMIC_VINE_PROXY_URL_RAW
    : "/api/comicvine";
let hasLoggedProbeProxyUrl = false;

function buildProxyUrl(targetUrl: string): string {
  if (!GCD_PROXY_URL) throw new Error("GCD_PROXY_MISSING: EXPO_PUBLIC_GCD_PROXY_URL is not configured.");
  if (GCD_PROXY_URL.includes("{url}")) return GCD_PROXY_URL.replace("{url}", encodeURIComponent(targetUrl));
  if (GCD_PROXY_URL.endsWith("?") || GCD_PROXY_URL.endsWith("=")) return `${GCD_PROXY_URL}${encodeURIComponent(targetUrl)}`;
  if (GCD_PROXY_URL.includes("?")) return `${GCD_PROXY_URL}&url=${encodeURIComponent(targetUrl)}`;
  return `${GCD_PROXY_URL}?url=${encodeURIComponent(targetUrl)}`;
}

function normalizeText(value: any): string {
  return String(value || "")
    .toLowerCase()
    .replace(/[_\-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}


function cleanComicVineSeedQuery(raw: string): { cleaned: string; positiveQueries: string[]; queryTooLong: boolean; excludedTermsAppliedInFilterOnly: boolean } {
  const tokens = String(raw || "").toLowerCase().split(/\s+/).filter(Boolean);
  const excluded = new Set(["true","crime","cozy","humorous","spy","conspiracy","writers","writer","writing","guide","reference","bibliography","analysis","criticism","review","summary","workbook","anthology"]);
  const positive: string[] = [];
  for (const t of tokens) {
    if (t.startsWith("-")) continue;
    const c = t.replace(/[^a-z0-9]/g, "");
    if (!c || excluded.has(c)) continue;
    positive.push(c);
  }
  const deduped = Array.from(new Set(positive));
  const concise = deduped.slice(0, 6).join(" ").trim();
  const queryTooLong = tokens.length > 12 || String(raw || "").length > 90;
  const cleaned = concise;
  const positiveQueries = Array.from(new Set([
    cleaned && `${cleaned} graphic novel`,
    cleaned && `${cleaned} comic`,
    cleaned && `${cleaned}`,
  ].filter(Boolean) as string[]))
    .map((q) => String(q || "").replace(/graphic novel\s+graphic novel/gi, "graphic novel").trim())
    .filter((q) => !/^teen\s+graphic\s+novel\s+graphic\s+novel$/i.test(q));
  return { cleaned, positiveQueries, queryTooLong, excludedTermsAppliedInFilterOnly: true };
}

function computeQuerySpecificityScore(query: string): number {
  const q = normalizeText(query);
  const tokens = q.split(/\s+/).filter(Boolean);
  const generic = new Set(["graphic", "novel", "comic", "comics", "dark", "horror", "mystery", "fantasy", "thriller", "teen"]);
  const specificTokens = tokens.filter((t) => !generic.has(t) && t.length > 3).length;
  return specificTokens * 2 + Math.min(tokens.length, 6) - tokens.filter((t) => generic.has(t)).length;
}

function isGenericComicVineQuery(query: string): boolean {
  const q = normalizeText(query);
  const tokens = q.split(/\s+/).filter(Boolean);
  const allGeneric = tokens.length > 0 && tokens.every((t) => /^(graphic|novel|comic|comics|dark|horror|mystery|fantasy|thriller|teen|survival)$/.test(t));
  const lexicalSludge = /\b(setting|stakes|identity|under pressure|story of|novel graphic novel)\b/.test(q);
  const survivalGeneric = /\bsurvival comics? graphic novel\b/.test(q);
  const descriptorOnly = tokens.filter((t) => /^(mystery|horror|thriller|comic|comics|graphic|novel|fiction|dark|police|procedural)$/.test(t)).length >= Math.max(2, tokens.length - 1);
  return allGeneric || lexicalSludge || survivalGeneric || descriptorOnly || computeQuerySpecificityScore(q) <= 1;
}

function ensureQueryDiagnostic(row: any, fallbackQuery = "") {
  return {
    query: String(row?.query || fallbackQuery || "").trim(),
    queryGeneratedFrom: String(row?.queryGeneratedFrom || "unknown"),
    queryFamily: String(row?.queryFamily || "unknown"),
    querySpecificityScore: Number(row?.querySpecificityScore || 0),
    queryWasGeneric: Boolean(row?.queryWasGeneric ?? false),
    querySuppressedReason: String(row?.querySuppressedReason || "missing_diagnostic_record"),
  };
}
function safeNumber(value: any, fallback = 0): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function getDirectGraphicSignalWeight(tagCounts: TagCounts | undefined): number {
  return (
    Number(tagCounts?.["format:graphic_novel"] || 0) +
    Number(tagCounts?.["format:graphic novel"] || 0) +
    Number(tagCounts?.["format:comic"] || 0) +
    Number(tagCounts?.["format:comics"] || 0) +
    Number(tagCounts?.["topic:comics"] || 0) +
    Number(tagCounts?.["topic:graphic novels"] || 0) +
    Number(tagCounts?.["topic:graphic novel"] || 0)
  );
}

function hasTeenGraphicIntent(tagCounts: TagCounts | undefined): boolean {
  return getDirectGraphicSignalWeight(tagCounts) > 0;
}

function buildGcdSearchTerms(tagCounts: TagCounts | undefined): string[] {
  const anchors: string[] = [];
  const isDark = hasFacet(tagCounts, /horror|dark|haunted|terror|ghost|occult/);
  const isMystery = hasFacet(tagCounts, /mystery|crime|detective|noir|investigation/);
  const isSurvival = hasFacet(tagCounts, /survival|post apocalyptic|apocalypse|wilderness/);
  const isSupernatural = hasFacet(tagCounts, /supernatural|paranormal|magic|myth|monster|vampire/);
  const isTeen = hasFacet(tagCounts, /teen|young adult|school|coming of age/);
  const isManga = hasFacet(tagCounts, /manga|anime|japan/);

  const batmanEvidence = hasFacet(tagCounts, /batman|gotham|dc comics|bruce wayne/);
  const hellboyEvidence = hasFacet(tagCounts, /hellboy|mignola|b\.p\.r\.d|bprd/);
  const walkingDeadEvidence = hasFacet(tagCounts, /walking dead|zombie apocalypse|undead survival/);
  if (isDark && isTeen && batmanEvidence) anchors.push("batman");
  if (isDark && !isTeen && hellboyEvidence) anchors.push("hellboy");
  if (isMystery && batmanEvidence) anchors.push("batman");
  if (isSurvival && walkingDeadEvidence) anchors.push("walking dead");
  if (isSupernatural && hellboyEvidence) anchors.push("hellboy");
  if (isManga) anchors.push("naruto");
  if (isTeen && hasFacet(tagCounts, /ms\. marvel|kamala khan/)) anchors.push("ms. marvel");
  if (hasTeenGraphicIntent(tagCounts) && hasFacet(tagCounts, /spider[- ]?man|peter parker|miles morales/)) anchors.push("spider-man");
  return Array.from(new Set(anchors)).slice(0, 10);
}

function hasFacet(tagCounts: TagCounts | undefined, re: RegExp): boolean {
  return Object.entries(tagCounts || {}).some(([k, v]) => Number(v) > 0 && re.test(normalizeText(k)));
}

function buildComicQueriesFromFacets(tagCounts: TagCounts | undefined): string[] {
  const queries: string[] = [];
  const explicitHellboyEvidence = hasFacet(tagCounts, /hellboy|mignola|b\.p\.r\.d|bprd/);
  if (hasFacet(tagCounts, /horror|dark|haunted|terror|ghost|occult/) && explicitHellboyEvidence) queries.push("hellboy");
  if (hasFacet(tagCounts, /mystery|crime|detective|noir|investigation/)) queries.push("batman");
  if (hasFacet(tagCounts, /survival|post apocalyptic|apocalypse|wilderness/)) queries.push("walking dead");
  if (hasFacet(tagCounts, /dystopian|future|rebellion|authoritarian/)) queries.push("saga");
  if (hasFacet(tagCounts, /teen|young adult|school|coming of age/)) queries.push("ms. marvel", "spider-man");
  if (hasFacet(tagCounts, /supernatural|paranormal|magic|myth|monster|vampire/) && explicitHellboyEvidence) queries.push("hellboy");
  if (hasFacet(tagCounts, /manga|anime|japan/)) queries.push("naruto");
  return Array.from(new Set(queries.map((q) => normalizeText(q)).filter(Boolean))).slice(0, 8);
}

function buildComicVineRungs(queries: string[]): Array<{ rung: number; query: string; audience: string; themes: string[] }> {
  return queries.map((query, i) => ({
    rung: i,
    query,
    audience: "teen comics",
    themes: query.split(" ").filter(Boolean).slice(0, 6),
  }));
}

async function fetchTextWithTimeout(url: string, timeoutMs: number): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const resp = await fetch(buildProxyUrl(url), {
      signal: controller.signal,
      headers: {
        Accept: "text/html,application/json;q=0.9,*/*;q=0.8",
      },
    });
    if (!resp.ok) throw new Error(`GCD error: ${resp.status}`);
    return await resp.text();
  } finally {
    clearTimeout(timer);
  }
}

async function fetchJsonWithTimeout(url: string, timeoutMs: number): Promise<any> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const resp = await fetch(buildProxyUrl(url), {
      signal: controller.signal,
      headers: {
        Accept: "application/json",
      },
    });
    if (!resp.ok) throw new Error(`GCD error: ${resp.status}`);
    return await resp.json();
  } finally {
    clearTimeout(timer);
  }
}

function extractIssueApiUrls(html: string, limit: number): string[] {
  const directApiMatches = Array.from(
    String(html || "").matchAll(/https:\/\/www\.comics\.org\/api\/issue\/\d+\/\?format=json/g)
  ).map((m) => m[0]);
  const issuePathMatches = Array.from(
    String(html || "").matchAll(/\/issue\/(\d+)\/?/g)
  ).map((m) => `https://www.comics.org/api/issue/${m[1]}/?format=json`);
  const matches = [...directApiMatches, ...issuePathMatches];

  const unique: string[] = [];
  const seen = new Set<string>();
  for (const match of matches) {
    if (seen.has(match)) continue;
    seen.add(match);
    unique.push(match);
    if (unique.length >= limit) break;
  }
  return unique;
}

function parseYear(value: any): number | undefined {
  const raw = String(value || "");
  const match = raw.match(/(18|19|20)\d{2}/);
  return match ? Number(match[0]) : undefined;
}

function gcdIssueToDoc(issue: any, queryText: string, queryRung: number): RecommendationDoc | null {
  const title = String(issue?.series_name || issue?.title || issue?.descriptor || "").trim();
  if (!title) return null;
  const descriptor = String(issue?.descriptor || "").trim();
  const spamIssueRun = /#\d{1,4}$/.test(title) || /issue\s+#?\d{1,4}$/i.test(title);
  const bareGeneric = /^(a )?graphic novel$/i.test(title) || /^graphic novel\s*#?\d*$/i.test(title);
  const weakCollectedEdition = !/\b(vol\.?|volume|omnibus|tpb|trade paperback|book \d+)\b/i.test(`${title} ${descriptor}`);
  if ((spamIssueRun || bareGeneric) && weakCollectedEdition) return null;

  const storySet = Array.isArray(issue?.story_set) ? issue.story_set : [];
  const storyGenres = storySet
    .map((story: any) => String(story?.genre || "").trim())
    .filter(Boolean);
  const storyFeatures = storySet
    .map((story: any) => String(story?.feature || "").trim())
    .filter(Boolean);
  const characters = storySet
    .flatMap((story: any) => String(story?.characters || "").split(/;|,/))
    .map((v: any) => String(v || "").trim())
    .filter(Boolean);

  const subjects = Array.from(
    new Set([
      "graphic novel",
      "comics",
      ...storyGenres,
      ...storyFeatures,
      ...characters,
      String(issue?.keywords || "").trim(),
      String(issue?.indicia_publisher || "").trim(),
    ].filter(Boolean))
  );

  return {
    key: issue?.api_url || `comicvine:${issue?.series || issue?.series_name || title}`,
    title,
    author_name: storyFeatures.length ? [storyFeatures[0]] : ["Grand Comics Database"],
    first_publish_year: parseYear(issue?.key_date || issue?.publication_date),
    cover_i: issue?.cover,
    subject: subjects,
    edition_count: safeNumber(issue?.page_count, 0) > 0 ? 1 : 0,
    publisher: issue?.indicia_publisher || issue?.brand_emblem || "Grand Comics Database",
    language: undefined,
    source: "comicVine",
    queryRung,
    queryText,
    subtitle: String(issue?.descriptor || "").trim() || undefined,
    description: String(issue?.notes || "").trim() || undefined,
    averageRating: 0,
    ratingsCount: 0,
    pageCount: safeNumber(issue?.page_count, 0),
    volumeInfo: {
      categories: subjects,
      imageLinks: {
        thumbnail: issue?.cover,
      },
    },
  } as any;
}

function comicVineIssueToDoc(issue: any, queryText: string, queryRung: number): RecommendationDoc | null {
  const volumeName = String(issue?.volume?.name || "").trim();
  const issueName = String(issue?.name || "").trim();
  const issueNumber = String(issue?.issue_number || "").trim();
  const title = issueName || (volumeName && issueNumber ? `${volumeName} #${issueNumber}` : volumeName);
  if (!title) return null;
  const subjects = Array.from(new Set(["graphic novel", "comics", volumeName].filter(Boolean)));
  return {
    key: `comicvine:comicvine:${issue?.id || issue?.api_detail_url || title}`,
    title,
    author_name: [String(issue?.person_credits?.[0]?.name || "ComicVine")],
    first_publish_year: parseYear(issue?.cover_date || issue?.store_date),
    cover_i: issue?.image?.small_url || issue?.image?.thumb_url,
    subject: subjects,
    edition_count: 1,
    publisher: String(issue?.volume?.publisher?.name || "ComicVine"),
    source: "comicVine",
    queryRung,
    queryText,
    subtitle: String(issue?.deck || "").trim() || undefined,
    description: String(issue?.description || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim() || undefined,
    averageRating: 0,
    ratingsCount: 0,
    pageCount: safeNumber(issue?.page_count, 0),
    volumeInfo: {
      categories: subjects,
      imageLinks: { thumbnail: issue?.image?.small_url || issue?.image?.thumb_url },
    },
  } as any;
}

function buildComicVineProxySearchUrl(query: string, limit = 20): string {
  if (!COMIC_VINE_PROXY_URL) throw new Error("COMICVINE_PROXY_MISSING: EXPO_PUBLIC_COMICVINE_PROXY_URL is not configured.");
  const normalizedBase = COMIC_VINE_PROXY_URL.includes("?") ? COMIC_VINE_PROXY_URL : `${COMIC_VINE_PROXY_URL}?`;
  const separator = normalizedBase.endsWith("?") || normalizedBase.endsWith("&") ? "" : "&";
  return `${normalizedBase}${separator}q=${encodeURIComponent(query)}&limit=${encodeURIComponent(String(limit))}`;
}

function buildSearchUrl(query: string): string {
  const encoded = encodeURIComponent(query);
  return `${GCD_BASE}/search/advanced/process/?target=issue&method=icontains&logic=False&title=${encoded}`;
}

function buildSearchUrls(query: string): string[] {
  const encoded = encodeURIComponent(query);
  return [
    buildSearchUrl(query),
    `${GCD_BASE}/search/quick/?q=${encoded}`,
  ];
}

function rawIssueRejectReason(issue: any): string | null {
  const title = String(issue?.name || issue?.volume?.name || "").trim();
  const description = String(issue?.description || issue?.deck || "").replace(/<[^>]+>/g, " ").trim();
  const pageCount = safeNumber(issue?.page_count, 0);
  const ratingsCount = safeNumber(issue?.ratingsCount, 0);
  if (!description) return "empty_description";
  if (pageCount === 0 && ratingsCount === 0) return "no_pages_no_ratings";
  if (/^(tpb|ogn|gn|graphic novel|part \d+|book [a-z0-9]+)/i.test(title)) return "metadata_shell_title";
  if (/#\d{1,4}$/.test(title) && description.length < 80) return "issue_fragment_no_narrative";
  if (/\b(translated|edition|edición|édition)\b/i.test(title) && description.length < 80) return "translated_shell_no_narrative";
  return null;
}

async function fetchDocsForQuery(query: string, queryRung: number, timeoutMs: number, fetchLimit: number, docs: RecommendationDoc[], seen: Set<string>, rawDiag: any) {
  if (!rawDiag || typeof rawDiag !== "object") {
    throw new Error("COMICVINE_ADAPTER_DIAGNOSTICS_UNINITIALIZED: rawDiag must be initialized before fetch.");
  }
  rawDiag.diagnosticsInitialized = true;
  rawDiag.rawNormalizationStarted = true;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    console.log("COMICVINE_PROXY_FETCH_START", { query, queryRung });
    const resp = await fetch(buildComicVineProxySearchUrl(query, 20), { signal: controller.signal, headers: { Accept: "application/json" } });
    console.log("COMICVINE_PROXY_FETCH_RESPONSE", { query, status: resp.status, ok: resp.ok });
    if (!resp.ok) throw new Error(`ComicVine error: ${resp.status}`);
    const payload = await resp.json();
    console.log("COMICVINE_PROXY_PARSE_COMPLETE", {
      query,
      payloadKeys: payload && typeof payload === "object" ? Object.keys(payload) : [],
      resultsLength: Array.isArray(payload?.results) ? payload.results.length : 0,
      firstResultTitle: Array.isArray(payload?.results) && payload.results[0] ? String(payload.results[0]?.name || payload.results[0]?.volume?.name || "") : "",
    });
    const results = Array.isArray(payload?.results) ? payload.results : [];
    console.log("COMICVINE_RAW_RESULT_COUNT", { query, rawCount: results.length });
    const before = docs.length;
    for (const issue of results) {
      const rejectReason = rawIssueRejectReason(issue);
      if (rejectReason) {
        rawDiag.rawRejectedBeforeNormalizationCount = Number(rawDiag.rawRejectedBeforeNormalizationCount || 0) + 1;
        rawDiag.preNormalizationRejectCount = Number(rawDiag.preNormalizationRejectCount || 0) + 1;
        rawDiag.rawRejectedBeforeNormalizationReasons[rejectReason] = (rawDiag.rawRejectedBeforeNormalizationReasons[rejectReason] || 0) + 1;
        if (rejectReason === "metadata_shell_title") rawDiag.rawMetadataShellCount = Number(rawDiag.rawMetadataShellCount || 0) + 1;
        if (rejectReason === "issue_fragment_no_narrative") rawDiag.rawIssueFragmentCount = Number(rawDiag.rawIssueFragmentCount || 0) + 1;
        continue;
      }
      const doc = comicVineIssueToDoc(issue, query, queryRung);
      if (!doc?.title) continue;
      const dedupeKey = String(doc.key || `${doc.title}|${doc.author_name?.[0] || ""}`).toLowerCase();
      if (seen.has(dedupeKey)) continue;
      seen.add(dedupeKey);
      docs.push(doc);
      rawDiag.rawNarrativeQualifiedCount = Number(rawDiag.rawNarrativeQualifiedCount || 0) + 1;
      if (docs.length >= fetchLimit) break;
    }
    rawDiag.rawNormalizationCompleted = true;
    console.log("COMICVINE_NORMALIZATION_COMPLETE", { query, added: Math.max(0, docs.length - before), totalDocs: docs.length });
    return { rawCount: Math.max(0, docs.length - before), error: null };
  } catch (err: any) {
    rawDiag.rawNormalizationCompleted = true;
    return { rawCount: 0, error: String(err?.message || err || "comicvine_search_failed") };
  } finally {
    clearTimeout(timer);
  }
}

async function runGcdAdapterPreflight(timeoutMs: number): Promise<{ status: "ok" | "probe_no_results"; probeQuery: string; rawCount: number; error: string | null }> {
  const probeQuery = "saga";
  const probeUrl = buildComicVineProxySearchUrl(probeQuery);
  if (!hasLoggedProbeProxyUrl) {
    hasLoggedProbeProxyUrl = true;
    console.log("[GCD DEBUG] Proxied probe URL", probeUrl);
  }
  const probeDocs: RecommendationDoc[] = [];
  const probeSeen = new Set<string>();
  const preflightRawDiagnostics = {
    diagnosticsInitialized: true,
    rawNormalizationStarted: false,
    rawNormalizationCompleted: false,
    preNormalizationRejectCount: 0,
    rawRejectedBeforeNormalizationCount: 0,
    rawRejectedBeforeNormalizationReasons: {} as Record<string, number>,
    rawMetadataShellCount: 0,
    rawIssueFragmentCount: 0,
    rawNarrativeQualifiedCount: 0,
  };
  const { rawCount, error } = await fetchDocsForQuery(probeQuery, -1, timeoutMs, 6, probeDocs, probeSeen, preflightRawDiagnostics);
  const normalizedError = error ? String(error) : null;
  const hasFatalError = Boolean(normalizedError && normalizedError !== "none");
  if (hasFatalError) {
    throw new Error(`COMICVINE_ADAPTER_PREFLIGHT_FAILED: query=${probeQuery} raw=${rawCount} error=${normalizedError}`);
  }
  if (rawCount <= 0) {
    return { status: "probe_no_results", probeQuery, rawCount, error: null };
  }
  return { status: "ok", probeQuery, rawCount, error: null };
}

export async function getGcdGraphicNovelRecommendations(input: RecommenderInput): Promise<RecommendationResult> {
  console.log("COMICVINE_ADAPTER_ENTER", { deckKey: input.deckKey, limit: input.limit });
  const deckKey = input.deckKey;
  const domainMode: RecommendationResult["domainMode"] = "default";
  const finalLimit = Math.max(1, Math.min(40, input.limit ?? 12));
  const fetchLimit = Math.max(8, Math.min(36, Math.max(finalLimit * 2, 12)));
  const timeoutMs = Math.max(2500, Math.min(15000, input.timeoutMs ?? 10000));
  const preflight = await runGcdAdapterPreflight(timeoutMs);

  const bucketPreview = String((input as any)?.bucketPlan?.preview || "").trim();
  const bucketQueries = Array.isArray((input as any)?.bucketPlan?.queries) ? (input as any).bucketPlan.queries.map((q:any)=>String(q||"" ).trim()).filter(Boolean) : [];
  const querySeed = bucketPreview || bucketQueries[0] || "";
  const seedClean = cleanComicVineSeedQuery(querySeed);
  const normalizedSeed = normalizeText(seedClean.cleaned);
  const superheroSignal = /batman|dc|marvel|superhero|spider\s?man|superman/.test(normalizedSeed);
  const baseFromSeed = seedClean.positiveQueries;
  const directQueries = superheroSignal ? buildGcdSearchTerms(input.tagCounts) : [];
  const facetQueries = buildComicQueriesFromFacets(input.tagCounts);
  const fallbackQueries = superheroSignal ? ["batman"] : ["monstress", "paper girls", "locke and key", "sweet tooth"];
  const queryCandidates = Array.from(new Set([...baseFromSeed, ...facetQueries, ...directQueries, ...fallbackQueries].map((q)=>String(q||"").trim()).filter(Boolean)));
  const franchiseConfidenceScores = {
    batman: hasFacet(input.tagCounts, /batman|gotham|dc comics|bruce wayne/) ? 1 : 0,
    walking_dead: hasFacet(input.tagCounts, /walking dead|zombie apocalypse|undead survival/) ? 1 : 0,
    spider_man: hasFacet(input.tagCounts, /spider[- ]?man|peter parker|miles morales/) ? 1 : 0,
    ms_marvel: hasFacet(input.tagCounts, /ms\. marvel|kamala khan/) ? 1 : 0,
  };
  const franchiseSuppressedReasons = Object.entries(franchiseConfidenceScores)
    .filter(([, score]) => Number(score) < 1)
    .map(([key]) => `${key}:below_confidence_threshold`);
  const queryDiagnostics = queryCandidates.map((query) => {
    const querySpecificityScore = computeQuerySpecificityScore(query);
    const queryWasGeneric = isGenericComicVineQuery(query);
    return ensureQueryDiagnostic({
      query,
      queryGeneratedFrom: baseFromSeed.includes(query) ? "seed" : facetQueries.includes(query) ? "facet" : directQueries.includes(query) ? "swipe-evidence" : "fallback",
      queryFamily: String((input as any)?.bucketPlan?.lane || "general"),
      querySpecificityScore,
      queryWasGeneric,
      querySuppressedReason: queryWasGeneric ? "low_specificity" : "none",
    }, query);
  });
  const nonGenericQueries = queryDiagnostics.filter((row) => !ensureQueryDiagnostic(row).queryWasGeneric).map((row) => ensureQueryDiagnostic(row).query);
  const queriesToTry = (nonGenericQueries.length ? nonGenericQueries : queryCandidates).slice(0, 10);
  if (queriesToTry.length !== queryDiagnostics.length) {
    console.warn("QUERY_DIAGNOSTIC_LENGTH_MISMATCH", { queryTextsLength: queriesToTry.length, queryDiagnosticsLength: queryDiagnostics.length });
  }
  console.log("COMICVINE_QUERY_BUILD_COMPLETE", { queryCount: queriesToTry.length, queriesToTry });
  const entityQueriesGenerated = queryDiagnostics.filter((row) => row.querySpecificityScore >= 3 && /\b(and|&|girls|tooth|key|monstress|children|dead|batman|marvel|spider)\b/i.test(row.query)).map((row) => row.query);
  const descriptorQueriesGenerated = queryDiagnostics.filter((row) => row.queryWasGeneric || row.querySpecificityScore < 3).map((row) => row.query);
  const comicVineResolvedSeedQuery = querySeed || queriesToTry[0] || "";
  const comicVineUsedFallbackQuery = !querySeed;
  const comicVineFallbackReason = querySeed ? "none" : "missing_seed_query";
  const comicVinePositiveQueries = baseFromSeed;
  const comicVineExcludedTermsAppliedInFilterOnly = seedClean.excludedTermsAppliedInFilterOnly;
  const comicVineQueryTooLong = seedClean.queryTooLong;
  const gcdRungs = buildComicVineRungs(queriesToTry);
  const sourceEnabled = (input as any)?.sourceEnabled || {};
  const comicVineOnlyMode =
    sourceEnabled?.comicVine !== false &&
    sourceEnabled?.googleBooks === false &&
    sourceEnabled?.openLibrary === false &&
    sourceEnabled?.localLibrary === false &&
    sourceEnabled?.kitsu === false;
  if (!queriesToTry.length) {
    if (comicVineOnlyMode) {
      throw new Error("GCD_ONLY_NO_QUERIES: GCD is the only enabled source but no comic queries were generated.");
    }
    return {
      engineId: "comicVine",
      engineLabel: "ComicVine",
      deckKey,
      domainMode,
      builtFromQuery: "",
      items: [],
      debugRungStats: { byRung: {}, byRungSource: {}, total: 0 } as any,
      debugFilterAudit: [{ source: "comicVine", reason: "no_queries_generated", detail: "No GCD queries could be generated from tag counts." }],
      comicVineQueriesGenerated: [],
      comicVineRungsBuilt: [],
      comicVineQueriesActuallyFetched: [],
      comicVineFetchAttempted: false,
      comicVineZeroResultReason: "no_queries_generated",
      comicVineResolvedSeedQuery,
      comicVineFallbackReason,
      comicVineUsedFallbackQuery,
      comicVinePositiveQueries,
      comicVineExcludedTermsAppliedInFilterOnly,
      comicVineQueryTooLong,
      comicVinePreflightStatus: preflight.status,
      comicVinePreflightProbeQuery: preflight.probeQuery,
      comicVinePreflightRawCount: preflight.rawCount,
      comicVinePreflightError: preflight.error,
      comicVineQueryDiagnostics: queryDiagnostics,
      entityQueriesGenerated,
      descriptorQueriesGenerated,
      franchiseConfidenceScores,
      franchiseSuppressedReasons,
      diagnosticsInitialized: true,
      rawNormalizationStarted: false,
      rawNormalizationCompleted: false,
      preNormalizationRejectCount: 0,
      rawRejectedBeforeNormalizationCount: 0,
      rawRejectedBeforeNormalizationReasons: {},
      rawMetadataShellCount: 0,
      rawIssueFragmentCount: 0,
      rawNarrativeQualifiedCount: 0,
    };
    console.log("COMICVINE_ADAPTER_RETURN", { keys: Object.keys(returnPayload), items: 0 });
    return returnPayload;
  }

  const docs: RecommendationDoc[] = [];
  const seen = new Set<string>();
  const rawPreNormalizationDiagnostics = {
    diagnosticsInitialized: true,
    rawNormalizationStarted: false,
    rawNormalizationCompleted: false,
    preNormalizationRejectCount: 0,
    rawRejectedBeforeNormalizationCount: 0,
    rawRejectedBeforeNormalizationReasons: {} as Record<string, number>,
    rawMetadataShellCount: 0,
    rawIssueFragmentCount: 0,
    rawNarrativeQualifiedCount: 0,
  };
  let builtFromQuery = queriesToTry[0] || "";
  const comicVineFetchResults: Array<{ query: string; status: "ok" | "no_matches" | "error"; rawCount: number; error: string | null }> = [];
  const comicVineQueriesActuallyFetched: string[] = [];
  const comicVineRungsBuilt = gcdRungs.map((r) => String(r.query || "").trim()).filter(Boolean);

  for (let i = 0; i < queriesToTry.length; i += 1) {
    const q = queriesToTry[i];
    comicVineQueriesActuallyFetched.push(q);
    const hadDocsBeforeQuery = docs.length > 0;
    const { rawCount, error } = await fetchDocsForQuery(q, i, timeoutMs, fetchLimit, docs, seen, rawPreNormalizationDiagnostics);
    if (!rawCount) {
      comicVineFetchResults.push({ query: q, status: error ? "error" : "no_matches", rawCount: 0, error });
      continue;
    }
    if (!hadDocsBeforeQuery) builtFromQuery = q;
    comicVineFetchResults.push({
      query: q,
      status: rawCount > 0 ? "ok" : error ? "error" : "no_matches",
      rawCount,
      error,
    });

    if (docs.length >= fetchLimit) break;
    if (i === 0 && docs.length >= Math.max(4, finalLimit)) break;
  }

  if (docs.length === 0) {
    const knownGoodProbeQueries = ["saga", "sandman", "monstress", "paper girls", "watchmen"];
    let probeFoundAny = false;
    for (const q of knownGoodProbeQueries) {
      if (comicVineQueriesActuallyFetched.includes(q)) continue;
      comicVineQueriesActuallyFetched.push(q);
      let issueUrls: string[] = [];
      const probe = await fetchDocsForQuery(q, 999, timeoutMs, fetchLimit, docs, seen, rawPreNormalizationDiagnostics);
      issueUrls = probe.rawCount > 0 ? ["found"] : [];
      if (probe.rawCount > 0) probeFoundAny = true;
      comicVineFetchResults.push({
        query: q,
        status: probe.rawCount > 0 ? "ok" : probe.error ? "error" : "no_matches",
        rawCount: probe.rawCount,
        error: probe.error,
      });
      if (issueUrls.length > 0) break;
    }
    if (!probeFoundAny) {
      const probeSummary = comicVineFetchResults
        .filter((row) => knownGoodProbeQueries.includes(String(row.query || "").toLowerCase()))
        .map((row) => `${row.query}:${row.status}:raw=${row.rawCount}${row.error ? `:${row.error}` : ""}`)
        .join(" | ");
      throw new Error(`COMICVINE_ADAPTER_FAILURE: known-good probes returned no raw results. ${probeSummary}`);
    }
  }
  const survivingCandidatesPerQuery = comicVineQueriesActuallyFetched.map((query) => ({
    query,
    survivingCandidates: docs.filter((doc: any) => String(doc?.queryText || "").toLowerCase() === String(query || "").toLowerCase()).length,
  }));
  const rawResultsPerQuery = comicVineFetchResults.map((row) => ({ query: row.query, rawCount: row.rawCount }));
  const keptAfterFilterPerQuery = survivingCandidatesPerQuery.map((row) => ({ query: row.query, keptCount: row.survivingCandidates }));

  const returnPayload = {
    engineId: "comicVine",
    engineLabel: "ComicVine",
    deckKey,
    domainMode,
    builtFromQuery,
    items: docs.slice(0, fetchLimit).map((doc) => ({ kind: "open_library", doc })),
    debugRawFetchedCount: docs.length,
    comicVineQueriesGenerated: queriesToTry,
    comicVineRungsBuilt,
    comicVineQueriesActuallyFetched,
    comicVineQueryTexts: queriesToTry,
    comicVineFetchResults,
    comicVineFetchAttempted: true,
    comicVinePreflightStatus: preflight.status,
    comicVinePreflightProbeQuery: preflight.probeQuery,
    comicVinePreflightRawCount: preflight.rawCount,
    comicVinePreflightError: preflight.error,
    comicVineQueryDiagnostics: queryDiagnostics,
    entityQueriesGenerated,
    descriptorQueriesGenerated,
    franchiseConfidenceScores,
    franchiseSuppressedReasons,
    rawResultsPerQuery,
    survivingCandidatesPerQuery,
    keptAfterFilterPerQuery,
    ...rawPreNormalizationDiagnostics,
    gcdAdapterStatus: "ok",
    comicVineZeroResultReason: docs.length ? null : "no_issue_api_matches",
    debugRungStats: {
      byRung: Object.fromEntries(gcdRungs.map((r) => [String(r.rung), 0])),
      byRungSource: { comicVine: Object.fromEntries(gcdRungs.map((r) => [String(r.rung), 0])) },
      total: docs.length,
    } as any,
    debugRawPool: docs.slice(0, fetchLimit),
    debugFilterAudit: [
      {
        source: "comicVine",
        rungs: gcdRungs,
        generatedQueries: queriesToTry,
        reason: docs.length ? "results_found" : "no_results_from_generated_queries",
        detail: docs.length
          ? `Fetched ${docs.length} docs from GCD.`
          : "Generated teen-comic queries but GCD returned no issue API matches.",
      },
    ],
  };
  if (queriesToTry.length > 0 && (!returnPayload.comicVineQueryTexts || returnPayload.comicVineQueryTexts.length === 0) && (!returnPayload.comicVineFetchResults || returnPayload.comicVineFetchResults.length === 0) && (!returnPayload.items || returnPayload.items.length === 0) && (!returnPayload.debugRawPool || returnPayload.debugRawPool.length === 0)) {
    throw new Error("COMICVINE_ADAPTER_EMPTY_RETURN_SHAPE");
  }
  console.log("COMICVINE_ADAPTER_RETURN", { keys: Object.keys(returnPayload), items: returnPayload.items.length });
  return returnPayload;
}

export const getComicVineGraphicNovelRecommendations = getGcdGraphicNovelRecommendations;
