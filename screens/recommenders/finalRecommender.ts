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
  return [
    c.title,
    c.subtitle || '',
    c.author,
    c.publisher || '',
    c.description || '',
    ...(c.subjects || []),
    ...(c.genres || [])
  ].join(' ').toLowerCase();
}

function isValidCandidate(c: Candidate): boolean {
  return Boolean(c.title);
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

    if (currentRank < existingRank) {
      map.set(key, c);
      continue;
    }

    if (currentRank === existingRank) {
      const currentHasDescription = Boolean(c.description);
      const existingHasDescription = Boolean(existing.description);

      if (currentHasDescription && !existingHasDescription) {
        map.set(key, c);
        continue;
      }

      if (currentHasDescription === existingHasDescription && c.hasCover && !existing.hasCover) {
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

  if (ratings >= 10000) return 4;
  if (ratings >= 3000) return 3;
  if (ratings >= 1000) return 2;
  if (ratings >= 200) return 1;
  if (ratings >= 50) return 0.5;
  if (ratings > 0) return 0;

  return -1.5;
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

  if (isLikelyNonFictionMeta(c)) {
    return { pass: false, reason: 'non_fiction_meta', detail: 'non-fiction/meta heuristic hit' };
  }

  const trust = metadataTrust(c);

  if (trust < 3) {
    return { pass: false, reason: 'low_metadata_trust', detail: `metadataTrust=${trust}` };
  }

  const hasStrongSignal =
    (c.ratingCount || 0) >= 10 ||
    ((c.pageCount || 0) >= 150 && Boolean(c.description && c.description.length > 120));

  if (!hasStrongSignal) {
    return { pass: false, reason: 'low_metadata_trust', detail: 'no strong signal' };
  }

  if (!hasFictionSignals(c)) {
    return { pass: false, reason: 'weak_fiction_signal', detail: 'missing fiction/narrative signal' };
  }

  return { pass: true };
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

  if (/psychological/.test(text)) score += 2;
  if (/horror|dark|spooky/.test(text)) score += 1.5;
  if (/survival/.test(text)) score += 2;
  if (/thriller|mystery/.test(text)) score += 1.5;
  if (/fast paced|fast-paced/.test(text)) score += 1;
  if (/science fiction/.test(text)) score -= 4;
  if (/romance/.test(text)) score -= 1.5;

  if (taste) {
    const darkness = Number((taste as any).darkness || 0);
    const warmth = Number((taste as any).warmth || 0);
    const realism = Number((taste as any).realism || 0);

    if (/horror|dark|psychological|survival|thriller|mystery/.test(text)) {
      score += darkness * 3;
    }
    if (/hopeful|cozy|heartwarming|family|human connection/.test(text)) {
      score += warmth * 4;
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
    score += 5;
  } else if (/horror|thriller|mystery|dark/.test(text)) {
    score += 2.5;
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

  if (veryGenericTitles.some((rx) => rx.test(title))) return -7;

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

  const keywordHits =
    (text.match(/psychological/g)?.length || 0) +
    (text.match(/horror/g)?.length || 0) +
    (text.match(/dark/g)?.length || 0);

  if (keywordHits >= 3 && ratings < 50) {
    return -6;
  }

  if (keywordHits >= 2 && ratings < 10) {
    return -8;
  }

  return 0;
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

  return score;
}

function scoreCandidateDetailed(c: Candidate, taste?: TasteProfile): ScoreBreakdown {
  const queryScore = queryMatchScore(c) * 0.6;
  const metadataScore = metadataTrust(c) * 1.0;
  const authority = authorityScore(c) * 3.5;
  const behavior = behaviorScore(c, taste);
  const narrative = narrativeScore(c);
  const penalties = penaltyScore(c);
  const genericPenalty = genericTitlePenalty(c);
  const overfit = overfitPenalty(c);

  return {
    queryScore,
    metadataScore,
    authorityScore: authority,
    behaviorScore: behavior,
    narrativeScore: narrative,
    penaltyScore: penalties,
    genericTitlePenalty: genericPenalty,
    overfitPenalty: overfit,
    finalScore: queryScore + metadataScore + authority + behavior + narrative + penalties + genericPenalty + overfit,
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

export function finalRecommenderForDeck(
  candidates: Candidate[],
  _deckKey: DeckKey,
  _options: FinalRecommenderOptions = {}
): RecommendationDoc[] {
  const input = Array.isArray(candidates) ? candidates : [];
  const deduped = dedupe(input).filter(isValidCandidate);

  const rejected: QualityRejectRecord[] = [];
  const qualityPassed: Candidate[] = [];

  for (const candidate of deduped) {
    const verdict = passesQuality(candidate);
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

  const relaxedFallback = deduped.filter((c) => {
    if (isHardReject(c).reject) return false;

    const trust = metadataTrust(c);
    if (trust < 3) return false;

    const hasStrongSignal =
      (c.ratingCount || 0) >= 10 ||
      ((c.pageCount || 0) >= 150 && Boolean(c.description && c.description.length > 120));

    return hasStrongSignal;
  });

  const base = qualityPassed.length > 0 ? qualityPassed : relaxedFallback;

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

  for (const entry of ordered) {
    const author = normalize(entry.candidate.author);
    const count = authorCounts.get(author) || 0;

    if (count >= 1) continue;

    selected.push(entry);
    authorCounts.set(author, count + 1);

    if (selected.length >= 10) break;
  }

  return selected.map(({ candidate, breakdown }) => withScores(candidate, breakdown));
}
