import type { RecommenderInput, RecommendationResult, RecommendationDoc, StructuredFetchRung } from "../types";

function normalizeText(value: unknown): string {
  return String(value || "").toLowerCase().replace(/\s+/g, " ").trim();
}

function dedupeQueries(queries: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];

  for (const q of queries) {
    const t = String(q || "").trim();
    if (!t) continue;

    const key = t.toLowerCase();
    if (seen.has(key)) continue;

    seen.add(key);
    out.push(t);
  }

  return out;
}

function quoteQuery(query: string): string {
  const cleaned = String(query || "").trim();
  return cleaned ? `"${cleaned}"` : "";
}

function rungToOpenLibraryQuery(rung: StructuredFetchRung): string {
  return quoteQuery(String(rung?.query || rung?.primary || ""));
}

function hasUsableSignal(input: RecommenderInput): boolean {
  if (input.bucketPlan?.rungs?.some(rung => String(rung?.query || rung?.primary || "").trim())) {
    return true;
  }

  if (Array.isArray(input.bucketPlan?.queries) && input.bucketPlan!.queries.some(q => String(q || "").trim())) {
    return true;
  }

  return false;
}

function buildQueries(input: RecommenderInput): string[] {
  if (input.bucketPlan?.rungs?.length) {
    return dedupeQueries(input.bucketPlan.rungs.map(rungToOpenLibraryQuery).filter(Boolean));
  }

  if (Array.isArray(input.bucketPlan?.queries)) {
    return dedupeQueries(input.bucketPlan.queries.map(quoteQuery).filter(Boolean));
  }

  return [];
}

function isGarbage(doc: any): boolean {
  const title = normalizeText(doc?.title);
  const author = normalizeText(Array.isArray(doc?.author_name) ? doc.author_name[0] : doc?.author_name);

  if (!title || !author) return true;

  const text = [
    title,
    author,
    Array.isArray(doc?.subject) ? doc.subject.join(" ") : "",
    Array.isArray(doc?.publisher) ? doc.publisher.join(" ") : ""
  ]
    .map(normalizeText)
    .join(" ");

  if (/\b(summary|analysis|study guide|review|criticism|notes|workbook)\b/i.test(text)) return true;
  if (/\b(anthology|collection of stories|short stories|essays)\b/i.test(text)) return true;

  return false;
}

async function fetchJson(url: string): Promise<any> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`OpenLibrary error ${res.status}`);
  return res.json();
}

export async function getOpenLibraryRecommendations(
  input: RecommenderInput
): Promise<RecommendationResult> {
  const queries = buildQueries(input);
  const docsRaw: any[] = [];
  const limit = input.limit || 12;

  if (!hasUsableSignal(input) || !queries.length) {
    return {
      engineId: "openLibrary",
      engineLabel: "Open Library",
      deckKey: input.deckKey,
      domainMode: "default",
      builtFromQuery: "",
      items: []
    };
  }

  for (let i = 0; i < queries.length; i++) {
    const q = queries[i];
    const url = `/api/openlibrary?q=${encodeURIComponent(q)}&limit=100`;

    const data = await fetchJson(url);
    const docs = Array.isArray(data?.docs) ? data.docs : [];

    for (const d of docs) {
      if (isGarbage(d)) continue;

      docsRaw.push({
        ...d,
        queryText: q,
        queryRung: i,
        source: "openLibrary"
      });
    }

    if (docsRaw.length >= Math.max(limit * 5, 60)) break;
  }

  const seenKeys = new Set<string>();

  const items: RecommendationDoc[] = docsRaw
    .filter(d => d.title && d.key)
    .filter(d => {
      const key = String(d.key);
      if (seenKeys.has(key)) return false;
      seenKeys.add(key);
      return true;
    })
    .slice(0, limit)
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
