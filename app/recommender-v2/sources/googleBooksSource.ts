import type { SourceAdapterV2, SourceDiagnosticV2, SourceFetchDiagnosticV2, SourcePlan, SourceResult, TasteProfile } from "../types";
import { preteenGoogleBooksPublicationIdentityAudit } from "../preteenGoogleBooksPublicationIdentity";

const GOOGLE_BOOKS_API_BASE = "https://www.googleapis.com/books/v1/volumes";
const GOOGLE_BOOKS_ADAPTER_VERSION = "v5";
const GOOGLE_BOOKS_RESPONSE_BODY_PREFIX_LIMIT = 240;
const GOOGLE_BOOKS_MAX_RESULTS_PER_QUERY = 24;

type GoogleBooksPublicationShape =
  | "novel"
  | "series_installment"
  | "story_collection"
  | "anthology"
  | "essay_collection"
  | "periodical"
  | "reference"
  | "critical_study"
  | "academic_text"
  | "interview_collection"
  | "author_commentary"
  | "writing_guide"
  | "readers_advisory"
  | "production_history"
  | "generic_category_catalog"
  | "genre_survey"
  | "literary_history"
  | "public_domain_compilation"
  | "miscellany"
  | "nonfiction"
  | "unknown";

type GoogleBooksPublicationShapeAnalysis = {
  shape: GoogleBooksPublicationShape;
  narrativeConfidence: number;
  evidence: string[];
  narrativePriorityAdjustment: number;
  dominantPublicationShapeEvidence: string[];
  overriddenNarrativeEvidence: string[];
  publicationShapePrecedenceDecision: string;
  explicitNonNarrativeIdentity: string[];
  storyLevelNarrativeEvidence: string[];
  genericCategoryTitle: boolean;
  genericCategoryEvidence: string[];
  unknownShapeEligibility: boolean;
  unknownShapeEvidence: string[];
  unknownShapeRejectedReason: string;
  unknownStoryEvidenceCount: number;
  unknownStoryEvidenceFamilies: string[];
  unknownNarrativeCorroboration: string[];
  unknownEligibilityThresholdDecision: string;
  subjectOfStudyTitle: boolean;
  subjectOfStudyEvidence: string[];
  curatedBookGuideIdentity: boolean;
  curatedBookGuideEvidence: string[];
  periodicalIdentityEvidence: string[];
  periodicalIdentityDecision: string;
};

type PreteenGoogleBooksPublicationShapeAuditRecord = {
  title: string;
  subtitle: string;
  authors: string[];
  publisher: string;
  descriptionPresent: boolean;
  descriptionExcerpt: string;
  descriptionExcerptClassification: string;
  categories: string[];
  pageCount?: number;
  printType: string;
  isbnPresent: boolean;
  publicationYear?: number;
  currentPublicationShape: string;
  currentRejectionReason: string;
  narrativeEvidence: string[];
  artifactEvidence: string[];
  preteenIdentityDecision: "accept" | "reject";
  preteenIdentity: string;
  preteenIdentityReason: string;
  recommendedFutureDecision: string;
  disposition: "likely_false_reject" | "likely_correct_reject" | "ambiguous_reject";
  confidence: number;
};

const GOOGLE_BOOKS_NON_NARRATIVE_SHAPES = new Set<GoogleBooksPublicationShape>([
  "periodical",
  "reference",
  "critical_study",
  "academic_text",
  "interview_collection",
  "author_commentary",
  "writing_guide",
  "readers_advisory",
  "production_history",
  "generic_category_catalog",
  "genre_survey",
  "literary_history",
  "public_domain_compilation",
  "miscellany",
  "nonfiction",
]);

const GOOGLE_BOOKS_NARRATIVE_SHAPES = new Set<GoogleBooksPublicationShape>([
  "novel",
  "series_installment",
  "story_collection",
]);

const GOOGLE_BOOKS_MAINSTREAM_FICTION_PUBLISHER_PATTERN = /\b(penguin|random house|knopf|doubleday|viking|harper|macmillan|tor|simon\s*&?\s*schuster|hachette|st\.? martin|ballantine|minotaur|mysterious press|little brown|grand central|sourcebooks|kensington|crooked lane|berkley|delacorte|del rey|orbit|ace|roc|anchor|scribner|atria|william morrow|putnam|mulholland|flatiron)\b/;
const GOOGLE_BOOKS_ACADEMIC_PUBLISHER_PATTERN = /\b(university press|cambridge university|oxford university|routledge|palgrave|springer|bloomsbury academic|brill|de gruyter|mcfarland|greenwood|scarecrow press|rowman\s*&?\s*littlefield|edinburgh university|duke university|yale university|harvard university|princeton university)\b/;

function incrementCounter(map: Record<string, number>, key: string): void {
  if (!key) return;
  map[key] = Number(map[key] || 0) + 1;
}

function shapeHistogramCount(histogram: Record<string, number>, shapes: string[]): number {
  return shapes.reduce((sum, shape) => sum + Number(histogram[shape] || 0), 0);
}

function clampShapeScore(value: number): number {
  return Math.max(-12, Math.min(8, Math.round(value * 100) / 100));
}

function googleBooksContentMaturityFromRating(value: unknown): "mature" | "not_mature" | "unknown" {
  const raw = String(value || "").trim().toUpperCase();
  if (raw === "MATURE" || raw === "EXPLICIT_MATURE") return "mature";
  if (raw === "NOT_MATURE") return "not_mature";
  return "unknown";
}

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

function uniqueQueryParts(values: string[], limit = 24): string[] {
  const seen = new Set<string>();
  const output: string[] = [];
  for (const value of values) {
    const part = String(value || "").trim();
    const key = part.toLowerCase();
    if (!part || seen.has(key)) continue;
    seen.add(key);
    output.push(part);
    if (output.length >= limit) break;
  }
  return output;
}

const GOOGLE_BOOKS_QUERY_EXCLUSION_TERMS = [
  "-study",
  "-studies",
  "-guide",
  "-reference",
  "-criticism",
  "-companion",
  "-teaching",
  "-bibliography",
  "-anthology",
  "-magazine",
  "-journal",
  "-catalog",
];

