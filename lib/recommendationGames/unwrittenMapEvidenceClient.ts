import {
  UNWRITTEN_MAP_EVENT_QUEUE_KEY,
  UNWRITTEN_MAP_SAVE_KEY,
  UNWRITTEN_MAP_SCENARIOS,
  UNWRITTEN_MAP_START,
  UNWRITTEN_MAP_V1_EVENT_QUEUE_KEY,
  UNWRITTEN_MAP_V1_MIGRATION_KEY,
  UNWRITTEN_MAP_V1_SAVE_KEY,
  createEncounterPresentedEvent,
  isUnwrittenMapChoiceEventV1,
  isUnwrittenMapEventV2,
  isUnwrittenMapJourneyComplete,
  migrateUnwrittenMapSaveV1,
  monotonicUnwrittenMapTimestamp,
  moveOnMap,
  orderedChoices,
  recordDurableUnwrittenMapEvent,
  restoreUnwrittenMapSave,
  scenarioAt,
  scopedQueueKey,
  scopedSaveKey,
  startEncounterAttempt,
  updateMapPosition,
  type MapDirection,
  type UnwrittenMapChoiceEventV1,
  type UnwrittenMapEvent,
  type UnwrittenMapEventV2,
  type UnwrittenMapSaveV2,
} from "./unwrittenMap";
import type { AsyncKeyValueStorage } from "./evidenceClient";

type QueuedUnwrittenMapEvent = {
  event: UnwrittenMapEventV2;
  committed: boolean;
  operationId?: string;
  baseRevision?: number;
  preparedSave?: UnwrittenMapSaveV2;
};

type QueuedLegacyUnwrittenMapEvent = {
  event: UnwrittenMapChoiceEventV1;
  committed: boolean;
};

type LegacyMigrationOwner = {
  version: 1;
  ownerScopeKey: string;
  legacyPlayerId: string;
  status: "claimed" | "complete";
};

export const UNWRITTEN_MAP_EVENT_QUEUE_CAPACITY = 500;
export const UNWRITTEN_MAP_FLUSH_BATCH_SIZE = 20;
export const UNWRITTEN_MAP_FLUSH_CONCURRENCY = 4;
export const UNWRITTEN_MAP_SEND_TIMEOUT_MS = 10_000;

const inFlightEventIds = new Set<string>();
const saveTransactions = new WeakMap<object, Map<string, Promise<unknown>>>();

export function serializeUnwrittenMapTransaction<T>(
  storage: AsyncKeyValueStorage,
  scopeKey: string | undefined,
  work: () => Promise<T>,
): Promise<T> {
  const storageKey = storage as object;
  const scope = scopeKey || "global";
  const transactions = saveTransactions.get(storageKey) || new Map<string, Promise<unknown>>();
  saveTransactions.set(storageKey, transactions);
  const prior = transactions.get(scope) || Promise.resolve();
  const run = async () => {
    const locks = (globalThis as unknown as {
      navigator?: { locks?: { request<R>(name: string, callback: () => Promise<R>): Promise<R> } };
    }).navigator?.locks;
    return locks
      ? locks.request(`novelideas-unwritten-map:${scope}`, work)
      : work();
  };
  const result = prior.catch(() => undefined).then(run);
  transactions.set(scope, result.then(() => undefined, () => undefined));
  return result;
}

function serializeLegacyQueueAndScope<T>(
  storage: AsyncKeyValueStorage,
  scopeKey: string | undefined,
  work: () => Promise<T>,
): Promise<T> {
  return serializeUnwrittenMapTransaction(storage, "legacy-migration",
    () => serializeUnwrittenMapTransaction(storage, scopeKey, work));
}

type UnwrittenMapOperation = {
  event?: UnwrittenMapEventV2;
  nextSave: UnwrittenMapSaveV2;
};

function validOperationId(operationId: string): boolean {
  return operationId.length >= 3 && operationId.length <= 200
    && /^[a-zA-Z0-9:._-]+$/.test(operationId);
}

async function writeSaveRevision(
  storage: AsyncKeyValueStorage,
  key: string,
  next: UnwrittenMapSaveV2,
  expectedRevision: number,
): Promise<void> {
  const serialized = JSON.stringify(next);
  if (JSON.stringify(restoreUnwrittenMapSave(serialized, next.libraryScopeId)) !== serialized) {
    throw new Error("invalid_unwritten_map_transaction_save");
  }
  const before = restoreUnwrittenMapSave(await storage.getItem(key), next.libraryScopeId);
  if (!before || before.revision !== expectedRevision) throw new Error("unwritten_map_save_revision_conflict");
  await storage.setItem(key, serialized);
  const confirmed = restoreUnwrittenMapSave(await storage.getItem(key), next.libraryScopeId);
  if (!confirmed || confirmed.revision !== next.revision
    || confirmed.lastOperationId !== next.lastOperationId
    || JSON.stringify(confirmed) !== serialized) {
    throw new Error("unwritten_map_save_cas_failed");
  }
}

