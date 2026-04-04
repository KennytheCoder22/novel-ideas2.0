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

export function blendTaste(
  personality: PersonalityProfile,
  mood: MoodProfile
): ActiveTasteResult {
  const personalityWeight = getPersonalityStrength(personality);
  const moodFloor = 0.65;
  const moodBoost = 0.2 * clamp01(mood.confidence);
  const moodWeight = Math.max(moodFloor + moodBoost, 1 - personalityWeight);

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