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

export function initializePwaRuntime(): void {
  rememberPwaLaunchPath();
  registerNovelIdeasServiceWorker();
}