function durableOperationSave(
  current: UnwrittenMapSaveV2,
  nextSave: UnwrittenMapSaveV2,
  operationId: string,
  eventId?: string,
  queuedIds: readonly string[] = [],
): UnwrittenMapSaveV2 {
  if (nextSave.anonymousPlayerId !== current.anonymousPlayerId
    || nextSave.libraryScopeId !== current.libraryScopeId
    || nextSave.revision !== current.revision) {
    throw new Error("invalid_unwritten_map_transaction_save");
  }
  if (Date.parse(nextSave.updatedAt) < Date.parse(current.updatedAt)) {
    throw new Error("unwritten_map_timestamp_rollback");
  }
  const advanced = {
    ...nextSave,
    revision: current.revision + 1,
    lastOperationId: operationId,
  };
  const durable = eventId
    ? recordDurableUnwrittenMapEvent(advanced, eventId, queuedIds)
    : advanced;
  if (JSON.stringify(restoreUnwrittenMapSave(
    JSON.stringify(durable),
    current.libraryScopeId,
  )) !== JSON.stringify(durable)) {
    throw new Error("invalid_unwritten_map_transaction_save");
  }
  return durable;
}

async function commitQueueEntry(
  storage: AsyncKeyValueStorage,
  eventId: string,
  scopeKey?: string,
): Promise<void> {
  const queued = await readQueueEntries(storage, scopeKey);
  const target = queued.find((entry) => entry.event.eventId === eventId);
  if (!target) throw new Error("queued_map_event_missing");
  const durableSave = restoreUnwrittenMapSave(
    await storage.getItem(saveKey(scopeKey)),
    target.event.libraryScopeId,
  );
  if (!durableSave?.committedEventIds.includes(eventId)) throw new Error("unwritten_map_event_not_durable");
  const next = queued.map((entry) => entry.event.eventId === eventId
    ? { event: entry.event, committed: true, ...(entry.operationId ? { operationId: entry.operationId } : {}) }
    : entry);
  await storage.setItem(queueKey(scopeKey), JSON.stringify(next));
}

async function recoverPreparedTransactions(
  storage: AsyncKeyValueStorage,
  scopeKey: string,
  libraryScopeId: string,
  initial?: UnwrittenMapSaveV2 | null,
): Promise<UnwrittenMapSaveV2 | null> {
  let current = initial === undefined
    ? restoreUnwrittenMapSave(await storage.getItem(scopedSaveKey(scopeKey)), libraryScopeId)
    : initial;
  const queued = await readQueueEntries(storage, scopeKey);
  for (const interrupted of queued.filter((entry) => !entry.committed && entry.preparedSave)) {
    if (!current) throw new Error("unwritten_map_save_missing");
    if (current.committedEventIds.includes(interrupted.event.eventId)) {
      await commitQueueEntry(storage, interrupted.event.eventId, scopeKey);
      continue;
    }
    if (interrupted.baseRevision !== current.revision || !interrupted.preparedSave) {
      throw new Error("unwritten_map_transaction_conflict");
    }
    await writeSaveRevision(
      storage,
      scopedSaveKey(scopeKey),
      interrupted.preparedSave,
      current.revision,
    );
    current = interrupted.preparedSave;
    await commitQueueEntry(storage, interrupted.event.eventId, scopeKey);
  }
  return current;
}

async function queueOperation(
  storage: AsyncKeyValueStorage,
  scopeKey: string,
  entry: QueuedUnwrittenMapEvent,
): Promise<void> {
  const queued = await readQueueEntries(storage, scopeKey);
  const existingId = queued.find((candidate) => candidate.event.eventId === entry.event.eventId);
  const existingOperation = entry.operationId
    ? queued.find((candidate) => candidate.operationId === entry.operationId)
    : undefined;
  const existing = existingId || existingOperation;
  if (existing) {
    if (JSON.stringify(existing.event) !== JSON.stringify(entry.event)
      || (existing.operationId && existing.operationId !== entry.operationId)) {
      throw new Error("conflicting_unwritten_map_event_id");
    }
    return;
  }
  const capacity = entry.event.eventType === "session_exited"
    ? UNWRITTEN_MAP_EVENT_QUEUE_CAPACITY
    : entry.event.eventType === "session_completed"
      ? UNWRITTEN_MAP_EVENT_QUEUE_CAPACITY - 1
      : UNWRITTEN_MAP_EVENT_QUEUE_CAPACITY - 2;
  if (queued.length >= capacity) throw new Error("unwritten_map_event_queue_capacity_exceeded");
  await storage.setItem(queueKey(scopeKey), JSON.stringify([...queued, entry]));
}

