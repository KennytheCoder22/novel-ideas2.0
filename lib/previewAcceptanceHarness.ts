export const PREVIEW_ACCEPTANCE_QUERY_PARAM = "acceptanceHarness";
export const PREVIEW_ACCEPTANCE_STORAGE_KEY = "novelideas_preview_acceptance_harness_v1";
export const PREVIEW_ACCEPTANCE_MODE_COOKIE_NAME = "novelideas_dashboard_preview_mode_v1";
export const PREVIEW_ACCEPTANCE_PIN = "123456";

export type PreviewAcceptanceDashboardMode = "live" | "fixtures" | "failure";

function normalizeScalar(value: unknown): string {
  if (Array.isArray(value)) return String(value[0] || "").trim();
  return String(value || "").trim();
}

export function isPreviewAcceptanceHost(hostname: unknown): boolean {
  const host = normalizeScalar(hostname).toLowerCase();
  return host.endsWith(".vercel.app") && host !== "vercel.app";
}

export function isPreviewAcceptanceHarnessEnabled(flagValue?: unknown): boolean {
  try {
    if (typeof window === "undefined") return false;
    if (!isPreviewAcceptanceHost(window.location.hostname)) return false;
    const explicitFlag = normalizeScalar(flagValue) === "1";
    const storedFlag = window.localStorage?.getItem(PREVIEW_ACCEPTANCE_STORAGE_KEY) === "1";
    return explicitFlag || storedFlag;
  } catch {
    return false;
  }
}

export function setPreviewAcceptanceHarnessEnabled(enabled: boolean): void {
  try {
    if (typeof window === "undefined") return;
    if (enabled) {
      window.localStorage?.setItem(PREVIEW_ACCEPTANCE_STORAGE_KEY, "1");
    } else {
      window.localStorage?.removeItem(PREVIEW_ACCEPTANCE_STORAGE_KEY);
    }
  } catch {
    // ignore browser storage failures
  }
}

export function normalizePreviewAcceptanceDashboardMode(value: unknown): PreviewAcceptanceDashboardMode {
  const normalized = normalizeScalar(value).toLowerCase();
  if (normalized === "fixtures") return "fixtures";
  if (normalized === "failure") return "failure";
  return "live";
}

export function readPreviewAcceptanceDashboardModeFromCookie(cookieHeader: unknown): PreviewAcceptanceDashboardMode {
  const cookie = String(cookieHeader || "");
  const parts = cookie.split(";");
  for (const part of parts) {
    const trimmed = part.trim();
    if (trimmed.startsWith(`${PREVIEW_ACCEPTANCE_MODE_COOKIE_NAME}=`)) {
      return normalizePreviewAcceptanceDashboardMode(trimmed.slice(`${PREVIEW_ACCEPTANCE_MODE_COOKIE_NAME}=`.length));
    }
  }
  return "live";
}

export function readPreviewAcceptanceDashboardModeFromDocument(): PreviewAcceptanceDashboardMode {
  try {
    if (typeof document === "undefined") return "live";
    return readPreviewAcceptanceDashboardModeFromCookie(document.cookie || "");
  } catch {
    return "live";
  }
}

export function writePreviewAcceptanceDashboardModeCookie(mode: PreviewAcceptanceDashboardMode): void {
  try {
    if (typeof document === "undefined") return;
    document.cookie = `${PREVIEW_ACCEPTANCE_MODE_COOKIE_NAME}=${normalizePreviewAcceptanceDashboardMode(mode)}; path=/; SameSite=Lax`;
  } catch {
    // ignore browser storage failures
  }
}

export function clearPreviewAcceptanceDashboardModeCookie(): void {
  try {
    if (typeof document === "undefined") return;
    document.cookie = `${PREVIEW_ACCEPTANCE_MODE_COOKIE_NAME}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/; SameSite=Lax`;
  } catch {
    // ignore browser storage failures
  }
}
