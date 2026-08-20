import type { VercelRequest, VercelResponse } from "@vercel/node";
import {
  parseSwipeCardPerformanceEvent,
  recordSwipeCardPerformance,
  recordSwipeCardPerformanceBlob,
} from "../lib/swipeCardPerformance";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const storageMode = process.env.POSTGRES_URL
    ? "durable_postgres"
    : process.env.BLOB_READ_WRITE_TOKEN
      ? "durable_blob"
      : "unavailable";
  if (req.method === "GET") {
    return res.status(storageMode === "unavailable" ? 503 : 200).json({
      status: storageMode === "unavailable" ? "unavailable" : "ready",
      storageMode,
    });
  }
  if (req.method !== "POST") {
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ error: "method_not_allowed" });
  }

  try {
    const event = parseSwipeCardPerformanceEvent(req.body);
    if (storageMode === "durable_postgres") {
      await recordSwipeCardPerformance(event);
      return res.status(200).json({ status: "recorded", storageMode: "durable_postgres" });
    }
    if (storageMode === "durable_blob") {
      await recordSwipeCardPerformanceBlob(event.eventId ? event : {
        ...event,
        eventId: `legacy-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 14)}`,
      });
      return res.status(200).json({ status: "recorded", storageMode: "durable_blob" });
    }
    return res.status(503).json({ error: "swipe_card_performance_storage_unavailable" });
  } catch (error: any) {
    const message = typeof error?.message === "string" ? error.message : "swipe_card_performance_failed";
    const invalid = message.startsWith("invalid_") || message.startsWith("missing_");
    return res.status(invalid ? 400 : 500).json({ error: message });
  }
}