export async function transactUnwrittenMapOperation(
  storage: AsyncKeyValueStorage,
  scopeKey: string,
  libraryScopeId: string,
  operationId: string,
  derive: (current: UnwrittenMapSaveV2) => UnwrittenMapOperation,
): Promise<UnwrittenMapSaveV2> {
  if (!validOperationId(operationId)) throw new Error("invalid_unwritten_map_operation_id");
  const execute = () => serializeUnwrittenMapTransaction(storage, scopeKey, async () => {
    let current = restoreUnwrittenMapSave(
      await storage.getItem(scopedSaveKey(scopeKey)),
      libraryScopeId,
    );
    if (!current) throw new Error("unwritten_map_save_missing");

    current = await recoverPreparedTransactions(storage, scopeKey, libraryScopeId, current) || current;
    let queued = await readQueueEntries(storage, scopeKey);
    const pending = queued.find((entry) => entry.operationId === operationId);
    if (current.lastOperationId === operationId || (pending
      && current.committedEventIds.includes(pending.event.eventId))) {
      if (pending && !pending.committed) await commitQueueEntry(storage, pending.event.eventId, scopeKey);
      return current;
    }
    const transaction = derive(current);
    if (transaction.event && !isUnwrittenMapEventV2(transaction.event)) {
      throw new Error("invalid_unwritten_map_event");
    }
    const uncommittedIds = queued.filter((entry) => !entry.committed)
      .map((entry) => entry.event.eventId);
    if (!transaction.event) {
      const saveOnly = durableOperationSave(current, transaction.nextSave, operationId);
      await writeSaveRevision(storage, scopedSaveKey(scopeKey), saveOnly, current.revision);
      return saveOnly;
    }
    const durableSave = durableOperationSave(
      current,
      transaction.nextSave,
      operationId,
      transaction.event.eventId,
      uncommittedIds,
    );
    await queueOperation(storage, scopeKey, {
      event: transaction.event,
      committed: false,
      operationId,
      baseRevision: current.revision,
      preparedSave: durableSave,
    });
    await writeSaveRevision(storage, scopedSaveKey(scopeKey), durableSave, current.revision);
    await commitQueueEntry(storage, transaction.event.eventId, scopeKey);
    return durableSave;
  });
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await execute();
    } catch (error) {
      if (!(error instanceof Error) || error.message !== "unwritten_map_save_cas_failed"
        || attempt === 2) throw error;
    }
  }
  throw new Error("unwritten_map_save_cas_failed");
}

export function transactUnwrittenMapEvent(
  storage: AsyncKeyValueStorage,
  scopeKey: string,
  libraryScopeId: string,
  operationId: string,
  derive: (current: UnwrittenMapSaveV2) => { event: UnwrittenMapEventV2; nextSave: UnwrittenMapSaveV2 },
): Promise<UnwrittenMapSaveV2> {
  return transactUnwrittenMapOperation(storage, scopeKey, libraryScopeId, operationId, derive);
}

export function transactUnwrittenMapCompletion(
  storage: AsyncKeyValueStorage,
  scopeKey: string,
  libraryScopeId: string,
  operationId: string,
  createEvent: (current: UnwrittenMapSaveV2) => UnwrittenMapEventV2,
): Promise<UnwrittenMapSaveV2> {
  return transactUnwrittenMapEvent(storage, scopeKey, libraryScopeId, operationId, (current) => {
    if (!isUnwrittenMapJourneyComplete(current)) {
      throw new Error("unwritten_map_stale_completion");
    }
    return { event: createEvent(current), nextSave: current };
  });
}

