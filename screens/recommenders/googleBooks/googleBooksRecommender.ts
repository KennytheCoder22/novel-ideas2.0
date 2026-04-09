// /screens/recommenders/googleBooks/googleBooksRecommender.ts
import type { RecommenderInput, RecommendationResult, RecommendationDoc, DeckKey, StructuredFetchRung } from "../types";

function normalizePublisherText(value: any): string { return String(value || "").toLowerCase().replace(/\s+/g, " ").trim(); }
const HARD_SELF_PUBLISH_PAT = /(independently published|self[- ]published|createspace|kindle direct publishing|\bkdp\b|amazon digital services|amazon kdp|lulu\.com|lulu press|blurb|smashwords|draft2digital|authorhouse|xlibris|iuniverse|bookbaby|notion press|balboa press|trafford|whitmore publishing)/i;
function isHardSelfPublished(publisher: any): boolean { const p = normalizePublisherText(publisher); if (!p) return false; return HARD_SELF_PUBLISH_PAT.test(p); }

function normalizeText(value: any): string { return String(value || "").toLowerCase().replace(/\s+/g, " ").trim(); }

const GOOGLE_BOOKS_REFERENCE_TITLE_PAT = /\b(guide|writer'?s market|studies in|literature|review|digest|catalog|catalogue|bibliography|anthology|encyclopedia|handbook|manual|journal|periodical|proceedings|transactions|magazine|bulletin|report|annual report|yearbook)\b/i;

function looksLikeGoogleBooksReference(doc: any): boolean {
  const title = normalizeText(doc?.title);
  return GOOGLE_BOOKS_REFERENCE_TITLE_PAT.test(title);
}

async function fetchJsonWithRetry(url: string, timeoutMs: number): Promise<any> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const resp = await fetch(url, { signal: controller.signal });
    return await resp.json();
  } finally {
    clearTimeout(timer);
  }
}

function deckKeyToDomainMode(deckKey: DeckKey): RecommendationResult["domainMode"] {
  if (deckKey === "k2") return "chapterMiddle";
  return "default";
}

/* =========================
   🔥 20Q FIX STARTS HERE
   ========================= */

function rungToGoogleBooksQuery(rung: StructuredFetchRung): string {
  const parts: string[] = [];

  // Themes (top differentiators)
  if (Array.isArray(rung.themes)) {
    parts.push(...rung.themes.slice(0, 2));
  }

  // Core hypothesis
  if (rung.primary) parts.push(rung.primary);
  if (rung.secondary) parts.push(rung.secondary);

  // Audience signal
  if (rung.audience) parts.push(rung.audience);

  // Anchor
  parts.push("novel");

  return parts
    .join(" ")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/* =========================
   🔥 20Q FIX ENDS HERE
   ========================= */

export async function getGoogleBooksRecommendations(input: RecommenderInput): Promise<RecommendationResult> {
  const deckKey = input.deckKey;
  const finalLimit = 12;
  const timeoutMs = 15000;

  const explicitBucketPlan = (input as any)?.bucketPlan as { rungs?: StructuredFetchRung[] } | undefined;

  const queriesToTry = explicitBucketPlan?.rungs?.map(rungToGoogleBooksQuery) || [];

  const collectedDocsRaw: any[] = [];

  for (let i = 0; i < queriesToTry.length; i++) {
    const q = queriesToTry[i];
    const rawDocs = await fetchJsonWithRetry(`https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(q)}`, timeoutMs);

    const items = rawDocs?.items || [];

    for (const item of items) {
      const doc = item?.volumeInfo;
      if (!doc?.title) continue;
      if (looksLikeGoogleBooksReference(doc)) continue;

      collectedDocsRaw.push({
        title: doc.title,
        author_name: doc.authors,
        queryRung: i,
        queryText: q,
        source: "googleBooks"
      });
    }
  }

  return {
    engineId: "googleBooks",
    engineLabel: "Google Books",
    deckKey,
    domainMode: deckKeyToDomainMode(deckKey),
    builtFromQuery: queriesToTry[0] || "",
    items: collectedDocsRaw.map((doc) => ({ kind: "open_library", doc }))
  };
}
