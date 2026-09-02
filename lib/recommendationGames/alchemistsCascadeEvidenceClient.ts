import {
  CASCADE_QUEUE_KEY,
  CASCADE_SAVE_KEY,
  normalizeCascadeEvent,
  restoreCascadeSave,
  scopedCascadeKey,
  type CascadeEvidenceEvent,
  type CascadeSaveV1,
} from "./alchemistsCascade";
import type { AsyncKeyValueStorage } from "./evidenceClient";

export const CASCADE_QUEUE_CAPACITY = 500;
export const CASCADE_FLUSH_BATCH_SIZE = 20;
export const CASCADE_SEND_TIMEOUT_MS = 10_000;

type QueueEntry = {
  event: CascadeEvidenceEvent;
  committed: boolean;
  operationId?: string;
  baseRevision?: number;
  preparedSave?: CascadeSaveV1;
};
const transactions = new WeakMap<object, Map<string, Promise<unknown>>>();
const inFlight = new WeakMap<object, Map<string, Set<string>>>();
const endpointRetryAt = new Map<string, number>();

export function serializeCascadeTransaction<T>(
  storage: AsyncKeyValueStorage,
  scope: string,
  work: () => Promise<T>,
): Promise<T> {
  const key = storage as object;
  const map = transactions.get(key) || new Map<string, Promise<unknown>>();
  transactions.set(key, map);
  const prior = map.get(scope) || Promise.resolve();
  const run = async () => {
    const locks = (globalThis as unknown as {
      navigator?: { locks?: { request<R>(name: string, callback: () => Promise<R>): Promise<R> } };
    }).navigator?.locks;
    return locks ? locks.request(`novelideas-cascade:${scope}`, work) : work();
  };
  const result = prior.catch(() => undefined).then(run);
  map.set(scope, result.then(() => undefined, () => undefined));
  return result;
}

export async function readCascadeQueue(storage: AsyncKeyValueStorage, scope: string): Promise<QueueEntry[]> {
  const raw = await storage.getItem(scopedCascadeKey(CASCADE_QUEUE_KEY, scope));
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) throw new Error("cascade_event_queue_corrupt");
    const valid = parsed.filter((entry): entry is QueueEntry => {
      if (!entry || typeof entry !== "object" || typeof entry.committed !== "boolean"
        || !normalizeCascadeEvent(entry.event)) return false;
      if (entry.committed) return true;
      return typeof entry.operationId === "string" && Number.isInteger(entry.baseRevision)
        && Boolean(entry.preparedSave && restoreCascadeSave(
          JSON.stringify(entry.preparedSave),
          entry.event.libraryScopeId,
        ));
    });
    if (valid.length !== parsed.length) throw new Error("cascade_event_queue_corrupt");
    return valid;
  } catch {
    throw new Error("cascade_event_queue_corrupt");
  }
}

async function writeVerified(storage: AsyncKeyValueStorage, key: string, value: string): Promise<void> {
  await storage.setItem(key, value);
  if (await storage.getItem(key) !== value) throw new Error("cascade_storage_verification_failed");
}

async function recoverPreparedTransactions(
  storage: AsyncKeyValueStorage,
  scope: string,
  libraryScopeId: string,
  current: CascadeSaveV1,
): Promise<CascadeSaveV1> {
  const saveKey = scopedCascadeKey(CASCADE_SAVE_KEY, scope);
  const queueKey = scopedCascadeKey(CASCADE_QUEUE_KEY, scope);
  let queue = await readCascadeQueue(storage, scope);
  for (const entry of queue.filter((candidate) => !candidate.committed)) {
    if (!entry.preparedSave || entry.baseRevision === undefined) {
      throw new Error("cascade_transaction_recovery_invalid");
    }
    const prepared = restoreCascadeSave(JSON.stringify(entry.preparedSave), libraryScopeId);
    if (!prepared || prepared.lastOperationId !== entry.operationId) {
      throw new Error("cascade_transaction_recovery_invalid");
    }
    if (!current.committedEventIds.includes(entry.event.eventId)) {
      if (current.revision !== entry.baseRevision) throw new Error("cascade_transaction_recovery_conflict");
      await writeVerified(storage, saveKey, JSON.stringify(prepared));
      current = prepared;
    } else if (current.revision !== prepared.revision || current.lastOperationId !== prepared.lastOperationId) {
      throw new Error("cascade_transaction_recovery_conflict");
    }
    queue = queue.map((candidate) => candidate.event.eventId === entry.event.eventId
      ? { event: candidate.event, committed: true }
      : candidate);
    await writeVerified(storage, queueKey, JSON.stringify(queue));
  }
  return current;
}

