import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const read = (path) => readFileSync(resolve(root, path), "utf8");
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

const manifest = JSON.parse(read("public/manifest.webmanifest"));
assert(manifest.name === "Novel Ideas", "Manifest app name is incorrect.");
assert(manifest.short_name === "NovelIdeas", "Manifest short name is incorrect.");
assert(manifest.display === "standalone", "Manifest must use standalone display mode.");
assert(manifest.orientation === "portrait-primary", "Manifest must be portrait-friendly.");
assert(manifest.start_url === "/__pwa_launch__", "Manifest must use the hosted-context launch route.");
assert(manifest.scope === "/", "Manifest must cover hosted-library routes.");
assert(manifest.icons.some((icon) => icon.purpose === "any" && icon.sizes === "512x512"), "512px standard icon missing.");
assert(manifest.icons.some((icon) => icon.purpose === "maskable" && icon.sizes === "512x512"), "512px maskable icon missing.");
for (const icon of manifest.icons) {
  assert(existsSync(resolve(root, "public", icon.src.replace(/^\//, ""))), `Manifest icon missing: ${icon.src}`);
}

const html = read("app/+html.tsx");
assert(html.includes('rel="manifest" href="/manifest.webmanifest"'), "HTML does not link the canonical manifest.");
assert(html.includes('window.location.pathname === "/__pwa_launch__"'), "Installed launch restoration is missing.");
assert(html.includes("novelideas:pwa-launch-path"), "Installed launch storage key is missing.");

const runtime = read("lib/pwaRuntime.ts");
assert(runtime.includes('navigator.serviceWorker.register("/service-worker.js"'), "Service worker registration is missing.");
assert(runtime.includes("RESERVED_TOP_LEVEL_PATHS"), "Hosted-library path filtering is missing.");
assert(runtime.includes("pathname.match(/^\\/([A-Za-z0-9_-]+)\\/?$/)"), "Hosted-library route capture is missing.");

const installHook = read("hooks/use-pwa-install.ts");
assert(installHook.includes('"beforeinstallprompt"'), "Native browser install prompt is not captured.");
assert(installHook.includes("Add to Home Screen"), "iOS install instructions are missing.");
assert(installHook.includes("!standalone"), "Install action is not hidden in standalone mode.");

const menu = read("app/(tabs)/index.tsx");
assert(menu.includes(">Install NovelIdeas</Text>"), "Install NovelIdeas menu item is missing.");
assert(menu.includes("pwaInstall.shouldShowInstall"), "Install menu item is not conditionally displayed.");

const serviceWorker = read("public/service-worker.js");
assert(serviceWorker.includes('url.pathname.startsWith("/api/")'), "API requests are not explicitly excluded from caching.");
assert(serviceWorker.includes('request.mode === "navigate"'), "Live document routes are not explicitly excluded from caching.");
assert(serviceWorker.includes("isExpoStaticAsset"), "Service worker caching is too broad.");

console.log("PWA install regressions passed.");
