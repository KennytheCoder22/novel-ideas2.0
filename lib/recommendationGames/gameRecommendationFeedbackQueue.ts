// Durable client-side queue and same-origin sender for `game_recommendation_feedback_v1` events,
// mirroring the existing recommendation-game evidence queue pattern (see
// `lib/recommendationGames/evidenceClient.ts`) but scoped to the shared reward-response contract.
import {
  isGameRecommendationFeedbackEventV1,
  type GameRecommendationFeedbackEventV1,
} from "./gameRecommendationFeedback";
import {
  isGameRecommendationDiagnosticEventV1,
  type GameRecommendationDiagnosticEventV1,
} from "./gameRecommendationDiagnostics";
import {
  withCrossTabStorageLock,
  type AssertCrossTabLockOwnership,
} from "./crossTabStorageLock";

export const GAME_RECOMMENDATION_FEEDBACK_QUEUE_KEY = "novelideas_game_recommendation_feedback_queue_v1";
export const GAME_RECOMMENDATION_DIAGNOSTIC_QUEUE_KEY = "novelideas_game_recommendation_diagnostic_queue_v1";

export type AsyncKeyValueStorage = {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
};

type QueueClient<T> = {
  read(storage: AsyncKeyValueStorage): Promise<T[]>;
  enqueue(storage: AsyncKeyValueStorage, value: T): Promise<void>;
  flush(
    storage: AsyncKeyValueStorage,
    send: (value: T) => Promise<boolean>,
  ): Promise<{ sent: number; remaining: number }>;
};

export function createSerializedRecommendationQueue<T>(
  storageKey: string,
  isValid: (value: unknown) => value is T,
  identity: (value: T) => string,
): QueueClient<T> {
  let queueMutation: Promise<unknown> = Promise.resolve();
  function serialize<R>(
    storage: AsyncKeyValueStorage,
    work: (assertOwnership: AssertCrossTabLockOwnership) => Promise<R>,
  ): Promise<R> {
    const run = () => withCrossTabStorageLock(storage, `recommendation-queue:${storageKey}`, work);
    const result = queueMutation.catch(() => undefined).then(run);
    queueMutation = result.then(() => undefined, () => undefined);
    return result;
  }

  async function read(storage: AsyncKeyValueStorage): Promise<T[]> {
    const raw = await storage.getItem(storageKey);
    if (!raw) return [];
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed.filter(isValid) : [];
    } catch {
      return [];
    }
  }

  async function enqueue(storage: AsyncKeyValueStorage, value: T): Promise<void> {
    if (!isValid(value)) throw new Error("invalid_queued_event");
    return serialize(storage, async (assertOwnership) => {
      const queued = await read(storage);
      const existingIndex = queued.findIndex((candidate) => identity(candidate) === identity(value));
      if (existingIndex >= 0) {
        queued[existingIndex] = value;
        await assertOwnership();
        await storage.setItem(storageKey, JSON.stringify(queued));
        return;
      }
      await assertOwnership();
      await storage.setItem(storageKey, JSON.stringify([...queued, value].slice(-200)));
    });
  }

  async function flush(
    storage: AsyncKeyValueStorage,
    send: (value: T) => Promise<boolean>,
  ): Promise<{ sent: number; remaining: number }> {
    const queued = await serialize(storage, () => read(storage));
    const sentValues = new Map<string, string>();
    let sent = 0;
    for (const value of queued) {
      try {
        if (await send(value)) {
          sent += 1;
          sentValues.set(identity(value), JSON.stringify(value));
        }
      } catch {}
    }
    return serialize(storage, async (assertOwnership) => {
      const latest = await read(storage);
      const remainingById = new Map<string, T>();
      for (const value of latest) {
        const sentValue = sentValues.get(identity(value));
        if (sentValue === undefined || sentValue !== JSON.stringify(value)) {
          remainingById.set(identity(value), value);
        }
      }
      const remaining = [...remainingById.values()].slice(-200);
      await assertOwnership();
      await storage.setItem(storageKey, JSON.stringify(remaining));
      return { sent, remaining: remaining.length };
    });
  }

  return { read, enqueue, flush };
}

const feedbackQueue = createSerializedRecommendationQueue<GameRecommendationFeedbackEventV1>(
  GAME_RECOMMENDATION_FEEDBACK_QUEUE_KEY,
  isGameRecommendationFeedbackEventV1,
  (event) => event.eventId,
);

const diagnosticQueue = createSerializedRecommendationQueue<GameRecommendationDiagnosticEventV1>(
  GAME_RECOMMENDATION_DIAGNOSTIC_QUEUE_KEY,
  isGameRecommendationDiagnosticEventV1,
  (event) => event.eventId,
);

export const readQueuedGameRecommendationFeedbackEvents = feedbackQueue.read;
export const queueGameRecommendationFeedbackEvent = feedbackQueue.enqueue;
export const flushGameRecommendationFeedbackEvents = feedbackQueue.flush;

export const readQueuedGameRecommendationDiagnosticEvents = diagnosticQueue.read;
export const queueGameRecommendationDiagnosticEvent = diagnosticQueue.enqueue;
export const flushGameRecommendationDiagnosticEvents = diagnosticQueue.flush;
