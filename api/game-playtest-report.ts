import type { VercelRequest, VercelResponse } from "@vercel/node";
import { hasValidOwnerAnalyticsSession, ownerAnalyticsAuthConfigured } from "../lib/ownerAnalyticsAuth";
import { buildPlaytestReport, parsePlaytestFilters, type GamePlaytestApiResponse } from "../lib/gamePlaytest/analysis";
import { readGamePlaytestEvents } from "../lib/gamePlaytest/repository";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "method_not_allowed" });
  }
  if (!ownerAnalyticsAuthConfigured()) return res.status(503).json({ error: "owner_analytics_auth_not_configured" });
  if (!hasValidOwnerAnalyticsSession(req)) return res.status(401).json({ error: "owner_session_required" });
  try {
    const filters = parsePlaytestFilters(req.query as Record<string, unknown>);
    const { events, storage, malformedRecords, truncatedGames } = await readGamePlaytestEvents();
    const body: GamePlaytestApiResponse = {
      status: "ok",
      storage,
      storageGaps: Object.entries(storage).flatMap(([game, mode]) => mode.startsWith("gap:") ? [{ game, detail: mode.slice(4) }] : []),
      storageTruncated: truncatedGames,
      ...buildPlaytestReport(events, filters, malformedRecords),
    };
    return res.status(200).json(body);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "game_playtest_report_failed";
    const status = /^invalid_playtest_|^playtest_date_range/.test(message) ? 400 : 500;
    return res.status(status).json({ error: message });
  }
}