export function transactUnwrittenMapMovement(
  storage: AsyncKeyValueStorage,
  scopeKey: string,
  libraryScopeId: string,
  operationId: string,
  direction: MapDirection,
  gameSessionId: string,
  stepsThisSession: number,
): Promise<UnwrittenMapSaveV2> {
  return transactUnwrittenMapOperation(storage, scopeKey, libraryScopeId, operationId, (current) => {
    const waitingScenario = scenarioAt(current.position);
    if (waitingScenario
      && !current.decisions.some((decision) => decision.scenarioId === waitingScenario.id)) {
      return { nextSave: current };
    }
    const positioned = updateMapPosition(current, moveOnMap(current.position, direction), direction);
    const scenario = scenarioAt(positioned.position);
    if (!scenario || positioned.decisions.some((decision) => decision.scenarioId === scenario.id)) {
      return { nextSave: positioned };
    }
    const attempted = startEncounterAttempt(positioned, scenario.id);
    const attempt = attempted.encounterAttempts[scenario.id];
    const choices = orderedChoices(scenario, attempted.anonymousPlayerId, attempt);
    return {
      event: createEncounterPresentedEvent({
        save: attempted,
        scenario,
        presentedChoices: choices,
        attempt,
        gameSessionId,
        stepsThisSession: stepsThisSession + 1,
      }),
      nextSave: attempted,
    };
  });
}

function queueKey(scopeKey?: string): string {
  return scopeKey ? scopedQueueKey(scopeKey) : UNWRITTEN_MAP_EVENT_QUEUE_KEY;
}

function saveKey(scopeKey?: string): string {
  return scopeKey ? scopedSaveKey(scopeKey) : UNWRITTEN_MAP_SAVE_KEY;
}

function inFlightKey(source: "v1" | "v2", scopeKey: string | undefined, eventId: string): string {
  return `${source}:${scopeKey || "global"}:${eventId}`;
}

export async function sendUnwrittenMapEventRequest(
  event: UnwrittenMapEvent,
  endpoint: string,
  headers: Record<string, string> = {},
  timeoutMs = UNWRITTEN_MAP_SEND_TIMEOUT_MS,
  fetcher: typeof fetch = fetch,
): Promise<boolean> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetcher(endpoint, {
      method: "POST",
      credentials: "same-origin",
      headers: { "content-type": "application/json", ...headers },
      body: JSON.stringify(event),
      signal: controller.signal,
    });
    const payload = await response.json().catch(() => null);
    return (response.status === 200 || response.status === 201) && payload?.status === "accepted";
  } finally {
    clearTimeout(timeout);
  }
}

async function readQueueEntries(
  storage: AsyncKeyValueStorage,
  scopeKey?: string,
): Promise<QueuedUnwrittenMapEvent[]> {
  const raw = await storage.getItem(queueKey(scopeKey));
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) throw new Error("unwritten_map_event_queue_corrupt");
    const entries = parsed.filter((entry): entry is QueuedUnwrittenMapEvent => {
      if (!entry || typeof entry !== "object") return false;
      const candidate = entry as Partial<QueuedUnwrittenMapEvent>;
      if (typeof candidate.committed !== "boolean" || !isUnwrittenMapEventV2(candidate.event)) return false;
      if (!candidate.operationId) {
        return candidate.baseRevision === undefined && candidate.preparedSave === undefined;
      }
      if (!validOperationId(candidate.operationId)) return false;
      if (candidate.committed) {
        return candidate.baseRevision === undefined && candidate.preparedSave === undefined;
      }
      return Number.isInteger(candidate.baseRevision) && Number(candidate.baseRevision) >= 0
        && Boolean(candidate.preparedSave)
        && JSON.stringify(restoreUnwrittenMapSave(
          JSON.stringify(candidate.preparedSave),
          candidate.event.libraryScopeId,
        )) === JSON.stringify(candidate.preparedSave);
    });
    if (entries.length !== parsed.length) throw new Error("unwritten_map_event_queue_corrupt");
    return entries;
  } catch (error) {
    if (error instanceof Error && error.message === "unwritten_map_event_queue_corrupt") throw error;
    throw new Error("unwritten_map_event_queue_corrupt");
  }
}

async function readLegacyQueueEntries(storage: AsyncKeyValueStorage): Promise<QueuedLegacyUnwrittenMapEvent[]> {
  const raw = await storage.getItem(UNWRITTEN_MAP_V1_EVENT_QUEUE_KEY);
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) throw new Error("unwritten_map_v1_event_queue_corrupt");
    const entries = parsed.filter((entry): entry is QueuedLegacyUnwrittenMapEvent => {
      if (!entry || typeof entry !== "object") return false;
      const candidate = entry as Partial<QueuedLegacyUnwrittenMapEvent>;
      return typeof candidate.committed === "boolean" && isUnwrittenMapChoiceEventV1(candidate.event);
    });
    if (entries.length !== parsed.length) throw new Error("unwritten_map_v1_event_queue_corrupt");
    return entries;
  } catch (error) {
    if (error instanceof Error && error.message === "unwritten_map_v1_event_queue_corrupt") throw error;
    throw new Error("unwritten_map_v1_event_queue_corrupt");
  }
}

