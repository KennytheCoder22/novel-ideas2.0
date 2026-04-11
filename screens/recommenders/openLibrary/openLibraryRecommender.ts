// PATCHED OpenLibrary recommender
// /screens/recommenders/openLibrary/openLibraryRecommender.ts
import type { RecommenderInput, RecommendationResult, RecommendationDoc, DeckKey, StructuredFetchRung } from "../types";
function normalizePublisherText(value: any): string { return String(value || "").toLowerCase().replace(/\s+/g, " ").trim(); }
const HARD_SELF_PUBLISH_PAT = /(independently published|self[- ]published|createspace|kindle direct publishing|\bkdp\b|amazon digital services|amazon kdp|lulu\.com|lulu press|blurb|smashwords|draft2digital|authorhouse|xlibris|iuniverse|bookbaby|notion press|balboa press|trafford|whitmore publishing)/i;
function isHardSelfPublished(publisher: any): boolean { const p = normalizePublisherText(publisher); if (!p) return false; return HARD_SELF_PUBLISH_PAT.test(p); }
function deckKeyToBand(deckKey: DeckKey): "kids" | "preteen" | "teens" | "adult" { if (deckKey === "k2") return "kids"; if (deckKey === "36") return "preteen"; if (deckKey === "ms_hs") return "teens"; return "adult"; }
function visualSignalWeight(tagCounts: RecommenderInput["tagCounts"] | undefined): number { return Number((tagCounts as any)?.["topic:manga"] || 0) + Number((tagCounts as any)?.["format:graphic_novel"] || 0) + Number((tagCounts as any)?.["format:graphic novel"] || 0) + Number((tagCounts as any)?.["media:anime"] || 0) + Number((tagCounts as any)?.["genre:superheroes"] || 0); }
function dedupeQueries(queries: string[]): string[] { const seen = new Set<string>(); const out: string[] = []; for (const query of queries) { const trimmed = String(query || "").trim(); if (!trimmed) continue; const key = trimmed.toLowerCase(); if (seen.has(key)) continue; seen.add(key); out.push(trimmed); } return out; }
function isAnchorLaneQuery(query: string): boolean { return /\b(bestselling|bestseller|popular|well known|famous|award winning|award-winning)\b/i.test(String(query || "")); }
function rungToOpenLibraryQuery(rung: StructuredFetchRung): string {
  const primary = String(rung.primary || "").toLowerCase();
  const secondary = String(rung.secondary || "").toLowerCase();
  const themes = rung.themes.join(" ").toLowerCase();

  if (primary.includes("thriller")) {
    if (themes.includes("domestic") || themes.includes("family")) return '"domestic suspense novel"';
    if (themes.includes("missing") || themes.includes("disappearance")) return '"missing person thriller"';
    if (themes.includes("obsession")) return '"obsession thriller novel"';
    if (themes.includes("psychological")) return '"psychological suspense fiction"';
    return '"suspense fiction"';
  }

  if (primary.includes("mystery") || secondary.includes("mystery")) {
    return '"murder investigation novel"';
  }

  if (primary.includes("crime")) {
    return '"crime investigation novel"';
  }

  if (primary.includes("detective")) {
    return '"detective investigation novel"';
  }

  if (primary.includes("science fiction")) return '"science fiction novel"';
  if (primary.includes("fantasy")) return '"epic fantasy novel"';
  if (primary.includes("horror")) return '"horror novel"';
  if (primary.includes("romance")) return '"romance novel"';
  if (primary.includes("historical")) return '"historical fiction novel"';

  return `"${(primary || "fiction").trim()}"`;
}
function fallbackToOpenLibraryQuery(query: string): string {
  const cleaned = String(query || "").toLowerCase().trim();
  if (!cleaned) return '"fiction"';

  if (cleaned.includes("psychological")) return '"psychological suspense fiction"';
  if (cleaned.includes("missing")) return '"missing person thriller"';
  if (cleaned.includes("crime")) return '"crime investigation novel"';
  if (cleaned.includes("mystery")) return '"murder investigation novel"';
  if (cleaned.includes("thriller") || cleaned.includes("suspense")) return '"suspense fiction"';

  return `"${cleaned}"`;
}
function normalizeOpenLibraryAuthor(d: any): string {
  const value = Array.isArray(d?.author_name) ? d.author_name[0] : d?.author_name;
  return String(value || "").toLowerCase().replace(/\s+/g, " ").trim();
}
function isGarbageOpenLibraryCandidate(d: any): boolean {
  const title = String(d?.title || "").toLowerCase().replace(/\s+/g, " ").trim();
  const author = normalizeOpenLibraryAuthor(d);
  const subjects = Array.isArray(d?.subject) ? d.subject.map((v: any) => String(v || "").toLowerCase()).join(" | ") : "";
  const publishers = Array.isArray(d?.publisher) ? d.publisher.map((v: any) => String(v || "").toLowerCase()).join(" | ") : "";
  const text = [title, author, subjects, publishers].filter(Boolean).join(" | ");

  if (!title || !author) return true;
  if (author === "unknown" || author.length < 3) return true;

  if (/\b(test|ebook|sample|preview|canary)\b/i.test(title)) return true;
  if (/\b(index|bibliography|abstracts|theses|dissertations|journal|bulletin|catalog|catalogue|report|yearbook)\b/i.test(text)) return true;

  if (/\b(film|films|cinema|movie|movies|hitchcock)\b/i.test(text)) return true;
  if (/\b(criticism|critical|history of|studies in|analysis)\b/i.test(text)) return true;
  if (/\b(mystery and detective novels|contemporary .* detective novel|contemporary .* novel)\b/i.test(title)) return true;
  if (/\b(detective novels?|crime fiction)\b/i.test(title) && !/\b(murder|case|detective|mystery|thriller|suspense|fiction)\b/i.test(subjects)) return true;

  return false;
}
function looksLikeUsableOpenLibraryFiction(d: any): boolean {
  const title = String(d?.title || "").toLowerCase().replace(/\s+/g, " ").trim();
  const author = normalizeOpenLibraryAuthor(d);
  const subjects = Array.isArray(d?.subject) ? d.subject.map((v: any) => String(v || "").toLowerCase()).join(" | ") : "";
  const publishers = Array.isArray(d?.publisher) ? d.publisher.map((v: any) => String(v || "").toLowerCase()).join(" | ") : "";
  const year = Number(d?.first_publish_year || 0);
  const editionCount = Number(d?.edition_count || 0);
  const text = [title, subjects, publishers].filter(Boolean).join(" | ");

  if (!title || !author) return false;
  if (isGarbageOpenLibraryCandidate(d)) return false;
  if (year && year < 1980 && editionCount < 8) return false;
  if (/\b(anthology|collection|essays|criticism|guide|handbook|bibliography|companion|screenplay|plays?)\b/i.test(text)) return false;
  if (/\b(novel|fiction|thriller|mystery|crime|detective|suspense|psychological|young adult)\b/i.test(text)) return true;
  return editionCount >= 12;
}

