import type { NormalizedCandidate } from "../../app/recommender-v2/types";
import { cleanRecommendationDescription } from "../recommendationDescription";
import { canonicalBookIdentity, gameRecommendationCoverUrl } from "./gameRecommendationEngine";

export type MelanieDescriptionRejectionReason =
  | "missing_description"
  | "review_or_endorsement"
  | "author_biography"
  | "awards_or_bestseller_claim"
  | "academic_or_catalog_metadata"
  | "publication_metadata"
  | "table_of_contents"
  | "generic_promotion_without_premise"
  | "truncated_or_garbled"
  | "too_short"
  | "no_story_premise"
  | "identity_could_not_be_hidden"
  | "unsupported_format"
  | "outside_local_collection"
  | "duplicate_lower_priority"
  | "duplicate_premise";

export type MelanieDescriptionAttempt = {
  descriptionSource: string;
  priority: number;
  originalDescription: string;
  cleanedDescription: string;
  anonymizedDescription: string | null;
  rejectionReason: MelanieDescriptionRejectionReason | null;
};

export type MelanieCandidateDescriptionDiagnostic = {
  title: string;
  candidateSource: string;
  descriptionSource: string | null;
  originalDescription: string | null;
  cleanedDescription: string | null;
  anonymizedDescription: string | null;
  accepted: boolean;
  rejectionReason: MelanieDescriptionRejectionReason | null;
  attempts: MelanieDescriptionAttempt[];
};

export type MelanieDescriptionDiagnostics = {
  totalCandidates: number;
  acceptedCandidates: number;
  rejectedCandidates: number;
  byCandidateSource: Record<string, { total: number; accepted: number; rejected: number }>;
  byDescriptionSource: Record<string, { total: number; accepted: number; rejected: number }>;
  rejectionReasons: Partial<Record<MelanieDescriptionRejectionReason, number>>;
  candidates: MelanieCandidateDescriptionDiagnostic[];
};

export type MelanieStoryCandidate = {
  id: string;
  source: string;
  sourceId: string | null;
  title: string;
  author: string;
  synopsis: string;
  description: string;
  coverUrl: string | null;
  genres: string[];
  themes: string[];
  tones: string[];
  dynamics: string[];
};

type DescriptionOption = {
  descriptionSource: string;
  priority: number;
  value: unknown;
};

type AcceptedCandidate = {
  candidate: NormalizedCandidate;
  candidateIndex: number;
  identity: string;
  selection: MelanieDescriptionAttempt;
  diagnostic: MelanieCandidateDescriptionDiagnostic;
};

