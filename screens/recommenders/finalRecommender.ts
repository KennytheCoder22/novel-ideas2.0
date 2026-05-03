import type { DeckKey, RecommendationDoc, TasteProfile } from './types';
import type { Candidate } from './normalizeCandidate';
import { type RecommenderLane } from './recommenderProfiles';
import { computeToneMatchScore } from './toneScoring';

export type FinalRecommenderOptions = {
  lane?: RecommenderLane;
  deckKey?: DeckKey;
  tasteProfile?: TasteProfile;
  aiReranker?: (input: {
    tasteProfile?: TasteProfile;
    candidates: Array<{ id: string; title: string; author: string; summary: string; baseScore: number }>;
  }) => Array<{ id: string; score: number; reason?: string }>;
};

export type QualityRejectReason =
  | 'missing_title'
  | 'missing_author'
  | 'too_short'
  | 'hard_reject_title'
  | 'hard_reject_publisher'
  | 'hard_reject_text'
  | 'non_fiction_meta'
  | 'low_metadata_trust'
  | 'weak_fiction_signal'
  | 'formula_series_spam';

export type QualityRejectRecord = {
  id: string;
  title: string;
  author: string;
  source: Candidate['source'];
  reason: QualityRejectReason;
  detail?: string;
};

export type ScoreBreakdown = {
  queryScore: number;
  metadataScore: number;
  authorityScore: number;
  behaviorScore: number;
  narrativeScore: number;
  penaltyScore: number;
  genericTitlePenalty: number;
  overfitPenalty: number;
  anchorBoost: number;
  filterSignalScore: number;
  personalAffinityScore: number;
  laneBlendScore: number;
  toneScore: number;
  procurementScore: number;
  groundedRealismScore: number;
  psychologicalIntensityScore: number;
  emotionalWeightScore: number;
  finalScore: number;
};

export type FinalRecommenderDebug = {
  inputCount: number;
  dedupedCount: number;
  acceptedCount: number;
  rejectedCount: number;
  rejectionCounts: Record<string, number>;
  rejected: QualityRejectRecord[];
};

const PERSONAL_AFFINITY_WEIGHT = 4.5;
const ANCHOR_SCORE_CAP = 10;
const NEGATIVE_TASTE_MISMATCH_PENALTY = -18;
const MIN_TASTE_SCORE_FOR_RANKING = 0.75;
const TARGET_MIN_RESULTS_WHEN_VIABLE = 8;

// Temporary validation logging for the taste-shaped query rollout.
// Set to false after filtering/ranking behavior is confirmed stable.
const DEBUG_FINAL_RECOMMENDER_VALIDATION = true;

function debugFinalLog(label: string, payload?: unknown): void {
  if (!DEBUG_FINAL_RECOMMENDER_VALIDATION) return;
  if (payload === undefined) console.log(`[FINAL RECOMMENDER DEBUG] ${label}`);
  else console.log(`[FINAL RECOMMENDER DEBUG] ${label}`, payload);
}

function debugFinalPreview(label: string, entries: Array<{ candidate: Candidate; breakdown?: ScoreBreakdown }> | Candidate[], limit = 10): void {
  if (!DEBUG_FINAL_RECOMMENDER_VALIDATION) return;
  const safeEntries = Array.isArray(entries) ? entries : [];
  console.log(`[FINAL RECOMMENDER DEBUG] ${label} COUNT:`, safeEntries.length);
  safeEntries.slice(0, limit).forEach((entry: any, index) => {
    const candidate = entry?.candidate || entry;
    console.log(`[FINAL RECOMMENDER DEBUG] ${label} ${index + 1}:`, candidate?.title, "|", candidate?.author, "|", candidate?.source, "| score=", entry?.breakdown?.finalScore);
  });
}

let lastFinalRecommenderDebug: FinalRecommenderDebug = {
  inputCount: 0,
  dedupedCount: 0,
  acceptedCount: 0,
  rejectedCount: 0,
  rejectionCounts: {},
  rejected: [],
};

export function getLastFinalRecommenderDebug(): FinalRecommenderDebug {
  return lastFinalRecommenderDebug;
}

