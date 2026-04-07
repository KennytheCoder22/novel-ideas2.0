// /screens/recommenders/openLibrary/openLibraryRecommender.ts
//
// Open Library recommendation engine.
// Bucket-based fetcher only: run broad, stable Open Library queries and return raw docs.
// NOTE: This module must NOT import any Google Books HTTP code.

import type { RecommenderInput, RecommendationResult, RecommendationDoc, DeckKey } from "../types";

function normalizePublisherText(value: any): string {
  return String(value || "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

const HARD_SELF_PUBLISH_PAT = /(independently published|self[- ]published|createspace|kindle direct publishing|\bkdp\b|amazon digital services|amazon kdp|lulu\.com|lulu press|blurb|smashwords|draft2digital|authorhouse|xlibris|iuniverse|bookbaby|notion press|balboa press|trafford|whitmore publishing)/i;

function isHardSelfPublished(publisher: any): boolean {
  const p = normalizePublisherText(publisher);
  if (!p) return false;
  return HARD_SELF_PUBLISH_PAT.test(p);
}

function deckKeyToBand(deckKey: DeckKey): "kids" | "preteen" | "teens" | "adult" {
  if (deckKey === "k2") return "kids";
  if (deckKey === "36") return "preteen";
  if (deckKey === "ms_hs") return "teens";
  return "adult";
}

function visualSignalWeight(tagCounts: RecommenderInput["tagCounts"] | undefined): number {
  return (
    Number((tagCounts as any)?.["topic:manga"] || 0) +
    Number((tagCounts as any)?.["format:graphic_novel"] || 0) +
    Number((tagCounts as any)?.["format:graphic novel"] || 0) +
    Number((tagCounts as any)?.["media:anime"] || 0) +
    Number((tagCounts as any)?.["genre:superheroes"] || 0)
  );
}

function dedupeQueries(queries: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];

  for (const query of queries) {
    const trimmed = String(query || "").trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    out.push(trimmed);
  }

  return out;
}

function sanitizeOpenLibraryQuery(query: string): string {
  let q = String(query || "").toLowerCase().trim();

  q = q
    .replace(/\bdark\b/g, "")
    .replace(/\bgritty\b/g, "")
    .replace(/\bgrounded\b/g, "")
    .replace(/\bintense\b/g, "")
    .replace(/\s+/g, " ")
    .trim();

  return q;
}

function toOpenLibraryQuery(query: string): string {
  let q = String(query || "").toLowerCase();

  // strip negative filters
  q = q.replace(/-\w+/g, " ");

  // remove weak adjectives
  q = q
    .replace(/\bdark\b/g, "")
    .replace(/\bfunny\b/g, "")
    .replace(/\bgritty\b/g, "")
    .replace(/\bgrounded\b/g, "")
    .replace(/\bintense\b/g, "")
    .replace(/\bsocietal\b/g, "")
    .replace(/\bsurvival\b/g, "")
    .replace(/\s+/g, " ")
    .trim();

  // compress to stronger OL-friendly quoted phrases
  if (q.includes("dystopian")) return '"dystopian science fiction novel"';
  if (q.includes("science fiction")) return '"science fiction novel"';
  if (q.includes("thriller") && q.includes("crime")) return '"crime thriller novel"';
  if (q.includes("thriller")) return '"psychological thriller novel"';
  if (q.includes("romance")) return '"romance novel"';
  if (q.includes("fantasy")) return '"epic fantasy novel"';
  if (q.includes("horror")) return '"horror novel"';
  if (q.includes("mystery")) return '"detective novel"';
  if (q.includes("historical")) return '"historical fiction novel"';

  return q;
}

function getBucketQueries(deckKey: DeckKey, input: RecommenderInput): {
  queries: string[];
  domainMode: RecommendationResult["domainMode"];
} {
  const band = deckKeyToBand(deckKey);
  const isVisualDominant = visualSignalWeight(input.tagCounts) >= 4;

  if (isVisualDominant && band !== "kids") {
    return {
      domainMode: "default",
      queries: dedupeQueries([
        'subject:"manga"',
        'subject:"graphic novels"',
        'subject:"comics"',
        'subject:"fiction"',
      ]),
    };
  }

  if (band === "kids") {
    const mode =
      input.domainModeOverride && input.domainModeOverride !== "default"
        ? input.domainModeOverride
        : "chapterMiddle";

    if (mode === "picture") {
      return {
        domainMode: "picture",
        queries: dedupeQueries([
          '"juvenile fiction" "picture books"',
          '"juvenile fiction" illustrated',
          '"picture books"',
        ]),
      };
    }

    if (mode === "earlyReader") {
      return {
        domainMode: "earlyReader",
        queries: dedupeQueries([
          '"juvenile fiction" readers',
          '"juvenile fiction" "early readers"',
          '"juvenile fiction"',
        ]),
      };
    }

    return {
      domainMode: "chapterMiddle",
      queries: dedupeQueries([
        '"juvenile fiction" "chapter books"',
        '"juvenile fiction" "middle grade fiction"',
        '"juvenile fiction"',
      ]),
    };
  }

  if (band === "preteen") {
    return {
      domainMode: "default",
      queries: dedupeQueries([
        '"middle grade fiction"',
        '"juvenile fiction"',
        '"chapter books"',
        'subject:"fiction"',
      ]),
    };
  }

  if (band === "teens") {
    return {
      domainMode: "default",
      queries: dedupeQueries([
        // ---------------------
        // TEEN BASELINE
        // ---------------------
        '"young adult fiction"',

        // ---------------------
        // TEEN ROMANCE / SOCIAL
        // ---------------------
        '"teen romance novel"',
        '"friends to lovers romance novel"',
        '"fake dating romance novel"',

        // ---------------------
        // TEEN DYSTOPIAN / FANTASY
        // ---------------------
        '"dystopian young adult novel"',
        '"epic fantasy novel"',
        '"dark fantasy novel"',
        '"magic fantasy novel"',

        // ---------------------
        // TEEN REALISM / GROWTH
        // ---------------------
        '"coming of age novel"',

        // ---------------------
        // TEEN MYSTERY / THRILLER
        // ---------------------
        '"murder investigation novel"',
        '"psychological thriller novel"',
        '"crime thriller novel"',
      ]),
    };
  }

  return {
    domainMode: "default",
    queries: dedupeQueries([
      // ---------------------
      // GENERAL / BASELINE
      // ---------------------
      '"contemporary fiction novel"',
      '"general fiction novel"',

      // ---------------------
      // LITERARY (signal layer)
      // ---------------------
      '"literary fiction novel"',
      '"award winning novel"',

      // ---------------------
      // MYSTERY / DETECTIVE
      // ---------------------
      '"murder investigation novel"',
      '"detective novel"',

      // ---------------------
      // THRILLER
      // ---------------------
      '"psychological thriller novel"',
      '"spy thriller novel"',
      '"crime thriller novel"',

      // ---------------------
      // ROMANCE (tropes)
      // ---------------------
      '"fake dating romance novel"',
      '"marriage of convenience romance novel"',
      '"friends to lovers romance novel"',

      // ---------------------
      // SCI-FI
      // ---------------------
      '"space opera science fiction"',
      '"dystopian science fiction novel"',
      '"time travel science fiction novel"',

      // ---------------------
      // FANTASY
      // ---------------------
      '"epic fantasy novel"',
      '"dark fantasy novel"',
      '"magic fantasy novel"',

      // ---------------------
      // HORROR (FINALIZED)
      // ---------------------
      '"horror novel"',
      '"haunted house horror novel"',
      '"survival horror novel"',

      // ---------------------
      // HISTORICAL FICTION
      // ---------------------
      '"world war 2 fiction"',
      '"world war 1 fiction"',
      '"ancient rome novel"',
      '"ancient greece novel"',
      '"war of the roses novel"',
      '"crusades historical fiction"',
      '"norman conquest novel"',
      '"19th century american novel"',
      '"american society novel 19th century"',
    ]),
  };
}

async function fetchJsonWithTimeout(url: string, timeoutMs: number): Promise<any> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const resp = await fetch(url, {
      signal: controller.signal,
      headers: {
        Accept: "application/json",
      },
    });
    if (!resp.ok) throw new Error(`Open Library error: ${resp.status}`);
    return await resp.json();
  } finally {
    clearTimeout(timer);
  }
}

