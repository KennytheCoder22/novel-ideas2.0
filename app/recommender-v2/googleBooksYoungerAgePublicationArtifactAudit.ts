import type { AgeBandV2 } from "./types";

export type GoogleBooksYoungerAgePublicationIdentity =
  | "narrative_book"
  | "picture_book"
  | "early_reader"
  | "chapter_book"
  | "middle_grade_novel"
  | "young_adult_novel"
  | "graphic_novel"
  | "manga"
  | "light_novel"
  | "anthology"
  | "short_story_collection"
  | "nonfiction"
  | "educational_nonfiction"
  | "reference"
  | "literary_criticism"
  | "study_guide"
  | "teacher_resource"
  | "workbook"
  | "activity_book"
  | "school_publication"
  | "catalog"
  | "periodical"
  | "sampler"
  | "sneak_preview"
  | "excerpt"
  | "promotional_material"
  | "unknown";

export type GoogleBooksYoungerAgeArtifactStrength = "hard" | "probable" | "none";

export type GoogleBooksYoungerAgePublicationAudit = {
  identity: GoogleBooksYoungerAgePublicationIdentity;
  confidence: number;
  evidence: string[];
  artifactType: string;
  artifactEvidence: string[];
  artifactStrength: GoogleBooksYoungerAgeArtifactStrength;
  hardArtifactEvidence: string[];
  probableArtifactEvidence: string[];
  narrativeEvidence: string[];
  ageBandEvidence: string[];
  ambiguousEvidence: string[];
  recommendedFuturePolicyDecision: string;
};

export type GoogleBooksYoungerAgePublicationAuditInput = {
  requestedDeck: AgeBandV2;
  title: string;
  subtitle?: string;
  description?: string;
  categories?: string[];
  publisher?: string;
  authors?: string[];
  pageCount?: number;
  printType?: string;
  industryIdentifiers?: unknown[];
  maturityRating?: string;
  query?: string;
  sourceMetadata?: Record<string, unknown>;
};

