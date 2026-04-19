import type { DeckKey, RecommendationDoc, TasteProfile } from './types';
import type { Candidate } from './normalizeCandidate';
import { type RecommenderLane } from './recommenderProfiles';

export type FinalRecommenderOptions = {
  lane?: RecommenderLane;
  deckKey?: DeckKey;
  tasteProfile?: TasteProfile;
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
  | 'weak_fiction_signal';

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

  if (ratings >= 10000) return 8;
  if (ratings >= 3000) return 6;
  if (ratings >= 1000) return 5;
  if (ratings >= 200) return 3;
  if (ratings >= 50) return 1.5;
  if (ratings >= 10) return 0;
  if (ratings > 0) return -4;

  return -4;
}

function hasFictionSignals(c: Candidate): boolean {
  const text = haystack(c);
  return (
    /science fiction|fantasy|horror|thriller|mystery|survival|dystopian|speculative|suspense|crime|detective|romance/.test(text) ||
    /novel|fiction|manga|graphic novel|comic/.test(text) ||
    /follows|tells the story|story of|when .* discovers|investigation|journey/.test(text)
  );
}

function isHardReject(c: Candidate): { reject: boolean; reason?: QualityRejectReason; detail?: string } {
  const title = normalize(c.title);
  const publisher = normalize(c.publisher);
  const text = haystack(c);

  if (!title) return { reject: true, reason: 'missing_title', detail: 'empty title' };
  if (!normalize(c.author) || normalize(c.author) === 'unknown') {
    return { reject: true, reason: 'missing_author', detail: 'missing or unknown author' };
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
    /\bstudy aids?\b/,
    /\bliterary criticism\b/,
    /\breference\b/,
    /\bbooks and reading\b/,
    /\bpublishing\b/,
    /\bperiodicals?\b/,
    /\bnonfiction\b/,
    /\bbiography\b/,
    /\bmemoir\b/,
    /\bexplores?\b/,
    /\bexamines?\b/,
    /\banalyzes?\b/,
    /\bguide to\b/,
    /\bhow to\b/,
    /\blearn how to\b/,
    /\bwritten for students\b/,
    /\btextbook\b/,
    /\bworkbook\b/,
    /\bstudy guide\b/
  ];

  if (hardRejectTextPatterns.some((rx) => rx.test(text))) {
    return { reject: true, reason: 'hard_reject_text', detail: text.slice(0, 180) };
  }

  if (/\banthology\b|\bcollection\b|\bomnibus\b|\bboxed set\b|\bbooks?\s*\d+\s*-\s*\d+\b/.test(text)) {
    return { reject: true, reason: 'non_fiction_meta', detail: 'collection or omnibus signal' };
  }

  return { reject: false };
}

