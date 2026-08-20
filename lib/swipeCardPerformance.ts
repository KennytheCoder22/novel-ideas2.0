import { deck36 } from "../data/swipeDecks/36";
import * as adultDeckModule from "../data/swipeDecks/adult";
import { cardCategoryFromTags, swipeCardPerformanceIdentity } from "../data/swipeDecks/cardMetadata";
import * as k2DeckModule from "../data/swipeDecks/k2";
import * as msHsDeckModule from "../data/swipeDecks/ms_hs";
import type { SwipeDeck } from "../data/swipeDecks/types";

export const SWIPE_CARD_AGE_BANDS = ["kids", "preteens", "teens", "adult"] as const;
export const SWIPE_CARD_ACTIONS = ["like", "dislike", "skip"] as const;

export type SwipeCardAgeBand = typeof SWIPE_CARD_AGE_BANDS[number];
export type SwipeCardAction = typeof SWIPE_CARD_ACTIONS[number];

export type SwipeCardPerformanceEvent = {
  eventId?: string;
  cardId: string;
  cardType: string;
  title: string;
  ageBand: SwipeCardAgeBand;
  action: SwipeCardAction;
};

export type SwipeCardPerformanceRow = {
  cardId: string;
  cardType: string;
  title: string;
  ageBand: SwipeCardAgeBand;
  timesShown: number;
  likes: number;
  dislikes: number;
  skips: number;
  recognitionCount: number;
  recognitionRate: number;
  likeRateAmongRecognized: number;
  dislikeRateAmongRecognized: number;
  skipRate: number;
  utilityMetric: number;
};

type SqlClient = (strings: TemplateStringsArray, ...values: any[]) => Promise<{ rows: any[]; rowCount: number }>;

type StoredSwipeCardPerformanceEvent = Required<SwipeCardPerformanceEvent> & {
  recordedAt: string;
};

type BlobMetadata = {
  pathname: string;
  uploadedAt: string;
};

export interface SwipeCardPerformanceBlobStore {
  putJson(pathname: string, value: unknown): Promise<void>;
  list(prefix: string): Promise<BlobMetadata[]>;
  readJson(pathname: string): Promise<unknown | null>;
}

let sqlClient: SqlClient | null = null;
let schemaReady: Promise<void> | null = null;
const SWIPE_CARD_PERFORMANCE_BLOB_PREFIX = "human-review/swipe-card-performance/v1/";

const DECK_BY_AGE_BAND: Record<SwipeCardAgeBand, SwipeDeck> = {
  kids: (k2DeckModule.default || k2DeckModule.k2) as SwipeDeck,
  preteens: deck36 as unknown as SwipeDeck,
  teens: msHsDeckModule.default as SwipeDeck,
  adult: adultDeckModule.default as SwipeDeck,
};

const CARD_CATALOG = new Map<string, { cardType: string; title: string }>();
for (const [ageBand, deck] of Object.entries(DECK_BY_AGE_BAND) as Array<[SwipeCardAgeBand, SwipeDeck]>) {
  if (!deck) throw new Error(`swipe_card_catalog_missing_${ageBand}`);
  for (const card of deck.cards) {
    const cardId = swipeCardPerformanceIdentity(card);
    if (!CARD_CATALOG.has(`${ageBand}:${cardId}`)) {
      CARD_CATALOG.set(`${ageBand}:${cardId}`, {
        cardType: cardCategoryFromTags(card),
        title: String(card.title || card.prompt || cardId),
      });
    }
  }
}

async function getSQL(): Promise<SqlClient> {
  if (sqlClient) return sqlClient;
  if (!process.env.POSTGRES_URL) throw new Error("swipe_card_performance_storage_unavailable");
  const mod = await import("@vercel/postgres");
  sqlClient = mod.sql as SqlClient;
  return sqlClient;
}