export async function initializeCascadeSave(
  storage: AsyncKeyValueStorage,
  scope: string,
  initial: CascadeSaveV1,
): Promise<CascadeSaveV1> {
  return serializeCascadeTransaction(storage, scope, async () => {
    const key = scopedCascadeKey(CASCADE_SAVE_KEY, scope);
    const raw = await storage.getItem(key);
    const existing = restoreCascadeSave(raw, initial.libraryScopeId);
    if (existing) return recoverPreparedTransactions(storage, scope, initial.libraryScopeId, existing);
    if (raw !== null) throw new Error("cascade_save_corrupt_or_wrong_scope");
    await writeVerified(storage, key, JSON.stringify(initial));
    return initial;
  });
}

export async function loadCascadeSave(
  storage: AsyncKeyValueStorage,
  scope: string,
  libraryScopeId: string,
): Promise<CascadeSaveV1 | null> {
  return serializeCascadeTransaction(storage, scope, async () => {
    const current = restoreCascadeSave(
      await storage.getItem(scopedCascadeKey(CASCADE_SAVE_KEY, scope)),
      libraryScopeId,
    );
    return current ? recoverPreparedTransactions(storage, scope, libraryScopeId, current) : null;
  });
}

export async function transactCascade(
  storage: AsyncKeyValueStorage,
  scope: string,
  libraryScopeId: string,
  operationId: string,
  derive: (current: CascadeSaveV1) => {
    save: CascadeSaveV1;
    event?: CascadeEvidenceEvent;
    events?: CascadeEvidenceEvent[];
  },
): Promise<CascadeSaveV1> {
  if (!/^[a-zA-Z0-9:._-]{3,200}$/.test(operationId)) throw new Error("invalid_cascade_operation_id");
  return serializeCascadeTransaction(storage, scope, async () => {
    const saveKey = scopedCascadeKey(CASCADE_SAVE_KEY, scope);
    const queueKey = scopedCascadeKey(CASCADE_QUEUE_KEY, scope);
    let current = restoreCascadeSave(await storage.getItem(saveKey), libraryScopeId);
    if (!current) throw new Error("cascade_save_missing");
    current = await recoverPreparedTransactions(storage, scope, libraryScopeId, current);
    if (current.lastOperationId === operationId) return current;
    const transaction = derive(current);
    if (transaction.save.revision !== current.revision
      || transaction.save.anonymousPlayerId !== current.anonymousPlayerId
      || transaction.save.libraryScopeId !== current.libraryScopeId
      || Date.parse(transaction.save.updatedAt) < Date.parse(current.updatedAt)) {
      throw new Error("invalid_cascade_transaction_save");
    }
    if (transaction.event && transaction.events) throw new Error("ambiguous_cascade_transaction_events");
    const events = transaction.events || (transaction.event ? [transaction.event] : []);
    if (events.some((event) => !normalizeCascadeEvent(event))
      || new Set(events.map((event) => event.eventId)).size !== events.length) {
      throw new Error("invalid_alchemists_cascade_event");
    }
    const queue = await readCascadeQueue(storage, scope);
    const next: CascadeSaveV1 = {
      ...transaction.save,
      revision: current.revision + 1,
      lastOperationId: operationId,
      committedEventIds: events.length
        ? [...current.committedEventIds.filter((id) => !events.some((event) => event.eventId === id)), ...events.map((event) => event.eventId)].slice(-2048)
        : current.committedEventIds,
    };
    if (!restoreCascadeSave(JSON.stringify(next), libraryScopeId)) throw new Error("invalid_cascade_transaction_save");
    for (const event of events) {
      const existing = queue.find((entry) => entry.event.eventId === event.eventId);
      if (existing && JSON.stringify(existing.event) !== JSON.stringify(event)) throw new Error("conflicting_cascade_event_id");
    }
    const newEvents = events.filter((event) => !queue.some((entry) => entry.event.eventId === event.eventId));
    if (queue.length + newEvents.length > CASCADE_QUEUE_CAPACITY) throw new Error("cascade_event_queue_capacity_exceeded");
    if (newEvents.length) {
      await writeVerified(storage, queueKey, JSON.stringify([...queue, ...newEvents.map((event) => ({
        event, committed: false, operationId, baseRevision: current.revision, preparedSave: next,
      }))]));
    }
    try {
      await writeVerified(storage, saveKey, JSON.stringify(next));
      if (events.length) {
        const ids = new Set(events.map((event) => event.eventId));
        const latest = await readCascadeQueue(storage, scope);
        await writeVerified(storage, queueKey, JSON.stringify(latest.map((entry) =>
          ids.has(entry.event.eventId) ? { event: entry.event, committed: true } : entry)));
      }
      return next;
    } catch (commitError) {
      try {
        const durable = restoreCascadeSave(await storage.getItem(saveKey), libraryScopeId);
        if (durable) {
          const recovered = await recoverPreparedTransactions(storage, scope, libraryScopeId, durable);
          if (recovered.lastOperationId === operationId) return recovered;
        }
      } catch {
        // The caller reloads through loadCascadeSave before enabling input.
      }
      throw commitError;
    }
  });
}

