import { listMediaManiaEvidenceForAnalysis } from "../mediaMania/evidenceStorage";
import {
  isRecommendationGameEventV1,
  type RecommendationGameEventV1,
} from "../recommendationGames/lastBookshop";
import {
  isUnwrittenMapChoiceEventV1,
  isUnwrittenMapEventV2,
  type UnwrittenMapEvent,
} from "../recommendationGames/unwrittenMap";
import {
  normalizeCascadeEvent,
  type CascadeEvidenceEvent,
} from "../recommendationGames/alchemistsCascade";
import { GAME_PLAYTEST_MAX_RECORDS, normalizeLibraryId, type EventPayload, type GameId, type PlaytestEvent } from "./analysis";

type BlobRow = { pathname: string };
type ReadResult = { events: PlaytestEvent[]; malformedRecords: number; truncated: boolean };

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
function nonEmptyString(value: unknown, maximum = 256): string | null {
  return typeof value === "string" && value.length > 0 && value.length <= maximum ? value : null;
}
function occurredAt(value: unknown): string | null {
  const timestamp = nonEmptyString(value, 64);
  return timestamp && Number.isFinite(Date.parse(timestamp)) ? timestamp : null;
}
function event(
  game: GameId,
  values: { id: unknown; sessionId: unknown; playerId: unknown; libraryId?: unknown; ageBand?: unknown; occurredAt: unknown; type: unknown; payload: unknown; rawSchema: unknown },
): PlaytestEvent | null {
  const id = nonEmptyString(values.id);
  const sessionId = nonEmptyString(values.sessionId);
  const playerId = nonEmptyString(values.playerId);
  const at = occurredAt(values.occurredAt);
  const type = nonEmptyString(values.type);
  if (!id || !sessionId || !playerId || !at || !type || !isRecord(values.payload)) return null;
  const libraryId = typeof values.libraryId === "string" && values.libraryId ? normalizeLibraryId(values.libraryId).slice(0, 128) : null;
  const ageBand = typeof values.ageBand === "string" && values.ageBand ? values.ageBand.slice(0, 64) : null;
  return { id, game, sessionId, playerId, libraryId, ageBand, occurredAt: at, type, payload: values.payload, rawSchema: String(values.rawSchema || "unknown") };
}
async function readBlobJson(pathname: string, token: string): Promise<unknown | null> {
  const { get } = await import("@vercel/blob");
  const result = await get(pathname, { access: "private", token });
  if (!result?.stream) return null;
  return JSON.parse(await new Response(result.stream).text()) as unknown;
}
async function listBlobEvents(prefix: string, game: GameId, maxRecords: number): Promise<ReadResult> {
  if (maxRecords <= 0) return { events: [], malformedRecords: 0, truncated: false };
  const token = String(process.env.BLOB_READ_WRITE_TOKEN || "").trim();
  if (!token) throw new Error("playtest_blob_storage_unavailable");
  const { list } = await import("@vercel/blob");
  const rows: BlobRow[] = [];
  let cursor: string | undefined;
  let hasMoreBeyondBound = false;
  while (rows.length < maxRecords) {
    const page = await list({ prefix, limit: Math.min(250, maxRecords - rows.length), cursor, token });
    rows.push(...page.blobs.map((blob) => ({ pathname: blob.pathname })).slice(0, maxRecords - rows.length));
    if (!page.hasMore || !page.cursor) break;
    cursor = page.cursor;
    hasMoreBeyondBound = rows.length >= maxRecords;
  }
  const loaded = await Promise.allSettled(rows.map((row) => readBlobJson(row.pathname, token)));
  const events: PlaytestEvent[] = [];
  let malformedRecords = 0;
  for (const result of loaded) {
    if (result.status !== "fulfilled" || !result.value) {
      malformedRecords += 1;
      continue;
    }
    const normalized = normalizeGamePlaytestEvent(game, result.value);
    if (normalized) events.push(normalized);
    else malformedRecords += 1;
  }
  // "Bounded" (we stopped because the per-game cap was hit) is reported as truncated even when we
  // could not confirm more records exist beyond it, so callers never imply complete coverage.
  return { events, malformedRecords, truncated: hasMoreBeyondBound || rows.length >= maxRecords };
}

