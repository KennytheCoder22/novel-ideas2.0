import type { VercelRequest, VercelResponse } from "@vercel/node";
import {
  parseRealSessionAuditEvent,
  recordRealSessionAudit,
} from "../lib/realSessionOverlapAudit";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "method_not_allowed" });
  }

  try {
    const event = parseRealSessionAuditEvent(req.body);
    const recorded = await recordRealSessionAudit(event);
    return res.status(200).json({ status: "recorded", recentOverlaps: recorded.recentOverlaps });
  } catch (error: any) {
    const message = typeof error?.message === "string" ? error.message : "real_session_audit_failed";
    const invalid = message.startsWith("invalid_") || message.startsWith("missing_");
    return res.status(invalid ? 400 : 500).json({ error: message });
  }
}
