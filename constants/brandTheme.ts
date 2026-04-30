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
const ADMIN_CONFIG_STORAGE_KEY = "novelideas_admin_config";

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
  const raw = window.localStorage.getItem(ADMIN_CONFIG_STORAGE_KEY);
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
