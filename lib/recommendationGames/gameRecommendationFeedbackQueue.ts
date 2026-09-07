// Durable client-side queue and same-origin sender for `game_recommendation_feedback_v1` events,
// mirroring the existing recommendation-game evidence queue pattern (see
// `lib/recommendationGames/evidenceClient.ts`) but scoped to the shared reward-response contract.
import {
  isGameRecommendationFeedbackEventV1,
  isGameRecommendationSlateFeedbackEventV1,
  type GameRecommendationFeedbackEventV1,
  type GameRecommendationSlateFeedbackEventV1,
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
export const GAME_RECOMMENDATION_SLATE_FEEDBACK_QUEUE_KEY = "novelideas_game_recommendation_slate_feedback_queue_v1";
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

type QueueOptions<T> = {
  immutableRevision?: boolean;
  revisionFingerprint?: (value: T) => string;
};

type AcceptedQueueRevision = {
  id: string;
  fingerprint: string;
};

export function createSerializedRecommendationQueue<T>(
  storageKey: string,
  isValid: (value: unknown) => value is T,
  identity: (value: T) => string,
  options: QueueOptions<T> = {},
): QueueClient<T> {
  const acceptedKey = `${storageKey}:accepted`;
  const revisionFingerprint = options.revisionFingerprint || JSON.stringify;
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

  async function readAccepted(storage: AsyncKeyValueStorage): Promise<AcceptedQueueRevision[]> {
    if (!options.immutableRevision) return [];
    const raw = await storage.getItem(acceptedKey);
    if (!raw) return [];
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed)
        ? parsed.filter((value): value is AcceptedQueueRevision => (
          value
          && typeof value === "object"
          && typeof value.id === "string"
          && typeof value.fingerprint === "string"
        ))
        : [];
    } catch {
      return [];
    }
  }

  async function enqueue(storage: AsyncKeyValueStorage, value: T): Promise<void> {
    if (!isValid(value)) throw new Error("invalid_queued_event");
    return serialize(storage, async (assertOwnership) => {
      const id = identity(value);
      const fingerprint = revisionFingerprint(value);
      const accepted = await readAccepted(storage);
      const acceptedRevision = accepted.find((candidate) => candidate.id === id);
      if (acceptedRevision) {
        if (acceptedRevision.fingerprint !== fingerprint) throw new Error("immutable_queued_event_conflict");
        return;
      }
      const queued = await read(storage);
      const existingIndex = queued.findIndex((candidate) => identity(candidate) === id);
      if (existingIndex >= 0) {
        if (options.immutableRevision) {
          if (revisionFingerprint(queued[existingIndex]) !== fingerprint) {
            throw new Error("immutable_queued_event_conflict");
          }
          return;
        }
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
    const sentValues = new Map<string, { serialized: string; fingerprint: string }>();
    let sent = 0;
    for (const value of queued) {
      try {
        if (await send(value)) {
          sent += 1;
          sentValues.set(identity(value), {
            serialized: JSON.stringify(value),
            fingerprint: revisionFingerprint(value),
          });
        }
      } catch {}
    }
    return serialize(storage, async (assertOwnership) => {
      const latest = await read(storage);
      const accepted = await readAccepted(storage);
      const acceptedById = new Map(accepted.map((value) => [value.id, value.fingerprint]));
      const remainingById = new Map<string, T>();
      for (const value of latest) {
        const sentValue = sentValues.get(identity(value));
        if (sentValue === undefined || sentValue.serialized !== JSON.stringify(value)) {
          remainingById.set(identity(value), value);
        } else if (options.immutableRevision) {
          acceptedById.set(identity(value), sentValue.fingerprint);
        }
      }
      if (options.immutableRevision) {
        await assertOwnership();
        await storage.setItem(
          acceptedKey,
          JSON.stringify([...acceptedById].slice(-200).map(([id, fingerprint]) => ({ id, fingerprint }))),
        );
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

const slateFeedbackQueue = createSerializedRecommendationQueue<GameRecommendationSlateFeedbackEventV1>(
  GAME_RECOMMENDATION_SLATE_FEEDBACK_QUEUE_KEY,
  isGameRecommendationSlateFeedbackEventV1,
  (event) => event.eventId,
  {
    immutableRevision: true,
    revisionFingerprint: (event) => JSON.stringify({ ...event, respondedAt: null }),
  },
);

export const readQueuedGameRecommendationFeedbackEvents = feedbackQueue.read;
export const queueGameRecommendationFeedbackEvent = feedbackQueue.enqueue;
export const flushGameRecommendationFeedbackEvents = feedbackQueue.flush;
export const readQueuedGameRecommendationSlateFeedbackEvents = slateFeedbackQueue.read;
export const queueGameRecommendationSlateFeedbackEvent = slateFeedbackQueue.enqueue;
export const flushGameRecommendationSlateFeedbackEvents = slateFeedbackQueue.flush;

export const readQueuedGameRecommendationDiagnosticEvents = diagnosticQueue.read;
export const queueGameRecommendationDiagnosticEvent = diagnosticQueue.enqueue;
export const flushGameRecommendationDiagnosticEvents = diagnosticQueue.flush;