export async function readQueuedUnwrittenMapEvents(
  storage: AsyncKeyValueStorage,
  scopeKey?: string,
): Promise<UnwrittenMapEvent[]> {
  return serializeLegacyQueueAndScope(storage, scopeKey, async () => {
    const [legacy, current] = await Promise.all([
      readLegacyQueueEntries(storage),
      readQueueEntries(storage, scopeKey),
    ]);
    return [...legacy.map((entry) => entry.event), ...current.map((entry) => entry.event)];
  });
}

export async function readUncommittedUnwrittenMapEventIds(
  storage: AsyncKeyValueStorage,
  scopeKey?: string,
): Promise<string[]> {
  return (await serializeUnwrittenMapTransaction(storage, scopeKey, () => readQueueEntries(storage, scopeKey)))
    .filter((entry) => !entry.committed)
    .map((entry) => entry.event.eventId);
}

export async function prepareUnwrittenMapQueueForReset(
  storage: AsyncKeyValueStorage,
  durableEventIds: readonly string[],
  scopeKey?: string,
): Promise<void> {
  const durable = new Set(durableEventIds);
  return serializeUnwrittenMapTransaction(storage, scopeKey, async () => {
    const queued = await readQueueEntries(storage, scopeKey);
    const next = queued.flatMap((entry) => {
      if (entry.committed || durable.has(entry.event.eventId)) {
        return [{
          event: entry.event,
          committed: true,
          ...(entry.operationId ? { operationId: entry.operationId } : {}),
        }];
      }
      return [];
    });
    await storage.setItem(queueKey(scopeKey), JSON.stringify(next));
  });
}

export async function resetUnwrittenMapJourney(
  storage: AsyncKeyValueStorage,
  scopeKey: string,
  libraryScopeId: string,
  fresh: UnwrittenMapSaveV2,
): Promise<UnwrittenMapSaveV2> {
  return serializeUnwrittenMapTransaction(storage, scopeKey, async () => {
    let current = restoreUnwrittenMapSave(
      await storage.getItem(scopedSaveKey(scopeKey)),
      libraryScopeId,
    );
    if (!current) throw new Error("unwritten_map_save_missing");
    current = await recoverPreparedTransactions(storage, scopeKey, libraryScopeId, current) || current;
    const durable = new Set(current.committedEventIds);
    const queued = await readQueueEntries(storage, scopeKey);
    const preserved = queued.flatMap((entry) => {
      if (entry.committed || durable.has(entry.event.eventId)) {
        return [{ event: entry.event, committed: true, ...(entry.operationId ? { operationId: entry.operationId } : {}) }];
      }
      return [];
    });
    await storage.setItem(queueKey(scopeKey), JSON.stringify(preserved));
    const resetAt = monotonicUnwrittenMapTimestamp(current, fresh.startedAt);
    const resetSave = {
      ...fresh,
      startedAt: resetAt,
      updatedAt: resetAt,
      revision: current.revision + 1,
      lastOperationId: `reset:${fresh.anonymousPlayerId}`,
    };
    await writeSaveRevision(storage, scopedSaveKey(scopeKey), resetSave, current.revision);
    return resetSave;
  });
}

export async function initializeUnwrittenMapJourney(
  storage: AsyncKeyValueStorage,
  scopeKey: string,
  libraryScopeId: string,
  initial: UnwrittenMapSaveV2,
): Promise<UnwrittenMapSaveV2> {
  return serializeUnwrittenMapTransaction(storage, scopeKey, async () => {
    const existing = restoreUnwrittenMapSave(
      await storage.getItem(scopedSaveKey(scopeKey)),
      libraryScopeId,
    );
    if (existing) return existing;
    const serialized = JSON.stringify(initial);
    if (JSON.stringify(restoreUnwrittenMapSave(serialized, libraryScopeId)) !== serialized) {
      throw new Error("invalid_unwritten_map_initial_save");
    }
    await storage.setItem(scopedSaveKey(scopeKey), serialized);
    const confirmed = restoreUnwrittenMapSave(
      await storage.getItem(scopedSaveKey(scopeKey)),
      libraryScopeId,
    );
    if (!confirmed || JSON.stringify(confirmed) !== JSON.stringify(initial)) {
      throw new Error("unwritten_map_save_cas_failed");
    }
    return confirmed;
  });
}

