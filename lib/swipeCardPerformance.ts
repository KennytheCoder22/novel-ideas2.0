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

let sqlClient: SqlClient | null = null;
let schemaReady: Promise<void> | null = null;

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
  if (!cardId || !cardType || !title) throw new Error("missing_swipe_card_fields");
  if (!SWIPE_CARD_AGE_BANDS.includes(ageBand)) throw new Error("invalid_swipe_card_age_band");
  if (!SWIPE_CARD_ACTIONS.includes(action)) throw new Error("invalid_swipe_card_action");
  return { cardId, cardType, title, ageBand, action };
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
