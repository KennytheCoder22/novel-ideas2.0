// Shared React hook wiring the pure game-recommendation-milestone engine into any of the four
// recommendation games. Each game screen calls `notifyEvidence` once per meaningful native
// evidence unit (a completed round/encounter/choice/level) with its already-adapted
// `SwipeSignalV2[]` and the milestone policy's evaluation for the new meaningful count; the hook
// handles persistence, dedupe, the actual `runRecommenderV2` call, and exposes a reward payload
// for the shared `<GameRecommendationReward />` component plus a `respond` function that persists
// the player's answer and resumes play immediately.
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";
import { useCallback, useEffect, useRef, useState } from "react";
import { runRecommenderV2 } from "../app/recommender-v2";
import type { AgeBandV2, SwipeSignalV2 } from "../app/recommender-v2";
import {
  clearPendingReward,
  isBookAlreadySeen,
  retractNativeEvidence,
  recordFamiliarBook,
  resetGameRecommendationSession,
  restoreGameRecommendationIntegrationState,
  type GameRecommendationIntegrationStateV1,
} from "../lib/recommendationGames/gameRecommendationIntegrationState";
import {
  GAME_RECOMMENDATION_EVIDENCE_SNAPSHOT_VERSION,
  processGameRecommendationEvidence,
} from "../lib/recommendationGames/gameRecommendationEngine";
import type { MilestoneEvaluation } from "../lib/recommendationGames/gameRecommendationMilestones";
import {
  createGameRecommendationFeedbackEvent,
  withContinuedAt,
  type GameRecommendationBookIdentity,
  type GameRecommendationEvidenceMode,
  type GameRecommendationEvidenceSnapshot,
  type GameRecommendationResponse,
  type RecommendationGameId,
} from "../lib/recommendationGames/gameRecommendationFeedback";
import { createGameRecommendationDiagnosticEvent } from "../lib/recommendationGames/gameRecommendationDiagnostics";
import {
  queueGameRecommendationDiagnosticEvent,
  queueGameRecommendationFeedbackEvent,
  flushGameRecommendationDiagnosticEvents,
  flushGameRecommendationFeedbackEvents,
  type AsyncKeyValueStorage,
} from "../lib/recommendationGames/gameRecommendationFeedbackQueue";
import {
  sendGameRecommendationDiagnosticEvent,
  sendGameRecommendationFeedbackEvent,
} from "../lib/recommendationGames/gameRecommendationFeedbackClient";
import type { GameRouteSourceFlags } from "../lib/recommendationGames/gameRecommendationRouteConfig";
import { gameRouteSourceFlagsToEnabledSources } from "../lib/recommendationGames/gameRecommendationRouteConfig";

const webStorage: AsyncKeyValueStorage = {
  async getItem(key) {
    if (typeof localStorage === "undefined") return null;
    return localStorage.getItem(key);
  },
  async setItem(key, value) {
    if (typeof localStorage !== "undefined") localStorage.setItem(key, value);
  },
};

const gameRecommendationStorage: AsyncKeyValueStorage = Platform.OS === "web" ? webStorage : AsyncStorage;
const apiOrigin = String(process.env.EXPO_PUBLIC_API_BASE_URL || "").replace(/\/+$/, "");
const httpEnv = { isWeb: Platform.OS === "web", apiOrigin };

function scopeKeyPart(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 120) || "default";
}

function integrationStateStorageKey(game: RecommendationGameId, playerId: string, libraryId: string): string {
  return `novelideas_game_recommendation_integration_state_v1:${game}:${scopeKeyPart(playerId)}:${scopeKeyPart(libraryId)}`;
}

export type GameRecommendationRewardPayload = {
  cadence: "first" | "later";
  gameLabel: string;
  book: GameRecommendationBookIdentity;
  coverUrl: string | null;
  reason: string;
  milestoneId: string;
  milestoneIndex: number;
  evidenceCount: number;
  evidenceMode: GameRecommendationEvidenceMode;
  evidenceSnapshot: GameRecommendationEvidenceSnapshot;
  shownAt: string;
  gameSessionId: string;
  ageBand: AgeBandV2;
  library: { libraryId: string; localCollectionOnly: boolean };
};

export type UseGameRecommendationMilestoneArgs = {
  game: RecommendationGameId;
  gameLabel: string;
  playerId: string;
  gameSessionId: string;
  libraryId: string;
  ageBand: AgeBandV2;
  sourceFlags: GameRouteSourceFlags;
  localCollectionOnly: boolean;
  evidenceMode: GameRecommendationEvidenceMode;
};

type EvidenceNotification = {
  nativeEvidenceId: string;
  signals: SwipeSignalV2[];
  evaluateMilestone: (lastMilestoneEvidenceCount: number) => MilestoneEvaluation | null;
};

function reasonForBook(matchedSignals: readonly string[]): string {
  const readableSignals = matchedSignals
    .map((signal) => signal.replace(/[_:-]+/g, " ").trim())
    .filter(Boolean)
    .slice(0, 2);
  return readableSignals.length
    ? `It matches your pull toward ${readableSignals.join(" and ")}.`
    : "It connects with the choices you've been making.";
}

