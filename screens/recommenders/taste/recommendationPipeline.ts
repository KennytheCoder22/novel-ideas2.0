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

const MIN_DECISION_SWIPES_FOR_PERSONALITY_UPDATE = 4;
const MIN_DECISION_SWIPES_FOR_STRONG_MOOD = 2;

type SwipeDirection = SwipeSignal["direction"];

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
    const stats = this.getSwipeStats(swipes);

    await this.safeLog("recommendations_built", {
      userId,
      sessionId,
      swipeCount: swipes.length,
      decisionSwipeCount: stats.decisionSwipes,
      likeCount: stats.likes,
      dislikeCount: stats.dislikes,
      skipCount: stats.skips,
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

    const nextMood = this.computeTwentyQMood(existingMood, nextSwipes);

    if (this.deps.saveMoodProfileForSession) {
      await this.deps.saveMoodProfileForSession(nextMood);
    }

    const stats = this.getSwipeStats(nextSwipes);

    await this.safeLog("swipe_recorded", {
      userId,
      sessionId,
      bookId: newSwipe.bookId,
      direction: newSwipe.direction,
      swipeCount: nextSwipes.length,
      decisionSwipeCount: stats.decisionSwipes,
      likeCount: stats.likes,
      dislikeCount: stats.dislikes,
      skipCount: stats.skips,
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
    const stats = this.getSwipeStats(swipes);

    const shouldUpdatePersonality =
      stats.decisionSwipes >= MIN_DECISION_SWIPES_FOR_PERSONALITY_UPDATE;

    const nextPersonality = shouldUpdatePersonality
      ? updatePersonality(personality, mood)
      : personality;

    const updated =
      shouldUpdatePersonality &&
      (
        nextPersonality.sessionCount !== personality.sessionCount ||
        nextPersonality.confidence !== personality.confidence ||
        !this.areVectorsEqual(nextPersonality.vector, personality.vector)
      );

    if (shouldUpdatePersonality) {
      await this.deps.savePersonalityForUser(nextPersonality);
    }

    await this.safeLog("session_finalized", {
      userId,
      sessionId,
      swipeCount: swipes.length,
      decisionSwipeCount: stats.decisionSwipes,
      likeCount: stats.likes,
      dislikeCount: stats.dislikes,
      skipCount: stats.skips,
      moodConfidence: mood.confidence,
      personalityUpdated: updated,
      personalityUpdateSuppressed: !shouldUpdatePersonality,
      minDecisionSwipesRequired: MIN_DECISION_SWIPES_FOR_PERSONALITY_UPDATE,
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

    const computedMood = this.computeTwentyQMood(baseMood, swipes);

    if (this.deps.saveMoodProfileForSession) {
      await this.deps.saveMoodProfileForSession(computedMood);
    }

    return computedMood;
  }

  private computeTwentyQMood(
    baseMood: MoodProfile,
    swipes: SwipeSignal[]
  ): MoodProfile {
    const decisionSwipes = this.filterDecisionSwipes(swipes);
    const computed = updateMoodVector(baseMood, decisionSwipes);
    const stats = this.getSwipeStats(swipes);

    const normalizedConfidence = this.normalizeMoodConfidence(
      computed.confidence,
      stats.decisionSwipes
    );

    return {
      ...computed,
      swipeCount: stats.decisionSwipes,
      confidence: normalizedConfidence,
    };
  }

  private normalizeMoodConfidence(
    confidence: number,
    decisionSwipes: number
  ): number {
    const safeConfidence =
      typeof confidence === "number" && Number.isFinite(confidence)
        ? confidence
        : 0;

    if (decisionSwipes <= 0) return 0;

    if (decisionSwipes < MIN_DECISION_SWIPES_FOR_STRONG_MOOD) {
      return Math.min(safeConfidence, 0.2);
    }

    if (decisionSwipes < MIN_DECISION_SWIPES_FOR_PERSONALITY_UPDATE) {
      return Math.min(safeConfidence, 0.45);
    }

    return safeConfidence;
  }

  private filterDecisionSwipes(swipes: SwipeSignal[]): SwipeSignal[] {
    return swipes.filter((swipe) => this.isDecisionDirection(swipe.direction));
  }

  private isDecisionDirection(direction: SwipeDirection): boolean {
    return direction === "like" || direction === "dislike";
  }

  private getSwipeStats(swipes: SwipeSignal[]): {
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
