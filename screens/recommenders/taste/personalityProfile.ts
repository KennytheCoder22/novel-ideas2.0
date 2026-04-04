export type TasteDimension =
  | "ideaDensity"
  | "darkness"
  | "warmth"
  | "realism"
  | "characterFocus"
  | "pacing";

export type TasteVector = Record<TasteDimension, number>;

export interface PersonalityProfile {
  userId: string;
  vector: TasteVector;
  confidence: number; // 0..1
  sessionCount: number;
  lastUpdatedAt: string;
}

export interface PersonalityUpdateOptions {
  minSwipesForUpdate?: number;
  alpha?: number;
  lowSignalAlpha?: number;
  maxAlpha?: number;
  lowConfidenceThreshold?: number;
}

export interface SessionMoodLike {
  vector: TasteVector;
  confidence: number; // 0..1
  swipeCount: number;
}

const DIMENSIONS: TasteDimension[] = [
  "ideaDensity",
  "darkness",
  "warmth",
  "realism",
  "characterFocus",
  "pacing",
];

const DEFAULT_OPTIONS: Required<PersonalityUpdateOptions> = {
  minSwipesForUpdate: 12,
  alpha: 0.08,
  lowSignalAlpha: 0.03,
  maxAlpha: 0.12,
  lowConfidenceThreshold: 0.35,
};

export function zeroVector(): TasteVector {
  return {
    ideaDensity: 0,
    darkness: 0,
    warmth: 0,
    realism: 0,
    characterFocus: 0,
    pacing: 0,
  };
}

export function clamp(value: number, min = -1, max = 1): number {
  return Math.max(min, Math.min(max, value));
}

export function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

export function normalizeVector(vector: TasteVector): TasteVector {
  const next = { ...vector };
  for (const key of DIMENSIONS) {
    next[key] = clamp(next[key], -1, 1);
  }
  return next;
}

export function addVectors(a: TasteVector, b: TasteVector): TasteVector {
  const result = zeroVector();
  for (const key of DIMENSIONS) {
    result[key] = a[key] + b[key];
  }
  return normalizeVector(result);
}

export function scaleVector(vector: TasteVector, scalar: number): TasteVector {
  const result = zeroVector();
  for (const key of DIMENSIONS) {
    result[key] = vector[key] * scalar;
  }
  return normalizeVector(result);
}

export function blendVectors(
  base: TasteVector,
  incoming: TasteVector,
  alpha: number
): TasteVector {
  const a = clamp01(alpha);
  const result = zeroVector();

  for (const key of DIMENSIONS) {
    result[key] = base[key] * (1 - a) + incoming[key] * a;
  }

  return normalizeVector(result);
}

export function initializePersonality(userId: string): PersonalityProfile {
  return {
    userId,
    vector: zeroVector(),
    confidence: 0,
    sessionCount: 0,
    lastUpdatedAt: new Date().toISOString(),
  };
}

export function shouldUpdatePersonality(
  mood: SessionMoodLike,
  options?: PersonalityUpdateOptions
): boolean {
  const config = { ...DEFAULT_OPTIONS, ...options };

  if (mood.swipeCount < config.minSwipesForUpdate) {
    return false;
  }

  if (mood.confidence <= 0) {
    return false;
  }

  return true;
}

export function calculateUpdateAlpha(
  mood: SessionMoodLike,
  options?: PersonalityUpdateOptions
): number {
  const config = { ...DEFAULT_OPTIONS, ...options };

  if (mood.confidence < config.lowConfidenceThreshold) {
    return config.lowSignalAlpha;
  }

  const confidenceBoost = 0.04 * mood.confidence;
  return Math.min(config.alpha + confidenceBoost, config.maxAlpha);
}

export function updatePersonality(
  current: PersonalityProfile,
  mood: SessionMoodLike,
  options?: PersonalityUpdateOptions
): PersonalityProfile {
  if (!shouldUpdatePersonality(mood, options)) {
    return {
      ...current,
      lastUpdatedAt: new Date().toISOString(),
    };
  }

  const nextSessionCount = current.sessionCount + 1;
  const sessionConfidenceGain = 0.08 * mood.confidence;

  if (current.sessionCount === 0) {
    return {
      ...current,
      vector: normalizeVector(mood.vector),
      confidence: clamp01(Math.max(current.confidence, mood.confidence)),
      sessionCount: nextSessionCount,
      lastUpdatedAt: new Date().toISOString(),
    };
  }

  const alpha = calculateUpdateAlpha(mood, options);
  const nextVector = blendVectors(current.vector, mood.vector, alpha);
  const nextConfidence = clamp01(
    current.confidence + sessionConfidenceGain * (1 - current.confidence)
  );

  return {
    ...current,
    vector: nextVector,
    confidence: nextConfidence,
    sessionCount: nextSessionCount,
    lastUpdatedAt: new Date().toISOString(),
  };
}

export function getPersonalityStrength(profile: PersonalityProfile): number {
  const floor = 0.2;
  const ceiling = 0.35;
  return Math.min(floor + 0.15 * profile.confidence, ceiling);
}