import assert from "node:assert/strict";
import test from "node:test";
import {
  flushGameRecommendationFeedbackEvents,
  queueGameRecommendationFeedbackEvent,
  readQueuedGameRecommendationFeedbackEvents,
  type AsyncKeyValueStorage,
} from "./gameRecommendationFeedbackQueue";
import { createGameRecommendationFeedbackEvent } from "./gameRecommendationFeedback";

function memoryStorage(): AsyncKeyValueStorage {
  const values = new Map<string, string>();
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