async function ensureSchema(sql: SqlClient): Promise<void> {
  if (!schemaReady) {
    schemaReady = (async () => {
      await sql`
        CREATE TABLE IF NOT EXISTS swipe_card_performance (
          card_id TEXT NOT NULL,
          age_band TEXT NOT NULL,
          card_type TEXT NOT NULL,
          title TEXT NOT NULL,
          times_shown BIGINT NOT NULL DEFAULT 0,
          likes BIGINT NOT NULL DEFAULT 0,
          dislikes BIGINT NOT NULL DEFAULT 0,
          skips BIGINT NOT NULL DEFAULT 0,
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          PRIMARY KEY (card_id, age_band)
        )
      `;
      await sql`
        CREATE TABLE IF NOT EXISTS swipe_card_performance_events (
          event_id TEXT PRIMARY KEY,
          recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `;
    })().catch((error) => {
      schemaReady = null;
      throw error;
    });
  }
  await schemaReady;
}

function cleanText(value: unknown, maxLength: number): string {
  return String(value || "").trim().slice(0, maxLength);
}

export function parseSwipeCardPerformanceEvent(value: unknown): SwipeCardPerformanceEvent {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("invalid_swipe_card_performance_event");
  }
  const input = value as Record<string, unknown>;
  const cardId = cleanText(input.cardId, 240);
  const cardType = cleanText(input.cardType, 80);
  const title = cleanText(input.title, 300);
  const ageBand = cleanText(input.ageBand, 20) as SwipeCardAgeBand;
  const action = cleanText(input.action, 20) as SwipeCardAction;
  const eventId = cleanText(input.eventId, 100);
  if (!cardId || !cardType || !title) throw new Error("missing_swipe_card_fields");
  if (!SWIPE_CARD_AGE_BANDS.includes(ageBand)) throw new Error("invalid_swipe_card_age_band");
  if (!SWIPE_CARD_ACTIONS.includes(action)) throw new Error("invalid_swipe_card_action");
  if (eventId && !/^[a-z0-9_-]{8,100}$/i.test(eventId)) throw new Error("invalid_swipe_card_event_id");
  return { ...(eventId ? { eventId } : {}), cardId, cardType, title, ageBand, action };
}

function canonicalizeSwipeCardPerformanceEvent(event: SwipeCardPerformanceEvent): SwipeCardPerformanceEvent {
  const card = CARD_CATALOG.get(`${event.ageBand}:${event.cardId}`);
  if (!card) throw new Error("invalid_swipe_card_identity");
  return { ...event, cardType: card.cardType, title: card.title };
}

export function applySwipeCardPerformanceEvent(
  current: Pick<SwipeCardPerformanceRow, "timesShown" | "likes" | "dislikes" | "skips">,
  action: SwipeCardAction,
): Pick<SwipeCardPerformanceRow, "timesShown" | "likes" | "dislikes" | "skips"> {
  return {
    timesShown: current.timesShown + 1,
    likes: current.likes + (action === "like" ? 1 : 0),
    dislikes: current.dislikes + (action === "dislike" ? 1 : 0),
    skips: current.skips + (action === "skip" ? 1 : 0),
  };
}

export function deriveSwipeCardPerformance(row: {
  cardId: string;
  cardType: string;
  title: string;
  ageBand: SwipeCardAgeBand;
  timesShown: number;
  likes: number;
  dislikes: number;
  skips: number;
}): SwipeCardPerformanceRow {
  const recognitionCount = row.likes + row.dislikes;
  const recognitionRate = row.timesShown > 0 ? recognitionCount / row.timesShown : 0;
  const likeRateAmongRecognized = recognitionCount > 0 ? row.likes / recognitionCount : 0;
  const dislikeRateAmongRecognized = recognitionCount > 0 ? row.dislikes / recognitionCount : 0;
  const skipRate = row.timesShown > 0 ? row.skips / row.timesShown : 0;
  const utilityMetric = recognitionRate * (0.5 + (likeRateAmongRecognized * 0.5));
  return {
    ...row,
    recognitionCount,
    recognitionRate,
    likeRateAmongRecognized,
    dislikeRateAmongRecognized,
    skipRate,
    utilityMetric,
  };
}