export async function queueUnwrittenMapEvent(
  storage: AsyncKeyValueStorage,
  event: UnwrittenMapEventV2,
  scopeKey?: string,
): Promise<void> {
  if (!isUnwrittenMapEventV2(event)) throw new Error("invalid_unwritten_map_event");
  return serializeUnwrittenMapTransaction(storage, scopeKey,
    () => queueOperation(storage, scopeKey || "", { event, committed: false }));
}

function parseMigrationOwner(raw: string | null): LegacyMigrationOwner | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Partial<LegacyMigrationOwner>;
    return value.version === 1 && typeof value.ownerScopeKey === "string"
      && typeof value.legacyPlayerId === "string" && (value.status === "claimed" || value.status === "complete")
      ? value as LegacyMigrationOwner : null;
  } catch {
    return null;
  }
}

export async function migrateLegacyUnwrittenMapSaveForScope(
  storage: AsyncKeyValueStorage,
  scopeKey: string,
  libraryScopeId: string,
): Promise<UnwrittenMapSaveV2 | null> {
  const migrate = () => serializeUnwrittenMapTransaction(storage, scopeKey, async () => {
    let existing = restoreUnwrittenMapSave(await storage.getItem(scopedSaveKey(scopeKey)), libraryScopeId);
    existing = await recoverPreparedTransactions(storage, scopeKey, libraryScopeId, existing);
    const ownerRaw = await storage.getItem(UNWRITTEN_MAP_V1_MIGRATION_KEY);
    const owner = parseMigrationOwner(ownerRaw);
    if (ownerRaw && !owner) return existing;
    if (owner?.status === "complete") return existing;
    const existingHasProgress = Boolean(existing && (
      existing.decisions.length || existing.undoneDecisions.length || existing.discoveredScenarioIds.length
      || existing.playSessionCount || existing.completedAt
      || existing.position.x !== UNWRITTEN_MAP_START.x || existing.position.y !== UNWRITTEN_MAP_START.y
    ));
    const legacyRaw = await storage.getItem(UNWRITTEN_MAP_V1_SAVE_KEY);
    if (!legacyRaw) return existing;
    try {
      if ((JSON.parse(legacyRaw) as { schemaVersion?: unknown }).schemaVersion !== "unwritten_map_save_v1") return existing;
    } catch {
      return existing;
    }
    const legacyQueue = await readLegacyQueueEntries(storage);
    const migrated = migrateUnwrittenMapSaveV1(
      JSON.parse(legacyRaw) as Parameters<typeof migrateUnwrittenMapSaveV1>[0],
      libraryScopeId,
      legacyQueue.map((entry) => entry.event),
    );
    if (!migrated) return existing;

    if (owner && (owner.ownerScopeKey !== scopeKey || owner.legacyPlayerId !== migrated.anonymousPlayerId)) return existing;

    const claim: LegacyMigrationOwner = {
      version: 1,
      ownerScopeKey: scopeKey,
      legacyPlayerId: migrated.anonymousPlayerId,
      status: "claimed",
    };
    if (!owner) {
      await storage.setItem(UNWRITTEN_MAP_V1_MIGRATION_KEY, JSON.stringify(claim));
      const confirmed = parseMigrationOwner(await storage.getItem(UNWRITTEN_MAP_V1_MIGRATION_KEY));
      if (!confirmed || confirmed.ownerScopeKey !== scopeKey || confirmed.legacyPlayerId !== migrated.anonymousPlayerId) return existing;
    }

    const migratedSaveWithoutRevision = existing && existingHasProgress
      ? (() => {
        const touchedScenarios = new Set([
          ...existing.decisions.map((decision) => decision.scenarioId),
          ...existing.undoneDecisions.map((decision) => decision.scenarioId),
        ]);
        const importedDecisions = migrated.decisions.filter((decision) => !touchedScenarios.has(decision.scenarioId));
        const decisions = [...existing.decisions, ...importedDecisions]
          .sort((left, right) => Date.parse(left.occurredAt) - Date.parse(right.occurredAt));
        const startedAt = Date.parse(existing.startedAt) <= Date.parse(migrated.startedAt)
          ? existing.startedAt : migrated.startedAt;
        const historyTimes = [
          existing.updatedAt,
          migrated.updatedAt,
          ...decisions.map((decision) => decision.occurredAt),
          ...existing.undoneDecisions.flatMap((decision) => [decision.occurredAt, decision.undoneAt]),
        ];
        const updatedAt = historyTimes.reduce((latest, candidate) =>
          Date.parse(candidate) > Date.parse(latest) ? candidate : latest, startedAt);
        return {
          ...existing,
          decisions,
          discoveredScenarioIds: [...new Set([
            ...existing.discoveredScenarioIds,
            ...migrated.discoveredScenarioIds,
            ...importedDecisions.map((decision) => decision.scenarioId),
          ])],
          encounterAttempts: {
            ...migrated.encounterAttempts,
            ...existing.encounterAttempts,
          },
          committedEventIds: [...existing.committedEventIds],
          startedAt,
          updatedAt,
          completedAt: decisions.length === UNWRITTEN_MAP_SCENARIOS.length ? updatedAt : null,
        };
      })()
      : migrated;
    const migratedSave = {
      ...migratedSaveWithoutRevision,
      updatedAt: existing
        ? monotonicUnwrittenMapTimestamp(existing, migratedSaveWithoutRevision.updatedAt)
        : migratedSaveWithoutRevision.updatedAt,
      revision: (existing?.revision || 0) + 1,
      lastOperationId: `migration:${migrated.anonymousPlayerId}`,
    };
    if (existing) {
      await writeSaveRevision(storage, scopedSaveKey(scopeKey), migratedSave, existing.revision);
    } else {
      const serialized = JSON.stringify(migratedSave);
      if (JSON.stringify(restoreUnwrittenMapSave(serialized, libraryScopeId)) !== serialized) {
        throw new Error("invalid_unwritten_map_migration_save");
      }
      await storage.setItem(scopedSaveKey(scopeKey), serialized);
      const confirmed = restoreUnwrittenMapSave(
        await storage.getItem(scopedSaveKey(scopeKey)),
        libraryScopeId,
      );
      if (!confirmed || confirmed.revision !== migratedSave.revision) {
        throw new Error("unwritten_map_save_cas_failed");
      }
    }

    const linkedLegacyEventIds = new Set(migratedSave.decisions.flatMap((decision) =>
      decision.outcomeEvidence.kind === "durable_event"
        && decision.outcomeEvidence.schemaVersion === "unwritten_map_choice_event_v1"
        ? [decision.outcomeEvidence.eventId] : []));
    const reconciledLegacyQueue = legacyQueue.map((entry) =>
      linkedLegacyEventIds.has(entry.event.eventId)
        ? { ...entry, committed: true } : entry);
    if (legacyQueue.length) {
      await storage.setItem(UNWRITTEN_MAP_V1_EVENT_QUEUE_KEY, JSON.stringify(reconciledLegacyQueue));
    }

    await storage.setItem(UNWRITTEN_MAP_V1_MIGRATION_KEY, JSON.stringify({ ...claim, status: "complete" }));
    return migratedSave;
  });
  return serializeUnwrittenMapTransaction(storage, "legacy-migration", migrate);
}

