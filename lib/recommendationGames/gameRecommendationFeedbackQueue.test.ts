import assert from "node:assert/strict";
import test from "node:test";
import {
  GAME_RECOMMENDATION_FEEDBACK_QUEUE_KEY,
  GAME_RECOMMENDATION_SLATE_FEEDBACK_QUEUE_KEY,
  createSerializedRecommendationQueue,
  flushGameRecommendationSlateFeedbackEvents,
  flushGameRecommendationFeedbackEvents,
  queueGameRecommendationSlateFeedbackEvent,
  queueGameRecommendationFeedbackEvent,
  readQueuedGameRecommendationSlateFeedbackEvents,
  readQueuedGameRecommendationFeedbackEvents,
  type AsyncKeyValueStorage,
} from "./gameRecommendationFeedbackQueue";
import {
  createGameRecommendationFeedbackEvent,
  createGameRecommendationSlateFeedbackEvent,
  gameRecommendationFeedbackStoragePath,
  isGameRecommendationFeedbackEventV1,
  isGameRecommendationSlateFeedbackEventV1,
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

function slateFeedback(preferredBookId: string, respondedAt: string) {
  const recommendations = [
    {
      id: "book-one:author-one",
      source: "googleBooks",
      sourceId: "book-one",
      title: "Book One",
      author: "Author One",
      rank: 1,
    },
    {
      id: "book-two:author-two",
      source: "openLibrary",
      sourceId: "book-two",
      title: "Book Two",
      author: "Author Two",
      rank: 2,
    },
  ];
  return createGameRecommendationSlateFeedbackEvent({
    game: "melanies_game",
    anonymousPlayerId: "patron-abc",
    gameSessionId: "immutable-slate",
    evidenceSnapshotVersion: "v1",
    evidenceSnapshot: {
      signalCount: 2,
      positiveSignalCount: 2,
      negativeSignalCount: 0,
      sources: ["books"],
      semanticTags: ["tone:cozy"],
    },
    evidenceMode: "semantic_only",
    recommendations,
    ranking: recommendations.map((book) => book.id),
    preferredBookId,
    ageBand: "teens",
    library: { libraryId: "yvhs", localCollectionOnly: false },
    shownAt: "2026-01-01T00:00:00.000Z",
    respondedAt,
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

test("final-slate feedback keeps one immutable response across tabs and retries", async () => {
  const storage = memoryStorage();
  const first = slateFeedback("book-one:author-one", "2026-01-01T00:00:05.000Z");
  const sameAnswer = slateFeedback("book-one:author-one", "2026-01-01T00:00:06.000Z");
  const conflictingAnswer = slateFeedback("book-two:author-two", "2026-01-01T00:00:07.000Z");

  await queueGameRecommendationSlateFeedbackEvent(storage, first);
  await queueGameRecommendationSlateFeedbackEvent(storage, sameAnswer);
  assert.deepEqual(await readQueuedGameRecommendationSlateFeedbackEvents(storage), [first]);
  await assert.rejects(
    queueGameRecommendationSlateFeedbackEvent(storage, conflictingAnswer),
    /immutable_queued_event_conflict/,
  );

  assert.deepEqual(
    await flushGameRecommendationSlateFeedbackEvents(storage, async () => true),
    { sent: 1, remaining: 0 },
  );
  await queueGameRecommendationSlateFeedbackEvent(storage, sameAnswer);
  assert.deepEqual(await readQueuedGameRecommendationSlateFeedbackEvents(storage), []);
  await assert.rejects(
    queueGameRecommendationSlateFeedbackEvent(storage, conflictingAnswer),
    /immutable_queued_event_conflict/,
  );
});

test("cross-tab slate clients reject a conflicting response while delivery is in flight", async (context) => {
  const previousNavigator = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  Object.defineProperty(globalThis, "navigator", { configurable: true, value: {} });
  context.after(() => {
    if (previousNavigator) Object.defineProperty(globalThis, "navigator", previousNavigator);
    else Reflect.deleteProperty(globalThis, "navigator");
  });
  const values = new Map<string, string>();
  const storageA = memoryStorage(values);
  const storageB = memoryStorage(values);
  const options = {
    immutableRevision: true,
    revisionFingerprint: (event: ReturnType<typeof slateFeedback>) => JSON.stringify({ ...event, respondedAt: null }),
  };
  const clientA = createSerializedRecommendationQueue(
    GAME_RECOMMENDATION_SLATE_FEEDBACK_QUEUE_KEY,
    isGameRecommendationSlateFeedbackEventV1,
    (event) => event.eventId,
    options,
  );
  const clientB = createSerializedRecommendationQueue(
    GAME_RECOMMENDATION_SLATE_FEEDBACK_QUEUE_KEY,
    isGameRecommendationSlateFeedbackEventV1,
    (event) => event.eventId,
    options,
  );
  const first = slateFeedback("book-one:author-one", "2026-01-01T00:00:05.000Z");
  const conflicting = slateFeedback("book-two:author-two", "2026-01-01T00:00:06.000Z");
  await clientA.enqueue(storageA, first);

  let startSend: () => void = () => {};
  let finishSend: () => void = () => {};
  const sendStarted = new Promise<void>((resolve) => { startSend = resolve; });
  const sendGate = new Promise<void>((resolve) => { finishSend = resolve; });
  const flushing = clientA.flush(storageA, async () => {
    startSend();
    await sendGate;
    return true;
  });
  await sendStarted;
  await assert.rejects(clientB.enqueue(storageB, conflicting), /immutable_queued_event_conflict/);
  finishSend();
  await flushing;
  await assert.rejects(clientB.enqueue(storageB, conflicting), /immutable_queued_event_conflict/);
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
