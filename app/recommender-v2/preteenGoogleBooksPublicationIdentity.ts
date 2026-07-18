import type { ScoredCandidate } from "./types";

export type PreteenGoogleBooksPublicationIdentity =
  | "middle_grade_novel"
  | "chapter_book"
  | "graphic_novel"
  | "manga"
  | "light_novel"
  | "narrative_book"
  | "sampler"
  | "sneak_preview"
  | "excerpt"
  | "promotional_material"
  | "school_publication"
  | "catalog"
  | "classroom_material"
  | "study_guide"
  | "teacher_resource"
  | "workbook"
  | "activity_book"
  | "reference"
  | "nonfiction"
  | "unknown";

export type PreteenGoogleBooksPublicationIdentityAudit = {
  identity: PreteenGoogleBooksPublicationIdentity;
  confidence: number;
  allowed: boolean;
  reason: string;
  evidence: string[];
  narrativeEvidence: string[];
  artifactEvidence: string[];
  narrativeConfidenceSource: string[];
  trustedFieldEvidence: string[];
  overriddenNarrativeEvidence: string[];
  recommendedFuturePolicyDecision: string;
};

function normalized(value: unknown): string {
  return String(value || "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function asStringList(value: unknown): string[] {
  return Array.isArray(value) ? value.map((item) => String(item || "").trim()).filter(Boolean) : [];
}

function unique(values: string[], limit = 32): string[] {
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

function rawVolumeInfo(candidate: ScoredCandidate): Record<string, unknown> {
  const raw = (candidate.raw || {}) as Record<string, unknown>;
  return raw.volumeInfo && typeof raw.volumeInfo === "object" ? raw.volumeInfo as Record<string, unknown> : {};
}

function preteenGoogleBooksMetadata(candidate: ScoredCandidate): {
  title: string;
  subtitle: string;
  description: string;
  categories: string;
  publisher: string;
  authors: string;
  pageCount: number;
  printType: string;
  combined: string;
} {
  const raw = (candidate.raw || {}) as Record<string, unknown>;
  const volumeInfo = rawVolumeInfo(candidate);
  const categories = asStringList(volumeInfo.categories || candidate.genres);
  const publisher = String(volumeInfo.publisher || raw.publisher || "").trim();
  const authors = asStringList(volumeInfo.authors || candidate.creators);
  const pageCount = Number(volumeInfo.pageCount || raw.pageCount || 0);
  const printType = String(volumeInfo.printType || raw.printType || "").trim();
  const description = String(candidate.description || volumeInfo.description || raw.description || "").trim();
  const title = normalized(candidate.title);
  const subtitle = normalized(candidate.subtitle || volumeInfo.subtitle || "");
  const normalizedDescription = normalized(description);
  const normalizedCategories = normalized(categories.join(" | "));
  const normalizedPublisher = normalized(publisher);
  const normalizedAuthors = normalized(authors.join(" | "));
  const combined = normalized([
    title,
    subtitle,
    normalizedDescription,
    normalizedCategories,
    normalizedPublisher,
    normalizedAuthors,
  ].filter(Boolean).join(" "));
  return {
    title,
    subtitle,
    description: normalizedDescription,
    categories: normalizedCategories,
    publisher: normalizedPublisher,
    authors: normalizedAuthors,
    pageCount: Number.isFinite(pageCount) ? pageCount : 0,
    printType: normalized(printType),
    combined,
  };
}

export function preteenGoogleBooksPublicationIdentityAudit(candidate: ScoredCandidate): PreteenGoogleBooksPublicationIdentityAudit {
  const fields = preteenGoogleBooksMetadata(candidate);
  const titleSubtitle = `${fields.title} ${fields.subtitle}`.trim();
  const corroboration = `${fields.description} ${fields.categories} ${fields.publisher}`.trim();
  const evidence: string[] = [];
  const narrativeEvidence: string[] = [];
  const artifactEvidence: string[] = [];
  const trustedFieldEvidence: string[] = [];

  pushIf(trustedFieldEvidence, Boolean(fields.title), "title");
  pushIf(trustedFieldEvidence, Boolean(fields.subtitle), "subtitle");
  pushIf(trustedFieldEvidence, Boolean(fields.description), "description");
  pushIf(trustedFieldEvidence, Boolean(fields.categories), "categories");
  pushIf(trustedFieldEvidence, Boolean(fields.publisher), "publisher");
  pushIf(trustedFieldEvidence, Boolean(fields.authors), "authors");
  pushIf(trustedFieldEvidence, fields.pageCount > 0, `page_count:${fields.pageCount}`);
  pushIf(trustedFieldEvidence, Boolean(fields.printType), `print_type:${fields.printType}`);

  pushIf(narrativeEvidence, /\bmiddle grade\b/.test(fields.combined), "middle_grade_metadata");
  pushIf(narrativeEvidence, /\bjuvenile fiction\b|\bchildren'?s fiction\b/.test(fields.categories), "juvenile_fiction_category");
  pushIf(narrativeEvidence, /\bchapter books?\b/.test(fields.combined), "chapter_book_metadata");
  pushIf(narrativeEvidence, /\bgraphic novels?\b|\bcomics?\b/.test(fields.categories), "graphic_novel_category");
  pushIf(narrativeEvidence, /\bmanga\b/.test(fields.combined), "manga_metadata");
  pushIf(narrativeEvidence, /\blight novels?\b/.test(fields.combined), "light_novel_metadata");
  pushIf(narrativeEvidence, /\bnovel\b|\bstory\b|\bstories\b|\btale\b|\btales\b|\bfollows\b|\btells the story\b|\bmust (?:save|find|solve|survive|discover|choose|face)\b/.test(fields.combined), "story_level_or_fiction_language");
  pushIf(narrativeEvidence, /\b(scholastic|random house books for young readers|little brown books for young readers|harpercollins children|simon spotlight|candlewick|bloomsbury children|clarion books|greenwillow|aladdin)\b/.test(fields.publisher), "middle_grade_publisher_context");

  const samplerTitle = /\bsampler(?:\s|$|:|-|\(|\))/.test(titleSubtitle);
  const samplerCorroboration = /\b(sample chapters?|excerpt|preview|sneak peek|free sampler|includes excerpts?|selection from|teaser)\b/.test(corroboration);
  pushIf(artifactEvidence, samplerTitle && samplerCorroboration, "sampler_title_with_preview_or_excerpt_metadata");
  pushIf(artifactEvidence, samplerTitle && /\bmiddle grade sampler\b|\bkids? .* sampler\b|\byoung readers? sampler\b/.test(titleSubtitle), "age_band_sampler_title_shape");
  pushIf(artifactEvidence, /\bsneak previews?\b|\bsneak peeks?\b/.test(fields.combined), "sneak_preview_identity");
  pushIf(artifactEvidence, /\bexclusive excerpt\b|\bexcerpted from\b|\bchapter excerpt\b|\bpreview chapters?\b/.test(fields.combined), "excerpt_identity");
  pushIf(artifactEvidence, /\bpromotional\b|\bpreview issue\b|\bfree comic book day\b/.test(fields.combined), "promotional_material_identity");
  pushIf(artifactEvidence, /\bschool publications?\b/.test(titleSubtitle) || /\bschool publications?\b/.test(fields.categories), "school_publication_identity");
  pushIf(artifactEvidence, /\bteacher'?s? guide\b|\beducator guide\b|\blesson plans?\b|\bclassroom resources?\b|\bcurriculum\b|\bfor teachers\b/.test(fields.combined), "teacher_or_classroom_material_identity");
  pushIf(artifactEvidence, /\bstudy guide\b|\bchapter summaries?\b|\bteaching unit\b|\breading guide\b/.test(fields.combined), "study_guide_identity");
  pushIf(artifactEvidence, /\bworkbooks?\b|\bpractice book\b|\btest prep\b|\bexam prep\b/.test(fields.combined), "workbook_identity");
  pushIf(artifactEvidence, /\bactivity books?\b|\bcoloring books?\b|\bpuzzle books?\b|\bsticker books?\b|\bmaze books?\b/.test(fields.combined), "activity_book_identity");
  pushIf(artifactEvidence, /\bcatalog(?:ue)?\b|\bdirectory\b|\bbookseller\b|\blibrary catalog\b|\bbook list\b/.test(fields.combined), "catalog_identity");
  pushIf(artifactEvidence, /\bencyclopedia\b|\bdictionary\b|\breference\b|\bhandbook\b|\bguide to the best\b|\bguide to .* books\b|\bbest .* books\b/.test(fields.combined), "reference_identity");
  pushIf(artifactEvidence, /\bjuvenile nonfiction\b|\bchildren'?s nonfiction\b|\beducation\b|\blanguage arts\b/.test(fields.categories), "educational_nonfiction_category");

  let identity: PreteenGoogleBooksPublicationIdentity = "unknown";
  if (artifactEvidence.includes("school_publication_identity")) identity = "school_publication";
  else if (artifactEvidence.some((item) => item.includes("sampler"))) identity = "sampler";
  else if (artifactEvidence.includes("sneak_preview_identity")) identity = "sneak_preview";
  else if (artifactEvidence.includes("excerpt_identity")) identity = "excerpt";
  else if (artifactEvidence.includes("promotional_material_identity")) identity = "promotional_material";
  else if (artifactEvidence.includes("teacher_or_classroom_material_identity")) identity = "teacher_resource";
  else if (artifactEvidence.includes("study_guide_identity")) identity = "study_guide";
  else if (artifactEvidence.includes("workbook_identity")) identity = "workbook";
  else if (artifactEvidence.includes("activity_book_identity")) identity = "activity_book";
  else if (artifactEvidence.includes("catalog_identity")) identity = "catalog";
  else if (artifactEvidence.includes("reference_identity")) identity = "reference";
  else if (artifactEvidence.includes("educational_nonfiction_category")) identity = "nonfiction";
  else if (narrativeEvidence.includes("manga_metadata")) identity = "manga";
  else if (narrativeEvidence.includes("light_novel_metadata")) identity = "light_novel";
  else if (narrativeEvidence.includes("graphic_novel_category")) identity = "graphic_novel";
  else if (narrativeEvidence.includes("middle_grade_metadata") || narrativeEvidence.includes("juvenile_fiction_category")) identity = "middle_grade_novel";
  else if (narrativeEvidence.includes("chapter_book_metadata")) identity = "chapter_book";
  else if (narrativeEvidence.length > 0) identity = "narrative_book";

  const hardArtifactIdentities = new Set<PreteenGoogleBooksPublicationIdentity>([
    "sampler",
    "sneak_preview",
    "excerpt",
    "promotional_material",
    "school_publication",
    "catalog",
    "classroom_material",
    "study_guide",
    "teacher_resource",
    "workbook",
    "activity_book",
    "reference",
    "nonfiction",
  ]);
  const allowed = !hardArtifactIdentities.has(identity);
  const confidence = hardArtifactIdentities.has(identity)
    ? 0.95
    : identity === "unknown"
    ? 0.35
    : narrativeEvidence.length >= 2
    ? 0.85
    : 0.65;
  const narrativeConfidenceSource = unique(narrativeEvidence.map((item) => {
    if (/category/.test(item)) return `categories:${item}`;
    if (/publisher/.test(item)) return `publisher:${item}`;
    if (/story|fiction|novel/.test(item)) return `description_or_title:${item}`;
    return item;
  }));
  const overriddenNarrativeEvidence = allowed ? [] : narrativeEvidence;
  const reason = allowed
    ? `preteen_googlebooks_publication_identity_allowed_${identity}`
    : `preteen_googlebooks_publication_identity_rejected_${identity}`;
  const recommendedFuturePolicyDecision = allowed
    ? `allow_if_score_and_taste_fit_${identity}`
    : `reject_${identity}`;

  evidence.push(...trustedFieldEvidence, ...narrativeEvidence, ...artifactEvidence);

  return {
    identity,
    confidence,
    allowed,
    reason,
    evidence: unique(evidence),
    narrativeEvidence: unique(narrativeEvidence),
    artifactEvidence: unique(artifactEvidence),
    narrativeConfidenceSource,
    trustedFieldEvidence: unique(trustedFieldEvidence),
    overriddenNarrativeEvidence: unique(overriddenNarrativeEvidence),
    recommendedFuturePolicyDecision,
  };
}

export function annotatePreteenGoogleBooksPublicationIdentity(candidate: ScoredCandidate, audit = preteenGoogleBooksPublicationIdentityAudit(candidate)): void {
  candidate.diagnostics.preteenGoogleBooksPublicationIdentity = audit.identity;
  candidate.diagnostics.preteenGoogleBooksPublicationIdentityConfidence = audit.confidence;
  candidate.diagnostics.preteenGoogleBooksPublicationIdentityEvidence = audit.evidence;
  candidate.diagnostics.preteenGoogleBooksPublicationNarrativeEvidence = audit.narrativeEvidence;
  candidate.diagnostics.preteenGoogleBooksPublicationArtifactEvidence = audit.artifactEvidence;
  candidate.diagnostics.preteenGoogleBooksPublicationNarrativeConfidenceSource = audit.narrativeConfidenceSource;
  candidate.diagnostics.preteenGoogleBooksPublicationTrustedFieldEvidence = audit.trustedFieldEvidence;
  candidate.diagnostics.preteenGoogleBooksPublicationOverriddenNarrativeEvidence = audit.overriddenNarrativeEvidence;
  candidate.diagnostics.preteenGoogleBooksPublicationRecommendedFuturePolicyDecision = audit.recommendedFuturePolicyDecision;
  candidate.diagnostics.preteenGoogleBooksPublicationDecision = audit.allowed ? "allowed" : "rejected";
  candidate.diagnostics.preteenGoogleBooksPublicationDecisionReason = audit.reason;
}
