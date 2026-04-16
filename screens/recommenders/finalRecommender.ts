import type { DeckKey, RecommendationDoc, TasteProfile } from './types';
import type { Candidate } from './normalizeCandidate';
import { type RecommenderLane } from './recommenderProfiles';

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
  if (raw.isbn || raw.isbn13 || raw.isbn10) score += 1;
  if (raw.lccn || raw.oclc || raw.googleBooksId || raw.id) score += 1;
  if (c.description) score += 1;
  if (c.hasCover) score += 1;
  if ((c.pageCount || 0) >= 120) score += 1;
  return score;
}

function scoreCandidate(c: Candidate): number {
  const text = haystack(c);
  let score = 0;

  score += Math.max(0, 10 - Math.min(9, evidenceRank(c)));
  score += metadataTrust(c);

  if (/science fiction|fantasy|horror|thriller|mystery|survival|dystopian/.test(text)) score += 3;\n  if (!/science fiction|fantasy|horror|thriller|dystopian|speculative/.test(text)) score -= 5;
  if (/novel|fiction/.test(text)) score += 2;
  if (/book\s*1\b|book\s*one\b|books?\s*\d+\s*-\s*\d+\b|boxed set|omnibus|collection|anthology/.test(text)) score -= 8;
  if (/guide|handbook|encyclopedia|studies|analysis|criticism|review|digest|journal|magazine/.test(text)) score -= 6;

  return score;
}

export function finalRecommenderForDeck(
  candidates: Candidate[],
  _deckKey: DeckKey,
  _options: FinalRecommenderOptions = {}
): RecommendationDoc[] {
  const deduped = dedupe(Array.isArray(candidates) ? candidates : []).filter(isValidCandidate);

  const strictBase = deduped.filter((c) => !isLikelyNonFictionMeta(c));
  const relaxedBase = deduped.filter((c) => metadataTrust(c) >= 2);

  const base = strictBase.length > 0 ? strictBase : relaxedBase;

  const ordered = [...base].sort((a, b) => {
    const scoreDiff = scoreCandidate(b) - scoreCandidate(a);
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

  return ordered.slice(0, 10).map((c) => c.rawDoc as RecommendationDoc);
}