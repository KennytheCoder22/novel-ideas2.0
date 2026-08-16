import type { VercelRequest, VercelResponse } from "@vercel/node";
import {
  clearOwnerAnalyticsSessionCookie,
  createOwnerAnalyticsSessionToken,
  hasValidOwnerAnalyticsSession,
  ownerAnalyticsAuthConfigured,
  setOwnerAnalyticsSessionCookie,
  validateOwnerAnalyticsPassword,
} from "../lib/ownerAnalyticsAuth";

export default function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Cache-Control", "no-store");

  if (req.method === "GET") {
    return res.status(200).json({ authenticated: hasValidOwnerAnalyticsSession(req) });
  }

  if (req.method === "DELETE") {
    clearOwnerAnalyticsSessionCookie(res);
    return res.status(200).json({ authenticated: false });
  }

  if (req.method !== "POST") {
    res.setHeader("Allow", "GET, POST, DELETE");
    return res.status(405).json({ error: "method_not_allowed" });
  }

  if (!ownerAnalyticsAuthConfigured()) {
    return res.status(503).json({ error: "owner_analytics_auth_not_configured" });
  }

  const password = req.body && typeof req.body === "object" ? req.body.password : "";
  if (!validateOwnerAnalyticsPassword(password)) {
    clearOwnerAnalyticsSessionCookie(res);
    return res.status(401).json({ error: "owner_authentication_failed" });
  }

  setOwnerAnalyticsSessionCookie(res, createOwnerAnalyticsSessionToken());
  return res.status(200).json({ authenticated: true });
}