function googleBooksAdultNarrativeFetchQuery(query: string): string {
  const normalized = normalizeQuery(query);
  if (!normalized) return "";
  const phrases: Array<{ phrase: string; quoted: string }> = [
    { phrase: "psychological thriller", quoted: "\"psychological thriller\"" },
    { phrase: "science fiction", quoted: "\"science fiction\"" },
    { phrase: "historical fiction", quoted: "\"historical fiction\"" },
    { phrase: "literary fiction", quoted: "\"literary fiction\"" },
    { phrase: "dark fantasy", quoted: "\"dark fantasy\"" },
    { phrase: "gothic horror", quoted: "\"gothic horror\"" },
    { phrase: "gothic romance", quoted: "\"gothic romance\"" },
    { phrase: "love story", quoted: "\"love story\"" },
  ];
  const quotedPhrases = phrases
    .filter(({ phrase }) => normalized.includes(phrase))
    .map(({ quoted }) => quoted);
  const phraseWords = new Set(
    phrases
      .filter(({ phrase }) => normalized.includes(phrase))
      .flatMap(({ phrase }) => phrase.split(/\s+/)),
  );
  const contentTerms = normalized
    .split(/\s+/)
    .filter((term) => term.length > 1)
    .filter((term) => !phraseWords.has(term))
    .filter((term) => !/^(?:adult|book|books|fiction|novel|novels|story|stories|literature|literary)$/.test(term));
  return uniqueQueryParts([
    "subject:fiction",
    ...quotedPhrases,
    ...contentTerms,
    "novel",
    ...GOOGLE_BOOKS_QUERY_EXCLUSION_TERMS,
  ]).join(" ");
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

function googleBooksGenericCategoryTitleEvidence(titleText: string): string[] {
  const evidence: string[] = [];
  const genericCategoryWords = new Set([
    "action",
    "adventure",
    "adult",
    "books",
    "christian",
    "classic",
    "classics",
    "contemporary",
    "crime",
    "detective",
    "dystopian",
    "fantasy",
    "fiction",
    "gothic",
    "historical",
    "horror",
    "literary",
    "literature",
    "mystery",
    "mysteries",
    "novel",
    "novels",
    "paranormal",
    "reads",
    "romance",
    "romantic",
    "fi",
    "sci",
    "science",
    "stories",
    "suspense",
    "thriller",
    "thrillers",
    "western",
    "young",
  ]);
  const normalized = normalizeText(titleText)
    .replace(/\b(?:and|for|of|the|a|an)\b/g, " ")
    .replace(/[-/&:|]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const tokens = normalized.split(" ").filter(Boolean);
  const allGeneric = tokens.length > 0 && tokens.length <= 5 && tokens.every((token) => genericCategoryWords.has(token));
  if (allGeneric && /\b(books?|novels?|fiction|stories|reads|literature)\b/.test(normalized)) {
    evidence.push("generic_genre_plus_container_title");
  }
  if (/^(?:fiction|christian|suspense|thriller|mystery|romance|fantasy|horror|crime|detective|historical|science fiction|sci fi|gothic|paranormal|western|adventure)\s+(?:books?|novels?|fiction|stories|reads|literature)$/.test(normalized)) {
    evidence.push("category_landing_page_title");
  }
  if (/^(?:thrillers?|mysteries|romances|westerns|horror|fantasy|suspense|christian fiction|historical fiction|science fiction)$/.test(normalized)) {
    evidence.push("plural_genre_label_title");
  }
  return Array.from(new Set(evidence));
}

function googleBooksSubjectOfStudyTitleEvidence(titleText: string): string[] {
  const evidence: string[] = [];
  const normalized = normalizeText(titleText)
    .replace(/[-/&:|]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const nationalOrPeriod = "(?:american|british|english|irish|scottish|canadian|french|german|russian|japanese|world|medieval|renaissance|victorian|edwardian|modern|contemporary|colonial|postwar|nineteenth century|twentieth century|eighteenth century|19th century|20th century|18th century)";
  const genreOrForm = "(?:historical fiction|science fiction|sci fi|speculative fiction|crime fiction|detective fiction|mystery fiction|romance fiction|fantasy fiction|gothic fiction|horror fiction|christian fiction|fiction|novels?|literature)";
  if (new RegExp(`\\b${nationalOrPeriod}\\s+(?:[a-z]+\\s+){0,3}${genreOrForm}\\s+(?:before|after|in|during|from|since|to)\\b`).test(normalized)) {
    evidence.push("period_or_national_literary_subject_title");
  }
  if (new RegExp(`\\b(?:history|development|origins?|tradition|rise|evolution)\\s+of\\s+(?:[a-z]+\\s+){0,6}${genreOrForm}\\b`).test(normalized)) {
    evidence.push("history_or_development_of_literary_form_title");
  }
  if (new RegExp(`\\b${genreOrForm}\\s+(?:before|after|in|during|from|since)\\s+(?:[a-z][a-z' -]{2,}|\\d{3,4})\\b`).test(normalized)) {
    evidence.push("literary_form_as_historical_subject_title");
  }
  if (new RegExp(`\\bstudies\\s+in\\s+(?:[a-z]+\\s+){0,6}${genreOrForm}\\b`).test(normalized)) {
    evidence.push("studies_in_literary_form_title");
  }
  return Array.from(new Set(evidence));
}

function googleBooksBundledPublicationEvidence(titleText: string, descriptionText: string, categoryBlob: string): string[] {
  const evidence: string[] = [];
  if (!/\bmegapack\b/.test(titleText)) return evidence;
  const text = [titleText, descriptionText, categoryBlob].filter(Boolean).join(" | ");
  if (/\b\d+\s+(?:classic\s+)?(?:novels?|stories|tales|books?|works?)\b/.test(text)) {
    evidence.push("megapack_multiple_works_count");
  }
  if (/\b(?:stories|tales|short stories|collection|antholog(?:y|ies)|omnibus|bundle|boxed set|collected works?)\b/.test(text)) {
    evidence.push("megapack_collection_or_omnibus_framing");
  }
  if (/\b(?:fantasy|science fiction|sci fi|speculative|mystery|thriller|horror|romance|western|adventure)\b/.test(titleText)) {
    evidence.push("megapack_genre_collection_title");
  }
  if (/\b(?:[a-z]\.?\s*){1,4}[a-z]{2,}\s+(?:fantasy|science fiction|sci fi|speculative|mystery|thriller|horror|romance|western|adventure)\s+(?:and\s+)?(?:fantasy|science fiction|sci fi|speculative|mystery|thriller|horror|romance|western|adventure)?\s*megapack\b/.test(titleText)) {
    evidence.push("megapack_author_genre_collection_title");
  }
  return Array.from(new Set(evidence));
}

function googleBooksCuratedBookGuideEvidence(titleText: string, descriptionText: string, categoryBlob: string): string[] {
  const evidence: string[] = [];
  const normalized = normalizeText(titleText)
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const bookContainer = "(?:books?|novels?|fiction|stories|reads|literature)";
  if (new RegExp(`^(?:the\\s+)?guide\\s+to\\s+(?:the\\s+)?top\\s+\\d+\\s+.+\\b${bookContainer}$`).test(normalized)) {
    evidence.push("guide_to_top_books_title_shape");
  }
  if (new RegExp(`^(?:the\\s+)?top\\s+\\d+\\s+.+\\b${bookContainer}$`).test(normalized)) {
    evidence.push("top_books_curated_list_title_shape");
  }
  if (new RegExp(`^(?:a\\s+|the\\s+)?guide\\s+to\\s+(?:the\\s+)?(?:best|essential|must\\s+read|top)\\s+.+\\b${bookContainer}$`).test(normalized)) {
    evidence.push("guide_to_best_books_title_shape");
  }
  if (new RegExp(`^(?:best|essential|must\\s+read)\\s+.+\\b${bookContainer}$`).test(normalized)) {
    evidence.push("best_or_essential_books_title_shape");
  }
  if (evidence.length > 0 && /\b(readers'? advisory|recommended reads?|book recommendations?|rank(?:ed|ing)|curated|guide|survey|best books?|top\s+\d+)\b/.test(descriptionText)) {
    evidence.push("curated_book_guide_description_framing");
  }
  if (evidence.length > 0 && /\b(reference|bibliographies? and indexes|book reviews?|literature|literary criticism|history and criticism)\b/.test(categoryBlob)) {
    evidence.push("curated_book_guide_category_framing");
  }
  return Array.from(new Set(evidence));
}

function googleBooksPeriodicalIdentityEvidence(
  titleText: string,
  subtitleText: string,
  normalizedDescription: string,
  categoriesText: string,
  publisherText: string,
  combined: string,
): string[] {
  const titleSubtitle = normalizeText([titleText, subtitleText].filter(Boolean).join(" "));
  const titleSignals: string[] = [];
  const corroboration: string[] = [];

  if (/\bmagazine\b/.test(titleSubtitle)) titleSignals.push("title_magazine_term");
  if (/\bjournal\b/.test(titleSubtitle)) titleSignals.push("title_journal_term");
  if (/\bbulletin\b/.test(titleSubtitle)) titleSignals.push("title_bulletin_term");
  if (/\bquarterly\b/.test(titleSubtitle)) titleSignals.push("title_quarterly_term");
  if (/\bgazette\b/.test(titleSubtitle)) titleSignals.push("title_gazette_term");
  if (/\breview\b/.test(titleSubtitle)) titleSignals.push("title_review_term");
  if (/\bmercury\b/.test(titleSubtitle)) titleSignals.push("title_mercury_periodical_style_term");
  if (/\b(?:january|february|march|april|may|june|july|august|september|october|november|december)\s+\d{4}\b/.test(titleSubtitle)) {
    titleSignals.push("title_month_year_issue_framing");
  }
  if (/\b(?:vol(?:ume)?\.?|no\.?|issue)\s*\d+\b/.test(titleSubtitle)) {
    titleSignals.push("title_volume_issue_framing");
  }

  if (/\b(periodicals?|serial publications?|magazines?|journals?)\b/.test(categoriesText)) {
    corroboration.push("category_periodical");
  }
  if (/\b(?:periodical|serial publication|magazine|journal|weekly|monthly|bimonthly|quarterly|special issue|annual issue|issue of|volume of|published as a serial|articles?|contributors?|editorials?|reviews?|essays?)\b/.test(normalizedDescription)) {
    corroboration.push("description_periodical_or_issue_framing");
  }
  if (/\b(?:periodical|magazine|journal|review|quarterly|gazette|mercury)\b/.test(publisherText)) {
    corroboration.push("publisher_periodical_framing");
  }
  if (/\bissn\b/.test(combined)) {
    corroboration.push("issn_marker");
  }

  const explicitIssueTitle = titleSignals.some((signal) => /issue|month_year|volume/.test(signal));
  const explicitPeriodicalCategory = corroboration.includes("category_periodical");
  const explicitPeriodicalTitle = titleSignals.some((signal) => /magazine|bulletin|quarterly/.test(signal));
  if (explicitPeriodicalCategory || (titleSignals.length > 0 && corroboration.length > 0) || (explicitIssueTitle && explicitPeriodicalTitle)) {
    return Array.from(new Set([...titleSignals, ...corroboration]));
  }
  return [];
}

function googleBooksPublicationShapeDropReason(analysis: GoogleBooksPublicationShapeAnalysis): string | undefined {
  if (GOOGLE_BOOKS_NON_NARRATIVE_SHAPES.has(analysis.shape)) return `publication_shape_${analysis.shape}`;
  if (analysis.shape === "anthology" || analysis.shape === "essay_collection") return `publication_shape_${analysis.shape}`;
  if (analysis.shape === "unknown" && !analysis.unknownShapeEligibility) return analysis.unknownShapeRejectedReason || "publication_shape_unknown_insufficient_narrative_identity";
  return undefined;
}

function preteenGoogleBooksPublicationShapeAuditRecord(params: {
  title: string;
  subtitle: string;
  authors: string[];
  publisher: string;
  description: string;
  categories: string[];
  pageCount?: number;
  printType: string;
  isbnPresent: boolean;
  publicationYear?: number;
  shapeAnalysis: GoogleBooksPublicationShapeAnalysis;
  rejectionReason: string;
}): PreteenGoogleBooksPublicationShapeAuditRecord {
  const identityAudit = preteenGoogleBooksPublicationIdentityAudit({
    title: params.title,
    subtitle: params.subtitle,
    creators: params.authors,
    description: params.description,
    genres: params.categories,
    raw: {
      publisher: params.publisher,
      pageCount: params.pageCount,
      printType: params.printType,
      volumeInfo: {
        title: params.title,
        subtitle: params.subtitle,
        authors: params.authors,
        publisher: params.publisher,
        description: params.description,
        categories: params.categories,
        pageCount: params.pageCount,
        printType: params.printType,
        publishedDate: params.publicationYear ? String(params.publicationYear) : undefined,
      },
    },
    diagnostics: {},
  } as any);
  const normalizedDescription = normalizeText(params.description);
  const titleText = normalizeText(`${params.title} ${params.subtitle}`);
  const titleNarrativeEvidence: string[] = [];
  if (/\((?:book\s*)?\d+\)|\b(?:book|volume|vol\.?|part|#)\s*\d+\b/.test(titleText)) {
    titleNarrativeEvidence.push("title_series_entry_cue");
  }
  if (/\b(?:mystery|mysteries|adventure|quest|secret|murder|dragon|magic|creatures?|ghost|case)\b/.test(titleText)) {
    titleNarrativeEvidence.push("title_fiction_story_cue");
  }
  const narrativeEvidence = Array.from(new Set([
    ...identityAudit.narrativeEvidence,
    ...params.shapeAnalysis.storyLevelNarrativeEvidence,
    ...params.shapeAnalysis.unknownShapeEvidence,
    ...titleNarrativeEvidence,
  ])).slice(0, 20);
  const artifactEvidence = Array.from(new Set([
    ...identityAudit.artifactEvidence,
    ...params.shapeAnalysis.dominantPublicationShapeEvidence,
    ...params.shapeAnalysis.explicitNonNarrativeIdentity,
  ])).slice(0, 20);
  const strongPreteenNarrativeIdentity = identityAudit.allowed && (
    identityAudit.narrativeEvidence.some((item) => /middle_grade|juvenile_fiction|chapter_book|graphic_novel/.test(item))
    || (params.shapeAnalysis.storyLevelNarrativeEvidence.length > 0 && /juvenile fiction|children'?s fiction/i.test(params.categories.join(" | ")))
  );
  const explicitCorrectReject = !identityAudit.allowed
    || params.shapeAnalysis.explicitNonNarrativeIdentity.length > 0
    || params.shapeAnalysis.shape === "anthology"
    || params.shapeAnalysis.shape === "essay_collection";

  let disposition: PreteenGoogleBooksPublicationShapeAuditRecord["disposition"] = "ambiguous_reject";
  let recommendedFutureDecision = "retain_reject_pending_better_metadata";
  let confidence = 0.5;
  if (explicitCorrectReject) {
    disposition = "likely_correct_reject";
    recommendedFutureDecision = "retain_shared_publication_shape_reject";
    confidence = identityAudit.allowed ? 0.85 : Math.max(0.9, identityAudit.confidence);
  } else if (strongPreteenNarrativeIdentity) {
    disposition = "likely_false_reject";
    recommendedFutureDecision = "allow_to_scoring_after_preteen_identity_check";
    confidence = params.shapeAnalysis.storyLevelNarrativeEvidence.length > 0 ? 0.9 : 0.82;
  } else if (identityAudit.allowed && titleNarrativeEvidence.length >= 2) {
    recommendedFutureDecision = "manual_review_or_require_one_preteen_metadata_corroborator";
    confidence = 0.6;
  }

  const descriptionExcerptClassification = !normalizedDescription
    ? "absent"
    : params.shapeAnalysis.storyLevelNarrativeEvidence.length > 0
    ? "useful_narrative_excerpt"
    : identityAudit.artifactEvidence.length > 0 || params.shapeAnalysis.explicitNonNarrativeIdentity.length > 0
    ? "useful_artifact_or_non_narrative_excerpt"
    : normalizedDescription.length >= 80
    ? "useful_but_inconclusive_excerpt"
    : "sparse_excerpt";

  return {
    title: params.title,
    subtitle: params.subtitle,
    authors: params.authors,
    publisher: params.publisher,
    descriptionPresent: Boolean(normalizedDescription),
    descriptionExcerpt: String(params.description || "").replace(/\s+/g, " ").trim().slice(0, 240),
    descriptionExcerptClassification,
    categories: params.categories,
    pageCount: params.pageCount,
    printType: params.printType,
    isbnPresent: params.isbnPresent,
    publicationYear: params.publicationYear,
    currentPublicationShape: params.shapeAnalysis.shape,
    currentRejectionReason: params.rejectionReason,
    narrativeEvidence,
    artifactEvidence,
    preteenIdentityDecision: identityAudit.allowed ? "accept" : "reject",
    preteenIdentity: identityAudit.identity,
    preteenIdentityReason: identityAudit.reason,
    recommendedFutureDecision,
    disposition,
    confidence,
  };
}

type PreteenGoogleBooksPublicationShapeRescueDecision = {
  applied: boolean;
  reason: string;
  evidenceFamilies: string[];
};

const PRETEEN_GOOGLE_BOOKS_RESCUABLE_UNKNOWN_REASONS = new Set([
  "publication_shape_unknown_insufficient_narrative_identity",
  "publication_shape_unknown_insufficient_story_evidence",
]);

const PRETEEN_GOOGLE_BOOKS_RESCUABLE_NARRATIVE_IDENTITIES = new Set([
  "middle_grade_novel",
  "chapter_book",
  "graphic_novel",
  "manga",
  "light_novel",
  "narrative_book",
]);

function preteenGoogleBooksPublicationShapeRescueDecision(params: {
  title: string;
  subtitle: string;
  authors: string[];
  publisher: string;
  description: string;
  categories: string[];
  pageCount?: number;
  printType: string;
  isbnPresent: boolean;
  publicationYear?: number;
  shapeAnalysis: GoogleBooksPublicationShapeAnalysis;
  publicationShapeDropReason: string;
  artifactDropReason?: string;
  auditRecord: PreteenGoogleBooksPublicationShapeAuditRecord;
}): PreteenGoogleBooksPublicationShapeRescueDecision {
  const evidenceFamilies: string[] = [];
  const titleText = normalizeText([params.title, params.subtitle].filter(Boolean).join(" "));
  const categoryBlob = normalizeText(params.categories.join(" | "));
  const descriptionText = normalizeText(params.description);
  const identityNarrativeEvidence = params.auditRecord.narrativeEvidence;
  const titleHasStructuredNarrativeIdentity = /\((?:book\s*)?\d+\)|\([^)]*\bseries\b[^)]*\)|\b(?:book|volume|vol\.?|part|#)\s*\d+\b/.test(titleText)
    || (/\b(?:mystery|mysteries|adventure|quest|secret|murder|dragon|magic|creatures?|ghost|case)\b/.test(titleText)
      && titleText.split(/\s+/).filter(Boolean).length >= 3);
  if (titleHasStructuredNarrativeIdentity) evidenceFamilies.push("title_subtitle_narrative_identity");
  if (params.shapeAnalysis.storyLevelNarrativeEvidence.length > 0) {
    evidenceFamilies.push("description_story_evidence");
  }
  if (identityNarrativeEvidence.includes("juvenile_fiction_category")
    || identityNarrativeEvidence.includes("graphic_novel_category")
    || /\b(?:juvenile|children'?s|young readers?) fiction\b|\b(?:manga|comics? (?:and|&) graphic novels?|graphic novels?)\b/.test(categoryBlob)) {
    evidenceFamilies.push("fiction_or_juvenile_categories");
  }
  if (/\bmiddle grade\b|\bchapter books?\b/.test([categoryBlob, descriptionText].join(" "))) {
    evidenceFamilies.push("middle_grade_or_children_audience");
  }
  if (identityNarrativeEvidence.includes("middle_grade_publisher_context")) {
    evidenceFamilies.push("middle_grade_publisher_context");
  }
  const bibliographicSignals = [
    params.authors.length > 0,
    Boolean(params.publisher),
    params.isbnPresent,
    Number(params.pageCount || 0) >= 80,
    normalizeText(params.printType) === "book",
    Number(params.publicationYear || 0) >= 1800,
  ].filter(Boolean).length;
  if (bibliographicSignals >= 4) evidenceFamilies.push("normal_book_bibliographic_metadata");

  const uniqueEvidenceFamilies = Array.from(new Set(evidenceFamilies));
  const substantiveNarrativeFamilyPresent = uniqueEvidenceFamilies.some((family) => [
    "description_story_evidence",
    "fiction_or_juvenile_categories",
    "middle_grade_or_children_audience",
  ].includes(family));
  if (!PRETEEN_GOOGLE_BOOKS_RESCUABLE_UNKNOWN_REASONS.has(params.publicationShapeDropReason)) {
    return { applied: false, reason: "not_rescuable_unknown_shape_reason", evidenceFamilies: uniqueEvidenceFamilies };
  }
  if (params.shapeAnalysis.shape !== "unknown") {
    return { applied: false, reason: "not_unknown_publication_shape", evidenceFamilies: uniqueEvidenceFamilies };
  }
  if (params.artifactDropReason || params.auditRecord.artifactEvidence.length > 0) {
    return { applied: false, reason: "hard_artifact_evidence_present", evidenceFamilies: uniqueEvidenceFamilies };
  }
  if (!PRETEEN_GOOGLE_BOOKS_RESCUABLE_NARRATIVE_IDENTITIES.has(params.auditRecord.preteenIdentity)) {
    return { applied: false, reason: "preteen_identity_not_rescuable_narrative", evidenceFamilies: uniqueEvidenceFamilies };
  }
  if (params.auditRecord.preteenIdentityDecision !== "accept") {
    return { applied: false, reason: "preteen_identity_classifier_rejected", evidenceFamilies: uniqueEvidenceFamilies };
  }
  if (!substantiveNarrativeFamilyPresent) {
    return { applied: false, reason: "title_only_or_no_substantive_narrative_metadata", evidenceFamilies: uniqueEvidenceFamilies };
  }
  if (uniqueEvidenceFamilies.length < 2) {
    return { applied: false, reason: "fewer_than_two_independent_evidence_families", evidenceFamilies: uniqueEvidenceFamilies };
  }
  return {
    applied: true,
    reason: "preteen_unknown_shape_rescued_by_corroborated_narrative_identity",
    evidenceFamilies: uniqueEvidenceFamilies,
  };
}

function inferGoogleBooksPublicationShape(params: {
  title: string;
  subtitle?: string;
  description?: string;
  categories: string[];
  publisher?: string;
  authors: string[];
  publicationYear?: number;
  isbnPresent?: boolean;
  pageCount?: number;
}): GoogleBooksPublicationShapeAnalysis {
  const titleText = normalizeText([params.title, params.subtitle].filter(Boolean).join(" "));
  const descriptionText = normalizeText(params.description || "");
  const categoryBlob = categoryText(params.categories);
  const publisherText = normalizeText(params.publisher || "");
  const authorText = normalizeText(params.authors.join(" "));
  const allText = [titleText, descriptionText, categoryBlob, publisherText, authorText].filter(Boolean).join(" | ");
  const evidence: string[] = [];
  const weakNarrativeEvidence: string[] = [];
  const storyLevelNarrativeEvidence: string[] = [];
  let narrativeConfidence = 0;

  const fictionCategory = /\b(fiction|novels?|stories|detective and mystery|mystery|thriller|fantasy|science fiction|historical fiction|romance fiction|horror tales|adventure stories|speculative fiction|suspense fiction)\b/.test(categoryBlob)
    && !/\b(literary criticism|history and criticism|bibliograph(?:y|ies)|reference|study aids?|education|language arts)\b/.test(categoryBlob);
  const narrativeDescription = hasNarrativeDescriptionEvidence(params.description || "");
  const ambiguousNovelFormTitle = /\b(?:historical|science fiction|sci-fi|crime|detective|mystery|romance|fantasy|gothic|horror|columbian|american|english|victorian|modern)\s+novels?\b/.test(titleText)
    || /\b(?:guide to|introduction to|study of|studies in|history of|survey of|writing|bibliograph(?:y|ies) of)\s+(?:[a-z]+\s+){0,5}novels?\b/.test(titleText);
  const novelIdentity = (/\ba novel\b/.test(titleText) || /\ba novel\b/.test(descriptionText) || /\bnovel\b/.test(descriptionText)) && !ambiguousNovelFormTitle;
  const mainstreamFictionPublisher = GOOGLE_BOOKS_MAINSTREAM_FICTION_PUBLISHER_PATTERN.test(publisherText);
  const academicPublisher = GOOGLE_BOOKS_ACADEMIC_PUBLISHER_PATTERN.test(publisherText);

  if (fictionCategory) {
    evidence.push("fiction_category");
    weakNarrativeEvidence.push("fiction_category");
    narrativeConfidence += 1;
  }
  if (narrativeDescription) {
    evidence.push("narrative_synopsis_description");
    storyLevelNarrativeEvidence.push("narrative_synopsis_description");
    narrativeConfidence += 3;
  }
  if (novelIdentity) {
    evidence.push("novel_identity_marker");
    weakNarrativeEvidence.push("novel_identity_marker");
    narrativeConfidence += 1;
  }
  if (mainstreamFictionPublisher && (fictionCategory || narrativeDescription || novelIdentity)) {
    evidence.push("mainstream_fiction_publisher");
    weakNarrativeEvidence.push("mainstream_fiction_publisher");
    narrativeConfidence += 0.5;
  }
  if (params.isbnPresent && (fictionCategory || narrativeDescription || novelIdentity)) {
    evidence.push("isbn_backed_record_quality");
    weakNarrativeEvidence.push("isbn_backed_record_quality");
  }
  if (Number.isFinite(Number(params.pageCount)) && Number(params.pageCount) >= 140 && (fictionCategory || narrativeDescription || novelIdentity)) {
    evidence.push("book_length_record_quality");
    weakNarrativeEvidence.push("book_length_record_quality");
  }
  if (descriptionText.length >= 80 && /\b(?:when|after|before|as)\s+(?:a|an|the|young|former|new|old|[a-z]+)\b/.test(descriptionText)) {
    storyLevelNarrativeEvidence.push("plot_setup_description");
    narrativeConfidence += 1;
  }
  if (/\b(?:must|discovers?|uncovers?|investigates?|confronts?|survives?|survival|flees?|fleeing|escapes?|enters?|searches?|returns?|falls in love|murder|secrets?|haunted|quest|kingdom|empire|dangerous bargains?|detective|protagonist|heroine|characters?)\b/.test(descriptionText)) {
    storyLevelNarrativeEvidence.push("character_event_conflict_description");
    narrativeConfidence += 1;
  }
  if (/\b(?:young|former|new|old|a|an|the)\s+(?:woman|man|girl|boy|daughter|mother|father|sister|brother|family|detective|sheriff|deputy|princess|performer|student|heroine|hero|protagonist)\b/.test(descriptionText)
    && /\b(?:city|town|world|colony|kingdom|empire|forest|school|home|island|future|america|case|mystery|secret|danger|magic)\b/.test(descriptionText)) {
    storyLevelNarrativeEvidence.push("character_role_setting_description");
    narrativeConfidence += 1;
  }

  const curatedBookGuideEvidence = googleBooksCuratedBookGuideEvidence(titleText, descriptionText, categoryBlob);
  const curatedBookGuideIdentity = curatedBookGuideEvidence.length > 0;
  const periodicalIdentityEvidence = googleBooksPeriodicalIdentityEvidence(titleText, "", descriptionText, categoryBlob, publisherText, allText);
  const periodicalIdentityDecision = periodicalIdentityEvidence.length > 0
    ? "periodical_identity_overrides_narrative_signals"
    : "no_corroborated_periodical_identity";
  const referenceShape = /\b(encyclop(?:a)?edia|dictionary|directory|catalog(?:ue)?|bibliograph(?:y|ies)|index|almanac|companion to|reader'?s companion|reference guide)\b/.test(allText)
    || /\b(reference|bibliographies? and indexes|catalogs?|directories)\b/.test(categoryBlob);
  const writingGuideShape = /\b(how to write|writing fiction|creative writing|writer'?s guide|writing guide|handbook for writers|craft of fiction|plotting|character development guide|writer'?s market|guide to literary agents?)\b/.test(allText);
  const readersAdvisoryShape = curatedBookGuideIdentity
    || /\b(readers'? advisory|reader'?s advisory|recommended reads?|what do i read next|genreflecting|library advisory|book reviews? of fiction)\b/.test(allText);
  const periodicalShape = periodicalIdentityEvidence.length > 0;
  const miscellanyShape = /\b(bathroom reader|uncle john'?s|reader plunges|miscellany|miscellaneous|trivia|fact book|fun facts|digest)\b/.test(allText);
  const interviewShape = /\b(conversations with|interviews? with|interview collection|talks with)\b/.test(titleText) || /\b(interviews?|conversations)\b/.test(categoryBlob);
  const genericCategoryEvidence = googleBooksGenericCategoryTitleEvidence(titleText);
  const genericCategoryTitle = genericCategoryEvidence.length > 0;
  const productionHistoryShape = /\b(the making of|making of|making-of|behind the scenes|production history|art and making of|inside the making)\b/.test(allText)
    || /\b(?:film|television|motion picture)\s+(?:history|production|criticism)\b/.test(categoryBlob);
  const commentaryShape = /\b(?:about|on)\s+(?:the\s+)?(?:author|works?|novels?|fiction)\b/.test(titleText)
    || /\b(author commentary|companion to|critical companion|casebook)\b/.test(allText)
    || /\b(?:in|of)\s+["']?[a-z0-9][^|]{3,100}["']?\s+by\s+[a-z]/.test(titleText);
  const subjectOfStudyEvidence = googleBooksSubjectOfStudyTitleEvidence(titleText);
  const subjectOfStudyTitle = subjectOfStudyEvidence.length > 0;
  const craftGuideTitleShape = /\b(?:the\s+)?art\s+(?:&|and)\s+practice\s+of\b/.test(titleText)
    || /\b(?:craft|practice|technique|manual)\s+of\s+(?:writing|fiction|novels?)\b/.test(titleText);
  const techniqueInstructionalEvidence = /\b(?:the\s+)?technique\s+of\s+(?:the\s+)?(?:mystery|detective|thriller|suspense|horror|fantasy|science fiction|sci fi|romance|story|novel|fiction)\b/.test(titleText)
    && (/\b(?:writing|writers?|authorship|language arts|literary criticism|history and criticism|study aids?|reference|education)\b/.test(categoryBlob)
      || /\b(?:technique|craft|writing|writer|plot|plotting|story structure|narrative structure|analysis|study|criticism|theory|storytelling|story-telling|how to)\b/.test(descriptionText));
  const howGenreWorksEvidence = /\bhow\s+(?:the\s+)?(?:mystery|detective|thriller|suspense|horror|fantasy|science fiction|sci fi|romance|story|novel|fiction)\s+works\b/.test(titleText)
    && /\b(?:writing|craft|analysis|study|criticism|genre|form|structure|theory)\b/.test([descriptionText, categoryBlob].join(" "));
  const studyTitleShape = /\b(comparison of|analysis of|a study of|study of|study guide|teaching|understanding|interpretation of|themes in|systems of|methods to|methods of)\b/.test(titleText);
  // "<academic concept> of <X> in <Y>" — critical-study topic phrase followed by the work/genre being analyzed.
  // Examples: "Concepts of Nature in Young Adult Dystopian Fiction", "Visions of the Wasteland in Maze Runner"
  const studyTopicInWorkShape = /\b(concepts?|visions?|representation|imagery|symbolism|politics|discourse|ecology|portrayal|depiction|dynamics?|rhetoric|violence|trauma|power|agency|identity|gender|race|sexuality|surveillance|resistance|redemption|heroism|mortality|transformation|alienation|rhetoric)\s+of\s+[a-z][a-z ,'-]{2,60}\s+in\s+[a-z]/.test(titleText);
  // "<academic concept> in <Author's/Author'> <Work>" — identifies a named work as the subject of study.
  // Examples: "Sexual repression in Orwell's Nineteen Eighty-Four"
  const academicConceptInAuthorWorkShape = /\b(repression|oppression|alienation|agency|sexuality|violence|trauma|race|class|gender|power|ecology|landscape|mortality|religion|surveillance|resistance|justice|discourse|rhetoric|symbolism|imagery|transformation|heroism|redemption|identity|silence|protest|subversion|revolution|rebellion|servitude|autonomy|dissent|exile|otherness|hybridity|memory|desire|grief)\s+in\s+[a-z][a-z ,'-]+'s?\s+[a-z]/.test(titleText);
  const readingStudyShape = /\breading\s+[a-z0-9][a-z0-9' -]{2,80}\b/.test(titleText)
    && (/\b(literary criticism|history and criticism|study aids?|education|language arts|bibliograph(?:y|ies)|criticism)\b/.test(categoryBlob)
      || /\b(study|critical|criticism|analysis|interpretation|teaching|classroom|essay|monograph|scholarship)\b/.test(descriptionText)
      || GOOGLE_BOOKS_ACADEMIC_PUBLISHER_PATTERN.test(publisherText));
  const quotedWorkStudyShape = /["'][^"']{3,120}["']/.test(titleText)
    && /\b(comparison|analysis|study|systems?|methods?|control|public|state|ancient|rome|panem|theme|interpretation|condition|perspective|examination|exploration|reading|critique|portrayal|representation|reflection)\b/.test(titleText);
  const criticismShape = /\b(literary criticism|history and criticism|criticism and interpretation|critical (?:study|analysis|essays?)|critical studies|studies in|readings in|analysis of|scholarship|theory|theoretical|posthumanist|cultural study)\b/.test(allText)
    || studyTitleShape
    || quotedWorkStudyShape
    || studyTopicInWorkShape
    || academicConceptInAuthorWorkShape;
  const conceptStudyShape = /\b(ecofeminist|postmodern|postmodern condition|posthumanist|alienation|apocalypse|gender|feminist|ecocriticism|cultural studies?|film studies?|cyberpunk)\b/.test(titleText)
    && /\b(science fiction|horror|fantasy|novels?|fiction|literature|blade runner|i am legend)\b/.test(titleText);
  const genreSurveyShape = /\b(history of (?:mystery|crime|horror|fantasy|science fiction|romance|gothic|detective)|survey of (?:mystery|crime|horror|fantasy|science fiction|romance)|genre studies?|genre survey|books about (?:horror|mystery|crime|fantasy|science fiction|romance))\b/.test(allText)
    || (ambiguousNovelFormTitle && !/\ba novel\b/.test(titleText));
  const literaryHistoryShape = /\b(history of literature|literary history|history of (?:american|english|british|world) literature|literature and culture)\b/.test(allText);
  const bundledPublicationEvidence = googleBooksBundledPublicationEvidence(titleText, descriptionText, categoryBlob);
  const anthologyShape = bundledPublicationEvidence.length > 0
    || /\b(antholog(?:y|ies)|omnibus|collected stories|selected stories|complete stories|great short stories|great tales|masterpieces of|best of the year|year'?s best|annual collection|edited by|selected by)\b/.test(allText);
  const essayCollectionShape = /\b(essay collection|critical essays?|essays on|collected essays)\b/.test(allText)
    || (/\bessays?\b/.test(titleText) && !novelIdentity);
  const publicDomainCompilationShape = (Number.isFinite(Number(params.publicationYear)) && Number(params.publicationYear) < 1950)
    && (/\b(complete works?|collected works?|selected works?|library edition|public domain|masterpieces|omnibus|volume\s+\d+)\b/.test(titleText)
      || /\b(literary criticism|history and criticism|bibliograph(?:y|ies)|reference)\b/.test(categoryBlob)
      || (!params.isbnPresent && !narrativeDescription));
  const nonfictionShape = /\b(nonfiction|non-fiction|biography|autobiography|memoir|essays?|history|philosophy|reference|business|language arts|education|study aids?|travel|self-help|psychology|political science|social science|science|medical|technology|computers?)\b/.test(categoryBlob)
    && !fictionCategory
    && !/\b(true crime|narrative nonfiction)\b/.test(categoryBlob);

  const explicitShapeCandidates: Array<{ shape: GoogleBooksPublicationShape; evidence: string[]; decision: string }> = [];
  if (periodicalShape) explicitShapeCandidates.push({ shape: "periodical", evidence: periodicalIdentityEvidence, decision: periodicalIdentityDecision });
  if (writingGuideShape || craftGuideTitleShape || techniqueInstructionalEvidence || howGenreWorksEvidence) explicitShapeCandidates.push({ shape: "writing_guide", evidence: [techniqueInstructionalEvidence ? "technique_or_craft_instruction_title_shape" : howGenreWorksEvidence ? "how_genre_form_works_instruction_title_shape" : craftGuideTitleShape ? "craft_or_art_practice_title_shape" : "writing_instruction_publication_shape"], decision: "writing_guide_identity_overrides_narrative_signals" });
  if (readersAdvisoryShape) explicitShapeCandidates.push({ shape: "readers_advisory", evidence: curatedBookGuideIdentity ? curatedBookGuideEvidence : ["readers_advisory_publication_shape"], decision: "readers_advisory_identity_overrides_narrative_signals" });
  if (genericCategoryTitle) explicitShapeCandidates.push({ shape: "generic_category_catalog", evidence: genericCategoryEvidence, decision: "generic_category_title_overrides_narrative_signals" });
  if (referenceShape) explicitShapeCandidates.push({ shape: "reference", evidence: ["reference_publication_shape"], decision: "reference_identity_overrides_narrative_signals" });
  if (productionHistoryShape) explicitShapeCandidates.push({ shape: "production_history", evidence: ["making_of_or_production_history_shape"], decision: "production_history_identity_overrides_narrative_signals" });
  if ((criticismShape || readingStudyShape || quotedWorkStudyShape) && academicPublisher) explicitShapeCandidates.push({ shape: "academic_text", evidence: ["academic_publisher_criticism_shape"], decision: "academic_scholarship_identity_overrides_narrative_signals" });
  else if (criticismShape || conceptStudyShape || readingStudyShape || quotedWorkStudyShape) explicitShapeCandidates.push({ shape: "critical_study", evidence: [quotedWorkStudyShape ? "quoted_work_academic_comparison_shape" : readingStudyShape ? "reading_title_study_shape" : conceptStudyShape ? "conceptual_genre_study_shape" : "criticism_or_scholarship_shape"], decision: "criticism_or_scholarship_identity_overrides_narrative_signals" });
  if (subjectOfStudyTitle) explicitShapeCandidates.push({ shape: "literary_history", evidence: subjectOfStudyEvidence, decision: "subject_of_study_title_overrides_narrative_signals" });
  if (interviewShape) explicitShapeCandidates.push({ shape: "interview_collection", evidence: ["interview_collection_shape"], decision: "interview_collection_identity_overrides_narrative_signals" });
  if (commentaryShape) explicitShapeCandidates.push({ shape: "author_commentary", evidence: ["author_or_work_commentary_shape"], decision: "commentary_about_work_or_author_overrides_narrative_signals" });
  if (genreSurveyShape) explicitShapeCandidates.push({ shape: "genre_survey", evidence: ["genre_survey_shape"], decision: "genre_survey_identity_overrides_narrative_signals" });
  if (literaryHistoryShape) explicitShapeCandidates.push({ shape: "literary_history", evidence: ["literary_history_shape"], decision: "literary_history_identity_overrides_narrative_signals" });
  if (anthologyShape) explicitShapeCandidates.push({ shape: "anthology", evidence: bundledPublicationEvidence.length ? bundledPublicationEvidence : ["anthology_or_omnibus_shape"], decision: "anthology_identity_overrides_narrative_signals" });
  if (essayCollectionShape) explicitShapeCandidates.push({ shape: "essay_collection", evidence: ["essay_collection_shape"], decision: "essay_collection_identity_overrides_narrative_signals" });
  if (miscellanyShape) explicitShapeCandidates.push({ shape: "miscellany", evidence: ["miscellany_or_digest_shape"], decision: "miscellany_identity_overrides_narrative_signals" });
  if (publicDomainCompilationShape) explicitShapeCandidates.push({ shape: "public_domain_compilation", evidence: ["public_domain_compilation_shape"], decision: "public_domain_compilation_identity_overrides_narrative_signals" });
  if (nonfictionShape) explicitShapeCandidates.push({ shape: "nonfiction", evidence: ["nonfiction_category_without_fiction_shape"], decision: "nonfiction_identity_overrides_narrative_signals" });

  const dominantExplicitShape = explicitShapeCandidates[0];
  let shape: GoogleBooksPublicationShape = "unknown";
  let publicationShapePrecedenceDecision = "no_explicit_non_narrative_identity";
  const dominantPublicationShapeEvidence: string[] = [];
  const explicitNonNarrativeIdentity: string[] = [];
  let unknownShapeEligibility = false;
  const unknownShapeEvidence: string[] = [];
  let unknownShapeRejectedReason = "";
  const unknownStoryEvidenceFamilies = Array.from(new Set(storyLevelNarrativeEvidence)).slice(0, 12);
  const unknownStoryEvidenceCount = unknownStoryEvidenceFamilies.length;
  const unknownNarrativeCorroboration: string[] = [];
  const seriesInstallmentIdentity = /\b(?:book|volume|vol\.?|part|#)\s*(?:\d+|one|two|three|four|five|six|seven|eight|nine|ten)\b/.test(titleText);
  const distinctiveNarrativeTitle = titleText.split(/\s+/).filter(Boolean).length >= 2
    && !genericCategoryTitle
    && !ambiguousNovelFormTitle
    && !subjectOfStudyTitle;
  if (novelIdentity) unknownNarrativeCorroboration.push("explicit_novel_identity");
  if (seriesInstallmentIdentity) unknownNarrativeCorroboration.push("series_installment_identity");
  if (fictionCategory && distinctiveNarrativeTitle && mainstreamFictionPublisher) {
    unknownNarrativeCorroboration.push("strong_fiction_category_distinctive_title_fiction_publisher");
  }
  let unknownEligibilityThresholdDecision = "";

  if (dominantExplicitShape) {
    shape = dominantExplicitShape.shape;
    publicationShapePrecedenceDecision = dominantExplicitShape.decision;
    dominantPublicationShapeEvidence.push(...dominantExplicitShape.evidence);
    explicitNonNarrativeIdentity.push(...explicitShapeCandidates.map((candidate) => `${candidate.shape}:${candidate.evidence.join(",")}`));
    evidence.push(...dominantExplicitShape.evidence);
  } else if (seriesInstallmentIdentity && storyLevelNarrativeEvidence.length > 0) {
    shape = "series_installment";
    evidence.push("numbered_series_installment_shape");
    narrativeConfidence += 1;
    publicationShapePrecedenceDecision = "series_installment_supported_by_story_level_evidence";
  } else if (/\b(short stories|stories)\b/.test(titleText) && storyLevelNarrativeEvidence.length > 0) {
    shape = "story_collection";
    evidence.push("story_collection_shape");
    narrativeConfidence += 0.5;
    publicationShapePrecedenceDecision = "story_collection_supported_by_story_level_evidence";
  } else if (storyLevelNarrativeEvidence.length >= 2 || (novelIdentity && fictionCategory && storyLevelNarrativeEvidence.length > 0)) {
    shape = "novel";
    evidence.push("novel_or_narrative_fiction_shape");
    publicationShapePrecedenceDecision = storyLevelNarrativeEvidence.length > 0
      ? "novel_supported_by_story_level_evidence"
      : "novel_supported_by_unambiguous_novel_identity_and_fiction_category";
  } else if (storyLevelNarrativeEvidence.length > 0) {
    unknownShapeEligibility = unknownStoryEvidenceCount >= 2 || unknownNarrativeCorroboration.length > 0;
    unknownShapeEvidence.push(...unknownStoryEvidenceFamilies, ...unknownNarrativeCorroboration);
    if (unknownStoryEvidenceCount >= 2) {
      unknownEligibilityThresholdDecision = "allowed_by_multiple_story_evidence_families";
    } else if (unknownNarrativeCorroboration.length > 0) {
      unknownEligibilityThresholdDecision = "allowed_by_single_story_evidence_with_narrative_corroboration";
    } else {
      unknownShapeRejectedReason = "publication_shape_unknown_insufficient_story_evidence";
      unknownEligibilityThresholdDecision = "rejected_single_story_evidence_without_corroboration";
    }
    publicationShapePrecedenceDecision = unknownShapeEligibility
      ? "unknown_shape_allowed_by_threshold"
      : "unknown_shape_rejected_by_threshold";
  } else {
    unknownShapeEvidence.push(...weakNarrativeEvidence);
    unknownShapeRejectedReason = "publication_shape_unknown_insufficient_narrative_identity";
    unknownEligibilityThresholdDecision = "rejected_without_story_level_evidence";
    publicationShapePrecedenceDecision = "unknown_shape_rejected_without_story_level_evidence";
  }

  let narrativePriorityAdjustment = 0;
  if (shape === "novel") narrativePriorityAdjustment += 5;
  else if (shape === "series_installment") narrativePriorityAdjustment += 3;
  else if (shape === "story_collection") narrativePriorityAdjustment -= 2;
  else if (shape === "anthology" || shape === "essay_collection") narrativePriorityAdjustment -= 6;
  else if (GOOGLE_BOOKS_NON_NARRATIVE_SHAPES.has(shape)) narrativePriorityAdjustment -= 10;
  if (narrativeConfidence >= 5) narrativePriorityAdjustment += 1;
  if (narrativeConfidence <= 0) narrativePriorityAdjustment -= 1;

  return {
    shape,
    narrativeConfidence: clampShapeScore(narrativeConfidence),
    evidence: Array.from(new Set(evidence)).slice(0, 12),
    narrativePriorityAdjustment: clampShapeScore(narrativePriorityAdjustment),
    dominantPublicationShapeEvidence: Array.from(new Set(dominantPublicationShapeEvidence)).slice(0, 12),
    overriddenNarrativeEvidence: dominantExplicitShape ? Array.from(new Set([...weakNarrativeEvidence, ...storyLevelNarrativeEvidence])).slice(0, 12) : [],
    publicationShapePrecedenceDecision,
    explicitNonNarrativeIdentity: Array.from(new Set(explicitNonNarrativeIdentity)).slice(0, 12),
    storyLevelNarrativeEvidence: Array.from(new Set(storyLevelNarrativeEvidence)).slice(0, 12),
    genericCategoryTitle,
    genericCategoryEvidence,
    unknownShapeEligibility,
    unknownShapeEvidence: Array.from(new Set(unknownShapeEvidence)).slice(0, 12),
    unknownShapeRejectedReason,
    unknownStoryEvidenceCount,
    unknownStoryEvidenceFamilies,
    unknownNarrativeCorroboration: Array.from(new Set(unknownNarrativeCorroboration)).slice(0, 12),
    unknownEligibilityThresholdDecision,
    subjectOfStudyTitle,
    subjectOfStudyEvidence,
    curatedBookGuideIdentity,
    curatedBookGuideEvidence,
    periodicalIdentityEvidence,
    periodicalIdentityDecision,
  };
}

function googleBooksPeriodicalCorroboration(titleText: string, subtitleText: string, normalizedDescription: string, categoriesText: string, combined: string): string[] {
  return googleBooksPeriodicalIdentityEvidence(titleText, subtitleText, normalizedDescription, categoriesText, "", combined);
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

function buildGoogleBooksFetchQuery(query: string, ageBand?: TasteProfile["ageBand"]): string {
  const normalized = normalizeQuery(query);
  if (!normalized) return "";
  if (ageBand !== "adult") return normalized;
  return googleBooksAdultNarrativeFetchQuery(normalized);
}

function isPublicDomainCatalogShape(title: string, publicationYear: number | undefined, description: string, categories: string[]): boolean {
  const normalizedTitle = normalizeText(title);
  const normalizedDescription = normalizeText(description);
  const categoryBlob = categoryText(categories);
  const oldPublication = Number.isFinite(Number(publicationYear)) && Number(publicationYear) > 0 && Number(publicationYear) < 1950;
  const catalogSignals = /\b(complete works|collected works|library edition|everyman|victoria|catalog|catalogue|bibliograph(?:y|ies)|index|archive|public domain)\b/.test(normalizedTitle)
    || /\b(reference|history and criticism|literary criticism|bibliographies? and indexes|catalogs?|directories)\b/.test(categoryBlob)
    || (oldPublication && normalizedDescription.length < 80);
  return Boolean(catalogSignals || oldPublication && /\b(vol(?:ume)?\s*\d+|edition)\b/.test(normalizedTitle));
}

function isModernNarrativeRecord(title: string, publicationYear: number | undefined, description: string, categories: string[], isbnPresent: boolean): boolean {
  const normalizedDescription = normalizeText(description);
  const normalizedTitle = normalizeText(title);
  const hasNarrativeLanguage = /\b(follows|story of|tells the story|centers on|must survive|must uncover|must confront|must choose|must save|protagonist|heroine|hero|detective|characters?)\b/.test(normalizedDescription)
    || /\b(novel|fiction|thriller|mystery|fantasy|romance|science fiction|historical fiction|horror)\b/.test(`${normalizedTitle} ${categoryText(categories)}`);
  const modernYear = Number.isFinite(Number(publicationYear)) && Number(publicationYear) >= 1975;
  return Boolean(hasNarrativeLanguage && (modernYear || isbnPresent));
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
      filter: "partial",
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
    googleBooksPlannedQueries: plan.intents.map((intent) => String(intent.query || "")),
    googleBooksQueriesAttempted: [],
    googleBooksRawCountByQuery: {},
    googleBooksAcceptedCountByQuery: {},
    googleBooksRejectedCountByQueryAndReason: {},
    googleBooksRetrievalUnderfillReason: status === "empty" ? "no_usable_rows" : undefined,
    googleBooksSourceQueries: plan.intents.map((intent) => String(intent.query || "")),
    googleBooksSourceFetchDiagnostics: [],
    googleBooksSourceRawApiResultCount: 0,
    googleBooksSourceNormalizedRowCount: 0,
    googleBooksSourceDroppedBeforeNormalization: 0,
    googleBooksSourceDropReasons: {},
    googleBooksSourceStatus: status,
    googleBooksSourceAdapterVersion: GOOGLE_BOOKS_ADAPTER_VERSION,
    googleBooksPublicationShapeByTitle: {},
    googleBooksNarrativeConfidenceByTitle: {},
    googleBooksPublicationShapeEvidenceByTitle: {},
    googleBooksNarrativePriorityAdjustmentByTitle: {},
    googleBooksPublicationShapeRejectedBeforeRankingByTitle: {},
    googleBooksDominantPublicationShapeEvidenceByTitle: {},
    googleBooksOverriddenNarrativeEvidenceByTitle: {},
    googleBooksPublicationShapePrecedenceDecisionByTitle: {},
    googleBooksExplicitNonNarrativeIdentityByTitle: {},
    googleBooksStoryLevelNarrativeEvidenceByTitle: {},
    googleBooksGenericCategoryTitleByTitle: {},
    googleBooksGenericCategoryEvidenceByTitle: {},
    googleBooksGenericCategoryRejectedBeforeRankingByTitle: {},
    googleBooksUnknownShapeEligibilityByTitle: {},
    googleBooksUnknownShapeEvidenceByTitle: {},
    googleBooksUnknownShapeRejectedReasonByTitle: {},
    googleBooksUnknownStoryEvidenceCountByTitle: {},
    googleBooksUnknownStoryEvidenceFamiliesByTitle: {},
    googleBooksUnknownNarrativeCorroborationByTitle: {},
    googleBooksUnknownEligibilityThresholdDecisionByTitle: {},
    googleBooksSubjectOfStudyTitleByTitle: {},
    googleBooksSubjectOfStudyEvidenceByTitle: {},
    googleBooksSubjectOfStudyRejectedBeforeRankingByTitle: {},
    googleBooksCuratedBookGuideIdentityByTitle: {},
    googleBooksCuratedBookGuideEvidenceByTitle: {},
    googleBooksPeriodicalIdentityEvidenceByTitle: {},
    googleBooksPeriodicalIdentityDecisionByTitle: {},
    preteenGoogleBooksPublicationShapeAuditByTitle: {},
    preteenGoogleBooksPublicationShapeRejectedTitles: [],
    preteenGoogleBooksPublicationShapeRejectedReasonByTitle: {},
    preteenGoogleBooksPublicationShapeNarrativeEvidenceByTitle: {},
    preteenGoogleBooksPublicationShapeArtifactEvidenceByTitle: {},
    preteenGoogleBooksPublicationShapeCounterfactualDecisionByTitle: {},
    preteenGoogleBooksPublicationShapeLikelyFalseRejectTitles: [],
    preteenGoogleBooksPublicationShapeLikelyCorrectRejectTitles: [],
    preteenGoogleBooksPublicationShapeAmbiguousRejectTitles: [],
    preteenGoogleBooksPublicationShapeFalseRejectHistogram: {},
    preteenGoogleBooksPublicationShapeAuditSummary: {
      scope: "preteen_googlebooks_publication_shape_rejections",
      productionBehaviorChanged: false,
      auditedRejectedCount: 0,
    },
    preteenGoogleBooksPublicationShapeRescueAppliedByTitle: {},
    preteenGoogleBooksPublicationShapeRescueReasonByTitle: {},
    preteenGoogleBooksPublicationShapeRescueEvidenceByTitle: {},
    preteenGoogleBooksPublicationShapeRescuedTitles: [],
    preteenGoogleBooksPublicationShapeRescueRejectedTitles: [],
    preteenGoogleBooksPublicationShapeRescueRejectedReasonByTitle: {},
    preteenGoogleBooksPublicationShapeRescueEnteredScoringTitles: [],
    preteenGoogleBooksPublicationShapeRescueSelectedTitles: [],
    preteenGoogleBooksPublicationShapeRescueNotSelectedReasonByTitle: {},
    preteenGoogleBooksPublicationShapeRescueSummary: {
      scope: "preteen_googlebooks_unknown_publication_shape_rescue",
      appliedCount: 0,
      rejectedCount: 0,
      automaticFinalAcceptance: false,
    },
    adultGoogleBooksQueryQualityByQuery: {},
    adultGoogleBooksPublicationShapeHistogramByQuery: {},
    adultGoogleBooksRejectedShapeHistogramByQuery: {},
    adultGoogleBooksNarrativeYieldByQuery: {},
    adultGoogleBooksNarrativeEfficiencyByQuery: {},
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
        const fetchQuery = buildGoogleBooksFetchQuery(originalPlannedQuery, ageBand);
        return {
          intentId: String(intent.id || ""),
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
    const rawCountByQuery: Record<string, number> = {};
    const queriesAttempted: string[] = [];
    const fetches: SourceFetchDiagnosticV2[] = [];
    const publicationYearByTitle: Record<string, number> = {};
    const descriptionPresentByTitle: Record<string, boolean> = {};
    const isbnPresentByTitle: Record<string, boolean> = {};
    const ratingsCountByTitle: Record<string, number> = {};
    const ratingsAverageByTitle: Record<string, number> = {};
    const queryByTitle: Record<string, string> = {};
    const printTypeByTitle: Record<string, string> = {};
    const languageByTitle: Record<string, string> = {};
    const maturityRatingByTitle: Record<string, string> = {};
    const audienceBandByTitle: Record<string, string> = {};
    const contentMaturityByTitle: Record<string, string> = {};
    const sourceMaturityRatingByTitle: Record<string, string> = {};
    const publicationShapeByTitle: Record<string, string> = {};
    const narrativeConfidenceByTitle: Record<string, number> = {};
    const publicationShapeEvidenceByTitle: Record<string, string[]> = {};
    const narrativePriorityAdjustmentByTitle: Record<string, number> = {};
    const publicationShapeRejectedBeforeRankingByTitle: Record<string, string> = {};
    const dominantPublicationShapeEvidenceByTitle: Record<string, string[]> = {};
    const overriddenNarrativeEvidenceByTitle: Record<string, string[]> = {};
    const publicationShapePrecedenceDecisionByTitle: Record<string, string> = {};
    const explicitNonNarrativeIdentityByTitle: Record<string, string[]> = {};
    const storyLevelNarrativeEvidenceByTitle: Record<string, string[]> = {};
    const genericCategoryTitleByTitle: Record<string, boolean> = {};
    const genericCategoryEvidenceByTitle: Record<string, string[]> = {};
    const genericCategoryRejectedBeforeRankingByTitle: Record<string, string> = {};
    const unknownShapeEligibilityByTitle: Record<string, boolean> = {};
    const unknownShapeEvidenceByTitle: Record<string, string[]> = {};
    const unknownShapeRejectedReasonByTitle: Record<string, string> = {};
    const unknownStoryEvidenceCountByTitle: Record<string, number> = {};
    const unknownStoryEvidenceFamiliesByTitle: Record<string, string[]> = {};
    const unknownNarrativeCorroborationByTitle: Record<string, string[]> = {};
    const unknownEligibilityThresholdDecisionByTitle: Record<string, string> = {};
    const subjectOfStudyTitleByTitle: Record<string, boolean> = {};
    const subjectOfStudyEvidenceByTitle: Record<string, string[]> = {};
    const subjectOfStudyRejectedBeforeRankingByTitle: Record<string, string> = {};
    const curatedBookGuideIdentityByTitle: Record<string, boolean> = {};
    const curatedBookGuideEvidenceByTitle: Record<string, string[]> = {};
    const periodicalIdentityEvidenceByTitle: Record<string, string[]> = {};
    const periodicalIdentityDecisionByTitle: Record<string, string> = {};
    const preteenPublicationShapeAuditByTitle: Record<string, PreteenGoogleBooksPublicationShapeAuditRecord> = {};
    const preteenPublicationShapeRejectedTitles: string[] = [];
    const preteenPublicationShapeRejectedReasonByTitle: Record<string, string> = {};
    const preteenPublicationShapeNarrativeEvidenceByTitle: Record<string, string[]> = {};
    const preteenPublicationShapeArtifactEvidenceByTitle: Record<string, string[]> = {};
    const preteenPublicationShapeCounterfactualDecisionByTitle: Record<string, string> = {};
    const preteenPublicationShapeLikelyFalseRejectTitles: string[] = [];
    const preteenPublicationShapeLikelyCorrectRejectTitles: string[] = [];
    const preteenPublicationShapeAmbiguousRejectTitles: string[] = [];
    const preteenPublicationShapeFalseRejectHistogram: Record<string, number> = {};
    const preteenPublicationShapeRescueAppliedByTitle: Record<string, boolean> = {};
    const preteenPublicationShapeRescueReasonByTitle: Record<string, string> = {};
    const preteenPublicationShapeRescueEvidenceByTitle: Record<string, string[]> = {};
    const preteenPublicationShapeRescuedTitles: string[] = [];
    const preteenPublicationShapeRescueRejectedTitles: string[] = [];
    const preteenPublicationShapeRescueRejectedReasonByTitle: Record<string, string> = {};
    const perQueryQuality: Record<string, {
      query: string;
      rawResultCount: number;
      titles: string[];
      publicationYearByTitle: Record<string, number>;
      languageByTitle: Record<string, string>;
      printTypeByTitle: Record<string, string>;
      maturityRatingByTitle: Record<string, string>;
      descriptionPresentByTitle: Record<string, boolean>;
      isbnPresentByTitle: Record<string, boolean>;
      averageRatingByTitle: Record<string, number>;
      ratingsCountByTitle: Record<string, number>;
      enteredNormalizationTitles: string[];
      enteredRankingTitles: string[];
      enteredFinalEligibilityTitles: string[];
      totalResults: number;
      narrativeCandidateCount: number;
      acceptedCandidateCount: number;
      rejectedCandidateCount: number;
      publicationShapeHistogram: Record<string, number>;
      rejectedShapeHistogram: Record<string, number>;
      rejectionReasons: Record<string, number>;
      criticismCount: number;
      referenceCount: number;
      catalogCount: number;
      unknownCount: number;
      narrativeEfficiency: number;
    }> = {};
    const modernNarrativeCountByQuery: Record<string, number> = {};
    const publicDomainCatalogShapeCountByQuery: Record<string, number> = {};
    const seenVolumeIds = new Set<string>();
    let rawApiResultCount = 0;
    let droppedBeforeNormalization = 0;
    let failedReason = "";

    const primaryQueries = queries.filter((intent) => intent.intentId !== "fallback-fiction-broad");
    const fallbackQueries = queries.filter((intent) => intent.intentId === "fallback-fiction-broad");
    const queryExecutionOrder = primaryQueries.length > 0 ? [...primaryQueries] : [...fallbackQueries];
    const perQueryTimeoutMs = Math.max(1_000, Math.floor(Math.max(plan.timeoutMs, 1_000) / Math.max(1, queries.length)));
    let fallbackExecuted = false;
    for (let index = 0; index < queryExecutionOrder.length; index += 1) {
      const plannedIntent = queryExecutionOrder[index];
      const query = plannedIntent.fetchQuery;
      const originalQuery = plannedIntent.originalPlannedQuery;
      queriesAttempted.push(originalQuery);
      if (!perQueryQuality[originalQuery]) {
        perQueryQuality[originalQuery] = {
          query: originalQuery,
          rawResultCount: 0,
          titles: [],
          publicationYearByTitle: {},
          languageByTitle: {},
          printTypeByTitle: {},
          maturityRatingByTitle: {},
          descriptionPresentByTitle: {},
          isbnPresentByTitle: {},
          averageRatingByTitle: {},
          ratingsCountByTitle: {},
          enteredNormalizationTitles: [],
          enteredRankingTitles: [],
          enteredFinalEligibilityTitles: [],
          totalResults: 0,
          narrativeCandidateCount: 0,
          acceptedCandidateCount: 0,
          rejectedCandidateCount: 0,
          publicationShapeHistogram: {},
          rejectedShapeHistogram: {},
          rejectionReasons: {},
          criticismCount: 0,
          referenceCount: 0,
          catalogCount: 0,
          unknownCount: 0,
          narrativeEfficiency: 0,
        };
      }
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
      rawCountByQuery[originalQuery] = Number(rawCountByQuery[originalQuery] || 0) + (items ? items.length : 0);
      perQueryQuality[originalQuery].rawResultCount = Number(rawCountByQuery[originalQuery] || 0);
      perQueryQuality[originalQuery].totalResults = Number(rawCountByQuery[originalQuery] || 0);
      if (!items) {
        dropReasons.non_book_response_shape = Number(dropReasons.non_book_response_shape || 0) + 1;
        incrementCounter(perQueryQuality[originalQuery].rejectionReasons, "non_book_response_shape");
        perQueryQuality[originalQuery].rejectedCandidateCount += 1;
        droppedBeforeNormalization += 1;
        continue;
      }

      rawApiResultCount += items.length;
      for (const item of items) {
        if (!item || typeof item !== "object") {
          dropReasons.malformed_api_record = Number(dropReasons.malformed_api_record || 0) + 1;
          incrementCounter(perQueryQuality[originalQuery].rejectionReasons, "malformed_api_record");
          perQueryQuality[originalQuery].rejectedCandidateCount += 1;
          droppedBeforeNormalization += 1;
          continue;
        }
        const row = item as Record<string, unknown>;
        const volumeId = String(row.id || "").trim();
        const volumeInfo = (row.volumeInfo && typeof row.volumeInfo === "object") ? (row.volumeInfo as Record<string, unknown>) : null;
        const kind = String(row.kind || "");
        if (!volumeInfo || (kind && !/volume/i.test(kind))) {
          dropReasons.malformed_api_record = Number(dropReasons.malformed_api_record || 0) + 1;
          incrementCounter(perQueryQuality[originalQuery].rejectionReasons, "malformed_api_record");
          perQueryQuality[originalQuery].rejectedCandidateCount += 1;
          droppedBeforeNormalization += 1;
          continue;
        }
        if (!volumeId) {
          dropReasons.malformed_api_record = Number(dropReasons.malformed_api_record || 0) + 1;
          incrementCounter(perQueryQuality[originalQuery].rejectionReasons, "malformed_api_record");
          perQueryQuality[originalQuery].rejectedCandidateCount += 1;
          droppedBeforeNormalization += 1;
          continue;
        }
        if (seenVolumeIds.has(volumeId)) {
          dropReasons.duplicate_volume_id = Number(dropReasons.duplicate_volume_id || 0) + 1;
          incrementCounter(perQueryQuality[originalQuery].rejectionReasons, "duplicate_volume_id");
          perQueryQuality[originalQuery].rejectedCandidateCount += 1;
          droppedBeforeNormalization += 1;
          continue;
        }

        const title = String(volumeInfo.title || "").trim();
        if (!title) {
          dropReasons.missing_title = Number(dropReasons.missing_title || 0) + 1;
          incrementCounter(perQueryQuality[originalQuery].rejectionReasons, "missing_title");
          perQueryQuality[originalQuery].rejectedCandidateCount += 1;
          droppedBeforeNormalization += 1;
          continue;
        }
        const authors = stringArray(volumeInfo.authors);
        if (!authors.length) {
          dropReasons.missing_author = Number(dropReasons.missing_author || 0) + 1;
          incrementCounter(perQueryQuality[originalQuery].rejectionReasons, "missing_author");
          perQueryQuality[originalQuery].rejectedCandidateCount += 1;
          droppedBeforeNormalization += 1;
          continue;
        }

        seenVolumeIds.add(volumeId);
        const categories = stringArray(volumeInfo.categories);
        const publisher = String(volumeInfo.publisher || "").trim();
        const description = descriptionFromVolume(row, volumeInfo);
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
        const contentMaturity = googleBooksContentMaturityFromRating(maturityRating);
        const printType = String(volumeInfo.printType || "BOOK").trim() || "BOOK";
        const language = String(volumeInfo.language || "").trim() || "";
        const hasDescription = Boolean(String(description || "").trim());
        const hasIsbn = Boolean(
          (isbn13 && String((isbn13 as any).identifier || "").trim())
          || (isbn10 && String((isbn10 as any).identifier || "").trim()),
        );
        const averageRating = Number.isFinite(Number(volumeInfo.averageRating)) ? Number(volumeInfo.averageRating) : undefined;
        const ratingsCount = Number.isFinite(Number(volumeInfo.ratingsCount)) ? Number(volumeInfo.ratingsCount) : 0;
        const pageCount = Number.isFinite(Number(volumeInfo.pageCount)) ? Number(volumeInfo.pageCount) : undefined;
        const shapeAnalysis = inferGoogleBooksPublicationShape({
          title,
          subtitle: String(volumeInfo.subtitle || "").trim() || undefined,
          description,
          categories,
          publisher,
          authors,
          publicationYear,
          isbnPresent: hasIsbn,
          pageCount,
        });
        incrementCounter(perQueryQuality[originalQuery].publicationShapeHistogram, shapeAnalysis.shape);
        publicationShapeByTitle[title] = shapeAnalysis.shape;
        narrativeConfidenceByTitle[title] = shapeAnalysis.narrativeConfidence;
        publicationShapeEvidenceByTitle[title] = shapeAnalysis.evidence;
        narrativePriorityAdjustmentByTitle[title] = shapeAnalysis.narrativePriorityAdjustment;
        dominantPublicationShapeEvidenceByTitle[title] = shapeAnalysis.dominantPublicationShapeEvidence;
        overriddenNarrativeEvidenceByTitle[title] = shapeAnalysis.overriddenNarrativeEvidence;
        publicationShapePrecedenceDecisionByTitle[title] = shapeAnalysis.publicationShapePrecedenceDecision;
        explicitNonNarrativeIdentityByTitle[title] = shapeAnalysis.explicitNonNarrativeIdentity;
        storyLevelNarrativeEvidenceByTitle[title] = shapeAnalysis.storyLevelNarrativeEvidence;
        genericCategoryTitleByTitle[title] = shapeAnalysis.genericCategoryTitle;
        genericCategoryEvidenceByTitle[title] = shapeAnalysis.genericCategoryEvidence;
        unknownShapeEligibilityByTitle[title] = shapeAnalysis.unknownShapeEligibility;
        unknownShapeEvidenceByTitle[title] = shapeAnalysis.unknownShapeEvidence;
        if (shapeAnalysis.unknownShapeRejectedReason) unknownShapeRejectedReasonByTitle[title] = shapeAnalysis.unknownShapeRejectedReason;
        unknownStoryEvidenceCountByTitle[title] = shapeAnalysis.unknownStoryEvidenceCount;
        unknownStoryEvidenceFamiliesByTitle[title] = shapeAnalysis.unknownStoryEvidenceFamilies;
        unknownNarrativeCorroborationByTitle[title] = shapeAnalysis.unknownNarrativeCorroboration;
        unknownEligibilityThresholdDecisionByTitle[title] = shapeAnalysis.unknownEligibilityThresholdDecision;
        subjectOfStudyTitleByTitle[title] = shapeAnalysis.subjectOfStudyTitle;
        subjectOfStudyEvidenceByTitle[title] = shapeAnalysis.subjectOfStudyEvidence;
        curatedBookGuideIdentityByTitle[title] = shapeAnalysis.curatedBookGuideIdentity;
        curatedBookGuideEvidenceByTitle[title] = shapeAnalysis.curatedBookGuideEvidence;
        periodicalIdentityEvidenceByTitle[title] = shapeAnalysis.periodicalIdentityEvidence;
        periodicalIdentityDecisionByTitle[title] = shapeAnalysis.periodicalIdentityDecision;
        const originalPublicationShapeDropReason = googleBooksPublicationShapeDropReason(shapeAnalysis);
        const artifactDropReason = googleBooksArtifactDropReason(title, String(volumeInfo.subtitle || "").trim(), description, categories, publisher);
        let preteenPublicationShapeRescueDecision: PreteenGoogleBooksPublicationShapeRescueDecision | undefined;
        if (ageBand === "preteens" && originalPublicationShapeDropReason) {
          const auditRecord = preteenGoogleBooksPublicationShapeAuditRecord({
            title,
            subtitle: String(volumeInfo.subtitle || "").trim(),
            authors,
            publisher,
            description,
            categories,
            pageCount,
            printType,
            isbnPresent: hasIsbn,
            publicationYear,
            shapeAnalysis,
            rejectionReason: originalPublicationShapeDropReason,
          });
          preteenPublicationShapeAuditByTitle[title] = auditRecord;
          if (!preteenPublicationShapeRejectedTitles.includes(title)) preteenPublicationShapeRejectedTitles.push(title);
          preteenPublicationShapeRejectedReasonByTitle[title] = originalPublicationShapeDropReason;
          preteenPublicationShapeNarrativeEvidenceByTitle[title] = auditRecord.narrativeEvidence;
          preteenPublicationShapeArtifactEvidenceByTitle[title] = auditRecord.artifactEvidence;
          preteenPublicationShapeCounterfactualDecisionByTitle[title] = [auditRecord.preteenIdentityDecision, auditRecord.preteenIdentity, auditRecord.recommendedFutureDecision].join(":");
          if (auditRecord.disposition === "likely_false_reject") {
            if (!preteenPublicationShapeLikelyFalseRejectTitles.includes(title)) preteenPublicationShapeLikelyFalseRejectTitles.push(title);
            incrementCounter(preteenPublicationShapeFalseRejectHistogram, originalPublicationShapeDropReason);
          } else if (auditRecord.disposition === "likely_correct_reject") {
            if (!preteenPublicationShapeLikelyCorrectRejectTitles.includes(title)) preteenPublicationShapeLikelyCorrectRejectTitles.push(title);
          } else if (!preteenPublicationShapeAmbiguousRejectTitles.includes(title)) {
            preteenPublicationShapeAmbiguousRejectTitles.push(title);
          }
          preteenPublicationShapeRescueDecision = preteenGoogleBooksPublicationShapeRescueDecision({
            title,
            subtitle: String(volumeInfo.subtitle || "").trim(),
            authors,
            publisher,
            description,
            categories,
            pageCount,
            printType,
            isbnPresent: hasIsbn,
            publicationYear,
            shapeAnalysis,
            publicationShapeDropReason: originalPublicationShapeDropReason,
            artifactDropReason,
            auditRecord,
          });
          preteenPublicationShapeRescueAppliedByTitle[title] = preteenPublicationShapeRescueDecision.applied;
          preteenPublicationShapeRescueReasonByTitle[title] = preteenPublicationShapeRescueDecision.reason;
          preteenPublicationShapeRescueEvidenceByTitle[title] = preteenPublicationShapeRescueDecision.evidenceFamilies;
          if (preteenPublicationShapeRescueDecision.applied) {
            if (!preteenPublicationShapeRescuedTitles.includes(title)) preteenPublicationShapeRescuedTitles.push(title);
          } else {
            if (!preteenPublicationShapeRescueRejectedTitles.includes(title)) preteenPublicationShapeRescueRejectedTitles.push(title);
            preteenPublicationShapeRescueRejectedReasonByTitle[title] = preteenPublicationShapeRescueDecision.reason;
          }
        }
        const publicationShapeDropReason = preteenPublicationShapeRescueDecision?.applied
          ? undefined
          : originalPublicationShapeDropReason;
        const dropReason = publicationShapeDropReason || artifactDropReason;
        if (dropReason) {
          dropReasons[dropReason] = Number(dropReasons[dropReason] || 0) + 1;
          incrementCounter(perQueryQuality[originalQuery].rejectionReasons, dropReason);
          incrementCounter(perQueryQuality[originalQuery].rejectedShapeHistogram, shapeAnalysis.shape);
          perQueryQuality[originalQuery].rejectedCandidateCount += 1;
          if (publicationShapeDropReason) publicationShapeRejectedBeforeRankingByTitle[title] = publicationShapeDropReason;
          if (publicationShapeDropReason === "publication_shape_generic_category_catalog") genericCategoryRejectedBeforeRankingByTitle[title] = publicationShapeDropReason;
          if (shapeAnalysis.subjectOfStudyTitle && publicationShapeDropReason) subjectOfStudyRejectedBeforeRankingByTitle[title] = publicationShapeDropReason;
          droppedBeforeNormalization += 1;
          continue;
        }
        perQueryQuality[originalQuery].acceptedCandidateCount += 1;
        if (GOOGLE_BOOKS_NARRATIVE_SHAPES.has(shapeAnalysis.shape)) {
          perQueryQuality[originalQuery].narrativeCandidateCount += 1;
        }

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
          pageCount,
          ratingsCount: Number.isFinite(Number(volumeInfo.ratingsCount)) ? Number(volumeInfo.ratingsCount) : undefined,
          averageRating,
          language: String(volumeInfo.language || "").trim() || undefined,
          maturityBand: maturityRating,
          maturityRating,
          sourceMaturityRating: maturityRating,
          contentMaturity,
          audienceBand: ageBand,
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
          googleBooksPublicationShape: shapeAnalysis.shape,
          googleBooksNarrativeConfidence: shapeAnalysis.narrativeConfidence,
          googleBooksPublicationShapeEvidence: shapeAnalysis.evidence,
          googleBooksNarrativePriorityAdjustment: shapeAnalysis.narrativePriorityAdjustment,
          googleBooksDominantPublicationShapeEvidence: shapeAnalysis.dominantPublicationShapeEvidence,
          googleBooksOverriddenNarrativeEvidence: shapeAnalysis.overriddenNarrativeEvidence,
          googleBooksPublicationShapePrecedenceDecision: shapeAnalysis.publicationShapePrecedenceDecision,
          googleBooksExplicitNonNarrativeIdentity: shapeAnalysis.explicitNonNarrativeIdentity,
          googleBooksStoryLevelNarrativeEvidence: shapeAnalysis.storyLevelNarrativeEvidence,
          googleBooksGenericCategoryTitle: shapeAnalysis.genericCategoryTitle,
          googleBooksGenericCategoryEvidence: shapeAnalysis.genericCategoryEvidence,
          googleBooksUnknownShapeEligibility: shapeAnalysis.unknownShapeEligibility,
          googleBooksUnknownShapeEvidence: shapeAnalysis.unknownShapeEvidence,
          googleBooksUnknownShapeRejectedReason: shapeAnalysis.unknownShapeRejectedReason,
          googleBooksUnknownStoryEvidenceCount: shapeAnalysis.unknownStoryEvidenceCount,
          googleBooksUnknownStoryEvidenceFamilies: shapeAnalysis.unknownStoryEvidenceFamilies,
          googleBooksUnknownNarrativeCorroboration: shapeAnalysis.unknownNarrativeCorroboration,
          googleBooksUnknownEligibilityThresholdDecision: shapeAnalysis.unknownEligibilityThresholdDecision,
          googleBooksSubjectOfStudyTitle: shapeAnalysis.subjectOfStudyTitle,
          googleBooksSubjectOfStudyEvidence: shapeAnalysis.subjectOfStudyEvidence,
          googleBooksCuratedBookGuideIdentity: shapeAnalysis.curatedBookGuideIdentity,
          googleBooksCuratedBookGuideEvidence: shapeAnalysis.curatedBookGuideEvidence,
          googleBooksPeriodicalIdentityEvidence: shapeAnalysis.periodicalIdentityEvidence,
          googleBooksPeriodicalIdentityDecision: shapeAnalysis.periodicalIdentityDecision,
          preteenGoogleBooksPublicationShapeRescueApplied: Boolean(preteenPublicationShapeRescueDecision?.applied),
          preteenGoogleBooksPublicationShapeRescueReason: preteenPublicationShapeRescueDecision?.reason || "not_considered",
          preteenGoogleBooksPublicationShapeRescueEvidence: preteenPublicationShapeRescueDecision?.evidenceFamilies || [],
        };

        rawItems.push(rawRow);
        if (rawTitles.length < 40) rawTitles.push(title);
        queryByTitle[title] = originalQuery;
        if (Number.isFinite(Number(publicationYear))) publicationYearByTitle[title] = Number(publicationYear);
        descriptionPresentByTitle[title] = hasDescription;
        isbnPresentByTitle[title] = hasIsbn;
        ratingsCountByTitle[title] = ratingsCount;
        if (typeof averageRating === "number" && Number.isFinite(averageRating)) ratingsAverageByTitle[title] = averageRating;
        printTypeByTitle[title] = printType;
        languageByTitle[title] = language;
        maturityRatingByTitle[title] = maturityRating || "";
        audienceBandByTitle[title] = ageBand;
        contentMaturityByTitle[title] = contentMaturity;
        sourceMaturityRatingByTitle[title] = maturityRating || "";
        perQueryQuality[originalQuery].titles.push(title);
        if (Number.isFinite(Number(publicationYear))) perQueryQuality[originalQuery].publicationYearByTitle[title] = Number(publicationYear);
        perQueryQuality[originalQuery].languageByTitle[title] = language;
        perQueryQuality[originalQuery].printTypeByTitle[title] = printType;
        perQueryQuality[originalQuery].maturityRatingByTitle[title] = maturityRating || "";
        perQueryQuality[originalQuery].descriptionPresentByTitle[title] = hasDescription;
        perQueryQuality[originalQuery].isbnPresentByTitle[title] = hasIsbn;
        if (typeof averageRating === "number" && Number.isFinite(averageRating)) perQueryQuality[originalQuery].averageRatingByTitle[title] = averageRating;
        perQueryQuality[originalQuery].ratingsCountByTitle[title] = ratingsCount;
        perQueryQuality[originalQuery].enteredNormalizationTitles.push(title);
        if (isModernNarrativeRecord(title, publicationYear, description, categories, hasIsbn)) {
          modernNarrativeCountByQuery[originalQuery] = Number(modernNarrativeCountByQuery[originalQuery] || 0) + 1;
        }
        if (isPublicDomainCatalogShape(title, publicationYear, description, categories)) {
          publicDomainCatalogShapeCountByQuery[originalQuery] = Number(publicDomainCatalogShapeCountByQuery[originalQuery] || 0) + 1;
        }
      }

      const shouldRunFallback = !fallbackExecuted
        && fallbackQueries.length > 0
        && index === primaryQueries.length - 1
        && rawItems.length < 3;
      if (shouldRunFallback) {
        queryExecutionOrder.push(...fallbackQueries);
        fallbackExecuted = true;
      }
    }

    const finishedAt = nowIso();
    const status: SourceResult["status"] = rawItems.length > 0
      ? "succeeded"
      : failedReason
      ? (fetches.some((row) => row.timedOut) ? "timed_out" : "failed")
      : "empty";
    const adultGoogleBooksQueryQualityByQuery: Record<string, Record<string, unknown>> = {};
    const publicationShapeHistogramByQuery: Record<string, Record<string, number>> = {};
    const rejectedShapeHistogramByQuery: Record<string, Record<string, number>> = {};
    const narrativeYieldByQuery: Record<string, number> = {};
    const narrativeEfficiencyByQuery: Record<string, number> = {};
    for (const [query, row] of Object.entries(perQueryQuality)) {
      const histogram = row.publicationShapeHistogram;
      const totalResults = Number(row.totalResults || row.rawResultCount || 0);
      row.criticismCount = shapeHistogramCount(histogram, ["critical_study", "academic_text", "literary_history", "production_history", "author_commentary"]);
      row.referenceCount = shapeHistogramCount(histogram, ["reference", "readers_advisory", "writing_guide", "genre_survey"]);
      row.catalogCount = shapeHistogramCount(histogram, ["generic_category_catalog", "public_domain_compilation", "miscellany"]);
      row.unknownCount = Number(histogram.unknown || 0);
      row.narrativeEfficiency = totalResults > 0
        ? Math.round((Number(row.narrativeCandidateCount || 0) / totalResults) * 1000) / 1000
        : 0;
      adultGoogleBooksQueryQualityByQuery[query] = row;
      publicationShapeHistogramByQuery[query] = histogram;
      rejectedShapeHistogramByQuery[query] = row.rejectedShapeHistogram;
      narrativeYieldByQuery[query] = Number(row.narrativeCandidateCount || 0);
      narrativeEfficiencyByQuery[query] = row.narrativeEfficiency;
    }

    const preteenPublicationShapeDominantLossRules = Object.entries(preteenPublicationShapeFalseRejectHistogram)
      .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
      .map(([reason, count]) => ({ reason, count }));
    const preteenPublicationShapeAuditSummary: Record<string, unknown> = {
      scope: "preteen_googlebooks_publication_shape_rejections",
      productionBehaviorChanged: ageBand === "preteens",
      auditedRejectedCount: preteenPublicationShapeRejectedTitles.length,
      likelyFalseRejectCount: preteenPublicationShapeLikelyFalseRejectTitles.length,
      likelyCorrectRejectCount: preteenPublicationShapeLikelyCorrectRejectTitles.length,
      ambiguousRejectCount: preteenPublicationShapeAmbiguousRejectTitles.length,
      dominantLikelyFalseRejectRules: preteenPublicationShapeDominantLossRules,
      recommendedInterventionStage: "before_scoring_at_publication_shape_gate",
      implementedPolicy: "for_preteens_only_rescue_unknown_shape_identity_accepted_rows_with_two_corroborating_evidence_families_to_scoring",
    };

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
      googleBooksPlannedQueries: plannedQueries.map((intent) => intent.originalPlannedQuery),
      googleBooksQueriesAttempted: queriesAttempted,
      googleBooksRawCountByQuery: rawCountByQuery,
      googleBooksAcceptedCountByQuery: {},
      googleBooksRejectedCountByQueryAndReason: {},
      googleBooksRetrievalUnderfillReason: rawItems.length < 3
        ? (fallbackExecuted ? "fallback_exhausted_with_low_usable_rows" : "primary_queries_returned_low_usable_rows")
        : undefined,
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
      googleBooksPublicationYearByTitle: publicationYearByTitle,
      googleBooksDescriptionPresentByTitle: descriptionPresentByTitle,
      googleBooksIsbnPresentByTitle: isbnPresentByTitle,
      googleBooksRatingsCountByTitle: ratingsCountByTitle,
      googleBooksAverageRatingByTitle: ratingsAverageByTitle,
      googleBooksLanguageByTitle: languageByTitle,
      googleBooksPrintTypeByTitle: printTypeByTitle,
      googleBooksMaturityRatingByTitle: maturityRatingByTitle,
      googleBooksAudienceBandByTitle: audienceBandByTitle,
      googleBooksContentMaturityByTitle: contentMaturityByTitle,
      googleBooksSourceMaturityRatingByTitle: sourceMaturityRatingByTitle,
      googleBooksQueryByTitle: queryByTitle,
      googleBooksPublicationShapeByTitle: publicationShapeByTitle,
      googleBooksNarrativeConfidenceByTitle: narrativeConfidenceByTitle,
      googleBooksPublicationShapeEvidenceByTitle: publicationShapeEvidenceByTitle,
      googleBooksNarrativePriorityAdjustmentByTitle: narrativePriorityAdjustmentByTitle,
      googleBooksPublicationShapeRejectedBeforeRankingByTitle: publicationShapeRejectedBeforeRankingByTitle,
      googleBooksDominantPublicationShapeEvidenceByTitle: dominantPublicationShapeEvidenceByTitle,
      googleBooksOverriddenNarrativeEvidenceByTitle: overriddenNarrativeEvidenceByTitle,
      googleBooksPublicationShapePrecedenceDecisionByTitle: publicationShapePrecedenceDecisionByTitle,
      googleBooksExplicitNonNarrativeIdentityByTitle: explicitNonNarrativeIdentityByTitle,
      googleBooksStoryLevelNarrativeEvidenceByTitle: storyLevelNarrativeEvidenceByTitle,
      googleBooksGenericCategoryTitleByTitle: genericCategoryTitleByTitle,
      googleBooksGenericCategoryEvidenceByTitle: genericCategoryEvidenceByTitle,
      googleBooksGenericCategoryRejectedBeforeRankingByTitle: genericCategoryRejectedBeforeRankingByTitle,
      googleBooksUnknownShapeEligibilityByTitle: unknownShapeEligibilityByTitle,
      googleBooksUnknownShapeEvidenceByTitle: unknownShapeEvidenceByTitle,
      googleBooksUnknownShapeRejectedReasonByTitle: unknownShapeRejectedReasonByTitle,
      googleBooksUnknownStoryEvidenceCountByTitle: unknownStoryEvidenceCountByTitle,
      googleBooksUnknownStoryEvidenceFamiliesByTitle: unknownStoryEvidenceFamiliesByTitle,
      googleBooksUnknownNarrativeCorroborationByTitle: unknownNarrativeCorroborationByTitle,
      googleBooksUnknownEligibilityThresholdDecisionByTitle: unknownEligibilityThresholdDecisionByTitle,
      googleBooksSubjectOfStudyTitleByTitle: subjectOfStudyTitleByTitle,
      googleBooksSubjectOfStudyEvidenceByTitle: subjectOfStudyEvidenceByTitle,
      googleBooksSubjectOfStudyRejectedBeforeRankingByTitle: subjectOfStudyRejectedBeforeRankingByTitle,
      googleBooksCuratedBookGuideIdentityByTitle: curatedBookGuideIdentityByTitle,
      googleBooksCuratedBookGuideEvidenceByTitle: curatedBookGuideEvidenceByTitle,
      googleBooksPeriodicalIdentityEvidenceByTitle: periodicalIdentityEvidenceByTitle,
      googleBooksPeriodicalIdentityDecisionByTitle: periodicalIdentityDecisionByTitle,
      preteenGoogleBooksPublicationShapeAuditByTitle: preteenPublicationShapeAuditByTitle,
      preteenGoogleBooksPublicationShapeRejectedTitles: preteenPublicationShapeRejectedTitles,
      preteenGoogleBooksPublicationShapeRejectedReasonByTitle: preteenPublicationShapeRejectedReasonByTitle,
      preteenGoogleBooksPublicationShapeNarrativeEvidenceByTitle: preteenPublicationShapeNarrativeEvidenceByTitle,
      preteenGoogleBooksPublicationShapeArtifactEvidenceByTitle: preteenPublicationShapeArtifactEvidenceByTitle,
      preteenGoogleBooksPublicationShapeCounterfactualDecisionByTitle: preteenPublicationShapeCounterfactualDecisionByTitle,
      preteenGoogleBooksPublicationShapeLikelyFalseRejectTitles: preteenPublicationShapeLikelyFalseRejectTitles,
      preteenGoogleBooksPublicationShapeLikelyCorrectRejectTitles: preteenPublicationShapeLikelyCorrectRejectTitles,
      preteenGoogleBooksPublicationShapeAmbiguousRejectTitles: preteenPublicationShapeAmbiguousRejectTitles,
      preteenGoogleBooksPublicationShapeFalseRejectHistogram: preteenPublicationShapeFalseRejectHistogram,
      preteenGoogleBooksPublicationShapeAuditSummary: preteenPublicationShapeAuditSummary,
      preteenGoogleBooksPublicationShapeRescueAppliedByTitle: preteenPublicationShapeRescueAppliedByTitle,
      preteenGoogleBooksPublicationShapeRescueReasonByTitle: preteenPublicationShapeRescueReasonByTitle,
      preteenGoogleBooksPublicationShapeRescueEvidenceByTitle: preteenPublicationShapeRescueEvidenceByTitle,
      preteenGoogleBooksPublicationShapeRescuedTitles: preteenPublicationShapeRescuedTitles,
      preteenGoogleBooksPublicationShapeRescueRejectedTitles: preteenPublicationShapeRescueRejectedTitles,
      preteenGoogleBooksPublicationShapeRescueRejectedReasonByTitle: preteenPublicationShapeRescueRejectedReasonByTitle,
      preteenGoogleBooksPublicationShapeRescueEnteredScoringTitles: [],
      preteenGoogleBooksPublicationShapeRescueSelectedTitles: [],
      preteenGoogleBooksPublicationShapeRescueNotSelectedReasonByTitle: {},
      preteenGoogleBooksPublicationShapeRescueSummary: {
        scope: "preteen_googlebooks_unknown_publication_shape_rescue",
        consideredCount: preteenPublicationShapeRescuedTitles.length + preteenPublicationShapeRescueRejectedTitles.length,
        appliedCount: preteenPublicationShapeRescuedTitles.length,
        rejectedCount: preteenPublicationShapeRescueRejectedTitles.length,
        eligibleUnknownReasons: Array.from(PRETEEN_GOOGLE_BOOKS_RESCUABLE_UNKNOWN_REASONS),
        requiredIndependentEvidenceFamilyCount: 2,
        substantiveNarrativeMetadataRequired: true,
        titleOnlyRescueAllowed: false,
        automaticFinalAcceptance: false,
        otherAgeBandsChanged: false,
      },
      googleBooksModernNarrativeCountByQuery: modernNarrativeCountByQuery,
      googleBooksPublicDomainCatalogShapeCountByQuery: publicDomainCatalogShapeCountByQuery,
      adultGoogleBooksQueryQualityByQuery,
      adultGoogleBooksPublicationShapeHistogramByQuery: publicationShapeHistogramByQuery,
      adultGoogleBooksRejectedShapeHistogramByQuery: rejectedShapeHistogramByQuery,
      adultGoogleBooksNarrativeYieldByQuery: narrativeYieldByQuery,
      adultGoogleBooksNarrativeEfficiencyByQuery: narrativeEfficiencyByQuery,
      googleBooksQueryResultQualityByQuery: perQueryQuality,
    };

    return {
      source: "googleBooks",
      status,
      rawItems,
      diagnostics,
    };
  },
};
