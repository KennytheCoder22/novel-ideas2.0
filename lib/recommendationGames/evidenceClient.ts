import {
  LAST_BOOKSHOP_EVENT_QUEUE_KEY,
  type RecommendationGameEventV1,
  isRecommendationGameEventV1,
} from "./lastBookshop";

export type AsyncKeyValueStorage = {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
};

let queueMutation: Promise<unknown> = Promise.resolve();

function serializeQueueMutation<T>(work: () => Promise<T>): Promise<T> {
  const result = queueMutation.catch(() => undefined).then(work);
  queueMutation = result.then(() => undefined, () => undefined);
  return result;
}

export async function readQueuedRecommendationGameEvents(
  storage: AsyncKeyValueStorage,
): Promise<RecommendationGameEventV1[]> {
  const raw = await storage.getItem(LAST_BOOKSHOP_EVENT_QUEUE_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(isRecommendationGameEventV1) : [];
  } catch {
    return [];
  }
}

export async function queueRecommendationGameEvent(
  storage: AsyncKeyValueStorage,
  event: RecommendationGameEventV1,
): Promise<void> {
  if (!isRecommendationGameEventV1(event)) throw new Error("invalid_recommendation_game_event");
  return serializeQueueMutation(async () => {
    const queued = await readQueuedRecommendationGameEvents(storage);
    if (queued.some((candidate) => candidate.eventId === event.eventId)) return;
    await storage.setItem(LAST_BOOKSHOP_EVENT_QUEUE_KEY, JSON.stringify([...queued, event].slice(-200)));
  });
}

export async function flushRecommendationGameEvents(
  storage: AsyncKeyValueStorage,
  send: (event: RecommendationGameEventV1) => Promise<boolean>,
): Promise<{ sent: number; remaining: number }> {
  return serializeQueueMutation(async () => {
    const queued = await readQueuedRecommendationGameEvents(storage);
    const remaining: RecommendationGameEventV1[] = [];
    let sent = 0;
    for (const event of queued) {
      try {
        if (await send(event)) sent += 1;
        else remaining.push(event);
      } catch {
        remaining.push(event);
      }
    }
    await storage.setItem(LAST_BOOKSHOP_EVENT_QUEUE_KEY, JSON.stringify(remaining));
    return { sent, remaining: remaining.length };
  });
}
