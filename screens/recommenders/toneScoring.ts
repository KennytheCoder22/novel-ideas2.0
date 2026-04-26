import type { TasteProfile } from './types';
import type { Candidate } from './normalizeCandidate';

export type ToneVector = {
  darkness: number;
  intensity: number;
  warmth: number;
  realism: number;
  complexity: number;
  characterFocus: number;
  humor: number;
};

const AXIS_KEYS: Array<keyof ToneVector> = [
  'darkness',
  'intensity',
  'warmth',
  'realism',
  'complexity',
  'characterFocus',
  'humor',
];

function clamp(value: number, min = -1, max = 1): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(min, Math.min(max, value));
}

function normalizeAxis(value: unknown): number | null {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;

  // Most NovelIdeas taste axes are expected to be -1..1. This also accepts
  // older 0..1 or 0..5-ish shapes without making the score explode.
  if (n >= -1 && n <= 1) return n;
  if (n >= 0 && n <= 5) return clamp((n - 2.5) / 2.5);
  return clamp(n / 10);
}

function wordHits(text: string, patterns: RegExp[]): number {
  return patterns.reduce((sum, rx) => sum + (rx.test(text) ? 1 : 0), 0);
}

function haystack(candidate: Candidate): string {
  const raw: any = candidate.rawDoc || {};
  const diagnostics = raw.diagnostics || {};
  const subjects = Array.isArray(candidate.subjects) ? candidate.subjects : [];
  const genres = Array.isArray(candidate.genres) ? candidate.genres : [];
  const rawSubjects = Array.isArray((raw as any).subject) ? (raw as any).subject : [];
  const rawCategories = Array.isArray((raw as any).categories) ? (raw as any).categories : [];

  return [
    candidate.title,
    candidate.subtitle,
    candidate.author,
    candidate.publisher,
    candidate.description,
    candidate.queryText,
    candidate.queryFamily,
    raw.queryText,
    diagnostics.queryText,
    diagnostics.queryFamily,
    diagnostics.filterFamily,
    ...subjects,
    ...genres,
    ...rawSubjects,
    ...rawCategories,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

export function computeCandidateToneVector(candidate: Candidate): ToneVector {
  const text = haystack(candidate);
  const vector: ToneVector = {
    darkness: 0,
    intensity: 0,
    warmth: 0,
    realism: 0,
    complexity: 0,
    characterFocus: 0,
    humor: 0,
  };

  vector.darkness += wordHits(text, [
    /\bdark\b/, /\bbleak\b/, /\bgrim\b/, /\bhorror\b/, /\bhaunt(?:ed|ing)?\b/,
    /\bghost\b/, /\bsupernatural\b/, /\bdread\b/, /\bterror\b/, /\bviolent\b/,
    /\bserial killer\b/, /\bnoir\b/, /\bdystopian\b/, /\bpost[-\s]?apocalyptic\b/,
  ]) * 0.22;
  vector.darkness -= wordHits(text, [
    /\bcozy\b/, /\bcosy\b/, /\bheartwarming\b/, /\bcomfort(?:ing)?\b/, /\bwhimsical\b/,
    /\bgentle\b/, /\blighthearted\b/, /\buplifting\b/,
  ]) * 0.28;

  vector.intensity += wordHits(text, [
    /\bfast[-\s]?paced\b/, /\bpage[-\s]?turner\b/, /\bthriller\b/, /\bsuspense\b/,
    /\bhigh stakes\b/, /\bsurvival\b/, /\bchase\b/, /\bmanhunt\b/, /\bfugitive\b/,
    /\bserial killer\b/, /\babduction\b/, /\bmissing\b/, /\bdisappearance\b/,
    /\binvestigation\b/, /\bcrime\b/, /\baction\b/,
  ]) * 0.18;
  vector.intensity -= wordHits(text, [
    /\bquiet\b/, /\bslow burn\b/, /\bgentle\b/, /\bcozy\b/, /\bslice of life\b/,
    /\breflective\b/, /\bmeditative\b/,
  ]) * 0.20;

  vector.warmth += wordHits(text, [
    /\bhopeful\b/, /\buplifting\b/, /\bheartwarming\b/, /\bfamily\b/, /\bfriendship\b/,
    /\bhuman connection\b/, /\bcommunity\b/, /\btender\b/, /\bemotional\b/,
    /\bcompassion\b/, /\bhealing\b/,
  ]) * 0.20;
  vector.warmth -= wordHits(text, [
    /\bbleak\b/, /\bcynical\b/, /\bcold\b/, /\bnihilistic\b/, /\bruthless\b/,
    /\bviolent\b/, /\bdisturbing\b/,
  ]) * 0.20;

  vector.realism += wordHits(text, [
    /\brealistic\b/, /\bgrounded\b/, /\bliterary\b/, /\bcrime\b/, /\bdetective\b/,
    /\bpolice procedural\b/, /\bhistorical\b/, /\bcontemporary\b/, /\bsocial\b/,
    /\bfamily drama\b/,
  ]) * 0.18;
  vector.realism -= wordHits(text, [
    /\bscience fiction\b/, /\bsci[-\s]?fi\b/, /\bspeculative\b/, /\bfantasy\b/,
    /\bmagic\b/, /\bdragon\b/, /\balien\b/, /\bspace opera\b/, /\btime travel\b/,
    /\bsupernatural\b/, /\bhaunted\b/, /\bdystopian\b/, /\bfuturistic\b/,
  ]) * 0.18;

  vector.complexity += wordHits(text, [
    /\bpsychological\b/, /\bidentity\b/, /\bmemory\b/, /\bperception\b/, /\bunreliable\b/,
    /\blayered\b/, /\bcomplex\b/, /\bphilosophical\b/, /\bintellectual\b/,
    /\bmetaphysical\b/, /\bmind[-\s]?bending\b/, /\bexperimental\b/,
    /\bconspiracy\b/, /\bmoral ambiguity\b/,
  ]) * 0.22;
  vector.complexity -= wordHits(text, [
    /\bsimple\b/, /\bstraightforward\b/, /\bformulaic\b/, /\bcozy\b/, /\blighthearted\b/,
  ]) * 0.18;

  vector.characterFocus += wordHits(text, [
    /\bcharacter[-\s]?driven\b/, /\bcoming of age\b/, /\bfamily\b/, /\brelationship\b/,
    /\bfriendship\b/, /\bemotional\b/, /\bintimate\b/, /\bpersonal\b/, /\bprotagonist\b/,
    /\bgrief\b/, /\bidentity\b/,
  ]) * 0.18;
  vector.characterFocus -= wordHits(text, [
    /\bplot[-\s]?driven\b/, /\bmilitary\b/, /\btechno[-\s]?thriller\b/, /\baction[-\s]?packed\b/,
  ]) * 0.16;

  vector.humor += wordHits(text, [
    /\bfunny\b/, /\bhumor(?:ous)?\b/, /\bcomic\b/, /\bcomedy\b/, /\bsatire\b/,
    /\bwitty\b/, /\birreverent\b/, /\babsurd\b/, /\boffbeat\b/,
  ]) * 0.22;

  for (const key of AXIS_KEYS) vector[key] = clamp(vector[key]);
  return vector;
}

function tasteAxis(taste: TasteProfile | undefined, key: keyof ToneVector): number | null {
  const axes: any = (taste as any)?.axes || {};
  const legacy: any = taste || {};

  if (key === 'intensity') {
    return normalizeAxis(axes.pacing ?? legacy.pacing);
  }

  return normalizeAxis(axes[key] ?? legacy[key]);
}

function axisMatch(candidateValue: number, userValue: number): number {
  // Both values are in -1..1. 1 means exact match, 0 means opposite.
  return 1 - Math.min(2, Math.abs(candidateValue - userValue)) / 2;
}

export function computeToneMatchScore(candidate: Candidate, taste?: TasteProfile): number {
  if (!taste) return 0;

  const vector = computeCandidateToneVector(candidate);
  const weightedAxes: Array<[keyof ToneVector, number]> = [
    ['darkness', 1.4],
    ['intensity', 1.25],
    ['warmth', 1.2],
    ['realism', 1.0],
    ['complexity', 1.35],
    ['characterFocus', 1.1],
    ['humor', 0.8],
  ];

  let score = 0;
  let seenAxis = false;

  for (const [key, weight] of weightedAxes) {
    const userValue = tasteAxis(taste, key);
    if (userValue == null) continue;
    seenAxis = true;

    const match = axisMatch(vector[key], userValue);
    score += (match - 0.5) * 2 * weight;
  }

  if (!seenAxis) return 0;

  const text = haystack(candidate);
  const userDarkness = tasteAxis(taste, 'darkness');
  const userWarmth = tasteAxis(taste, 'warmth');
  const userRealism = tasteAxis(taste, 'realism');
  const userComplexity = tasteAxis(taste, 'complexity');

  // Strong mismatch guards. These remain soft ranking signals, not filters.
  if ((userDarkness ?? 0) > 0.35 && /\b(cozy|cosy|gentle mystery|culinary mystery|comfort read)\b/.test(text)) score -= 3.5;
  if ((userWarmth ?? 0) < -0.25 && /\bheartwarming|uplifting|comforting\b/.test(text)) score -= 1.75;
  if ((userRealism ?? 0) < -0.25 && /\bpolice procedural|legal thriller|military thriller\b/.test(text) && !/\bweird|speculative|psychological|identity\b/.test(text)) score -= 1.5;
  if ((userComplexity ?? 0) > 0.25 && /\bformulaic|book\s*\d+|series starter\b/.test(text)) score -= 2.0;

  return Math.round(clamp(score, -8, 8) * 100) / 100;
}