function looksLikeCommercialOpenLibraryAnchor(d: any): boolean {
  const title = String(d?.title || "").toLowerCase().replace(/\s+/g, " ").trim();
  const subjects = Array.isArray(d?.subject) ? d.subject.map((v: any) => String(v || "").toLowerCase()).join(" | ") : "";
  const year = Number(d?.first_publish_year || 0);
  const text = [title, subjects].filter(Boolean).join(" | ");

  if (/\b(best american|year'?s best|anthology|collection|stories of the year|stories of the century|boxed set|box set|bundle|omnibus|guide|handbook|writers?|authors?|market|essays|criticism|bibliography|index|yearbook|catalog|review)\b/i.test(text)) return false;
  if (year && year < 1975) return false;
  return /\b(novel|thriller|mystery|crime|suspense|fiction|detective)\b/i.test(text);
}

function getBucketQueries(deckKey: DeckKey, input: RecommenderInput): { queries: string[]; domainMode: RecommendationResult["domainMode"]; } {
  const band = deckKeyToBand(deckKey); const isVisualDominant = visualSignalWeight(input.tagCounts) >= 4;
  if (isVisualDominant && band !== "kids") return { domainMode: "default", queries: dedupeQueries(['subject:"manga"', 'subject:"graphic novels"', 'subject:"comics"', 'subject:"fiction"']) };
  if (band === "kids") {
    const mode = input.domainModeOverride && input.domainModeOverride !== "default" ? input.domainModeOverride : "chapterMiddle";
    if (mode === "picture") return { domainMode: "picture", queries: dedupeQueries(['"juvenile fiction" "picture books"', '"juvenile fiction" illustrated', '"picture books"']) };
    if (mode === "earlyReader") return { domainMode: "earlyReader", queries: dedupeQueries(['"juvenile fiction" readers', '"juvenile fiction" "early readers"', '"juvenile fiction"']) };
    return { domainMode: "chapterMiddle", queries: dedupeQueries(['"juvenile fiction" "chapter books"', '"juvenile fiction" "middle grade fiction"', '"juvenile fiction"']) };
  }
  if (band === "preteen") return { domainMode: "default", queries: dedupeQueries(['"middle grade fiction"', '"juvenile fiction"', '"chapter books"', 'subject:"fiction"']) };
  if (band === "teens") return { domainMode: "default", queries: dedupeQueries(['"young adult fiction"', '"young adult mystery fiction"', '"young adult thriller fiction"', '"murder investigation novel"', '"epic fantasy novel"']) };
  return { domainMode: "default", queries: dedupeQueries(['"domestic suspense novel"', '"missing person thriller"', '"psychological suspense fiction"', '"murder investigation novel"', '"crime investigation novel"', '"suspense fiction"', '"detective fiction"']) };
}
async function fetchJsonWithTimeout(url: string, timeoutMs: number): Promise<any> {
  const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), timeoutMs);
  try { const resp = await fetch(url, { signal: controller.signal, headers: { Accept: "application/json" } }); if (!resp.ok) throw new Error(`Open Library error: ${resp.status}`); return await resp.json(); } finally { clearTimeout(timer); }
}
export async function getOpenLibraryRecommendations(input: RecommenderInput): Promise<RecommendationResult> {
  const deckKey = input.deckKey; const finalLimit = Math.max(1, Math.min(40, input.limit ?? 12)); const fetchLimit = Math.max(60, Math.min(200, finalLimit * 6)); const timeoutMs = Math.max(2500, Math.min(20000, input.timeoutMs ?? 12000));
  const explicitBucketPlan = (input as any)?.bucketPlan as { queries?: string[]; rungs?: StructuredFetchRung[]; domainMode?: RecommendationResult["domainMode"] } | undefined;
  const fallbackBucketPlan = getBucketQueries(deckKey, input);
  const hasStructuredRungs = Array.isArray(explicitBucketPlan?.rungs) && explicitBucketPlan!.rungs!.length > 0;
  const queriesToTry = hasStructuredRungs ? explicitBucketPlan!.rungs!.map(rungToOpenLibraryQuery) : (Array.isArray(explicitBucketPlan?.queries) && explicitBucketPlan!.queries!.length > 0 ? explicitBucketPlan!.queries!.map(fallbackToOpenLibraryQuery) : fallbackBucketPlan.queries);
  const domainMode = explicitBucketPlan?.domainMode || fallbackBucketPlan.domainMode;
  let builtFromQuery = queriesToTry[0] || "";
  const minCandidateFloor = Math.max(0, Math.min(fetchLimit, Number((input as any)?.minCandidateFloor ?? 0) || 0));
  const minQueryPassesBeforeEarlyExit = Math.min(4, queriesToTry.length || 4);
  let bestDocsRaw: any[] = []; let bestQuery = builtFromQuery; const collectedDocsRaw: any[] = []; const rawPoolRows: any[] = []; const seenKeys = new Set<string>(); let lastError: Error | null = null; let totalRawFetched = 0;
  for (let queryIndex = 0; queryIndex < queriesToTry.length; queryIndex += 1) {
    const q = queriesToTry[queryIndex]; const url = `/api/openlibrary?q=${encodeURIComponent(q)}&limit=${encodeURIComponent(String(fetchLimit))}`;
    try {
      const data = await fetchJsonWithTimeout(url, timeoutMs); const docsRaw = Array.isArray(data?.docs) ? data.docs : [];
      const laneKind = isAnchorLaneQuery(q) ? "anchor" : "precision";
      totalRawFetched += docsRaw.length;
      for (const rawDoc of docsRaw) {
        rawPoolRows.push({
          title: rawDoc?.title,
          author: Array.isArray(rawDoc?.author_name) ? rawDoc.author_name[0] : undefined,
          source: "openLibrary",
          queryText: q,
          queryRung: queryIndex,
          laneKind,
        });
      }
      const admittedDocsRaw = docsRaw.filter((d: any) => {
        const publishers = Array.isArray(d?.publisher) ? d.publisher : [];
        if (publishers.some((p: any) => isHardSelfPublished(p))) return false;
        if (isGarbageOpenLibraryCandidate(d)) return false;
        if (laneKind === "anchor" && !looksLikeCommercialOpenLibraryAnchor(d)) {
          const title = String(d?.title || "").toLowerCase().replace(/\s+/g, " ").trim();
          const subjects = Array.isArray(d?.subject) ? d.subject.map((v: any) => String(v || "").toLowerCase()).join(" | ") : "";
          const text = [title, subjects].filter(Boolean).join(" | ");
          if (!/\b(thriller|mystery|crime|suspense|detective|novel|fiction)\b/i.test(text)) return false;
        }
        return true;
      });
      const rescueDocsRaw = admittedDocsRaw.length >= Math.max(2, Math.ceil(finalLimit / 3))
        ? []
        : docsRaw.filter((d: any) => {
            const publishers = Array.isArray(d?.publisher) ? d.publisher : [];
            if (publishers.some((p: any) => isHardSelfPublished(p))) return false;
            return looksLikeUsableOpenLibraryFiction(d);
          });
      const mergedDocsRaw = admittedDocsRaw.slice();
      for (const rescued of rescueDocsRaw) {
        const rescueKey = String(rescued?.key || rescued?.cover_edition_key || rescued?.title || "").trim();
        if (!rescueKey) continue;
        if (mergedDocsRaw.some((existing: any) => String(existing?.key || existing?.cover_edition_key || existing?.title || "").trim() === rescueKey)) continue;
        mergedDocsRaw.push(rescued);
      }
      if (mergedDocsRaw.length > bestDocsRaw.length) { bestDocsRaw = mergedDocsRaw; bestQuery = q; }
      const shouldBackfillFromThisQuery = queryIndex < minQueryPassesBeforeEarlyExit || collectedDocsRaw.length < Math.max(minCandidateFloor, finalLimit * 2);
      if (shouldBackfillFromThisQuery) {
        for (const d of mergedDocsRaw) {
          const key = String(d?.key || `${d?.title || "unknown"}|${queryIndex}`); if (seenKeys.has(key)) continue; seenKeys.add(key);
          collectedDocsRaw.push({ ...d, queryRung: queryIndex, queryText: q, source: "openLibrary", laneKind });
        }
      }
      if (queryIndex + 1 >= minQueryPassesBeforeEarlyExit && mergedDocsRaw.length >= Math.max(finalLimit, minCandidateFloor)) break;
      if (collectedDocsRaw.length >= Math.max(fetchLimit, minCandidateFloor)) break;
    } catch (err: any) { lastError = err instanceof Error ? err : new Error(String(err?.message || err || "Unknown Open Library error")); continue; }
  }
  const docsRaw = collectedDocsRaw.length ? collectedDocsRaw : bestDocsRaw; builtFromQuery = bestQuery; if (!docsRaw.length && lastError) throw lastError;
  const docs: RecommendationDoc[] = docsRaw.filter((d: any) => d && d.title).map((d: any) => ({ key: d.key, title: d.title, author_name: Array.isArray(d.author_name) ? d.author_name : undefined, first_publish_year: typeof d.first_publish_year === "number" ? d.first_publish_year : undefined, cover_i: d.cover_i, subject: Array.isArray(d.subject) ? d.subject : undefined, edition_count: typeof d.edition_count === "number" ? d.edition_count : undefined, publisher: Array.isArray(d.publisher) ? d.publisher : undefined, language: Array.isArray(d.language) ? d.language : undefined, ebook_access: typeof d.ebook_access === "string" ? d.ebook_access : undefined, source: "openLibrary", queryRung: Number.isFinite(Number(d.queryRung)) ? Number(d.queryRung) : undefined, queryText: typeof d.queryText === "string" ? d.queryText : undefined, laneKind: typeof d.laneKind === "string" ? d.laneKind : undefined }));
  return {
    engineId: "openLibrary",
    engineLabel: "Open Library",
    deckKey,
    domainMode,
    builtFromQuery,
    items: docs.map((doc) => ({ kind: "open_library", doc })),
    debugRawFetchedCount: totalRawFetched,
    debugRawPool: rawPoolRows,
  };
}

// PATCH APPLIED: film/criticism filters added