function passesQuality(c: Candidate): { pass: boolean; reason?: QualityRejectReason; detail?: string } {
  const hardReject = isHardReject(c);
  if (hardReject.reject) return { pass: false, reason: hardReject.reason, detail: hardReject.detail };

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

  if (trust < 2 && !hasShapeSignal) {
    return { pass: false, reason: 'low_metadata_trust', detail: `metadataTrust=${trust}` };
  }

  const hasStrongSignal =
    hasShapeSignal ||
    (c.ratingCount || 0) >= 10;

  if (!hasStrongSignal) {
    return { pass: false, reason: 'low_metadata_trust', detail: 'no strong bibliographic or narrative shape' };
  }

  if (!fictionSignals) {
    return { pass: false, reason: 'weak_fiction_signal', detail: 'missing fiction/narrative signal' };
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
  if (passedChecks.includes('passed_shape_gate')) score += 2;

  if (isOpenLibraryCandidate(c) && flags.authorAffinity) score += 6;
  if (isOpenLibraryCandidate(c) && passedChecks.includes('author_affinity_horror_recovery')) score += 6;
  if (isOpenLibraryCandidate(c) && passedChecks.includes('openlibrary_horror_recovery')) score += 4;

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
  return Math.max(0, 10 - rung * 2);
}

function behaviorScore(c: Candidate, taste?: TasteProfile): number {
  const text = haystack(c);
  let score = 0;

  if (/psychological/.test(text)) score += 1;
  if (/horror|dark|spooky/.test(text)) score += 0.75;
  if (/survival/.test(text)) score += 1;
  if (/thriller|mystery/.test(text)) score += 0.75;
  if (/fast paced|fast-paced/.test(text)) score += 1;
  if (/science fiction/.test(text)) score -= 4;
  if (/romance/.test(text)) score -= 1.5;

  if (taste) {
    const darkness = Number((taste as any).darkness || 0);
    const warmth = Number((taste as any).warmth || 0);
    const realism = Number((taste as any).realism || 0);

    if (/horror|dark|psychological|survival|thriller|mystery/.test(text)) {
      score += darkness * 1.5;
    }
    if (/hopeful|cozy|heartwarming|family|human connection/.test(text)) {
      score += warmth * 3;
    }
    if (/science fiction|space opera|futuristic/.test(text)) {
      score -= Math.max(0, -realism) * 4;
    }
  }

  return score;
}

function narrativeScore(c: Candidate): number {
  const text = haystack(c);
  let score = 0;

  if (/psychological horror|psychological thriller/.test(text)) {
    score += 3;
  } else if (/horror|thriller|mystery|dark/.test(text)) {
    score += 1.25;
  }

  if (/novel|fiction/.test(text)) score += 1.5;
  if (/follows|tells the story|story of|when .* discovers|investigation|journey/.test(text)) {
    score += 1.5;
  }

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


function anchorBoost(c: Candidate): number {
  const text = haystack(c);
  const title = normalize(c.title);
  const author = normalize(c.author);
  const ratings = c.ratingCount || 0;

  let score = 0;

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
    thriller: [
      'gillian flynn',
      'tana french',
      'dennis lehane',
      'thomas harris',
      'john le carre',
      'lee child',
      'patricia highsmith',
      'ruth ware',
      'paula hawkins',
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
    romance: [
      'jane austen',
      'nicholas sparks',
      'colleen hoover',
      'emily henry',
      'julia quinn',
    ],
  };

  function matchesAuthor(list: string[]): boolean {
    return list.some((name) => author.includes(name));
  }

  if (isHorror && matchesAuthor(AUTHOR_MAP.horror)) score += 14;
  else if (isThriller && matchesAuthor(AUTHOR_MAP.thriller)) score += 12;
  else if (isSpeculative && matchesAuthor(AUTHOR_MAP.speculative)) score += 10;
  else if (isRomance && matchesAuthor(AUTHOR_MAP.romance)) score += 8;

  if (/cujo/.test(title)) score += 10;
  if (/the long walk/.test(title)) score += 10;
  if (/haunting of hill house/.test(title)) score += 10;
  if (/the exorcist/.test(title)) score += 10;
  if (/dracula/.test(title)) score += 10;
  if (/frankenstein/.test(title)) score += 10;
  if (/pet sematary/.test(title)) score += 10;
  if (/the terror/.test(title)) score += 8;
  if (/the turn of the screw/.test(title)) score += 8;

  if (ratings >= 5000) score += 6;
  else if (ratings >= 1000) score += 4;
  else if (ratings >= 200) score += 2;

  if (isHorror && /psychological|survival|haunted house/.test(text)) score += 3;
  if (isThriller && /psychological|domestic|legal/.test(text)) score += 2;

  return score;
}

function penaltyScore(c: Candidate): number {
  const text = haystack(c);
  let score = 0;

  if (/book\s*1\b|book\s*one\b/.test(text)) score -= 2;
  if (/books?\s*\d+\s*-\s*\d+\b|boxed set|omnibus|collection|anthology/.test(text)) score -= 5;
  if (/guide|handbook|encyclopedia|studies|analysis|criticism|review|digest|journal|magazine/.test(text)) {
    score -= 6;
  }

  const trust = metadataTrust(c);
  if (trust <= 2 && !(c.ratingCount || 0)) score -= 5;
  if (trust >= 4) score += 2;

  const source = String(c.source || '').toLowerCase();
  const isGoogleBooks = source === 'googlebooks';
  const flags = getFilterDiagnostics(c)?.filterFlags || getFilterDiagnostics(c)?.flags || {};

  if (
    isGoogleBooks &&
    (c.ratingCount || 0) < 5 &&
    trust <= 3 &&
    !flags.authorAffinity
  ) {
    score -= 8;
  }

  return score;
}

function scoreCandidateDetailed(c: Candidate, taste?: TasteProfile): ScoreBreakdown {
  const queryScore = queryMatchScore(c) * 0.35;
  const metadataScore = metadataTrust(c) * 0.75;
  const authority = authorityScore(c) * 4.5;
  const behavior = behaviorScore(c, taste);
  const narrative = narrativeScore(c);
  const penalties = penaltyScore(c);
  const genericPenalty = genericTitlePenalty(c);
  const overfit = overfitPenalty(c);
  const anchor = anchorBoost(c);
  const filterSignals = filterSignalScore(c);

  return {
    queryScore,
    metadataScore,
    authorityScore: authority,
    behaviorScore: behavior,
    narrativeScore: narrative,
    penaltyScore: penalties,
    genericTitlePenalty: genericPenalty,
    overfitPenalty: overfit,
    anchorBoost: anchor,
    filterSignalScore: filterSignals,
    finalScore: queryScore + metadataScore + authority + behavior + narrative + penalties + genericPenalty + overfit + anchor + filterSignals,
  };
}

function withScores(c: Candidate, breakdown: ScoreBreakdown): RecommendationDoc {
  const rawDoc = ((c.rawDoc || {}) as RecommendationDoc) || ({} as RecommendationDoc);
  return {
    ...rawDoc,
    preFilterScore: breakdown.finalScore,
    postFilterScore: breakdown.finalScore,
    scoreBreakdown: breakdown,
    queryText: (c as any).queryText ?? (rawDoc as any).queryText,
    queryRung: (c as any).queryRung ?? (rawDoc as any).queryRung,
  } as RecommendationDoc;
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

function canTakeCandidate(
  candidate: Candidate,
  selected: Array<{ candidate: Candidate; breakdown: ScoreBreakdown }>,
  authorCounts: Map<string, number>
): boolean {
  const author = normalize(candidate.author);
  const count = authorCounts.get(author) || 0;
  if (count >= 1) return false;

  if (isOpenLibraryCandidate(candidate) && !passesOpenLibrarySelectionFloor(candidate)) {
    return false;
  }

  return !selected.some((entry) => identityKey(entry.candidate) === identityKey(candidate));
}

function pickFromPool(
  pool: Array<{ candidate: Candidate; breakdown: ScoreBreakdown }>,
  selected: Array<{ candidate: Candidate; breakdown: ScoreBreakdown }>,
  authorCounts: Map<string, number>,
  limit: number
): Array<{ candidate: Candidate; breakdown: ScoreBreakdown }> {
  for (const entry of pool) {
    if (selected.length >= limit) break;
    if (!canTakeCandidate(entry.candidate, selected, authorCounts)) continue;

    selected.push(entry);
    const author = normalize(entry.candidate.author);
    authorCounts.set(author, (authorCounts.get(author) || 0) + 1);
  }

  return selected;
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

  const base = qualityPassed.length > 0 ? qualityPassed : relaxedFallback.length > 0 ? relaxedFallback : deduped.slice(0, 20);

  buildDebug(input.length, deduped.length, base, rejected);

  const { tasteProfile } = _options;
  const scored = base.map((candidate) => ({
    candidate,
    breakdown: scoreCandidateDetailed(candidate, tasteProfile),
  }));

  const ordered = [...scored].sort((a, b) => {
    const scoreDiff = b.breakdown.finalScore - a.breakdown.finalScore;
    if (scoreDiff !== 0) return scoreDiff;

    const rungDiff = evidenceRank(a.candidate) - evidenceRank(b.candidate);
    if (rungDiff !== 0) return rungDiff;

    const aHasDescription = a.candidate.description ? 1 : 0;
    const bHasDescription = b.candidate.description ? 1 : 0;
    if (aHasDescription !== bHasDescription) return bHasDescription - aHasDescription;

    const aHasCover = a.candidate.hasCover ? 1 : 0;
    const bHasCover = b.candidate.hasCover ? 1 : 0;
    return bHasCover - aHasCover;
  });

  const selected: Array<{ candidate: Candidate; breakdown: ScoreBreakdown }> = [];
  const authorCounts = new Map<string, number>();
  const MAX_RESULTS = 10;
  const MIN_OPEN_LIBRARY = 3;

  const openLibraryPool = ordered.filter((entry) => isOpenLibraryCandidate(entry.candidate));
  const nonOpenLibraryPool = ordered.filter((entry) => !isOpenLibraryCandidate(entry.candidate));

  pickFromPool(openLibraryPool, selected, authorCounts, Math.min(MIN_OPEN_LIBRARY, MAX_RESULTS));
  pickFromPool(nonOpenLibraryPool, selected, authorCounts, MAX_RESULTS);
  pickFromPool(openLibraryPool, selected, authorCounts, MAX_RESULTS);
  pickFromPool(ordered, selected, authorCounts, MAX_RESULTS);

  return selected.map(({ candidate, breakdown }) => withScores(candidate, breakdown));
}
