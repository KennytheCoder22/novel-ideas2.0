// CLEAN OpenLibrary recommender (bias-neutral)

import type { RecommenderInput, RecommendationResult, RecommendationDoc, DeckKey, StructuredFetchRung } from "../types";

function normalizeText(value: any): string {
  return String(value || "").toLowerCase().replace(/\s+/g, " ").trim();
}

function dedupeQueries(queries: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const q of queries) {
    const t = String(q || "").trim().toLowerCase();
    if (!t || seen.has(t)) continue;
    seen.add(t);
    out.push(t);
  }
  return out;
}

// 🔧 FIXED — NO genre forcing
function rungToOpenLibraryQuery(rung: StructuredFetchRung): string {
  const base = String(rung?.query || rung?.primary || "").trim();
  return base ? `"${base}"` : `"fiction novel"`;
}

// 🔧 FIXED — NO genre forcing
function fallbackToOpenLibraryQuery(query: string): string {
  const cleaned = String(query || "").trim();
  return cleaned ? `"${cleaned}"` : `"fiction novel"`;
}

// 🔧 FIXED — neutral buckets
function getBucketQueries(deckKey: DeckKey): string[] {
  if (deckKey === "k2") {
    return dedupeQueries([
      `"juvenile fiction"`,
      `"chapter books"`,
      `"middle grade fiction"`
    ]);
  }

  if (deckKey === "36") {
    return dedupeQueries([
      `"middle grade fiction"`,
      `"juvenile fiction"`
    ]);
  }

  if (deckKey === "ms_hs") {
    return dedupeQueries([
      `"young adult fiction"`,
      `"young adult novel"`
    ]);
  }

  // ADULT (fixed)
  return dedupeQueries([
    `"fiction novel"`,
    `"contemporary fiction"`,
    `"popular novel"`
  ]);
}

// 🔧 Keep filtering but neutral
function isGarbage(d: any): boolean {
  const title = normalizeText(d?.title);
  const author = normalizeText(Array.isArray(d?.author_name) ? d.author_name[0] : d?.author_name);

  if (!title || !author) return true;

  const text = `${title} ${author}`;

  if (/\b(summary|analysis|study guide|review|criticism)\b/i.test(text)) return true;

  return false;
}

// 🔧 Anchor filtering FIXED
function isAcceptableAnchor(d: any): boolean {
  const text = normalizeText(d?.title) + " " +
               (Array.isArray(d?.subject) ? d.subject.join(" ") : "");

  return /\b(novel|fiction)\b/i.test(text);
}

async function fetchJson(url: string): Promise<any> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`OpenLibrary error ${res.status}`);
  return res.json();
}

export async function getOpenLibraryRecommendations(
  input: RecommenderInput
): Promise<RecommendationResult> {

  const queries =
    input.bucketPlan?.rungs?.length
      ? input.bucketPlan.rungs.map(rungToOpenLibraryQuery)
      : (input.bucketPlan?.queries || getBucketQueries(input.deckKey));

  const docsRaw: any[] = [];

  for (let i = 0; i < queries.length; i++) {
    const q = queries[i];

    const url = `/api/openlibrary?q=${encodeURIComponent(q)}&limit=100`;

    const data = await fetchJson(url);

    const docs = Array.isArray(data?.docs) ? data.docs : [];

    for (const d of docs) {
      if (isGarbage(d)) continue;

      if (/\b(bestselling|popular)\b/i.test(q)) {
        if (!isAcceptableAnchor(d)) continue;
      }

      docsRaw.push({
        ...d,
        queryText: q,
        queryRung: i,
        source: "openLibrary"
      });
    }

    if (docsRaw.length >= 60) break;
  }

  const items: RecommendationDoc[] = docsRaw
    .filter(d => d.title)
    .slice(0, input.limit || 12)
    .map(d => ({
      key: d.key,
      title: d.title,
      author_name: d.author_name,
      first_publish_year: d.first_publish_year,
      cover_i: d.cover_i,
      subject: d.subject,
      source: "openLibrary",
      queryText: d.queryText,
      queryRung: d.queryRung
    }));

  return {
    engineId: "openLibrary",
    engineLabel: "Open Library",
    deckKey: input.deckKey,
    domainMode: "default",
    builtFromQuery: queries[0] || "",
    items: items.map(doc => ({ kind: "open_library", doc }))
  };
}