import {
  PersonalityProfile,
  TasteVector,
  initializePersonality,
  updatePersonality,
} from "./personalityProfile";
import {
  MoodProfile,
  SwipeSignal,
  initializeMoodProfile,
  updateMoodVector,
} from "./sessionMood";
import { blendTaste, ActiveTasteResult } from "./tasteBlender";
import { CandidateBook, RankedBook, rankBooks } from "./tasteSimilarity";

export interface RecommendationPipelineDependencies {
  getPersonalityForUser: (
    userId: string
  ) => Promise<PersonalityProfile | null>;

  savePersonalityForUser: (
    profile: PersonalityProfile
  ) => Promise<void>;

  getSessionSwipes: (
    sessionId: string
  ) => Promise<SwipeSignal[]>;

  saveSessionSwipes?: (
    sessionId: string,
    swipes: SwipeSignal[]
  ) => Promise<void>;

  getMoodProfileForSession?: (
    sessionId: string
  ) => Promise<MoodProfile | null>;

  saveMoodProfileForSession?: (
    profile: MoodProfile
  ) => Promise<void>;

  getCandidateBooks: (
    userId: string,
    sessionId: string
  ) => Promise<CandidateBook[]>;

  logPipelineEvent?: (
    eventName: string,
    payload: Record<string, unknown>
  ) => Promise<void> | void;
}

export interface BuildRecommendationsResult {
  personality: PersonalityProfile;
  mood: MoodProfile;
  activeTaste: ActiveTasteResult;
  candidates: CandidateBook[];
  ranked: RankedBook[];
}

export interface RecordSwipeResult {
  swipes: SwipeSignal[];
  mood: MoodProfile;
}

export interface FinalizeSessionResult {
  previousPersonality: PersonalityProfile;
  nextPersonality: PersonalityProfile;
  mood: MoodProfile;
  updated: boolean;
}

export class RecommendationPipeline {
  constructor(
    private readonly deps: RecommendationPipelineDependencies
  ) {}

  async buildRecommendations(
    userId: string,
    sessionId: string
  ): Promise<BuildRecommendationsResult> {
    const personality = await this.loadPersonality(userId);
    const swipes = await this.deps.getSessionSwipes(sessionId);
    const mood = await this.loadOrComputeMood(userId, sessionId, swipes);
    const activeTaste = blendTaste(personality, mood);
    const candidates = await this.deps.getCandidateBooks(userId, sessionId);
    const ranked = rankBooks(activeTaste.vector, candidates);

    await this.safeLog("recommendations_built", {
      userId,
      sessionId,
      swipeCount: swipes.length,
      candidateCount: candidates.length,
      personalityWeight: activeTaste.personalityWeight,
      moodWeight: activeTaste.moodWeight,
    });

    return {
      personality,
      mood,
      activeTaste,
      candidates,
      ranked,
    };
  }

  async recordSwipe(
    userId: string,
    sessionId: string,
    newSwipe: SwipeSignal
  ): Promise<RecordSwipeResult> {
    const existingSwipes = await this.deps.getSessionSwipes(sessionId);
    const nextSwipes = [...existingSwipes, newSwipe];

    if (this.deps.saveSessionSwipes) {
      await this.deps.saveSessionSwipes(sessionId, nextSwipes);
    }

    const existingMood =
      (await this.deps.getMoodProfileForSession?.(sessionId)) ??
      initializeMoodProfile(sessionId, userId);

    const nextMood = updateMoodVector(existingMood, nextSwipes);

    if (this.deps.saveMoodProfileForSession) {
      await this.deps.saveMoodProfileForSession(nextMood);
    }

    await this.safeLog("swipe_recorded", {
      userId,
      sessionId,
      bookId: newSwipe.bookId,
      direction: newSwipe.direction,
      swipeCount: nextMood.swipeCount,
      moodConfidence: nextMood.confidence,
    });

    return {
      swipes: nextSwipes,
      mood: nextMood,
    };
  }

  async finalizeSession(
    userId: string,
    sessionId: string
  ): Promise<FinalizeSessionResult> {
    const personality = await this.loadPersonality(userId);
    const swipes = await this.deps.getSessionSwipes(sessionId);
    const mood = await this.loadOrComputeMood(userId, sessionId, swipes);
    const nextPersonality = updatePersonality(personality, mood);
    const updated =
      nextPersonality.sessionCount !== personality.sessionCount ||
      nextPersonality.confidence !== personality.confidence ||
      !this.areVectorsEqual(nextPersonality.vector, personality.vector);

    await this.deps.savePersonalityForUser(nextPersonality);

    await this.safeLog("session_finalized", {
      userId,
      sessionId,
      swipeCount: mood.swipeCount,
      moodConfidence: mood.confidence,
      personalityUpdated: updated,
      nextSessionCount: nextPersonality.sessionCount,
    });

    return {
      previousPersonality: personality,
      nextPersonality,
      mood,
      updated,
    };
  }

  async previewActiveTaste(
    userId: string,
    sessionId: string
  ): Promise<ActiveTasteResult> {
    const personality = await this.loadPersonality(userId);
    const swipes = await this.deps.getSessionSwipes(sessionId);
    const mood = await this.loadOrComputeMood(userId, sessionId, swipes);

    return blendTaste(personality, mood);
  }

  private async loadPersonality(
    userId: string
  ): Promise<PersonalityProfile> {
    const stored = await this.deps.getPersonalityForUser(userId);
    return stored ?? initializePersonality(userId);
  }

  private async loadOrComputeMood(
    userId: string,
    sessionId: string,
    swipes: SwipeSignal[]
  ): Promise<MoodProfile> {
    const storedMood =
      (await this.deps.getMoodProfileForSession?.(sessionId)) ?? null;

    const baseMood =
      storedMood ?? initializeMoodProfile(sessionId, userId);

    const computedMood = updateMoodVector(baseMood, swipes);

    if (this.deps.saveMoodProfileForSession) {
      await this.deps.saveMoodProfileForSession(computedMood);
    }

    return computedMood;
  }

  private areVectorsEqual(a: TasteVector, b: TasteVector): boolean {
    const keys = Object.keys(a) as Array<keyof TasteVector>;
    return keys.every((key) => Math.abs(a[key] - b[key]) < 0.0001);
  }

  private async safeLog(
    eventName: string,
    payload: Record<string, unknown>
  ): Promise<void> {
    if (!this.deps.logPipelineEvent) {
      return;
    }

    await this.deps.logPipelineEvent(eventName, payload);
  }
}