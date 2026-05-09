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
const MAX_COMICVINE_ANCHORS = 8;

type AnchorLane = "facet_weighted";

function buildProxyUrl(targetUrl: string): string {
  if (!GCD_PROXY_URL) throw new Error("GCD_PROXY_MISSING: EXPO_PUBLIC_GCD_PROXY_URL is not configured.");
  if (GCD_PROXY_URL.includes("{url}")) return GCD_PROXY_URL.replace("{url}", encodeURIComponent(targetUrl));
  if (GCD_PROXY_URL.endsWith("?") || GCD_PROXY_URL.endsWith("=")) return `${GCD_PROXY_URL}${encodeURIComponent(targetUrl)}`;
  if (GCD_PROXY_URL.includes("?")) return `${GCD_PROXY_URL}&url=${encodeURIComponent(targetUrl)}`;
  return `${GCD_PROXY_URL}?url=${encodeURIComponent(targetUrl)}`;
}

function stripDanglingQuotes(value: string): string {
  return String(value || "").replace(/^["'“”‘’`]+/, "").replace(/["'“”‘’`]+$/, "").trim();
}

function normalizeText(value: any): string {
  return String(value || "")
    .toLowerCase()
    .replace(/[_\-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}


function cleanComicVineSeedQuery(raw: string): { cleaned: string; positiveQueries: string[]; queryTooLong: boolean; excludedTermsAppliedInFilterOnly: boolean } {
  const normalized = normalizeText(raw);
  const tokens = normalized.split(/\s+/).filter(Boolean);
  const excluded = new Set(["graphic","novel","comics","comic","fiction","narrative","setting","stakes","slow","burn","consequence","true","crime","cozy","humorous","spy","conspiracy","writers","writer","writing","guide","reference","bibliography","analysis","criticism","review","summary","workbook","anthology"]);
  const positive = tokens.filter((t) => !excluded.has(t) && t.length > 2).slice(0, 5);
  const cleaned = Array.from(new Set(positive)).join(' ').trim();
  const queryTooLong = tokens.length > 12 || String(raw || "").length > 90;
  const franchiseAnchors = [
    "hellboy", "locke & key", "the sandman", "something is killing the children", "saga", "y: the last man",
    "batman black mirror", "gideon falls", "department of truth", "sweet tooth", "invincible", "black hammer", "monstress"
  ];
  const positiveQueries = Array.from(new Set([
    cleaned,
    ...franchiseAnchors,
  ].filter(Boolean) as string[]));
  return { cleaned, positiveQueries, queryTooLong, excludedTermsAppliedInFilterOnly: true };
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

  if (isDark && isTeen) anchors.push("batman");
  if (isDark && !isTeen) anchors.push("hellboy");
  if (isMystery) anchors.push("batman");
  if (isSurvival) anchors.push("walking dead");
  if (isSupernatural) anchors.push("hellboy");
  if (isManga) anchors.push("naruto");
  if (isTeen) anchors.push("ms. marvel");
  if (hasTeenGraphicIntent(tagCounts)) anchors.push("spider-man");

  const baselineAnchors = ["batman", "spider-man", "superman", "saga", "walking dead", "ms. marvel"];
  return Array.from(new Set([...anchors, ...baselineAnchors])).slice(0, 10);
}

function hasFacet(tagCounts: TagCounts | undefined, re: RegExp): boolean {
  return Object.entries(tagCounts || {}).some(([k, v]) => Number(v) > 0 && re.test(normalizeText(k)));
}


function topSwipeSignals(tagCounts: TagCounts | undefined, limit = 16): string[] {
  return Object.entries(tagCounts || {})
    .filter(([, v]) => Number(v) > 0)
    .sort((a, b) => Number(b[1]) - Number(a[1]))
    .slice(0, limit)
    .map(([k]) => normalizeText(k));
}

function selectComicVineAnchors(tagCounts: TagCounts | undefined): {
  lane: AnchorLane;
  mode: "story_facet_weighted";
  anchors: string[];
  reasonsByAnchor: Record<string, string[]>;
  suppressedDefaults: string[];
  topSignals: string[];
} {
  const signals = topSwipeSignals(tagCounts);
  const signalText = signals.join(" ");
  const storyFacets: Array<{ facet: string; re: RegExp }> = [
    { facet: "coming-of-age", re: /coming of age|teen|young adult|school|identity|growing up/ },
    { facet: "found family", re: /found family|team|crew|friends|community|belonging/ },
    { facet: "dark supernatural mystery", re: /dark|supernatural|occult|mystery|haunted|monster|witch|paranormal/ },
    { facet: "humor action", re: /funny|humor|comedy|action|energetic|quirky/ },
    { facet: "dystopian sci-fi identity", re: /cyberpunk|dystopian|science fiction|future|ai|rebellion|space/ },
    { facet: "fantasy adventure", re: /fantasy|magic|myth|quest|adventure|dungeons/ },
    { facet: "crime noir psychological", re: /crime|detective|noir|moral|psychological|gritty/ },
    { facet: "superhero", re: /superhero|marvel|dc|spider|batman|smallville|guardians/ },
  ];
  const facetWeights: Record<string, number> = {};
  for (const row of storyFacets) facetWeights[row.facet] = row.re.test(signalText) ? 1 : 0;

  const anchorProfiles: Array<{ anchor: string; facets: string[] }> = [
    { anchor: "ms. marvel", facets: ["coming-of-age", "found family", "humor action", "superhero"] },
    { anchor: "spider-man", facets: ["coming-of-age", "humor action", "outsider identity", "superhero"] },
    { anchor: "miles morales", facets: ["coming-of-age", "humor action", "superhero"] },
    { anchor: "batman", facets: ["crime noir psychological", "mystery", "superhero"] },
    { anchor: "teen titans", facets: ["coming-of-age", "found family", "superhero"] },
    { anchor: "young justice", facets: ["coming-of-age", "found family", "superhero"] },
    { anchor: "runaways", facets: ["coming-of-age", "found family", "humor action", "superhero"] },
    { anchor: "guardians of the galaxy", facets: ["found family", "dystopian sci-fi identity", "humor action", "superhero"] },
    { anchor: "invincible", facets: ["coming-of-age", "psychological", "superhero"] },
    { anchor: "scott pilgrim", facets: ["coming-of-age", "humor action", "found family"] },
    { anchor: "locke & key", facets: ["dark supernatural mystery", "coming-of-age", "found family"] },
    { anchor: "the sandman", facets: ["dark supernatural mystery", "melancholy", "psychological"] },
    { anchor: "hellboy", facets: ["dark supernatural mystery", "humor action"] },
    { anchor: "something is killing the children", facets: ["dark supernatural mystery", "coming-of-age"] },
    { anchor: "saga", facets: ["dystopian sci-fi identity", "found family", "humor action"] },
  ];

  const scored = anchorProfiles.map((p) => {
    const overlap = p.facets.filter((f) => facetWeights[f] > 0);
    const score = overlap.length + (overlap.includes("superhero") ? 0.25 : 0);
    return { ...p, overlap, score };
  }).sort((a, b) => b.score - a.score);

  const selected = scored.filter((row) => row.score > 0).slice(0, MAX_COMICVINE_ANCHORS);
  const anchors = selected.map((r) => r.anchor);
  const reasonsByAnchor: Record<string, string[]> = Object.fromEntries(selected.map((r) => [r.anchor, [`matched facets: ${r.overlap.join(', ') || 'none'}`]]));
  const defaults = ["hellboy", "locke & key", "the sandman", "saga"];
  const suppressedDefaults = defaults.filter((a) => !anchors.includes(a));
  return { lane: "facet_weighted", mode: "story_facet_weighted", anchors, reasonsByAnchor, suppressedDefaults, topSignals: signals };
}

function buildComicQueriesFromFacets(tagCounts: TagCounts | undefined): string[] {
  const queries: string[] = [];
  if (hasFacet(tagCounts, /horror|dark|haunted|terror|ghost|occult/)) queries.push("hellboy");
  if (hasFacet(tagCounts, /mystery|crime|detective|noir|investigation/)) queries.push("batman");
  if (hasFacet(tagCounts, /survival|post apocalyptic|apocalypse|wilderness/)) queries.push("walking dead");
  if (hasFacet(tagCounts, /dystopian|future|rebellion|authoritarian/)) queries.push("saga");
  if (hasFacet(tagCounts, /teen|young adult|school|coming of age/)) queries.push("ms. marvel", "spider-man");
  if (hasFacet(tagCounts, /supernatural|paranormal|magic|myth|monster|vampire/)) queries.push("hellboy");
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

function buildAnchorAliasRegex(query: string): RegExp | null {
  const q = normalizeText(query);
  const aliasMap: Array<{ anchor: RegExp; aliases: string[] }> = [
    { anchor: /spider/, aliases: ["spider man", "spiderman", "peter parker", "miles morales", "ultimate spider man", "amazing spider man", "spider man life story", "spider man blue"] },
    { anchor: /ms marvel|kamala/, aliases: ["ms marvel", "kamala khan", "magnificent ms marvel"] },
    { anchor: /teen titans|titans/, aliases: ["teen titans", "new teen titans", "titans", "teen titans academy"] },
    { anchor: /young justice/, aliases: ["young justice"] },
    { anchor: /guardians/, aliases: ["guardians of the galaxy", "guardians"] },
    { anchor: /locke.*key/, aliases: ["locke key", "locke & key"] },
  ];
  const row = aliasMap.find((r) => r.anchor.test(q));
  if (!row) return null;
  return new RegExp(`\\b(${row.aliases.map((a) => a.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "[\\s-]*")).join("|")})\\b`, "i");
}
function inferAnchorFamily(query: string): string {
  const q = normalizeText(query);
  if (/spider|ms marvel|teen titans|young justice|guardians|hellboy/.test(q)) return "superhero_identity";
  if (/locke.*key/.test(q)) return "supernatural_family_mystery";
  return "graphic_novel";
}

async function fetchDocsForQuery(query: string, queryRung: number, timeoutMs: number, fetchLimit: number, docs: RecommendationDoc[], seen: Set<string>) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const queryLimit = Math.max(5, Math.min(20, fetchLimit));
    const resp = await fetch(buildComicVineProxySearchUrl(query, queryLimit), { signal: controller.signal, headers: { Accept: "application/json" } });
    if (!resp.ok) throw new Error(`ComicVine error: ${resp.status}`);
    const payload = await resp.json();
    const results = Array.isArray(payload?.results) ? payload.results : [];
    const before = docs.length;
    const rejectedReasons: Record<string, number> = {};
    const topTitles: string[] = [];
    const sampleTitles: string[] = [];
    const rejectedSampleTitles: string[] = [];
    const rejectedSampleReasons: Array<{ title: string; reason: string }> = [];
    const stageCounts = {
      comicVineApiResultCount: results.length,
      comicVinePostNormalizationCount: 0,
      comicVineCanonicalAcceptedCount: 0,
      comicVineContentAcceptedCount: 0,
      comicVineFinalAcceptedCount: 0,
    };
    const countReject = (key: string) => { rejectedReasons[key] = (rejectedReasons[key] || 0) + 1; };
    const queryAnchorAlias = buildAnchorAliasRegex(query);
    for (const issue of results) {
      const doc = comicVineIssueToDoc(issue, query, queryRung);
      if (sampleTitles.length < 8 && doc?.title) sampleTitles.push(String(doc.title));
      const pushRejectedSample = (reason: string) => {
        const title = String(doc?.title || issue?.name || issue?.volume?.name || "").trim() || "(untitled)";
        if (rejectedSampleTitles.length < 8) rejectedSampleTitles.push(title);
        if (rejectedSampleReasons.length < 8) rejectedSampleReasons.push({ title, reason });
      };
      if (!doc?.title) { countReject("missing_title"); continue; }
      stageCounts.comicVinePostNormalizationCount += 1;
      if (topTitles.length < 5) topTitles.push(String(doc.title));
      const normalizedTitle = normalizeText(doc.title);
      if (queryAnchorAlias && !queryAnchorAlias.test(normalizedTitle)) {
        countReject("comicvine_anchor_alias_mismatch");
        pushRejectedSample("comicvine_anchor_alias_mismatch");
        continue;
      }
      if (normalizedTitle.length >= 3) stageCounts.comicVineCanonicalAcceptedCount += 1;
      if (/^(graphic novel|a graphic novel|tpb|ogn|part one|part two)$/.test(normalizedTitle)) { countReject("trivial_title"); pushRejectedSample("trivial_title"); continue; }
      if (/^die\s+/i.test(String(doc.title || ""))) { countReject("bad_prefix_die"); pushRejectedSample("bad_prefix_die"); continue; }
      if (/[^-]/.test(String(doc.title || "")) && !/hellboy|sandman|saga|locke|paper girls|sweet tooth/i.test(String(doc.title || ""))) { countReject("non_ascii_filtered"); pushRejectedSample("non_ascii_filtered"); continue; }
      stageCounts.comicVineContentAcceptedCount += 1;
      const dedupeKey = String(doc.key || `${doc.title}|${doc.author_name?.[0] || ""}`).toLowerCase();
      if (seen.has(dedupeKey)) { countReject("deduped"); pushRejectedSample("deduped"); continue; }
      seen.add(dedupeKey);
      docs.push(doc);
      stageCounts.comicVineFinalAcceptedCount += 1;
      if (docs.length >= fetchLimit) break;
    }
    const acceptedCount = Math.max(0, docs.length - before);
    return {
      rawCount: results.length,
      acceptedCount,
      rejectedCount: Math.max(0, results.length - acceptedCount),
      topTitles,
      sampleTitles,
      rejectedSampleTitles,
      rejectedSampleReasons,
      rejectedReasons,
      stageCounts,
      error: null,
    };
  } catch (err: any) {
    return {
      rawCount: 0,
      acceptedCount: 0,
      rejectedCount: 0,
      topTitles: [],
      sampleTitles: [],
      rejectedSampleTitles: [],
      rejectedSampleReasons: [],
      rejectedReasons: {},
      stageCounts: {
        comicVineApiResultCount: 0,
        comicVinePostNormalizationCount: 0,
        comicVineCanonicalAcceptedCount: 0,
        comicVineContentAcceptedCount: 0,
        comicVineFinalAcceptedCount: 0,
      },
      error: String(err?.message || err || "comicvine_search_failed"),
    };
  } finally {
    clearTimeout(timer);
  }
}

async function runGcdAdapterPreflight(timeoutMs: number): Promise<void> {
  const probeQuery = "saga";
  const probeUrl = buildComicVineProxySearchUrl(probeQuery);
  if (!hasLoggedProbeProxyUrl) {
    hasLoggedProbeProxyUrl = true;
    console.log("[GCD DEBUG] Proxied probe URL", probeUrl);
  }
  const probeDocs: RecommendationDoc[] = [];
  const probeSeen = new Set<string>();
  const { rawCount, error } = await fetchDocsForQuery(probeQuery, -1, timeoutMs, 6, probeDocs, probeSeen);
  if (rawCount <= 0) {
    throw new Error(`COMICVINE_ADAPTER_PREFLIGHT_FAILED: query=${probeQuery} raw=${rawCount} error=${error || "none"}`);
  }
}

export async function getGcdGraphicNovelRecommendations(input: RecommenderInput): Promise<RecommendationResult> {
  const deckKey = input.deckKey;
  const domainMode: RecommendationResult["domainMode"] = "default";
  const finalLimit = Math.max(1, Math.min(40, input.limit ?? 12));
  const perAnchorFetchLimit = 10;
  const fetchLimit = Math.max(40, Math.min(160, MAX_COMICVINE_ANCHORS * perAnchorFetchLimit));
  const timeoutMs = Math.max(2500, Math.min(15000, input.timeoutMs ?? 10000));
  await runGcdAdapterPreflight(timeoutMs);

  const bucketPreview = String((input as any)?.bucketPlan?.preview || "").trim();
  const bucketQueries = Array.isArray((input as any)?.bucketPlan?.queries) ? (input as any).bucketPlan.queries.map((q:any)=>String(q||"" ).trim()).filter(Boolean) : [];
  const querySeed = bucketPreview || bucketQueries[0] || "";
  const seedClean = cleanComicVineSeedQuery(querySeed);
  const anchorSelection = selectComicVineAnchors(input.tagCounts);
  const facetQueries = buildComicQueriesFromFacets(input.tagCounts);
  const allQueries = Array.from(new Set([...anchorSelection.anchors, ...facetQueries].map((q)=>stripDanglingQuotes(String(q||"").trim())).filter(Boolean)));
  const knownAnchorPattern = /hellboy|locke\s*&\s*key|sandman|something is killing the children|saga|y:\s*the last man|gideon falls|department of truth|sweet tooth|paper girls/i;
  const genericPattern = /^(horror|mystery|thriller|supernatural|psychological|dystopian)(\s+comics?)?$/i;
  const anchorQueries = allQueries.filter((q) => knownAnchorPattern.test(q) || anchorSelection.anchors.includes(q));
  const genericQueries = allQueries.filter((q) => genericPattern.test(normalizeText(q)));
  const otherQueries = allQueries.filter((q) => !anchorQueries.includes(q) && !genericQueries.includes(q));
  const baseAnchors = anchorQueries.slice(0, MAX_COMICVINE_ANCHORS);
  const followupTemplates = ["vol 1", "year one", "book 1", "origin", "complete collection", "deluxe edition", "omnibus"];
  const MAX_FOLLOWUPS_PER_ANCHOR = 2;
  const followupQueriesBuilt: string[] = [];
  for (const anchor of baseAnchors) {
    for (const template of followupTemplates.slice(0, MAX_FOLLOWUPS_PER_ANCHOR)) {
      followupQueriesBuilt.push(`${anchor} ${template}`);
    }
  }
  // Anti-monoculture ordering: round-robin anchor + first followup before deeper followups.
  const followupsTier1 = baseAnchors.map((a) => `${a} vol 1`);
  const followupsTier2 = baseAnchors.flatMap((a) => [`${a} year one`, `${a} book 1`, `${a} origin`]);
  const followupsTier3 = baseAnchors.map((a) => `${a} complete collection`);
  const followupsTier4 = baseAnchors.map((a) => `${a} omnibus`);
  const prioritizedQueries = [...baseAnchors, ...followupsTier1, ...followupsTier2, ...otherQueries, ...followupsTier3, ...followupsTier4, ...genericQueries];
  const queriesToTry = Array.from(new Set(prioritizedQueries.map((q) => stripDanglingQuotes(String(q || "")).trim()).filter(Boolean))).slice(0, Math.max(24, MAX_COMICVINE_ANCHORS));
  const comicVineResolvedSeedQuery = anchorSelection.anchors[0] || queriesToTry[0] || "";
  const comicVineUsedFallbackQuery = false;
  const comicVineFallbackReason = "tag_profile_anchor_selection";
  const comicVinePositiveQueries = anchorSelection.anchors;
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
      comicVineAnchorQueriesBuilt: anchorQueries,
      comicVineAnchorQueriesSelectedForFetch: [],
      comicVineAnchorQueriesDropped: anchorQueries,
      comicVineAnchorDropReasons: anchorQueries.map((q) => ({ query: q, reason: "no_queries_generated" })),
      comicVineFetchBudget: 0,
      comicVineFetchBudgetConsumedByGenericQueries: 0,
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
      comicVineAnchorSelectionMode: anchorSelection.mode,
      comicVineAnchorReasonsByAnchor: anchorSelection.reasonsByAnchor,
      comicVineTopSwipeSignals: anchorSelection.topSignals,
      comicVineSuppressedDefaultAnchors: anchorSelection.suppressedDefaults,
      comicVineActiveAnchorLane: anchorSelection.lane,
    };
  }

  const docs: RecommendationDoc[] = [];
  const seen = new Set<string>();
  let builtFromQuery = queriesToTry[0] || "";
  const comicVineFetchResults: Array<{ query: string; status: "ok" | "api_empty" | "post_normalization_empty" | "canonical_empty" | "content_empty" | "final_empty" | "error"; rawCount: number; acceptedCount: number; rejectedCount: number; topTitles: string[]; rejectedReasons: Record<string, number>; error: string | null }> = [];
  const comicVineRawCountByQuery: Record<string, number> = {};
  const comicVineApiResultCountByQuery: Record<string, number> = {};
  const comicVinePostNormalizationCountByQuery: Record<string, number> = {};
  const comicVineCanonicalAcceptedCountByQuery: Record<string, number> = {};
  const comicVineContentAcceptedCountByQuery: Record<string, number> = {};
  const comicVineFinalAcceptedCountByQuery: Record<string, number> = {};
  const comicVineAcceptedCountByQuery: Record<string, number> = {};
  const comicVineRejectedCountByQuery: Record<string, number> = {};
  const comicVineTopTitlesByQuery: Record<string, string[]> = {};
  const comicVineSampleTitlesByQuery: Record<string, string[]> = {};
  const comicVineRejectedSampleTitlesByQuery: Record<string, string[]> = {};
  const comicVineRejectedSampleReasonsByQuery: Record<string, Array<{ title: string; reason: string }>> = {};
  const comicVineAdapterDropReasonsByQuery: Record<string, Record<string, number>> = {};
  const comicVineRescueCandidatesByQuery: Record<string, RecommendationDoc[]> = {};
  const comicVineRescueRejectedTitlesByQuery: Record<string, Array<{ title: string; reason: string }>> = {};
  const comicVineQueriesActuallyFetched: string[] = [];
  const comicVineRungsBuilt = gcdRungs.map((r) => String(r.query || "").trim()).filter(Boolean);
  const followupFetched: string[] = [];
  const followupDropped: Array<{ query: string; reason: string }> = [];
  const baseAnchorsFetched: string[] = [];
  const followupBudgetByAnchor: Record<string, number> = Object.fromEntries(baseAnchors.map((a) => [a, 0]));
  const selectedAnchorsForFetch = queriesToTry.filter((q) => knownAnchorPattern.test(q));
  const droppedAnchors = anchorQueries.filter((q) => !selectedAnchorsForFetch.includes(q));
  const fetchBudget = queriesToTry.length;
  let genericBudgetConsumed = 0;

  const baseAnchorBudget = Math.min(MAX_COMICVINE_ANCHORS, baseAnchors.length);
  const followupBudget = Math.min(baseAnchors.length * MAX_FOLLOWUPS_PER_ANCHOR, queriesToTry.length - baseAnchorBudget);
  const maxQueriesToFetch = Math.min(baseAnchorBudget + followupBudget, queriesToTry.length);
  const MAX_ANCHOR_SHARE = 0.35;
  const queryCountsByAnchor: Record<string, number> = Object.fromEntries(baseAnchors.map((a) => [a, 0]));
  for (let i = 0; i < maxQueriesToFetch; i += 1) {
    const q = stripDanglingQuotes(queriesToTry[i]);
    try {
      const qAnchor = baseAnchors.find((a) => q === a || q.startsWith(a + " "));
      if (qAnchor) {
        const nextCount = (queryCountsByAnchor[qAnchor] || 0) + 1;
        const projectedShare = nextCount / Math.max(1, comicVineQueriesActuallyFetched.length + 1);
        const hasDiversifiedEnough = Object.values(queryCountsByAnchor).filter((n) => n > 0).length >= 3;
        if (hasDiversifiedEnough && projectedShare > MAX_ANCHOR_SHARE) continue;
        queryCountsByAnchor[qAnchor] = nextCount;
      }
      if (genericPattern.test(normalizeText(q))) genericBudgetConsumed += 1;
      comicVineQueriesActuallyFetched.push(q);
      if (baseAnchors.includes(q)) baseAnchorsFetched.push(q);
      if (!baseAnchors.includes(q) && followupQueriesBuilt.includes(q)) {
        followupFetched.push(q);
        const owner = baseAnchors.find((a) => q.startsWith(a + " "));
        if (owner) followupBudgetByAnchor[owner] = (followupBudgetByAnchor[owner] || 0) + 1;
      }
      const hadDocsBeforeQuery = docs.length > 0;
      const { rawCount, acceptedCount, rejectedCount, topTitles, sampleTitles, rejectedSampleTitles, rejectedSampleReasons, rejectedReasons, stageCounts, error } = await fetchDocsForQuery(q, i, timeoutMs, fetchLimit, docs, seen);
    comicVineRawCountByQuery[q] = rawCount;
    comicVineApiResultCountByQuery[q] = Number(stageCounts?.comicVineApiResultCount || rawCount || 0);
    comicVinePostNormalizationCountByQuery[q] = Number(stageCounts?.comicVinePostNormalizationCount || 0);
    comicVineCanonicalAcceptedCountByQuery[q] = Number(stageCounts?.comicVineCanonicalAcceptedCount || 0);
    comicVineContentAcceptedCountByQuery[q] = Number(stageCounts?.comicVineContentAcceptedCount || 0);
    comicVineFinalAcceptedCountByQuery[q] = Number(stageCounts?.comicVineFinalAcceptedCount || acceptedCount || 0);
    comicVineAcceptedCountByQuery[q] = acceptedCount;
    comicVineRejectedCountByQuery[q] = rejectedCount;
    comicVineTopTitlesByQuery[q] = topTitles;
    comicVineSampleTitlesByQuery[q] = sampleTitles;
    comicVineRejectedSampleTitlesByQuery[q] = rejectedSampleTitles;
    comicVineRejectedSampleReasonsByQuery[q] = rejectedSampleReasons;
    comicVineAdapterDropReasonsByQuery[q] = rejectedReasons;
    const stageStatus =
      error ? "error"
      : rawCount <= 0 ? "api_empty"
      : comicVinePostNormalizationCountByQuery[q] <= 0 ? "post_normalization_empty"
      : comicVineCanonicalAcceptedCountByQuery[q] <= 0 ? "canonical_empty"
      : comicVineContentAcceptedCountByQuery[q] <= 0 ? "content_empty"
      : comicVineFinalAcceptedCountByQuery[q] <= 0 ? "final_empty"
      : "ok";
      if (!acceptedCount) {
        comicVineFetchResults.push({ query: q, status: stageStatus, rawCount, acceptedCount, rejectedCount, topTitles, rejectedReasons, error });
        if (rawCount > 0) {
          const anchorAlias = buildAnchorAliasRegex(q);
          const rescueEligibleTitles = sampleTitles
            .filter((title) => (anchorAlias ? anchorAlias.test(normalizeText(title)) : true))
            .sort((a, b) => {
              const rank = (t: string) => (/#\s*1\b|vol(?:ume)?\.?\s*1\b|year one|origin|book 1|master edition\s*#?\s*1|treasury edition\s*#?\s*1/.test(normalizeText(t)) ? 2 : 0);
              return rank(b) - rank(a);
            })
            .slice(0, 2);
          const rescueRejectedTitles = sampleTitles
            .filter((title) => !(anchorAlias ? anchorAlias.test(normalizeText(title)) : true))
            .slice(0, 8)
            .map((title) => ({ title, reason: "anchor_alias_mismatch" }));
          if (rescueRejectedTitles.length) comicVineRescueRejectedTitlesByQuery[q] = rescueRejectedTitles;
          const rescue = rescueEligibleTitles.map((title, idx) => ({
          key: `comicvine-rescue:${q}:${idx}:${title}`.toLowerCase(),
          title,
          source: "comicVine",
          sourceId: `comicvine-rescue:${q}:${idx}`,
          author_name: [],
          ratings_average: 0,
          ratings_count: 0,
          first_publish_year: undefined,
          subject: ["comics", "graphic novel"],
          language: "en",
          query: q,
          queryText: q,
          queryFamily: inferAnchorFamily(q),
          queryRung: i,
          preFilterScore: 0.35,
          postFilterScore: 0.3,
          finalScore: 0.25,
          sourceFamily: "comicvine",
          normalizedAnchor: normalizeText(q),
          diagnostics: {
            comicvine_raw_rescue: true,
            rescueReason: "content_empty_high_affinity_anchor",
            originalQuery: q,
            comicVineRescueAnchorMatch: anchorAlias ? "alias_match" : "not_required",
            comicVineRescueAnchorMismatchReason: null,
            rawCount,
            stageStatus,
          } as any,
          } as RecommendationDoc));
          comicVineRescueCandidatesByQuery[q] = rescue;
          const preferred = rescue[0];
          if (preferred && docs.length < fetchLimit) {
            const rescueKey = String(preferred.key || "").toLowerCase();
            if (rescueKey && !seen.has(rescueKey)) {
              seen.add(rescueKey);
              docs.push(preferred);
            }
          }
        }
        continue;
      }
      if (!hadDocsBeforeQuery) builtFromQuery = q;
      comicVineFetchResults.push({
      query: q,
      status: stageStatus,
      rawCount,
      acceptedCount,
      rejectedCount,
      topTitles,
      rejectedReasons,
      error,
      });

      // Continue through anchor budget for diversity; do not stop after early successes.
    } catch (err: any) {
      comicVineFetchResults.push({
        query: q,
        status: "error",
        rawCount: 0,
        acceptedCount: 0,
        rejectedCount: 0,
        topTitles: [],
        rejectedReasons: {},
        error: String(err?.message || err || "comicvine_query_dispatch_failed"),
      });
      continue;
    }
  }

  const fetchedSet = new Set(comicVineQueriesActuallyFetched);
  for (const q of followupQueriesBuilt) {
    if (!fetchedSet.has(q)) followupDropped.push({ query: q, reason: "followup_budget_exhausted_or_truncated" });
  }

  if (docs.length === 0) {
    const rescueQueries = Object.keys(comicVineRescueCandidatesByQuery).slice(0, 2);
    for (const rq of rescueQueries) {
      for (const candidate of comicVineRescueCandidatesByQuery[rq] || []) {
        if (docs.length >= 2) break;
        docs.push(candidate);
      }
    }
  }

  if (docs.length === 0) {
    const knownGoodProbeQueries = ["batman", "spider-man", "ms. marvel", "locke & key", "saga", "guardians of the galaxy"];
    let probeFoundAny = false;
    for (const q of knownGoodProbeQueries) {
      if (comicVineQueriesActuallyFetched.includes(q)) continue;
      comicVineQueriesActuallyFetched.push(q);
    if (baseAnchors.includes(q)) baseAnchorsFetched.push(q);
    if (!baseAnchors.includes(q) && followupQueriesBuilt.includes(q)) {
      followupFetched.push(q);
      const owner = baseAnchors.find((a) => q.startsWith(a + " "));
      if (owner) followupBudgetByAnchor[owner] = (followupBudgetByAnchor[owner] || 0) + 1;
    }
      let issueUrls: string[] = [];
      const probe = await fetchDocsForQuery(q, 999, timeoutMs, fetchLimit, docs, seen);
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

  return {
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
    comicVineBaseAnchorsFetched: baseAnchorsFetched,
    comicVineFollowupQueriesBuilt: followupQueriesBuilt,
    comicVineFollowupQueriesFetched: followupFetched,
    comicVineFollowupQueriesDropped: followupDropped.map((row) => row.query),
    comicVineFollowupDropReasons: followupDropped,
    comicVineFollowupBudgetByAnchor: followupBudgetByAnchor,
    comicVineAnchorQueriesBuilt: anchorQueries,
    comicVineAnchorQueriesSelectedForFetch: selectedAnchorsForFetch,
    comicVineAnchorQueriesDropped: droppedAnchors,
    comicVineAnchorDropReasons: droppedAnchors.map((q) => ({ query: q, reason: "fetch_budget_limited" })),
    comicVineFetchBudget: fetchBudget,
    comicVineFetchBudgetConsumedByGenericQueries: genericBudgetConsumed,
    comicVineQueryTexts: queriesToTry,
    comicVineFetchResults,
    comicVineRawCountByQuery,
    comicVineApiResultCountByQuery,
    comicVinePostNormalizationCountByQuery,
    comicVineCanonicalAcceptedCountByQuery,
    comicVineContentAcceptedCountByQuery,
    comicVineFinalAcceptedCountByQuery,
    comicVineAcceptedCountByQuery,
    comicVineRejectedCountByQuery,
    comicVineTopTitlesByQuery,
    comicVineSampleTitlesByQuery,
    comicVineRejectedSampleTitlesByQuery,
    comicVineRejectedSampleReasonsByQuery,
    comicVineAdapterDropReasonsByQuery,
    comicVineRescueCandidatesByQuery,
    comicVineRescueRejectedTitlesByQuery,
    comicVineZeroResultQueries: Object.keys(comicVineAcceptedCountByQuery).filter((q) => Number(comicVineAcceptedCountByQuery[q] || 0) === 0),
    comicVineSuccessfulQueries: Object.keys(comicVineAcceptedCountByQuery).filter((q) => Number(comicVineAcceptedCountByQuery[q] || 0) > 0),
    comicVineFetchAttempted: true,
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
}

export const getComicVineGraphicNovelRecommendations = getGcdGraphicNovelRecommendations;