export async function commitUnwrittenMapEvent(
  storage: AsyncKeyValueStorage,
  eventId: string,
  scopeKey?: string,
): Promise<void> {
  return serializeUnwrittenMapTransaction(storage, scopeKey,
    () => commitQueueEntry(storage, eventId, scopeKey));
}

export async function reconcileUnwrittenMapEvents(
  storage: AsyncKeyValueStorage,
  save: UnwrittenMapSaveV2,
  scopeKey?: string,
): Promise<void> {
  return serializeUnwrittenMapTransaction(storage, scopeKey, async () => {
    const queued = await readQueueEntries(storage, scopeKey);
    const durableSave = restoreUnwrittenMapSave(
      await storage.getItem(saveKey(scopeKey)),
      save.libraryScopeId,
    );
    if (!durableSave || durableSave.anonymousPlayerId !== save.anonymousPlayerId) {
      throw new Error("unwritten_map_save_not_durable");
    }
    const durableIds = new Set(durableSave.committedEventIds);
    const next = queued.flatMap((entry) => {
      if (entry.committed || durableIds.has(entry.event.eventId)) {
        return [{
          event: entry.event,
          committed: true,
          ...(entry.operationId ? { operationId: entry.operationId } : {}),
        }];
      }
      return entry.preparedSave ? [entry] : [];
    });
    await storage.setItem(queueKey(scopeKey), JSON.stringify(next));
  });
}

