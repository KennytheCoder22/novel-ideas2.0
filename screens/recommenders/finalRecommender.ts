import type { DeckKey, RecommendationDoc, TasteProfile } from './types';
import type { Candidate } from './normalizeCandidate';
import { titleMatchPenalty } from './normalizeCandidate';
import {
  laneFromDeckKey,
  recommenderProfiles,
  type RecommenderLane,
  type RecommenderProfile
} from './recommenderProfiles';

export type FinalRecommenderOptions = {
  lane?: RecommenderLane;
  deckKey?: DeckKey;
  tasteProfile?: TasteProfile;
  profileOverride?: Partial<RecommenderProfile>;
  priorRecommendedIds?: string[];
  priorRecommendedKeys?: string[];
  priorAuthors?: string[];
  priorSeriesKeys?: string[];
  priorRejectedIds?: string[];
  priorRejectedKeys?: string[];
};

type CandidateDiagnostics = {
  source: string;
  preFilterScore?: number;
  postFilterScore?: number;
  rejectionReason?: string;
  tasteAlignment?: number;
  queryAlignment?: number;
  rungBoost?: number;
};

type CandidateWithDiagnostics = Candidate & {
  diagnostics?: CandidateDiagnostics;
};

function normalize(value: unknown): string {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function identityKey(c: Candidate): string {
  return `${normalize(c.title)}|${normalize(c.author)}`;
}

function haystack(c: Candidate): string {
  return [
    c.title,
    c.description || '',
    ...(c.subjects || []),
    ...(c.genres || [])
  ].join(' ').toLowerCase();
}

function isValidCandidate(c: Candidate): boolean {
  if (!c.title) return false;

  const text = haystack(c);

  if (text.includes('summary')) return false;
  if (text.includes('analysis')) return false;
  if (text.includes('study guide')) return false;

  return true;
}

function vibeBoost(c: Candidate, taste?: TasteProfile): number {
  if (!taste) return 0;

  let score = 0;
  const text = haystack(c);

  if ((taste.axes?.darkness || 0) > 0.2) {
    if (/dark|bleak|grim|violent|dystopian/.test(text)) {
      score += 0.5;
    }
  }

  return score;
}

function scoreQueryAlignment(c: Candidate): number {
  if (!c.queryTerms?.length) return 0;

  const text = haystack(c);

  let matches = 0;
  for (const term of c.queryTerms) {
    if (text.includes(term)) matches++;
  }

  return matches * 0.2; // weaker + distributed
}

function scoreRungBoost(c: Candidate): number {
  const r = Number(c.queryRung);
  if (r === 0) return 2;
  if (r === 1) return 1;
  if (r === 2) return 0.5;
  return 0;
}

function scoreBasicQuality(c: Candidate): number {
  let score = 0;

  if (c.description) score += 1;
  if (c.hasCover) score += 0.5;
  if (c.ratingCount > 0) score += Math.log10(c.ratingCount + 1);

  return score;
}

function dedupe(candidates: Candidate[]): Candidate[] {
  const map = new Map<string, Candidate>();

  for (const c of candidates) {
    const key = identityKey(c);
    const existing = map.get(key);

    if (!existing || scoreBasicQuality(c) > scoreBasicQuality(existing)) {
      map.set(key, c);
    }
  }

  return Array.from(map.values());
}

export function finalRecommenderForDeck(
  candidates: Candidate[],
  deckKey: DeckKey,
  options: FinalRecommenderOptions = {}
): RecommendationDoc[] {

  const lane = options.lane ?? laneFromDeckKey(options.deckKey ?? deckKey);
  const profile: RecommenderProfile = {
    ...recommenderProfiles[lane],
    ...(options.profileOverride || {}),
  };

  const base = dedupe(candidates).filter(isValidCandidate);

  const scored = base.map((c) => {
    const queryAlignment = scoreQueryAlignment(c);
    const rungBoost = scoreRungBoost(c);
    const quality = scoreBasicQuality(c);

const score =
  quality * 1.5 +
  queryAlignment * 1.2 +
  rungBoost * 2.5 +
  vibeBoost(c, options.tasteProfile) +
  titleMatchPenalty(c);

    const candidate: CandidateWithDiagnostics = {
      ...c,
      diagnostics: {
        source: c.source || 'unknown',
        preFilterScore: score,
        postFilterScore: score,
        queryAlignment,
        rungBoost,
      }
    };

    return { candidate, score };
  }).sort((a, b) => b.score - a.score);

  const selected: CandidateWithDiagnostics[] = [];
  const seen = new Set<string>();

  for (const entry of scored) {
    if (selected.length >= 10) break;

    const key = identityKey(entry.candidate);
    if (seen.has(key)) continue;

    selected.push(entry.candidate);
    seen.add(key);
  }

  return selected.map((c) => ({
    ...(c.rawDoc as RecommendationDoc),
    diagnostics: c.diagnostics
  }));
}