function normalize(value: unknown): string {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function identityKey(c: Candidate): string {
  return `${normalize(c.title)}|${normalize(c.author)}`;
}

function haystack(c: Candidate): string {
  const subjects = Array.isArray(c?.subjects) ? c.subjects : [];
  const genres = Array.isArray(c?.genres) ? c.genres : [];

  return [
    c?.title || '',
    c?.subtitle || '',
    c?.author || '',
    c?.publisher || '',
    c?.description || '',
    ...subjects,
    ...genres
  ].join(' ').toLowerCase();
}

function explicitLaneForCandidate(c: Candidate): string {
  const rawDoc: any = c?.rawDoc || {};
  const diagnostics = rawDoc?.diagnostics || {};
  const family = String(
    diagnostics?.filterFamily ||
    diagnostics?.filterDiagnostics?.family ||
    rawDoc?.filterFamily ||
    rawDoc?.queryFamily ||
    (c as any)?.queryFamily ||
    rawDoc?.lane ||
    (c as any)?.lane ||
    rawDoc?.laneKind ||
    (c as any)?.laneKind ||
    ""
  ).toLowerCase();

  if (family === "science_fiction_family") return "science_fiction";
  if (family === "speculative_family") return "speculative";
  return family;
}

function isValidCandidate(c: Candidate): boolean {
  return Boolean(c && c.title);
}

function isLikelyNonFictionMeta(c: Candidate): boolean {
  const text = haystack(c);

  return (
    /guide|handbook|encyclopedia|history of|studies|analysis|criticism|review|digest/.test(text) ||
    /writers|writing|how to write|advisory/.test(text) ||
    /magazine|journal|bulletin/.test(text) ||
    /anthology|collection/.test(text) ||
    /reference|companion|literature/.test(text) ||
    /publishers weekly|booklist|cambridge history|atlantic monthly/.test(text)
  );
}

function evidenceRank(c: Candidate): number {
  return Number.isFinite(Number(c.queryRung)) ? Number(c.queryRung) : 999;
}

function isHistoricalCandidate(c: Candidate): boolean {
  return explicitLaneForCandidate(c) === "historical";
}

function historicalDedupePreference(
  c: Candidate,
  isOpenLibrary: boolean,
  filterSignals: number,
  anchor: number
): number {
  let score = filterSignals + anchor;
  if (isOpenLibrary) score += 2;
  if (c.description) score += 1;
  if (c.hasCover) score += 1;
  if ((c.pageCount || 0) >= 120) score += 1;
  return score;
}

function dedupe(candidates: Candidate[]): Candidate[] {
  const map = new Map<string, Candidate>();

  for (const c of candidates) {
    const key = identityKey(c);
    const existing = map.get(key);

    if (!existing) {
      map.set(key, c);
      continue;
    }

    const currentRank = evidenceRank(c);
    const existingRank = evidenceRank(existing);
    const currentIsOpenLibrary = isOpenLibraryCandidate(c);
    const existingIsOpenLibrary = isOpenLibraryCandidate(existing);
    const currentFilterSignals = filterSignalScore(c);
    const existingFilterSignals = filterSignalScore(existing);
    const currentAnchor = anchorBoost(c);
    const existingAnchor = anchorBoost(existing);

    if (isHistoricalCandidate(c) || isHistoricalCandidate(existing)) {
      const currentPreference = historicalDedupePreference(c, currentIsOpenLibrary, currentFilterSignals, currentAnchor);
      const existingPreference = historicalDedupePreference(existing, existingIsOpenLibrary, existingFilterSignals, existingAnchor);

      if (currentPreference > existingPreference) {
        map.set(key, c);
        continue;
      }

      if (currentPreference === existingPreference && currentRank !== existingRank) {
        // Historical rungs are different shelves, not a strict quality order.
        // Keep rung as a tiebreaker only so lower rungs no longer erase better alternate-rung evidence.
        if (currentRank < existingRank) {
          map.set(key, c);
          continue;
        }
      }

      continue;
    }

    if (currentRank < existingRank) {
      map.set(key, c);
      continue;
    }

    if (currentRank === existingRank) {
      if (currentIsOpenLibrary !== existingIsOpenLibrary) {
        const currentPreference = (currentIsOpenLibrary ? 1 : 0) + currentFilterSignals + currentAnchor;
        const existingPreference = (existingIsOpenLibrary ? 1 : 0) + existingFilterSignals + existingAnchor;
        if (currentPreference > existingPreference) {
          map.set(key, c);
          continue;
        }
      }

      const currentHasDescription = Boolean(c.description);
      const existingHasDescription = Boolean(existing.description);

      if (currentHasDescription && !existingHasDescription) {
        map.set(key, c);
        continue;
      }

      if (currentHasDescription === existingHasDescription && c.hasCover && !existing.hasCover) {
        map.set(key, c);
        continue;
      }

      if (currentFilterSignals + currentAnchor > existingFilterSignals + existingAnchor) {
        map.set(key, c);
      }
    }
  }

  return Array.from(map.values());
}

function metadataTrust(c: Candidate): number {
  let score = 0;
  const raw: any = c.rawDoc || {};
  const volumeInfo = raw.volumeInfo || {};
  const identifiers = Array.isArray(volumeInfo.industryIdentifiers) ? volumeInfo.industryIdentifiers : [];

  if (
    raw.isbn ||
    raw.isbn13 ||
    raw.isbn10 ||
    identifiers.some((id: any) => String(id?.type || '').includes('ISBN') && id?.identifier)
  ) {
    score += 1;
  }

  if (raw.lccn || raw.oclc || raw.googleBooksId || raw.id || raw.key) score += 1;
  if (c.description) score += 1;
  if (c.hasCover) score += 1;
  if ((c.pageCount || 0) >= 120) score += 1;
  if ((c.ratingCount || 0) >= 5) score += 1;
  return score;
}

function authorityScore(c: Candidate): number {
  const ratings = c.ratingCount || 0;
  const text = haystack(c);
  const canonicalSignal = /\b(shutter island|gone girl|red dragon|the silence of the lambs|the silent patient|the girl on the train|mr\.? mercedes)\b/.test(text);
  const publisher = normalize(c.publisher);
  const mainstreamPublisher = /\b(penguin|random house|knopf|doubleday|viking|harper|macmillan|simon\s*&?\s*schuster|hachette|st\.? martin|ballantine|minotaur|little brown|sourcebooks|berkley|delacorte|orbit|scribner|putnam)\b/.test(publisher);

  if (ratings >= 10000) return 8;
  if (ratings >= 3000) return 6;
  if (ratings >= 1000) return 5;
  if (ratings >= 200) return 3;
  if (ratings >= 50) return 1.5;
  if (ratings === 0 && (canonicalSignal || mainstreamPublisher)) return -1.5;
  if (ratings >= 10) return 0;
  if (ratings > 0) return -5;

  return -7;
}

function hasFictionSignals(c: Candidate): boolean {
  const text = haystack(c);
  return (
    /science fiction|fantasy|horror|thriller|mystery|survival|dystopian|speculative|suspense|crime|detective|romance|historical fiction|historical novel|period fiction/.test(text) ||
    /novel|fiction|manga|graphic novel|comic/.test(text) ||
    /follows|tells the story|story of|when .* discovers|investigation|journey/.test(text)
  );
}

function isHardReject(c: Candidate): { reject: boolean; reason?: QualityRejectReason; detail?: string } {
  const title = normalize(c.title);
  const publisher = normalize(c.publisher);
  const text = haystack(c);
  const author = typeof c.author === "string" ? c.author : "";
  const hasAuthor = typeof author === "string" && author.trim().length > 0;

  if (!title) return { reject: true, reason: 'missing_title', detail: 'empty title' };
  if (!hasAuthor || normalize(c.author) === 'unknown') {
    return { reject: true, reason: 'missing_author', detail: 'missing or unknown author' };
  }

  const source = normalize(c.source);
  const publicationYear = Number(c.publicationYear || (c.rawDoc as any)?.first_publish_year || 0);
  const ratings = Number(c.ratingCount || 0);
  const canonicalStrength = anchorBoost(c);
  const hasCommercialShape =
    ratings >= 25 ||
    canonicalStrength >= 12 ||
    /\b(penguin|random house|knopf|doubleday|viking|harper|macmillan|tor|simon\s*&?\s*schuster|hachette|st\.? martin|ballantine|minotaur|mysterious press)\b/.test(publisher);

  const knownFormulaAuthor =
    /\b(blake pierce|ava strong|jack mars|morgan rice|sara fendrick|harper lin)\b/.test(normalize(c.author));
  const formulaicTitle =
    /\b(a|an)\s+[a-z]+\s+(fbi|detective|crime|mystery|suspense)\s+thriller\b/.test(title) ||
    /\b(book|volume|part)\s*\d+\b/.test(title) ||
    /\b(series|series starter|fbi suspense thriller)\b/.test(text);
  const repetitiveDomesticPattern = /\b(wife|husband|perfect family|family secret|the secret|the lie|the perfect|missing wife|perfect marriage)\b/.test(title);
  const weakAuthorityThriller =
    /\b(thriller|suspense|crime|mystery|fbi|detective|serial killer|manhunt|abduction)\b/.test(text) &&
    ratings < 25 &&
    !hasCommercialShape &&
    !Boolean((c.rawDoc as any)?.commercialSignals?.bestseller);
  const repeatedFormulaSpam = ((knownFormulaAuthor && ratings < 50) || formulaicTitle) && repetitiveDomesticPattern;

  if ((knownFormulaAuthor && ratings < 200) || (formulaicTitle && weakAuthorityThriller)) {
    return {
      reject: true,
      reason: 'formula_series_spam',
      detail: `author=${c.author}, ratings=${ratings}, title=${c.title}`,
    };
  }

  // Google Books often surfaces public-domain or metadata-thin editions for broad
  // mystery queries. Unless an older item has clear authority/canonical signals,
  // keep it out of the final shelf so it cannot crowd out modern/high-signal books.
  if (source === 'googlebooks' && publicationYear > 0 && publicationYear < 1950 && !hasCommercialShape) {
    return {
      reject: true,
      reason: 'low_metadata_trust',
      detail: `old low-authority google books result: year=${publicationYear}, ratings=${ratings}`,
    };
  }

  if ((c.pageCount || 0) > 0 && c.pageCount < 60) {
    return { reject: true, reason: 'too_short', detail: `pageCount=${c.pageCount}` };
  }

  const hardRejectTitlePatterns = [
    /\bguide\b/,
    /\bcompanion\b/,
    /\banalysis\b/,
    /\bcritic(?:ism|al)\b/,
    /\bintroduction to\b/,
    /\bsource\s*book\b/,
    /\bhandbook\b/,
    /\bmanual\b/,
    /\breference\b/,
    /\bcatalog(?:ue)?\b/,
    /\bencyclopedia\b/,
    /\bessays?\b/,
    /\babout the author\b/,
    /\bpublishers?\s+weekly\b/,
 /\bbraille books?\b/,
 /\bcumulated fiction index\b/,
 /\btechnique of the mystery story\b/,
 /\breaders?\s+advisory\b/,
 /\bguide to genre fiction\b/,
 /\bmammoth book\b/,
    /\b(best|great|five|100|hundred|classic|selected)\s+(science fiction\s+)?novels\b/,
    /^\s*(the\s+)?science\s+fiction\s+novels?\s*$/,
    /\bscience and fiction\b/,
    /\b(survey of|companion to|readings in|history of|principles of|index(?:es)?|criticism of)\b.*\b(science fiction|sci-fi|novels?|fiction|literature)\b/,
    /\bcomplete novels\b/,
    /\bselected stories\b/,
    /\bshort science fiction novels\b/,
    /\bbaker['’]?s dozen\b/,
    /\bjournal\b/,
    /\bmagazine\b/,
    /\bnewsweek\b/,
    /\bvoice of youth advocates\b/,
    /\btalking books?\b/,
    /\bbook dealers?\b/,
    /\bcontemporary authors\b/,
    /\bright book\s*right time\b/,
    /\bvideo source book\b/,
    /\byoung adult fiction index\b/,
    /\bbooks for tired eyes\b/,
    /\bkindle cash machine\b/,
    /\bcareers? for\b/,
    /\bpresenting young adult\b/,
    /\bsourcebook\b/,
    /\bbibliograph(?:y|ies)\b/,
    /\brevision series\b/,
    /\bbooklist\b/,
    /\bliterary supplement\b/,
    /\bnew statesman\b/,
    /\bamerican book publishing record\b/,
    /\bquill\s*&\s*quire\b/,
    /\bbookmen\b/,
    /\bperiodical\b/,
    /\btimes literary supplement\b/,
    /\ba\s*l\s*a\s*booklist\b/
    ,/\byear\s*book\b/
    ,/\bbest\s*sellers?\b/
    ,/\bbest science fiction of the year\b/
    ,/\bwho really wrote\b/
    ,/\balien sex\b/
    ,/\bhistorical novels?\b$/
    ,/\bcollected works?\b/
    ,/\btextbook\b/
  ];

  if (hardRejectTitlePatterns.some((rx) => rx.test(title))) {
    return { reject: true, reason: 'hard_reject_title', detail: title };
  }

  const hardRejectPublisherPatterns = [
    /\bencyclop(?:a|e)dia britannica\b/,
    /\bnew statesman\b/,
    /\btimes literary supplement\b/,
    /\bbooklist\b/
  ];

  if (hardRejectPublisherPatterns.some((rx) => rx.test(publisher))) {
    return { reject: true, reason: 'hard_reject_publisher', detail: publisher };
  }

  const hardRejectTextPatterns = [
    /\bscience fiction\b.*\b(criticism|literary criticism|literature|history and criticism|bibliography|reference|study|studies|survey|guide|companion|readings|index(?:es)?|principles)\b/,
    /\b(criticism|literary criticism|literature|history and criticism|bibliography|reference|study|studies|survey|guide|companion|readings|index(?:es)?|principles)\b.*\bscience fiction\b/,
    /\b(anthology|anthologies|collection|collections|collected|complete novels|selected stories|short stories|short science fiction novels|boxed set|box set|omnibus|baker['’]?s dozen)\b/,
    /\bstudy aids?\b/,
    /\bliterary criticism\b/,
    /\breference\b/,
    /\bbooks and reading\b/,
    /\bpublishing\b/,
    /\bperiodicals?\b/,
    /\bnonfiction\b/,
    /\bbiography\b/,
    /\bmemoir\b/,
    /\bguide to\b/,
    /\bhow to\b/,
    /\blearn how to\b/,
    /\bwritten for students\b/,
    /\blibrary of congress\b/,
    /\bnational library service\b/,
    /\breaders?\s+advisory\b/,
    /\bgenre fiction\b/,
    /\bfaith-based domestic suspense\b/,
    /\bchristian fiction\b/,
    /\byear\s*book\b/,
    /\bbest\s*sellers?\b.*\b(anthology|collection|year|guide|reference)\b/,
    /\bforbidden love\b/,
    /\btextbook\b/,
    /\bworkbook\b/,
    /\bstudy guide\b/
  ];

  if (hardRejectTextPatterns.some((rx) => rx.test(text))) {
    return { reject: true, reason: 'hard_reject_text', detail: text.slice(0, 180) };
  }

  if (/\bantholog(?:y|ies)\b|\bcollections?\b|\bcollected\b|\bcomplete novels\b|\bselected stories\b|\bshort stories\b|\bshort science fiction novels\b|\bbaker['’]?s dozen\b|\bomnibus\b|\bboxed set\b|\bbox set\b|\bbooks?\s*\d+\s*-\s*\d+\b/.test(text)) {
    return { reject: true, reason: 'non_fiction_meta', detail: 'collection or omnibus signal' };
  }

  return { reject: false };
}

function passesQuality(c: Candidate): { pass: boolean; reason?: QualityRejectReason; detail?: string } {
  const hardReject = isHardReject(c);
  if (hardReject.reject) return { pass: false, reason: hardReject.reason, detail: hardReject.detail };
  const isOL = isOpenLibraryCandidate(c);
  const title = normalize(c.title);
  const author = normalize(c.author);
  if (isOL && (!author || author === "unknown author")) {
    return { pass: false, reason: 'low_metadata_trust', detail: 'openlibrary_missing_author' };
  }
  if (isOL && (title === "dark fantasy" || title === "science fiction" || title === "fantasy")) {
    return { pass: false, reason: 'non_fiction_meta', detail: `openlibrary_generic_title:${title}` };
  }

  const fictionSignals = hasFictionSignals(c);

  // Only let meta/non-fiction heuristics win when we do not also have fiction/narrative evidence.
  if (isLikelyNonFictionMeta(c) && !fictionSignals) {
    return { pass: false, reason: 'non_fiction_meta', detail: 'non-fiction/meta heuristic hit without fiction signal' };
  }

  const trust = metadataTrust(c);
  const descriptionLength = String(c.description || '').trim().length;
  const hasShapeSignal =
    (c.pageCount || 0) >= 120 ||
    descriptionLength > 120 ||
    ((c.pageCount || 0) >= 80 && descriptionLength > 80) ||
    Boolean(c.hasCover && descriptionLength > 80);

  const filterSignals = filterSignalScore(c);
  const diagnostics = getFilterDiagnostics(c);
  const passedChecks: string[] = Array.isArray(diagnostics?.filterPassedChecks)
    ? diagnostics.filterPassedChecks
    : Array.isArray(diagnostics?.passedChecks)
      ? diagnostics.passedChecks
      : [];
  const isRescuedBorderline =
    passedChecks.includes('borderline_rescue_layer') ||
    passedChecks.includes('relaxed_pool_floor_rescue') ||
    passedChecks.includes('pagecount_shape_floor_override');
  const rescueBypassCount = passedChecks.filter((check) => /rescue|borderline|override/.test(String(check))).length;
  if (rescueBypassCount >= 2) {
    return { pass: false, reason: 'low_metadata_trust', detail: 'rescue/bypass flags present' };
  }
  if (rescueBypassCount >= 3) {
    return { pass: false, reason: 'low_metadata_trust', detail: 'multiple rescue/bypass flags' };
  }
  if (rescueBypassCount >= 2 && !fictionSignals) {
    return { pass: false, reason: 'low_metadata_trust', detail: 'multiple rescue/bypass flags without fiction evidence' };
  }
  const knownAuthorityForZeroRating =
    anchorBoost(c) >= 10 ||
    /\b(penguin|random house|knopf|doubleday|viking|harper|macmillan|tor|simon\s*&?\s*schuster|hachette|st\.? martin|ballantine|minotaur|mysterious press)\b/.test(normalize(c.publisher)) ||
    Boolean((c.rawDoc as any)?.commercialSignals?.bestseller) ||
    Boolean((c.rawDoc as any)?.commercialSignals?.hasMainstreamPublisherSignal);

  if (isRescuedBorderline && (c.ratingCount || 0) === 0 && !knownAuthorityForZeroRating) {
    return { pass: false, reason: 'low_metadata_trust', detail: 'zero-rating rescued item without authority signal' };
  }
  if (isOL) {
    const weakGenre = !/\b(horror|thriller|mystery|crime|speculative|fantasy|science fiction|literary|drama|novel)\b/.test(haystack(c));
    const sparseMeta = !(c.hasCover && String(c.description || "").trim().length >= 90 && (c.pageCount || 0) >= 80);
    if (weakGenre || sparseMeta) {
      return { pass: false, reason: 'low_metadata_trust', detail: 'openlibrary strict intake failure' };
    }
  }

  const softFailureCount = passedChecks.filter((check) =>
    check.startsWith('soft_') ||
    check.includes('borderline_rescue') ||
    check.includes('metadata_shape_relaxation')
  ).length;
  const hasStrongSignals =
    (c.ratingCount || 0) >= 50 ||
    anchorBoost(c) >= 10 ||
    filterSignals >= 10 ||
    knownTitleBoost(c) > 0 ||
    classicAuthorBoost(c) > 0;
  const flags = diagnostics?.filterFlags || diagnostics?.flags || {};
  const coreFictionOverride = Boolean(flags?.fictionPositive && flags?.strongNarrative);
  if (softFailureCount >= 3 && !hasStrongSignals && !coreFictionOverride) {
    debugFinalLog("SOFT_FAILURE_PENALTY_ONLY", { title: c.title, softFailureCount });
  }

  if (trust < 2 && !hasShapeSignal) {
    if (!(isOL && filterSignals >= 4)) {
      return { pass: false, reason: 'low_metadata_trust', detail: `metadataTrust=${trust}` };
    }
  }

  const hasStrongSignal =
    hasShapeSignal ||
    (c.ratingCount || 0) >= 10;

  if (!hasStrongSignal) {
    if (!(isOL && filterSignals >= 5)) {
      return { pass: false, reason: 'low_metadata_trust', detail: 'no strong bibliographic or narrative shape' };
    }
  }

  if (!fictionSignals) {
    if (!(isOL && filterSignals >= 4)) {
      return { pass: false, reason: 'weak_fiction_signal', detail: 'missing fiction/narrative signal' };
    }
  }

  return { pass: true };
}



function isOpenLibraryCandidate(c: Candidate): boolean {
  const source = String(c?.source || (c as any)?.engine || (c as any)?.rawDoc?.source || '').toLowerCase();
  const lane = String((c as any)?.laneKind || (c as any)?.candidateLane || '').toLowerCase();
  return (
    source.includes('openlibrary') ||
    source.includes('open library') ||
    source == 'ol' ||
    lane == 'ol-backfill'
  );
}

function getFilterDiagnostics(candidate: Candidate): any {
  return (candidate as any)?.rawDoc?.diagnostics?.filterDiagnostics ||
    (candidate as any)?.rawDoc?.diagnostics ||
    (candidate as any)?.diagnostics?.filterDiagnostics ||
    (candidate as any)?.diagnostics ||
    {};
}

function filterSignalScore(c: Candidate): number {
  const d = getFilterDiagnostics(c);
  const flags = d?.filterFlags || d?.flags || {};
  const passedChecks: string[] = Array.isArray(d?.filterPassedChecks)
    ? d.filterPassedChecks
    : Array.isArray(d?.passedChecks)
      ? d.passedChecks
      : [];

  let score = 0;

  if (flags.authorAffinity) score += 12;
  if (flags.horrorAligned) score += 6;
  if (flags.strongNarrative) score += 4;
  if (flags.legitAuthority) score += 2;

  if (passedChecks.includes('author_affinity_horror_recovery')) score += 6;
  if (passedChecks.includes('openlibrary_horror_recovery')) score += 4;
  if (passedChecks.includes('openlibrary_fantasy_recovery_precheck')) score += 4;
  if (passedChecks.includes('openlibrary_fantasy_recovery')) score += 5;
  if (passedChecks.includes('openlibrary_source_recovery_precheck')) score += 5;
  if (passedChecks.includes('openlibrary_source_recovery')) score += 6;
  if (passedChecks.includes('openlibrary_thriller_recovery_precheck')) score += 6;
  if (passedChecks.includes('passed_shape_gate')) score += 2;

  if (isOpenLibraryCandidate(c) && flags.authorAffinity) score += 6;
  if (isOpenLibraryCandidate(c) && passedChecks.includes('author_affinity_horror_recovery')) score += 6;
  if (isOpenLibraryCandidate(c) && passedChecks.includes('openlibrary_horror_recovery')) score += 4;
  if (isOpenLibraryCandidate(c) && passedChecks.includes('openlibrary_fantasy_recovery_precheck')) score += 4;
  if (isOpenLibraryCandidate(c) && passedChecks.includes('openlibrary_fantasy_recovery')) score += 5;
  if (isOpenLibraryCandidate(c) && passedChecks.includes('openlibrary_source_recovery_precheck')) score += 5;
  if (isOpenLibraryCandidate(c) && passedChecks.includes('openlibrary_source_recovery')) score += 6;
  if (isOpenLibraryCandidate(c) && passedChecks.includes('openlibrary_thriller_recovery_precheck')) score += 6;
  if (passedChecks.includes('borderline_rescue_penalty')) score -= 4;
  if (passedChecks.includes('relaxed_pool_floor_rescue')) score -= 3;

  return score;
}

function buildDebug(inputCount: number, dedupedCount: number, accepted: Candidate[], rejected: QualityRejectRecord[]): void {
  const rejectionCounts = rejected.reduce<Record<string, number>>((acc, item) => {
    acc[item.reason] = (acc[item.reason] || 0) + 1;
    return acc;
  }, {});

  lastFinalRecommenderDebug = {
    inputCount,
    dedupedCount,
    acceptedCount: accepted.length,
    rejectedCount: rejected.length,
    rejectionCounts,
    rejected,
  };
}

function queryMatchScore(c: Candidate): number {
  const rung = evidenceRank(c);
  if (!Number.isFinite(rung) || rung >= 999) return 0;

  if (isHistoricalCandidate(c)) {
    // Historical rungs represent complementary shelves, so do not score rung 0 as inherently better.
    return 8;
  }

  return Math.max(0, 10 - rung * 2);
}

function behaviorScore(c: Candidate, taste?: TasteProfile): number {
  const text = haystack(c);
  let score = 0;

  const lane = explicitLaneForCandidate(c);

  if (/psychological/.test(text)) score += 1;
  if (/horror|dark|spooky/.test(text)) score += 0.75;
  if (/survival/.test(text)) score += 1;
  if (/thriller|mystery/.test(text)) score += 0.75;
  if (lane === "mystery" && /detective|investigation|private investigator|whodunit|case|inspector|cold case/.test(text)) score += 2.25;
  if (/fast paced|fast-paced/.test(text)) score += 1;
  if (lane === "science_fiction") {
    if (/science fiction|space opera|dystopian|ai|artificial intelligence|robot|android|alien|time travel|interstellar|futuristic/.test(text)) score += 3;
  } else if (/science fiction/.test(text)) score -= 4;
  if (lane === "historical") {
    if (/historical fiction|historical novel|period fiction|victorian|edwardian|regency|gilded age|civil war|world war|19th century|family saga/.test(text)) score += 3;
    if (/literary criticism|study of|studies of|history of the novel|guide|handbook|reference|catalog|bibliography/.test(text)) score -= 8;
  }
  if (/romance/.test(text)) score -= 1.5;
  if (lane === "fantasy") {
    if (/fantasy|epic fantasy|high fantasy|mythic|kingdom|quest|sorcery|dragon|wizard|magic/.test(text)) score += 1.5;
    if (/guide|handbook|companion|catalog|encyclopedia|subject headings|publishers weekly|graphic novel using digital techniques/.test(text)) score -= 6;
  }

  if (taste) {
    const darkness = Number((taste as any).darkness || 0);
    const warmth = Number((taste as any).warmth || 0);
    const realism = Number((taste as any).realism || 0);

    const lane = explicitLaneForCandidate(c);
    if (/horror|dark|psychological|survival|thriller|mystery/.test(text)) {
      const appliedDarkness = lane === "fantasy" ? Math.min(darkness, 0.4) : darkness;
      score += appliedDarkness * 1.5;
    }
    if (/hopeful|cozy|heartwarming|family|human connection/.test(text)) {
      score += warmth * 3;
    }
    if (/science fiction|space opera|futuristic/.test(text)) {
      if (lane === "science_fiction") score += Math.max(0, -realism) * 2;
      else score -= Math.max(0, -realism) * 4;
    }
  }

  return score;
}

function narrativeScore(c: Candidate): number {
  const text = haystack(c);
  let score = 0;

  if (/psychological mystery/.test(text)) {
    score += 3;
  } else if (/psychological horror|psychological thriller/.test(text)) {
    score += 3;
  } else if (/horror|thriller|mystery|dark/.test(text)) {
    score += 1.25;
  }

  if (/detective|investigation|private investigator|whodunit|case|inspector|cold case/.test(text)) {
    score += 1.75;
  }

  if (/historical fiction|historical novel|period fiction/.test(text)) score += 2.5;
  if (/novel|fiction/.test(text)) score += 1.5;
  if (/follows|tells the story|story of|when .* discovers|investigation|journey/.test(text)) {
    score += 1.5;
  }

  return score;
}

function groundedRealismScore(c: Candidate): number {
  const text = haystack(c);
  let score = 0;
  if (/\b(psychological|domestic|relationship|family|marriage|trauma|grief|memory|obsession)\b/.test(text)) score += 4;
  if (/\b(detective|investigation|crime|legal|procedural|journalist|missing person)\b/.test(text)) score += 3;
  if (/\b(epic fantasy|dragon|fae|magic school|chosen one|space opera|interstellar empire)\b/.test(text)) score -= 5;
  return score;
}

function psychologicalIntensityScore(c: Candidate): number {
  const text = haystack(c);
  let score = 0;
  if (/\b(psychological thriller|mind games|paranoia|gaslighting|unreliable narrator|obsession|cat and mouse)\b/.test(text)) score += 6;
  else if (/\b(psychological|tension|suspense|intense)\b/.test(text)) score += 3;
  return score;
}

function emotionalWeightScore(c: Candidate): number {
  const text = haystack(c);
  let score = 0;
  if (/\b(grief|loss|trauma|regret|family secrets|identity|betrayal|redemption|mourning)\b/.test(text)) score += 4;
  if (/\b(character-driven|literary|emotionally|intimate)\b/.test(text)) score += 2;
  return score;
}

function genericTitlePenalty(c: Candidate): number {
  const title = normalize(c.title);
  if (!title) return 0;

  const veryGenericTitles = [
    /^shadows$/,
    /^darkness$/,
    /^silence$/,
    /^fear$/,
    /^terror$/,
    /^night$/,
    /^echo$/,
    /^echoes$/,
    /^secrets$/,
    /^lies$/,
  ];

  if (veryGenericTitles.some((rx) => rx.test(title))) return -12;

  if (
    title.split(" ").length <= 2 &&
    !/\b(psychological|horror|thriller|mystery|survival|dark|haunting|ghost|murder)\b/.test(title)
  ) {
    return -2;
  }

  return 0;
}

function overfitPenalty(c: Candidate): number {
  const text = haystack(c);
  const ratings = c.ratingCount || 0;
  const trust = metadataTrust(c);

  const keywordHits =
    (text.match(/psychological/g)?.length || 0) +
    (text.match(/horror/g)?.length || 0) +
    (text.match(/dark/g)?.length || 0) +
    (text.match(/survival/g)?.length || 0) +
    (text.match(/thriller/g)?.length || 0) +
    (text.match(/mystery/g)?.length || 0);

  if (keywordHits >= 4 && ratings < 50) {
    return -12;
  }

  if (keywordHits >= 3 && ratings < 10) {
    return -14;
  }

  if (keywordHits >= 2 && ratings == 0 && trust <= 4) {
    return -10;
  }

  return 0;
}

function knownTitleBoost(c: Candidate): number {
  const title = normalize(c.title);
  if (!title) return 0;
  if (/\b(gone girl|shutter island|the silence of the lambs|the time machine|the war of the worlds|frankenstein|the caves of steel|and then there were none|the girl with the dragon tattoo)\b/.test(title)) {
    return 8;
  }
  return 0;
}

function classicAuthorBoost(c: Candidate): number {
  const author = normalize(c.author);
  if (!author) return 0;
  if (/\b(h\.?g\.?\s*wells|mary shelley|isaac asimov|ursula k\.?\s*le guin|arthur c\.?\s*clarke|ray bradbury|philip k\.?\s*dick|jules verne)\b/.test(author)) {
    return 9;
  }
  return 0;
}

function ratingsCountBoost(c: Candidate): number {
  const ratings = Number(c.ratingCount || 0);
  if (ratings >= 5000) return 10;
  if (ratings >= 1000) return 7;
  if (ratings >= 250) return 4;
  if (ratings >= 50) return 2;
  return 0;
}

function noveltyTitlePenalty(c: Candidate): number {
  const title = normalize(c.title);
  const ratings = Number(c.ratingCount || 0);
  const authority = anchorBoost(c);
  if (!title) return 0;
  if (/\b(chihuahua of the baskervilles|hamster .* detective|parody mystery|spoof mystery)\b/.test(title)) return -30;
  if (/\b(parallel lives)\b/.test(title) && ratings < 100 && authority < 10) return -16;
  if (title.split(" ").length >= 7 && ratings < 30 && authority < 8) return -8;
  return 0;
}

function metadataConfidencePenalty(c: Candidate): number {
  const trust = metadataTrust(c);
  const ratings = Number(c.ratingCount || 0);
  const desc = String(c.description || "").trim().length;
  const hasShape = (c.pageCount || 0) >= 120 || desc >= 120 || Boolean(c.hasCover);
  const hasNarrativeSignal = /\b(novel|fiction|story|character|journey|discovers|must|haunted|psychological|speculative|dystopian|mystery|thriller|science fiction)\b/.test(haystack(c));
  const hasAuthorAffinity = Boolean(getFilterDiagnostics(c)?.filterFlags?.authorAffinity || getFilterDiagnostics(c)?.flags?.authorAffinity);
  if (trust <= 1 && !hasShape) return -18;
  if (trust <= 2 && ratings < 25 && !hasShape) return -10;
  if (ratings === 0 && desc < 80 && !hasNarrativeSignal && !hasAuthorAffinity) return -14;
  if (trust <= 1 && !hasShape) return -18;
  if (trust <= 2 && ratings < 25 && !hasShape) return -10;
  return 0;
}

function lowRatingsPenalty(c: Candidate): number {
  const ratings = Number(c.ratingCount || 0);
  const protectedCandidate = knownTitleBoost(c) > 0 || classicAuthorBoost(c) > 0;
  if (protectedCandidate) return 0;
  const hasNarrativeSignal = narrativeScore(c) >= 2.5;
  const hasAffinity = twentyQPersonalAffinityScore(c) >= 3;
  if (ratings === 0 && !hasNarrativeSignal && !hasAffinity) return -18;
  if (ratings === 0) return -14;
  if (ratings === 0) return -16;
  if (ratings < 10) return -10;
  if (ratings < 30) return -6;
  return 0;
}

function formulaSeriesPenalty(c: Candidate): number {
  const title = normalize(c.title);
  const text = haystack(c);
  const ratings = Number(c.ratingCount || 0);
  const authority = anchorBoost(c) + knownTitleBoost(c) + classicAuthorBoost(c);
  let penalty = 0;

  if (/\b(book|volume|part)\s*\d+\b/.test(title) && ratings < 100) penalty -= 6;
  if (/\b(series|series starter|fbi suspense thriller|domestic suspense thriller)\b/.test(text) && ratings < 75) penalty -= 5;
  if (/\b(wife|husband|secret|lie|perfect family|perfect marriage)\b/.test(title) && ratings === 0 && authority < 10) penalty -= 7;
  if (/\b(a|an)\s+[a-z]+\s+(fbi|detective|crime|mystery|suspense)\s+thriller\b/.test(title) && ratings < 50) penalty -= 7;
  return penalty;
}

function genericRungPenalty(c: Candidate): number {
  const rung = evidenceRank(c);
  if (rung !== 0) return 0;
  const highAuthority =
    Number(c.ratingCount || 0) >= 250 ||
    anchorBoost(c) >= 12 ||
    knownTitleBoost(c) > 0 ||
    classicAuthorBoost(c) > 0;
  return highAuthority ? -2 : -8;
}

function tasteAxisAlignmentBoost(c: Candidate, taste?: TasteProfile): number {
  if (!taste) return 0;
  const text = haystack(c);
  const ideaDensity = Number((taste as any).ideaDensity || 0);
  const characterFocus = Number((taste as any).characterFocus || 0);
  const warmth = Number((taste as any).warmth || 0);
  const darkness = Number((taste as any).darkness || 0);
  let score = 0;

  if (ideaDensity > 0 && /\b(speculative|philosophical|conceptual|existential|metaphysical|dystopian|alternate reality|science fiction)\b/.test(text)) score += Math.min(8, ideaDensity * 5);
  if (characterFocus > 0 && /\b(character[-\s]?driven|intimate|relationships?|family|identity|grief|memory|trauma|emotional)\b/.test(text)) score += Math.min(7, characterFocus * 4.5);
  if (warmth > 0 && /\b(hope|hopeful|human connection|compassion|redemption|friendship|kindness)\b/.test(text)) score += Math.min(5, warmth * 3.5);
  if (darkness > 0 && /\b(dark|psychological|haunting|dread|bleak|noir|obsession)\b/.test(text)) score += Math.min(6, darkness * 3.8);

  if (/\b(space opera|military sci[-\s]?fi|interstellar empire|fleet battles?)\b/.test(text) && !/\b(philosophical|character[-\s]?driven|emotional|psychological)\b/.test(text)) score -= 5;
  return score;
}

function classicDominancePenalty(c: Candidate, taste?: TasteProfile): number {
  const isOpenLibraryLike = isOpenLibraryCandidate(c);
  const year = Number(c.publicationYear || (c.rawDoc as any)?.first_publish_year || 0);
  const isClassic = classicAuthorBoost(c) > 0 || (year > 0 && year < 1970);
  if (!isClassic) return 0;
  const subgenreFit = /\b(psychological|speculative|philosophical|character[-\s]?driven|emotional|dystopian|social|literary)\b/.test(haystack(c));
  const authority = anchorBoost(c) >= 10 || Number(c.ratingCount || 0) >= 500;
  const tasteFit = twentyQPersonalAffinityScore(c, taste) >= 3 || computeToneMatchScore(c, taste) >= 2.5;
  if (isOpenLibraryLike && year > 0 && year < 1950 && !subgenreFit && !tasteFit) return -14;
  if (isOpenLibraryLike && year > 0 && year < 1970 && !authority && !tasteFit) return -10;
  if (subgenreFit || (authority && tasteFit)) return 0;
  return -8;
}

function passesStrongFinalQualityGate(c: Candidate, breakdown: ScoreBreakdown, taste?: TasteProfile): boolean {
  const metadataStrong = metadataTrust(c) >= 4 && String(c.description || '').trim().length >= 80;
  const authorityStrong = breakdown.authorityScore >= 20 || anchorBoost(c) >= 12 || Number(c.ratingCount || 0) >= 250;
  const titleDescriptionStrong = breakdown.narrativeScore >= 4 || breakdown.filterSignalScore >= 10;
  const tasteAlignmentStrong = breakdown.personalAffinityScore >= 4 || breakdown.toneScore >= 3 || tasteAxisAlignmentBoost(c, taste) >= 4;
  const familyConfidenceStrong = familyAlignmentPenalty(c, taste) >= -2 && (breakdown.laneBlendScore >= 3 || sessionFitScore(c) >= 3);
  return metadataStrong || authorityStrong || titleDescriptionStrong || tasteAlignmentStrong || familyConfidenceStrong;
}

function hasStrongNarrativeOrAuthoritySignal(c: Candidate): boolean {
  const diagnostics = getFilterDiagnostics(c);
  const flags = diagnostics?.filterFlags || diagnostics?.flags || {};
  const rung = evidenceRank(c);
  const strongRung = Number.isFinite(rung) && rung >= 1 && rung <= 3;
  return Boolean(
    flags.strongNarrative ||
    flags.authorAffinity ||
    flags.legitAuthority ||
    strongRung ||
    Number(c.ratingCount || 0) > 0
  );
}

function rescuePenaltyScore(c: Candidate): number {
  const source = String((c as any)?.source || (c as any)?.rawDoc?.source || "").toLowerCase();
  const isOpenLibraryLike = source.includes("openlibrary") || source.includes("open_library");
  const diagnostics = getFilterDiagnostics(c);
  const passedChecks: string[] = Array.isArray(diagnostics?.filterPassedChecks)
    ? diagnostics.filterPassedChecks
    : Array.isArray(diagnostics?.passedChecks)
      ? diagnostics.passedChecks
      : [];
  const rescuePenaltyCount = passedChecks.filter((check) => check === "borderline_rescue_penalty").length;
  const stackedSoft = passedChecks.filter((check) =>
    check === "soft_missing_narrative_signal" ||
    check === "soft_missing_thriller_signal" ||
    check === "soft_minimum_authority_floor_miss"
  ).length;
  const cappedRescuePenaltyCount = isOpenLibraryLike ? Math.min(1, rescuePenaltyCount) : rescuePenaltyCount;
  if (cappedRescuePenaltyCount >= 2) return -8;
  if (cappedRescuePenaltyCount >= 1 && stackedSoft >= 1) return isOpenLibraryLike ? -3 : -6;
  return cappedRescuePenaltyCount >= 1 ? -3 : 0;
}

function softFailurePenaltyScore(c: Candidate): number {
  const source = String((c as any)?.source || (c as any)?.rawDoc?.source || "").toLowerCase();
  const isOpenLibraryLike = source.includes("openlibrary") || source.includes("open_library");
  const diagnostics = getFilterDiagnostics(c);
  const flags = diagnostics?.filterFlags || diagnostics?.flags || {};
  if (flags?.fictionPositive && flags?.strongNarrative) return 0;
  const passedChecks: string[] = Array.isArray(diagnostics?.filterPassedChecks)
    ? diagnostics.filterPassedChecks
    : Array.isArray(diagnostics?.passedChecks)
      ? diagnostics.passedChecks
      : [];
  const softFailures = passedChecks.filter((check) => check.startsWith('soft_')).length;
  const SOFT_FAILURE_WEIGHT = isOpenLibraryLike ? 0.5 : 1.25;
  return -Math.min(10, softFailures * SOFT_FAILURE_WEIGHT);
}

function rankingPriorityBoost(c: Candidate): number {
  const diagnostics = getFilterDiagnostics(c);
  const flags = diagnostics?.filterFlags || diagnostics?.flags || {};
  const rung = evidenceRank(c);
  let score = 0;
  if (flags.strongNarrative) score += 8;
  if (flags.authorAffinity || flags.legitAuthority) score += 6;
  if (rung >= 1 && rung <= 3) score += 4;
  else if (rung === 0) score -= 3;
  return score;
}


function anchorBoost(c: Candidate): number {
  const text = haystack(c);
  const title = normalize(c.title);
  const author = normalize(c.author);
  const ratings = c.ratingCount || 0;
  const lane = explicitLaneForCandidate(c);

  let score = 0;

  const CANONICAL_AUTHOR_BOOST = 16;
  const CANONICAL_TITLE_BOOST = 16;
  const OPEN_LIBRARY_CANONICAL_AUTHOR_BOOST = 8;

  const isHorror =
    /horror|haunted|ghost|supernatural|occult|possession|terror|dread|gothic/.test(text);

  const isThriller =
    /thriller|crime|detective|mystery|suspense|investigation|serial killer|noir|procedural/.test(text);

  const isSpeculative =
    /science fiction|fantasy|dystopian|speculative|space opera|space|alien|magic/.test(text);

  const isRomance =
    /romance|love story|relationship|romantic/.test(text);

  const AUTHOR_MAP: Record<string, string[]> = {
    horror: [
      'stephen king',
      'shirley jackson',
      'peter straub',
      'clive barker',
      'william peter blatty',
      'nick cutter',
      'paul tremblay',
      'grady hendrix',
      'dan simmons',
      'richard matheson',
      'bram stoker',
      'mary shelley',
      'henry james',
      'wilkie collins',
      'gaston leroux',
      'joe hill',
      'ramsey campbell',
      'anne rice',
      'dean koontz',
      'thomas harris',
    ],
    mystery: [
      "agatha christie",
      "tana french",
      "p d james",
      "louise penny",
      "dorothy l sayers",
      "raymond chandler",
      "arthur conan doyle",
      "ross macdonald",
      "sara paretsky",
      "walter mosley",
      "stieg larsson",
      "attica locke",
      "patricia highsmith",
      "michael connelly",
    ],
    thriller: [
      'gillian flynn',
      'tana french',
      'dennis lehane',
      'michael connelly',
      'lee child',
      'john grisham',
      'thomas harris',
      'patricia cornwell',
      'harlan coben',
      'karin slaughter',
      'paula hawkins',
      'a j finn',
      'aj finn',
      'don winslow',
      'ruth ware',
      'patricia highsmith',
      'john le carre',
      'stephen king',
      'michael robotham',
      'nicci french',
      'blake crouch',
      'mary higgins clark',
      'helen fields',
      'stieg larsson',
      'daniel silva',
      'robert ludlum',
      'lisa jewell',
      'mary kubica',
      'shari lapena',
      'alex michaelides',
    ],
    science_fiction: [
      'ursula k le guin',
      'philip k dick',
      'octavia butler',
      'neal stephenson',
      'isaac asimov',
      'arthur c clarke',
      'george orwell',
      'blake crouch',
      'adrian tchaikovsky',
      'ann leckie',
      'becky chambers',
      'john scalzi',
      'andy weir',
      'martha wells',
    ],
    speculative: [
      'ursula k le guin',
      'philip k dick',
      'octavia butler',
      'neal stephenson',
      'isaac asimov',
      'arthur c clarke',
      'n k jemisin',
      'george orwell',
    ],
    fantasy: [
      'j r r tolkien',
      'tolkien',
      'george r r martin',
      'patrick rothfuss',
      'robin hobb',
      'steven erikson',
      'joe abercrombie',
      'brandon sanderson',
      'ursula k le guin',
      'anne mccaffrey',
      'mark lawrence',
      'n k jemisin',
    ],
    romance: [
      'jane austen',
      'nicholas sparks',
      'colleen hoover',
      'emily henry',
      'julia quinn',
    ],
    historical: [
      'hilary mantel',
      'geraldine brooks',
      'colson whitehead',
      'amor towles',
      'anthony doerr',
      'ken follett',
      'susan higginbotham',
      'henryk sienkiewicz',
      'michael shaara',
      'jeff shaara',
      'james michener',
      'edward rutherfurd',
      'bernard cornwell',
      'patrick o brian',
      'philippa gregory',
      'colleen mccullough',
      'howard bahr',
      'tea cooper',
      'sharon kay penman',
      'robert harris',
      'e l doctorow',
      'e l doctrow',
    ],
  };

  const TITLE_MAP: Record<string, string[]> = {
    horror: [
      'cujo',
      'the long walk',
      'the haunting of hill house',
      'the exorcist',
      'dracula',
      'frankenstein',
      'pet sematary',
      'the terror',
      'the turn of the screw',
    ],
    mystery: [
      'murder on the orient express',
      'the hound of the baskervilles',
      'the big sleep',
      'the maltese falcon',
      'in the woods',
      'the girl with the dragon tattoo',
      'the mysterious affair at styles',
      'gaudy night',
    ],
    thriller: [
      'gone girl',
      'red dragon',
      'mr mercedes',
      'you',
      'sharp objects',
      'dark places',
      'the silent patient',
      'the silence of the lambs',
      'the girl on the train',
      'the day of the jackal',
      'the bourne identity',
      'the firm',
      'the da vinci code',
      'eye of the needle',
    ],
    science_fiction: [
      'dune',
      'foundation',
      'neuromancer',
      'the left hand of darkness',
      'kindred',
      'the martian',
      'enders game',
      'fahrenheit 451',
    ],
    speculative: [
      'dune',
      'foundation',
      'kindred',
      'the handmaids tale',
      'the left hand of darkness',
      'neuromancer',
      'the dispossessed',
      'parable of the sower',
    ],
    fantasy: [
      'the hobbit',
      'the fellowship of the ring',
      'the two towers',
      'the return of the king',
      'the name of the wind',
      'dragonflight',
      'the final empire',
      'a game of thrones',
      'a wizard of earthsea',
      'assassins apprentice',
      'the way of kings',
      'the fifth season',
    ],
    romance: [
      'pride and prejudice',
      'sense and sensibility',
      'persuasion',
      'jane eyre',
      'the notebook',
      'beach read',
      'people we meet on vacation',
      'red white and royal blue',
    ],
    historical: [
      'the killer angels',
      'pillars of the earth',
      'wolf hall',
      'shogun',
      'lonesome dove',
      'the black flower',
      'the fateful lightning',
      'the first lady and the rebel',
      'i claudius',
      'the book thief',
      'all the light we cannot see',
      'the underground railroad',
      'a gentleman in moscow',
      'the nightingale',
    ],
  };

  function matchesAuthor(list: string[]): boolean {
    return list.some((name) => author.includes(name));
  }

  function matchesTitle(list: string[]): boolean {
    return list.some((name) => title.includes(normalize(name)));
  }

  function addCanonicalBoosts(laneKey: string): void {
    const authors = AUTHOR_MAP[laneKey] || [];
    const titles = TITLE_MAP[laneKey] || [];

    const canonicalAuthor = matchesAuthor(authors);
    const canonicalTitle = matchesTitle(titles);

    if (canonicalAuthor) {
      score += CANONICAL_AUTHOR_BOOST;
      if (isOpenLibraryCandidate(c)) score += OPEN_LIBRARY_CANONICAL_AUTHOR_BOOST;
    }

    if (canonicalTitle) {
      score += CANONICAL_TITLE_BOOST;
    }
  }

  if (AUTHOR_MAP[lane]) {
    addCanonicalBoosts(lane);
  } else {
    if (isHorror) addCanonicalBoosts('horror');
    else if (isThriller) addCanonicalBoosts('thriller');
    else if (/mystery|detective|investigation|private investigator|whodunit|case/.test(text)) addCanonicalBoosts('mystery');
    else if (/science fiction|space opera|dystopian|ai|artificial intelligence|robot|android|alien|time travel|interstellar|futuristic/.test(text)) addCanonicalBoosts('science_fiction');
    else if (isSpeculative) addCanonicalBoosts('speculative');
    else if (/fantasy|epic fantasy|high fantasy|dark fantasy|magic/.test(text)) addCanonicalBoosts('fantasy');
    else if (isRomance) addCanonicalBoosts('romance');
  }

  if (lane === "historical") {
    if (/historical fiction|historical novel|period fiction|victorian|edwardian|regency|gilded age|civil war|world war|19th century|family saga/.test(text)) score += 6;
    if (/literary criticism|history of the novel|study of|guide|handbook|reference|catalog|bibliography/.test(text)) score -= 10;
  }

  if (lane === "fantasy") {
    if (/fantasy|epic fantasy|high fantasy|mythic|kingdom|quest|sorcery|dragon|wizard|magic/.test(text)) score += 1.5;
  }

  if (ratings >= 5000) score += 6;
  else if (ratings >= 1000) score += 4;
  else if (ratings >= 200) score += 2;

  if (isHorror && /psychological|survival|haunted house/.test(text)) score += 3;
  if (lane === "mystery" && /detective|investigation|private investigator|whodunit|cold case|case|inspector/.test(text)) score += 3;
  if (isThriller && /psychological|domestic|legal/.test(text)) score += 2;

  return score;
}

function penaltyScore(c: Candidate): number {
  const text = haystack(c);
  const lane = String((c as any)?.laneKind || "").toLowerCase();
  const family = explicitLaneForCandidate(c);
  let score = 0;

  if (/book\s*1\b|book\s*one\b|book\s*two\b|book\s*three\b/.test(text)) score -= 6;
  if (/book\s*\d+\b/.test(text) && !((c.ratingCount || 0) > 100 || metadataTrust(c) >= 4)) score -= 8;
  if (/books?\s*\d+\s*-\s*\d+\b|boxed set|omnibus|collection|anthology/.test(text)) score -= 5;
  if (/guide|handbook|encyclopedia|studies|analysis|criticism|review|digest|journal|magazine/.test(text)) {
    score -= 6;
  }

  if (lane === "strict-filtered") score -= 8;
  if (lane === "fiction-variant") score -= 4;
  if (lane === "dark-alt" && /\bdomestic suspense\b/.test(text)) score -= 5;
  if (lane === "ol-backfill") score -= 3;

  if (family === "mystery") {
    const thrillerNative = /\bthriller\b|\bpsychological\b|\bsuspense\b|\bmissing\b|\bkiller\b|\bfbi\b|\bcrime\b|\binvestigation\b|\bprocedural\b/.test(text);
    if (!thrillerNative) score -= 10;
    else score -= 3;
  }

  if (/\bfaith-based\b|\bchristian fiction\b/.test(text)) score -= 10;
  if (/\bforbidden love\b/.test(text)) score -= 8;
  if (/\bdomestic suspense\b/.test(text) && !/\bcrime\b|\bmissing\b|\bkiller\b|\bfbi\b|\bdetective\b/.test(text)) {
    score -= 4;
  }
  if (!c.hasCover) {
    if (isOpenLibraryCandidate(c)) score -= 1;
    else score -= 6;
  }

  if (/\bfbi suspense thriller\b|\bpsychological suspense thriller\b/.test(text) && (c.ratingCount || 0) < 25) {
    score -= 4;
  }

  const trust = metadataTrust(c);
  if (trust <= 2 && !(c.ratingCount || 0)) score -= 5;
  if (trust >= 4) score += 2;

  const source = String(c.source || '').toLowerCase();
  const isGoogleBooks = source === 'googlebooks';
  const isOpenLibrary = source === 'openlibrary';
  const flags = getFilterDiagnostics(c)?.filterFlags || getFilterDiagnostics(c)?.flags || {};
  const hardcoverRatings = Number((c as any)?.rawDoc?.hardcover?.ratings_count || 0);
  const hardcoverRating = Number((c as any)?.rawDoc?.hardcover?.rating || 0);

  if (
    isGoogleBooks &&
    (c.ratingCount || 0) < 5 &&
    trust <= 3 &&
    !flags.authorAffinity
  ) {
    score -= 8;
  }

  if (
    isOpenLibrary &&
    !flags.authorAffinity &&
    hardcoverRatings === 0 &&
    hardcoverRating === 0 &&
    trust <= 2 &&
    filterSignalScore(c) < 4
  ) {
    score -= 4;
  }

  if (isOpenLibrary && (hardcoverRatings >= 25 || hardcoverRating >= 3.8 || flags.legitAuthority)) {
    score += 5;
  }

  return score;
}

function mysterySessionFit(c: Candidate): number {
  const text = haystack(c);
  let score = 0;

  if (/\bmystery\b|\bdetective\b|\binvestigation\b|\bcase\b|\bprivate investigator\b|\binspector\b|\bwhodunit\b/.test(text)) score += 3;
  if (/\bpsychological mystery\b|\bcold case\b|\bpolice procedural\b/.test(text)) score += 2;
  if (/\bspy thriller\b|\bmanhunt\b|\bfugitive\b|\bcrime conspiracy\b/.test(text)) score -= 4;
  if (/\bcozy mystery\b|\bculinary mystery\b/.test(text)) score -= 3;

  return score;
}

function candidateTasteFacet(c: Candidate): string {
  const text = haystack(c);
  if (/\b(investigation|detective|case|whodunit|moral conflict|justice|reckoning)\b/.test(text)) return "investigation_moral";
  if (/\b(memory|identity|time loop|alternate reality|simulation|erased|speculative|conceptual|philosophical)\b/.test(text)) return "high_concept";
  if (/\b(atmospheric|stylized|dreamlike|surreal|elevated|literary|cinematic)\b/.test(text)) return "stylized_elevated";
  if (/\b(psychological|trauma|obsession|paranoia|mind games|unreliable narrator)\b/.test(text)) return "psychological_meaning";
  if (/\b(domestic suspense|secret wife|secret husband|family secret|lying wife|lying husband|perfect marriage)\b/.test(text)) return "domestic_secret";
  return "general";
}

function thrillerSessionFit(c: Candidate): number {
  const text = haystack(c);
  let score = 0;

  if (/\bthriller\b|\bsuspense\b|\bpsychological\b|\bcrime\b|\bmurder\b|\bkiller\b|\bserial killer\b|\bdetective\b|\binvestigation\b|\bcase\b|\bmissing\b|\bdisappearance\b|\bfbi\b|\bprocedural\b|\bnoir\b|\bobsession\b/.test(text)) score += 4;
  if (/\bred dragon\b|\bmr\.? mercedes\b|\byou\b|\bgone girl\b|\bsharp objects\b|\bdark places\b|\bthe silent patient\b|\bthe silence of the lambs\b|\bthe girl on the train\b/.test(text)) score += 5;
  if (/\bpsychological thriller\b|\bdomestic suspense\b|\bcrime thriller\b|\bserial killer\b|\bcat and mouse\b/.test(text)) score += 3;
  if (/\bthriller\b|\bsuspense\b|\bpsychological thriller\b|\bcrime thriller\b/.test(text)) score += 2;
  if (/\bmystery\b/.test(text) && !/\bthriller\b|\bsuspense\b|\bpsychological thriller\b|\bcrime thriller\b/.test(text)) score -= 5;
  if (/\bcozy mystery\b|\bculinary mystery\b|\bgentle mystery\b|\bcomfort read\b/.test(text)) score -= 5;
  if (/\btrue crime\b|\bnonfiction\b|\bguide\b|\bhandbook\b|\bcriticism\b|\banalysis\b/.test(text)) score -= 6;

  return score;
}

function thrillerAuthorityBonus(c: Candidate): number {
  const raw: any = c.rawDoc || {};
  const family = normalizeFamilyName(raw?.queryFamily || raw?.diagnostics?.queryFamily || (c as any)?.queryFamily || '');
  if (family !== "thriller") return 0;

  const text = haystack(c);
  const author = normalize(c.author);
  const ratings = Number(c.ratingCount || raw?.ratingsCount || raw?.volumeInfo?.ratingsCount || 0);
  let bonus = 0;

  if (/\b(dean koontz|nelson demille|jo nesb[øo]|thomas harris|gillian flynn|dennis lehane|john sandford|lee child|karin slaughter)\b/.test(author)) bonus += 6;
  if (/\b(shutter island|gone girl|the silence of the lambs|red dragon|the silent patient|the girl on the train|dark places|sharp objects)\b/.test(text)) bonus += 5;
  if (ratings >= 5000) bonus += 6;
  else if (ratings >= 1000) bonus += 4;
  else if (ratings >= 250) bonus += 2;

  if (/\b(mystery)\b/.test(text) && !/\b(thriller|suspense|crime thriller|psychological thriller)\b/.test(text)) bonus -= 2;
  return bonus;
}

function horrorSessionFit(c: Candidate): number {
  const text = haystack(c);
  let score = 0;

  if (/\bhorror\b|\bhaunted\b|\bhaunting\b|\bghost\b|\bsupernatural\b|\boccult\b|\bpossession\b|\bterror\b|\bdread\b|\bgothic\b|\bvampire\b|\bzombie\b/.test(text)) score += 4;
  if (/\bpsychological horror\b|\bsurvival horror\b|\bhaunted house\b|\bbody horror\b/.test(text)) score += 3;
  if (/\bthriller\b|\bsuspense\b|\bpsychological\b/.test(text)) score += 1.5;
  if (/\bscience fiction\b|\bspace opera\b|\brobot\b|\bandroid\b|\balien\b/.test(text)) score -= 4;
  if (/\bcozy\b|\bheartwarming\b|\bguide\b|\bhandbook\b|\bcriticism\b|\banalysis\b/.test(text)) score -= 5;

  return score;
}

function scienceFictionSessionFit(c: Candidate): number {
  const text = haystack(c);
  let score = 0;

  if (/\bscience fiction\b|\bsci-fi\b|\bdystopian\b|\bspace opera\b|\bai\b|\bartificial intelligence\b|\brobot\b|\bandroid\b|\balien\b|\bfuture\b|\btime travel\b|\binterstellar\b/.test(text)) score += 4;
  if (/\b(best|great|five|100|hundred|classic|selected)\s+(science fiction\s+)?novels\b|\bscience and fiction\b|\bscience fiction\b.*\b(criticism|literary criticism|literature|history and criticism|bibliography|reference|study|studies|survey|guide|companion|readings|index(?:es)?|principles)\b|\b(anthology|collection|collected|complete novels|selected stories|short stories|short science fiction novels|baker['’]?s dozen)\b/.test(text)) score -= 12;
  if (/\bhorror\b|\bhaunted\b|\bghost\b|\bsupernatural\b/.test(text)) score -= 3;
  if (/\bthriller\b|\bmystery\b|\bcrime\b/.test(text) && !/\bscience fiction\b|\bdystopian\b|\bfuture\b/.test(text)) score -= 3;

  return score;
}

function sessionFitScore(c: Candidate): number {
  const lane = explicitLaneForCandidate(c);
  if (lane === "mystery") return mysterySessionFit(c);
  if (lane === "thriller") return thrillerSessionFit(c);
  if (lane === "horror") return horrorSessionFit(c);
  if (lane === "science_fiction") return scienceFictionSessionFit(c);
  return 0;
}


function collectWeightedTerms(value: any, weight = 1, out: Map<string, number> = new Map()): Map<string, number> {
  if (!value) return out;

  if (value instanceof Map) {
    for (const [key, rawWeight] of value.entries()) {
      const term = normalize(key);
      const numericWeight = Number(rawWeight);
      if (term) out.set(term, (out.get(term) || 0) + (Number.isFinite(numericWeight) ? numericWeight : weight));
    }
    return out;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      if (typeof item === 'string') {
        const term = normalize(item);
        if (term) out.set(term, (out.get(term) || 0) + weight);
      } else if (item && typeof item === 'object') {
        collectWeightedTerms(item, weight, out);
      }
    }
    return out;
  }

  if (typeof value === 'object') {
    for (const [key, rawWeight] of Object.entries(value)) {
      const term = normalize(key);
      const numericWeight = Number(rawWeight);
      if (term) out.set(term, (out.get(term) || 0) + (Number.isFinite(numericWeight) ? numericWeight * weight : weight));
    }
    return out;
  }

  if (typeof value === 'string') {
    const term = normalize(value);
    if (term) out.set(term, (out.get(term) || 0) + weight);
  }

  return out;
}

function collectSessionSignals(taste?: TasteProfile): { positive: Map<string, number>; negative: Map<string, number>; confidence: number } {
  const anyTaste: any = taste || {};
  const positive = new Map<string, number>();
  const negative = new Map<string, number>();
  collectWeightedTerms(anyTaste.runningTagCounts, 1, positive);
  collectWeightedTerms(anyTaste.tagCounts, 1, positive);
  collectWeightedTerms(anyTaste.likedTagCounts, 1.5, positive);
  collectWeightedTerms(anyTaste.rightTagCounts, 1.5, positive);
  collectWeightedTerms(anyTaste.positiveTags, 1.5, positive);
  collectWeightedTerms(anyTaste.likedTags, 1.5, positive);
  collectWeightedTerms(anyTaste.likes, 1, positive);
  collectWeightedTerms(anyTaste.swipeLikes, 1, positive);
  collectWeightedTerms(anyTaste.dislikedTagCounts, 1.5, negative);
  collectWeightedTerms(anyTaste.leftTagCounts, 1.5, negative);
  collectWeightedTerms(anyTaste.negativeTags, 1.5, negative);
  collectWeightedTerms(anyTaste.dislikedTags, 1.5, negative);
  collectWeightedTerms(anyTaste.dislikes, 1, negative);
  collectWeightedTerms(anyTaste.swipeDislikes, 1, negative);
  for (const [key, value] of [...positive.entries()]) {
    if (value < 0) {
      positive.delete(key);
      negative.set(key, (negative.get(key) || 0) + Math.abs(value));
    }
  }
  const confidence = Math.max(0, Math.min(1, Number(anyTaste.confidence ?? anyTaste.sessionConfidence ?? 0.65)));
  return { positive, negative, confidence };
}

function inferSessionPreferenceCluster(taste?: TasteProfile): {
  preferredTerms: string[];
  avoidedTerms: string[];
  preferredFamilies: string[];
  confidence: number;
} {
  const { positive, negative, confidence } = collectSessionSignals(taste);
  const anyTaste: any = taste || {};
  const axis = {
    warmth: Number(anyTaste?.warmth || 0),
    darkness: Number(anyTaste?.darkness || 0),
    pacing: Number(anyTaste?.pacing || 0),
    realism: Number(anyTaste?.realism || 0),
    ideaDensity: Number(anyTaste?.ideaDensity || 0),
    characterFocus: Number(anyTaste?.characterFocus || 0),
    humor: Number(anyTaste?.humor || 0),
  };

  const preferredTerms = [...positive.entries()]
    .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))
    .slice(0, 6)
    .map(([term]) => term);
  const avoidedTerms = [...negative.entries()]
    .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))
    .slice(0, 5)
    .map(([term]) => term);

  if (axis.darkness > 0.25) preferredTerms.push("dark", "psychological", "high stakes");
  if (axis.darkness < -0.2) avoidedTerms.push("grimdark", "bleak");
  if (axis.warmth > 0.2) preferredTerms.push("warm", "hopeful", "cozy");
  if (axis.pacing > 0.22) preferredTerms.push("fast paced", "suspense");
  if (axis.pacing < -0.2) preferredTerms.push("slow burn", "quiet");
  if (axis.realism > 0.2) preferredTerms.push("grounded", "realistic");
  if (axis.realism < -0.2) preferredTerms.push("speculative", "fantastical");
  if (axis.ideaDensity > 0.2) preferredTerms.push("philosophical", "idea driven");
  if (axis.characterFocus > 0.2) preferredTerms.push("character driven", "relationships");
  if (axis.humor > 0.2) preferredTerms.push("funny", "witty");

  const familySignals = [
    "thriller", "mystery", "horror", "fantasy", "science fiction", "romance", "historical"
  ];
  const preferredFamilies = familySignals.filter((family) =>
    preferredTerms.some((term) => term.includes(family)) && !avoidedTerms.some((term) => term.includes(family))
  );

  return {
    preferredTerms: [...new Set(preferredTerms)].slice(0, 10),
    avoidedTerms: [...new Set(avoidedTerms)].slice(0, 8),
    preferredFamilies: [...new Set(preferredFamilies)],
    confidence,
  };
}

function candidateTerms(c: Candidate): Set<string> {
  const text = haystack(c);
  const terms = new Set<string>();
  const rawTerms = [explicitLaneForCandidate(c), ...(Array.isArray(c.subjects) ? c.subjects : []), ...(Array.isArray(c.genres) ? c.genres : [])];
  for (const term of rawTerms) {
    const key = normalize(term);
    if (key) terms.add(key);
  }
  const patternTerms = [
    'historical', 'historical fiction', 'crime', 'mystery', 'detective', 'investigation',
    'thriller', 'suspense', 'horror', 'spooky', 'dark', 'atmospheric', 'gothic',
    'fantasy', 'magic', 'epic', 'adventure', 'war', 'war society', 'political',
    'family', 'family saga', 'romance', 'relationship', 'survival', 'redemption',
    'fast paced', 'slow burn', 'literary', 'psychological', 'realistic', 'science fiction',
    'space opera', 'dystopian', 'weird', 'supernatural', 'haunted', 'noir', 'procedural'
  ];
  for (const term of patternTerms) {
    const escaped = term
  .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  .replace(/ /g, "[\\s-]+");
    const rx = new RegExp('\\b' + escaped + '\\b');
    if (rx.test(text)) terms.add(term);
  }
  return terms;
}

function twentyQPersonalAffinityScore(c: Candidate, taste?: TasteProfile): number {
  if (!taste) return 0;
  const { positive, negative, confidence } = collectSessionSignals(taste);
  const cluster = inferSessionPreferenceCluster(taste);
  if (!positive.size && !negative.size) return 0;
  const text = haystack(c);
  const terms = candidateTerms(c);
  let positiveScore = 0;
  let negativeScore = 0;
  for (const [term, weight] of positive.entries()) {
    if (term && (terms.has(term) || text.includes(term))) positiveScore += Math.min(4, Math.max(0.5, Math.abs(weight))) * 1.15;
  }
  for (const [term, weight] of negative.entries()) {
    if (term && (terms.has(term) || text.includes(term))) negativeScore += Math.min(5, Math.max(1, Math.abs(weight))) * 1.4;
  }
  for (const term of cluster.preferredTerms) {
    if (term && (terms.has(term) || text.includes(term))) positiveScore += 0.75;
  }
  for (const term of cluster.avoidedTerms) {
    if (term && (terms.has(term) || text.includes(term))) negativeScore += 1.1;
  }
  const anyTaste: any = taste;
  const traits: Array<[string, RegExp]> = [
    ['darkness', /dark|gothic|horror|psychological|violent|war|murder|haunted|dread/],
    ['realism', /realistic|historical|crime|war|society|political|family|investigation/],
    ['characterFocus', /character|family|relationship|coming of age|psychological|literary|personal|redemption/],
    ['complexity', /political|conspiracy|epic|multi generational|family saga|literary|mystery|war|society/],
    ['pacing', /fast paced|thriller|suspense|adventure|chase|survival|action/],
    ['ideaDensity', /science fiction|philosophical|speculative|dystopian|political|conceptual/],
    ['warmth', /hopeful|heartwarming|romance|family|community|friendship|cozy/],
  ];
  let traitScore = 0;
  for (const [trait, rx] of traits) {
    const value = Number(anyTaste?.[trait] || 0);
    if (value && rx.test(text)) traitScore += Math.max(-2.5, Math.min(2.5, value * 2.2));
  }
  const lane = explicitLaneForCandidate(c);
  let laneBonus = 0;
  if (positive.has(lane)) laneBonus += 3;
  if (negative.has(lane)) laneBonus -= 4;
  const clusterMatchBoost = cluster.preferredFamilies.some((family) => candidateMatchesFamilyText(c, family)) ? 2.2 : 0;
  return Math.max(-16, Math.min(22, (positiveScore - negativeScore + traitScore + laneBonus + clusterMatchBoost) * Math.max(0.35, confidence)));
}

function buildPersonalFitReasons(c: Candidate, taste?: TasteProfile): string[] {
  if (!taste) return [];
  const { positive, negative } = collectSessionSignals(taste);
  const text = haystack(c);
  const terms = candidateTerms(c);
  const reasons: string[] = [];
  const positives = [...positive.entries()].filter(([term]) => terms.has(term) || text.includes(term)).sort((a,b)=>Math.abs(b[1])-Math.abs(a[1])).slice(0,3).map(([term])=>term);
  if (positives.length) reasons.push('Matches your session signals: ' + positives.join(', '));
  const negatives = [...negative.entries()].filter(([term]) => terms.has(term) || text.includes(term)).sort((a,b)=>Math.abs(b[1])-Math.abs(a[1])).slice(0,2).map(([term])=>term);
  if (negatives.length) reasons.push('Potential tension with disliked signals: ' + negatives.join(', '));
  return reasons;
}

function contextualAversionScore(c: Candidate, taste?: TasteProfile): number {
  if (!taste) return 0;
  const text = haystack(c);
  const { negative } = collectSessionSignals(taste);
  const negativeTerms = Array.from(negative.keys());
  const negativeBlob = negativeTerms.join(" ");

  const teenAversionSession =
    /\b(teen|ya|young adult|high school|coming of age|adolescent)\b/.test(negativeBlob);
  const antiheroAversionSession =
    /\b(criminal protagonist|mafia|gangster|mob|anti hero|antihero|villain protagonist|morally gray)\b/.test(negativeBlob);

  let score = 0;
  if (teenAversionSession) {
    const teenSignal =
      /\b(young adult|ya novel|teen|high school|prep school|adolescent|coming of age)\b/.test(text);
    if (teenSignal) score -= 9;
  }

  if (antiheroAversionSession) {
    const antiheroSignal =
      /\b(mafia|mob|cartel|gangster|crime family|hitman|drug lord|heist crew|villain protagonist)\b/.test(text);
    const moralCounterSignal =
      /\b(investigation|justice|detective|prosecutor|redemption|consequence|reckoning)\b/.test(text);
    if (antiheroSignal && !moralCounterSignal) score -= 10;
  }

  return score;
}


function laneBlendScore(c: Candidate): number {
  const raw: any = (c as any)?.rawDoc || {};
  const weights = raw?.hybridLaneWeights || raw?.diagnostics?.hybridLaneWeights || (c as any)?.hybridLaneWeights;
  if (!weights || typeof weights !== "object") return 0;

  const lane = explicitLaneForCandidate(c);
  const normalizedLane = lane === "science_fiction_family" ? "science_fiction" : lane.replace(/_family$/, "");
  const weight = Number(weights[normalizedLane] || 0);
  const values = Object.values(weights).map((value: any) => Number(value || 0)).filter((value) => value > 0);
  if (!values.length) return 0;

  const maxWeight = Math.max(...values);
  if (weight > 0) return Math.max(1, Math.min(8, weight * 10));

  const text = haystack(c);
  const softOverlap = Object.entries(weights).some(([family, rawWeight]) => {
    const w = Number(rawWeight || 0);
    if (w < 0.16) return false;
    if (family === "thriller") return /thriller|suspense|crime|serial killer|missing|fbi|procedural/.test(text);
    if (family === "mystery") return /mystery|detective|investigation|case|whodunit|cold case/.test(text);
    if (family === "horror") return /horror|haunted|ghost|supernatural|occult|terror|dread/.test(text);
    if (family === "fantasy") return /fantasy|magic|wizard|dragon|quest|kingdom/.test(text);
    if (family === "science_fiction") return /science fiction|sci-fi|dystopian|space opera|ai|robot|alien|future/.test(text);
    if (family === "romance") return /romance|love story|marriage|courtship|kiss/.test(text);
    if (family === "historical") return /historical|period fiction|victorian|civil war|world war|19th century/.test(text);
    return false;
  });

  return softOverlap ? Math.min(3, maxWeight * 4) : -3;
}



function normalizeFamilyName(value: unknown): string {
  const cleaned = String(value || "").toLowerCase().trim();
  if (cleaned === "science_fiction_family") return "science_fiction";
  if (cleaned === "speculative_family") return "speculative";
  return cleaned.replace(/_family$/, "");
}

function candidateMatchesFamilyText(c: Candidate, family: string): boolean {
  const text = haystack(c);
  const normalizedFamily = normalizeFamilyName(family);

  if (normalizedFamily === "horror") {
    return /\bhorror\b|\bhaunted\b|\bhaunting\b|\bghost\b|\bsupernatural\b|\boccult\b|\bpossession\b|\bterror\b|\bdread\b|\bgothic\b|\bvampire\b|\bzombie\b|\bpsychological horror\b|\bsurvival horror\b|\bhaunted house\b/.test(text);
  }

  if (normalizedFamily === "thriller") {
    return /\bthriller\b|\bsuspense\b|\bpsychological thriller\b|\bdomestic suspense\b|\bcrime thriller\b|\bserial killer\b|\bfbi\b|\bmissing person\b|\bmanhunt\b|\bfugitive\b|\bcat and mouse\b|\bnoir\b|\bprocedural\b/.test(text);
  }

  if (normalizedFamily === "mystery") {
    return /\bmystery\b|\bdetective\b|\binvestigation\b|\bcase\b|\bprivate investigator\b|\binspector\b|\bwhodunit\b|\bcold case\b|\bpolice procedural\b/.test(text);
  }

  if (normalizedFamily === "science_fiction") {
    return /\bscience fiction\b|\bsci[-\s]?fi\b|\bdystopian\b|\bspace opera\b|\bai\b|\bartificial intelligence\b|\brobot\b|\bandroid\b|\balien\b|\bfuture\b|\btime travel\b|\binterstellar\b/.test(text);
  }

  if (normalizedFamily === "fantasy") {
    return /\bfantasy\b|\bmagic\b|\bmagical\b|\bwizard\b|\bwitch\b|\bdragon\b|\bfae\b|\bmythic\b|\bquest\b|\bkingdom\b|\bsword\b|\bsorcery\b/.test(text);
  }

  if (normalizedFamily === "romance") {
    return /\bromance\b|\blove story\b|\bromantic\b|\bcourtship\b|\bmarriage\b|\bwedding\b|\bduke\b|\bearl\b|\bregency\b|\bwallflower\b|\brake\b|\bkiss\b|\blover\b/.test(text);
  }

  if (normalizedFamily === "historical") {
    return /\bhistorical fiction\b|\bhistorical novel\b|\bperiod fiction\b|\bvictorian\b|\bedwardian\b|\bgilded age\b|\bcivil war\b|\bworld war\b|\b19th century\b|\bfamily saga\b|\bfrontier\b|\brevolution\b/.test(text);
  }

  return false;
}

function intendedSessionFamilies(c: Candidate, taste?: TasteProfile): { primary: string; weights: Record<string, number>; strongIntent: boolean } {
  const raw: any = (c as any)?.rawDoc || {};
  const diagnostics: any = raw?.diagnostics || (c as any)?.diagnostics || {};
  const weights: Record<string, number> = raw?.hybridLaneWeights || diagnostics?.hybridLaneWeights || (c as any)?.hybridLaneWeights || {};
  const primary = normalizeFamilyName(raw?.primaryLane || diagnostics?.primaryLane || raw?.queryFamily || (c as any)?.queryFamily || _candidateFamilyFromOptionsFallback(c));
  const text = [
    raw?.queryText,
    diagnostics?.queryText,
    (c as any)?.queryText,
    raw?.bucketPlan?.preview,
    JSON.stringify(weights || {}),
  ].filter(Boolean).join(" ").toLowerCase();

  const strongIntent = /\bhorror\b|\bhaunted\b|\bsupernatural\b|\bpsychological horror\b|\bsurvival horror\b|\bthriller\b|\bpsychological thriller\b|\bcrime thriller\b|\bmystery\b|\bdetective\b|\bscience fiction\b|\bsci[-\s]?fi\b|\bfantasy\b|\bromance\b|\bhistorical fiction\b/.test(text) || Object.keys(weights || {}).length <= 1;

  const normalizedWeights: Record<string, number> = {};
  for (const [family, weight] of Object.entries(weights || {})) {
    const key = normalizeFamilyName(family);
    const numeric = Number(weight || 0);
    if (key && Number.isFinite(numeric) && numeric > 0) normalizedWeights[key] = numeric;
  }

  return { primary, weights: normalizedWeights, strongIntent };
}

function _candidateFamilyFromOptionsFallback(c: Candidate): string {
  const lane = explicitLaneForCandidate(c);
  return lane || "";
}

function familyAlignmentPenalty(c: Candidate, taste?: TasteProfile): number {
  const { primary, weights, strongIntent } = intendedSessionFamilies(c, taste);
  const candidateFamily = normalizeFamilyName(explicitLaneForCandidate(c));
  const weightedFamilies = Object.keys(weights).filter((family) => Number(weights[family] || 0) >= 0.12);
  const allowedFamilies = new Set(weightedFamilies.length ? weightedFamilies : primary ? [primary] : []);

  if (!allowedFamilies.size || !strongIntent) return 0;

  if (candidateFamily && allowedFamilies.has(candidateFamily)) return 0;

  for (const family of allowedFamilies) {
    if (candidateMatchesFamilyText(c, family)) return -2;
  }

  const text = haystack(c);
  const isStrongOffFamilySciFi = /\b(dune|neuromancer|foundation|space opera|science fiction|sci[-\s]?fi|robot|android|alien|interstellar)\b/.test(text);
  const isStrongOffFamilyFantasy = /\b(epic fantasy|high fantasy|wizard|dragon|kingdom|sorcery)\b/.test(text);
  const isStrongOffFamilyRomance = /\b(romance|love story|courtship|wedding|duke|earl|regency)\b/.test(text);

  let penalty = -18;

  if ((allowedFamilies.has("horror") || allowedFamilies.has("mystery") || allowedFamilies.has("thriller")) && isStrongOffFamilySciFi) penalty -= 12;
  if ((allowedFamilies.has("horror") || allowedFamilies.has("mystery") || allowedFamilies.has("thriller")) && isStrongOffFamilyFantasy) penalty -= 8;
  if (!allowedFamilies.has("romance") && isStrongOffFamilyRomance) penalty -= 6;

  // In true hybrid mode, soften the penalty slightly for the 2nd/3rd weighted lanes,
  // but keep unrelated families below aligned candidates.
  if (weightedFamilies.length > 1) penalty += 6;

  return penalty;
}


function procurementAvailabilityScore(c: Candidate): number {
  const raw: any = c.rawDoc || {};
  const volumeInfo = raw.volumeInfo || {};
  const saleInfo = raw.saleInfo || volumeInfo.saleInfo || {};
  const procurementSignals = raw.procurementSignals || {};
  const identifiers = raw.industryIdentifiers || volumeInfo.industryIdentifiers;
  const publisher = normalize(c.publisher || raw.publisher || volumeInfo.publisher);
  const year = Number(c.publicationYear || raw.first_publish_year || 0);
  const ratings = Number(c.ratingCount || raw.ratingsCount || volumeInfo.ratingsCount || 0);

  const hasIndustryIdentifier =
    Boolean(raw.isbn || raw.isbn10 || raw.isbn13) ||
    (Array.isArray(identifiers) && identifiers.some((id: any) => String(id?.identifier || "").trim()));
  const hasPurchaseSignal =
    Boolean(raw.buyLink || saleInfo?.buyLink || saleInfo?.isEbook) ||
    Boolean(procurementSignals?.hasPurchaseSignal);
  const hasMainstreamPublisher =
    Boolean(procurementSignals?.hasMainstreamPublisherSignal) ||
    /\b(penguin|random house|knopf|doubleday|viking|harper|macmillan|tor|simon\s*&?\s*schuster|hachette|st\.? martin|ballantine|minotaur|mysterious press|little brown|grand central|sourcebooks|kensington|crooked lane|berkley|delacorte|del rey|orbit|ace|roc|anchor|scribner|atria|william morrow|putnam|mulholland|flatiron)\b/.test(publisher);

  let score = 0;
  if (hasPurchaseSignal) score += 8;
  if (hasIndustryIdentifier) score += 6;
  if (hasMainstreamPublisher) score += 5;
  if (c.hasCover) score += 2;
  if (ratings >= 25) score += 3;
  if (year >= 2000) score += 2;
  else if (year > 0 && year < 1980 && !hasMainstreamPublisher && ratings < 25) score -= 10;
  if (!hasIndustryIdentifier && !hasPurchaseSignal && ratings < 25) score -= 6;

  return score;
}

function literaryToneVsCommercialThrillerPenalty(c: Candidate, taste?: TasteProfile): number {
  const anyTaste: any = taste || {};
  const positiveTerms = [
    ...Object.keys(anyTaste?.likedTagCounts || {}),
    ...Object.keys(anyTaste?.rightTagCounts || {}),
    ...(Array.isArray(anyTaste?.positiveTags) ? anyTaste.positiveTags : []),
    ...(Array.isArray(anyTaste?.likedTags) ? anyTaste.likedTags : []),
  ].map((v) => String(v || "").toLowerCase());
  const positiveBlob = positiveTerms.join(" ");
  const literarySession = /\b(literary|philosophical|atmospheric|reflective|introspective|character[-\s]?driven|human|surreal|thoughtful)\b/.test(positiveBlob);
  if (!literarySession) return 0;

  const text = haystack(c);
  const formulaThriller = /\b(domestic suspense|page[-\s]?turner|gripping thriller|twisty|unputdownable|serial killer|procedural|fbi thriller|crime thriller|psychological suspense)\b/.test(text);
  const literaryCounterSignal = /\b(literary|philosophical|meditative|reflective|character[-\s]?driven|quiet|atmospheric|surreal)\b/.test(text);
  return formulaThriller && !literaryCounterSignal ? -14 : 0;
}

function modernVoicePreferencePenalty(c: Candidate, taste?: TasteProfile): number {
  const anyTaste: any = taste || {};
  const positiveTerms = [
    ...Object.keys(anyTaste?.likedTagCounts || {}),
    ...Object.keys(anyTaste?.rightTagCounts || {}),
    ...(Array.isArray(anyTaste?.positiveTags) ? anyTaste.positiveTags : []),
    ...(Array.isArray(anyTaste?.likedTags) ? anyTaste.likedTags : []),
  ].map((v) => String(v || "").toLowerCase());
  const positiveBlob = positiveTerms.join(" ");
  const modernLyricalSession = /\b(atmospheric|lyrical|stylized|surreal|philosophical|emotionally resonant|thoughtful|eerie|beautiful)\b/.test(positiveBlob);
  if (!modernLyricalSession) return 0;

  const text = haystack(c);
  const year = Number(c.publicationYear || (c.rawDoc as any)?.first_publish_year || 0);
  const isClassicGothic = /\b(gothic|dracula|frankenstein|poe|raven|yellow wallpaper|black cat|heart of darkness)\b/.test(text);
  const hasModernSignal = year >= 1980 || /\b(contemporary|modern|present-day|new york times bestseller|booker|national book award)\b/.test(text);
  const highPersonalFit = twentyQPersonalAffinityScore(c, taste) >= 5 || computeToneMatchScore(c, taste) >= 4;
  if (highPersonalFit || hasModernSignal) return 0;
  if ((year > 0 && year < 1960) || isClassicGothic) return -10;
  return 0;
}

function conceptHumanTonePenalty(c: Candidate, taste?: TasteProfile): number {
  const anyTaste: any = taste || {};
  const positiveTerms = [
    ...Object.keys(anyTaste?.likedTagCounts || {}),
    ...Object.keys(anyTaste?.rightTagCounts || {}),
    ...(Array.isArray(anyTaste?.positiveTags) ? anyTaste.positiveTags : []),
    ...(Array.isArray(anyTaste?.likedTags) ? anyTaste.likedTags : []),
  ].map((v) => String(v || "").toLowerCase()).join(" ");
  const conceptHumanSession = /\b(philosophical|thoughtful|human|character[-\s]?driven|concept|original|emotional|smart|speculative)\b/.test(positiveTerms);
  if (!conceptHumanSession) return 0;
  const text = haystack(c);
  const anthologyDump = /\b(anthology|collected|best of|year's best|dark forces|edited by|horror anthology|stories)\b/.test(text);
  const randomClassicDump = /\b(dracula|frankenstein|poe|stoker|gothic classic)\b/.test(text);
  const strongCounterSignal = /\b(literary|philosophical|character[-\s]?driven|speculative|thoughtful|novel)\b/.test(text);
  if ((anthologyDump || randomClassicDump) && !strongCounterSignal) return -12;
  return 0;
}

function plotBiasNoisePenalty(c: Candidate, taste?: TasteProfile): number {
  const title = normalize(c.title || "");
  const text = haystack(c);
  const tasteFit = twentyQPersonalAffinityScore(c, taste);
  const toneFit = computeToneMatchScore(c, taste);
  const clickbaitTitle =
    /\b(trust no one|never lie|do not disturb|the perfect son|the housemaid|behind her eyes|out of control)\b/.test(title) ||
    /\b(the|a)\s+(perfect|secret|missing|silent|lying)\s+(wife|husband|daughter|son|neighbor)\b/.test(title);
  const plotHeavy = /\b(page[-\s]?turner|twisty|gripping thriller|domestic suspense|serial killer|fbi|procedural)\b/.test(text);
  const literaryCounter = /\b(literary|reflective|philosophical|human|character[-\s]?driven|atmospheric|quiet)\b/.test(text);
  if (clickbaitTitle && plotHeavy && !literaryCounter && toneFit < 2.1 && tasteFit < 2.5) return -16;
  return 0;
}

function lowIdentityTitlePenalty(c: Candidate, taste?: TasteProfile): number {
  const title = normalize(c.title || "");
  const text = haystack(c);
  const genericDomesticPattern =
    /^(the|a)\s+(silent|perfect|missing|secret|last|good|wrong|other)\s+(wife|husband|daughter|son|stranger|neighbor|girl|woman)$/.test(title) ||
    /\b(the|a)\s+[a-z]+\s+(wife|husband|stranger)\b/.test(title);
  const formulaCopy = /\b(gripping thriller|twisty|page turner|domestic suspense)\b/.test(text);
  const highFit = twentyQPersonalAffinityScore(c, taste) >= 5.5 || computeToneMatchScore(c, taste) >= 4.2;
  if (highFit) return 0;
  if (genericDomesticPattern && formulaCopy) return -14;
  if (genericDomesticPattern) return -8;
  return 0;
}

function scoreCandidateDetailed(c: Candidate, taste?: TasteProfile): ScoreBreakdown {
  const queryScore = queryMatchScore(c) * 0.35;
  const metadataScore = metadataTrust(c) * 0.75;
  const authority = authorityScore(c) * 4.5 + thrillerAuthorityBonus(c);
  const authorityRankBoost = ratingsCountBoost(c) + knownTitleBoost(c) + classicAuthorBoost(c);
  const behavior = behaviorScore(c, taste);
  const narrative = narrativeScore(c);
  const penalties = penaltyScore(c);
  const genericPenalty = genericTitlePenalty(c);
  const overfit = overfitPenalty(c);
  const rawAnchor = anchorBoost(c);
  const anchor = Math.min(rawAnchor, ANCHOR_SCORE_CAP);
  const filterSignals = filterSignalScore(c);
  const sessionFit = sessionFitScore(c);
  const personalAffinity = twentyQPersonalAffinityScore(c, taste);
  const weightedPersonalAffinity = personalAffinity * PERSONAL_AFFINITY_WEIGHT;
  const tasteMismatchPenalty = personalAffinity < -2.5 ? NEGATIVE_TASTE_MISMATCH_PENALTY : 0;
  const laneBlend = laneBlendScore(c);
  const tone = computeToneMatchScore(c, taste);
  const procurement = procurementAvailabilityScore(c);
  const familyAlignment = familyAlignmentPenalty(c, taste);
  const raw: any = c.rawDoc || {};
  const diagnostics: any = raw?.diagnostics || {};
  const primaryLane = normalizeFamilyName(raw?.primaryLane || diagnostics?.primaryLane || "");
  const laneWeights = raw?.hybridLaneWeights || diagnostics?.hybridLaneWeights || {};
  const laneWeightRanked = Object.values(laneWeights || {}).map((v: any) => Number(v || 0)).filter((v) => v > 0).sort((a, b) => b - a);
  const isHybridLane = laneWeightRanked.length > 1 && laneWeightRanked[1] >= 0.18;
  const candidateLane = laneFamilyForCandidate(c);
  const laneCommitment =
    primaryLane === "thriller" && !isHybridLane
      ? (candidateLane === "thriller" ? 10 : candidateLane === "mystery" ? 5 : -12)
      : 0;
  const groundedRealism = groundedRealismScore(c);
  const psychologicalIntensity = psychologicalIntensityScore(c);
  const emotionalWeight = emotionalWeightScore(c);
  const openLibraryRecoveredBoost =
    isOpenLibraryCandidate(c) && passesOpenLibrarySelectionFloor(c) ? 6 : 0;
  const noveltyPenalty = noveltyTitlePenalty(c);
  const confidencePenalty = metadataConfidencePenalty(c) + lowRatingsPenalty(c);
  const seriesFormulaPenalty = formulaSeriesPenalty(c);
  const genericQueryPenalty = genericRungPenalty(c);
  const rescuePenalty = rescuePenaltyScore(c);
  const softFailurePenalty = softFailurePenaltyScore(c);
  const rankingPriority = rankingPriorityBoost(c);
  const axisAlignment = tasteAxisAlignmentBoost(c, taste);
  const classicPenalty = classicDominancePenalty(c, taste);
  const literaryCommercialPenalty = literaryToneVsCommercialThrillerPenalty(c, taste);
  const modernVoicePenalty = modernVoicePreferencePenalty(c, taste);
  const conceptHumanPenalty = conceptHumanTonePenalty(c, taste);
  const plotNoisePenalty = plotBiasNoisePenalty(c, taste);
  const lowIdentityPenalty = lowIdentityTitlePenalty(c, taste);
  const contextualAversionPenalty = contextualAversionScore(c, taste);
  const qualityGatePenalty = passesStrongFinalQualityGate(c, {
    queryScore,
    metadataScore,
    authorityScore: authority,
    behaviorScore: behavior,
    narrativeScore: narrative,
    penaltyScore: penalties + familyAlignment,
    genericTitlePenalty: genericPenalty,
    overfitPenalty: overfit,
    anchorBoost: anchor,
    filterSignalScore: filterSignals,
    personalAffinityScore: personalAffinity,
    laneBlendScore: laneBlend,
    toneScore: tone,
    procurementScore: procurement,
    groundedRealismScore: groundedRealism,
    psychologicalIntensityScore: psychologicalIntensity,
    emotionalWeightScore: emotionalWeight,
    finalScore: 0,
  }, taste) ? 0 : -16;
  const hardNegativeGate = (() => {
    const text = haystack(c);
    const anyTaste: any = taste || {};
    const negativeTerms = [
      ...Object.keys(anyTaste?.dislikedTagCounts || {}),
      ...Object.keys(anyTaste?.leftTagCounts || {}),
      ...(Array.isArray(anyTaste?.negativeTags) ? anyTaste.negativeTags : []),
      ...(Array.isArray(anyTaste?.dislikedTags) ? anyTaste.dislikedTags : []),
    ].map((v) => String(v || "").toLowerCase());
    const horrorBlocked = negativeTerms.some((t) => /horror|spooky|supernatural/.test(t));
    const romanceBlocked = negativeTerms.some((t) => /romance|sentimental/.test(t));
    const cozyBlocked = negativeTerms.some((t) => /cozy|comfort/.test(t));
    if (horrorBlocked && /\bhorror|haunted|supernatural|occult\b/.test(text)) return -50;
    if (romanceBlocked && /\bromance|love story|courtship|wedding\b/.test(text)) return -40;
    if (cozyBlocked && /\bcozy|heartwarming|uplifting comfort\b/.test(text)) return -30;
    return 0;
  })();
  const softPenalty = (() => {
    const text = haystack(c);
    let p = 0;
    if (/\bromance|love story|relationship drama\b/.test(text)) p -= 0.4;
    if (/\bslow burn|meditative|lyrical\b/.test(text)) p -= 0.3;
    if (/\bexperimental|abstract|fragmented\b/.test(text)) p -= 0.2;
    if (isOpenLibraryCandidate(c) && /\b(frankenstein|dracula|best horror|anthology|year's best|collected)\b/.test(text)) p -= 0.6;
    return p;
  })();

  return {
    queryScore,
    metadataScore,
    authorityScore: authority,
    behaviorScore: behavior,
    narrativeScore: narrative,
    penaltyScore: penalties + familyAlignment,
    genericTitlePenalty: genericPenalty,
    overfitPenalty: overfit,
    anchorBoost: anchor,
    filterSignalScore: filterSignals,
    personalAffinityScore: personalAffinity,
    laneBlendScore: laneBlend,
    toneScore: tone,
    procurementScore: procurement,
    groundedRealismScore: groundedRealism,
    psychologicalIntensityScore: psychologicalIntensity,
    emotionalWeightScore: emotionalWeight,
    finalScore: queryScore + metadataScore + authority + authorityRankBoost + behavior + narrative + rankingPriority + penalties + familyAlignment + laneCommitment + genericPenalty + overfit + noveltyPenalty + confidencePenalty + seriesFormulaPenalty + genericQueryPenalty + rescuePenalty + softFailurePenalty + axisAlignment + classicPenalty + literaryCommercialPenalty + modernVoicePenalty + conceptHumanPenalty + plotNoisePenalty + lowIdentityPenalty + contextualAversionPenalty + qualityGatePenalty + anchor + filterSignals + sessionFit + weightedPersonalAffinity + tasteMismatchPenalty + laneBlend + tone + procurement + groundedRealism + psychologicalIntensity + emotionalWeight + openLibraryRecoveredBoost + hardNegativeGate + softPenalty,
  };
}

function withScores(c: Candidate, breakdown: ScoreBreakdown, taste?: TasteProfile): RecommendationDoc {
  const rawDoc = ((c.rawDoc || {}) as RecommendationDoc) || ({} as RecommendationDoc);
  const authorName =
    (Array.isArray((rawDoc as any).author_name) && (rawDoc as any).author_name[0]) ||
    (Array.isArray((rawDoc as any).authors) && (rawDoc as any).authors[0]) ||
    (typeof (rawDoc as any).author === "string" ? (rawDoc as any).author : "") ||
    c.author ||
    "";
  const personalFitReasons = buildPersonalFitReasons(c, taste);
  const cluster = inferSessionPreferenceCluster(taste);
  const matchedPositive = cluster.preferredTerms.filter((term) => haystack(c).includes(term)).slice(0, 4);
  const avoidedNegative = cluster.avoidedTerms.filter((term) => !haystack(c).includes(term)).slice(0, 4);
  const violatedNegative = cluster.avoidedTerms.filter((term) => haystack(c).includes(term)).slice(0, 2);
  const sourceConfidence = Math.max(
    0,
    Math.min(1, (metadataTrust(c) * 0.35 + Math.max(0, authorityScore(c)) * 0.05 + Math.max(0, filterSignalScore(c)) * 0.03))
  );
  const normalizedImageUrl =
    (typeof (rawDoc as any)?.imageUrl === "string" && (rawDoc as any).imageUrl) ||
    (typeof (rawDoc as any)?.imageLinks?.thumbnail === "string" && (rawDoc as any).imageLinks.thumbnail) ||
    (typeof (rawDoc as any)?.imageLinks?.smallThumbnail === "string" && (rawDoc as any).imageLinks.smallThumbnail) ||
    (typeof (rawDoc as any)?.volumeInfo?.imageLinks?.thumbnail === "string" && (rawDoc as any).volumeInfo.imageLinks.thumbnail) ||
    (typeof (rawDoc as any)?.volumeInfo?.imageLinks?.smallThumbnail === "string" && (rawDoc as any).volumeInfo.imageLinks.smallThumbnail) ||
    (typeof (rawDoc as any)?.thumbnail === "string" && (rawDoc as any).thumbnail) ||
    (typeof (rawDoc as any)?.coverImageUrl === "string" && (rawDoc as any).coverImageUrl) ||
    ((rawDoc as any)?.cover_i ? `https://covers.openlibrary.org/b/id/${String((rawDoc as any).cover_i)}-M.jpg` : "") ||
    "";
  const sourceId =
    String(
      (rawDoc as any)?.sourceId ||
      (rawDoc as any)?.canonicalId ||
      (rawDoc as any)?.id ||
      (rawDoc as any)?.key ||
      c.id ||
      ""
    ).trim() || undefined;

  return {
    ...rawDoc,
    title: c.title || (rawDoc as any).title,
    author_name:
      Array.isArray((rawDoc as any).author_name) && (rawDoc as any).author_name.length
        ? (rawDoc as any).author_name
        : authorName
        ? [authorName]
        : (rawDoc as any).author_name,
    author: authorName || (rawDoc as any).author,
    authors:
      Array.isArray((rawDoc as any).authors) && (rawDoc as any).authors.length
        ? (rawDoc as any).authors
        : authorName
        ? [authorName]
        : (rawDoc as any).authors,
    imageUrl: normalizedImageUrl || (rawDoc as any).imageUrl,
    imageLinks: (rawDoc as any).imageLinks || (normalizedImageUrl ? { thumbnail: normalizedImageUrl } : undefined),
    sourceId,
    canonicalId: (rawDoc as any).canonicalId || sourceId,
    first_publish_year: c.publicationYear || (rawDoc as any).first_publish_year,
    preFilterScore: breakdown.finalScore,
    postFilterScore: breakdown.finalScore,
    scoreBreakdown: breakdown,
    personalFitReasons,
    recommendationDiagnostics: {
      matchedPositiveSignals: matchedPositive,
      avoidedNegativeSignals: avoidedNegative,
      violatedNegativeSignals: violatedNegative,
      genreContribution: Number((breakdown.laneBlendScore + breakdown.queryScore).toFixed(2)),
      toneStyleContribution: Number((breakdown.toneScore + breakdown.personalAffinityScore + breakdown.psychologicalIntensityScore + breakdown.emotionalWeightScore).toFixed(2)),
      sourceConfidence: Number(sourceConfidence.toFixed(2)),
      queryClusterSource:
        String((c as any)?.laneKind || (c as any)?.rawDoc?.laneKind || (c as any)?.rawDoc?.diagnostics?.laneKind || "unknown"),
      whySelected: [
        `High multi-signal fit (${breakdown.personalAffinityScore.toFixed(1)} personal affinity, ${breakdown.toneScore.toFixed(1)} tone match)`,
        `Balanced quality signals (${breakdown.authorityScore.toFixed(1)} authority, ${breakdown.metadataScore.toFixed(1)} metadata)`,
      ],
    },
    queryText: (c as any).queryText ?? (rawDoc as any).queryText,
    queryRung: (c as any).queryRung ?? (rawDoc as any).queryRung,
  } as RecommendationDoc;
}

function attachNearbyAlternativeReason(
  selectedDocs: RecommendationDoc[],
  ordered: Array<{ candidate: Candidate; breakdown: ScoreBreakdown }>
): RecommendationDoc[] {
  return selectedDocs.map((doc) => {
    const docKey = `${normalize((doc as any)?.title)}|${normalize((doc as any)?.author)}`;
    const current = ordered.find((entry) => identityKey(entry.candidate) === docKey);
    if (!current) return doc;

    const nearby = ordered.find((entry) =>
      identityKey(entry.candidate) !== docKey &&
      Math.abs(current.breakdown.finalScore - entry.breakdown.finalScore) <= 6
    );
    if (!nearby) return doc;

    const whyBeat =
      current.breakdown.personalAffinityScore - nearby.breakdown.personalAffinityScore >= 1.2
        ? "Beat nearby alternatives on full-session taste alignment."
        : current.breakdown.toneScore - nearby.breakdown.toneScore >= 1
        ? "Beat nearby alternatives on tone/style match."
        : current.breakdown.authorityScore >= nearby.breakdown.authorityScore + 2
        ? "Beat nearby alternatives on stronger source confidence."
        : "Beat nearby alternatives on blended fit across signals.";

    return {
      ...doc,
      recommendationDiagnostics: {
        ...((doc as any)?.recommendationDiagnostics || {}),
        whyBeatNearbyAlternatives: whyBeat,
      },
    } as RecommendationDoc;
  });
}

function inferTasteShapeTargets(taste?: TasteProfile): Array<{ facet: string; weight: number }> {
  const anyTaste: any = taste || {};
  const positiveBlob = [
    ...Object.keys(anyTaste?.likedTagCounts || {}),
    ...Object.keys(anyTaste?.rightTagCounts || {}),
    ...(Array.isArray(anyTaste?.positiveTags) ? anyTaste.positiveTags : []),
    ...(Array.isArray(anyTaste?.likedTags) ? anyTaste.likedTags : []),
  ].map((v) => String(v || "").toLowerCase()).join(" ");
  const weighted: Array<{ facet: string; weight: number }> = [];
  if (/\b(idea|concept|philosophical|speculative|memory|identity)\b/.test(positiveBlob)) weighted.push({ facet: "high_concept", weight: 1.0 });
  if (/\b(stylized|elevated|atmospheric|cinematic|literary|surreal)\b/.test(positiveBlob)) weighted.push({ facet: "stylized_elevated", weight: 0.9 });
  if (/\b(psychological|moral|tension)\b/.test(positiveBlob)) weighted.push({ facet: "psychological_meaning", weight: 0.95 });
  if (/\b(investigation|justice|moral conflict|procedural)\b/.test(positiveBlob)) weighted.push({ facet: "investigation_moral", weight: 0.75 });
  return weighted.sort((a, b) => b.weight - a.weight).slice(0, 4);
}

function emotionalConceptualCoherenceScore(
  candidate: { candidate: Candidate; breakdown: ScoreBreakdown },
  anchor: { candidate: Candidate; breakdown: ScoreBreakdown }
): number {
  const candidateText = haystack(candidate.candidate);
  const anchorText = haystack(anchor.candidate);
  let score = 0;
  const toneDelta = Math.abs((candidate.breakdown.toneScore || 0) - (anchor.breakdown.toneScore || 0));
  const affinityDelta = Math.abs((candidate.breakdown.personalAffinityScore || 0) - (anchor.breakdown.personalAffinityScore || 0));
  if (toneDelta <= 1.25) score += 2;
  if (affinityDelta <= 2.2) score += 2;
  if (candidateTasteFacet(candidate.candidate) === candidateTasteFacet(anchor.candidate)) score += 1.25;

  const sharedVibe =
    (/\b(psychological|atmospheric|stylized|speculative|investigation|moral)\b/.test(candidateText) &&
      /\b(psychological|atmospheric|stylized|speculative|investigation|moral)\b/.test(anchorText));
  if (sharedVibe) score += 2.5;
  if (/\b(cozy|uplifting comfort|lighthearted romance)\b/.test(candidateText) && /\b(dark|psychological|tense)\b/.test(anchorText)) score -= 4;
  return score;
}

function authoredIntentionalityScore(c: Candidate): number {
  const text = haystack(c);
  const ratings = Number(c.ratingCount || 0);
  let score = 0;
  if (/\b(literary|crafted|stylized|elevated|intentional|precise|controlled|character[-\s]?driven|philosophical|conceptual)\b/.test(text)) score += 4;
  if (/\b(psychological with depth|moral tension|ethical dilemma|identity|memory|meaning)\b/.test(text)) score += 3;
  if (ratings >= 200) score += 2;
  if (/\b(shock|gore|splatter|extreme horror|random violence|disturbing for its own sake)\b/.test(text)) score -= 8;
  if (/\b(indie horror|microbudget|experimental found footage|camp slasher)\b/.test(text) && ratings < 80) score -= 7;
  return score;
}

function enforceLaneDiversityCap(
  selected: Array<{ candidate: Candidate; breakdown: ScoreBreakdown }>,
  ordered: Array<{ candidate: Candidate; breakdown: ScoreBreakdown }>,
  maxResults: number
): Array<{ candidate: Candidate; breakdown: ScoreBreakdown }> {
  const laneCap = Math.max(2, Math.floor(maxResults * 0.7));
  const laneCounts = new Map<string, number>();
  const balanced: Array<{ candidate: Candidate; breakdown: ScoreBreakdown }> = [];

  for (const entry of selected) {
    const lane = laneFamilyForCandidate(entry.candidate) || "unknown";
    const count = laneCounts.get(lane) || 0;
    if (count >= laneCap) continue;
    laneCounts.set(lane, count + 1);
    balanced.push(entry);
  }

  for (const entry of ordered) {
    if (balanced.length >= maxResults) break;
    const key = identityKey(entry.candidate);
    if (balanced.some((b) => identityKey(b.candidate) === key)) continue;
    const lane = laneFamilyForCandidate(entry.candidate) || "unknown";
    const count = laneCounts.get(lane) || 0;
    if (count >= laneCap) continue;
    laneCounts.set(lane, count + 1);
    balanced.push(entry);
  }

  return balanced;
}

function enforceClusterDominanceLimit(
  selected: Array<{ candidate: Candidate; breakdown: ScoreBreakdown }>,
  maxPerCluster: number
): Array<{ candidate: Candidate; breakdown: ScoreBreakdown }> {
  const clusterCounts = new Map<string, number>();
  const out: Array<{ candidate: Candidate; breakdown: ScoreBreakdown }> = [];
  for (const entry of selected) {
    const cluster = String((entry.candidate as any)?.rawDoc?.clusterId || (entry.candidate as any)?.clusterId || (entry.candidate as any)?.laneKind || "cluster:general");
    const count = clusterCounts.get(cluster) || 0;
    if (count >= maxPerCluster) continue;
    clusterCounts.set(cluster, count + 1);
    out.push(entry);
  }
  return out;
}

function passesOpenLibrarySelectionFloor(candidate: Candidate): boolean {
  if (!isOpenLibraryCandidate(candidate)) return false;

  const hardReject = isHardReject(candidate);
  if (hardReject.reject) return false;

  const trust = metadataTrust(candidate);
  const descriptionLength = String(candidate.description || '').trim().length;
  const hasShape =
    (candidate.pageCount || 0) >= 80 ||
    descriptionLength > 80 ||
    Boolean(candidate.hasCover) ||
    Boolean((candidate as any)?.rawDoc?.key) ||
    Boolean((candidate as any)?.rawDoc?.id);

  const filterSignals = filterSignalScore(candidate);
  const anchor = anchorBoost(candidate);
  const fictionSignals = hasFictionSignals(candidate);

  return hasShape || fictionSignals || filterSignals >= 8 || anchor >= 8 || trust >= 1;
}

function seriesClusterKey(candidate: Candidate): string {
  const title = normalize(candidate.title);
  const match =
    title.match(/\b(golden amazon)\b/) ||
    title.match(/\b([a-z0-9 ]+?)\s+(?:saga|series)\b/) ||
    title.match(/\b([a-z0-9 ]+?)\s+book\s+(?:one|two|three|four|five|six|seven|eight|nine|ten|\d+)\b/);
  return match?.[1]?.trim() || "";
}

function canTakeCandidate(
  candidate: Candidate,
  selected: Array<{ candidate: Candidate; breakdown: ScoreBreakdown }>,
  authorCounts: Map<string, number>,
  subtypeCounts?: Map<string, number>,
  targetCount = 10
): boolean {
  const author = normalize(candidate.author);
  const count = authorCounts.get(author) || 0;
  const lane = laneFamilyForCandidate(candidate);
  const authorCap = 2;
  if (count >= authorCap) return false;

  const laneCounts = selected.reduce((acc, entry) => {
    const key = laneFamilyForCandidate(entry.candidate) || "general";
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);
  const thrillerMysteryCount = Number(laneCounts["thriller"] || 0) + Number(laneCounts["mystery"] || 0);
  const laneCap = Math.max(2, Math.floor(targetCount * 0.4));
  if ((lane === "thriller" || lane === "mystery") && selected.length >= 5 && thrillerMysteryCount >= laneCap) {
    return false;
  }

  const seriesKey = seriesClusterKey(candidate);
  if (seriesKey && selected.some((entry) => seriesClusterKey(entry.candidate) === seriesKey)) {
    return false;
  }

  if (isOpenLibraryCandidate(candidate) && !passesOpenLibrarySelectionFloor(candidate)) {
    return false;
  }

  if (lane === "thriller" && subtypeCounts) {
    const subtype = thrillerSubtype(candidate);
    const cap = Math.max(1, Math.floor(targetCount * 0.4));
    const current = subtypeCounts.get(subtype) || 0;
    if (selected.length >= 5 && current >= cap) return false;
  }

  return !selected.some((entry) => identityKey(entry.candidate) === identityKey(candidate));
}

function hasMinimumShapeForFallback(c: Candidate): boolean {
  const descriptionLength = String(c.description || '').trim().length;
  return Boolean(
    (c.pageCount || 0) >= 80 ||
    descriptionLength > 80 ||
    Boolean(c.hasCover && descriptionLength > 40)
  );
}

function isFallbackEligibleCandidate(c: Candidate): boolean {
  const diagnostics = getFilterDiagnostics(c);
  const flags = diagnostics?.filterFlags || diagnostics?.flags || {};
  const passedChecks: string[] = Array.isArray(diagnostics?.filterPassedChecks)
    ? diagnostics.filterPassedChecks
    : Array.isArray(diagnostics?.passedChecks)
      ? diagnostics.passedChecks
      : [];
  return Boolean(
    flags.fictionPositive &&
    hasMinimumShapeForFallback(c) &&
    passedChecks.includes('passed_content_gate')
  );
}

function isTierAStrongNarrativeCandidate(c: Candidate): boolean {
  const diagnostics = getFilterDiagnostics(c);
  const flags = diagnostics?.filterFlags || diagnostics?.flags || {};
  return Boolean(flags.strongNarrative);
}

function laneFamilyForCandidate(c: Candidate): string {
  return normalizeFamilyName(explicitLaneForCandidate(c));
}

function isExplicitHybridSession(pool: Array<{ candidate: Candidate; breakdown: ScoreBreakdown }>): boolean {
  const firstRaw: any = pool?.[0]?.candidate?.rawDoc || {};
  const weights = firstRaw?.hybridLaneWeights || firstRaw?.diagnostics?.hybridLaneWeights || {};
  const ranked = Object.values(weights || {}).map((v: any) => Number(v || 0)).filter((v) => v > 0).sort((a, b) => b - a);
  return ranked.length > 1 && ranked[1] >= 0.18;
}

function pickFromPool(
  pool: Array<{ candidate: Candidate; breakdown: ScoreBreakdown }>,
  selected: Array<{ candidate: Candidate; breakdown: ScoreBreakdown }>,
  authorCounts: Map<string, number>,
  limit: number,
  subtypeCounts?: Map<string, number>,
  targetCount = 10
): Array<{ candidate: Candidate; breakdown: ScoreBreakdown }> {
  for (let i = 0; i < pool.length; i += 1) {
    const entry = pool[i];
    if (selected.length >= limit) break;
    if (!canTakeCandidate(entry.candidate, selected, authorCounts, subtypeCounts, targetCount)) continue;
    if (subtypeCounts && laneFamilyForCandidate(entry.candidate) === "thriller") {
      const subtype = thrillerSubtype(entry.candidate);
      const subtypeSeen = (subtypeCounts.get(subtype) || 0) > 0;
      const wantsMoreSubtypeDiversity = selected.length < Math.min(6, targetCount - 2);
      if (subtypeSeen && wantsMoreSubtypeDiversity) {
        const hasUnseenSubtypeAlternative = pool.slice(i + 1).some((candidateEntry) => {
          if (laneFamilyForCandidate(candidateEntry.candidate) !== "thriller") return false;
          if (!canTakeCandidate(candidateEntry.candidate, selected, authorCounts, subtypeCounts, targetCount)) return false;
          const otherSubtype = thrillerSubtype(candidateEntry.candidate);
          return (subtypeCounts.get(otherSubtype) || 0) === 0;
        });
        if (hasUnseenSubtypeAlternative) continue;
      }
    }

    selected.push(entry);
    const author = normalize(entry.candidate.author);
    authorCounts.set(author, (authorCounts.get(author) || 0) + 1);
    if (subtypeCounts && laneFamilyForCandidate(entry.candidate) === "thriller") {
      const subtype = thrillerSubtype(entry.candidate);
      subtypeCounts.set(subtype, (subtypeCounts.get(subtype) || 0) + 1);
    }
  }

  return selected;
}

function isHighConfidenceEntry(entry: { candidate: Candidate; breakdown: ScoreBreakdown }): boolean {
  const c = entry.candidate;
  const ratings = Number(c.ratingCount || 0);
  const anchor = anchorBoost(c);
  const authority = entry.breakdown.authorityScore;
  const canonical = knownTitleBoost(c) > 0 || classicAuthorBoost(c) > 0;
  return canonical || ratings >= 200 || anchor >= 14 || authority >= 22;
}

function seedHistoricalRungDiversity(
  pool: Array<{ candidate: Candidate; breakdown: ScoreBreakdown }>,
  selected: Array<{ candidate: Candidate; breakdown: ScoreBreakdown }>,
  authorCounts: Map<string, number>,
  limit: number,
  subtypeCounts?: Map<string, number>,
  targetCount = 10
): Array<{ candidate: Candidate; breakdown: ScoreBreakdown }> {
  const hasHistorical = pool.some((entry) => isHistoricalCandidate(entry.candidate));
  if (!hasHistorical) return selected;

  const firstRaw: any = pool.find((entry) => isHistoricalCandidate(entry.candidate))?.candidate?.rawDoc || {};
  const weights = firstRaw?.hybridLaneWeights || firstRaw?.diagnostics?.hybridLaneWeights || {};
  const historicalWeight = Number(weights?.historical || 0);
  const maxWeight = Math.max(0, ...Object.values(weights).map((value: any) => Number(value || 0)));
  const primaryLane = normalizeFamilyName(firstRaw?.primaryLane || firstRaw?.diagnostics?.primaryLane || '');

  // Historical rung diversity is helpful only for genuinely historical sessions.
  // In hybrid sessions where historical is merely a generated fallback lane, seeding
  // historical rungs before normal ranking hijacks the final list away from taste.
  if (Object.keys(weights).length > 1 && primaryLane !== 'historical' && historicalWeight < Math.max(0.45, maxWeight)) {
    return selected;
  }

  for (const rung of [1, 2, 3]) {
    if (selected.length >= limit) break;

    const pick = pool.find((entry) => {
      if (!isHistoricalCandidate(entry.candidate)) return false;
      if (evidenceRank(entry.candidate) !== rung) return false;
      return canTakeCandidate(entry.candidate, selected, authorCounts, subtypeCounts, targetCount);
    });

    if (!pick) continue;

    selected.push(pick);
    const author = normalize(pick.candidate.author);
    authorCounts.set(author, (authorCounts.get(author) || 0) + 1);
    if (subtypeCounts && laneFamilyForCandidate(pick.candidate) === "thriller") {
      const subtype = thrillerSubtype(pick.candidate);
      subtypeCounts.set(subtype, (subtypeCounts.get(subtype) || 0) + 1);
    }
  }

  return selected;
}

function thrillerSubtype(c: Candidate): string {
  const text = haystack(c);
  if (/\bdomestic suspense|wife|husband|marriage|family|neighbor|secret|lying|lie|perfect|missing woman|missing girl|suburban\b/.test(text)) return "domestic_suspense";
  if (/\bpsychological thriller|unreliable narrator|obsession|mind games|gaslighting\b/.test(text)) return "psychological_thriller";
  if (/\bcrime thriller|serial killer|detective|fbi|procedural|manhunt\b/.test(text)) return "crime_thriller";
  if (/\baction thriller|survival thriller|fugitive|chase|escape|on the run\b/.test(text)) return "action_survival_thriller";
  if (/\bhorror thriller|supernatural thriller|occult thriller|haunted\b/.test(text)) return "horror_thriller";
  if (/\bconspiracy thriller|political thriller|spy thriller|cover-up\b/.test(text)) return "conspiracy_thriller";
  if (/\bmystery thriller|whodunit|cold case|private investigator\b/.test(text)) return "mystery_thriller";
  return "general_thriller";
}

export function finalRecommenderForDeck(
  candidates: Candidate[],
  _deckKey: DeckKey,
  _options: FinalRecommenderOptions = {}
): RecommendationDoc[] {
  const input = Array.isArray(candidates) ? candidates.filter(Boolean) : [];
  const deduped = (Array.isArray(input) ? dedupe(input) : []).filter(isValidCandidate);

  const rejected: QualityRejectRecord[] = [];
  const qualityPassed: Candidate[] = [];

  for (const candidate of deduped) {
    let verdict = passesQuality(candidate);
    if (!verdict.pass && verdict.reason === 'low_metadata_trust' && hasStrongNarrativeOrAuthoritySignal(candidate)) {
      verdict = { pass: true };
    }

    if (!verdict.pass && isOpenLibraryCandidate(candidate)) {
      const hardReject = isHardReject(candidate);
      const trust = metadataTrust(candidate);
      const hasBibliographicShape =
        Boolean(candidate?.title) &&
        Boolean(normalize(candidate?.author)) &&
        (
          Boolean(candidate?.hasCover) ||
          Boolean(candidate?.description) ||
          (candidate?.pageCount || 0) >= 120 ||
          Boolean((candidate as any)?.rawDoc?.key) ||
          Boolean((candidate as any)?.rawDoc?.id)
        );

      const hasSomeFictionSignal = hasFictionSignals(candidate);

      if (!hardReject.reject && hasBibliographicShape && (hasSomeFictionSignal || trust >= 2)) {
        verdict = { pass: true };
      }
    }

    if (verdict.pass) {
      qualityPassed.push(candidate);
      continue;
    }

    rejected.push({
      id: candidate.id,
      title: candidate.title,
      author: candidate.author,
      source: candidate.source,
      reason: verdict.reason || 'weak_fiction_signal',
      detail: verdict.detail,
    });
  }

  const relaxedFallback = (Array.isArray(deduped) ? deduped : []).filter((c) => {
    if (!c) return false;
    if (isHardReject(c).reject) return false;

    const trust = metadataTrust(c);
    const isOpenLibrary = isOpenLibraryCandidate(c);
    const descriptionLength = String(c.description || '').trim().length;

    if (!isOpenLibrary && trust < 2) return false;
    if (isOpenLibrary && trust < 1) return false;

    const hasStrongSignal =
      (c.pageCount || 0) >= 120 ||
      descriptionLength > 120 ||
      ((c.pageCount || 0) >= 80 && descriptionLength > 80) ||
      (c.ratingCount || 0) >= 10;

    const hasBibliographicShape =
      Boolean(c?.title) &&
      Boolean(normalize(c?.author)) &&
      (
        Boolean(c?.hasCover) ||
        Boolean(c?.description) ||
        (c?.pageCount || 0) >= 80 ||
        Boolean((c as any)?.rawDoc?.key) ||
        Boolean((c as any)?.rawDoc?.id)
      );

    return hasStrongSignal || hasBibliographicShape;
  });

  const base = qualityPassed.length > 0 ? qualityPassed : relaxedFallback.length >= 5 ? relaxedFallback : relaxedFallback.slice(0, 10);

  debugFinalLog("QUALITY FILTER SUMMARY", {
    inputCount: input.length,
    dedupedCount: deduped.length,
    qualityPassedCount: qualityPassed.length,
    relaxedFallbackCount: relaxedFallback.length,
    baseCount: base.length,
    rejectedCount: rejected.length,
  });
  debugFinalPreview("QUALITY BASE", base);

  buildDebug(input.length, deduped.length, base, rejected);

  const { tasteProfile } = _options;
  const negativeTasteTerms = new Set(
    [
      ...Object.keys((tasteProfile as any)?.dislikedTagCounts || {}),
      ...Object.keys((tasteProfile as any)?.leftTagCounts || {}),
      ...((tasteProfile as any)?.negativeTags || []),
    ].map((v) => String(v || "").toLowerCase())
  );
  const scored = base.map((candidate) => ({
    candidate,
    breakdown: scoreCandidateDetailed(candidate, tasteProfile),
  }));

  const tasteRankable = tasteProfile
    ? scored.filter((entry) => entry.breakdown.personalAffinityScore >= MIN_TASTE_SCORE_FOR_RANKING)
    : scored;

  const rankingSource = tasteRankable.length >= Math.min(10, scored.length)
    ? tasteRankable
    : scored;
  const dedupedRankingSource = (() => {
    const byWork = new Map<string, { candidate: Candidate; breakdown: ScoreBreakdown }>();
    for (const entry of rankingSource) {
      const key = identityKey(entry.candidate);
      const existing = byWork.get(key);
      if (!existing || entry.breakdown.finalScore > existing.breakdown.finalScore) byWork.set(key, entry);
    }
    return Array.from(byWork.values());
  })();

  debugFinalLog("RANKING SOURCE SUMMARY", {
    scoredCount: scored.length,
    tasteRankableCount: tasteRankable.length,
    rankingSourceCount: rankingSource.length,
  });

  const ordered = [...dedupedRankingSource].sort((a, b) => {
    const scoreDiff = b.breakdown.finalScore - a.breakdown.finalScore;
    if (scoreDiff !== 0) return scoreDiff;

    const rungDiff = evidenceRank(a.candidate) - evidenceRank(b.candidate);
    if (rungDiff !== 0) return rungDiff;

    const procurementDiff = b.breakdown.procurementScore - a.breakdown.procurementScore;
    if (procurementDiff !== 0) return procurementDiff;

    const aHasDescription = a.candidate.description ? 1 : 0;
    const bHasDescription = b.candidate.description ? 1 : 0;
    if (aHasDescription !== bHasDescription) return bHasDescription - aHasDescription;

    const aHasCover = a.candidate.hasCover ? 1 : 0;
    const bHasCover = b.candidate.hasCover ? 1 : 0;
    return bHasCover - aHasCover;
  });
  const aiReranker = _options?.aiReranker;
  const orderedAfterAi = (() => {
    if (typeof aiReranker !== "function" || !ordered.length) return ordered;
    try {
      const aiScores = aiReranker({
        tasteProfile,
        candidates: ordered.map((entry) => ({
          id: identityKey(entry.candidate),
          title: String(entry.candidate.title || ""),
          author: String(entry.candidate.author || ""),
          summary: String(entry.candidate.description || ""),
          baseScore: Number(entry.breakdown.finalScore || 0),
        })),
      });
      const scoreMap = new Map<string, { score: number; reason?: string }>();
      for (const row of aiScores || []) {
        if (!row?.id || !Number.isFinite(Number(row?.score))) continue;
        scoreMap.set(String(row.id), { score: Number(row.score), reason: row.reason });
      }
      if (!scoreMap.size) return ordered;
      const blended = ordered.map((entry) => {
        const key = identityKey(entry.candidate);
        const ai = scoreMap.get(key);
        if (!ai) return entry;
        const aiBoost = ai.score * 3.2;
        return {
          candidate: entry.candidate,
          breakdown: {
            ...entry.breakdown,
            finalScore: Number((entry.breakdown.finalScore + aiBoost).toFixed(4)),
          },
        };
      });
      return blended.sort((a, b) => b.breakdown.finalScore - a.breakdown.finalScore);
    } catch (error) {
      debugFinalLog("AI_RERANK_FALLBACK_TO_DETERMINISTIC", { error: String((error as any)?.message || error) });
      return ordered;
    }
  })();

  const TIER_B_SCORE_THRESHOLD = orderedAfterAi.length >= 15 ? 14 : 22;
  const tierA = orderedAfterAi.filter((entry) => isTierAStrongNarrativeCandidate(entry.candidate));
  const tierB = orderedAfterAi.filter((entry) =>
    !isTierAStrongNarrativeCandidate(entry.candidate) &&
    isFallbackEligibleCandidate(entry.candidate) &&
    entry.breakdown.finalScore >= TIER_B_SCORE_THRESHOLD
  );
  let displayPool = tierA.length >= 3 ? tierA : [...tierA, ...tierB];
  const toneCohesionMode = (() => {
    const tasteAny: any = tasteProfile || {};
    const positiveTerms = [
      ...Object.keys(tasteAny?.likedTagCounts || {}),
      ...Object.keys(tasteAny?.rightTagCounts || {}),
      ...(Array.isArray(tasteAny?.positiveTags) ? tasteAny.positiveTags : []),
      ...(Array.isArray(tasteAny?.likedTags) ? tasteAny.likedTags : []),
    ].map((v) => String(v || "").toLowerCase()).join(" ");
    return /\b(atmospheric|lyrical|surreal|philosophical|human|character[-\s]?driven|emotional|introspective|stylized)\b/.test(positiveTerms);
  })();
  displayPool = displayPool.filter((entry) => {
    const lane = laneFamilyForCandidate(entry.candidate);
    const text = haystack(entry.candidate);
    const diagnostics = getFilterDiagnostics(entry.candidate);
    const passedChecks: string[] = Array.isArray(diagnostics?.filterPassedChecks) ? diagnostics.filterPassedChecks : Array.isArray(diagnostics?.passedChecks) ? diagnostics.passedChecks : [];
    const rescueHeavy = passedChecks.filter((check) => String(check).includes("rescue") || String(check).includes("borderline")).length >= 2;
    if (lane === "fantasy" && (negativeTasteTerms.has("fantasy romance") || negativeTasteTerms.has("cozy fantasy") || negativeTasteTerms.has("fantasy adventure"))) {
      const hasPositiveFantasyShape = /\b(moral conflict|betrayal|consequence|darkly comic|authored|psychological|adult)\b/.test(text);
      if (!hasPositiveFantasyShape) return false;
    }
    if (rescueHeavy && lane === "fantasy") return false;
    if (toneCohesionMode) {
      const toneFitOk = entry.breakdown.toneScore >= 1.25;
      const affinityOk = entry.breakdown.personalAffinityScore >= 0.8;
      const year = Number(entry.candidate.publicationYear || (entry.candidate.rawDoc as any)?.first_publish_year || 0);
      const canonDarkClassic = /\b(dracula|frankenstein|poe|raven|yellow wallpaper|turn of the screw|gothic classic)\b/.test(text);
      const isLikelyPublicDomainClassic = canonDarkClassic || (year > 0 && year < 1955);
      const exceptionallyStrongFit = entry.breakdown.toneScore >= 3.4 || entry.breakdown.personalAffinityScore >= 4.8;
      if (isLikelyPublicDomainClassic && !exceptionallyStrongFit) return false;
      if (!toneFitOk && !affinityOk) return false;
    }
    return true;
  });
  const minDisplayPool = orderedAfterAi.length >= 15 ? TARGET_MIN_RESULTS_WHEN_VIABLE : Math.min(6, orderedAfterAi.length);
  if (displayPool.length < minDisplayPool) {
    const fallback = orderedAfterAi.filter((entry) =>
      passesStrongFinalQualityGate(entry.candidate, entry.breakdown, tasteProfile) ||
      entry.breakdown.finalScore >= (TIER_B_SCORE_THRESHOLD - 4)
    );
    const merged = [...displayPool];
    for (const entry of fallback) {
      if (merged.some((existing) => identityKey(existing.candidate) === identityKey(entry.candidate))) continue;
      merged.push(entry);
      if (merged.length >= Math.max(minDisplayPool, TARGET_MIN_RESULTS_WHEN_VIABLE)) break;
    }
    displayPool = merged;
  }

  const firstRawForLane: any = displayPool?.[0]?.candidate?.rawDoc || {};
  const sessionPrimaryLane = normalizeFamilyName(
    String(firstRawForLane?.primaryLane || firstRawForLane?.diagnostics?.primaryLane || "")
  );
  const isHybridSession = isExplicitHybridSession(displayPool);
  if (sessionPrimaryLane === "thriller" && !isHybridSession) {
    const primaryLaneEntries = displayPool.filter((entry) => {
      const lane = laneFamilyForCandidate(entry.candidate);
      return lane === "thriller" || lane === "mystery";
    });
    const fallbackEntries = displayPool.filter((entry) => {
      const lane = laneFamilyForCandidate(entry.candidate);
      return lane !== "thriller" && lane !== "mystery";
    });
    const PRIMARY_LANE_MIN = 2;
    const FALLBACK_CAP = primaryLaneEntries.length >= PRIMARY_LANE_MIN ? 4 : 5;
    displayPool = [...primaryLaneEntries, ...fallbackEntries.slice(0, FALLBACK_CAP)];
  }

  const selected: Array<{ candidate: Candidate; breakdown: ScoreBreakdown }> = [];
  const authorCounts = new Map<string, number>();
  const thrillerSubtypeCounts = new Map<string, number>();
  const MAX_RESULTS = 10;
  const HIGH_CONFIDENCE_TARGET = 4;
  const clusteredPool = new Map<string, Array<{ candidate: Candidate; breakdown: ScoreBreakdown }>>();
  for (const entry of displayPool) {
    const key = String((entry.candidate as any)?.laneKind || (entry.candidate as any)?.rawDoc?.laneKind || (entry.candidate as any)?.queryFamily || "cluster:general");
    if (!clusteredPool.has(key)) clusteredPool.set(key, []);
    clusteredPool.get(key)!.push(entry);
  }
  for (const bucket of clusteredPool.values()) {
    bucket.sort((a, b) => b.breakdown.finalScore - a.breakdown.finalScore);
  }

  for (const [, bucket] of Array.from(clusteredPool.entries()).slice(0, 6)) {
    const top = bucket[0]?.breakdown?.finalScore ?? -999;
    const quota = top < 16 ? 1 : 2;
    if (top < 8) continue;
    pickFromPool(bucket.slice(0, quota), selected, authorCounts, MAX_RESULTS, thrillerSubtypeCounts, MAX_RESULTS);
  }

  seedHistoricalRungDiversity(displayPool, selected, authorCounts, MAX_RESULTS, thrillerSubtypeCounts, MAX_RESULTS);
  const highConfidencePool = displayPool.filter((entry) => isHighConfidenceEntry(entry));
  pickFromPool(highConfidencePool, selected, authorCounts, Math.min(MAX_RESULTS, HIGH_CONFIDENCE_TARGET), thrillerSubtypeCounts, MAX_RESULTS);
  pickFromPool(displayPool, selected, authorCounts, MAX_RESULTS, thrillerSubtypeCounts, MAX_RESULTS);
  if (selected.length < TARGET_MIN_RESULTS_WHEN_VIABLE && orderedAfterAi.length >= 15) {
    const tasteAwareBackfill = tasteProfile
      ? orderedAfterAi.filter((entry) => entry.breakdown.personalAffinityScore >= 0.5 && entry.breakdown.toneScore >= 0.8)
      : orderedAfterAi;
    pickFromPool(tasteAwareBackfill, selected, authorCounts, Math.min(MAX_RESULTS, TARGET_MIN_RESULTS_WHEN_VIABLE), thrillerSubtypeCounts, MAX_RESULTS);
  }
  if (selected.length < 5) {
    const adjacentFamilies: Record<string, string[]> = {
      thriller: ["mystery", "horror"],
      romance: ["historical", "general"],
      historical: ["romance", "mystery"],
      fantasy: ["speculative", "science_fiction"],
      horror: ["thriller", "mystery"],
      science_fiction: ["speculative", "fantasy"],
      mystery: ["thriller", "historical"],
    };
    const isPromotionEligible = (candidate: Candidate): boolean => {
      const diagnostics = getFilterDiagnostics(candidate);
      const flags = diagnostics?.filterFlags || diagnostics?.flags || {};
      const text = haystack(candidate);
      if (!(flags?.fictionPositive && flags?.strongNarrative)) return false;
      if (isLikelyNonFictionMeta(candidate)) return false;
      if (/\b(anthology|collection|reference|guide|handbook|criticism|analysis)\b/.test(text)) return false;
      return true;
    };
    const primaryPromotions = ordered.filter((entry) =>
      laneFamilyForCandidate(entry.candidate) === sessionPrimaryLane &&
      isOpenLibraryCandidate(entry.candidate) &&
      isPromotionEligible(entry.candidate)
    );
    pickFromPool(primaryPromotions, selected, authorCounts, 5, thrillerSubtypeCounts, MAX_RESULTS);

    if (selected.length < 5) {
      const adjacentSet = new Set(adjacentFamilies[sessionPrimaryLane] || []);
      const adjacentPromotions = ordered.filter((entry) =>
        adjacentSet.has(laneFamilyForCandidate(entry.candidate)) &&
        isOpenLibraryCandidate(entry.candidate) &&
        isPromotionEligible(entry.candidate)
      );
      pickFromPool(adjacentPromotions, selected, authorCounts, 5, thrillerSubtypeCounts, MAX_RESULTS);
    }
    if (selected.length < 5) {
      debugFinalLog("FINAL_PROMOTION_REASON", {
        reason: "minimum_fill_rule",
        sessionPrimaryLane,
        selectedCount: selected.length,
      });
    }
  }
  debugFinalPreview("ORDERED TOP BEFORE AUTHOR/SERIES CAPS", ordered);
  debugFinalPreview("DISPLAY POOL AFTER TIER GATE", displayPool);
  debugFinalPreview("SELECTED FINAL AFTER AUTHOR/SERIES CAPS", selected);

  const clusterBalanced = selected.filter((entry) => !isHardReject(entry.candidate).reject);
  const fantasySuppressed =
    negativeTasteTerms.has("fantasy romance") ||
    negativeTasteTerms.has("cozy fantasy") ||
    negativeTasteTerms.has("epic fantasy") ||
    negativeTasteTerms.has("fantasy adventure");
  const laneQuality = new Map<string, { total: number; rescueHeavy: number }>();
  for (const entry of clusterBalanced) {
    const lane = laneFamilyForCandidate(entry.candidate) || "unknown";
    const diagnostics = getFilterDiagnostics(entry.candidate);
    const passedChecks: string[] = Array.isArray(diagnostics?.filterPassedChecks) ? diagnostics.filterPassedChecks : Array.isArray(diagnostics?.passedChecks) ? diagnostics.passedChecks : [];
    const rescueHeavy = passedChecks.filter((check) => String(check).includes("rescue") || String(check).includes("borderline")).length >= 2;
    const row = laneQuality.get(lane) || { total: 0, rescueHeavy: 0 };
    row.total += 1;
    if (rescueHeavy) row.rescueHeavy += 1;
    laneQuality.set(lane, row);
  }
  const weakLanes = new Set(
    Array.from(laneQuality.entries())
      .filter(([, value]) => value.total >= 2 && value.rescueHeavy / value.total > 0.6)
      .map(([lane]) => lane)
  );
  const diversityBalanced = (() => {
    const out: Array<{ candidate: Candidate; breakdown: ScoreBreakdown }> = [];
    const laneBuckets = new Map<string, Array<{ candidate: Candidate; breakdown: ScoreBreakdown }>>();
    const facetCounts = new Map<string, number>();
    for (const entry of clusterBalanced) {
      if (weakLanes.has(laneFamilyForCandidate(entry.candidate) || "unknown")) continue;
      if (fantasySuppressed && laneFamilyForCandidate(entry.candidate) === "fantasy") {
        if (entry.breakdown.personalAffinityScore < 2 || entry.breakdown.toneScore < 1.4) continue;
      }
      const lane = laneFamilyForCandidate(entry.candidate) || "unknown";
      if (!laneBuckets.has(lane)) laneBuckets.set(lane, []);
      laneBuckets.get(lane)!.push(entry);
    }
    const eligibleLanes = new Set(
      Array.from(laneBuckets.entries())
        .filter(([, items]) => items.filter((it) => it.breakdown.personalAffinityScore >= 1.2 && it.breakdown.toneScore >= 0.8).length >= 2)
        .map(([lane]) => lane)
    );
    for (const entry of clusterBalanced) {
      const lane = laneFamilyForCandidate(entry.candidate) || "unknown";
      if (!eligibleLanes.has(lane)) continue;
      if (fantasySuppressed && lane === "fantasy") continue;
      const text = haystack(entry.candidate);
      const facet = candidateTasteFacet(entry.candidate);
      const existingFacetCount = facetCounts.get(facet) || 0;
      if (facet === "domestic_secret" && entry.breakdown.personalAffinityScore < 3.5) continue;
      if (existingFacetCount >= 2 && facet !== "general") continue;
      const tooSimilar = out.some((e) => {
        const t = haystack(e.candidate);
        const sharedSetting = /\bisolated|arctic|space|war|small town|boarding school\b/.test(text) && /\bisolated|arctic|space|war|small town|boarding school\b/.test(t);
        const sharedStructure = /\bcoming of age|investigation|survival|revenge|heist\b/.test(text) && /\bcoming of age|investigation|survival|revenge|heist\b/.test(t);
        const sharedFacet = candidateTasteFacet(e.candidate) === facet;
        return (sharedSetting && sharedStructure) || (sharedFacet && facet !== "general");
      });
      if (!tooSimilar || out.length < 3) {
        out.push(entry);
        facetCounts.set(facet, existingFacetCount + 1);
      }
    }
    return out;
  })();
  const authoredIntentScores = diversityBalanced
    .map((entry) => authoredIntentionalityScore(entry.candidate))
    .filter((score) => Number.isFinite(score));
  const authoredIntentFloor = authoredIntentScores.length
    ? Math.max(1.6, Math.min(...authoredIntentScores) - 0.2)
    : 1.6;
  const tasteShapeTargets = inferTasteShapeTargets(tasteProfile);
  if (tasteShapeTargets.length > 0) {
    const existingFacetCounts = new Map<string, number>();
    for (const entry of diversityBalanced) {
      const facet = candidateTasteFacet(entry.candidate);
      existingFacetCounts.set(facet, (existingFacetCounts.get(facet) || 0) + 1);
    }
    const missingFacets = tasteShapeTargets.filter(({ facet, weight }) =>
      (existingFacetCounts.get(facet) || 0) === 0 && weight >= 0.8
    );
    let injected = 0;
    for (const { facet } of missingFacets) {
      if (injected >= 1) break;
      const baselineFloor = diversityBalanced.length
        ? Math.min(...diversityBalanced.map((entry) => entry.breakdown.finalScore))
        : 0;
      const replacement = orderedAfterAi.find((entry) =>
        candidateTasteFacet(entry.candidate) === facet &&
        entry.breakdown.personalAffinityScore >= 2.8 &&
        entry.breakdown.toneScore >= 1.6 &&
        entry.breakdown.finalScore >= Math.max(18, baselineFloor - 2.5) &&
        authoredIntentionalityScore(entry.candidate) >= authoredIntentFloor
      );
      if (!replacement) continue;
      if (diversityBalanced.some((entry) => identityKey(entry.candidate) === identityKey(replacement.candidate))) continue;
      if (diversityBalanced.length >= MAX_RESULTS) {
        let replaceIndex = -1;
        let weakestScore = Number.POSITIVE_INFINITY;
        for (let i = 0; i < diversityBalanced.length; i += 1) {
          const row = diversityBalanced[i];
          const facetName = candidateTasteFacet(row.candidate);
          const isOverrepresented = (existingFacetCounts.get(facetName) || 0) > 1;
          if (!isOverrepresented) continue;
          if (row.breakdown.finalScore < weakestScore) {
            weakestScore = row.breakdown.finalScore;
            replaceIndex = i;
          }
        }
        if (replaceIndex >= 0 && replacement.breakdown.finalScore >= weakestScore - 1.5) {
          diversityBalanced.splice(replaceIndex, 1, replacement);
        } else {
          continue;
        }
      } else {
        diversityBalanced.push(replacement);
      }
      injected += 1;
    }
  }
  if (diversityBalanced.length < 3) {
    debugFinalLog("INSUFFICIENT_SIGNAL_STATE", { selectedAfterDiversity: diversityBalanced.length });
    return [];
  }
  const coherenceAnchor =
    [...diversityBalanced].sort((a, b) => b.breakdown.finalScore - a.breakdown.finalScore)[0];
  const coherentBalanced = coherenceAnchor
    ? diversityBalanced.filter((entry) =>
        (
          emotionalConceptualCoherenceScore(entry, coherenceAnchor) >= 2.5 &&
          authoredIntentionalityScore(entry.candidate) >= -1
        ) ||
        (
          entry.breakdown.finalScore >= coherenceAnchor.breakdown.finalScore - 2 &&
          authoredIntentionalityScore(entry.candidate) >= 2
        )
      )
    : diversityBalanced;
  if (coherentBalanced.length >= 3) {
    diversityBalanced.splice(0, diversityBalanced.length, ...coherentBalanced);
  }
  const prestigeFloored = diversityBalanced.filter((entry) =>
    authoredIntentionalityScore(entry.candidate) >= authoredIntentFloor ||
    entry.breakdown.finalScore >= (coherenceAnchor?.breakdown.finalScore ?? entry.breakdown.finalScore) - 1.2
  );
  if (prestigeFloored.length >= 3) {
    diversityBalanced.splice(0, diversityBalanced.length, ...prestigeFloored);
  }
  const clusterBreakdown: Record<string, number> = {};
  for (const entry of diversityBalanced) {
    const cluster = String((entry.candidate as any)?.rawDoc?.clusterId || (entry.candidate as any)?.clusterId || (entry.candidate as any)?.laneKind || "cluster:general");
    clusterBreakdown[cluster] = (clusterBreakdown[cluster] || 0) + 1;
  }
  debugFinalLog("CLUSTER CONTRIBUTION BREAKDOWN", clusterBreakdown);
  const selectedDocs = diversityBalanced
    .filter(({ candidate }) => !isHardReject(candidate).reject)
    .slice(0, MAX_RESULTS)
    .map(({ candidate, breakdown }) => withScores(candidate, breakdown, tasteProfile));
  return attachNearbyAlternativeReason(selectedDocs, orderedAfterAi);
}
