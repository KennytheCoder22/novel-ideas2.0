export type ThemeKey =
  | "dark_blue"
  | "classic_blue"
  | "sky_blue"
  | "forest_green"
  | "kelly_green"
  | "cardinal_red"
  | "pink"
  | "purple"
  | "slate"
  | "gold_accent";

export type HighlightKey = ThemeKey | "white" | "black" | "silver";

// Controls the *banner title* text color ("Novel | Ideas" or the library name).
// Kept intentionally tiny: the UI exposes explicit Black/White buttons.
export type TitleTextKey = "white" | "black";
export const WEB_HIGHLIGHT_CSS_VAR = "--highlight-color";
export const DEFAULT_HIGHLIGHT_COLOR = "#fbbf24";
export const ADMIN_CONFIG_STORAGE_KEY = "novelideas_admin_config";
export const ADMIN_CONFIG_STORAGE_KEY_PREFIX = "novelideas_admin_config_v2";
export const ADMIN_CONFIG_DEFAULT_SCOPE = "default";
export const ADMIN_CONFIG_CHANGED_EVENT = "novelideas:admin-config-saved";

export function normalizeAdminDraftScopeId(raw: string): string {
  const normalized = String(raw || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, "")
    .slice(0, 64);
  return normalized || ADMIN_CONFIG_DEFAULT_SCOPE;
}

export function adminConfigStorageKeyForScope(scopeId: string): string {
  const normalized = normalizeAdminDraftScopeId(scopeId);
  return `${ADMIN_CONFIG_STORAGE_KEY_PREFIX}:${normalized}`;
}

type HighlightPreset = { highlight: string; lightBorder: string; highlightTextOn: string };

function highlightPreset(h: HighlightKey): HighlightPreset {
  const presets: Record<HighlightKey, HighlightPreset> = {
    dark_blue: { highlight: "#223b6b", lightBorder: "#7aa2d6", highlightTextOn: "#f9fafb" },
    classic_blue: { highlight: "#2563eb", lightBorder: "#93c5fd", highlightTextOn: "#f9fafb" },
    sky_blue: { highlight: "#38bdf8", lightBorder: "#7dd3fc", highlightTextOn: "#0b1e33" },
    forest_green: { highlight: "#15803d", lightBorder: "#4ade80", highlightTextOn: "#f9fafb" },
    kelly_green: { highlight: "#22c55e", lightBorder: "#86efac", highlightTextOn: "#0b1e33" },
    cardinal_red: { highlight: "#ef4444", lightBorder: "#fca5a5", highlightTextOn: "#0b1e33" },
    pink: { highlight: "#ec4899", lightBorder: "#f9a8d4", highlightTextOn: "#0b1e33" },
    purple: { highlight: "#a855f7", lightBorder: "#d8b4fe", highlightTextOn: "#0b1e33" },
    slate: { highlight: "#64748b", lightBorder: "#cbd5e1", highlightTextOn: "#f9fafb" },
    gold_accent: { highlight: "#fbbf24", lightBorder: "#fde68a", highlightTextOn: "#1f2933" },

    white: { highlight: "#ffffff", lightBorder: "#e5e7eb", highlightTextOn: "#0b1e33" },
    black: { highlight: "#000000", lightBorder: "#374151", highlightTextOn: "#f9fafb" },
    silver: { highlight: "#e5e7eb", lightBorder: "#9ca3af", highlightTextOn: "#0b1e33" },
  };

  return presets[h];
}

export function buildTheme(
  mainThemeKey: ThemeKey,
  highlightKey: HighlightKey,
  titleTextKey: TitleTextKey = "white"
) {
  // Dark base stays consistent (school-friendly). Main + highlight are chosen separately.
  const base = {
    appBg: "#0b1e33",
    cardBg: "#10243f",
    cardBorder: "#223b6b",
    text: "#e5efff",
    subtext: "#cbd5f5",
    muted: "#93c5fd",
    inputBg: "#0b1e33",
    inputBorder: "#223b6b",
    resultBg: "#0b1e33",
    resultBorder: "#223b6b",
    danger: "#fecaca",
  };

  const mainPresets: Record<
    ThemeKey,
    { accent: string; accentBorder: string; accentTextOn: string }
  > = {
    dark_blue: { accent: "#0b1e33", accentBorder: "#223b6b", accentTextOn: "#f9fafb" },
    classic_blue: { accent: "#1d4ed8", accentBorder: "#1d4ed8", accentTextOn: "#f9fafb" },
    sky_blue: { accent: "#38bdf8", accentBorder: "#0284c7", accentTextOn: "#0b1e33" },
    forest_green: { accent: "#15803d", accentBorder: "#166534", accentTextOn: "#f9fafb" },
    kelly_green: { accent: "#22c55e", accentBorder: "#16a34a", accentTextOn: "#0b1e33" },
    cardinal_red: { accent: "#ef4444", accentBorder: "#dc2626", accentTextOn: "#0b1e33" },
    pink: { accent: "#ec4899", accentBorder: "#db2777", accentTextOn: "#0b1e33" },
    purple: { accent: "#a855f7", accentBorder: "#7c3aed", accentTextOn: "#0b1e33" },
    slate: { accent: "#64748b", accentBorder: "#475569", accentTextOn: "#f9fafb" },
    gold_accent: { accent: "#fbbf24", accentBorder: "#f59e0b", accentTextOn: "#1f2933" },
  };

  const hi = highlightPreset(highlightKey);

  const titleText = titleTextKey === "black" ? "#0b1e33" : base.text;

  return {
    ...base,
    ...mainPresets[mainThemeKey],
    ...hi,
    titleText,
    highlightBg: hi.highlight,
    highlightText: hi.highlightTextOn,
  };
}

