import type { SourceAdapterV2, SourceDiagnosticV2, SourceFetchDiagnosticV2, SourcePlan, SourceResult, TasteProfile } from "../types";

const GOOGLE_BOOKS_API_BASE = "https://www.googleapis.com/books/v1/volumes";
const GOOGLE_BOOKS_ADAPTER_VERSION = "v4";
const GOOGLE_BOOKS_RESPONSE_BODY_PREFIX_LIMIT = 240;
const GOOGLE_BOOKS_MAX_RESULTS_PER_QUERY = 10;

function nowIso(): string {
  return new Date().toISOString();
}

function parsePublicationYear(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return Number(value);
  const match = String(value || "").match(/\b(18|19|20)\d{2}\b/);
  return match ? Number(match[0]) : undefined;
}

function normalizeQuery(value: unknown): string {
  return String(value || "")
    .toLowerCase()
    .replace(/["']/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeText(value: unknown): string {
  return String(value || "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function queryFamilyFromQuery(query: string): string {
  const normalized = normalizeQuery(query);
  if (/\b(thriller|suspense|conspiracy|manhunt|abduction)\b/.test(normalized)) return "thriller";
  if (/\b(mystery|detective|whodunit|private investigator)\b/.test(normalized)) return "mystery";
  if (/\b(horror|haunted|occult|ghost|supernatural)\b/.test(normalized)) return "horror";
  if (/\b(science fiction|dystopian|space opera|speculative)\b/.test(normalized)) return "science_fiction";
  if (/\b(fantasy|magic|dragon|gothic fantasy)\b/.test(normalized)) return "fantasy";
  if (/\b(romance|love story|relationship)\b/.test(normalized)) return "romance";
  if (/\b(historical|period fiction|civil war|19th century)\b/.test(normalized)) return "historical";
  return "general";
}

function stringArray(values: unknown): string[] {
  if (!Array.isArray(values)) return [];
  return values.map((item) => String(item || "").trim()).filter(Boolean);
}

function descriptionFromVolume(row: Record<string, unknown>, volumeInfo: Record<string, unknown>): string {
  if (typeof volumeInfo.description === "string") return volumeInfo.description;
  if (typeof (row.searchInfo as Record<string, unknown> | undefined)?.textSnippet === "string") {
    return String((row.searchInfo as Record<string, unknown>).textSnippet);
  }
  return "";
}

function categoryText(categories: string[]): string {
  return categories.map((value) => normalizeText(value)).filter(Boolean).join(" | ");
}

function hasFictionCategoryEvidence(categories: string[]): boolean {
  return /\b(fiction|novel|stories|detective and mystery|mystery|thriller|fantasy|science fiction|historical fiction|romance fiction|horror tales|adventure stories|speculative)\b/i.test(categoryText(categories));
}

function hasNarrativeDescriptionEvidence(description: string): boolean {
  const text = normalizeText(description);
  if (text.length < 80) return false;
  return /\b(follows|story of|tells the story|centers on|must survive|must uncover|must confront|must choose|must save|when\b|after\b|before\b|protagonist|heroine|hero|detective|character|characters|sisters?|brothers?|family saga)\b/.test(text);
}

function hasFictionPublisherEvidence(publisher: string): boolean {
  const text = normalizeText(publisher);
  return /\b(penguin|random house|knopf|doubleday|viking|harper|macmillan|tor|simon\s*&?\s*schuster|hachette|st\.? martin|ballantine|minotaur|mysterious press|little brown|grand central|sourcebooks|kensington|crooked lane|berkley|delacorte|del rey|orbit|ace|roc|anchor|scribner|atria|william morrow|putnam|mulholland|flatiron)\b/.test(text);
}

function googleBooksPeriodicalCorroboration(titleText: string, subtitleText: string, normalizedDescription: string, categoriesText: string, combined: string): string[] {
  const text = [titleText, subtitleText].join(" ").trim();
  const signals: string[] = [];
  if (/\bmagazine\b/.test(text)) signals.push("title_magazine");
  if (/\bjournal\b/.test(text)) signals.push("title_journal");
  if (/\bissue\b/.test(text)) signals.push("title_issue");
  if (/\b(?:january|february|march|april|may|june|july|august|september|october|november|december)\s+\d{4}\b/.test(text)) signals.push("title_month_year");
  if (/\b(periodicals?|serial publications?|magazines?|journals?)\b/.test(categoriesText)) signals.push("category_periodical");
  if (/\b(?:monthly|bimonthly|quarterly|special issue|annual issue)\b/.test(normalizedDescription)) signals.push("description_periodical_shape");
  if (/\bissn\b/.test(combined)) signals.push("issn_marker");
  return Array.from(new Set(signals));
}

function googleBooksArtifactReasons(title: string, subtitle: string, description: string, categories: string[], publisher: string): string[] {
  const reasons: string[] = [];
  const titleText = normalizeText([title, subtitle].filter(Boolean).join(" "));
  const subtitleText = normalizeText(subtitle);
  const normalizedDescription = normalizeText(description);
  const normalizedPublisher = normalizeText(publisher);
  const categoriesText = categoryText(categories);
  const combined = [titleText, normalizedDescription, categoriesText, normalizedPublisher].filter(Boolean).join(" | ");
  const fictionEvidence = hasFictionCategoryEvidence(categories)
    || hasNarrativeDescriptionEvidence(description)
    || /\b(novel|fiction|story|thriller|mystery|fantasy|romance|science fiction|historical fiction)\b/.test(titleText)
    || hasFictionPublisherEvidence(publisher);

  const annualAnthologyPhrase = /\b(year'?s best|years best|best of the year|annual (?:collection|antholog(?:y|ies))|(?:\d{1,2}(?:st|nd|rd|th)\s+)?annual collection)\b/;
  const anthologyMarker = /\b(antholog(?:y|ies)|edited collection)\b/;
  const anthologyCorroboration = /\b(annual|year'?s best|years best|best of the year|edited by|editor(?:ial)?|selected by)\b/;
  if (
    annualAnthologyPhrase.test(titleText)
    || annualAnthologyPhrase.test(subtitleText)
    || ((anthologyMarker.test(titleText) || anthologyMarker.test(subtitleText)) && anthologyCorroboration.test(`${subtitleText} ${categoriesText} ${normalizedDescription}`))
  ) {
    reasons.push("artifact_annual_anthology_collection");
  }

  if (
    /\b(writer'?s market|writers'? handbook|guide to literary agents|children'?s writer'?s and illustrator'?s market|places to sell manuscripts?|markets?\s+for\s+writ(?:er|ers)|manuscript markets?|publishing opportunities|literary agents?\s+guide|writer directory|submission guide)\b/.test(combined)
  ) {
    reasons.push("artifact_writer_reference");
  }

  if (
    /\b(history of(?: [a-z-]+){0,4} literature|history of literature|literary history|criticism and interpretation|critical studies?|critical study|companion to|presenting young adult fiction|presenting young adult horror fiction|authors and artists for young adults|book reviews? of fiction|reviews? of fiction)\b/.test(combined)
  ) {
    reasons.push("artifact_literary_criticism_reference");
  }

  if (
    /\b(catalog(?:ue)?|bibliograph(?:y|ies)|directory|encyclopedia|dictionary|almanac|index)\b/.test(titleText)
    || /\b(reference|bibliographies? and indexes|catalogs?|directories)\b/.test(categoriesText)
  ) {
    reasons.push("artifact_reference_material");
  }
  if (/\b(literary criticism|history and criticism|criticism|critical essays?|study aids?|teacher resources?|teacher'?s guide|study guide|conference proceedings?|government reports?|textbook|textbooks|reference books?)\b/.test(categoriesText)) {
    reasons.push("artifact_academic_reference");
  }
  if (/\b(proceedings of|conference proceedings|government report|technical report|directory of|teacher resource|lesson plans?|classroom resource|for classroom use)\b/.test(combined)) {
    reasons.push("artifact_instructional_non_narrative");
  }
  // Reject academic/critical titles whose critical framing appears in the title itself.
  if (
    /\bthrough\s+(?:(?:\w+\s+){0,5})(?:literature|fiction)\b/.test(titleText)
    || /\b(?:understanding|exploring|examining|study\s+of|analysis\s+of)\s+(?:(?:\w+\s+){0,5})(?:through|in|via)\b/.test(titleText)
    || /\b(?:understanding|exploring|examining)\s+(?:(?:\w+\s+){0,5})(?:literature|fiction)\b/.test(titleText)
  ) {
    reasons.push("artifact_academic_criticism_title");
  }
  // Reject periodicals and magazine issues.
  // A bare "Vol. N" is not sufficient by itself (e.g., numbered fiction series volumes).
  const periodicalCorroboration = googleBooksPeriodicalCorroboration(titleText, subtitleText, normalizedDescription, categoriesText, combined);
  if (periodicalCorroboration.length > 0) {
    reasons.push("artifact_periodical");
  }
  // Reject writer/author directories when no fiction category corroborates novel identity.
  if (!fictionEvidence && /\b(?:fantasy|science[- ]fiction|horror|mystery|thriller|romance)\s+writers?\b/.test(titleText)) {
    reasons.push("artifact_writer_directory");
  }
  if (!fictionEvidence
    && /\b(nonfiction|non-fiction|biography|autobiography|memoir|essays?|history|philosophy|reference|business|language arts|education|study aids?|travel|self-help|psychology|political science|social science|science|medical|technology|computers?)\b/.test(categoriesText)
    && !/\b(true crime|narrative nonfiction)\b/.test(categoriesText)) {
    reasons.push("non_narrative_nonfiction");
  }
  if (!fictionEvidence
    && /\b(this (?:book|text|guide|reference|handbook)|an introduction to|a guide to|teaches readers|provides exercises|offers lesson plans|includes bibliographical references|course text|for students|for teachers)\b/.test(normalizedDescription)) {
    reasons.push("non_narrative_description_shape");
  }
  return Array.from(new Set(reasons));
}

function googleBooksArtifactDropReason(title: string, subtitle: string, description: string, categories: string[], publisher: string): string | undefined {
  return googleBooksArtifactReasons(title, subtitle, description, categories, publisher)[0];
}

function buildGoogleBooksFetchQuery(query: string): string {
  const normalized = normalizeQuery(query);
  if (!normalized) return normalized;
  const negatives = [
    '-"writer\'s market"',
    '-"writers\' handbook"',
    '-"guide to literary agents"',
    '-"children\'s writer\'s and illustrator\'s market"',
    '-catalog',
    '-catalogue',
    '-bibliography',
    '-directory',
    '-"literary criticism"',
    '-textbook',
    '-"study guide"',
    '-"teacher resource"',
    '-"teacher resources"',
    '-"conference proceedings"',
    '-"government report"',
  ];
  return `${normalized} ${negatives.join(" ")}`.replace(/\s+/g, " ").trim();
}

function getGoogleBooksApiKey(): string {
  return process.env.EXPO_PUBLIC_GOOGLE_BOOKS_API_KEY || process.env.NEXT_PUBLIC_GOOGLE_BOOKS_API_KEY || process.env.VITE_GOOGLE_BOOKS_API_KEY || process.env.GOOGLE_BOOKS_API_KEY || "";
}

async function fetchGoogleBooksJson(
  query: string,
  timeoutMs: number,
  signal?: AbortSignal
): Promise<{ json?: unknown; status?: number; bodyPrefix?: string; timedOut: boolean; failedReason?: string }> {
  const controller = new AbortController();
  const startedAt = Date.now();
  let parentAbortHandler: (() => void) | undefined;
  if (signal) {
    if (signal.aborted) {
      return { timedOut: false, failedReason: "aborted_before_fetch_start" };
    }
    parentAbortHandler = () => controller.abort();
    signal.addEventListener("abort", parentAbortHandler, { once: true });
  }

  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const params = new URLSearchParams({
      q: query,
      maxResults: String(GOOGLE_BOOKS_MAX_RESULTS_PER_QUERY),
      orderBy: "relevance",
      printType: "books",
      projection: "full",
      langRestrict: "en",
    });
    const apiKey = getGoogleBooksApiKey();
    if (apiKey) params.set("key", apiKey);
    const url = `${GOOGLE_BOOKS_API_BASE}?${params.toString()}`;
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: "application/json" },
    });
    const text = await response.text();
    const bodyPrefix = String(text || "").slice(0, GOOGLE_BOOKS_RESPONSE_BODY_PREFIX_LIMIT);
    if (!response.ok) {
      return {
        status: response.status,
        bodyPrefix,
        timedOut: false,
        failedReason: `http_${response.status}`,
      };
    }
    try {
      return {
        json: text ? JSON.parse(text) : {},
        status: response.status,
        bodyPrefix,
        timedOut: false,
      };
    } catch {
      return {
        status: response.status,
        bodyPrefix,
        timedOut: false,
        failedReason: "malformed_json_response",
      };
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error || "google_books_fetch_failed");
    const timedOut = controller.signal.aborted && Date.now() - startedAt >= timeoutMs - 25;
    return {
      timedOut,
      failedReason: timedOut ? "fetch_timeout" : message,
    };
  } finally {
    clearTimeout(timeout);
    if (signal && parentAbortHandler) signal.removeEventListener("abort", parentAbortHandler);
  }
}

function emptyDiagnostics(
  plan: SourcePlan,
  status: SourceResult["status"],
  startedAt: string,
  overrides?: Partial<SourceDiagnosticV2>
): SourceDiagnosticV2 {
  const finishedAt = nowIso();
  return {
    source: "googleBooks",
    status,
    planned: plan.enabled,
    attempted: status !== "skipped",
    timedOut: false,
    startedAt,
    finishedAt,
    elapsedMs: Date.parse(finishedAt) - Date.parse(startedAt),
    rawCount: 0,
    queries: plan.intents.map((intent) => String(intent.query || "")),
    googleBooksSourceQueries: plan.intents.map((intent) => String(intent.query || "")),
    googleBooksSourceFetchDiagnostics: [],
    googleBooksSourceRawApiResultCount: 0,
    googleBooksSourceNormalizedRowCount: 0,
    googleBooksSourceDroppedBeforeNormalization: 0,
    googleBooksSourceDropReasons: {},
    googleBooksSourceStatus: status,
    googleBooksSourceAdapterVersion: GOOGLE_BOOKS_ADAPTER_VERSION,
    ...overrides,
  };
}

export const googleBooksSourceAdapter: SourceAdapterV2 = {
  source: "googleBooks",
  async search(plan: SourcePlan, context: { profile: TasteProfile; signal?: AbortSignal }): Promise<SourceResult> {
    const startedAt = nowIso();
    const ageBand = context.profile.ageBand;
    if (!plan.enabled) {
      return {
        source: "googleBooks",
        status: "skipped",
        rawItems: [],
        diagnostics: emptyDiagnostics(plan, "skipped", startedAt, {
          skippedReason: plan.skippedReason || "source_disabled",
          attempted: false,
        }),
      };
    }

    const plannedQueries = plan.intents
      .map((intent, index) => {
        const originalPlannedQuery = String(intent.query || "").trim();
        const fetchQuery = buildGoogleBooksFetchQuery(originalPlannedQuery);
        return {
          fetchQuery,
          originalPlannedQuery,
          queryFamily: queryFamilyFromQuery(originalPlannedQuery),
          queryCascadeIndex: index,
          facets: Array.isArray(intent.facets) ? intent.facets.map((facet) => String(facet || "")).filter(Boolean) : [],
        };
      })
      .filter((intent) => Boolean(intent.fetchQuery));
    const seenQueries = new Set<string>();
    const queries = plannedQueries.filter((intent) => {
      if (seenQueries.has(intent.fetchQuery)) return false;
      seenQueries.add(intent.fetchQuery);
      return true;
    });
    if (!queries.length) {
      return {
        source: "googleBooks",
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
    const seenVolumeIds = new Set<string>();
    let rawApiResultCount = 0;
    let droppedBeforeNormalization = 0;
    let failedReason = "";

    const perQueryTimeoutMs = Math.max(1_000, Math.floor(Math.max(plan.timeoutMs, 1_000) / Math.max(1, queries.length)));
    for (let index = 0; index < queries.length; index += 1) {
      const plannedIntent = queries[index];
      const query = plannedIntent.fetchQuery;
      const fetchStartedAt = nowIso();
      const fetched = await fetchGoogleBooksJson(query, perQueryTimeoutMs, context.signal);
      const fetchFinishedAt = nowIso();
      const fetchDiagnostic: SourceFetchDiagnosticV2 = {
        query,
        fetchStartedAt,
        fetchFinishedAt,
        elapsedMs: Date.parse(fetchFinishedAt) - Date.parse(fetchStartedAt),
        timedOut: Boolean(fetched.timedOut),
        httpStatus: fetched.status,
        responseBodyPrefix: fetched.bodyPrefix,
        failedReason: fetched.failedReason,
        originalPlannedQuery: plannedIntent.originalPlannedQuery,
        queryCascadeIndex: plannedIntent.queryCascadeIndex,
        queryFamily: plannedIntent.queryFamily,
        facets: plannedIntent.facets,
      };
      fetches.push(fetchDiagnostic);

      if (fetched.failedReason) {
        failedReason = failedReason || fetched.failedReason;
        continue;
      }

      const json = (fetched.json || {}) as Record<string, unknown>;
      const items = Array.isArray(json.items) ? json.items : null;
      if (!items) {
        dropReasons.non_book_response_shape = Number(dropReasons.non_book_response_shape || 0) + 1;
        droppedBeforeNormalization += 1;
        continue;
      }

      rawApiResultCount += items.length;
      for (const item of items) {
        if (!item || typeof item !== "object") {
          dropReasons.malformed_api_record = Number(dropReasons.malformed_api_record || 0) + 1;
          droppedBeforeNormalization += 1;
          continue;
        }
        const row = item as Record<string, unknown>;
        const volumeId = String(row.id || "").trim();
        const volumeInfo = (row.volumeInfo && typeof row.volumeInfo === "object") ? (row.volumeInfo as Record<string, unknown>) : null;
        const kind = String(row.kind || "");
        if (!volumeInfo || (kind && !/volume/i.test(kind))) {
          dropReasons.malformed_api_record = Number(dropReasons.malformed_api_record || 0) + 1;
          droppedBeforeNormalization += 1;
          continue;
        }
        if (!volumeId) {
          dropReasons.malformed_api_record = Number(dropReasons.malformed_api_record || 0) + 1;
          droppedBeforeNormalization += 1;
          continue;
        }
        if (seenVolumeIds.has(volumeId)) {
          dropReasons.duplicate_volume_id = Number(dropReasons.duplicate_volume_id || 0) + 1;
          droppedBeforeNormalization += 1;
          continue;
        }

        const title = String(volumeInfo.title || "").trim();
        if (!title) {
          dropReasons.missing_title = Number(dropReasons.missing_title || 0) + 1;
          droppedBeforeNormalization += 1;
          continue;
        }
        const authors = stringArray(volumeInfo.authors);
        if (!authors.length) {
          dropReasons.missing_author = Number(dropReasons.missing_author || 0) + 1;
          droppedBeforeNormalization += 1;
          continue;
        }

        seenVolumeIds.add(volumeId);
        const categories = stringArray(volumeInfo.categories);
        const publisher = String(volumeInfo.publisher || "").trim();
        const description = descriptionFromVolume(row, volumeInfo);
        const artifactDropReason = googleBooksArtifactDropReason(title, String(volumeInfo.subtitle || "").trim(), description, categories, publisher);
        if (artifactDropReason) {
          dropReasons[artifactDropReason] = Number(dropReasons[artifactDropReason] || 0) + 1;
          droppedBeforeNormalization += 1;
          continue;
        }
        const imageLinks = (volumeInfo.imageLinks && typeof volumeInfo.imageLinks === "object")
          ? (volumeInfo.imageLinks as Record<string, unknown>)
          : {};
        const industryIdentifiers = Array.isArray(volumeInfo.industryIdentifiers)
          ? volumeInfo.industryIdentifiers.filter((identifier) => identifier && typeof identifier === "object")
          : [];
        const isbn13 = industryIdentifiers.find((identifier: any) => String(identifier?.type || "").toUpperCase() === "ISBN_13");
        const isbn10 = industryIdentifiers.find((identifier: any) => String(identifier?.type || "").toUpperCase() === "ISBN_10");
        const queryText = plannedIntent.originalPlannedQuery;
        const queryFamily = plannedIntent.queryFamily;
        const publishedDate = String(volumeInfo.publishedDate || "").trim() || undefined;
        const publicationYear = parsePublicationYear(volumeInfo.publishedDate);
        const maturityRating = String(volumeInfo.maturityRating || "").trim() || undefined;

        const rawRow = {
          id: `googleBooks:${volumeId}`,
          sourceId: volumeId,
          canonicalVolumeId: volumeId,
          title,
          subtitle: String(volumeInfo.subtitle || "").trim() || undefined,
          creators: authors,
          description: description || undefined,
          genres: categories,
          themes: [],
          tones: [],
          characterDynamics: [],
          formats: ["book"],
          publisher: publisher || undefined,
          publishedDate,
          publicationYear,
          pageCount: Number.isFinite(Number(volumeInfo.pageCount)) ? Number(volumeInfo.pageCount) : undefined,
          ratingsCount: Number.isFinite(Number(volumeInfo.ratingsCount)) ? Number(volumeInfo.ratingsCount) : undefined,
          language: String(volumeInfo.language || "").trim() || undefined,
          maturityBand: maturityRating,
          maturityRating,
          industryIdentifiers,
          isbn13: isbn13 ? String((isbn13 as any).identifier || "").trim() || undefined : undefined,
          isbn10: isbn10 ? String((isbn10 as any).identifier || "").trim() || undefined : undefined,
          thumbnail: String(imageLinks.thumbnail || "").trim() || undefined,
          smallThumbnail: String(imageLinks.smallThumbnail || "").trim() || undefined,
          imageLinks: {
            thumbnail: String(imageLinks.thumbnail || "").trim() || undefined,
            smallThumbnail: String(imageLinks.smallThumbnail || "").trim() || undefined,
          },
          coverImageUrl: String(imageLinks.thumbnail || imageLinks.smallThumbnail || "").trim() || undefined,
          sourceUrl: String(volumeInfo.infoLink || volumeInfo.canonicalVolumeLink || "").trim() || undefined,
          volumeInfo,
          ageBand,

          // Query provenance is diagnostics-only in V2 normalization.
          queryText,
          queryFamily,
          queryRung: plannedIntent.queryCascadeIndex,
          originalPlannedQuery: plannedIntent.originalPlannedQuery,
          queryCascadeIndex: plannedIntent.queryCascadeIndex,
          facets: plannedIntent.facets,
        };

        rawItems.push(rawRow);
        if (rawTitles.length < 40) rawTitles.push(title);
      }
    }

    const finishedAt = nowIso();
    const status: SourceResult["status"] = rawItems.length > 0
      ? "succeeded"
      : failedReason
      ? (fetches.some((row) => row.timedOut) ? "timed_out" : "failed")
      : "empty";

    const diagnostics: SourceDiagnosticV2 = {
      source: "googleBooks",
      status,
      planned: true,
      attempted: true,
      failedReason: failedReason || undefined,
      timedOut: fetches.some((row) => Boolean(row.timedOut)),
      startedAt,
      finishedAt,
      elapsedMs: Date.parse(finishedAt) - Date.parse(startedAt),
      rawCount: rawItems.length,
      queries: queries.map((intent) => intent.fetchQuery),
      rawTitles,
      firstReturnedTitles: rawTitles.slice(0, 10),
      rawApiResultCount,
      droppedBeforeDocCount: droppedBeforeNormalization,
      dropReasons,
      fetches,
      rawItemPreview: rawItems.slice(0, 15).map((item) => item as Record<string, unknown>),

      googleBooksSourceQueries: queries.map((intent) => intent.fetchQuery),
      googleBooksSourceFetchDiagnostics: fetches,
      googleBooksSourceRawApiResultCount: rawApiResultCount,
      googleBooksSourceNormalizedRowCount: rawItems.length,
      googleBooksSourceDroppedBeforeNormalization: droppedBeforeNormalization,
      googleBooksSourceDropReasons: dropReasons,
      googleBooksSourceStatus: status,
      googleBooksSourceAdapterVersion: GOOGLE_BOOKS_ADAPTER_VERSION,
    };

    return {
      source: "googleBooks",
      status,
      rawItems,
      diagnostics,
    };
  },
};