export async function getOpenLibraryRecommendations(input: RecommenderInput): Promise<RecommendationResult> {
  console.log("🔥 OPEN LIBRARY EXECUTING 🔥");

  const deckKey = input.deckKey;
  const finalLimit = Math.max(1, Math.min(40, input.limit ?? 12));
  const fetchLimit = Math.max(40, Math.min(160, Math.max(finalLimit * 6, (input.limit ?? 12) * 4)));
  const timeoutMs = Math.max(2500, Math.min(20000, input.timeoutMs ?? 12000));

  const explicitBucketPlan = (input as any)?.bucketPlan as { queries?: string[]; domainMode?: RecommendationResult["domainMode"]; bucketId?: string } | undefined;
  const fallbackBucketPlan = getBucketQueries(deckKey, input);
  const queriesToTry = Array.isArray(explicitBucketPlan?.queries) && explicitBucketPlan?.queries.length
    ? explicitBucketPlan.queries
    : fallbackBucketPlan.queries;
  const domainMode = explicitBucketPlan?.domainMode || fallbackBucketPlan.domainMode;
  console.log("[OL BUCKETS]", queriesToTry);
  let builtFromQuery = queriesToTry[0] || "";

  const minCandidateFloor = Math.max(
    0,
    Math.min(fetchLimit, Number((input as any)?.minCandidateFloor ?? 0) || 0)
  );

  const minQueryPassesBeforeEarlyExit = deckKey === "ms_hs" ? 4 : 1;

  let bestDocsRaw: any[] = [];
  let bestQuery = builtFromQuery;
  const collectedDocsRaw: any[] = [];
  const seenKeys = new Set<string>();
  let lastError: Error | null = null;

  for (let queryIndex = 0; queryIndex < queriesToTry.length; queryIndex += 1) {
    const rawQ = queriesToTry[queryIndex];
    const q = toOpenLibraryQuery(rawQ);
    const url =
      `/api/openlibrary?q=${encodeURIComponent(q)}&limit=${encodeURIComponent(String(fetchLimit))}`;

    try {
      const data = await fetchJsonWithTimeout(url, timeoutMs);
      const docsRaw = Array.isArray(data?.docs) ? data.docs : [];
      const admittedDocsRaw = docsRaw.filter((d: any) => {
        const publishers = Array.isArray(d?.publisher) ? d.publisher : [];
        if (publishers.some((p: any) => isHardSelfPublished(p))) return false;

        const year = typeof d?.first_publish_year === "number" ? d.first_publish_year : undefined;

        // Hard cutoff: eliminate pre-1980 records before they reach downstream ranking.
        if (year && year < 1980) return false;

        return true;
      });

      if (admittedDocsRaw.length > bestDocsRaw.length) {
        bestDocsRaw = admittedDocsRaw;
        bestQuery = q;
      }

      const minTeenBackfillPasses = deckKey === "ms_hs" ? 4 : 1;

      const shouldBackfillFromThisQuery =
        queryIndex < minTeenBackfillPasses ||
        collectedDocsRaw.length < Math.max(minCandidateFloor, finalLimit * 2);

      if (shouldBackfillFromThisQuery) {
        for (const d of admittedDocsRaw) {
          const key = String(d?.key || `${d?.title || "unknown"}|${queryIndex}`);
          if (seenKeys.has(key)) continue;
          seenKeys.add(key);
          collectedDocsRaw.push({
            ...d,
            queryRung: queryIndex,
            queryText: q,
            source: "openLibrary",
          });
        }
      }

      if (queryIndex + 1 >= minQueryPassesBeforeEarlyExit && admittedDocsRaw.length >= Math.max(finalLimit, minCandidateFloor)) {
        break;
      }

      if (collectedDocsRaw.length >= Math.max(fetchLimit, minCandidateFloor)) {
        break;
      }
    } catch (err: any) {
      lastError = err instanceof Error ? err : new Error(String(err?.message || err || "Unknown Open Library error"));
      continue;
    }
  }

  const docsRaw = collectedDocsRaw.length ? collectedDocsRaw : bestDocsRaw;
  builtFromQuery = bestQuery;

  if (!docsRaw.length && lastError) {
    throw lastError;
  }

  const docs: RecommendationDoc[] = docsRaw
    .filter((d: any) => d && d.title)
    .map((d: any) => ({
      key: d.key,
      title: d.title,
      author_name: Array.isArray(d.author_name) ? d.author_name : undefined,
      first_publish_year: typeof d.first_publish_year === "number" ? d.first_publish_year : undefined,
      cover_i: d.cover_i,
      subject: Array.isArray(d.subject) ? d.subject : undefined,
      edition_count: typeof d.edition_count === "number" ? d.edition_count : undefined,
      publisher: Array.isArray(d.publisher) ? d.publisher : undefined,
      language: Array.isArray(d.language) ? d.language : undefined,
      ebook_access: typeof d.ebook_access === "string" ? d.ebook_access : undefined,
      source: "openLibrary",
      queryRung: Number.isFinite(Number(d.queryRung)) ? Number(d.queryRung) : undefined,
      queryText: typeof d.queryText === "string" ? d.queryText : undefined,
    }));

  return {
    engineId: "openLibrary",
    engineLabel: "Open Library",
    deckKey,
    domainMode,
    builtFromQuery,
    items: docs.map((doc) => ({ kind: "open_library", doc })),
  };
}