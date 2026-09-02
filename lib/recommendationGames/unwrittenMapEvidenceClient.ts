import {
  UNWRITTEN_MAP_EVENT_QUEUE_KEY,
  isUnwrittenMapChoiceEventV1,
  type UnwrittenMapChoiceEventV1,
} from "./unwrittenMap";
import type { AsyncKeyValueStorage } from "./evidenceClient";

type QueuedUnwrittenMapEvent = {
  event: UnwrittenMapChoiceEventV1;
  committed: boolean;
};

let queueMutation: Promise<unknown> = Promise.resolve();

function serializeQueueMutation<T>(work: () => Promise<T>): Promise<T> {
  const result = queueMutation.catch(() => undefined).then(work);
  queueMutation = result.then(() => undefined, () => undefined);
  return result;
}

async function readQueueEntries(
  storage: AsyncKeyValueStorage,
): Promise<QueuedUnwrittenMapEvent[]> {
  const raw = await storage.getItem(UNWRITTEN_MAP_EVENT_QUEUE_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.filter((entry): entry is QueuedUnwrittenMapEvent =>
          Boolean(entry)
          && typeof entry === "object"
          && typeof entry.committed === "boolean"
          && isUnwrittenMapChoiceEventV1(entry.event))
      : [];
  } catch {
    return [];
  }
}

export async function readQueuedUnwrittenMapEvents(
  storage: AsyncKeyValueStorage,
): Promise<UnwrittenMapChoiceEventV1[]> {
  return (await readQueueEntries(storage)).map((entry) => entry.event);
}

export async function queueUnwrittenMapEvent(
  storage: AsyncKeyValueStorage,
  event: UnwrittenMapChoiceEventV1,
): Promise<void> {
  if (!isUnwrittenMapChoiceEventV1(event)) throw new Error("invalid_unwritten_map_event");
  return serializeQueueMutation(async () => {
    const queued = await readQueueEntries(storage);
    const existingIndex = queued.findIndex((candidate) => candidate.event.eventId === event.eventId);
    if (existingIndex >= 0) return;
    await storage.setItem(
      UNWRITTEN_MAP_EVENT_QUEUE_KEY,
      JSON.stringify([...queued, { event, committed: false }].slice(-300)),
    );
  });
}

export async function commitUnwrittenMapEvent(
  storage: AsyncKeyValueStorage,
  eventId: string,
): Promise<void> {
  return serializeQueueMutation(async () => {
    const queued = await readQueueEntries(storage);
    const next = queued.map((entry) =>
      entry.event.eventId === eventId ? { ...entry, committed: true } : entry);
    if (!next.some((entry) => entry.event.eventId === eventId)) throw new Error("queued_map_event_missing");
    await storage.setItem(UNWRITTEN_MAP_EVENT_QUEUE_KEY, JSON.stringify(next));
  });
}

export async function reconcileUnwrittenMapEvents(
  storage: AsyncKeyValueStorage,
  save: { anonymousPlayerId: string; decisions: { scenarioId: string; optionId: string }[] },
): Promise<void> {
  return serializeQueueMutation(async () => {
    const queued = await readQueueEntries(storage);
    const next = queued.map((entry) => {
      const matchesCommittedChoice = entry.event.anonymousPlayerId === save.anonymousPlayerId
        && save.decisions.some((decision) =>
          decision.scenarioId === entry.event.scenarioId
          && decision.optionId === entry.event.selectedOptionId);
      return matchesCommittedChoice ? { ...entry, committed: true } : entry;
    });
    await storage.setItem(UNWRITTEN_MAP_EVENT_QUEUE_KEY, JSON.stringify(next));
  });
}

export async function flushUnwrittenMapEvents(
  storage: AsyncKeyValueStorage,
  send: (event: UnwrittenMapChoiceEventV1) => Promise<boolean>,
): Promise<{ sent: number; remaining: number }> {
  return serializeQueueMutation(async () => {
    const queued = await readQueueEntries(storage);
    const remaining: QueuedUnwrittenMapEvent[] = [];
    let sent = 0;
    for (const entry of queued) {
      if (!entry.committed) {
        remaining.push(entry);
        continue;
      }
      try {
        if (await send(entry.event)) sent += 1;
        else remaining.push(entry);
      } catch {
        remaining.push(entry);
      }
    }
    await storage.setItem(UNWRITTEN_MAP_EVENT_QUEUE_KEY, JSON.stringify(remaining));
    return { sent, remaining: remaining.length };
  });
}