export function applyWebHighlightColor(highlightColor: string) {
  if (typeof document === "undefined") return;
  document.documentElement.style.setProperty(WEB_HIGHLIGHT_CSS_VAR, highlightColor || DEFAULT_HIGHLIGHT_COLOR);
}

export function initWebHighlightColorFromStorage() {
  if (typeof document === "undefined" || typeof window === "undefined") return;
  const defaultKey = adminConfigStorageKeyForScope(ADMIN_CONFIG_DEFAULT_SCOPE);
  const raw = window.localStorage.getItem(defaultKey);
  if (!raw) {
    applyWebHighlightColor(DEFAULT_HIGHLIGHT_COLOR);
    return;
  }
  try {
    const parsed = JSON.parse(raw);
    const highlightKey = parsed?.branding?.highlight ?? parsed?.theme?.highlightKey ?? "gold_accent";
    const color = highlightPreset(highlightKey as HighlightKey)?.highlight ?? DEFAULT_HIGHLIGHT_COLOR;
    applyWebHighlightColor(color);
  } catch {
    applyWebHighlightColor(DEFAULT_HIGHLIGHT_COLOR);
  }
}

// ---------------------------------------------------------------------------
// Hex color utilities
// ---------------------------------------------------------------------------

/** Parse a 3- or 6-digit hex color into {r, g, b} in [0, 255]. Returns null on failure. */
export function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const clean = hex.replace(/^#/, "").trim();
  if (clean.length === 3) {
    const r = parseInt(clean[0] + clean[0], 16);
    const g = parseInt(clean[1] + clean[1], 16);
    const b = parseInt(clean[2] + clean[2], 16);
    if (isNaN(r) || isNaN(g) || isNaN(b)) return null;
    return { r, g, b };
  }
  if (clean.length === 6) {
    const r = parseInt(clean.slice(0, 2), 16);
    const g = parseInt(clean.slice(2, 4), 16);
    const b = parseInt(clean.slice(4, 6), 16);
    if (isNaN(r) || isNaN(g) || isNaN(b)) return null;
    return { r, g, b };
  }
  return null;
}

/** WCAG relative luminance for a linear RGB channel value in [0, 1]. */
function linearize(channel: number): number {
  const c = channel / 255;
  return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

/** WCAG relative luminance of a hex color. Returns 0 on invalid input. */
export function relativeLuminance(hex: string): number {
  const rgb = hexToRgb(hex);
  if (!rgb) return 0;
  const R = linearize(rgb.r);
  const G = linearize(rgb.g);
  const B = linearize(rgb.b);
  return 0.2126 * R + 0.7152 * G + 0.0722 * B;
}

/**
 * Choose black (#000000) or white (#ffffff) for text on the given background,
 * using the WCAG luminance threshold (L > 0.179 → black text for better contrast).
 */
export function autoChooseFontColor(bgHex: string): "#000000" | "#ffffff" {
  return relativeLuminance(bgHex) > 0.179 ? "#000000" : "#ffffff";
}

/** Canonical hex for each named MainTheme key. */
const MAIN_KEY_TO_HEX: Record<ThemeKey, string> = {
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

/** Canonical hex for each named Highlight key. */
const HIGHLIGHT_KEY_TO_HEX: Record<HighlightKey, string> = {
  dark_blue: "#223b6b",
  classic_blue: "#2563eb",
  sky_blue: "#38bdf8",
  forest_green: "#15803d",
  kelly_green: "#22c55e",
  cardinal_red: "#ef4444",
  pink: "#ec4899",
  purple: "#a855f7",
  slate: "#64748b",
  gold_accent: "#fbbf24",
  white: "#ffffff",
  black: "#000000",
  silver: "#e5e7eb",
};

/** Convert a named ThemeKey to its canonical hex. Falls back to dark_blue. */
export function mainKeyToHex(key: ThemeKey | undefined | null): string {
  return MAIN_KEY_TO_HEX[(key ?? "dark_blue") as ThemeKey] ?? MAIN_KEY_TO_HEX.dark_blue;
}

/** Convert a named HighlightKey to its canonical hex. Falls back to gold_accent. */
export function highlightKeyToHex(key: HighlightKey | undefined | null): string {
  return HIGHLIGHT_KEY_TO_HEX[(key ?? "gold_accent") as HighlightKey] ?? HIGHLIGHT_KEY_TO_HEX.gold_accent;
}

/** Reverse-map a hex string to its closest ThemeKey, or null if no match. */
export function hexToMainKey(hex: string): ThemeKey | null {
  const normalized = hex.trim().toLowerCase();
  for (const [k, v] of Object.entries(MAIN_KEY_TO_HEX)) {
    if (v.toLowerCase() === normalized) return k as ThemeKey;
  }
  return null;
}

/** Reverse-map a hex string to its closest HighlightKey, or null if no match. */
export function hexToHighlightKey(hex: string): HighlightKey | null {
  const normalized = hex.trim().toLowerCase();
  for (const [k, v] of Object.entries(HIGHLIGHT_KEY_TO_HEX)) {
    if (v.toLowerCase() === normalized) return k as HighlightKey;
  }
  return null;
}

/** Validate that a string is a valid 6-digit hex color (#rrggbb). */
export function isValidHex(hex: string): boolean {
  return /^#[0-9a-fA-F]{6}$/.test(hex);
}
