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

export const GAME_RECOMMENDATION_FEEDBACK_QUEUE_KEY = "novelideas_game_recommendation_feedback_queue_v1";
export const GAME_RECOMMENDATION_DIAGNOSTIC_QUEUE_KEY = "novelideas_game_recommendation_diagnostic_queue_v1";

export type AsyncKeyValueStorage = {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
};

function createQueue<T>(storageKey: string, isValid: (value: unknown) => value is T, identity: (value: T) => string) {
  let queueMutation: Promise<unknown> = Promise.resolve();
  function serialize<R>(work: () => Promise<R>): Promise<R> {
    const result = queueMutation.catch(() => undefined).then(work);
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
    return serialize(async () => {
      const queued = await read(storage);
      const existingIndex = queued.findIndex((candidate) => identity(candidate) === identity(value));
      if (existingIndex >= 0) {
        queued[existingIndex] = value;
        await storage.setItem(storageKey, JSON.stringify(queued));
        return;
      }
      await storage.setItem(storageKey, JSON.stringify([...queued, value].slice(-200)));
    });
  }

  async function flush(
    storage: AsyncKeyValueStorage,
    send: (value: T) => Promise<boolean>,
  ): Promise<{ sent: number; remaining: number }> {
    return serialize(async () => {
      const queued = await read(storage);
      const remaining: T[] = [];
      let sent = 0;
      for (const value of queued) {
        try {
          if (await send(value)) sent += 1;
          else remaining.push(value);
        } catch {
          remaining.push(value);
        }
      }
      await storage.setItem(storageKey, JSON.stringify(remaining));
      return { sent, remaining: remaining.length };
    });
  }

  return { read, enqueue, flush };
}

const feedbackQueue = createQueue<GameRecommendationFeedbackEventV1>(
  GAME_RECOMMENDATION_FEEDBACK_QUEUE_KEY,
  isGameRecommendationFeedbackEventV1,
  (event) => event.eventId,
);

const diagnosticQueue = createQueue<GameRecommendationDiagnosticEventV1>(
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
