import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import sharp from "sharp";

import {
  buildHostedLibraryManifest,
  libraryPwaLogoIsUsable,
  readLibraryLogoBuffer,
  renderLibraryPwaIcon,
} from "../lib/libraryPwaBranding.mjs";

const root = process.cwd();
const read = (path) => readFileSync(resolve(root, path), "utf8");
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

const manifest = JSON.parse(read("public/manifest.webmanifest"));
assert(manifest.name === "Novel Ideas", "Generic manifest app name is incorrect.");
assert(manifest.short_name === "NovelIdeas", "Generic manifest short name is incorrect.");
assert(manifest.display === "standalone", "Generic manifest must use standalone display mode.");
assert(manifest.orientation === "portrait-primary", "Generic manifest must be portrait-friendly.");
assert(manifest.start_url === "/", "Generic installation must launch at the generic root.");
assert(manifest.scope === "/", "Generic manifest must cover application routes.");
assert(manifest.icons.some((icon) => icon.purpose === "any" && icon.sizes === "512x512"), "512px standard icon missing.");
assert(manifest.icons.some((icon) => icon.purpose === "maskable" && icon.sizes === "512x512"), "512px maskable icon missing.");
for (const icon of manifest.icons) {
  assert(existsSync(resolve(root, "public", icon.src.replace(/^\//, ""))), `Manifest icon missing: ${icon.src}`);
}

const sourceLogo = await sharp({
  create: { width: 400, height: 200, channels: 4, background: "#ef4444" },
}).png().toBuffer();
const encodedLogo = `data:image/jpeg;base64,${sourceLogo.toString("base64")}`;
const yvhsConfig = {
  library: { id: "yvhs", name: "YVHS Library" },
  branding: {
    libraryId: "yvhs",
    libraryName: "YVHS Library",
    logoDataUrl: encodedLogo,
    mainColorHex: "#123456",
  },
};
const logoBuffer = readLibraryLogoBuffer(yvhsConfig);
assert(logoBuffer && await libraryPwaLogoIsUsable(logoBuffer), "Uploaded logo data must be recognized by image content.");
const yvhsManifest = buildHostedLibraryManifest(yvhsConfig, "yvhs", {
  hasCustomIcon: true,
  iconVersion: "yvhs-version",
});
assert(yvhsManifest.name === "YVHS Library", "Hosted manifest must use the configured library name.");
assert(yvhsManifest.short_name === "YVHS", "Hosted manifest short name must derive from the library ID.");
assert(yvhsManifest.id === "/yvhs", "Hosted manifest identity must be unique to the library.");
assert(yvhsManifest.start_url === "/yvhs", "Hosted manifest must launch directly into its library route.");
assert(yvhsManifest.theme_color === "#123456", "Hosted manifest must use the configured main color.");
assert(yvhsManifest.icons.every((icon) => icon.src.includes("libraryId=yvhs")), "Hosted icons must be library-specific.");
assert(yvhsManifest.icons.every((icon) => icon.src.includes("v=yvhs-version")), "Hosted icons must be versioned.");

const secondManifest = buildHostedLibraryManifest({
  library: { id: "northbranch", name: "North Branch Library" },
  branding: { libraryName: "North Branch Library", logoDataUrl: encodedLogo },
}, "northbranch", { hasCustomIcon: true, iconVersion: "north-version" });
assert(secondManifest.name === "North Branch Library", "Arbitrary hosted libraries must use their own names.");
assert(secondManifest.short_name === "NORTHBRANCH", "Arbitrary hosted libraries must derive their own short names.");
assert(secondManifest.id === "/northbranch" && secondManifest.start_url === "/northbranch", "Arbitrary library identity must remain isolated.");
assert(secondManifest.icons.every((icon) => icon.src.includes("libraryId=northbranch")), "Arbitrary library icons must remain isolated.");
assert(!secondManifest.icons.some((icon) => yvhsManifest.icons.some((yvhsIcon) => yvhsIcon.src === icon.src)), "Library icon URLs must not collide.");

const fallbackManifest = buildHostedLibraryManifest({
  library: { id: "nologo", name: "No Logo Library" },
  branding: { libraryName: "No Logo Library" },
}, "nologo", { hasCustomIcon: false });
assert(fallbackManifest.icons.every((icon) => icon.src.startsWith("/icons/novelideas")), "Missing logos must use generic branded icons.");

const normalIcon = await renderLibraryPwaIcon(logoBuffer, 192, "any", "#123456");
const normalMetadata = await sharp(normalIcon).metadata();
assert(normalMetadata.width === 192 && normalMetadata.height === 192 && normalMetadata.format === "png", "Standard uploaded-logo icon must be a valid 192px PNG.");
const { data: normalPixels, info: normalInfo } = await sharp(normalIcon).raw().toBuffer({ resolveWithObject: true });
let minX = normalInfo.width;
let minY = normalInfo.height;
let maxX = -1;
let maxY = -1;
for (let y = 0; y < normalInfo.height; y += 1) {
  for (let x = 0; x < normalInfo.width; x += 1) {
    const offset = (y * normalInfo.width + x) * normalInfo.channels;
    const isBackground =
      normalPixels[offset] === 0x12
      && normalPixels[offset + 1] === 0x34
      && normalPixels[offset + 2] === 0x56;
    if (isBackground) continue;
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }
}
const renderedLogoWidth = maxX - minX + 1;
const renderedLogoHeight = maxY - minY + 1;
assert(
  renderedLogoWidth > 0 && renderedLogoHeight > 0 && Math.abs((renderedLogoWidth / renderedLogoHeight) - 2) < 0.1,
  "Uploaded logos must retain their aspect ratio.",
);
const maskableIcon = await renderLibraryPwaIcon(logoBuffer, 512, "maskable", "#123456");
const maskableMetadata = await sharp(maskableIcon).metadata();
assert(maskableMetadata.width === 512 && maskableMetadata.height === 512, "Maskable uploaded-logo icon must be a valid 512px PNG.");

const html = read("app/+html.tsx");
assert(html.includes('format=pwa-manifest'), "Hosted pages do not select a dynamic manifest.");
assert(html.includes('format=pwa-icon&size=180&purpose=any'), "Hosted pages do not select a dynamic Apple touch icon.");
assert(html.includes('"/manifest.webmanifest"'), "Generic pages do not retain the generic manifest.");
assert(html.includes('"/icons/apple-touch-icon.png"'), "Generic pages do not retain the generic Apple icon.");
assert(html.includes('window.location.pathname === "/__pwa_launch__"'), "Legacy installed launch restoration is missing.");

const runtime = read("lib/pwaRuntime.ts");
assert(runtime.includes('navigator.serviceWorker.register("/service-worker.js"'), "Service worker registration is missing.");
assert(runtime.includes("updatePwaDocumentBranding"), "Runtime library title and theme updates are missing.");
assert(runtime.includes("brandingSource") && runtime.includes("&v=${version}"), "Runtime branding URLs are not versioned after configuration loads.");

const installHook = read("hooks/use-pwa-install.ts");
assert(installHook.includes('"beforeinstallprompt"'), "Native browser install prompt is not captured.");
assert(installHook.includes("Add to Home Screen"), "iOS install instructions are missing.");
assert(installHook.includes("!standalone"), "Install action is not hidden in standalone mode.");

const menu = read("app/(tabs)/index.tsx");
assert(menu.includes(">Install NovelIdeas</Text>"), "Install NovelIdeas menu item is missing.");
assert(menu.includes("pwaInstall.shouldShowInstall"), "Install menu item is not conditionally displayed.");

const api = read("api/library-config.ts");
assert(api.includes('format === "pwa-manifest"'), "Existing library-config function does not serve dynamic manifests.");
assert(api.includes('format === "pwa-icon"'), "Existing library-config function does not serve dynamic icons.");
assert(api.includes('"private, no-store"'), "Dynamic PWA branding responses may be cached across configuration changes.");

const serviceWorker = read("public/service-worker.js");
assert(serviceWorker.includes('url.pathname.startsWith("/api/")'), "API requests are not explicitly excluded from caching.");
assert(serviceWorker.includes('request.mode === "navigate"'), "Live document routes are not explicitly excluded from caching.");
assert(serviceWorker.includes("isExpoStaticAsset"), "Service worker caching is too broad.");

console.log("PWA install regressions passed.");