export function useGameRecommendationMilestone(args: UseGameRecommendationMilestoneArgs) {
  const stateRef = useRef<GameRecommendationIntegrationStateV1 | null>(null);
  const [pendingReward, setPendingReward] = useState<GameRecommendationRewardPayload | null>(null);
  const readyRef = useRef(false);
  const loadedOnceRef = useRef(false);
  const pendingEvidenceRef = useRef<EvidenceNotification[]>([]);
  const notifyEvidenceRef = useRef<(notification: EvidenceNotification) => Promise<void>>(async () => undefined);
  const evidenceMutationRef = useRef<Promise<void>>(Promise.resolve());
  const respondingRef = useRef(false);

  useEffect(() => {
    // Some games mint their `gameSessionId` only once their own save/session state finishes an
    // async load (e.g. Media Mania), so this effect intentionally waits for a non-empty session
    // id before performing the one-time storage read, then never repeats it - see
    // `withCurrentGameSessionId` for how a later session id change (without a full reload) is
    // reconciled once the session id becomes available.
    if (!args.gameSessionId || loadedOnceRef.current) return;
    loadedOnceRef.current = true;
    let cancelled = false;
    void (async () => {
      const key = integrationStateStorageKey(args.game, args.playerId, args.libraryId);
      let raw: string | null = null;
      try {
        raw = await gameRecommendationStorage.getItem(key);
      } catch (error) {
        raw = null;
        console.warn("[game-recommendation] integration_state_read_failed", error);
      }
      if (cancelled) return;
      stateRef.current = restoreGameRecommendationIntegrationState(raw, {
        game: args.game,
        anonymousPlayerId: args.playerId,
        gameSessionId: args.gameSessionId,
      });
      const restoredReward = stateRef.current.pendingReward;
      if (restoredReward) {
        setPendingReward({
          ...restoredReward,
          gameLabel: args.gameLabel,
          coverUrl: restoredReward.coverUrl,
          reason: reasonForBook(restoredReward.matchedSignals),
        });
      }
      readyRef.current = true;
      for (const notification of pendingEvidenceRef.current.splice(0)) {
        await notifyEvidenceRef.current(notification);
      }
      void flushGameRecommendationFeedbackEvents(
        gameRecommendationStorage,
        (event) => sendGameRecommendationFeedbackEvent(event, httpEnv),
      ).catch((error) => console.warn("[game-recommendation] feedback_flush_failed", error));
      void flushGameRecommendationDiagnosticEvents(
        gameRecommendationStorage,
        (event) => sendGameRecommendationDiagnosticEvent(event, httpEnv),
      ).catch((error) => console.warn("[game-recommendation] diagnostic_flush_failed", error));
    })();
    return () => {
      cancelled = true;
    };
  }, [args.game, args.gameLabel, args.playerId, args.libraryId, args.gameSessionId]);

  const persist = useCallback(async (state: GameRecommendationIntegrationStateV1) => {
    stateRef.current = state;
    try {
      await gameRecommendationStorage.setItem(
        integrationStateStorageKey(args.game, args.playerId, args.libraryId),
        JSON.stringify(state),
      );
    } catch (error) {
      // Best-effort: an integration-state write failure must not interrupt play. Progress toward
      // the next milestone simply is not remembered if the app closes before the next write.
      console.warn("[game-recommendation] integration_state_write_failed", error);
    }
  }, [args.game, args.libraryId, args.playerId]);

  const processEvidence = useCallback(async (notification: EvidenceNotification) => {
    if (!stateRef.current) return;
    const { nativeEvidenceId, signals, evaluateMilestone } = notification;
    const outcome = await processGameRecommendationEvidence({
      state: stateRef.current,
      nativeEvidenceId,
      signals,
      evaluateMilestone,
      evidenceMode: args.evidenceMode,
      ageBand: args.ageBand,
      enabledSources: gameRouteSourceFlagsToEnabledSources(args.sourceFlags),
      localLibraryCurationTrusted: args.localCollectionOnly,
      library: { libraryId: args.libraryId, localCollectionOnly: args.localCollectionOnly },
      runRecommender: runRecommenderV2,
    });
    await persist(outcome.state);
    if (outcome.status === "shown") {
      setPendingReward({
        cadence: outcome.cadence,
        gameLabel: args.gameLabel,
        book: outcome.book,
        coverUrl: outcome.coverUrl,
        reason: reasonForBook(outcome.matchedSignals),
        milestoneId: outcome.milestoneId,
        milestoneIndex: outcome.milestoneIndex,
        evidenceCount: outcome.evidenceCount,
        evidenceMode: outcome.evidenceMode,
        evidenceSnapshot: outcome.evidenceSnapshot,
        shownAt: outcome.shownAt,
        gameSessionId: args.gameSessionId,
        ageBand: args.ageBand,
        library: { libraryId: args.libraryId, localCollectionOnly: args.localCollectionOnly },
      });
      return;
    }
    if (outcome.status === "error" || outcome.status === "empty") {
      void queueGameRecommendationDiagnosticEvent(gameRecommendationStorage, outcome.diagnostic)
        .then(() => flushGameRecommendationDiagnosticEvents(
          gameRecommendationStorage,
          (event) => sendGameRecommendationDiagnosticEvent(event, httpEnv),
        ))
        .catch((error) => console.warn("[game-recommendation] diagnostic_queue_failed", error));
    }
  }, [args.ageBand, args.evidenceMode, args.gameLabel, args.gameSessionId, args.libraryId, args.localCollectionOnly, args.sourceFlags, persist]);

  const enqueueEvidenceMutation = useCallback((mutation: () => Promise<void>) => {
    const next = evidenceMutationRef.current.catch(() => undefined).then(mutation);
    evidenceMutationRef.current = next;
    return next;
  }, []);

  notifyEvidenceRef.current = (notification) => enqueueEvidenceMutation(() => processEvidence(notification));

  const notifyEvidence = useCallback(async (
    nativeEvidenceId: string,
    signals: SwipeSignalV2[],
    evaluateMilestone: (lastMilestoneEvidenceCount: number) => MilestoneEvaluation | null,
  ) => {
    const notification = { nativeEvidenceId, signals, evaluateMilestone };
    if (!readyRef.current || !stateRef.current) {
      pendingEvidenceRef.current.push(notification);
      return;
    }
    await enqueueEvidenceMutation(() => processEvidence(notification));
  }, [enqueueEvidenceMutation, processEvidence]);

  const retractEvidence = useCallback(async (nativeEvidenceId: string) => {
    if (!readyRef.current || !stateRef.current) {
      pendingEvidenceRef.current = pendingEvidenceRef.current.filter(
        (notification) => notification.nativeEvidenceId !== nativeEvidenceId,
      );
      return;
    }
    await enqueueEvidenceMutation(async () => {
      if (stateRef.current) await persist(retractNativeEvidence(stateRef.current, nativeEvidenceId));
    });
  }, [enqueueEvidenceMutation, persist]);

  const resetSession = useCallback(async (gameSessionId = args.gameSessionId) => {
    await enqueueEvidenceMutation(async () => {
      if (!stateRef.current) return;
      setPendingReward(null);
      await persist(resetGameRecommendationSession(stateRef.current, gameSessionId));
    });
  }, [args.gameSessionId, enqueueEvidenceMutation, persist]);

  const respond = useCallback((response: GameRecommendationResponse, continuation: () => void) => {
    if (respondingRef.current) return;
    const reward = pendingReward;
    if (!reward || !stateRef.current) {
      continuation();
      return;
    }
    respondingRef.current = true;
    const respondedAt = new Date().toISOString();
    let state = clearPendingReward(stateRef.current);
    if (response === "already_read") {
      state = recordFamiliarBook(state, reward.book.id);
    }
    const event = createGameRecommendationFeedbackEvent({
      game: args.game,
      anonymousPlayerId: args.playerId,
      gameSessionId: reward.gameSessionId,
      milestoneIndex: reward.milestoneIndex,
      evidenceCount: reward.evidenceCount,
      evidenceSnapshotVersion: GAME_RECOMMENDATION_EVIDENCE_SNAPSHOT_VERSION,
      evidenceSnapshot: reward.evidenceSnapshot,
      evidenceMode: reward.evidenceMode,
      book: reward.book,
      response,
      ageBand: reward.ageBand,
      library: reward.library,
      shownAt: reward.shownAt,
      respondedAt,
    });
    void (async () => {
      let continued = false;
      // Persist locally first (durable queue + integration state), then close the reward and
      // resume play, so a slow or offline network never delays "immediately continue gameplay".
      // Delivery to the server happens best-effort afterward.
      try {
        await persist(state);
        await queueGameRecommendationFeedbackEvent(gameRecommendationStorage, event);
      } catch (error) {
        // Best-effort: even a local persistence failure must not block play from continuing.
        console.warn("[game-recommendation] feedback_queue_failed", error);
      } finally {
        setPendingReward(null);
        try {
          continuation();
          continued = true;
        } catch (error) {
          console.warn("[game-recommendation] continuation_failed", error);
        } finally {
          respondingRef.current = false;
        }
      }
      if (!continued) return;
      const finalEvent = withContinuedAt(event, new Date().toISOString()) || event;
      try {
        await queueGameRecommendationFeedbackEvent(gameRecommendationStorage, finalEvent);
        await flushGameRecommendationFeedbackEvents(
          gameRecommendationStorage,
          (queuedEvent) => sendGameRecommendationFeedbackEvent(queuedEvent, httpEnv),
        );
      } catch (error) {
        console.warn("[game-recommendation] feedback_flush_failed", error);
      }
    })();
  }, [args.game, args.playerId, pendingReward, persist]);

  const isBookAlreadyShown = useCallback((bookId: string) => (
    stateRef.current ? isBookAlreadySeen(stateRef.current, bookId) : false
  ), []);

  return { pendingReward, notifyEvidence, retractEvidence, resetSession, respond, isBookAlreadyShown };
}

// Re-exported so screens can build a diagnostic manually for edge cases that fall outside the
// generic engine (none currently do; kept for parity/testability with the diagnostic contract).
export { createGameRecommendationDiagnosticEvent };
