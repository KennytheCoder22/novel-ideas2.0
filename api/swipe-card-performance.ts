import type { VercelRequest, VercelResponse } from "@vercel/node";
import {
  parseSwipeCardPerformanceEvent,
  recordSwipeCardPerformance,
} from "../lib/swipeCardPerformance";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "method_not_allowed" });
  }

  try {
    const event = parseSwipeCardPerformanceEvent(req.body);
    await recordSwipeCardPerformance(event);
    return res.status(200).json({ status: "recorded" });
  } catch (error: any) {
    const message = typeof error?.message === "string" ? error.message : "swipe_card_performance_failed";
    const invalid = message.startsWith("invalid_") || message.startsWith("missing_");
    return res.status(invalid ? 400 : 500).json({ error: message });
  }
}
