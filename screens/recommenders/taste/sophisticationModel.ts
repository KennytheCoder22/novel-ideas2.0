type MinimalTasteProfile = { axes?: Record<string, number>; confidence?: number } | undefined;
import type { RecommenderLane } from '../recommenderProfiles';
import type { Candidate } from '../normalizeCandidate';

export type SophisticationLevel = {
  score: number;
  confidence: number;
  reasons: string[];
};

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function textOfCandidate(candidate: Candidate): string {
  return [
    candidate.title,
    candidate.subtitle || '',
    candidate.description || '',
    candidate.publisher || '',
    ...candidate.subjects,
    ...candidate.genres,
  ].filter(Boolean).join(' | ').toLowerCase();
}

export function estimateReaderSophisticationFromTaste(
  taste: MinimalTasteProfile,
  lane: RecommenderLane,
): SophisticationLevel {
  const axes: Record<string, number> = (taste?.axes || {}) as Record<string, number>;
  const complexity = Number(axes.complexity || 0);
  const ideaDensity = Number(axes.ideaDensity || 0);
  const characterFocus = Number(axes.characterFocus || 0);
  const pacing = Number(axes.pacing || 0);
  const realism = Number(axes.realism || 0);
  const confidence = clamp01(Number(taste?.confidence || 0));

  let raw = 0.5;
  raw += complexity * 0.2;
  raw += ideaDensity * 0.18;
  raw += characterFocus * 0.07;
  raw += realism * 0.04;
  raw -= pacing * 0.09;

  if (lane === 'kids') raw = Math.min(raw, 0.62);
  if (lane === 'preTeen') raw = Math.min(raw, 0.72);

  const reasons: string[] = [];
  if (complexity > 0.2) reasons.push('higher complexity signal');
  if (ideaDensity > 0.2) reasons.push('idea-driven signal');
  if (pacing > 0.2) reasons.push('faster pacing preference');

  return {
    score: clamp01(raw),
    confidence,
    reasons,
  };
}

export function estimateCandidateSophistication(
  candidate: Candidate,
  lane: RecommenderLane,
): SophisticationLevel {
  const text = textOfCandidate(candidate);
  let raw = 0.42;
  const reasons: string[] = [];

  const highSignals = [
    /\b(literary|lyrical|nuanced|layered|challenging|philosophical|meditative|experimental|nonlinear|non-linear|complex|intricate)\b/,
    /\b(booker|pulitzer|national book award|nebula|hugo|award[-\s]?winning)\b/,
  ];
  const lowSignals = [
    /\b(page[-\s]?turner|fast[-\s]?paced|action[-\s]?packed|high[-\s]?stakes|quick read|simple prose|accessible)\b/,
    /\b(younger readers|juvenile fiction|chapter book|beginning reader)\b/,
  ];

  for (const pat of highSignals) {
    if (pat.test(text)) {
      raw += 0.16;
      reasons.push('high-complexity metadata');
    }
  }
  for (const pat of lowSignals) {
    if (pat.test(text)) {
      raw -= 0.12;
      reasons.push('accessibility metadata');
    }
  }

  if (candidate.pageCount >= 420) raw += 0.07;
  else if (candidate.pageCount > 0 && candidate.pageCount <= 160) raw -= 0.05;

  if (candidate.averageRating >= 4.2 && candidate.ratingCount >= 200) raw += 0.03;
  if (candidate.formatCategory === 'manga' || candidate.formatCategory === 'comic') raw -= 0.04;

  if (lane === 'kids') raw = Math.min(raw, 0.65);
  else if (lane === 'preTeen') raw = Math.min(raw, 0.78);

  const confidence = clamp01(
    0.25 +
      (candidate.description ? 0.2 : 0) +
      (candidate.subjects.length ? 0.2 : 0) +
      (candidate.pageCount ? 0.1 : 0) +
      (candidate.ratingCount > 0 ? 0.1 : 0)
  );

  return {
    score: clamp01(raw),
    confidence,
    reasons,
  };
}

export function scoreSophisticationAlignment(
  reader: SophisticationLevel,
  candidate: SophisticationLevel,
): number {
  const distance = Math.abs(reader.score - candidate.score);
  const base = 1 - distance;
  const confidence = 0.45 + ((reader.confidence + candidate.confidence) / 2) * 0.55;
  return (base * 2 - 1) * confidence;
}
