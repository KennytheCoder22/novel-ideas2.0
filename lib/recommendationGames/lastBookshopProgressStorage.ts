import type { AgeBandV2 } from "../../app/recommender-v2";
import {
  LAST_BOOKSHOP_PROGRESS_KEY,
  restoreLastBookshopProgress,
  type LastBookshopProgressV1,
} from "./lastBookshop";
import { withCrossTabStorageLock } from "./crossTabStorageLock";

export const LAST_BOOKSHOP_PROGRESS_MIGRATION_KEY =
  "novelideas_last_bookshop_progress_v1_migration_owner";

export type LastBookshopProgressStorage = {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
};

type LastBookshopMigrationOwner = {
  version: 1;
  scopeKey: string;
  legacyAnonymousPlayerId: string;
  status: "claimed" | "complete";
};

function hashScope(value: string): string {
  let first = 2166136261;
  let second = 5381;
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    first = Math.imul(first ^ code, 16777619);
    second = Math.imul(second, 33) ^ code;
  }
  return `${(first >>> 0).toString(16).padStart(8, "0")}${(second >>> 0).toString(16).padStart(8, "0")}`;
}

export function lastBookshopProgressScopeKey(args: {
  playerId: string;
  libraryId: string;
  ageBand: AgeBandV2;
}): string {
  return `${args.ageBand}-${hashScope(`${args.playerId.trim().toLowerCase()}\u0000${args.libraryId.trim().toLowerCase()}`)}`;
}

export function scopedLastBookshopProgressKey(scopeKey: string): string {
  return `${LAST_BOOKSHOP_PROGRESS_KEY}:${scopeKey}`;
}

function parseMigrationOwner(raw: string | null): LastBookshopMigrationOwner | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Partial<LastBookshopMigrationOwner>;
    return value.version === 1
      && typeof value.scopeKey === "string"
      && typeof value.legacyAnonymousPlayerId === "string"
      && (value.status === "claimed" || value.status === "complete")
      ? value as LastBookshopMigrationOwner
      : null;
  } catch {
    return null;
  }
}

export async function loadLastBookshopProgressForScope(
  storage: LastBookshopProgressStorage,
  args: {
    scopeKey: string;
  },
): Promise<LastBookshopProgressV1 | null> {
  const scopedKey = scopedLastBookshopProgressKey(args.scopeKey);
  const existing = restoreLastBookshopProgress(await storage.getItem(scopedKey));
  if (existing) return existing;

  return withCrossTabStorageLock(storage, "last-bookshop-progress-migration", async (assertOwnership) => {
    const latestScoped = restoreLastBookshopProgress(await storage.getItem(scopedKey));
    if (latestScoped) return latestScoped;
    const legacy = restoreLastBookshopProgress(await storage.getItem(LAST_BOOKSHOP_PROGRESS_KEY));
    if (!legacy) return null;

    const owner = parseMigrationOwner(await storage.getItem(LAST_BOOKSHOP_PROGRESS_MIGRATION_KEY));
    if (owner && (
      owner.scopeKey !== args.scopeKey
      || owner.legacyAnonymousPlayerId !== legacy.anonymousPlayerId
    )) return null;

    const claim: LastBookshopMigrationOwner = {
      version: 1,
      scopeKey: args.scopeKey,
      legacyAnonymousPlayerId: legacy.anonymousPlayerId,
      status: "claimed",
    };
    if (!owner) {
      await assertOwnership();
      await storage.setItem(LAST_BOOKSHOP_PROGRESS_MIGRATION_KEY, JSON.stringify(claim));
      const confirmed = parseMigrationOwner(await storage.getItem(LAST_BOOKSHOP_PROGRESS_MIGRATION_KEY));
      if (!confirmed
        || confirmed.scopeKey !== args.scopeKey
        || confirmed.legacyAnonymousPlayerId !== legacy.anonymousPlayerId) return null;
    }

    await assertOwnership();
    await storage.setItem(scopedKey, JSON.stringify(legacy));
    await assertOwnership();
    try {
      await storage.setItem(
        LAST_BOOKSHOP_PROGRESS_MIGRATION_KEY,
        JSON.stringify({ ...claim, status: "complete" }),
      );
    } catch {
      // The scoped ledger is already durable and the claimed marker still prevents another
      // patron from importing it. A later load of this scope can finalize without data loss.
    }
    return legacy;
  });
}
