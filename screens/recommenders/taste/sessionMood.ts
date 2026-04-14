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
  swipeCount: number; // decision swipes only
  likeCount: number;
  dislikeCount: number;
  skipCount: number;
  createdAt: string;
  updatedAt: string;
}

const MIN_DECISION_SWIPES_FOR_STRONG_SIGNAL = 4;

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

function countSwipeDirections(swipes: SwipeSignal[]): {
  likes: number;
  dislikes: number;
  skips: number;
  decisionSwipes: number;
} {
  let likes = 0;
  let dislikes = 0;
  let skips = 0;

  for (const swipe of swipes) {
    if (swipe.direction === "like") {
      likes += 1;
    } else if (swipe.direction === "dislike") {
      dislikes += 1;
    } else {
      skips += 1;
    }
  }

  return {
    likes,
    dislikes,
    skips,
    decisionSwipes: likes + dislikes,
  };
}

export function calculateMoodConfidence(swipes: SwipeSignal[]): number {
  if (swipes.length === 0) {
    return 0;
  }

  const { likes, dislikes, decisionSwipes } = countSwipeDirections(swipes);

  if (decisionSwipes === 0) {
    return 0;
  }

  const countScore = Math.min(decisionSwipes / 8, 1);
  const balance = Math.min(likes, dislikes);
  const contrastScore = decisionSwipes > 0 ? Math.min(balance / 3, 1) : 0;

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
  const stats = countSwipeDirections(swipes);

  const liked = swipes
    .filter((s) => s.direction === "like")
    .map((s) => s.vector);

  const disliked = swipes
    .filter((s) => s.direction === "dislike")
    .map((s) => s.vector);

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
    swipeCount: stats.decisionSwipes,
    likeCount: stats.likes,
    dislikeCount: stats.dislikes,
    skipCount: stats.skips,
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
  return (
    profile.swipeCount >= MIN_DECISION_SWIPES_FOR_STRONG_SIGNAL &&
    profile.confidence >= 0.4
  );
}