function normalized(value: unknown): string {
  return String(value || "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function roundedConfidence(value: number): number {
  return Math.max(0, Math.min(1, Math.round(value * 100) / 100));
}

function unique(values: string[], limit = 24): string[] {
  const seen = new Set<string>();
  const output: string[] = [];
  for (const value of values) {
    const item = String(value || "").trim();
    const key = item.toLowerCase();
    if (!item || seen.has(key)) continue;
    seen.add(key);
    output.push(item);
    if (output.length >= limit) break;
  }
  return output;
}

function pushIf(target: string[], condition: boolean, evidence: string): void {
  if (condition) target.push(evidence);
}

function hasIsbn(identifiers: unknown[] | undefined): boolean {
  if (!Array.isArray(identifiers)) return false;
  return identifiers.some((identifier) => {
    const row = (identifier || {}) as Record<string, unknown>;
    return /\bisbn(?:_|\s|-)?(?:10|13)?\b/i.test(String(row.type || ""))
      && Boolean(String(row.identifier || "").trim());
  });
}

export function classifyGoogleBooksYoungerAgePublicationArtifact(input: GoogleBooksYoungerAgePublicationAuditInput): GoogleBooksYoungerAgePublicationAudit {
  const title = normalized(input.title);
  const subtitle = normalized(input.subtitle);
  const description = normalized(input.description);
  const categories = Array.isArray(input.categories) ? input.categories.map((item) => String(item || "").trim()).filter(Boolean) : [];
  const categoryText = normalized(categories.join(" | "));
  const publisher = normalized(input.publisher);
  const authorText = normalized((input.authors || []).join(" | "));
  const query = normalized(input.query);
  const printType = normalized(input.printType || "BOOK");
  const maturityRating = normalized(input.maturityRating);
  const combinedTitle = normalized([title, subtitle].filter(Boolean).join(" "));
  const allText = normalized([combinedTitle, description, categoryText, publisher, authorText].join(" "));
  const fieldEvidence: string[] = [];
  const hardArtifactEvidence: string[] = [];
  const probableArtifactEvidence: string[] = [];
  const narrativeEvidence: string[] = [];
  const ageBandEvidence: string[] = [];
  const ambiguousEvidence: string[] = [];

  pushIf(fieldEvidence, Boolean(combinedTitle), "title_present");
  pushIf(fieldEvidence, Boolean(description), "description_present");
  pushIf(fieldEvidence, categories.length > 0, "categories_present");
  pushIf(fieldEvidence, Boolean(publisher), "publisher_present");
  pushIf(fieldEvidence, Boolean(authorText), "authors_present");
  pushIf(fieldEvidence, Number.isFinite(Number(input.pageCount)), `page_count:${Number(input.pageCount || 0)}`);
  pushIf(fieldEvidence, hasIsbn(input.industryIdentifiers), "isbn_present");
  pushIf(fieldEvidence, Boolean(printType), `print_type:${printType}`);
  pushIf(fieldEvidence, Boolean(maturityRating), `maturity_rating:${maturityRating}`);
  pushIf(fieldEvidence, Boolean(query), `query:${query}`);

  pushIf(hardArtifactEvidence, /\bsneak previews?\b|\bsneak peeks?\b/.test(combinedTitle) || /\bsneak previews?\b|\bsneak peeks?\b/.test(description), "sneak_preview_identity");
  pushIf(hardArtifactEvidence, /\bsampler\b|\bsample chapters?\b|\bpreview sampler\b/.test(combinedTitle) || /\bsampler\b|\bsample chapters?\b|\bpreview sampler\b/.test(description), "sampler_identity");
  pushIf(hardArtifactEvidence, /\bexcerpts?\b|\bexclusive excerpt\b/.test(combinedTitle) || /\bexcerpts?\b|\bexclusive excerpt\b/.test(description), "excerpt_identity");
  pushIf(hardArtifactEvidence, /\b(promotional|preview issue|free comic book day|ashcan)\b/.test(allText), "promotional_material_identity");
  pushIf(hardArtifactEvidence, /\bschool publications?\b/.test(combinedTitle) || /\bschool publications?\b/.test(categoryText), "school_publication_identity");
  pushIf(hardArtifactEvidence, /\bteacher'?s? guide\b|\beducator guide\b|\blesson plans?\b|\bclassroom resources?\b|\bcurriculum\b|\bfor teachers\b/.test(allText), "teacher_resource_identity");
  pushIf(hardArtifactEvidence, /\bstudy guide\b|\bsparknotes\b|\bcliffsnotes\b|\bbookrags\b|\bteaching unit\b|\bchapter summaries?\b|\breading guide\b/.test(allText), "study_guide_identity");
  pushIf(hardArtifactEvidence, /\bworkbooks?\b|\bpractice book\b|\btest prep\b|\bexam prep\b/.test(allText), "workbook_identity");
  pushIf(hardArtifactEvidence, /\bactivity books?\b|\bcoloring books?\b|\bpuzzle books?\b|\bsticker books?\b|\bmaze books?\b/.test(allText), "activity_book_identity");
  pushIf(hardArtifactEvidence, /\bcatalog(?:ue)?\b|\bdirectory\b|\bbookseller\b|\blibrary catalog\b|\bbook list\b/.test(allText), "catalog_identity");
  pushIf(hardArtifactEvidence, /\bmagazine\b|\bperiodical\b|\bjournal\b|\bnewsletter\b|\bbulletin\b|\bissue\b|\bvolume \d+\b|\bvol\.?\s*\d+\b/.test(allText), "periodical_identity");
  pushIf(hardArtifactEvidence, /\bencyclopedia\b|\bdictionary\b|\breference\b|\bhandbook\b|\bguide to the best\b|\bguide to .* books\b|\bbest .* books\b/.test(allText), "reference_identity");
  pushIf(hardArtifactEvidence, /\bliterary criticism\b|\bhistory and criticism\b|\bcritical essays?\b|\bcritical study\b|\bstudies in\b|\banalysis of\b|\bthemes in\b/.test(allText), "literary_criticism_identity");

  pushIf(probableArtifactEvidence, /\bantholog(?:y|ies)\b|\bomnibus\b|\bbox(?:ed)? set\b|\bcollected\b|\bcollection of stories\b/.test(allText), "anthology_or_collection_identity");
  pushIf(probableArtifactEvidence, /\bshort stories\b|\bstory collection\b|\btales from\b/.test(allText), "short_story_collection_identity");
  pushIf(probableArtifactEvidence, /\bnonfiction\b|\bnon-fiction\b|\bbiography\b|\bautobiography\b|\bmemoir\b|\bhistory\b|\bscience\b|\bsocial science\b/.test(categoryText), "nonfiction_category_identity");
  pushIf(probableArtifactEvidence, /\beducation\b|\blanguage arts\b|\bjuvenile nonfiction\b|\bchildren'?s nonfiction\b/.test(categoryText), "educational_nonfiction_identity");

  pushIf(narrativeEvidence, /\byoung adult fiction\b|\bya fiction\b/.test(categoryText), "young_adult_fiction_category");
  pushIf(narrativeEvidence, /\bjuvenile fiction\b|\bchildren'?s fiction\b/.test(categoryText), "juvenile_fiction_category");
  pushIf(narrativeEvidence, /\bmiddle grade\b/.test(allText), "middle_grade_identity");
  pushIf(narrativeEvidence, /\bpicture books?\b/.test(allText), "picture_book_identity");
  pushIf(narrativeEvidence, /\bearly reader\b|\beasy reader\b|\bbeginner reader\b|\bleveled reader\b/.test(allText), "early_reader_identity");
  pushIf(narrativeEvidence, /\bchapter books?\b/.test(allText), "chapter_book_identity");
  pushIf(narrativeEvidence, /\bgraphic novels?\b|\bcomics?\b/.test(categoryText), "graphic_novel_category");
  pushIf(narrativeEvidence, /\bmanga\b/.test(allText), "manga_identity");
  pushIf(narrativeEvidence, /\blight novels?\b/.test(allText), "light_novel_identity");
  pushIf(narrativeEvidence, /\bnovel\b|\bfiction\b|\bstory follows\b|\bfollows\b|\btells the story\b|\bwhen [a-z]+\b|\bmust (?:save|find|solve|survive|discover|choose|face)\b/.test(allText), "story_or_fiction_identity");

  pushIf(ageBandEvidence, input.requestedDeck === "kids" && /\bages?\s*(?:3|4|5|6|7|8)\b|\bkindergarten\b|\bgrade\s*(?:k|1|2|3)\b|\bpicture books?\b|\bearly reader\b/.test(allText), "kids_age_band_metadata");
  pushIf(ageBandEvidence, input.requestedDeck === "preteens" && /\bages?\s*(?:8|9|10|11|12)\b|\bgrades?\s*(?:3|4|5|6|7)\b|\bmiddle grade\b/.test(allText), "preteen_age_band_metadata");
  pushIf(ageBandEvidence, input.requestedDeck === "teens" && /\bages?\s*(?:12|13|14|15|16|17|18)\b|\bgrades?\s*(?:7|8|9|10|11|12)\b|\byoung adult\b|\bteen\b/.test(allText), "teen_age_band_metadata");
  pushIf(ageBandEvidence, /\bjuvenile\b|\bchildren'?s\b|\byoung adult\b|\bteen\b|\bmiddle grade\b/.test(categoryText), "source_audience_category");

  pushIf(ambiguousEvidence, /\bbooks?\b/.test(combinedTitle), "book_word_in_title");
  pushIf(ambiguousEvidence, /\bfiction\b/.test(categoryText) && !/\b(juvenile fiction|young adult fiction)\b/.test(categoryText), "broad_fiction_category");
  pushIf(ambiguousEvidence, /\bpreview\b/.test(description) && !/\bsneak previews?\b/.test(description), "preview_language_without_clear_format");

  let identity: GoogleBooksYoungerAgePublicationIdentity = "unknown";
  let confidence = 0.35;
  if (hardArtifactEvidence.some((item) => item === "sneak_preview_identity")) identity = "sneak_preview";
  else if (hardArtifactEvidence.some((item) => item === "sampler_identity")) identity = "sampler";
  else if (hardArtifactEvidence.some((item) => item === "excerpt_identity")) identity = "excerpt";
  else if (hardArtifactEvidence.some((item) => item === "promotional_material_identity")) identity = "promotional_material";
  else if (hardArtifactEvidence.some((item) => item === "school_publication_identity")) identity = "school_publication";
  else if (hardArtifactEvidence.some((item) => item === "teacher_resource_identity")) identity = "teacher_resource";
  else if (hardArtifactEvidence.some((item) => item === "study_guide_identity")) identity = "study_guide";
  else if (hardArtifactEvidence.some((item) => item === "workbook_identity")) identity = "workbook";
  else if (hardArtifactEvidence.some((item) => item === "activity_book_identity")) identity = "activity_book";
  else if (hardArtifactEvidence.some((item) => item === "catalog_identity")) identity = "catalog";
  else if (hardArtifactEvidence.some((item) => item === "periodical_identity")) identity = "periodical";
  else if (hardArtifactEvidence.some((item) => item === "reference_identity")) identity = "reference";
  else if (hardArtifactEvidence.some((item) => item === "literary_criticism_identity")) identity = "literary_criticism";
  else if (probableArtifactEvidence.some((item) => item === "educational_nonfiction_identity")) identity = "educational_nonfiction";
  else if (probableArtifactEvidence.some((item) => item === "nonfiction_category_identity")) identity = "nonfiction";
  else if (probableArtifactEvidence.some((item) => item === "anthology_or_collection_identity")) identity = "anthology";
  else if (probableArtifactEvidence.some((item) => item === "short_story_collection_identity")) identity = "short_story_collection";
  else if (narrativeEvidence.some((item) => item === "manga_identity")) identity = "manga";
  else if (narrativeEvidence.some((item) => item === "light_novel_identity")) identity = "light_novel";
  else if (narrativeEvidence.some((item) => item === "graphic_novel_category")) identity = "graphic_novel";
  else if (narrativeEvidence.some((item) => item === "young_adult_fiction_category")) identity = "young_adult_novel";
  else if (narrativeEvidence.some((item) => item === "middle_grade_identity")) identity = "middle_grade_novel";
  else if (narrativeEvidence.some((item) => item === "chapter_book_identity")) identity = "chapter_book";
  else if (narrativeEvidence.some((item) => item === "early_reader_identity")) identity = "early_reader";
  else if (narrativeEvidence.some((item) => item === "picture_book_identity")) identity = "picture_book";
  else if (narrativeEvidence.length > 0) identity = "narrative_book";

  const hardArtifactIdentities = new Set<GoogleBooksYoungerAgePublicationIdentity>([
    "reference",
    "literary_criticism",
    "study_guide",
    "teacher_resource",
    "workbook",
    "activity_book",
    "school_publication",
    "catalog",
    "periodical",
    "sampler",
    "sneak_preview",
    "excerpt",
    "promotional_material",
  ]);
  const probableArtifactIdentities = new Set<GoogleBooksYoungerAgePublicationIdentity>([
    "anthology",
    "short_story_collection",
    "nonfiction",
    "educational_nonfiction",
  ]);
  const narrativeIdentities = new Set<GoogleBooksYoungerAgePublicationIdentity>([
    "narrative_book",
    "picture_book",
    "early_reader",
    "chapter_book",
    "middle_grade_novel",
    "young_adult_novel",
    "graphic_novel",
    "manga",
    "light_novel",
  ]);

  const artifactStrength: GoogleBooksYoungerAgeArtifactStrength = hardArtifactIdentities.has(identity)
    ? "hard"
    : probableArtifactIdentities.has(identity)
    ? "probable"
    : "none";
  if (artifactStrength === "hard") confidence = 0.95;
  else if (artifactStrength === "probable") confidence = 0.75;
  else if (narrativeIdentities.has(identity)) confidence = narrativeEvidence.length >= 2 || ageBandEvidence.length > 0 ? 0.8 : 0.65;

  const recommendedFuturePolicyDecision = artifactStrength === "hard"
    ? `future_reject_${identity}`
    : artifactStrength === "probable"
    ? `future_review_or_age_policy_${identity}`
    : narrativeIdentities.has(identity)
    ? `future_allow_if_age_and_taste_fit_${identity}`
    : "future_review_unknown_identity";

  return {
    identity,
    confidence: roundedConfidence(confidence),
    evidence: unique([...fieldEvidence, ...hardArtifactEvidence, ...probableArtifactEvidence, ...narrativeEvidence, ...ageBandEvidence, ...ambiguousEvidence]),
    artifactType: artifactStrength === "none" ? "" : identity,
    artifactEvidence: unique([...hardArtifactEvidence, ...probableArtifactEvidence]),
    artifactStrength,
    hardArtifactEvidence: unique(hardArtifactEvidence),
    probableArtifactEvidence: unique(probableArtifactEvidence),
    narrativeEvidence: unique(narrativeEvidence),
    ageBandEvidence: unique(ageBandEvidence),
    ambiguousEvidence: unique(ambiguousEvidence),
    recommendedFuturePolicyDecision,
  };
}
