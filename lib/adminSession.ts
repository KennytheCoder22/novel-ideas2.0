const ADMIN_SESSION_STORAGE_KEY = "novelideas_admin_session_v2";
const ADMIN_PENDING_ROUTE_STORAGE_KEY = "novelideas_admin_pending_admin_route_v1";

export type HostedAdminAuthorization = {
  pinEnabled: boolean;
  verifierConfigured: boolean;
  authorized: boolean;
};

function storage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.sessionStorage;
  } catch {
    return null;
  }
}

function normalizedLibraryId(libraryId: string): string {
  return normalizeHostedLibraryId(libraryId);
}

function localSessionKey(libraryId: string): string {
  return `${ADMIN_SESSION_STORAGE_KEY}:${normalizedLibraryId(libraryId) || "default"}`;
}

export function activateLocalAdminSession(libraryId: string, source: string = "menu"): void {
  storage()?.setItem(localSessionKey(libraryId), JSON.stringify({
    version: 2,
    source,
    activatedAt: new Date().toISOString(),
  }));
}

export function isLocalAdminSessionActive(libraryId: string): boolean {
  return Boolean(storage()?.getItem(localSessionKey(libraryId)));
}

export function isAdminSessionActive(): boolean {
  const sessionStorage = storage();
  if (!sessionStorage) return false;
  for (let index = 0; index < sessionStorage.length; index += 1) {
    if (String(sessionStorage.key(index) || "").startsWith(`${ADMIN_SESSION_STORAGE_KEY}:`)) return true;
  }
  return false;
}

export function clearLocalAdminSession(libraryId: string): void {
  storage()?.removeItem(localSessionKey(libraryId));
}

export async function getHostedAdminAuthorization(libraryId: string): Promise<HostedAdminAuthorization | null> {
  const id = normalizedLibraryId(libraryId);
  if (!id || typeof window === "undefined" || !window.location?.origin) return null;
  try {
    const response = await fetch(`/api/admin-auth?libraryId=${encodeURIComponent(id)}`, {
      credentials: "same-origin",
      cache: "no-store",
    });
    if (!response.ok) return null;
    return await response.json() as HostedAdminAuthorization;
  } catch {
    return null;
  }
}

export async function verifyHostedAdminPin(libraryId: string, pin: string): Promise<{
  authorized: boolean;
  error?: string;
}> {
  try {
    const response = await fetch("/api/admin-auth", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ libraryId: normalizedLibraryId(libraryId), pin }),
    });
    const payload = await response.json().catch(() => null) as Record<string, unknown> | null;
    return {
      authorized: response.ok && payload?.authorized === true,
      error: typeof payload?.error === "string" ? payload.error : undefined,
    };
  } catch {
    return { authorized: false, error: "authorization_unavailable" };
  }
}

export async function reenrollHostedAdminPin(
  libraryId: string,
  pin: string,
  recoverySecret: string,
): Promise<{ authorized: boolean; error?: string }> {
  try {
    const response = await fetch("/api/admin-auth", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "reenroll",
        libraryId: normalizedLibraryId(libraryId),
        pin,
        recoverySecret,
      }),
    });
    const payload = await response.json().catch(() => null) as Record<string, unknown> | null;
    return {
      authorized: response.ok && payload?.authorized === true,
      error: typeof payload?.error === "string" ? payload.error : undefined,
    };
  } catch {
    return { authorized: false, error: "authorization_unavailable" };
  }
}

function normalizePendingRoute(path: string): string {
  return String(path || "").trim() === "/admin/human-review" ? "/admin/human-review" : "/app_admin-web";
}

export function setPendingAdminRoute(path: string): void {
  storage()?.setItem(ADMIN_PENDING_ROUTE_STORAGE_KEY, normalizePendingRoute(path));
}

export function getPendingAdminRoute(): string {
  return normalizePendingRoute(storage()?.getItem(ADMIN_PENDING_ROUTE_STORAGE_KEY) || "");
}

export function hasPendingAdminRoute(): boolean {
  return Boolean(storage()?.getItem(ADMIN_PENDING_ROUTE_STORAGE_KEY));
}

export function clearPendingAdminRoute(): void {
  storage()?.removeItem(ADMIN_PENDING_ROUTE_STORAGE_KEY);
}

export function consumePendingAdminRoute(): string {
  const next = getPendingAdminRoute();
  clearPendingAdminRoute();
  return next;
}
import { normalizeHostedLibraryId } from "./savedLibraries";
