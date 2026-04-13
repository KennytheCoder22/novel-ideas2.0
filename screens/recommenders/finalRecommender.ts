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
  return true;
}

/* 🔥 HARD FILTER — THIS IS THE MAIN FIX */
function isLikelyNonFictionMeta(c: Candidate): boolean {
  const text = haystack(c);

  return (
    /guide|handbook|encyclopedia|history of|studies|analysis|criticism|review|digest/.test(text) ||
    /writers|writing|how to write|advisory/.test(text) ||
    /magazine|journal|bulletin|review/.test(text) ||
    /anthology|collection|stories\b/.test(text) ||
    /reference|companion|literature/.test(text) ||
    /publishers weekly|booklist|cambridge history|atlantic monthly/.test(text)
  );
}

function vibeBoost(c: Candidate, taste?: TasteProfile): number {
  if (!taste) return 0;

  const text = haystack(c);

  if ((taste.axes?.darkness || 0) > 0.2) {
    if (/dark|bleak|grim|violent|dystopian/.test(text)) {
      return 0.5;
    }
  }

  return 0;
}

function scoreQueryAlignment(c: Candidate): number {
  if (!c.queryTerms?.length) return 0;

  const text = haystack(c);

  const goodTerms = c.queryTerms.filter(
    t => t.length >= 4 && !['novel', 'fiction', 'adult'].includes(t)
  );

  let matches = 0;
  for (const term of goodTerms) {
    if (text.includes(term)) matches++;
  }

  return matches * 0.35;
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
  return score;
}

function agePenalty(c: Candidate): number {
  const year = Number(c.publicationYear || 0);
  if (!year) return 0;
  if (year < 1950) return -2;
  if (year < 1980) return -0.75;
  return 0;
}

function narrativeSignal(c: Candidate): number {
  const text = haystack(c);

  let score = 0;

  if (/novel|story/.test(text)) score += 0.6;
  if (/murder|investigation|family|survival|crime|secrets|identity/.test(text)) {
    score += 0.6;
  }

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

  const base = dedupe(candidates)
    .filter(isValidCandidate)
    .filter(c => !isLikelyNonFictionMeta(c)); // 🔥 CRITICAL

  const scored = base.map((c) => {
    const score =
      scoreBasicQuality(c) * 1.3 +
      scoreQueryAlignment(c) * 1.6 +
      scoreRungBoost(c) * 2.2 +
      vibeBoost(c, options.tasteProfile) +
      titleMatchPenalty(c) +
      agePenalty(c) +
      narrativeSignal(c);

    return { candidate: c, score };
  }).sort((a, b) => b.score - a.score);

  return scored.slice(0, 10).map(s => s.candidate.rawDoc as RecommendationDoc);
}