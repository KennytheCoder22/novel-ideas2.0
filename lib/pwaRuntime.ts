import { Platform } from "react-native";

export const PWA_LAUNCH_PATH_KEY = "novelideas:pwa-launch-path";

const RESERVED_TOP_LEVEL_PATHS = new Set([
  "__pwa_launch__",
  "about",
  "admin",
  "admin-collection",
  "app_admin-web",
  "customize-my-experience",
  "feedback",
  "how-it-works",
  "privacy",
  "swipe",
  "testing",
]);

export function isStandalonePwa(): boolean {
  if (Platform.OS !== "web" || typeof window === "undefined") return false;
  const navigatorWithStandalone = window.navigator as Navigator & { standalone?: boolean };
  return window.matchMedia?.("(display-mode: standalone)").matches === true
    || navigatorWithStandalone.standalone === true;
}

export function isIosBrowser(): boolean {
  if (Platform.OS !== "web" || typeof window === "undefined") return false;
  const navigatorWithTouchPoints = window.navigator as Navigator & { maxTouchPoints?: number };
  return /iPad|iPhone|iPod/.test(navigatorWithTouchPoints.userAgent)
    || (navigatorWithTouchPoints.platform === "MacIntel" && (navigatorWithTouchPoints.maxTouchPoints ?? 0) > 1);
}

export function rememberPwaLaunchPath(): void {
  if (Platform.OS !== "web" || typeof window === "undefined") return;

  try {
    const { pathname, search } = window.location;
    if (pathname === "/") {
      window.localStorage.setItem(PWA_LAUNCH_PATH_KEY, "/");
      return;
    }

    const match = pathname.match(/^\/([A-Za-z0-9_-]+)\/?$/);
    if (!match || RESERVED_TOP_LEVEL_PATHS.has(match[1])) return;
    window.localStorage.setItem(PWA_LAUNCH_PATH_KEY, `${pathname}${search}`);
  } catch (error) {
    console.warn("NovelIdeas could not remember the installed launch path.", error);
  }
}

export function registerNovelIdeasServiceWorker(): void {
  if (Platform.OS !== "web" || typeof window === "undefined" || !("serviceWorker" in window.navigator)) return;

  const register = () => {
    void window.navigator.serviceWorker.register("/service-worker.js", { scope: "/" }).catch((error: unknown) => {
      console.warn("NovelIdeas service worker registration failed.", error);
    });
  };

  if (window.document.readyState === "complete") {
    register();
  } else {
    window.addEventListener("load", register, { once: true });
  }
}

export function updatePwaDocumentBranding(
  libraryId: string | undefined,
  libraryName: string,
  themeColor: string,
  logoDataUrl: string,
): void {
  if (Platform.OS !== "web" || typeof window === "undefined") return;
  const installedName = libraryId && libraryName.trim() ? libraryName.trim() : "Novel Ideas";
  window.document.title = installedName;
  window.document.querySelector('meta[name="apple-mobile-web-app-title"]')?.setAttribute("content", installedName);
  if (/^#[0-9a-f]{6}$/i.test(themeColor)) {
    window.document.querySelector('meta[name="theme-color"]')?.setAttribute("content", themeColor);
  }
  if (libraryId) {
    let hash = 2166136261;
    const brandingSource = `${installedName}\n${themeColor}\n${logoDataUrl}`;
    for (let index = 0; index < brandingSource.length; index += 1) {
      hash ^= brandingSource.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    const version = (hash >>> 0).toString(36);
    const encodedId = encodeURIComponent(libraryId);
    window.document.querySelector('link[rel="manifest"]')?.setAttribute(
      "href",
      `/api/library-config?libraryId=${encodedId}&format=pwa-manifest&v=${version}`,
    );
    window.document.querySelector('link[rel="apple-touch-icon"]')?.setAttribute(
      "href",
      `/api/library-config?libraryId=${encodedId}&format=pwa-icon&size=180&purpose=any&v=${version}`,
    );
  }
}

export function initializePwaRuntime(): void {
  rememberPwaLaunchPath();
  registerNovelIdeasServiceWorker();
}
