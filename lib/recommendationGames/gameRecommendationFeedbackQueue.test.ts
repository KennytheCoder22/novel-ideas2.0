import assert from "node:assert/strict";
import test from "node:test";
import {
  GAME_RECOMMENDATION_FEEDBACK_QUEUE_KEY,
  createSerializedRecommendationQueue,
  flushGameRecommendationFeedbackEvents,
  queueGameRecommendationFeedbackEvent,
  readQueuedGameRecommendationFeedbackEvents,
  type AsyncKeyValueStorage,
} from "./gameRecommendationFeedbackQueue";
import {
  createGameRecommendationFeedbackEvent,
  gameRecommendationFeedbackStoragePath,
  isGameRecommendationFeedbackEventV1,
} from "./gameRecommendationFeedback";

function memoryStorage(values = new Map<string, string>()): AsyncKeyValueStorage {
  return {
    getItem: async (key) => values.get(key) ?? null,
    setItem: async (key, value) => {
      values.set(key, value);
    },
  };
}

function feedback(gameSessionId: string) {
  return createGameRecommendationFeedbackEvent({
    game: "media_mania",
    anonymousPlayerId: "patron-abc",
    gameSessionId,
    milestoneIndex: 1,
    evidenceCount: 6,
    evidenceSnapshotVersion: "v1",
    evidenceSnapshot: {
      signalCount: 2,
      positiveSignalCount: 1,
      negativeSignalCount: 1,
      sources: ["books", "movies"],
      semanticTags: ["tone:cozy"],
    },
    evidenceMode: "cross_media",
    book: {
      id: "atlas-of-small-stars:e-vesper",
      source: "googleBooks",
      sourceId: "abc123",
      title: "Atlas of Small Stars",
      author: "E. Vesper",
      rank: 1,
    },
    response: "maybe",
    ageBand: "teens",
    library: { libraryId: "yvhs", localCollectionOnly: false },
    shownAt: "2026-01-01T00:00:00.000Z",
    respondedAt: "2026-01-01T00:00:05.000Z",
  });
}

test("feedback is durably queued, deduplicated, flushed, and removed after delivery", async () => {
  const storage = memoryStorage();
  const event = feedback("session-1");
  await queueGameRecommendationFeedbackEvent(storage, event);
  const continued = { ...event, continuedAt: "2026-01-01T00:00:06.000Z" };
  await queueGameRecommendationFeedbackEvent(storage, continued);
  assert.equal((await readQueuedGameRecommendationFeedbackEvents(storage)).length, 1);
  assert.equal((await readQueuedGameRecommendationFeedbackEvents(storage))[0]?.continuedAt, continued.continuedAt);

  const sent: string[] = [];
  const result = await flushGameRecommendationFeedbackEvents(storage, async (queued) => {
    sent.push(queued.eventId);
    return true;
  });
  assert.deepEqual(result, { sent: 1, remaining: 0 });
  assert.deepEqual(sent, [event.eventId]);
  assert.deepEqual(await readQueuedGameRecommendationFeedbackEvents(storage), []);
});

test("failed feedback delivery stays queued for a later launch", async () => {
  const storage = memoryStorage();
  const event = feedback("session-2");
  await queueGameRecommendationFeedbackEvent(storage, event);
  const result = await flushGameRecommendationFeedbackEvents(storage, async () => false);
  assert.deepEqual(result, { sent: 0, remaining: 1 });
  assert.equal((await readQueuedGameRecommendationFeedbackEvents(storage))[0]?.eventId, event.eventId);
});

test("response and continued revisions use distinct immutable server paths", () => {
  const response = feedback("revision-path");
  const continued = { ...response, continuedAt: "2026-01-01T00:00:06.000Z" };
  assert.notEqual(
    gameRecommendationFeedbackStoragePath(response),
    gameRecommendationFeedbackStoragePath(continued),
  );
  assert.match(gameRecommendationFeedbackStoragePath(response), /\/response\.json$/);
  assert.match(gameRecommendationFeedbackStoragePath(continued), /\/continued-/);
});

