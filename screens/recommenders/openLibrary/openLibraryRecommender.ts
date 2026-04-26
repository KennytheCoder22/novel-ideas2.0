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


function inferFamily(input: RecommenderInput): "fantasy" | "horror" | "thriller" | "speculative" | "romance" | "historical" | "general" {
  const text = [
    input.bucketPlan?.preview,
    ...(Array.isArray(input.bucketPlan?.queries) ? input.bucketPlan.queries : []),
    ...(Array.isArray((input.bucketPlan as any)?.signals?.genres) ? (input.bucketPlan as any).signals.genres : []),
    ...(Array.isArray((input.bucketPlan as any)?.signals?.tones) ? (input.bucketPlan as any).signals.tones : []),
    ...(Array.isArray((input.bucketPlan as any)?.signals?.scenarios) ? (input.bucketPlan as any).signals.scenarios : []),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  if (/(epic fantasy|high fantasy|magic fantasy|quest fantasy|character driven fantasy|dark fantasy|fantasy|wizard|witch|dragon|fae|mythic)/.test(text)) return "fantasy";
  if (/(psychological horror|survival horror|haunted house horror|horror|haunted|ghost|supernatural|occult|monster|terror|dread)/.test(text)) return "horror";
  if (/(thriller|mystery|crime|detective|suspense|murder|investigation)/.test(text)) return "thriller";
  if (/(science fiction|sci-fi|speculative|dystopian|space opera|technology|ai|artificial intelligence)/.test(text)) return "speculative";
  if (/(romance|love story)/.test(text)) return "romance";
  if (/(historical|period fiction|gilded age|19th century|world war)/.test(text)) return "historical";
  return "general";
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


function hasOpenLibraryCoverSignal(doc: any): boolean {
  return Boolean(doc?.cover_i || doc?.cover_edition_key || doc?.edition_key?.length);
}

function looksLikeNoCoverMetaOpenLibraryCandidate(doc: any): boolean {
  if (hasOpenLibraryCoverSignal(doc)) return false;

  const title = normalizeText(doc?.title);
  const author = normalizeText(Array.isArray(doc?.author_name) ? doc.author_name[0] : doc?.author_name);
  const subjects = Array.isArray(doc?.subject) ? doc.subject.map(normalizeText).join(" ") : "";
  const publishers = Array.isArray(doc?.publisher) ? doc.publisher.map(normalizeText).join(" ") : "";
  const firstSentence = normalizeText(Array.isArray(doc?.first_sentence) ? doc.first_sentence.join(" ") : doc?.first_sentence);
  const text = [title, author, subjects, publishers, firstSentence].filter(Boolean).join(" ");

  const metaShape =
    /\b(readings?|reader|criticism|critical|study|studies|analysis|essays?|companion|guide|reference|bibliography|catalogue?|catalog|survey|history of|history and criticism|in fiction|historical novels?|literary criticism)\b/.test(text) ||
    /\b(readings?\b.*\b(novel|fiction|literature)|century readings?\b.*\bnovel|redefining\b.*\bfiction|(life|women|race|gender|class)\b.*\bin fiction)\b/.test(title);

  const editionCount = Number(doc?.edition_count || 0);
  const firstPublishYear = Number(doc?.first_publish_year || 0);
  const hasSparseShape = !subjects && !firstSentence && editionCount <= 1;

  return metaShape || (hasSparseShape && firstPublishYear > 0 && /\b(novel|fiction|literature)\b/.test(text) && !/\b(thriller|mystery|horror|fantasy|romance|detective|suspense)\b/.test(text));
}

function isGarbage(doc: any, family: string): boolean {
  const title = normalizeText(doc?.title);
  const author = normalizeText(Array.isArray(doc?.author_name) ? doc.author_name[0] : doc?.author_name);

  if (!title || !author) return true;
  if (looksLikeNoCoverMetaOpenLibraryCandidate(doc)) return true;

  const text = [
    title,
    author,
    Array.isArray(doc?.subject) ? doc.subject.join(" ") : "",
    Array.isArray(doc?.publisher) ? doc.publisher.join(" ") : ""
  ]
    .map(normalizeText)
    .join(" ");

  if (/(summary|analysis|study guide|review|criticism|notes|workbook)/i.test(text)) return true;
  if (/(anthology|collection of stories|short stories|essays)/i.test(text)) return true;
  if (/\b(readings?|reader|companion|guide|reference|bibliography|catalogue?|catalog|survey|history and criticism|literary criticism)\b/i.test(text)) return true;
  if (/\b(readings?\b.*\b(novel|fiction|literature)|century readings?\b.*\bnovel|redefining\b.*\bfiction|(life|women|race|gender|class)\b.*\bin fiction)\b/i.test(title)) return true;

  if (family === "fantasy") {
    const obviousFantasySignal =
      /(fantasy|magic|wizard|witch|dragon|fae|mythic|quest|kingdom|sword|sorcery|epic fantasy|high fantasy|dark fantasy)/.test(text);
    const classicFantasyTitle =
      /(the hobbit|the fellowship of the ring|the two towers|the return of the king|a wizard of earthsea|dragonflight|the name of the wind)/.test(title);
    if (obviousFantasySignal || classicFantasyTitle) return false;
  }

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
  const family = inferFamily(input);
  const docsRaw: any[] = [];
  const limit = input.limit || 12;
  const intakeLimit = Math.max(limit * 2, 24);

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
    const url = `/api/openlibrary?q=${encodeURIComponent(q)}&limit=40`;

    const data = await fetchJson(url);
    const docs = Array.isArray(data?.docs) ? data.docs : [];

    for (const d of docs) {
      if (isGarbage(d, family)) continue;

      docsRaw.push({
        ...d,
        queryText: q,
        queryRung: i,
        source: "openLibrary"
      });
    }

    if (docsRaw.length >= Math.max(limit * 3, 36)) break;
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
    .slice(0, intakeLimit)
    .map(d => ({
      key: d.key,
      title: d.title,
      author_name: d.author_name,
      first_publish_year: d.first_publish_year,
      cover_i: d.cover_i,
      subject: d.subject,
      publisher: d.publisher,
      language: d.language,
      edition_count: d.edition_count,
      first_sentence: d.first_sentence,
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
    items: items.map(doc => ({ kind: "open_library", doc })),
    debugRawFetchedCount: docsRaw.length,
    debugRawPool: docsRaw.slice(0, intakeLimit).map((d) => ({
      title: d.title,
      author: Array.isArray(d.author_name) ? d.author_name[0] : d.author_name,
      source: "openLibrary",
      queryText: d.queryText,
      queryRung: d.queryRung,
      key: d.key
    }))
  };
}