export async function loadDurableUnwrittenMapJourney(
  storage: AsyncKeyValueStorage,
  scopeKey: string,
  libraryScopeId: string,
): Promise<UnwrittenMapSaveV2> {
  return serializeUnwrittenMapTransaction(storage, scopeKey, async () => {
    let durableSave = restoreUnwrittenMapSave(
      await storage.getItem(scopedSaveKey(scopeKey)),
      libraryScopeId,
    );
    if (!durableSave) throw new Error("unwritten_map_save_missing");
    durableSave = await recoverPreparedTransactions(
      storage,
      scopeKey,
      libraryScopeId,
      durableSave,
    ) || durableSave;
    const durableIds = new Set(durableSave.committedEventIds);
    const queued = await readQueueEntries(storage, scopeKey);
    const next = queued.flatMap((entry) => {
      if (entry.committed || durableIds.has(entry.event.eventId)) {
        return [{
          event: entry.event,
          committed: true,
          ...(entry.operationId ? { operationId: entry.operationId } : {}),
        }];
      }
      return entry.preparedSave ? [entry] : [];
    });
    await storage.setItem(queueKey(scopeKey), JSON.stringify(next));
    return durableSave;
  });
}

export async function flushUnwrittenMapEvents(
  storage: AsyncKeyValueStorage,
  send: (event: UnwrittenMapEvent) => Promise<boolean>,
  scopeKey?: string,
): Promise<{ sent: number; remaining: number }> {
  type FlushCandidate = {
    entry: QueuedUnwrittenMapEvent | QueuedLegacyUnwrittenMapEvent;
    source: "v1" | "v2";
    flightKey: string;
  };
  const candidates = await serializeLegacyQueueAndScope(storage, scopeKey, async () => {
    const queued = await readQueueEntries(storage, scopeKey);
    const legacyQueued = await readLegacyQueueEntries(storage);
    const snapshot: FlushCandidate[] = [];
    const add = (
      entries: (QueuedUnwrittenMapEvent | QueuedLegacyUnwrittenMapEvent)[],
      source: "v1" | "v2",
    ) => {
      for (const entry of entries) {
        if (!entry.committed || snapshot.length >= UNWRITTEN_MAP_FLUSH_BATCH_SIZE) continue;
        const flightKey = inFlightKey(source, source === "v2" ? scopeKey : undefined, entry.event.eventId);
        if (inFlightEventIds.has(flightKey)) continue;
        inFlightEventIds.add(flightKey);
        snapshot.push({ entry, source, flightKey });
      }
    };
    add(legacyQueued, "v1");
    add(queued, "v2");
    return snapshot;
  });

  const sentCandidates: FlushCandidate[] = [];
  let cursor = 0;
  const worker = async () => {
    while (cursor < candidates.length) {
      const candidate = candidates[cursor];
      cursor += 1;
      try {
        if (await send(candidate.entry.event)) sentCandidates.push(candidate);
      } catch {
        // A failed send remains in the durable queue for a later bounded flush.
      }
    }
  };
  await Promise.all(Array.from(
    { length: Math.min(UNWRITTEN_MAP_FLUSH_CONCURRENCY, candidates.length) },
    () => worker(),
  ));

  try {
    return await serializeLegacyQueueAndScope(storage, scopeKey, async () => {
      const sentV1 = new Set(sentCandidates.filter((item) => item.source === "v1").map((item) => item.entry.event.eventId));
      const sentV2 = new Set(sentCandidates.filter((item) => item.source === "v2").map((item) => item.entry.event.eventId));
      const [legacyQueued, queued] = await Promise.all([
        readLegacyQueueEntries(storage),
        readQueueEntries(storage, scopeKey),
      ]);
      const legacyRemaining = legacyQueued.filter((entry) => !sentV1.has(entry.event.eventId));
      const remaining = queued.filter((entry) => !sentV2.has(entry.event.eventId));
      await storage.setItem(UNWRITTEN_MAP_V1_EVENT_QUEUE_KEY, JSON.stringify(legacyRemaining));
      await storage.setItem(queueKey(scopeKey), JSON.stringify(remaining));
      candidates.forEach((candidate) => inFlightEventIds.delete(candidate.flightKey));
      return { sent: sentCandidates.length, remaining: legacyRemaining.length + remaining.length };
    });
  } catch (error) {
    await serializeLegacyQueueAndScope(storage, scopeKey, async () => {
      candidates.forEach((candidate) => inFlightEventIds.delete(candidate.flightKey));
    });
    throw error;
  }
}