export function normalizeGamePlaytestEvent(game: GameId, value: unknown): PlaytestEvent | null {
  if (!isRecord(value)) return null;
  if (game === "media_mania") {
    return event(game, {
      id: value.eventId, sessionId: value.sessionId, playerId: value.playerId, libraryId: value.libraryId,
      ageBand: value.activeAgeBand, occurredAt: value.timestamp, type: value.action, payload: value, rawSchema: value.schemaVersion,
    });
  }
  if (game === "the_last_bookshop") {
    if (!isRecommendationGameEventV1(value)) return null;
    const source: RecommendationGameEventV1 = value;
    return event(game, {
      id: source.eventId, sessionId: source.gameSessionId, playerId: source.anonymousPlayerId, occurredAt: source.occurredAt,
      type: "encounter_completed", payload: source as unknown as EventPayload, rawSchema: source.schemaVersion,
    });
  }
  if (game === "the_unwritten_map") {
    if (!isUnwrittenMapChoiceEventV1(value) && !isUnwrittenMapEventV2(value)) return null;
    const source: UnwrittenMapEvent = value;
    return event(game, {
      id: source.eventId, sessionId: source.gameSessionId, playerId: source.anonymousPlayerId,
      libraryId: source.schemaVersion === "unwritten_map_event_v2" ? source.libraryScopeId : null,
      occurredAt: source.occurredAt, type: source.schemaVersion === "unwritten_map_choice_event_v1" ? "choice_made" : source.eventType,
      payload: source as unknown as EventPayload, rawSchema: source.schemaVersion,
    });
  }
  const source = normalizeCascadeEvent(value);
  if (!source) return null;
  const cascade: CascadeEvidenceEvent = source;
  return event(game, {
    id: cascade.eventId, sessionId: cascade.gameSessionId, playerId: cascade.anonymousPlayerId, libraryId: cascade.libraryScopeId,
    occurredAt: cascade.occurredAt, type: cascade.eventType,
    payload: { ...cascade.payload, preferenceInference: cascade.preferenceInference, timingBucket: cascade.timingBucket },
    rawSchema: cascade.schemaVersion,
  });
}

export async function readGamePlaytestEvents(maxRecords = GAME_PLAYTEST_MAX_RECORDS): Promise<{
  events: PlaytestEvent[]; storage: Record<GameId, string>; malformedRecords: number; truncatedGames: GameId[];
}> {
  const bounded = Math.max(4, Math.min(GAME_PLAYTEST_MAX_RECORDS, maxRecords));
  const perGame = Math.floor(bounded / 4);
  // Reserve capacity for v2 before reading legacy Map records so v1 cannot exhaust its game's quota.
  const legacyMapCapacity = Math.floor(perGame / 2);
  const v2MapCapacity = perGame - legacyMapCapacity;
  const entries = await Promise.allSettled([
    listMediaManiaEvidenceForAnalysis(perGame).then((result) => {
      const normalized = result.events.map((value) => normalizeGamePlaytestEvent("media_mania", value));
      return {
        events: normalized.filter((value): value is PlaytestEvent => value != null),
        malformedRecords: result.malformedRecords + normalized.filter((value) => value == null).length,
        truncated: result.truncated,
      };
    }),
    listBlobEvents("recommendation-games/the-last-bookshop/v1/", "the_last_bookshop", perGame),
    Promise.all([
      listBlobEvents("recommendation-games/the-unwritten-map/v1/", "the_unwritten_map", legacyMapCapacity),
      listBlobEvents("recommendation-games/the-unwritten-map/v2/", "the_unwritten_map", v2MapCapacity),
    ]).then(([legacy, v2]) => ({
      events: [...legacy.events, ...v2.events],
      malformedRecords: legacy.malformedRecords + v2.malformedRecords,
      truncated: legacy.truncated || v2.truncated,
    })),
    listBlobEvents("recommendation-games/the-alchemists-cascade/v1/", "the_alchemists_cascade", perGame),
  ]);
  const ids: GameId[] = ["media_mania", "the_last_bookshop", "the_unwritten_map", "the_alchemists_cascade"];
  const storage = Object.fromEntries(entries.map((entry, index) => {
    if (entry.status !== "fulfilled") return [ids[index], `gap:${entry.reason instanceof Error ? entry.reason.message : "unavailable"}`];
    const parts = [
      entry.value.malformedRecords ? `malformed=${entry.value.malformedRecords}` : "",
      entry.value.truncated ? "truncated" : "",
    ].filter(Boolean);
    return [ids[index], parts.length ? `durable_blob:${parts.join(":")}` : "durable_blob"];
  })) as Record<GameId, string>;
  return {
    events: entries.flatMap((entry) => entry.status === "fulfilled" ? entry.value.events : []),
    storage,
    malformedRecords: entries.reduce((sum, entry) => sum + (entry.status === "fulfilled" ? entry.value.malformedRecords : 0), 0),
    truncatedGames: entries.flatMap((entry, index) => entry.status === "fulfilled" && entry.value.truncated ? [ids[index]] : []),
  };
}
