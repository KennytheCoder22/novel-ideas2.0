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

  if (ratings >= 5000) return 8;
  if (ratings >= 1000) return 6;
  if (ratings >= 200) return 4;
  if (ratings >= 50) return 2;

  return -2;
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

const SCORING = {
  queryMatch: 1.5,
  metadata: 1.2,
  narrative: 1.2,
  behavior: 2.0,
  authority: 2.5,
  strongTrustBonus: 4,
  weakTrustPenalty: -5,
  seriesPenalty: -4,
  metaPenalty: -6,
} as const;

function queryMatchScore(c: Candidate): number {
  const rung = evidenceRank(c);
  if (!Number.isFinite(rung) || rung >= 999) return 0;
  return Math.max(0, 10 - rung * 2);
}

function behaviorScore(c: Candidate, taste?: TasteProfile): number {
  if (!taste) return 0;

  const text = haystack(c);
  let score = 0;

  if (/horror|dark/.test(text)) score += 3;
  if (/psychological/.test(text)) score += 4;
  if (/survival/.test(text)) score += 2;
  if (/thriller|mystery/.test(text)) score += 2;

  if (/science fiction/.test(text)) score -= 5;

  return score;
}

function scoreCandidate(c: Candidate, taste?: TasteProfile): number {
  const text = haystack(c);
  const trust = metadataTrust(c);
  let score = 0;

  score += queryMatchScore(c) * SCORING.queryMatch;
  score += trust * SCORING.metadata;
  score += authorityScore(c) * SCORING.authority;
  score += behaviorScore(c, taste) * SCORING.behavior;

  if (/psychological horror|psychological thriller/.test(text)) {
    score += 5 * SCORING.narrative;
  } else if (/horror|thriller|mystery|dark/.test(text)) {
    score += 2 * SCORING.narrative;
  }
  if (/novel|fiction/.test(text)) score += 2 * SCORING.narrative;
  if (/follows|tells the story|story of|when .* discovers|investigation|journey/.test(text)) {
    score += 2 * SCORING.narrative;
  }

  if (/book\s*1\b|book\s*one\b|books?\s*\d+\s*-\s*\d+\b|boxed set|omnibus|collection|anthology/.test(text)) {
    score += SCORING.seriesPenalty;
  }

  if (/guide|handbook|encyclopedia|studies|analysis|criticism|review|digest|journal|magazine/.test(text)) {
    score += SCORING.metaPenalty;
  }

  if (trust <= 2 && !c.ratingCount) score += SCORING.weakTrustPenalty;
  if (trust >= 4) score += SCORING.strongTrustBonus;

  return score;
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
      (c.pageCount || 0) >= 150 ||
      Boolean(c.description && c.description.length > 120);

    return hasStrongSignal;
  });

  const base = qualityPassed.length > 0 ? qualityPassed : relaxedFallback;

  buildDebug(input.length, deduped.length, base, rejected);

  const { tasteProfile } = _options;

  const ordered = [...base].sort((a, b) => {
    const scoreDiff = scoreCandidate(b, tasteProfile) - scoreCandidate(a, tasteProfile);
    if (scoreDiff !== 0) return scoreDiff;

    const rungDiff = evidenceRank(a) - evidenceRank(b);
    if (rungDiff !== 0) return rungDiff;

    const aHasDescription = a.description ? 1 : 0;
    const bHasDescription = b.description ? 1 : 0;
    if (aHasDescription !== bHasDescription) return bHasDescription - aHasDescription;

    const aHasCover = a.hasCover ? 1 : 0;
    const bHasCover = b.hasCover ? 1 : 0;
    return bHasCover - aHasCover;
  });

  const selected: Candidate[] = [];
  const authorCounts = new Map<string, number>();

  for (const candidate of ordered) {
    const author = normalize(candidate.author);
    const count = authorCounts.get(author) || 0;

    if (count >= 1) continue;

    selected.push(candidate);
    authorCounts.set(author, count + 1);

    if (selected.length >= 10) break;
  }

  return selected.map((c) => c.rawDoc as RecommendationDoc);
}
