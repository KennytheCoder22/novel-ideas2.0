import {
  TasteVector,
  TasteDimension,
  zeroVector,
  normalizeVector,
  clamp01,
} from "./personalityProfile";

export type SwipeDirection = "like" | "dislike" | "skip";

export interface SwipeSignal {
  bookId: string;
  direction: SwipeDirection;
  vector: TasteVector;
  timestamp?: string;
}

export interface MoodProfile {
  sessionId: string;
  userId: string;
  vector: TasteVector;
  confidence: number; // 0..1
  swipeCount: number;
  likeCount: number;
  dislikeCount: number;
  skipCount: number;
  createdAt: string;
  updatedAt: string;
}

const DIMENSIONS: TasteDimension[] = [
  "ideaDensity",
  "darkness",
  "warmth",
  "realism",
  "characterFocus",
  "pacing",
];

export function initializeMoodProfile(
  sessionId: string,
  userId: string
): MoodProfile {
  const now = new Date().toISOString();

  return {
    sessionId,
    userId,
    vector: zeroVector(),
    confidence: 0,
    swipeCount: 0,
    likeCount: 0,
    dislikeCount: 0,
    skipCount: 0,
    createdAt: now,
    updatedAt: now,
  };
}

function meanVector(vectors: TasteVector[]): TasteVector {
  if (vectors.length === 0) {
    return zeroVector();
  }

  const result = zeroVector();

  for (const vector of vectors) {
    for (const key of DIMENSIONS) {
      result[key] += vector[key];
    }
  }

  for (const key of DIMENSIONS) {
    result[key] /= vectors.length;
  }

  return normalizeVector(result);
}

function subtractVectors(
  a: TasteVector,
  b: TasteVector,
  weight = 1
): TasteVector {
  const result = zeroVector();

  for (const key of DIMENSIONS) {
    result[key] = a[key] - b[key] * weight;
  }

  return normalizeVector(result);
}

function vectorMagnitude(vector: TasteVector): number {
  let sumSquares = 0;

  for (const key of DIMENSIONS) {
    sumSquares += vector[key] * vector[key];
  }

  return Math.sqrt(sumSquares);
}

export function calculateMoodConfidence(swipes: SwipeSignal[]): number {
  if (swipes.length === 0) {
    return 0;
  }

  const likes = swipes.filter((s) => s.direction === "like").length;
  const dislikes = swipes.filter((s) => s.direction === "dislike").length;
  const meaningful = likes + dislikes;

  if (meaningful === 0) {
    return 0;
  }

  const countScore = Math.min(meaningful / 16, 1);

  const balance = Math.min(likes, dislikes);
  const contrastScore = meaningful > 0 ? Math.min(balance / 6, 1) : 0;

  return clamp01(0.7 * countScore + 0.3 * contrastScore);
}

export function computeSessionMood(swipes: SwipeSignal[]): {
  vector: TasteVector;
  confidence: number;
  swipeCount: number;
  likeCount: number;
  dislikeCount: number;
  skipCount: number;
} {
  const liked = swipes.filter((s) => s.direction === "like").map((s) => s.vector);
  const disliked = swipes
    .filter((s) => s.direction === "dislike")
    .map((s) => s.vector);

  const skipped = swipes.filter((s) => s.direction === "skip").length;

  const likedMean = meanVector(liked);
  const dislikedMean = meanVector(disliked);

  let moodVector = likedMean;

  if (disliked.length > 0) {
    moodVector = subtractVectors(likedMean, dislikedMean, 0.35);
  }

  const magnitude = vectorMagnitude(moodVector);
  const sharpened =
    magnitude > 0
      ? normalizeVector(
          Object.fromEntries(
            DIMENSIONS.map((key) => [key, moodVector[key] * Math.min(1.15, 1 + magnitude * 0.1)])
          ) as TasteVector
        )
      : moodVector;

  return {
    vector: sharpened,
    confidence: calculateMoodConfidence(swipes),
    swipeCount: swipes.length,
    likeCount: liked.length,
    dislikeCount: disliked.length,
    skipCount: skipped,
  };
}

export function updateMoodVector(
  profile: MoodProfile,
  swipes: SwipeSignal[]
): MoodProfile {
  const computed = computeSessionMood(swipes);

  return {
    ...profile,
    vector: computed.vector,
    confidence: computed.confidence,
    swipeCount: computed.swipeCount,
    likeCount: computed.likeCount,
    dislikeCount: computed.dislikeCount,
    skipCount: computed.skipCount,
    updatedAt: new Date().toISOString(),
  };
}

export function appendSwipeAndRecompute(
  profile: MoodProfile,
  existingSwipes: SwipeSignal[],
  newSwipe: SwipeSignal
): { mood: MoodProfile; swipes: SwipeSignal[] } {
  const nextSwipes = [...existingSwipes, newSwipe];
  const nextMood = updateMoodVector(profile, nextSwipes);

  return {
    mood: nextMood,
    swipes: nextSwipes,
  };
}

export function hasStrongSessionSignal(profile: MoodProfile): boolean {
  return profile.swipeCount >= 12 && profile.confidence >= 0.4;
}