test("cross-tab enqueue and flush preserve concurrent and failed feedback without Web Locks", async (context) => {
  const previousNavigator = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  Object.defineProperty(globalThis, "navigator", { configurable: true, value: {} });
  context.after(() => {
    if (previousNavigator) Object.defineProperty(globalThis, "navigator", previousNavigator);
    else Reflect.deleteProperty(globalThis, "navigator");
  });
  const sharedValues = new Map<string, string>();
  const storageA = memoryStorage(sharedValues);
  const storageB = memoryStorage(sharedValues);
  const clientA = createSerializedRecommendationQueue(
    GAME_RECOMMENDATION_FEEDBACK_QUEUE_KEY,
    isGameRecommendationFeedbackEventV1,
    (event) => event.eventId,
  );
  const clientB = createSerializedRecommendationQueue(
    GAME_RECOMMENDATION_FEEDBACK_QUEUE_KEY,
    isGameRecommendationFeedbackEventV1,
    (event) => event.eventId,
  );
  const first = feedback("cross-tab-1");
  const failed = feedback("cross-tab-2");
  const concurrent = feedback("cross-tab-3");
  await Promise.all([
    clientA.enqueue(storageA, first),
    clientB.enqueue(storageB, failed),
  ]);
  assert.deepEqual(
    new Set((await clientA.read(storageA)).map((event) => event.eventId)),
    new Set([first.eventId, failed.eventId]),
    "interleaved clients must not overwrite each other's enqueues without Web Locks",
  );

  let releaseSend: () => void = () => {};
  let markSendStarted: () => void = () => {};
  const sendStarted = new Promise<void>((resolve) => {
    markSendStarted = resolve;
  });
  const sendGate = new Promise<void>((resolve) => {
    releaseSend = resolve;
  });
  const sends = new Map<string, number>();
  const sender = async (event: ReturnType<typeof feedback>) => {
    sends.set(event.eventId, (sends.get(event.eventId) || 0) + 1);
    if (event.eventId === first.eventId && sends.get(event.eventId) === 1) {
      markSendStarted();
      await sendGate;
    }
    return event.eventId !== failed.eventId;
  };

  const flushA = clientA.flush(storageA, sender);
  await sendStarted;
  const flushB = clientB.flush(storageB, sender);
  const enqueueDuringFlush = clientB.enqueue(storageB, concurrent);
  releaseSend();
  await Promise.all([flushA, flushB, enqueueDuringFlush]);

  const remaining = await clientA.read(storageA);
  assert.deepEqual(
    new Set(remaining.map((event) => event.eventId)),
    new Set([failed.eventId, concurrent.eventId]),
    "failed and concurrently added feedback must survive replacement",
  );
  assert.ok((sends.get(first.eventId) || 0) >= 1,
    "concurrent flushes must retain the stable event ID for idempotent delivery");
});

test("a stale failed flush does not resurrect feedback another client delivered", async (context) => {
  const previousNavigator = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  Object.defineProperty(globalThis, "navigator", { configurable: true, value: {} });
  context.after(() => {
    if (previousNavigator) Object.defineProperty(globalThis, "navigator", previousNavigator);
    else Reflect.deleteProperty(globalThis, "navigator");
  });
  const values = new Map<string, string>();
  const storageA = memoryStorage(values);
  const storageB = memoryStorage(values);
  const clientA = createSerializedRecommendationQueue(
    GAME_RECOMMENDATION_FEEDBACK_QUEUE_KEY,
    isGameRecommendationFeedbackEventV1,
    (event) => event.eventId,
  );
  const clientB = createSerializedRecommendationQueue(
    GAME_RECOMMENDATION_FEEDBACK_QUEUE_KEY,
    isGameRecommendationFeedbackEventV1,
    (event) => event.eventId,
  );
  await clientA.enqueue(storageA, feedback("stale-failure"));
  let releaseFailure: () => void = () => {};
  let markFailureStarted: () => void = () => {};
  const failureStarted = new Promise<void>((resolve) => {
    markFailureStarted = resolve;
  });
  const failureGate = new Promise<void>((resolve) => {
    releaseFailure = resolve;
  });
  const staleFlush = clientA.flush(storageA, async () => {
    markFailureStarted();
    await failureGate;
    return false;
  });
  await failureStarted;
  const successfulFlush = clientB.flush(storageB, async () => true);
  await successfulFlush;
  releaseFailure();
  await staleFlush;
  assert.deepEqual(await clientA.read(storageA), []);
});
