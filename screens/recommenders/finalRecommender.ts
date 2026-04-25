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
  personalAffinityScore: number;
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
    /science fiction|fantasy|horror|thriller|mystery|survival|dystopian|speculative|suspense|crime|detective|romance|historical fiction|historical novel|period fiction/.test(text) ||
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
 /\bbraille books?\b/,
 /\bcumulated fiction index\b/,
 /\btechnique of the mystery story\b/,
 /\breaders?\s+advisory\b/,
 /\bguide to genre fiction\b/,
 /\bmammoth book\b/,
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
    /\blibrary of congress\b/,
    /\bnational library service\b/,
    /\breaders?\s+advisory\b/,
    /\bgenre fiction\b/,
    /\bfaith-based domestic suspense\b/,
    /\bchristian fiction\b/,
    /\bforbidden love\b/,
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

  const filterSignals = filterSignalScore(c);
  const isOL = isOpenLibraryCandidate(c);

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

function thrillerSessionFit(c: Candidate): number {
  const text = haystack(c);
  let score = 0;

  if (/\bthriller\b|\bsuspense\b|\bpsychological\b|\bcrime\b|\bmurder\b|\bkiller\b|\bserial killer\b|\bdetective\b|\binvestigation\b|\bcase\b|\bmissing\b|\bdisappearance\b|\bfbi\b|\bprocedural\b|\bnoir\b|\bobsession\b/.test(text)) score += 4;
  if (/\bred dragon\b|\bmr\.? mercedes\b|\byou\b|\bgone girl\b|\bsharp objects\b|\bdark places\b|\bthe silent patient\b|\bthe silence of the lambs\b|\bthe girl on the train\b/.test(text)) score += 5;
  if (/\bpsychological thriller\b|\bdomestic suspense\b|\bcrime thriller\b|\bserial killer\b|\bcat and mouse\b/.test(text)) score += 3;
  if (/\bcozy mystery\b|\bculinary mystery\b|\bgentle mystery\b|\bcomfort read\b/.test(text)) score -= 5;
  if (/\btrue crime\b|\bnonfiction\b|\bguide\b|\bhandbook\b|\bcriticism\b|\banalysis\b/.test(text)) score -= 6;

  return score;
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
  return Math.max(-14, Math.min(18, (positiveScore - negativeScore + traitScore + laneBonus) * Math.max(0.35, confidence)));
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
  const sessionFit = explicitLaneForCandidate(c) === "mystery" ? mysterySessionFit(c) : thrillerSessionFit(c);
  const personalAffinity = twentyQPersonalAffinityScore(c, taste);
  const openLibraryRecoveredBoost =
    isOpenLibraryCandidate(c) && passesOpenLibrarySelectionFloor(c) ? 6 : 0;

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
    personalAffinityScore: personalAffinity,
    finalScore: queryScore + metadataScore + authority + behavior + narrative + penalties + genericPenalty + overfit + anchor + filterSignals + sessionFit + personalAffinity + openLibraryRecoveredBoost,
  };
}

function withScores(c: Candidate, breakdown: ScoreBreakdown, taste?: TasteProfile): RecommendationDoc {
  const rawDoc = ((c.rawDoc || {}) as RecommendationDoc) || ({} as RecommendationDoc);
  const personalFitReasons = buildPersonalFitReasons(c, taste);
  return {
    ...rawDoc,
    preFilterScore: breakdown.finalScore,
    postFilterScore: breakdown.finalScore,
    scoreBreakdown: breakdown,
    personalFitReasons,
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

function seedHistoricalRungDiversity(
  pool: Array<{ candidate: Candidate; breakdown: ScoreBreakdown }>,
  selected: Array<{ candidate: Candidate; breakdown: ScoreBreakdown }>,
  authorCounts: Map<string, number>,
  limit: number
): Array<{ candidate: Candidate; breakdown: ScoreBreakdown }> {
  const hasHistorical = pool.some((entry) => isHistoricalCandidate(entry.candidate));
  if (!hasHistorical) return selected;

  for (const rung of [1, 2, 3]) {
    if (selected.length >= limit) break;

    const pick = pool.find((entry) => {
      if (!isHistoricalCandidate(entry.candidate)) return false;
      if (evidenceRank(entry.candidate) !== rung) return false;
      return canTakeCandidate(entry.candidate, selected, authorCounts);
    });

    if (!pick) continue;

    selected.push(pick);
    const author = normalize(pick.candidate.author);
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

  const base = qualityPassed.length > 0 ? qualityPassed : relaxedFallback.length >= 5 ? relaxedFallback : qualityPassed.slice(0, 10);

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

  seedHistoricalRungDiversity(ordered, selected, authorCounts, MAX_RESULTS);
  pickFromPool(ordered, selected, authorCounts, MAX_RESULTS);

  return selected.map(({ candidate, breakdown }) => withScores(candidate, breakdown, tasteProfile));
}
