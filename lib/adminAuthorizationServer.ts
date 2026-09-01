import type { VercelRequest, VercelResponse } from "@vercel/node";
import {
  createHmac,
  randomBytes,
  scryptSync,
  timingSafeEqual,
} from "node:crypto";
import {
  createSharedLibraryAdminVerifier,
  deleteSharedLibraryAdminVerifier,
  loadSharedLibraryAdminVerifier,
  loadSharedLibraryConfigPayload,
  saveSharedLibraryAdminVerifier,
} from "./librarySharing/storage";
import { normalizeHostedLibraryId } from "./savedLibraries";

export const ADMIN_SESSION_COOKIE_NAME = "novelideas_admin_session_v2";
const SESSION_TTL_MS = 8 * 60 * 60 * 1000;

type SessionPayload = {
  version: 2;
  libraryId: string;
  expiresAt: number;
  nonce: string;
};

function normalizeLibraryId(value: unknown): string {
  return normalizeHostedLibraryId(String(value || ""));
}

function sessionSecret(): string {
  return String(process.env.ADMIN_SESSION_SECRET || process.env.BLOB_READ_WRITE_TOKEN || "").trim();
}

function base64Url(value: string | Buffer): string {
  return Buffer.from(value).toString("base64url");
}

function signature(payload: string): string {
  const secret = sessionSecret();
  if (!secret) return "";
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

function readCookie(req: VercelRequest, name: string): string {
  const needle = `${name}=`;
  for (const part of String(req.headers.cookie || "").split(";")) {
    const value = part.trim();
    if (value.startsWith(needle)) return value.slice(needle.length);
  }
  return "";
}

function encodeSession(libraryId: string): string {
  const payload: SessionPayload = {
    version: 2,
    libraryId,
    expiresAt: Date.now() + SESSION_TTL_MS,
    nonce: randomBytes(16).toString("hex"),
  };
  const encoded = base64Url(JSON.stringify(payload));
  return `${encoded}.${signature(encoded)}`;
}

function sessionLibraryId(req: VercelRequest): string {
  const token = readCookie(req, ADMIN_SESSION_COOKIE_NAME);
  const [encoded, suppliedSignature] = token.split(".");
  if (!encoded || !suppliedSignature) return "";
  const expectedSignature = signature(encoded);
  if (!expectedSignature) return "";
  const supplied = Buffer.from(suppliedSignature);
  const expected = Buffer.from(expectedSignature);
  if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) return "";
  try {
    const payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as SessionPayload;
    if (payload.version !== 2 || payload.expiresAt <= Date.now()) return "";
    return normalizeLibraryId(payload.libraryId);
  } catch {
    return "";
  }
}

export function hasAuthorizedAdminSession(req: VercelRequest, libraryId: string): boolean {
  const normalizedLibraryId = normalizeLibraryId(libraryId);
  return Boolean(normalizedLibraryId && sessionLibraryId(req) === normalizedLibraryId);
}

export function issueAdminSession(res: VercelResponse, libraryId: string): void {
  const token = encodeSession(normalizeLibraryId(libraryId));
  if (!token) throw new Error("admin_session_secret_unavailable");
  res.setHeader(
    "Set-Cookie",
    `${ADMIN_SESSION_COOKIE_NAME}=${token}; Path=/; HttpOnly; Secure; SameSite=Strict`,
  );
}

export async function adminPinProtectionState(libraryId: string): Promise<{
  pinEnabled: boolean;
  verifierConfigured: boolean;
}> {
  const normalizedLibraryId = normalizeLibraryId(libraryId);
  const config = await loadSharedLibraryConfigPayload(normalizedLibraryId);
  const admin = config?.admin && typeof config.admin === "object" && !Array.isArray(config.admin)
    ? config.admin as Record<string, unknown>
    : {};
  const pinEnabled = admin.pinEnabled === true;
  const verifier = pinEnabled ? await loadSharedLibraryAdminVerifier(normalizedLibraryId) : null;
  return { pinEnabled, verifierConfigured: Boolean(verifier) };
}

export async function verifyAdminPin(libraryId: string, pin: string): Promise<boolean> {
  const normalizedLibraryId = normalizeLibraryId(libraryId);
  const verifier = await loadSharedLibraryAdminVerifier(normalizedLibraryId);
  if (!verifier || !/^\d{6}$/.test(pin)) return false;
  const candidate = scryptSync(pin, Buffer.from(verifier.salt, "base64"), 32);
  const expected = Buffer.from(verifier.hash, "base64");
  return candidate.length === expected.length && timingSafeEqual(candidate, expected);
}

export async function saveAdminPinVerifier(libraryId: string, pin: string): Promise<void> {
  if (!/^\d{6}$/.test(pin)) throw new Error("invalid_admin_pin");
  const salt = randomBytes(16);
  const hash = scryptSync(pin, salt, 32);
  await saveSharedLibraryAdminVerifier(normalizeLibraryId(libraryId), {
    version: 1,
    salt: salt.toString("base64"),
    hash: hash.toString("base64"),
  });
}

export async function enrollAdminPinVerifier(libraryId: string, pin: string): Promise<boolean> {
  if (!/^\d{6}$/.test(pin)) throw new Error("invalid_admin_pin");
  const salt = randomBytes(16);
  const hash = scryptSync(pin, salt, 32);
  return createSharedLibraryAdminVerifier(normalizeLibraryId(libraryId), {
    version: 1,
    salt: salt.toString("base64"),
    hash: hash.toString("base64"),
  });
}

export async function removeAdminPinVerifier(libraryId: string): Promise<void> {
  await deleteSharedLibraryAdminVerifier(normalizeLibraryId(libraryId));
}
