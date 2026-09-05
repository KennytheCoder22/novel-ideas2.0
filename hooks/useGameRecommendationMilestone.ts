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
  RECOMMENDATION_GAME_IDS,
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
import {
  createGameRecommendationHistory,
  gameRecommendationHistoryStorageKey,
  restoreGameRecommendationHistory,
  synchronizeGameRecommendationHistory,
  type GameRecommendationHistoryV1,
} from "../lib/recommendationGames/gameRecommendationHistory";
import { gameRecommendationReasonFromMatchedSignals } from "../lib/recommendationGames/gameRecommendationReason";

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
const historyMutationTails = new Map<string, Promise<void>>();

function scopeKeyPart(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 120) || "default";
}

function integrationStateStorageKey(game: RecommendationGameId, playerId: string, libraryId: string, ageBand: AgeBandV2): string {
  return `novelideas_game_recommendation_integration_state_v2:${game}:${scopeKeyPart(playerId)}:${scopeKeyPart(libraryId)}:${ageBand}`;
}

function legacyIntegrationStateStorageKey(game: RecommendationGameId, playerId: string, libraryId: string): string {
  return `novelideas_game_recommendation_integration_state_v1:${game}:${scopeKeyPart(playerId)}:${scopeKeyPart(libraryId)}`;
}

function integrationStateMigrationKey(game: RecommendationGameId, playerId: string, libraryId: string): string {
  return `novelideas_game_recommendation_integration_state_v2_migrated:${game}:${scopeKeyPart(playerId)}:${scopeKeyPart(libraryId)}`;
}

function legacyHistoryMigrationKey(playerId: string, libraryId: string): string {
  return `novelideas_game_recommendation_history_v1_migrated:${scopeKeyPart(playerId)}:${scopeKeyPart(libraryId)}`;
}

function recommendationScopeId(args: Pick<UseGameRecommendationMilestoneArgs, "game" | "playerId" | "libraryId" | "ageBand" | "gameSessionId">): string {
  return `${args.game}:${args.playerId}:${args.libraryId}:${args.ageBand}:${args.gameSessionId}`;
}

async function withInProcessHistoryLock<T>(key: string, work: () => Promise<T>): Promise<T> {
  const previous = historyMutationTails.get(key) || Promise.resolve();
  let release: () => void = () => {};
  const current = new Promise<void>((resolve) => {
    release = resolve;
  });
  const tail = previous.catch(() => undefined).then(() => current);
  historyMutationTails.set(key, tail);
  await previous.catch(() => undefined);
  try {
    return await work();
  } finally {
    release();
    if (historyMutationTails.get(key) === tail) historyMutationTails.delete(key);
  }
}

async function withSharedHistoryLock<T>(key: string, work: () => Promise<T>): Promise<T> {
  const locks = (globalThis as {
    navigator?: { locks?: { request: <R>(name: string, callback: () => Promise<R>) => Promise<R> } };
  }).navigator?.locks;
  if (locks?.request) return locks.request(`novelideas:${key}`, work);
  return withInProcessHistoryLock(key, work);
}

export type GameRecommendationRewardPayload = {
  cadence: "first" | "later";
  gameLabel: string;
  book: GameRecommendationBookIdentity;
  coverUrl: string | null;
  description: string | null;
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
  scopeId: string;
  nativeEvidenceId: string;
  signals: SwipeSignalV2[];
  evaluateMilestone: (lastMilestoneEvidenceCount: number) => MilestoneEvaluation | null;
};

