const ADMIN_SESSION_STORAGE_KEY = "novelideas_admin_session_v1";
const ADMIN_PENDING_ROUTE_STORAGE_KEY = "novelideas_admin_pending_admin_route_v1";
export const ADMIN_SESSION_COOKIE_NAME = "novelideas_admin_session_v1";

function isWebRuntime(): boolean {
  return typeof window !== "undefined";
}

function storage(): Storage | null {
  try {
    if (!isWebRuntime()) return null;
    return window.sessionStorage;
  } catch {
    return null;
  }
}

function setCookie(name: string, value: string, expires?: string): void {
  try {
    if (typeof document === "undefined") return;
    const expiry = expires ? `; expires=${expires}` : "";
    document.cookie = `${name}=${value}; path=/; SameSite=Lax${expiry}`;
  } catch {
    // ignore browser storage failures
  }
}

function readCookie(name: string): string {
  try {
    if (typeof document === "undefined") return "";
    const needle = `${name}=`;
    const parts = String(document.cookie || "").split(";");
    for (const part of parts) {
      const trimmed = part.trim();
      if (trimmed.startsWith(needle)) return trimmed.slice(needle.length);
    }
  } catch {
    // ignore browser storage failures
  }
  return "";
}

function clearCookie(name: string): void {
  setCookie(name, "", "Thu, 01 Jan 1970 00:00:00 GMT");
}

function normalizePendingRoute(path: string): string {
  const normalized = String(path || "").trim();
  if (normalized === "/admin/human-review") return normalized;
  return "/app_admin-web";
}

export function activateAdminSession(source: string = "menu"): void {
  const session = {
    version: 1,
    source,
    activatedAt: new Date().toISOString(),
  };
  try {
    storage()?.setItem(ADMIN_SESSION_STORAGE_KEY, JSON.stringify(session));
  } catch {
    // ignore browser storage failures
  }
  setCookie(ADMIN_SESSION_COOKIE_NAME, "1");
}

export function isAdminSessionActive(): boolean {
  try {
    const raw = storage()?.getItem(ADMIN_SESSION_STORAGE_KEY);
    if (raw) return true;
  } catch {
    // ignore browser storage failures
  }
  return readCookie(ADMIN_SESSION_COOKIE_NAME) === "1";
}

export function clearAdminSession(): void {
  try {
    storage()?.removeItem(ADMIN_SESSION_STORAGE_KEY);
  } catch {
    // ignore browser storage failures
  }
  clearCookie(ADMIN_SESSION_COOKIE_NAME);
}

export function setPendingAdminRoute(path: string): void {
  try {
    storage()?.setItem(ADMIN_PENDING_ROUTE_STORAGE_KEY, normalizePendingRoute(path));
  } catch {
    // ignore browser storage failures
  }
}

export function getPendingAdminRoute(): string {
  try {
    return normalizePendingRoute(storage()?.getItem(ADMIN_PENDING_ROUTE_STORAGE_KEY) || "");
  } catch {
    return "/app_admin-web";
  }
}

export function hasPendingAdminRoute(): boolean {
  try {
    return Boolean(storage()?.getItem(ADMIN_PENDING_ROUTE_STORAGE_KEY));
  } catch {
    return false;
  }
}

export function clearPendingAdminRoute(): void {
  try {
    storage()?.removeItem(ADMIN_PENDING_ROUTE_STORAGE_KEY);
  } catch {
    // ignore browser storage failures
  }
}

export function consumePendingAdminRoute(): string {
  const next = getPendingAdminRoute();
  clearPendingAdminRoute();
  return next;
}
