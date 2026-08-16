import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import type { VercelRequest, VercelResponse } from "@vercel/node";

export const OWNER_ANALYTICS_COOKIE_NAME = "novelideas_owner_analytics_v1";
const SESSION_TTL_SECONDS = 8 * 60 * 60;

function environmentCredentials(): { password: string; sessionSecret: string } | null {
  const password = String(process.env.OWNER_ANALYTICS_PASSWORD || "").trim();
  const sessionSecret = String(process.env.OWNER_ANALYTICS_SESSION_SECRET || "").trim();
  return password && sessionSecret ? { password, sessionSecret } : null;
}

function constantTimeEqual(left: string, right: string): boolean {
  const leftBuffer = createHash("sha256").update(left, "utf8").digest();
  const rightBuffer = createHash("sha256").update(right, "utf8").digest();
  return timingSafeEqual(leftBuffer, rightBuffer);
}

function signatureFor(expiresAt: string, secret: string): string {
  return createHmac("sha256", secret).update(expiresAt).digest("base64url");
}

function readCookie(req: VercelRequest, name: string): string {
  const prefix = `${name}=`;
  const entry = String(req.headers.cookie || "")
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(prefix));
  return entry ? decodeURIComponent(entry.slice(prefix.length)) : "";
}

export function ownerAnalyticsAuthConfigured(): boolean {
  return Boolean(environmentCredentials());
}

export function validateOwnerAnalyticsPassword(candidate: unknown): boolean {
  const credentials = environmentCredentials();
  if (!credentials || typeof candidate !== "string") return false;
  return constantTimeEqual(candidate, credentials.password);
}

export function createOwnerAnalyticsSessionToken(now: number = Date.now()): string {
  const credentials = environmentCredentials();
  if (!credentials) throw new Error("owner_analytics_auth_not_configured");
  const expiresAt = String(Math.floor(now / 1000) + SESSION_TTL_SECONDS);
  return `${expiresAt}.${signatureFor(expiresAt, credentials.sessionSecret)}`;
}

export function hasValidOwnerAnalyticsSession(req: VercelRequest, now: number = Date.now()): boolean {
  const credentials = environmentCredentials();
  if (!credentials) return false;
  const token = readCookie(req, OWNER_ANALYTICS_COOKIE_NAME);
  const separator = token.indexOf(".");
  if (separator <= 0) return false;
  const expiresAt = token.slice(0, separator);
  const suppliedSignature = token.slice(separator + 1);
  if (!/^\d+$/.test(expiresAt) || Number(expiresAt) <= Math.floor(now / 1000)) return false;
  return constantTimeEqual(suppliedSignature, signatureFor(expiresAt, credentials.sessionSecret));
}

export function setOwnerAnalyticsSessionCookie(res: VercelResponse, token: string): void {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  res.setHeader(
    "Set-Cookie",
    `${OWNER_ANALYTICS_COOKIE_NAME}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${SESSION_TTL_SECONDS}${secure}`,
  );
}

export function clearOwnerAnalyticsSessionCookie(res: VercelResponse): void {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  res.setHeader(
    "Set-Cookie",
    `${OWNER_ANALYTICS_COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${secure}`,
  );
}