export async function recordSwipeCardPerformance(event: SwipeCardPerformanceEvent): Promise<void> {
  event = canonicalizeSwipeCardPerformanceEvent(event);
  const sql = await getSQL();
  await ensureSchema(sql);
  const likeIncrement = event.action === "like" ? 1 : 0;
  const dislikeIncrement = event.action === "dislike" ? 1 : 0;
  const skipIncrement = event.action === "skip" ? 1 : 0;
  if (!event.eventId) {
    await sql`
      INSERT INTO swipe_card_performance
        (card_id, age_band, card_type, title, times_shown, likes, dislikes, skips)
      VALUES
        (${event.cardId}, ${event.ageBand}, ${event.cardType}, ${event.title}, 1, ${likeIncrement}, ${dislikeIncrement}, ${skipIncrement})
      ON CONFLICT (card_id, age_band) DO UPDATE SET
        card_type = EXCLUDED.card_type,
        title = EXCLUDED.title,
        times_shown = swipe_card_performance.times_shown + 1,
        likes = swipe_card_performance.likes + EXCLUDED.likes,
        dislikes = swipe_card_performance.dislikes + EXCLUDED.dislikes,
        skips = swipe_card_performance.skips + EXCLUDED.skips,
        updated_at = NOW()
    `;
    return;
  }
  await sql`
    WITH accepted_event AS (
      INSERT INTO swipe_card_performance_events (event_id)
      VALUES (${event.eventId})
      ON CONFLICT (event_id) DO NOTHING
      RETURNING event_id
    )
    INSERT INTO swipe_card_performance
      (card_id, age_band, card_type, title, times_shown, likes, dislikes, skips)
    SELECT ${event.cardId}, ${event.ageBand}, ${event.cardType}, ${event.title}, 1, ${likeIncrement}, ${dislikeIncrement}, ${skipIncrement}
    FROM accepted_event
    ON CONFLICT (card_id, age_band) DO UPDATE SET
      card_type = EXCLUDED.card_type,
      title = EXCLUDED.title,
      times_shown = swipe_card_performance.times_shown + 1,
      likes = swipe_card_performance.likes + EXCLUDED.likes,
      dislikes = swipe_card_performance.dislikes + EXCLUDED.dislikes,
      skips = swipe_card_performance.skips + EXCLUDED.skips,
      updated_at = NOW()
  `;
}

function readBlobToken(): string {
  const raw = String(process.env.BLOB_READ_WRITE_TOKEN || "").replace(/\r?\n/g, "").trim();
  if (!raw) return "";
  if ((raw.startsWith('"') && raw.endsWith('"')) || (raw.startsWith("'") && raw.endsWith("'"))) {
    return raw.slice(1, -1).trim();
  }
  return raw;
}

async function readBlobText(result: unknown): Promise<string | null> {
  if (!result || typeof result !== "object") return null;
  const body = (result as any).stream ?? (result as any).body;
  if (!body) return null;
  return new Response(body as BodyInit).text();
}

export function createSwipeCardPerformanceBlobStore(): SwipeCardPerformanceBlobStore {
  const token = readBlobToken();
  if (!token) throw new Error("swipe_card_performance_storage_unavailable");
  return {
    async putJson(pathname, value) {
      const { put } = await import("@vercel/blob");
      await put(pathname, JSON.stringify(value), {
        access: "private",
        addRandomSuffix: false,
        allowOverwrite: true,
        contentType: "application/json",
        token,
      });
    },
    async list(prefix) {
      const { list } = await import("@vercel/blob");
      const blobs: BlobMetadata[] = [];
      let cursor: string | undefined;
      do {
        const page = await list({ prefix, limit: 1000, cursor, token });
        blobs.push(...page.blobs.map((blob) => ({
          pathname: blob.pathname,
          uploadedAt: new Date(blob.uploadedAt).toISOString(),
        })));
        cursor = page.hasMore ? page.cursor : undefined;
      } while (cursor);
      return blobs;
    },
    async readJson(pathname) {
      const { get } = await import("@vercel/blob");
      const result = await get(pathname, { access: "private", token });
      if (!result) return null;
      const text = await readBlobText(result);
      return text == null ? null : JSON.parse(text);
    },
  };
}