export async function flushCascadeEvents(
  storage: AsyncKeyValueStorage,
  scope: string,
  send: (event: CascadeEvidenceEvent) => Promise<boolean>,
): Promise<{ sent: number; remaining: number }> {
  const claims = await serializeCascadeTransaction(storage, scope, async () => {
    const byScope = inFlight.get(storage as object) || new Map<string, Set<string>>();
    inFlight.set(storage as object, byScope);
    const claimedIds = byScope.get(scope) || new Set<string>();
    byScope.set(scope, claimedIds);
    const entries = (await readCascadeQueue(storage, scope))
      .filter((entry) => entry.committed && !claimedIds.has(entry.event.eventId))
      .slice(0, CASCADE_FLUSH_BATCH_SIZE);
    entries.forEach((entry) => claimedIds.add(entry.event.eventId));
    return entries;
  });
  let sent = 0;
  const sentIds = new Set<string>();
  for (const entry of claims) {
    try {
      if (await send(entry.event)) {
        sent += 1;
        sentIds.add(entry.event.eventId);
      }
    } catch {
      // The durable local entry remains for the next retry.
    }
  }
  const remaining = await serializeCascadeTransaction(storage, scope, async () => {
    try {
      const queue = await readCascadeQueue(storage, scope);
      const next = queue.filter((entry) => !sentIds.has(entry.event.eventId));
      if (sentIds.size) {
        await writeVerified(storage, scopedCascadeKey(CASCADE_QUEUE_KEY, scope), JSON.stringify(next));
      }
      return next.length;
    } finally {
      const claimedIds = inFlight.get(storage as object)?.get(scope);
      claims.forEach((entry) => claimedIds?.delete(entry.event.eventId));
    }
  });
  return { sent, remaining };
}

export async function sendCascadeEventRequest(
  event: CascadeEvidenceEvent,
  endpoint: string,
  headers: Record<string, string> = {},
): Promise<boolean> {
  if ((endpointRetryAt.get(endpoint) || 0) > Date.now()) return false;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), CASCADE_SEND_TIMEOUT_MS);
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify(event),
      signal: controller.signal,
    });
    if (response.status === 429) {
      const header = response.headers.get("Retry-After");
      const seconds = header && /^\d+$/.test(header) ? Number(header) * 1_000 : 0;
      const date = header && !seconds ? Date.parse(header) - Date.now() : 0;
      endpointRetryAt.set(endpoint, Date.now() + Math.max(1_000, seconds || date || 60_000));
      return false;
    }
    if (response.status !== 200 && response.status !== 201) return false;
    const contentType = String(response.headers.get("Content-Type") || "").toLowerCase();
    if (!contentType.includes("application/json")) return false;
    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      return false;
    }
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) return false;
    const result = payload as Record<string, unknown>;
    const keys = Object.keys(result).sort().join(",");
    const accepted = response.status === 201
      ? keys === "eventId,status,storageMode"
        && result.status === "accepted"
        && result.eventId === event.eventId
        && result.storageMode === "durable_blob"
      : keys === "eventId,idempotentReplay,status,storageMode"
        && result.status === "accepted"
        && result.eventId === event.eventId
        && result.storageMode === "durable_blob"
        && result.idempotentReplay === true;
    if (!accepted) return false;
    endpointRetryAt.delete(endpoint);
    return true;
  } finally {
    clearTimeout(timeout);
  }
}
