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

function simplifyOpenLibraryQuery(query: string): string {
  const cleaned = normalizeText(query);
  if (!cleaned) return "";
  return cleaned
    .replace(/\b(psychological|character[-\s]?driven|philosophical|literary|emotional|atmospheric|dark|gritty)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function expandOpenLibraryLaneQueries(query: string, family: string): string[] {
  const cleaned = normalizeText(query);
  if (!cleaned) return [];

  const lanes: string[] = [cleaned];

  if (family === "thriller") {
    lanes.push(
      "psychological thriller",
      "suspense fiction",
      "crime fiction",
      "mystery thriller",
      "psychological fiction",
      "character driven thriller"
    );
  }

  if (family === "horror") lanes.push("psychological horror", "supernatural horror fiction");
  if (family === "fantasy") lanes.push("dark fantasy", "epic fantasy");
  if (family === "speculative") lanes.push("science fiction", "speculative fiction");
  if (family === "romance") lanes.push("romance fiction", "contemporary romance");
  if (family === "historical") lanes.push(
    "historical fiction novel",
    "19th century historical fiction novel",
    "war historical fiction novel",
    "society historical fiction novel"
  );

  return dedupeQueries(lanes);
}

function fallbackQueryForFamily(family: string): string {
  if (family === "thriller") return "psychological thriller novel";
  if (family === "horror") return "psychological horror novel";
  if (family === "fantasy") return "dark fantasy novel";
  if (family === "romance") return "contemporary romance novel";
  if (family === "historical") return "historical fiction novel";
  if (family === "speculative") return "speculative fiction novel";
  return "fiction novel";
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
  // Do not wrap Open Library searches in quotes. Exact-phrase queries are too
  // brittle for OL and were returning empty pools for useful intent queries
  // like murder investigation novel. Keep the query short, but broad enough
  // for OL to contribute diversity.
  return cleaned;
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
  const family = inferFamily(input);
  const canonicalHistoricalPack = [
    "historical fiction novel",
    "19th century historical fiction novel",
    "war historical fiction novel",
    "society historical fiction novel",
  ];

  const historicalIntentText = [
    input.bucketPlan?.preview,
    ...(Array.isArray(input.bucketPlan?.queries) ? input.bucketPlan.queries : []),
    ...(Array.isArray(input.bucketPlan?.rungs) ? input.bucketPlan.rungs.map((r) => String(r?.query || r?.primary || "")) : []),
  ].filter(Boolean).join(" ").toLowerCase();
  const historicalIntentDetected =
    family === "historical" ||
    /\b(historical fiction|historical novel|19th century|period fiction|civil war|world war|gilded age|victorian|war historical fiction|society historical fiction)\b/.test(historicalIntentText);

  if (historicalIntentDetected) {
    const rungSeeds = dedupeQueries(
      (Array.isArray(input.bucketPlan?.rungs) ? input.bucketPlan.rungs : [])
        .map((r) => String(r?.query || r?.primary || "").trim().toLowerCase())
        .filter((q) => /\bhistorical fiction novel\b/.test(q))
    );
    return dedupeQueries([...rungSeeds, ...canonicalHistoricalPack]).slice(0, 4);
  }

  if (input.bucketPlan?.rungs?.length) {
    const base = dedupeQueries(input.bucketPlan.rungs.map(rungToOpenLibraryQuery).filter(Boolean));
    const expanded = dedupeQueries(base.flatMap((q) => expandOpenLibraryLaneQueries(q, family)));
    const simplified = base.map(simplifyOpenLibraryQuery).filter(Boolean);
    return dedupeQueries([...expanded, ...simplified, fallbackQueryForFamily(family)]).slice(0, 10);
  }

  if (Array.isArray(input.bucketPlan?.queries)) {
    const base = dedupeQueries(input.bucketPlan.queries.map(quoteQuery).filter(Boolean));
    const expanded = dedupeQueries(base.flatMap((q) => expandOpenLibraryLaneQueries(q, family)));
    const simplified = base.map(simplifyOpenLibraryQuery).filter(Boolean);
    return dedupeQueries([...expanded, ...simplified, fallbackQueryForFamily(family)]).slice(0, 10);
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

  if (/\b(summary|analysis|study guide|review|criticism|notes|workbook)\b/i.test(text)) return true;
  if (/\b(anthology|collection of stories|short stories|essays)\b/i.test(text)) return true;
  if (/\b(readings?|reader|companion|guide|reference|bibliography|catalogue?|catalog|survey|history and criticism|literary criticism)\b/i.test(text)) return true;

  if (family === "historical") {
    const primaryOrNonFiction =
      /\b(history|meditations|tao te ching|art of war|philosophy|biography|letters|primary source|treatise)\b/.test(text);
    const nonHistoricalBleed =
      /\b(harry potter|wizard|witch|dragon|magic school|science fiction|time machine|space opera|dystopian)\b/.test(text);
    const hasHistoricalSetting =
      /\b(historical fiction|historical novel|19th century|victorian|civil war|world war|regency|gilded age|war|society|monarchy|empire)\b/.test(text);
    const hasNarrativeShape = /\b(novel|fiction|story|follows|chronicle)\b/.test(text);
    if (primaryOrNonFiction) return true;
    if (nonHistoricalBleed && !hasHistoricalSetting) return true;
    if (!hasHistoricalSetting && !hasNarrativeShape) return true;
  }
  if (/\b(readings?\b.*\b(novel|fiction|literature)|century readings?\b.*\bnovel|redefining\b.*\bfiction|(life|women|race|gender|class)\b.*\bin fiction)\b/i.test(title)) return true;
  if (/\b(new suspense novel|new thriller novel|untitled|unknown title|book \d+|novel \d+)\b/i.test(title)) return true;
  if (/^\s*(the\s+)?(novel|book|collection|megapack)\s*$/i.test(title)) return true;
  if (/\b(novel|book|collection|megapack)\b/i.test(title) && title.split(" ").length <= 3) return true;

  const ratingsCount = Number((doc as any)?.ratings_count || (doc as any)?.ratingsCount || 0);
  const firstSentence = normalizeText(Array.isArray(doc?.first_sentence) ? doc.first_sentence.join(" ") : doc?.first_sentence);
  if (!firstSentence && ratingsCount === 0) {
    const hasSubjectSignal = Array.isArray(doc?.subject) && doc.subject.length > 0;
    const hasEditionSignal = Number(doc?.edition_count || 0) >= 2;
    if (!hasSubjectSignal && !hasEditionSignal && !hasOpenLibraryCoverSignal(doc)) return true;
  }

  if (family === "fantasy") {
    const obviousFantasySignal =
      /\b(fantasy|magic|wizard|witch|dragon|fae|mythic|quest|kingdom|sword|sorcery|epic fantasy|high fantasy|dark fantasy)\b/.test(text);
    const classicFantasyTitle =
      /\b(the hobbit|the fellowship of the ring|the two towers|the return of the king|a wizard of earthsea|dragonflight|the name of the wind)\b/.test(title);
    if (obviousFantasySignal || classicFantasyTitle) return false;
  }

  return false;
}

async function fetchJson(url: string): Promise<{ ok: boolean; status: number; data: any }> {
  const res = await fetch(url);
  const data = await res.json();
  return { ok: res.ok, status: res.status, data };
}

export async function getOpenLibraryRecommendations(
  input: RecommenderInput
): Promise<RecommendationResult> {
  const queries = buildQueries(input);
  const family = (() => {
    const inferred = inferFamily(input);
    const text = queries.join(" ").toLowerCase();
    if (inferred === "historical" || /\bhistorical fiction novel|19th century historical fiction novel|war historical fiction novel|society historical fiction novel\b/.test(text)) {
      return "historical";
    }
    return inferred;
  })();
  const docsRaw: any[] = [];
  let rawFetchedTotal = 0;
  const limit = input.limit || 12;
  const intakeLimit = Math.max(limit * 2, 24);
  const sourceEnabled = (input as any)?.sourceEnabled || {};
  console.log("[OPEN_LIBRARY_ENABLED]", { enabled: sourceEnabled?.openLibrary !== false });
  console.log("[OPEN_LIBRARY_QUERY_LANES]", queries);

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
    let docs: any[] = [];
    console.log("[OPEN_LIBRARY_URL]", url);
    try {
      const response = await fetchJson(url);
      console.log("[OPEN_LIBRARY_HTTP_STATUS]", { query: q, status: response.status });
      if (!response.ok) throw new Error(`OpenLibrary error ${response.status}`);
      docs = Array.isArray(response.data?.docs) ? response.data.docs : [];
      rawFetchedTotal += docs.length;
      console.log("[OPEN_LIBRARY_RAW_COUNT]", { query: q, rawCount: docs.length, accumulatedRawCount: rawFetchedTotal });
      console.log("[OPEN_LIBRARY_FIRST_3_RESULTS]", docs.slice(0, 3).map((doc: any) => ({
        title: doc?.title,
        author: Array.isArray(doc?.author_name) ? doc.author_name[0] : doc?.author_name,
        key: doc?.key,
      })));
    } catch (error: any) {
      console.warn("[OPEN_LIBRARY_FETCH_WARNING]", {
        query: q,
        error: error?.message || String(error),
      });
      continue;
    }

    for (const d of docs) {
      if (isGarbage(d, family)) continue;

      docsRaw.push({
        ...d,
        queryText: q,
        queryRung: i,
        source: "openLibrary",
        queryFamily: family === "historical" ? "historical" : family,
        filterFamily: family === "historical" ? "historical" : family,
        laneKind: family === "historical" ? "historical" : "openlibrary",
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
      queryRung: d.queryRung,
      queryFamily: d.queryFamily,
      filterFamily: d.filterFamily,
      laneKind: d.laneKind,
    }))
    .filter((doc) => {
      if (!doc.title) return false;
      const hasKnownAuthor = Array.isArray(doc.author_name) ? doc.author_name.length > 0 : false;
      const firstSentence = normalizeText(Array.isArray((doc as any)?.first_sentence) ? (doc as any).first_sentence.join(" ") : (doc as any)?.first_sentence);
      const ratingsCount = Number((doc as any)?.ratings_count || (doc as any)?.ratingsCount || 0);
      const subjectText = Array.isArray((doc as any)?.subject) ? (doc as any).subject.join(" ").toLowerCase() : "";
      const historicalSubjectSignal = /\b(historical fiction|historical novel|19th century|victorian|civil war|world war|gilded age)\b/.test(subjectText);
      return hasKnownAuthor || firstSentence.length >= 60 || ratingsCount > 0 || (family === "historical" && historicalSubjectSignal);
    });

  return {
    engineId: "openLibrary",
    engineLabel: "Open Library",
    deckKey: input.deckKey,
    domainMode: "default",
    builtFromQuery: queries[0] || "",
    items: items.map(doc => ({ kind: "open_library", doc })),
    debugRawFetchedCount: rawFetchedTotal,
    debugRawPool: docsRaw.slice(0, intakeLimit).map((d) => ({
      title: d.title,
      author: Array.isArray(d.author_name) ? d.author_name[0] : d.author_name,
      source: "openLibrary",
      queryText: d.queryText,
      queryRung: d.queryRung,
      queryFamily: d.queryFamily,
      filterFamily: d.filterFamily,
      laneKind: d.laneKind,
      key: d.key
    }))
  };
}