function safePathSegment(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9_-]/g, "-").replace(/-{2,}/g, "-").slice(0, 100);
}

export async function recordSwipeCardPerformanceBlob(
  event: SwipeCardPerformanceEvent,
  store: SwipeCardPerformanceBlobStore = createSwipeCardPerformanceBlobStore(),
): Promise<void> {
  const canonical = canonicalizeSwipeCardPerformanceEvent(event);
  if (!canonical.eventId) throw new Error("missing_swipe_card_event_id");
  const stored: StoredSwipeCardPerformanceEvent = {
    ...canonical,
    eventId: canonical.eventId,
    recordedAt: new Date().toISOString(),
  };
  const pathname = `${SWIPE_CARD_PERFORMANCE_BLOB_PREFIX}${canonical.ageBand}/${safePathSegment(canonical.cardId)}/${canonical.eventId}.json`;
  await store.putJson(pathname, stored);
}

export async function listSwipeCardPerformanceBlob(
  store: SwipeCardPerformanceBlobStore = createSwipeCardPerformanceBlobStore(),
): Promise<SwipeCardPerformanceRow[]> {
  const metadata = await store.list(SWIPE_CARD_PERFORMANCE_BLOB_PREFIX);
  const aggregates = new Map<string, {
    cardId: string;
    cardType: string;
    title: string;
    ageBand: SwipeCardAgeBand;
    timesShown: number;
    likes: number;
    dislikes: number;
    skips: number;
  }>();
  for (let offset = 0; offset < metadata.length; offset += 50) {
    const batch = await Promise.allSettled(metadata.slice(offset, offset + 50).map((blob) => store.readJson(blob.pathname)));
    for (const result of batch) {
      if (result.status !== "fulfilled" || !result.value) continue;
      let event: SwipeCardPerformanceEvent;
      try {
        event = canonicalizeSwipeCardPerformanceEvent(parseSwipeCardPerformanceEvent(result.value));
      } catch {
        continue;
      }
      const key = `${event.ageBand}:${event.cardId}`;
      const current = aggregates.get(key) || {
        cardId: event.cardId,
        cardType: event.cardType,
        title: event.title,
        ageBand: event.ageBand,
        timesShown: 0,
        likes: 0,
        dislikes: 0,
        skips: 0,
      };
      aggregates.set(key, { ...current, ...applySwipeCardPerformanceEvent(current, event.action) });
    }
  }
  return [...aggregates.values()]
    .map(deriveSwipeCardPerformance)
    .sort((left, right) => left.ageBand.localeCompare(right.ageBand) || right.timesShown - left.timesShown || left.title.localeCompare(right.title));
}

export async function listSwipeCardPerformance(): Promise<SwipeCardPerformanceRow[]> {
  const sql = await getSQL();
  await ensureSchema(sql);
  const result = await sql`
    SELECT card_id, age_band, card_type, title, times_shown, likes, dislikes, skips
    FROM swipe_card_performance
    ORDER BY age_band ASC, times_shown DESC, title ASC
  `;
  return result.rows.map((row) => deriveSwipeCardPerformance({
    cardId: String(row.card_id || ""),
    cardType: String(row.card_type || ""),
    title: String(row.title || ""),
    ageBand: String(row.age_band || "") as SwipeCardAgeBand,
    timesShown: Number(row.times_shown || 0),
    likes: Number(row.likes || 0),
    dislikes: Number(row.dislikes || 0),
    skips: Number(row.skips || 0),
  }));
}
