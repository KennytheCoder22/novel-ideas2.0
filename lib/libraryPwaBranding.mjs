import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import sharp from "sharp";

const DEFAULT_THEME_COLOR = "#07182b";
const MAIN_THEME_COLORS = {
  dark_blue: "#0b1e33",
  classic_blue: "#1d4ed8",
  sky_blue: "#38bdf8",
  forest_green: "#15803d",
  kelly_green: "#22c55e",
  cardinal_red: "#ef4444",
  pink: "#ec4899",
  purple: "#a855f7",
  slate: "#64748b",
  gold_accent: "#fbbf24",
};

function record(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function validHex(value) {
  const normalized = String(value || "").trim();
  return /^#[0-9a-f]{6}$/i.test(normalized) ? normalized.toLowerCase() : "";
}

export function libraryPwaThemeColor(config) {
  const branding = record(record(config).branding);
  const theme = record(record(config).theme);
  const explicit = validHex(branding.mainColorHex);
  if (explicit) return explicit;
  const key = String(branding.mainTheme || branding.theme || theme.mainThemeKey || "");
  return MAIN_THEME_COLORS[key] || DEFAULT_THEME_COLOR;
}

export function libraryPwaName(config, libraryId) {
  const root = record(config);
  const branding = record(root.branding);
  const library = record(root.library);
  return String(branding.libraryName || library.name || `${String(libraryId || "").toUpperCase()} Library`).trim();
}

export function libraryPwaShortName(config, libraryId) {
  const normalizedId = String(libraryId || "").trim().toUpperCase();
  if (normalizedId) return normalizedId.slice(0, 12);
  return libraryPwaName(config, libraryId).replace(/\s+/g, "").slice(0, 12) || "Library";
}

export function readLibraryLogoBuffer(config) {
  const branding = record(record(config).branding);
  const dataUrl = String(branding.logoDataUrl || "").trim();
  const match = dataUrl.match(/^data:[^;,]+;base64,([A-Za-z0-9+/=\s]+)$/);
  if (!match) return null;
  const buffer = Buffer.from(match[1].replace(/\s/g, ""), "base64");
  if (!buffer.length || buffer.length > 5 * 1024 * 1024) return null;
  return buffer;
}

export function libraryPwaIconVersion(config, logoBuffer) {
  return createHash("sha256")
    .update(libraryPwaName(config, ""))
    .update(libraryPwaThemeColor(config))
    .update(logoBuffer || Buffer.alloc(0))
    .digest("hex")
    .slice(0, 12);
}

export function buildHostedLibraryManifest(config, libraryId, options = {}) {
  const encodedId = encodeURIComponent(String(libraryId || "").trim());
  const route = `/${encodedId}`;
  const themeColor = libraryPwaThemeColor(config);
  const iconVersion = String(options.iconVersion || "fallback");
  const iconBase = `/api/library-config?libraryId=${encodedId}&format=pwa-icon`;
  const dynamicIcon = (size, purpose) =>
    `${iconBase}&size=${size}&purpose=${purpose}&v=${encodeURIComponent(iconVersion)}`;
  const fallbackIcon = (size, purpose) =>
    `/icons/novelideas${purpose === "maskable" ? "-maskable" : ""}-${size}.png`;
  const icon = (size, purpose) =>
    options.hasCustomIcon ? dynamicIcon(size, purpose) : fallbackIcon(size, purpose);

  return {
    id: route,
    name: libraryPwaName(config, libraryId),
    short_name: libraryPwaShortName(config, libraryId),
    description: `Library discovery and recommendations for ${libraryPwaName(config, libraryId)}`,
    start_url: route,
    scope: "/",
    display: "standalone",
    orientation: "portrait-primary",
    background_color: themeColor,
    theme_color: themeColor,
    icons: [
      { src: icon(192, "any"), sizes: "192x192", type: "image/png", purpose: "any" },
      { src: icon(512, "any"), sizes: "512x512", type: "image/png", purpose: "any" },
      { src: icon(192, "maskable"), sizes: "192x192", type: "image/png", purpose: "maskable" },
      { src: icon(512, "maskable"), sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}

export function fallbackPwaIconPath(size, purpose) {
  if (size === 180) return "/icons/apple-touch-icon.png";
  return `/icons/novelideas${purpose === "maskable" ? "-maskable" : ""}-${size}.png`;
}

export async function libraryPwaLogoIsUsable(logoBuffer) {
  if (!logoBuffer) return false;
  try {
    const metadata = await sharp(logoBuffer, { limitInputPixels: 25_000_000 }).metadata();
    return !!metadata.width && !!metadata.height;
  } catch {
    return false;
  }
}

export async function renderLibraryPwaIcon(logoBuffer, size, purpose, background) {
  const contentRatio = purpose === "maskable" ? 0.6 : 0.84;
  const contentSize = Math.round(size * contentRatio);
  const logo = await sharp(logoBuffer, { limitInputPixels: 25_000_000 })
    .rotate()
    .resize(contentSize, contentSize, {
      fit: "inside",
      withoutEnlargement: false,
    })
    .png()
    .toBuffer();

  return sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background,
    },
  })
    .composite([{ input: logo, gravity: "centre" }])
    .png()
    .toBuffer();
}
