type MinimalTasteProfile = { axes?: Record<string, number>; confidence?: number } | undefined;
import type { RecommenderLane } from '../recommenderProfiles';

export type SophisticationLevel = {
  score: number;
  confidence: number;
  reasons: string[];
};

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
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