export function useGameRecommendationMilestone(args: UseGameRecommendationMilestoneArgs) {
  const currentScopeId = recommendationScopeId(args);
  const stateRef = useRef<GameRecommendationIntegrationStateV1 | null>(null);
  const historyRef = useRef<GameRecommendationHistoryV1 | null>(null);
  const [pendingReward, setPendingReward] = useState<GameRecommendationRewardPayload | null>(null);
  const readyRef = useRef(false);
  const loadedScopeRef = useRef("");
  const activeScopeRef = useRef("");
  const pendingEvidenceRef = useRef<EvidenceNotification[]>([]);
  const notifyEvidenceRef = useRef<(notification: EvidenceNotification) => Promise<void>>(async () => undefined);
  const evidenceMutationRef = useRef<Promise<void>>(Promise.resolve());
  const respondingRef = useRef(false);

  useEffect(() => {
    // Some games mint their `gameSessionId` only after their save loads. Wait for it, then reload
    // whenever the active game or recommendation-history scope changes.
    if (!args.gameSessionId) return;
    const loadedScope = currentScopeId;
    if (loadedScopeRef.current === loadedScope) return;
    loadedScopeRef.current = loadedScope;
    activeScopeRef.current = loadedScope;
    readyRef.current = false;
    setPendingReward(null);
    let cancelled = false;
    void (async () => {
      const key = integrationStateStorageKey(args.game, args.playerId, args.libraryId, args.ageBand);
      const historyScope = {
        anonymousPlayerId: args.playerId,
        libraryId: args.libraryId,
        ageBand: args.ageBand,
      };
      const historyKey = gameRecommendationHistoryStorageKey(historyScope);
      let rawState: string | null = null;
      let rawHistory: string | null = null;
      try {
        [rawState, rawHistory] = await Promise.all([
          gameRecommendationStorage.getItem(key),
          gameRecommendationStorage.getItem(historyKey),
        ]);
      } catch (error) {
        rawState = null;
        rawHistory = null;
        console.warn("[game-recommendation] integration_state_read_failed", error);
      }
      if (cancelled || activeScopeRef.current !== loadedScope) return;
      const historyMigrationKey = legacyHistoryMigrationKey(args.playerId, args.libraryId);
      try {
        await withSharedHistoryLock(historyMigrationKey, async () => {
          const migratedAgeBand = await gameRecommendationStorage.getItem(historyMigrationKey);
          if (migratedAgeBand) return;
          const legacyStates = await Promise.all(RECOMMENDATION_GAME_IDS.map(async (game) => (
            restoreGameRecommendationIntegrationState(
              await gameRecommendationStorage.getItem(legacyIntegrationStateStorageKey(game, args.playerId, args.libraryId)),
              { game, anonymousPlayerId: args.playerId, gameSessionId: `history-migration:${game}` },
            )
          )));
          await withSharedHistoryLock(historyKey, async () => {
            const currentHistory = restoreGameRecommendationHistory(
              await gameRecommendationStorage.getItem(historyKey),
              historyScope,
            );
            const migratedHistory = legacyStates.reduce(
              (history, state) => synchronizeGameRecommendationHistory(history, state).history,
              currentHistory,
            );
            await Promise.all([
              gameRecommendationStorage.setItem(historyKey, JSON.stringify(migratedHistory)),
              gameRecommendationStorage.setItem(historyMigrationKey, args.ageBand),
            ]);
            rawHistory = JSON.stringify(migratedHistory);
          });
        });
      } catch (error) {
        console.warn("[game-recommendation] shared_history_migration_failed", error);
      }
      if (cancelled || activeScopeRef.current !== loadedScope) return;
      if (!rawState) {
        const migrationKey = integrationStateMigrationKey(args.game, args.playerId, args.libraryId);
        try {
          await withSharedHistoryLock(migrationKey, async () => {
            const [latestScopedState, rawLegacyState, migratedAgeBand] = await Promise.all([
              gameRecommendationStorage.getItem(key),
              gameRecommendationStorage.getItem(legacyIntegrationStateStorageKey(args.game, args.playerId, args.libraryId)),
              gameRecommendationStorage.getItem(migrationKey),
            ]);
            if (latestScopedState) {
              rawState = latestScopedState;
            } else if (rawLegacyState && (!migratedAgeBand || migratedAgeBand === args.ageBand)) {
              rawState = rawLegacyState;
              await gameRecommendationStorage.setItem(migrationKey, args.ageBand);
            }
          });
        } catch (error) {
          console.warn("[game-recommendation] integration_state_migration_failed", error);
        }
      }
      if (cancelled || activeScopeRef.current !== loadedScope) return;
      let restoredState = restoreGameRecommendationIntegrationState(rawState, {
        game: args.game,
        anonymousPlayerId: args.playerId,
        gameSessionId: args.gameSessionId,
      });
      if (restoredState.pendingReward && restoredState.pendingReward.ageBand !== args.ageBand) {
        restoredState = restoreGameRecommendationIntegrationState(null, {
          game: args.game,
          anonymousPlayerId: args.playerId,
          gameSessionId: args.gameSessionId,
        });
      }
      const restoredHistory = restoreGameRecommendationHistory(rawHistory, historyScope);
      let synchronized = synchronizeGameRecommendationHistory(restoredHistory, restoredState);
      try {
        await withSharedHistoryLock(historyKey, async () => {
          const [latestRawHistory, latestRawState] = await Promise.all([
            gameRecommendationStorage.getItem(historyKey),
            gameRecommendationStorage.getItem(key),
          ]);
          const latestHistory = restoreGameRecommendationHistory(latestRawHistory, historyScope);
          const latestState = latestRawState
            ? restoreGameRecommendationIntegrationState(latestRawState, {
                game: args.game,
                anonymousPlayerId: args.playerId,
                gameSessionId: args.gameSessionId,
              })
            : synchronized.state;
          synchronized = synchronizeGameRecommendationHistory(latestHistory, latestState);
          const writes = [
            gameRecommendationStorage.setItem(key, JSON.stringify(synchronized.state)),
            gameRecommendationStorage.setItem(historyKey, JSON.stringify(synchronized.history)),
          ];
          await Promise.all(writes);
        });
      } catch (error) {
        console.warn("[game-recommendation] integration_state_migration_failed", error);
      }
      if (cancelled || activeScopeRef.current !== loadedScope) return;
      stateRef.current = synchronized.state;
      historyRef.current = synchronized.history;
      const restoredReward = stateRef.current.pendingReward;
      if (restoredReward) {
        setPendingReward({
          ...restoredReward,
          gameLabel: args.gameLabel,
          coverUrl: restoredReward.coverUrl,
          description: restoredReward.description || null,
          reason: gameRecommendationReasonFromMatchedSignals(restoredReward.matchedSignals),
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
      if (activeScopeRef.current === loadedScope) {
        activeScopeRef.current = "";
        readyRef.current = false;
      }
    };
  }, [args.ageBand, args.game, args.gameLabel, args.playerId, args.libraryId, args.gameSessionId, currentScopeId]);

  const persist = useCallback(async (state: GameRecommendationIntegrationStateV1, scopeId: string): Promise<boolean> => {
    if (activeScopeRef.current !== scopeId) return false;
    const historyScope = {
      anonymousPlayerId: args.playerId,
      libraryId: args.libraryId,
      ageBand: args.ageBand,
    };
    let latestHistory = historyRef.current || createGameRecommendationHistory(historyScope);
    try {
      latestHistory = restoreGameRecommendationHistory(
        await gameRecommendationStorage.getItem(gameRecommendationHistoryStorageKey(historyScope)),
        historyScope,
      );
    } catch (error) {
      console.warn("[game-recommendation] shared_history_read_failed", error);
    }
    if (activeScopeRef.current !== scopeId) return false;
    const synchronized = synchronizeGameRecommendationHistory(latestHistory, state);
    try {
      await Promise.all([
        gameRecommendationStorage.setItem(
          integrationStateStorageKey(args.game, args.playerId, args.libraryId, args.ageBand),
          JSON.stringify(synchronized.state),
        ),
        gameRecommendationStorage.setItem(
          gameRecommendationHistoryStorageKey(historyScope),
          JSON.stringify(synchronized.history),
        ),
      ]);
    } catch (error) {
      // Best-effort: an integration-state write failure must not interrupt play. Progress toward
      // the next milestone simply is not remembered if the app closes before the next write.
      console.warn("[game-recommendation] integration_state_write_failed", error);
    }
    if (activeScopeRef.current !== scopeId) return false;
    stateRef.current = synchronized.state;
    historyRef.current = synchronized.history;
    return true;
  }, [args.ageBand, args.game, args.libraryId, args.playerId]);

  const processEvidence = useCallback(async (notification: EvidenceNotification) => {
    if (!stateRef.current || activeScopeRef.current !== notification.scopeId) return;
    const { nativeEvidenceId, signals, evaluateMilestone } = notification;
    const historyScope = {
      anonymousPlayerId: args.playerId,
      libraryId: args.libraryId,
      ageBand: args.ageBand,
    };
    const historyKey = gameRecommendationHistoryStorageKey(historyScope);
    const integrationKey = integrationStateStorageKey(args.game, args.playerId, args.libraryId, args.ageBand);
    await withSharedHistoryLock(historyKey, async () => {
      if (!stateRef.current || activeScopeRef.current !== notification.scopeId) return;
      let currentState = stateRef.current;
      try {
        const [rawHistory, rawIntegrationState] = await Promise.all([
          gameRecommendationStorage.getItem(historyKey),
          gameRecommendationStorage.getItem(integrationKey),
        ]);
        if (rawIntegrationState) {
          currentState = restoreGameRecommendationIntegrationState(rawIntegrationState, {
            game: args.game,
            anonymousPlayerId: args.playerId,
            gameSessionId: args.gameSessionId,
          });
        }
        const latestHistory = restoreGameRecommendationHistory(rawHistory, historyScope);
        const synchronized = synchronizeGameRecommendationHistory(latestHistory, currentState);
        currentState = synchronized.state;
        historyRef.current = synchronized.history;
      } catch (error) {
        console.warn("[game-recommendation] shared_history_read_failed", error);
      }
      const outcome = await processGameRecommendationEvidence({
        state: currentState,
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
      if (activeScopeRef.current !== notification.scopeId) return;
      if (!await persist(outcome.state, notification.scopeId)) return;
      if (outcome.status === "shown") {
        setPendingReward({
          cadence: outcome.cadence,
          gameLabel: args.gameLabel,
          book: outcome.book,
          coverUrl: outcome.coverUrl,
          description: outcome.description,
          reason: gameRecommendationReasonFromMatchedSignals(outcome.matchedSignals),
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
    });
  }, [args.ageBand, args.evidenceMode, args.game, args.gameLabel, args.gameSessionId, args.libraryId, args.localCollectionOnly, args.playerId, args.sourceFlags, persist]);

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
    const notification = {
      scopeId: currentScopeId,
      nativeEvidenceId,
      signals,
      evaluateMilestone,
    };
    if (!readyRef.current || !stateRef.current) {
      pendingEvidenceRef.current.push(notification);
      return;
    }
    await enqueueEvidenceMutation(() => processEvidence(notification));
  }, [currentScopeId, enqueueEvidenceMutation, processEvidence]);

  const retractEvidence = useCallback(async (nativeEvidenceId: string) => {
    if (!readyRef.current || !stateRef.current) {
      pendingEvidenceRef.current = pendingEvidenceRef.current.filter(
        (notification) => notification.nativeEvidenceId !== nativeEvidenceId,
      );
      return;
    }
    await enqueueEvidenceMutation(async () => {
      const scopeId = currentScopeId;
      const historyKey = gameRecommendationHistoryStorageKey({
        anonymousPlayerId: args.playerId,
        libraryId: args.libraryId,
        ageBand: args.ageBand,
      });
      await withSharedHistoryLock(historyKey, async () => {
        if (stateRef.current && activeScopeRef.current === scopeId) {
          let currentState = stateRef.current;
          try {
            const rawState = await gameRecommendationStorage.getItem(
              integrationStateStorageKey(args.game, args.playerId, args.libraryId, args.ageBand),
            );
            if (rawState) {
              currentState = restoreGameRecommendationIntegrationState(rawState, {
                game: args.game,
                anonymousPlayerId: args.playerId,
                gameSessionId: args.gameSessionId,
              });
            }
          } catch (error) {
            console.warn("[game-recommendation] integration_state_read_failed", error);
          }
          await persist(retractNativeEvidence(currentState, nativeEvidenceId), scopeId);
        }
      });
    });
  }, [args.ageBand, args.game, args.gameSessionId, args.libraryId, args.playerId, currentScopeId, enqueueEvidenceMutation, persist]);

  const resetSession = useCallback(async (gameSessionId = args.gameSessionId) => {
    await enqueueEvidenceMutation(async () => {
      const scopeId = currentScopeId;
      const historyKey = gameRecommendationHistoryStorageKey({
        anonymousPlayerId: args.playerId,
        libraryId: args.libraryId,
        ageBand: args.ageBand,
      });
      await withSharedHistoryLock(historyKey, async () => {
        if (!stateRef.current || activeScopeRef.current !== scopeId) return;
        let currentState = stateRef.current;
        try {
          const rawState = await gameRecommendationStorage.getItem(
            integrationStateStorageKey(args.game, args.playerId, args.libraryId, args.ageBand),
          );
          if (rawState) {
            currentState = restoreGameRecommendationIntegrationState(rawState, {
              game: args.game,
              anonymousPlayerId: args.playerId,
              gameSessionId,
            });
          }
        } catch (error) {
          console.warn("[game-recommendation] integration_state_read_failed", error);
        }
        setPendingReward(null);
        await persist(resetGameRecommendationSession(currentState, gameSessionId), scopeId);
      });
    });
  }, [args.ageBand, args.game, args.gameSessionId, args.libraryId, args.playerId, currentScopeId, enqueueEvidenceMutation, persist]);

  const respond = useCallback((response: GameRecommendationResponse, continuation: () => void) => {
    if (respondingRef.current) return;
    const reward = pendingReward;
    if (!reward || !stateRef.current) {
      continuation();
      return;
    }
    respondingRef.current = true;
    const scopeId = currentScopeId;
    const historyKey = gameRecommendationHistoryStorageKey({
      anonymousPlayerId: args.playerId,
      libraryId: args.libraryId,
      ageBand: args.ageBand,
    });
    const respondedAt = new Date().toISOString();
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
        await withSharedHistoryLock(historyKey, async () => {
          if (activeScopeRef.current !== scopeId) return;
          let currentState = stateRef.current;
          if (!currentState) return;
          try {
            const [rawHistory, rawIntegrationState] = await Promise.all([
              gameRecommendationStorage.getItem(historyKey),
              gameRecommendationStorage.getItem(
                integrationStateStorageKey(args.game, args.playerId, args.libraryId, args.ageBand),
              ),
            ]);
            if (rawIntegrationState) {
              currentState = restoreGameRecommendationIntegrationState(rawIntegrationState, {
                game: args.game,
                anonymousPlayerId: args.playerId,
                gameSessionId: args.gameSessionId,
              });
            }
            const latestHistory = restoreGameRecommendationHistory(rawHistory, {
              anonymousPlayerId: args.playerId,
              libraryId: args.libraryId,
              ageBand: args.ageBand,
            });
            currentState = synchronizeGameRecommendationHistory(latestHistory, currentState).state;
          } catch (error) {
            console.warn("[game-recommendation] shared_history_read_failed", error);
          }
          currentState = clearPendingReward(currentState);
          if (response === "already_read") currentState = recordFamiliarBook(currentState, reward.book.id);
          await persist(currentState, scopeId);
        });
        await queueGameRecommendationFeedbackEvent(gameRecommendationStorage, event);
      } catch (error) {
        // Best-effort: even a local persistence failure must not block play from continuing.
        console.warn("[game-recommendation] feedback_queue_failed", error);
      } finally {
        try {
          if (activeScopeRef.current === scopeId) {
            setPendingReward(null);
            continuation();
            continued = true;
          }
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
  }, [args.ageBand, args.game, args.gameSessionId, args.libraryId, args.playerId, currentScopeId, pendingReward, persist]);

  const isBookAlreadyShown = useCallback((bookId: string) => (
    stateRef.current ? isBookAlreadySeen(stateRef.current, bookId) : false
  ), []);

  return { pendingReward, notifyEvidence, retractEvidence, resetSession, respond, isBookAlreadyShown };
}

// Re-exported so screens can build a diagnostic manually for edge cases that fall outside the
// generic engine (none currently do; kept for parity/testability with the diagnostic contract).
export { createGameRecommendationDiagnosticEvent };
