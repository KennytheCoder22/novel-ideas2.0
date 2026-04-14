import {
  TasteVector,
  PersonalityProfile,
  zeroVector,
  normalizeVector,
  getPersonalityStrength,
  clamp01,
} from "./personalityProfile";
import { MoodProfile } from "./sessionMood";

export interface ActiveTasteResult {
  vector: TasteVector;
  personalityWeight: number;
  moodWeight: number;
}

const MIN_DECISION_SWIPES_FOR_BASELINE_MOOD = 2;
const MIN_DECISION_SWIPES_FOR_STRONG_MOOD = 4;

function calculateMoodWeight(mood: MoodProfile): number {
  const confidence = clamp01(mood.confidence);
  const decisionSwipes =
    typeof mood.swipeCount === "number" && Number.isFinite(mood.swipeCount)
      ? mood.swipeCount
      : 0;

  if (decisionSwipes <= 0 || confidence <= 0) {
    return 0;
  }

  if (decisionSwipes < MIN_DECISION_SWIPES_FOR_BASELINE_MOOD) {
    return 0.2 * confidence;
  }

  if (decisionSwipes < MIN_DECISION_SWIPES_FOR_STRONG_MOOD) {
    return 0.35 + 0.2 * confidence;
  }

  return 0.5 + 0.25 * confidence;
}

export function blendTaste(
  personality: PersonalityProfile,
  mood: MoodProfile
): ActiveTasteResult {
  const personalityWeight = getPersonalityStrength(personality);
  const moodWeight = calculateMoodWeight(mood);

  const raw = zeroVector();

  for (const key of Object.keys(raw) as Array<keyof TasteVector>) {
    raw[key] =
      personality.vector[key] * personalityWeight +
      mood.vector[key] * moodWeight;
  }

  return {
    vector: normalizeVector(raw),
    personalityWeight,
    moodWeight,
  };
}