const REVIEW_OR_ENDORSEMENT = /\b(?:advance praise|praise for|starred review|booklist|kirkus reviews?|publishers weekly|school library journal|library journal|new york times book review|washington post|the guardian|a must[- ]read|tour de force|page[- ]turner|unputdownable|best in the genre|tremendous fun|fabulously satisfying|magnificent achievement|modern master|compared enthusiastically|novel of the year)\b|\b(?:author|writer) of\b|[“‘"'][^”’"']{4,}[”’"']\s*[—-]\s*[A-Z]/i;
const AUTHOR_BIOGRAPHY = /\b(?:is|was) (?:an? |the )?(?:award[- ]winning |best[- ]selling |bestselling )?(?:author|writer|novelist|journalist|professor|editor) of\b|\b(?:born|lives|resides|teaches|studied|graduated)\b.{0,80}\b(?:author|writer|novelist|professor)\b|^(?:his|her|their)\s+(?:career|passion|work|writing|prose|books?|stories|background|experience)\b/i;
const AWARDS_OR_BESTSELLER = /\b(?:new york times|usa today|international|number one|#1)\s+best[- ]sell|\bbest[- ]selling author\b|\baward[- ]winning\b|\b(?:winner|finalist|recipient) of (?:the |a )?\w.{0,60}\b(?:award|prize|medal)\b|\b(?:pulitzer|newbery|caldecott|national book award)\b/i;
const ACADEMIC_OR_CATALOG = /\b(?:seminar paper|term paper|thesis|bibliograph|index(?:ed|es)?\b|footnotes?|references|dissertation|monograph|scholarly|critical study|case studies|textbook|curriculum|study guide|reading group guide|teacher'?s guide|catalog(?:ue)? record|subject headings?)\b|\b(?:grade|course|language|abstract|university|institute|faculty|department)\s*:/i;
const SERIES_OR_EDITION_METADATA = /\b(?:stand-?alone (?:addition|entry)|addition to (?:the )?.{0,50}\bseries|level (?:one|two|three|\d+) .* read book|tie-in edition)\b/i;
const PUBLICATION_METADATA = /\b(?:ISBN(?:-1[03])?|hardcover|paperback|mass market|large print|publication date|published by|copyright \d{4}|first edition|revised edition|pages?: \d+|language:|dimensions?:)\b/i;
const TABLE_OF_CONTENTS = /\b(?:table of contents|contents)\s*[:—-]|\bchapter\s+(?:\d+|one|two|three|four|five)\b(?:.{0,40}\bchapter\b){2}/i;
const PROMOTIONAL_COPY = /\b(?:gripping|compelling|authoritative|riveting|stunning|masterful|brilliant|unforgettable|spellbinding|heartwarming|captivating|sensational|extraordinary|essential reading|perfect for (?:fans|readers)|readers will love|you can be anything you want|engaging stories|appealing plots|lovable characters|reading journey)\b/i;
const NARRATIVE_STRUCTURE = /\b(?:when|after|before|until|while|as soon as|years after|one day|on the eve of|in a world where|set in)\b/i;
const NARRATIVE_ACTION = /\b(?:follows?|tells the story|centers? on|sets? out|must|tries?|struggles?|discovers?|finds?|found|learns?|returns?|arrives?|enters?|faces?|confronts?|investigates?|uncovers?|searches?|seeks?|journeys?|travels?|escapes?|survives?|falls? in love|is forced|is drawn|is caught|goes? missing|goes? wild|disappears?|threatens?|kidnapped|murdered|haunted|wakes?|meets?|joins?|becomes?|protects?|saves?|ventures?|embarks?|befriends?|creates?|builds?|plans?|hopes?|wants?|takes?|brings?|forgets?|persuades?|turns? out)\b/i;
const STORY_SUBJECT = /\b(?:boys?|girls?|children|child|kids?|teens?|students?|women|woman|men|man|mothers?|fathers?|family|friends?|siblings?|sisters?|brothers?|detectives?|investigators?|heroes?|heroine|protagonist|travelers?|scientists?|soldiers?|princess|prince|witch|wizard|dragon|animal|rabbit|puppy|dog|cat|crew|community|village|kingdom)\b/i;
const STORY_CONFLICT = /\b(?:secret|mystery|danger|killer|quest|enemy|rival|threat|crime|murder|death|dead|survival|missing|lost|forbidden|betrayal|war|curse|challenge|disaster|earthquake|storm)\b/i;
const CONTEXTLESS_OPENING = /^(?:(?:and|but|or|so|however|yet)\s+(?:he|she|they|it|there|this|these|those)|his|her|their|they|he|she|it|having also)\b/i;
const COMMON_AUTHOR_SURNAMES = new Set(["brown", "green", "jones", "king", "smith", "white", "writer", "young"]);

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function descriptionValue(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (Array.isArray(value)) return value.map((entry) => String(entry || "").trim()).filter(Boolean).join(" ");
  const object = objectValue(value);
  return typeof object.value === "string" ? object.value.trim() : "";
}

function wordCount(value: string): number {
  return value.match(/\b[\p{L}\p{N}][\p{L}\p{N}'’-]*\b/gu)?.length || 0;
}

function descriptionOptions(candidate: NormalizedCandidate): DescriptionOption[] {
  const raw = objectValue(candidate.raw);
  const nestedRaw = objectValue(raw.raw);
  const volumeInfo = objectValue(raw.volumeInfo);
  const openLibraryDoc = objectValue(raw.rawOpenLibraryDoc);
  const attributes = objectValue(raw.attributes);
  const nestedAttributes = objectValue(nestedRaw.attributes);
  const localDescriptionSource = raw.descriptionSource === "marc520"
    ? "marc520"
    : "localLibrary.description";
  const localPriority = localDescriptionSource === "marc520" ? 1 : 4;
  const sourceOptions: Record<string, DescriptionOption[]> = {
    localLibrary: [
      { descriptionSource: localDescriptionSource, priority: localPriority, value: raw.description },
      { descriptionSource: localDescriptionSource, priority: localPriority, value: candidate.displayDescription },
      { descriptionSource: localDescriptionSource, priority: localPriority, value: candidate.description },
    ],
    googleBooks: [
      { descriptionSource: "googleBooks.publisherSynopsis", priority: 2, value: volumeInfo.description },
      { descriptionSource: "googleBooks.description", priority: 2, value: raw.description },
      { descriptionSource: "googleBooks.description", priority: 2, value: candidate.displayDescription },
      { descriptionSource: "googleBooks.description", priority: 2, value: candidate.description },
      { descriptionSource: "googleBooks.textSnippet", priority: 4, value: objectValue(raw.searchInfo).textSnippet },
    ],
    openLibrary: [
      { descriptionSource: "openLibrary.description", priority: 3, value: openLibraryDoc.description },
      { descriptionSource: "openLibrary.description", priority: 3, value: raw.description },
      { descriptionSource: "openLibrary.description", priority: 3, value: candidate.displayDescription },
      { descriptionSource: "openLibrary.description", priority: 3, value: candidate.description },
      { descriptionSource: "openLibrary.firstSentence", priority: 3, value: openLibraryDoc.first_sentence },
      { descriptionSource: "openLibrary.firstSentence", priority: 3, value: raw.first_sentence },
    ],
    kitsu: [
      { descriptionSource: "kitsu.synopsis", priority: 4, value: attributes.synopsis },
      { descriptionSource: "kitsu.synopsis", priority: 4, value: nestedAttributes.synopsis },
      { descriptionSource: "kitsu.description", priority: 4, value: candidate.displayDescription },
      { descriptionSource: "kitsu.description", priority: 4, value: candidate.description },
    ],
    comicVine: [
      { descriptionSource: "comicVine.description", priority: 4, value: nestedRaw.description },
      { descriptionSource: "comicVine.description", priority: 4, value: raw.description },
      { descriptionSource: "comicVine.description", priority: 4, value: candidate.displayDescription },
      { descriptionSource: "comicVine.deck", priority: 4, value: nestedRaw.deck },
      { descriptionSource: "comicVine.deck", priority: 4, value: raw.deck },
    ],
    nyt: [
      { descriptionSource: "nyt.publisherDescription", priority: 4, value: raw.description },
      { descriptionSource: "nyt.publisherDescription", priority: 4, value: candidate.displayDescription },
      { descriptionSource: "nyt.publisherDescription", priority: 4, value: candidate.description },
    ],
  };
  const options = sourceOptions[candidate.source] || [
    { descriptionSource: `${candidate.source}.description`, priority: 4, value: candidate.displayDescription },
    { descriptionSource: `${candidate.source}.description`, priority: 4, value: candidate.description },
    { descriptionSource: `${candidate.source}.description`, priority: 4, value: raw.description },
    { descriptionSource: `${candidate.source}.summary`, priority: 4, value: raw.summary },
  ];
  const seen = new Set<string>();
  return options.filter((option) => {
    const value = descriptionValue(option.value);
    const key = value.toLocaleLowerCase();
    if (!value || seen.has(key)) return false;
    seen.add(key);
    option.value = value;
    return true;
  });
}

function splitSentences(value: string): string[] {
  const segments = typeof Intl.Segmenter === "function"
    ? [...new Intl.Segmenter("en", { granularity: "sentence" }).segment(value)].map((part) => part.segment.trim())
    : value.match(/[^.!?]+(?:[.!?]+(?=\s|$)|$)/g)?.map((part) => part.trim()) || [value];
  const seen = new Set<string>();
  return segments.filter((sentence) => {
    const key = sentence.toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function stripLeadingSourceMetadata(value: string): string {
  return value
    .replace(/^[A-Z][A-Za-z &'’-]{2,40}\s+Australia\s+(?=When\b)/i, "")
    .replace(
      /^(?:(?:new york times|usa today|international)\s+best[- ]?selling\s+series|(?:gold|silver|bronze)\s+medal\s+winner\b.{0,100}?\bawards?)\b.{0,120}?(?=\b(?:at|when|after|before|a|an|the|one|two|three|four|five|six)\b)/i,
      "",
    )
    .trim();
}

function cleanSourceDescription(value: string): string {
  let cleaned = cleanRecommendationDescription(value)
    .replace(/\b(No|St|Mr|Mrs|Ms|Dr|Prof)\.\s+(?=[A-Z0-9])/g, "$1 ")
    .replace(/^(?:book|product|publisher(?:'s)?|editorial)?\s*(?:description|summary)\s*[:—-]\s*/i, "")
    .replace(/\s+(?:praise for|editorial reviews?|reviews?|about the author)\s*[:—-]\s*.*$/i, "")
    .replace(/\s+-{3,}\s+.*$/i, "")
    .replace(/\s+\*{1,2}(?:books? in this series|table of contents|about the author)\*{1,2}.*$/i, "")
    .replace(/\s+(?:read more|show less)\s*$/i, "")
    .replace(/^[A-Z][\p{L}.&'-]+(?:\s+[A-Z][\p{L}.&'-]+){0,3}\s+(?=(?:When|After|Before)\b)/u, "")
    .trim();
  cleaned = stripLeadingSourceMetadata(cleaned);
  const sentences = splitSentences(cleaned);
  cleaned = sentences.join(" ");
  return cleaned;
}

function hasStoryPremise(value: string): boolean {
  if (/\b(?:story|novel|tale)\s+(?:begins|follows|about|of)\b/i.test(value)) return true;
  if (/^(?:stepping|returning|arriving|traveling|travelling|searching|seeking|trying|hoping|fleeing|escaping)\b/i.test(value)) return true;
  if (NARRATIVE_STRUCTURE.test(value) && (NARRATIVE_ACTION.test(value) || STORY_CONFLICT.test(value))) return true;
  if (NARRATIVE_ACTION.test(value) && (STORY_SUBJECT.test(value) || STORY_CONFLICT.test(value))) return true;
  return /\b[A-Z][\p{L}'’-]+(?:\s+[A-Z][\p{L}'’-]+)?\s+(?:must|discovers?|finds?|learns?|takes?|brings?|forgets?|befriends?|faces?|returns?|investigates?|sets? out|is forced|goes? missing)\b/u.test(value);
}

function identityPatternSource(value: string): string {
  const words = value.match(/[\p{L}\p{N}]+/gu) || [];
  return words.map(escapeRegExp).join("[\\s\\W_]+");
}

function identityPattern(value: string): RegExp | null {
  const source = identityPatternSource(value);
  return source ? new RegExp(`\\b${source}\\b`, "iu") : null;
}

function titleIdentityTerms(title: string): string[] {
  const withoutParenthetical = title.replace(/\s*\([^)]*\)\s*$/, "").trim();
  const terms = [
    title,
    withoutParenthetical,
    withoutParenthetical.replace(/\s*[:/].*$/, "").trim(),
    withoutParenthetical.replace(/\s+and the\s+.*$/i, "").trim(),
    withoutParenthetical.replace(/^(?:the|a|an)\s+/i, "").trim(),
  ];
  const possessiveName = withoutParenthetical.match(/^([\p{L}]{4,})['’]s\b/u)?.[1];
  if (possessiveName) terms.push(possessiveName);
  return terms
    .filter((term, index) => term.length > 3 && terms.indexOf(term) === index)
    .sort((left, right) => right.length - left.length);
}

function authorIdentityTerms(authors: readonly string[]): string[] {
  return authors.flatMap((author) => {
    const normalized = author.trim();
    const words = normalized.match(/[\p{L}]+/gu) || [];
    const surname = words.at(-1) || "";
    return [
      normalized,
      ...(words.length > 1 && surname.length >= 5 && !COMMON_AUTHOR_SURNAMES.has(surname.toLocaleLowerCase()) ? [surname] : []),
    ];
  }).filter((term, index, terms) => term.length > 3 && terms.indexOf(term) === index);
}

function containsIdentity(value: string, terms: readonly string[]): boolean {
  return terms.some((term) => identityPattern(term)?.test(value));
}

function sentenceRejectionReason(
  sentence: string,
  title: string,
  authors: readonly string[],
): MelanieDescriptionRejectionReason | null {
  const authorTerms = authorIdentityTerms(authors).filter((term) => !containsIdentity(title, [term]));
  const startsWithTitleCopula = titleIdentityTerms(title).some((term) => {
    const source = identityPatternSource(term);
    return source ? new RegExp(`^${source}\\s+(?:is|was)\\b`, "iu").test(sentence) : false;
  });
  if (containsIdentity(sentence, authorTerms)) {
    return "author_biography";
  }
  if (startsWithTitleCopula) return "academic_or_catalog_metadata";
  if (
    containsIdentity(sentence, titleIdentityTerms(title))
    && (
      /\b(?:is|are)\s+(?:an?|the)\b.{0,60}\b(?:novel|book|series|story)\b/i.test(sentence)
      || /\b(?:novel|book|series)\b.{0,30}\b(?:tells|follows|continues)\b/i.test(sentence)
      || /\btells (?:the )?(?:origin )?story\b/i.test(sentence)
      || /\bhistory of\b/i.test(sentence)
    )
  ) return "academic_or_catalog_metadata";
  if (/^[“‘"']/.test(sentence) && PROMOTIONAL_COPY.test(sentence)) return "review_or_endorsement";
  if (REVIEW_OR_ENDORSEMENT.test(sentence)) return "review_or_endorsement";
  if (AUTHOR_BIOGRAPHY.test(sentence)) return "author_biography";
  if (AWARDS_OR_BESTSELLER.test(sentence)) return "awards_or_bestseller_claim";
  if (ACADEMIC_OR_CATALOG.test(sentence)) return "academic_or_catalog_metadata";
  if (SERIES_OR_EDITION_METADATA.test(sentence)) return "academic_or_catalog_metadata";
  if (PUBLICATION_METADATA.test(sentence)) return "publication_metadata";
  if (TABLE_OF_CONTENTS.test(sentence)) return "table_of_contents";
  if (/\b(?:you can be anything you want|engaging stories|appealing plots|lovable characters|reading journey)\b/i.test(sentence)) {
    return "generic_promotion_without_premise";
  }
  if (/\btakes? (?:another |a )?selfie\b/i.test(sentence)) return "no_story_premise";
  if (PROMOTIONAL_COPY.test(sentence) && !hasStoryPremise(sentence)) return "generic_promotion_without_premise";
  if (
    /\uFFFD|https?:\/\/|www\./i.test(sentence)
    || /(?:Ã.|â€|â€™|â€œ|â€˜)/.test(sentence)
    || /(\b\w+\b)(?:\s+\1){3,}/i.test(sentence)
    || (sentence.match(/[^\p{L}\p{N}\s.,!?;:'"“”‘’()—–-]/gu)?.length || 0) > Math.max(3, sentence.length * 0.04)
    || /(?:\.{3}|…)(?:\s*[”"')\]]*$|\s+[A-Z])/.test(sentence)
  ) return "truncated_or_garbled";
  return hasStoryPremise(sentence) ? null : "no_story_premise";
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function anonymizePremise(value: string, title: string, authors: readonly string[]): string | null {
  let anonymized = value;
  const titleTerms = titleIdentityTerms(title);
  for (const term of titleTerms) {
    const source = identityPatternSource(term);
    if (!source) continue;
    const replacement = /\b(?:and|children|people|bears|girls|boys|sisters|brothers|friends)\b/i.test(term)
      ? "the central characters"
      : "the protagonist";
    anonymized = anonymized
      .replace(
        new RegExp(`\\b(?:in|from|throughout|of)\\s+${source}\\b`, "gi"),
        (match) => match.toLocaleLowerCase().startsWith("of ") ? "of this story" : "in this story",
      )
      .replace(new RegExp(`\\b${source}\\b`, "gi"), replacement);
  }
  anonymized = anonymized
    .replace(/\b(?:the|a|an)\s+the (protagonist|central characters)\b/gi, "the $1")
    .replace(/\s+/g, " ")
    .trim();
  if (
    /the protagonist.{0,120}the protagonist/i.test(anonymized)
    || /(?:this story.{0,120}the protagonist|the protagonist.{0,120}this story)/i.test(anonymized)
    || /\bhistory of this story\b/i.test(anonymized)
    || /\bthe protagonist (?:book|novel|series|story)\b/i.test(anonymized)
    || /\b(?:fledgling|city|world|kingdom|island) the protagonist\b/i.test(anonymized)
  ) {
    return null;
  }
  anonymized = anonymized.replace(/^the (protagonist|central characters)\b/, (_, role: string) => `The ${role}`);
  const lowered = anonymized.toLocaleLowerCase();
  if (
    !anonymized
    || containsIdentity(lowered, authorIdentityTerms(authors))
    || containsIdentity(lowered, titleTerms)
  ) return null;
  return anonymized;
}

function selectPremise(
  originalDescription: string,
  title: string,
  authors: readonly string[],
): {
  cleanedDescription: string;
  anonymizedDescription: string | null;
  rejectionReason: MelanieDescriptionRejectionReason | null;
} {
  const cleanedSource = cleanSourceDescription(originalDescription);
  if (!cleanedSource) {
    return { cleanedDescription: "", anonymizedDescription: null, rejectionReason: "missing_description" };
  }
  const sentences = splitSentences(cleanedSource);
  const selected: string[] = [];
  let selectedWords = 0;
  let firstRejection: MelanieDescriptionRejectionReason | null = null;
  for (const sourceSentence of sentences) {
    const sentence = stripLeadingSourceMetadata(sourceSentence);
    if (!sentence) continue;
    let rejectionReason = sentenceRejectionReason(sentence, title, authors);
    if (
      !selected.length
      && (
        CONTEXTLESS_OPENING.test(sentence)
        || /^(?:in|within|over|during)\b.{0,60},\s+(?:he|she|they|his|her|their)\b/i.test(sentence)
        || /^(?:even more|more seriously|worse still)\b/i.test(sentence)
      )
    ) rejectionReason = "no_story_premise";
    if (
      selected.length
      && rejectionReason === "no_story_premise"
      && /^(?:how|why|what|who)\b/i.test(sentence)
    ) rejectionReason = null;
    if (rejectionReason) {
      firstRejection ||= rejectionReason;
      continue;
    }
    const sentenceWords = wordCount(sentence);
    if (selected.length && selectedWords + sentenceWords > 75) break;
    if (!selected.length && sentenceWords > 110) {
      firstRejection ||= "no_story_premise";
      continue;
    }
    selected.push(sentence);
    selectedWords += sentenceWords;
    if (selectedWords >= 25) break;
  }
  if (!selected.length) {
    return {
      cleanedDescription: cleanedSource,
      anonymizedDescription: null,
      rejectionReason: wordCount(cleanedSource) < 12 && firstRejection === "no_story_premise"
        ? "too_short"
        : firstRejection || "no_story_premise",
    };
  }
  const cleanedDescription = selected.join(" ");
  if (wordCount(cleanedDescription) < 12) {
    return { cleanedDescription, anonymizedDescription: null, rejectionReason: "too_short" };
  }
  const anonymizedDescription = anonymizePremise(cleanedDescription, title, authors);
  if (!anonymizedDescription) {
    return { cleanedDescription, anonymizedDescription: null, rejectionReason: "identity_could_not_be_hidden" };
  }
  return { cleanedDescription, anonymizedDescription, rejectionReason: null };
}

export function selectMelanieDescription(candidate: NormalizedCandidate): {
  selection: MelanieDescriptionAttempt | null;
  diagnostic: MelanieCandidateDescriptionDiagnostic;
} {
  const attempts = descriptionOptions(candidate).map((option): MelanieDescriptionAttempt => {
    const originalDescription = descriptionValue(option.value);
    const result = selectPremise(originalDescription, candidate.title, candidate.creators);
    return {
      descriptionSource: option.descriptionSource,
      priority: option.priority,
      originalDescription,
      ...result,
    };
  });
  const selection = attempts.find((attempt) => !attempt.rejectionReason) || null;
  const representative = selection || attempts[0] || null;
  return {
    selection,
    diagnostic: {
      title: candidate.title,
      candidateSource: candidate.source,
      descriptionSource: representative?.descriptionSource || null,
      originalDescription: representative?.originalDescription || null,
      cleanedDescription: representative?.cleanedDescription || null,
      anonymizedDescription: representative?.anonymizedDescription || null,
      accepted: Boolean(selection),
      rejectionReason: selection ? null : representative?.rejectionReason || "missing_description",
      attempts,
    },
  };
}

function buildDiagnostics(candidates: MelanieCandidateDescriptionDiagnostic[]): MelanieDescriptionDiagnostics {
  const byCandidateSource: MelanieDescriptionDiagnostics["byCandidateSource"] = {};
  const byDescriptionSource: MelanieDescriptionDiagnostics["byDescriptionSource"] = {};
  const rejectionReasons: MelanieDescriptionDiagnostics["rejectionReasons"] = {};
  for (const candidate of candidates) {
    const source = byCandidateSource[candidate.candidateSource] ||= { total: 0, accepted: 0, rejected: 0 };
    source.total += 1;
    source[candidate.accepted ? "accepted" : "rejected"] += 1;
    if (candidate.descriptionSource) {
      const descriptionSource = byDescriptionSource[candidate.descriptionSource] ||= { total: 0, accepted: 0, rejected: 0 };
      descriptionSource.total += 1;
      descriptionSource[candidate.accepted ? "accepted" : "rejected"] += 1;
    }
    if (candidate.rejectionReason) {
      rejectionReasons[candidate.rejectionReason] = (rejectionReasons[candidate.rejectionReason] || 0) + 1;
    }
  }
  const acceptedCandidates = candidates.filter((candidate) => candidate.accepted).length;
  return {
    totalCandidates: candidates.length,
    acceptedCandidates,
    rejectedCandidates: candidates.length - acceptedCandidates,
    byCandidateSource,
    byDescriptionSource,
    rejectionReasons,
    candidates,
  };
}

export function catalogMelanieStories(
  candidates: readonly NormalizedCandidate[],
  localOnly: boolean,
): { stories: MelanieStoryCandidate[]; diagnostics: MelanieDescriptionDiagnostics } {
  const evaluated: AcceptedCandidate[] = [];
  const diagnostics: MelanieCandidateDescriptionDiagnostic[] = [];
  candidates.forEach((candidate, candidateIndex) => {
    if (!candidate.formats.includes("book")) {
      diagnostics.push({
        title: candidate.title, candidateSource: candidate.source, descriptionSource: null,
        originalDescription: null, cleanedDescription: null, anonymizedDescription: null,
        accepted: false, rejectionReason: "unsupported_format", attempts: [],
      });
      return;
    }
    if (localOnly && candidate.source !== "localLibrary") {
      diagnostics.push({
        title: candidate.title, candidateSource: candidate.source, descriptionSource: null,
        originalDescription: null, cleanedDescription: null, anonymizedDescription: null,
        accepted: false, rejectionReason: "outside_local_collection", attempts: [],
      });
      return;
    }
    const result = selectMelanieDescription(candidate);
    diagnostics.push(result.diagnostic);
    if (result.selection) {
      evaluated.push({
        candidate,
        candidateIndex,
        identity: canonicalBookIdentity(candidate),
        selection: result.selection,
        diagnostic: result.diagnostic,
      });
    }
  });

  const byIdentity = new Map<string, AcceptedCandidate[]>();
  for (const entry of evaluated) {
    const group = byIdentity.get(entry.identity) || [];
    group.push(entry);
    byIdentity.set(entry.identity, group);
  }
  const winners: AcceptedCandidate[] = [];
  for (const group of byIdentity.values()) {
    group.sort((left, right) => left.selection.priority - right.selection.priority || left.candidateIndex - right.candidateIndex);
    winners.push(group[0]);
    for (const duplicate of group.slice(1)) {
      duplicate.diagnostic.accepted = false;
      duplicate.diagnostic.rejectionReason = "duplicate_lower_priority";
    }
  }
  winners.sort((left, right) => left.candidateIndex - right.candidateIndex);

  const premises = new Set<string>();
  const stories: MelanieStoryCandidate[] = [];
  for (const entry of winners) {
    const premiseKey = entry.selection.anonymizedDescription!.toLocaleLowerCase();
    if (premises.has(premiseKey)) {
      entry.diagnostic.accepted = false;
      entry.diagnostic.rejectionReason = "duplicate_premise";
      continue;
    }
    premises.add(premiseKey);
    entry.diagnostic.accepted = true;
    entry.diagnostic.rejectionReason = null;
    stories.push({
      id: entry.identity,
      source: entry.candidate.source,
      sourceId: entry.candidate.sourceId || null,
      title: entry.candidate.title,
      author: entry.candidate.creators.join(", "),
      synopsis: entry.selection.anonymizedDescription!,
      description: entry.selection.cleanedDescription,
      coverUrl: gameRecommendationCoverUrl(entry.candidate),
      genres: entry.candidate.genres,
      themes: entry.candidate.themes,
      tones: entry.candidate.tones,
      dynamics: entry.candidate.characterDynamics,
    });
  }
  return { stories, diagnostics: buildDiagnostics(diagnostics) };
}

export function anonymousMelaniePremise(
  description: string,
  title: string,
  authors: readonly string[],
): string | null {
  return selectPremise(description, title, authors).anonymizedDescription;
}

export function isUsableMelaniePremise(description: string): boolean {
  return Boolean(selectPremise(description, "", []).anonymizedDescription);
}
