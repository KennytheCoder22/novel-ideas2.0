import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { router, useLocalSearchParams } from "expo-router";
import {
  Alert,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  Switch,
  Image,
} from "react-native";
import QRCode from "react-native-qrcode-svg";
import configFile from "../NovelIdeas.json";
import { COLLECTION_OPPORTUNITIES_DESCRIPTION } from "../constants/deploymentCapabilities";
import { importLocalCollectionCsv, importLocalCollectionMarc } from "../lib/localCollection";
import {
  persistLocalCollectionRecommendationArtifact,
  publishSharedLocalCollectionRecommendationArtifact,
  readLocalCollectionAcceptedCountFromLocalStorage,
  LOCAL_COLLECTION_RECOMMENDATION_STORAGE_KEY,
  LOCAL_COLLECTION_SUMMARY_STORAGE_KEY,
} from "../lib/localCollection/storage";
import { saveSharedLibraryConfig } from "../lib/librarySharing/client";
import {
  ADMIN_CONFIG_CHANGED_EVENT,
  ADMIN_CONFIG_STORAGE_KEY,
  applyWebHighlightColor,
  autoChooseFontColor,
  highlightKeyToHex,
  hexToHighlightKey,
  hexToMainKey,
  isValidHex,
  mainKeyToHex,
  type HighlightKey,
  type ThemeKey,
  type TitleTextKey,
} from "../constants/brandTheme";
import { ColorPickerField } from "../components/admin/ColorPickerField";
import { ThemePreviewPanel } from "../components/admin/ThemePreviewPanel";
import { CollapsibleSection } from "../components/admin/CollapsibleSection";
import { activateAdminSession, setPendingAdminRoute } from "../lib/adminSession";
import { setRuntimeLibraryName } from "../constants/runtimeConfig";
import {
  isPreviewAcceptanceHarnessEnabled,
  PREVIEW_ACCEPTANCE_PIN,
  PREVIEW_ACCEPTANCE_QUERY_PARAM,
  readPreviewAcceptanceDashboardModeFromDocument,
  setPreviewAcceptanceHarnessEnabled,
  type PreviewAcceptanceDashboardMode,
  writePreviewAcceptanceDashboardModeCookie,
} from "../lib/previewAcceptanceHarness";

// ---------------------------------------------------------------------------
// Constants & flags
// ---------------------------------------------------------------------------

const SHOW_ADULT_KITSU_DEBUG_CONTROLS =
  String(
    (globalThis as any)?.__NOVEL_IDEAS_SHOW_ADULT_KITSU_DEBUG_CONTROLS__ ||
      (typeof process !== "undefined" ? (process as any)?.env?.EXPO_PUBLIC_SHOW_ADULT_KITSU_DEBUG_CONTROLS : "") ||
      ""
  ).toLowerCase() === "true";

const DEFAULT_MAIN_COLOR = "#0b1e33";
const DEFAULT_HIGHLIGHT_COLOR = "#fbbf24";
const DEFAULT_FONT_COLOR = "#ffffff";
const LOCAL_COLLECTION_DB_NAME = "novelideas_local_collection";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type DeckKey = "k2" | "36" | "ms_hs" | "adult";
type RecommendationSourceToggleKey = "googleBooks" | "openLibrary" | "localLibrary" | "kitsu" | "gcd" | "nyt";
type RecommendationSourceEnabled = Record<RecommendationSourceToggleKey, boolean>;
type SwipeCategoryKey = "books" | "movies" | "tv" | "games" | "youtube" | "anime" | "podcasts";

const DEFAULT_SWIPE_CATEGORIES: Record<SwipeCategoryKey, boolean> = {
  books: true, movies: true, tv: true, games: true, youtube: true, anime: true, podcasts: true,
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function deepClone<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj));
}

async function makeTinyLogoDataUrl(dataUrl: string, size = 32): Promise<string> {
  return await new Promise((resolve) => {
    try {
      if (typeof document === "undefined") return resolve(dataUrl);
      const img = new Image();
      img.onload = () => {
        try {
          const canvas = document.createElement("canvas");
          canvas.width = size; canvas.height = size;
          const ctx = canvas.getContext("2d", { willReadFrequently: true } as any);
          if (!ctx) return resolve(dataUrl);
          ctx.clearRect(0, 0, size, size);
          const sw = img.width, sh = img.height;
          const s = Math.min(sw, sh);
          const sx = Math.floor((sw - s) / 2), sy = Math.floor((sh - s) / 2);
          ctx.drawImage(img, sx, sy, s, s, 0, 0, size, size);
          let hasAlpha = false;
          try {
            const imgData = ctx.getImageData(0, 0, size, size).data;
            for (let i = 3; i < imgData.length; i += 4) {
              if (imgData[i] < 250) { hasAlpha = true; break; }
            }
          } catch { hasAlpha = true; }
          resolve(hasAlpha ? canvas.toDataURL("image/png") : canvas.toDataURL("image/jpeg", 0.55));
        } catch { resolve(dataUrl); }
      };
      img.onerror = () => resolve(dataUrl);
      img.src = dataUrl;
    } catch { resolve(dataUrl); }
  });
}

function slugifyLibraryId(name: string) {
  const raw = String(name || "").trim().toLowerCase();
  const slug = raw.replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);
  return slug || "default-library";
}

function normalizeLibraryId(raw: string) {
  return String(raw || "")
    .trim()
    .replace(/[^a-zA-Z0-9_-]/g, "")
    .slice(0, 40);
}

function resolveLibraryId(cfg: any) {
  const explicitId = normalizeLibraryId(cfg?.library?.id || cfg?.branding?.libraryId || "");
  if (explicitId && explicitId !== "demo") return explicitId;

  const libraryName = String(cfg?.branding?.libraryName || cfg?.library?.name || "").trim();
  if (libraryName) return slugifyLibraryId(libraryName);

  return explicitId || "demo";
}

function applyLocalCollectionOnlySourceRouting(sourceEnabled: RecommendationSourceEnabled): RecommendationSourceEnabled {
  if (!sourceEnabled.localLibrary) return sourceEnabled;
  return {
    ...sourceEnabled,
    googleBooks: false,
    openLibrary: false,
    kitsu: false,
    gcd: false,
    nyt: false,
    localLibrary: true,
  };
}

function localCollectionImportErrorMessage(error: unknown): string {
  const message = String((error as { message?: unknown } | null)?.message || "").toLowerCase();
  if (message.includes("collection_storage_quota_exceeded")) {
    return "Import succeeded, but browser storage is full. Clear site storage and import again.";
  }
  return "Import failed. Check the file and try again.";
}

function clearLocalCollectionStorageArtifacts(): void {
  try {
    if (typeof localStorage !== "undefined") {
      localStorage.removeItem("novelideas_local_collection");
      localStorage.removeItem("novelideas_local_collection_csv");
      localStorage.removeItem("novelideas_local_collection_import_report_v1");
      localStorage.removeItem(LOCAL_COLLECTION_RECOMMENDATION_STORAGE_KEY);
      localStorage.removeItem(LOCAL_COLLECTION_SUMMARY_STORAGE_KEY);
    }
  } catch {
    // Ignore storage cleanup failures and continue resetting the rest.
  }

  try {
    const indexedDb = (globalThis as any)?.indexedDB;
    if (indexedDb?.deleteDatabase) indexedDb.deleteDatabase(LOCAL_COLLECTION_DB_NAME);
  } catch {
    // Ignore IndexedDB cleanup failures and continue resetting the rest.
  }
}

function deckLabel(k: DeckKey) {
  if (k === "k2") return "Kids (K\u20132)";
  if (k === "36") return "Pre-Teens (3\u20136)";
  if (k === "ms_hs") return "Teens (Middle & High School)";
  if (k === "adult") return "Adults";
  return k;
}

function sourceLabel(s: RecommendationSourceToggleKey) {
  if (s === "googleBooks") return "Google Books";
  if (s === "openLibrary") return "Open Library";
  if (s === "localLibrary") return "This library's collection";
  if (s === "kitsu") return "Kitsu (Manga)";
  if (s === "gcd") return "ComicVine (Comics)";
  if (s === "nyt") return "New York Times (limited)";
  return s;
}

function swipeCategoryLabel(k: SwipeCategoryKey) {
  const map: Record<SwipeCategoryKey, string> = {
    books: "Books", movies: "Movies", tv: "TV Shows", games: "Games",
    youtube: "YouTube", anime: "Anime / Manga", podcasts: "Podcasts",
  };
  return map[k] ?? k;
}

// ---------------------------------------------------------------------------
// Config schema sync (structural initialization only — no logic changes)
// ---------------------------------------------------------------------------

function syncSchema(cfg: any) {
  if (!cfg || typeof cfg !== "object") return;

  cfg.branding = (cfg.branding && typeof cfg.branding === "object") ? cfg.branding : {};
  cfg.library = (cfg.library && typeof cfg.library === "object") ? cfg.library : {};

  const hasCanonName = typeof cfg.branding?.libraryName === "string";
  const hasLegacyName = typeof cfg.library?.name === "string";
  const chosenName = (hasCanonName ? cfg.branding.libraryName : (hasLegacyName ? cfg.library.name : "")).toString();
  cfg.branding.libraryName = chosenName;
  cfg.library.name = chosenName;
  const chosenId = resolveLibraryId(cfg);
  cfg.library.id = chosenId;
  cfg.branding.libraryId = chosenId;

  cfg.enabledDecks = (cfg.enabledDecks && typeof cfg.enabledDecks === "object") ? cfg.enabledDecks : {};
  cfg.decks = (cfg.decks && typeof cfg.decks === "object") ? cfg.decks : {};
  cfg.decks.enabled = (cfg.decks.enabled && typeof cfg.decks.enabled === "object") ? cfg.decks.enabled : {};

  const deckKeys: DeckKey[] = ["k2", "36", "ms_hs", "adult"];
  for (const k of deckKeys) {
    const canonVal = cfg.enabledDecks?.[k];
    const legacyVal = cfg.decks?.enabled?.[k];
    const v: boolean = typeof canonVal === "boolean" ? canonVal : (typeof legacyVal === "boolean" ? legacyVal : true);
    cfg.enabledDecks[k] = v;
    cfg.decks.enabled[k] = v;
  }

  cfg.swipe = (cfg.swipe && typeof cfg.swipe === "object") ? cfg.swipe : {};
  cfg.swipe.categories = (cfg.swipe.categories && typeof cfg.swipe.categories === "object") ? cfg.swipe.categories : {};
  for (const k of Object.keys(DEFAULT_SWIPE_CATEGORIES) as SwipeCategoryKey[]) {
    if (typeof cfg.swipe.categories[k] !== "boolean") cfg.swipe.categories[k] = DEFAULT_SWIPE_CATEGORIES[k];
  }

  cfg.theme = (cfg.theme && typeof cfg.theme === "object") ? cfg.theme : {};
  cfg.recommendations = (cfg.recommendations && typeof cfg.recommendations === "object") ? cfg.recommendations : {};
  const localLibrarySupported = Boolean(cfg?.recommendations?.localLibrarySupported);
  const configured = cfg?.recommendations?.sourceEnabled || {};
  const legacySource = cfg?.recommendations?.source ?? cfg?.recommendation?.source;

  const sourceEnabled: RecommendationSourceEnabled = {
    googleBooks: configured?.googleBooks !== false,
    openLibrary: configured?.openLibrary !== false,
    localLibrary: localLibrarySupported ? configured?.localLibrary !== false : false,
    kitsu: configured?.kitsu !== false,
    gcd: configured?.gcd !== false,
    nyt: configured?.nyt === true,
  };

  if (!cfg?.recommendations?.sourceEnabled && typeof legacySource === "string") {
    if (legacySource === "local_collection") {
      sourceEnabled.googleBooks = false;
      sourceEnabled.openLibrary = false;
      sourceEnabled.localLibrary = localLibrarySupported;
    } else if (legacySource === "open_library") {
      sourceEnabled.googleBooks = true;
      sourceEnabled.openLibrary = true;
      sourceEnabled.localLibrary = false;
    }
  }

  cfg.recommendations.sourceEnabled = applyLocalCollectionOnlySourceRouting(sourceEnabled);

  const adultKitsuForceQuery = String(cfg.recommendations.adultKitsuOnlyForceQueryForValidation || "").trim().toLowerCase();
  if (SHOW_ADULT_KITSU_DEBUG_CONTROLS && adultKitsuForceQuery === "dystopian")
    cfg.recommendations.adultKitsuOnlyForceQueryForValidation = "dystopian";
  else delete cfg.recommendations.adultKitsuOnlyForceQueryForValidation;

  if (typeof cfg.recommendations.localLibrarySupported !== "boolean") {
    cfg.recommendations.localLibrarySupported = false;
  }
}

/** Read existing config (named keys or hex) and produce hex strings for color pickers. */
function loadColorHex(cfg: any): {
  mainColorHex: string;
  highlightColorHex: string;
  fontColorHex: string;
  autoFontColorEnabled: boolean;
} {
  // Prefer already-saved hex; fall back to named key -> hex conversion.
  let mainColorHex = cfg?.branding?.mainColorHex;
  if (!isValidHex(mainColorHex)) {
    const namedMain = cfg?.branding?.mainTheme ?? cfg?.branding?.theme ?? cfg?.theme?.mainThemeKey ?? "dark_blue";
    mainColorHex = mainKeyToHex(namedMain as ThemeKey);
  }

  let highlightColorHex = cfg?.branding?.highlightColorHex;
  if (!isValidHex(highlightColorHex)) {
    const namedHighlight = cfg?.branding?.highlight ?? cfg?.theme?.highlightKey ?? "gold_accent";
    highlightColorHex = highlightKeyToHex(namedHighlight as HighlightKey);
  }

  const autoFontColorEnabled =
    typeof cfg?.branding?.autoFontColor === "boolean" ? cfg.branding.autoFontColor : true;

  let fontColorHex = cfg?.branding?.fontColorHex;
  if (!isValidHex(fontColorHex)) {
    const namedFont = cfg?.branding?.titleTextColor ?? cfg?.theme?.titleTextColor;
    if (namedFont === "black") fontColorHex = "#000000";
    else fontColorHex = autoFontColorEnabled ? autoChooseFontColor(mainColorHex) : DEFAULT_FONT_COLOR;
  }

  return {
    mainColorHex: isValidHex(mainColorHex) ? mainColorHex : DEFAULT_MAIN_COLOR,
    highlightColorHex: isValidHex(highlightColorHex) ? highlightColorHex : DEFAULT_HIGHLIGHT_COLOR,
    fontColorHex: isValidHex(fontColorHex) ? fontColorHex : DEFAULT_FONT_COLOR,
    autoFontColorEnabled,
  };
}

function dispatchAdminConfigSavedWebEvent(serializedConfig: string) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent(ADMIN_CONFIG_CHANGED_EVENT, {
      detail: {
        key: ADMIN_CONFIG_STORAGE_KEY,
        value: serializedConfig,
      },
    })
  );
}

/** Write hex color values back to config, maintaining back-compat named keys where possible. */
function applyColorHex(
  cfg: any,
  mainColorHex: string,
  highlightColorHex: string,
  fontColorHex: string,
  autoFontColorEnabled: boolean
) {
  if (!cfg.branding) cfg.branding = {};
  if (!cfg.theme) cfg.theme = {};

  cfg.branding.mainColorHex = mainColorHex;
  cfg.branding.highlightColorHex = highlightColorHex;
  cfg.branding.fontColorHex = autoFontColorEnabled ? autoChooseFontColor(mainColorHex) : fontColorHex;
  cfg.branding.autoFontColor = autoFontColorEnabled;

  // Back-compat named keys (best-effort)
  const mainKey = hexToMainKey(mainColorHex);
  if (mainKey && mainKey !== "dark_blue") {
    cfg.branding.mainTheme = mainKey;
    cfg.branding.theme = mainKey;
    cfg.theme.mainThemeKey = mainKey;
  } else {
    delete cfg.branding.mainTheme;
    delete cfg.branding.theme;
    delete cfg.theme.mainThemeKey;
  }

  const highlightKey = hexToHighlightKey(highlightColorHex);
  if (highlightKey) {
    cfg.branding.highlight = highlightKey;
    cfg.theme.highlightKey = highlightKey;
  } else {
    delete cfg.branding.highlight;
    delete cfg.theme.highlightKey;
  }

  const titleTextKey: TitleTextKey = (fontColorHex.toLowerCase() === "#000000") ? "black" : "white";
  if (titleTextKey === "white") {
    delete cfg.branding.titleTextColor;
    delete cfg.theme.titleTextColor;
  } else {
    cfg.branding.titleTextColor = titleTextKey;
    cfg.theme.titleTextColor = titleTextKey;
  }
}

// ---------------------------------------------------------------------------
// Fixed admin UI theme (dark, independent of configured app colors)
// ---------------------------------------------------------------------------

const ADMIN_THEME = {
  appBg: "#0b1e33",
  cardBg: "#10243f",
  cardBorder: "#223b6b",
  text: "#e5efff",
  subtext: "#cbd5f5",
  muted: "#93c5fd",
  inputBg: "#0b1e33",
  inputBorder: "#223b6b",
  danger: "#fecaca",
  success: "#86efac",
  accent: "#fbbf24",
  accentTextOn: "#1f2933",
  accentBorder: "#f59e0b",
};

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function AdminWebScreen() {
  const isWeb = Platform.OS === "web";
  const params = useLocalSearchParams();
  const previewAcceptanceFlag = Array.isArray(params[PREVIEW_ACCEPTANCE_QUERY_PARAM])
    ? params[PREVIEW_ACCEPTANCE_QUERY_PARAM][0]
    : params[PREVIEW_ACCEPTANCE_QUERY_PARAM];
  const previewAcceptanceHarnessVisible = useMemo(
    () => isPreviewAcceptanceHarnessEnabled(previewAcceptanceFlag),
    [previewAcceptanceFlag]
  );
  const dashboardRoute = previewAcceptanceHarnessVisible
    ? "/admin/human-review?acceptanceHarness=1"
    : "/admin/human-review";

  const [config, setConfig] = useState<any>(() => {
    const base = deepClone(configFile);
    try {
      if (isWeb && typeof localStorage !== "undefined") {
        const saved = localStorage.getItem(ADMIN_CONFIG_STORAGE_KEY);
        if (saved) {
          const parsed = JSON.parse(saved);
          syncSchema(parsed);
          return parsed;
        }
      }
    } catch {}
    syncSchema(base);
    return base;
  });

  // Derive initial hex colors from config once
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const initialColors = useMemo(() => loadColorHex(config), []);

  const [mainColorHex, setMainColorHex] = useState(initialColors.mainColorHex);
  const [highlightColorHex, setHighlightColorHex] = useState(initialColors.highlightColorHex);
  const [fontColorHex, setFontColorHex] = useState(initialColors.fontColorHex);
  const [autoFontColor, setAutoFontColor] = useState(initialColors.autoFontColorEnabled);

  // Update font color live when Auto is on and main color changes
  useEffect(() => {
    if (autoFontColor) setFontColorHex(autoChooseFontColor(mainColorHex));
  }, [autoFontColor, mainColorHex]);

  // Dirty tracking
  const savedConfigRef = useRef(JSON.stringify(config));
  const savedColorsRef = useRef({ mainColorHex, highlightColorHex, fontColorHex, autoFontColor });
  const [isDirty, setIsDirty] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saved" | "error">("idle");
  const [previewAcceptanceMode, setPreviewAcceptanceMode] = useState<PreviewAcceptanceDashboardMode>(() =>
    readPreviewAcceptanceDashboardModeFromDocument()
  );

  useEffect(() => {
    const configChanged = JSON.stringify(config) !== savedConfigRef.current;
    const colorsChanged =
      mainColorHex !== savedColorsRef.current.mainColorHex ||
      highlightColorHex !== savedColorsRef.current.highlightColorHex ||
      fontColorHex !== savedColorsRef.current.fontColorHex ||
      autoFontColor !== savedColorsRef.current.autoFontColor;
    setIsDirty(configChanged || colorsChanged);
    if (configChanged || colorsChanged) setSaveStatus("idle");
  }, [config, mainColorHex, highlightColorHex, fontColorHex, autoFontColor]);

  type ImportPhase = 'idle' | 'reading' | 'parsing' | 'saving' | 'done' | 'error';
  const [importStatus, setImportStatus] = useState<{ phase: ImportPhase; pct: number; label: string }>(
    { phase: 'idle', pct: 0, label: '' }
  );

  const [uploadedCollectionCount, setUploadedCollectionCount] = useState<number>(() => {
    try {
      if (!isWeb || typeof localStorage === "undefined") return 0;
      const persistedCount = readLocalCollectionAcceptedCountFromLocalStorage();
      if (persistedCount > 0) return persistedCount;
      const saved = localStorage.getItem("novelideas_local_collection");
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) return parsed.length;
      }
      const csv = localStorage.getItem("novelideas_local_collection_csv");
      if (csv) return Math.max(0, csv.split(/\r?\n/).filter((r) => r.trim().length > 0).length - 1);
      return 0;
    } catch { return 0; }
  });

  // Derived
  const libraryName = String(config?.branding?.libraryName || config?.library?.name || "").trim();
  const libraryId = useMemo(() => resolveLibraryId(config), [config]);
  const hostedConfigUrl = useMemo(() => `https://novelideas.app/${libraryId}`, [libraryId]);
  const configText = useMemo(() => JSON.stringify(config, null, 2), [config]);
  const adultKitsuOnlyForceQueryForValidation =
    config?.recommendations?.adultKitsuOnlyForceQueryForValidation === "dystopian" ? "dystopian" : "";
  const qrPayload = hostedConfigUrl;
  const qrTooBig = qrPayload.length > 2200;

  const t = ADMIN_THEME;

  // ---------------------------------------------------------------------------
  // State setters
  // ---------------------------------------------------------------------------

  const setPath = useCallback((path: string[], value: any) => {
    setConfig((prev: any) => {
      const next = deepClone(prev);
      let cur = next;
      for (let i = 0; i < path.length - 1; i++) {
        const k = path[i];
        if (typeof cur[k] !== "object" || cur[k] === null) cur[k] = {};
        cur = cur[k];
      }
      cur[path[path.length - 1]] = value;
      syncSchema(next);
      return next;
    });
  }, []);

  const togglePathBool = useCallback((path: string[]) => {
    setConfig((prev: any) => {
      const next = deepClone(prev);
      let cur = next;
      for (let i = 0; i < path.length - 1; i++) {
        const k = path[i];
        if (typeof cur[k] !== "object" || cur[k] === null) cur[k] = {};
        cur = cur[k];
      }
      const last = path[path.length - 1];
      cur[last] = !cur[last];
      syncSchema(next);
      return next;
    });
  }, []);

  const toggleSwipeCategory = useCallback((k: SwipeCategoryKey) => {
    setConfig((prev: any) => {
      const next = deepClone(prev);
      syncSchema(next);
      const current = { ...DEFAULT_SWIPE_CATEGORIES, ...(next?.swipe?.categories || {}) };
      current[k] = !current[k];
      if (!Object.values(current).some(Boolean)) current.books = true;
      next.swipe.categories = current;
      syncSchema(next);
      return next;
    });
  }, []);

  // ---------------------------------------------------------------------------
  // Theme utility actions (draft-only, do not save until Save is pressed)
  // ---------------------------------------------------------------------------

  const resetThemeToDefault = useCallback(() => {
    setMainColorHex(DEFAULT_MAIN_COLOR);
    setHighlightColorHex(DEFAULT_HIGHLIGHT_COLOR);
    setAutoFontColor(true);
    setFontColorHex(autoChooseFontColor(DEFAULT_MAIN_COLOR));
  }, []);

  const resetAllToDefaults = useCallback(() => {
    const base = deepClone(configFile);
    syncSchema(base);
    const colors = loadColorHex(base);
    const serialized = JSON.stringify(base);
    const resetLibraryId = resolveLibraryId(base);

    if (isWeb && typeof localStorage !== "undefined") {
      clearLocalCollectionStorageArtifacts();
      localStorage.setItem(ADMIN_CONFIG_STORAGE_KEY, serialized);
      applyWebHighlightColor(colors.highlightColorHex);
      dispatchAdminConfigSavedWebEvent(serialized);
    }
    void saveSharedLibraryConfig(resetLibraryId, base as Record<string, unknown>);

    setConfig(base);
    setMainColorHex(colors.mainColorHex);
    setHighlightColorHex(colors.highlightColorHex);
    setFontColorHex(colors.fontColorHex);
    setAutoFontColor(colors.autoFontColorEnabled);
    setUploadedCollectionCount(0);
    setImportStatus({ phase: "idle", pct: 0, label: "" });
    setSaveStatus("saved");
    savedConfigRef.current = serialized;
    savedColorsRef.current = {
      mainColorHex: colors.mainColorHex,
      highlightColorHex: colors.highlightColorHex,
      fontColorHex: colors.fontColorHex,
      autoFontColor: colors.autoFontColorEnabled,
    };
    setIsDirty(false);
    setRuntimeLibraryName("");
    setTimeout(() => setSaveStatus((s) => (s === "saved" ? "idle" : s)), 3000);
  }, [isWeb]);

  const copyMainToHighlight = useCallback(() => setHighlightColorHex(mainColorHex), [mainColorHex]);
  const copyHighlightToMain = useCallback(() => {
    setMainColorHex(highlightColorHex);
    if (autoFontColor) setFontColorHex(autoChooseFontColor(highlightColorHex));
  }, [highlightColorHex, autoFontColor]);

  // ---------------------------------------------------------------------------
  // Logo
  // ---------------------------------------------------------------------------

  const onUploadLogoWeb = async () => {
    try {
      const input = document.createElement("input");
      input.type = "file";
      input.accept = "image/*";
      input.onchange = () => {
        const file = input.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = async () => {
          const dataUrl = String(reader.result || "");
          setPath(["branding", "logoDataUrl"], dataUrl);
          const tiny = await makeTinyLogoDataUrl(dataUrl, 32);
          setPath(["branding", "logoTinyDataUrl"], tiny);
        };
        reader.readAsDataURL(file);
      };
      input.click();
    } catch {
      Alert.alert("Upload logo", "File upload is only available on web.");
    }
  };

  const onRemoveLogo = () => {
    setPath(["branding", "logoDataUrl"], null);
    setPath(["branding", "logoTinyDataUrl"], null);
  };

  // ---------------------------------------------------------------------------
  // Local Collection upload
  // ---------------------------------------------------------------------------

  const onUploadCollectionWeb = () => {
    if (!isWeb || typeof document === "undefined" || typeof localStorage === "undefined") {
      Alert.alert("Upload unavailable", "Collection upload is available on desktop web.");
      return;
    }
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".csv,text/csv,.txt,.mrc,.marc,.001,application/octet-stream";
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) return;
      const sourceFilename = file.name || "collection.csv";
      const isMarcUpload = /\.(mrc|marc|001)$/i.test(sourceFilename);
      setImportStatus({ phase: 'reading', pct: 5, label: 'Reading file…' });
      const reader = new FileReader();
      reader.onprogress = (e) => {
        if (e.lengthComputable) {
          // File-read phase = 0-40% of total
          const readPct = Math.max(5, Math.round((e.loaded / e.total) * 40));
          setImportStatus({ phase: 'reading', pct: readPct, label: 'Reading file…' });
        }
      };
      reader.onload = () => {
        // Flush the reading→parsing UI update before the synchronous parse blocks the thread
        setImportStatus({ phase: 'parsing', pct: 45, label: 'Parsing records…' });
        setTimeout(async () => {
          try {
            const collectionName = String(config?.branding?.libraryName || "").trim() || undefined;
            let artifact;
            if (isMarcUpload) {
              artifact = importLocalCollectionMarc({
                marcBinary: new Uint8Array(reader.result as ArrayBuffer),
                sourceFilename,
                collectionName,
                libraryId: "local-library",
              });
              localStorage.removeItem("novelideas_local_collection_csv");
            } else {
              artifact = importLocalCollectionCsv({
                csvText: String(reader.result || ""),
                sourceFilename,
                collectionName,
                libraryId: "local-library",
              });
              localStorage.setItem("novelideas_local_collection_csv", String(reader.result || ""));
            }
            setImportStatus({ phase: 'saving', pct: 92, label: 'Saving…' });
            await persistLocalCollectionRecommendationArtifact(artifact);
            const sharedLibraryId = resolveLibraryId(config);
            if (sharedLibraryId) {
              await publishSharedLocalCollectionRecommendationArtifact(sharedLibraryId, artifact);
            }
            localStorage.setItem("novelideas_local_collection_import_report_v1", JSON.stringify(artifact.summary));
            setUploadedCollectionCount(artifact.summary.acceptedTitles);
            // Mark collection as available (supported) but do NOT auto-enable the source toggle.
            setPath(["recommendations", "localLibrarySupported"], true);
            const accepted = artifact.summary.acceptedTitles;
            const warnings = artifact.summary.warnings;
            setImportStatus({
              phase: 'done',
              pct: 100,
              label: `${accepted.toLocaleString()} titles imported${
                warnings > 0 ? ` (${warnings} warning${warnings === 1 ? '' : 's'})` : ''
              }`,
            });
            setTimeout(() => setImportStatus({ phase: 'idle', pct: 0, label: '' }), 5000);
          } catch (error) {
            setImportStatus({ phase: 'error', pct: 0, label: localCollectionImportErrorMessage(error) });
            setTimeout(() => setImportStatus({ phase: 'idle', pct: 0, label: '' }), 6000);
          }
        }, 0);
      };
      reader.onerror = () => {
        setImportStatus({ phase: 'error', pct: 0, label: 'Could not read file.' });
        setTimeout(() => setImportStatus({ phase: 'idle', pct: 0, label: '' }), 6000);
      };
      if (isMarcUpload) {
        reader.readAsArrayBuffer(file);
      } else {
        reader.readAsText(file);
      }
    };
    input.click();
  };

  // ---------------------------------------------------------------------------
  // Save / Discard
  // ---------------------------------------------------------------------------

  const persistDraftConfig = useCallback(async () => {
    try {
      const next = deepClone(config);
      const effectiveFontColor = autoFontColor ? autoChooseFontColor(mainColorHex) : fontColorHex;
      applyColorHex(next, mainColorHex, highlightColorHex, effectiveFontColor, autoFontColor);
      syncSchema(next);
      const serializedNext = JSON.stringify(next);
      const nextLibraryId = resolveLibraryId(next);

      if (isWeb && typeof localStorage !== "undefined") {
        localStorage.setItem(ADMIN_CONFIG_STORAGE_KEY, serializedNext);
        applyWebHighlightColor(next?.branding?.highlightColorHex || highlightColorHex);
        dispatchAdminConfigSavedWebEvent(serializedNext);
      }
      if (nextLibraryId) {
        await saveSharedLibraryConfig(nextLibraryId, next as Record<string, unknown>);
      }

      setConfig(next);
      // Sync fontColorHex state with the effective value that was saved so dirty
      // tracking doesn't re-trigger immediately after save when autoFontColor is on.
      setFontColorHex(effectiveFontColor);
      savedConfigRef.current = serializedNext;
      savedColorsRef.current = { mainColorHex, highlightColorHex, fontColorHex: effectiveFontColor, autoFontColor };
      setIsDirty(false);
      setSaveStatus("saved");
      // Only clear "saved" status; don't overwrite an "error" that arrives from a concurrent call.
      setTimeout(() => setSaveStatus((s) => (s === "saved" ? "idle" : s)), 3000);
      return true;
    } catch {
      setSaveStatus("error");
      return false;
    }
  }, [config, autoFontColor, mainColorHex, highlightColorHex, fontColorHex, isWeb, libraryId]);

  const onSave = useCallback(() => {
    void persistDraftConfig();
  }, [persistDraftConfig]);

  const onSaveAndReturn = useCallback(() => {
    void (async () => {
      if (!(await persistDraftConfig())) return;
      router.replace("/");
    })();
  }, [persistDraftConfig]);

  const preparePreviewAcceptancePin = useCallback(() => {
    setPreviewAcceptanceHarnessEnabled(true);
    setConfig((prev: any) => {
      const next = deepClone(prev);
      next.admin = typeof next.admin === "object" && next.admin ? next.admin : {};
      next.admin.pinEnabled = true;
      next.admin.pin = PREVIEW_ACCEPTANCE_PIN;
      syncSchema(next);
      return next;
    });
  }, []);

  const applyPreviewAcceptanceMode = useCallback((mode: PreviewAcceptanceDashboardMode) => {
    setPreviewAcceptanceHarnessEnabled(true);
    writePreviewAcceptanceDashboardModeCookie(mode);
    setPreviewAcceptanceMode(mode);
  }, []);

  const onDiscard = useCallback(() => {
    try {
      if (isWeb && typeof localStorage !== "undefined") {
        const saved = localStorage.getItem(ADMIN_CONFIG_STORAGE_KEY);
        if (saved) {
          const parsed = JSON.parse(saved);
          syncSchema(parsed);
          const colors = loadColorHex(parsed);
          setMainColorHex(colors.mainColorHex);
          setHighlightColorHex(colors.highlightColorHex);
          setFontColorHex(colors.fontColorHex);
          setAutoFontColor(colors.autoFontColorEnabled);
          setConfig(parsed);
          savedConfigRef.current = JSON.stringify(parsed);
          savedColorsRef.current = {
            mainColorHex: colors.mainColorHex,
            highlightColorHex: colors.highlightColorHex,
            fontColorHex: colors.fontColorHex,
            autoFontColor: colors.autoFontColorEnabled,
          };
          setIsDirty(false);
          setSaveStatus("idle");
          return;
        }
      }
    } catch {}
    const base = deepClone(configFile);
    syncSchema(base);
    const colors = loadColorHex(base);
    setMainColorHex(colors.mainColorHex);
    setHighlightColorHex(colors.highlightColorHex);
    setFontColorHex(colors.fontColorHex);
    setAutoFontColor(colors.autoFontColorEnabled);
    setConfig(base);
    savedConfigRef.current = JSON.stringify(base);
    savedColorsRef.current = {
      mainColorHex: colors.mainColorHex,
      highlightColorHex: colors.highlightColorHex,
      fontColorHex: colors.fontColorHex,
      autoFontColor: colors.autoFontColorEnabled,
    };
    setIsDirty(false);
    setSaveStatus("idle");
  }, [isWeb]);

  // ---------------------------------------------------------------------------
  // Non-web fallback
  // ---------------------------------------------------------------------------

  if (!isWeb) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
        <Text style={{ color: "#e5efff" }}>Library Settings (desktop web only)</Text>
      </View>
    );
  }

  // ---------------------------------------------------------------------------
  // Derived state for recommendation sources
  // ---------------------------------------------------------------------------

  const localLibrarySupported = Boolean(config?.recommendations?.localLibrarySupported);
  const localLibraryEnabled =
    localLibrarySupported && Boolean(config?.recommendations?.sourceEnabled?.localLibrary);
  const noSourceEnabled =
    !config?.recommendations?.sourceEnabled?.googleBooks &&
    !config?.recommendations?.sourceEnabled?.openLibrary &&
    !localLibraryEnabled &&
    !config?.recommendations?.sourceEnabled?.kitsu &&
    !config?.recommendations?.sourceEnabled?.gcd &&
    !config?.recommendations?.sourceEnabled?.nyt;

  const adminPinEnabled = !!config?.admin?.pinEnabled;
  const adminPin = String(config?.admin?.pin || "");

  // ---------------------------------------------------------------------------
  // Render helpers
  // ---------------------------------------------------------------------------

  const Divider = () => <View style={[styles.divider, { backgroundColor: t.cardBorder }]} />;

  const SectionTitle = ({ children }: { children: string }) => (
    <Text style={[styles.sectionTitle, { color: t.text }]}>{children}</Text>
  );

  const Note = ({ children, color }: { children: React.ReactNode; color?: string }) => (
    <Text style={[styles.note, { color: color ?? t.subtext }]}>{children}</Text>
  );

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  const showStickyBar = isDirty || saveStatus !== "idle";

  return (
    <View style={{ flex: 1, backgroundColor: t.appBg }}>
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 20 }}>
      <View style={[styles.wrap, { borderColor: t.cardBorder, backgroundColor: t.cardBg }]}>

        {/* Page header */}
        <View style={styles.pageHeader}>
          <View>
            <Text style={[styles.h1, { color: t.text }]}>Library Settings</Text>
            <Text style={[styles.sub, { color: t.subtext }]}>
              Configure your library's branding, content, and appearance.
            </Text>
          </View>
          <View style={styles.pageHeaderActions}>
            <TouchableOpacity
              style={[styles.btn, styles.headerActionButton, { borderColor: t.cardBorder, backgroundColor: t.inputBg }]}
              onPress={() => {
                activateAdminSession("admin_web");
                setPendingAdminRoute("/admin/human-review");
                router.push(dashboardRoute as any);
              }}
              accessibilityRole="button"
              accessibilityLabel="Open Human Review Dashboard"
            >
              <Text style={[styles.btnText, { color: t.text }]}>Human Review Dashboard</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.btn, styles.headerActionButton, { borderColor: t.cardBorder, backgroundColor: t.inputBg }]}
              onPress={() => {
                Alert.alert(
                  "Reset all settings?",
                  "This will restore the default library, theme, and recommendation settings, and clear imported collection data on this device.",
                  [
                    { text: "Cancel", style: "cancel" },
                    { text: "Reset", style: "destructive", onPress: resetAllToDefaults },
                  ]
                );
              }}
              accessibilityRole="button"
              accessibilityLabel="Reset all settings to defaults"
            >
              <Text style={[styles.btnText, { color: t.text }]}>Reset to Defaults</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.btnPrimary, styles.headerActionButton, { borderColor: t.accentBorder, backgroundColor: t.accent }]}
              onPress={onSaveAndReturn}
              accessibilityRole="button"
              accessibilityLabel="Save and return to home"
              testID="save-return-button"
            >
              <Text style={[styles.btnText, { color: t.accentTextOn }]}>Save & Return</Text>
            </TouchableOpacity>
            {isDirty ? (
              <View style={[styles.badge, { borderColor: t.accent }]}>
                <Text style={{ color: t.accent, fontSize: 11, fontWeight: "900" }}>Unsaved changes</Text>
              </View>
            ) : saveStatus === "saved" ? (
              <View style={[styles.badge, { borderColor: t.success }]}>
                <Text style={{ color: t.success, fontSize: 11, fontWeight: "900" }}>{"Saved \u2713"}</Text>
              </View>
            ) : saveStatus === "error" ? (
              <View style={[styles.badge, { borderColor: t.danger }]}>
                <Text style={{ color: t.danger, fontSize: 11, fontWeight: "900" }}>Save failed</Text>
              </View>
            ) : null}
          </View>
        </View>

        <Divider />

        {previewAcceptanceHarnessVisible ? (
          <>
            <SectionTitle>Preview Acceptance Harness</SectionTitle>
            <Note>
              Preview-only setup for manual acceptance on Vercel preview URLs. This never changes
              production defaults.
            </Note>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 12 }}>
              <TouchableOpacity
                style={[styles.btnPrimary, { borderColor: t.accentBorder, backgroundColor: t.accent }]}
                onPress={preparePreviewAcceptancePin}
              >
                <Text style={[styles.btnText, { color: t.accentTextOn }]}>
                  Prepare Admin PIN challenge ({PREVIEW_ACCEPTANCE_PIN})
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.btn, { borderColor: t.cardBorder, backgroundColor: t.inputBg }]}
                onPress={() => applyPreviewAcceptanceMode("fixtures")}
              >
                <Text style={[styles.btnText, { color: t.text }]}>Use dashboard fixtures</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.btn, { borderColor: t.cardBorder, backgroundColor: t.inputBg }]}
                onPress={() => applyPreviewAcceptanceMode("live")}
              >
                <Text style={[styles.btnText, { color: t.text }]}>Use live dashboard data</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.btn, { borderColor: t.cardBorder, backgroundColor: t.inputBg }]}
                onPress={() => applyPreviewAcceptanceMode("failure")}
              >
                <Text style={[styles.btnText, { color: t.text }]}>Force dashboard unavailable</Text>
              </TouchableOpacity>
            </View>
            <Text style={[styles.note, styles.previewAcceptanceNote, { color: t.success }]}>
              Current dashboard mode: {previewAcceptanceMode}. Use the normal Save controls after
              preparing the PIN challenge so the unlock flow is persisted in browser storage.
            </Text>
            <Divider />
          </>
        ) : null}

        {/* ── A. Library Identity ── */}
        <SectionTitle>A. Library Identity</SectionTitle>

        <Text style={[styles.label, { color: t.muted }]}>Library name</Text>
        <TextInput
          style={[styles.input, { backgroundColor: t.inputBg, borderColor: t.inputBorder, color: t.text }]}
          value={String(config?.branding?.libraryName || "")}
          onChangeText={(v) => setPath(["branding", "libraryName"], v)}
          placeholder="Your library's name"
          placeholderTextColor="#7a8aa0"
        />

        <Text style={[styles.label, { color: t.muted, marginTop: 14 }]}>Library ID</Text>
        <TextInput
          style={[styles.input, { backgroundColor: t.inputBg, borderColor: t.inputBorder, color: t.text }]}
          value={String(config?.library?.id || config?.branding?.libraryId || "")}
          onChangeText={(v) => {
            const nextId = normalizeLibraryId(v);
            setPath(["library", "id"], nextId);
            setPath(["branding", "libraryId"], nextId);
          }}
          placeholder="e.g. yvhs"
          placeholderTextColor="#7a8aa0"
          autoCapitalize="none"
          autoCorrect={false}
        />

        <Text style={[styles.label, { color: t.muted, marginTop: 14 }]}>Library logo</Text>
        <View style={styles.logoRow}>
          <View style={[styles.logoPreview, { borderColor: t.cardBorder, backgroundColor: t.inputBg }]}>
            {config?.branding?.logoDataUrl ? (
              <Image
                source={{ uri: config.branding.logoDataUrl }}
                style={{ width: "100%", height: "100%" }}
                resizeMode="contain"
              />
            ) : (
              <Text style={{ color: t.muted, fontWeight: "700" }}>No logo</Text>
            )}
          </View>
          <View style={{ flex: 1, gap: 10 }}>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
              <TouchableOpacity
                style={[styles.btn, { borderColor: t.accentBorder, backgroundColor: t.inputBg }]}
                onPress={onUploadLogoWeb}
              >
                <Text style={[styles.btnText, { color: t.text }]}>Upload logo</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.btn, { borderColor: t.cardBorder, backgroundColor: t.inputBg }]}
                onPress={onRemoveLogo}
              >
                <Text style={[styles.btnText, { color: t.text }]}>Remove logo</Text>
              </TouchableOpacity>
            </View>
            <Note>Accepted: PNG, JPG, SVG. Logo appears in the app header.</Note>
          </View>
        </View>

        <Divider />

        {/* ── B. Appearance ── */}
        <SectionTitle>B. Appearance</SectionTitle>
        <Note>Finish choosing the color, then select Save Changes or Save & Return.</Note>

        <ColorPickerField
          label="Main Color"
          value={mainColorHex}
          onChange={(hex) => {
            setMainColorHex(hex);
            if (autoFontColor) setFontColorHex(autoChooseFontColor(hex));
          }}
          theme={t}
          hint="Used for the app header and primary action areas."
          testID="color-picker-main"
        />

        <ColorPickerField
          label="Highlight Color"
          value={highlightColorHex}
          onChange={setHighlightColorHex}
          theme={t}
          hint="Used for borders, selected states, and accents."
          testID="color-picker-highlight"
        />

        <View style={[styles.rowBetween, { marginBottom: 8 }]}>
          <View style={{ flex: 1, paddingRight: 12 }}>
            <Text style={[styles.label, { color: t.muted }]}>Auto Font Color</Text>
            <Note>
              Automatically chooses black or white for text legibility on the header background.
              Governs the library name and banner text color.
            </Note>
          </View>
          <Switch
            value={autoFontColor}
            onValueChange={(v) => {
              setAutoFontColor(v);
              if (v) setFontColorHex(autoChooseFontColor(mainColorHex));
            }}
          />
        </View>

        {!autoFontColor ? (
          <ColorPickerField
            label="Font Color"
            value={fontColorHex}
            onChange={setFontColorHex}
            theme={t}
            hint="Header and banner text color. Only adjustable when Auto Font Color is off."
            testID="color-picker-font"
          />
        ) : null}

        {/* Theme utility buttons */}
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 4, marginBottom: 14 }}>
          <TouchableOpacity
            style={[styles.utilBtn, { borderColor: t.cardBorder }]}
            onPress={resetThemeToDefault}
          >
            <Text style={[styles.utilBtnText, { color: t.subtext }]}>Reset Theme to Default</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.utilBtn, { borderColor: t.cardBorder }]}
            onPress={copyMainToHighlight}
          >
            <Text style={[styles.utilBtnText, { color: t.subtext }]}>{"Copy Main \u2192 Highlight"}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.utilBtn, { borderColor: t.cardBorder }]}
            onPress={copyHighlightToMain}
          >
            <Text style={[styles.utilBtnText, { color: t.subtext }]}>{"Copy Highlight \u2192 Main"}</Text>
          </TouchableOpacity>
        </View>

        {/* Live preview */}
        <Text style={[styles.label, { color: t.muted, marginBottom: 6 }]}>Live Preview</Text>
        <Note>Updates immediately from your draft selections. Not saved until you click Save Changes.</Note>
        <View style={{ marginTop: 12, marginBottom: 4 }}>
          <ThemePreviewPanel
            mainColor={mainColorHex}
            highlightColor={highlightColorHex}
            fontColor={autoFontColor ? autoChooseFontColor(mainColorHex) : fontColorHex}
            libraryName={libraryName || "Your Library"}
          />
        </View>

        <Divider />

        {/* ── C. Reader Experience ── */}
        <SectionTitle>C. Reader Experience</SectionTitle>

        <Text style={[styles.label, { color: t.muted, marginBottom: 6 }]}>Age Groups</Text>
        <Note>Enable the reading levels available at your library.</Note>
        <View style={{ gap: 10, marginTop: 10 }}>
          {(["k2", "36", "ms_hs", "adult"] as DeckKey[]).map((dk) => {
            const enabled = !!(config?.enabledDecks?.[dk] ?? config?.decks?.enabled?.[dk]);
            return (
              <View key={dk} style={styles.rowBetween}>
                <Text style={{ color: t.text, fontWeight: "700" }}>{deckLabel(dk)}</Text>
                <Switch value={enabled} onValueChange={() => togglePathBool(["enabledDecks", dk])} />
              </View>
            );
          })}
        </View>

        <Text style={[styles.label, { color: t.muted, marginTop: 18, marginBottom: 6 }]}>Swipe Categories</Text>
        <Note>Control which types of media appear in patron preference swiping.</Note>
        <View style={{ gap: 10, marginTop: 10 }}>
          {(["books", "movies", "tv", "games", "youtube", "anime", "podcasts"] as SwipeCategoryKey[]).map((k) => {
            const enabled = !!(config?.swipe?.categories?.[k] ?? DEFAULT_SWIPE_CATEGORIES[k]);
            return (
              <View key={k} style={styles.rowBetween}>
                <Text style={{ color: t.text, fontWeight: "700" }}>{swipeCategoryLabel(k)}</Text>
                <Switch value={enabled} onValueChange={() => toggleSwipeCategory(k)} />
              </View>
            );
          })}
        </View>

        <Divider />

        {/* ── D. Recommendation Sources ── */}
        <SectionTitle>D. Recommendation Sources</SectionTitle>
        <Note>Enable one or more external sources for book and media recommendations.</Note>

        <View style={{ gap: 10, marginTop: 10 }}>
          {(["googleBooks", "openLibrary", "kitsu", "gcd", "nyt"] as RecommendationSourceToggleKey[]).map(
            (sourceKey) => {
              const enabled = Boolean(config?.recommendations?.sourceEnabled?.[sourceKey]);
              return (
                <View key={sourceKey} style={styles.rowBetween}>
                  <Text style={{ color: t.text, fontWeight: "700" }}>{sourceLabel(sourceKey)}</Text>
                  <Switch
                    value={enabled}
                    onValueChange={(next) => {
                      setConfig((prev: any) => {
                        const n = deepClone(prev);
                        syncSchema(n);
                        n.recommendations.sourceEnabled[sourceKey] = next;
                        if (next) n.recommendations.sourceEnabled.localLibrary = false;
                        return n;
                      });
                    }}
                  />
                </View>
              );
            }
          )}
        </View>

        {noSourceEnabled && !localLibraryEnabled ? (
          <Note color={t.danger}>
            All recommendation sources are off. Enable at least one source or activate Local Collection below.
          </Note>
        ) : null}

        {SHOW_ADULT_KITSU_DEBUG_CONTROLS ? (
          <View style={[styles.rowBetween, { marginTop: 14 }]}>
            <View style={{ flex: 1, paddingRight: 12 }}>
              <Text style={{ color: t.text, fontWeight: "700" }}>Force Adult Kitsu query: dystopian</Text>
              <Note>Debug validation only. Applies when Adult deck has Kitsu as sole source.</Note>
            </View>
            <Switch
              value={adultKitsuOnlyForceQueryForValidation === "dystopian"}
              onValueChange={(next) =>
                setPath(
                  ["recommendations", "adultKitsuOnlyForceQueryForValidation"],
                  next ? "dystopian" : ""
                )
              }
            />
          </View>
        ) : null}

        <Divider />

        {/* ── E. Local Collection ── */}
        <SectionTitle>E. Local Collection</SectionTitle>

        <View style={[styles.infoCard, { borderColor: t.cardBorder, backgroundColor: t.inputBg }]}>
          <Text style={{ color: t.text, fontWeight: "700", marginBottom: 4 }}>
            {uploadedCollectionCount > 0
              ? `${uploadedCollectionCount.toLocaleString()} titles imported`
              : "No collection imported"}
          </Text>
          <Note>
            Upload a CSV or MARC export of your library's holdings. Local Collection recommends only
            from this library's imported titles and cannot run alongside external sources.
          </Note>
        </View>

        <View style={{ marginTop: 12, flexDirection: "row", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <TouchableOpacity
            style={[
              styles.btn,
              { borderColor: t.accentBorder, backgroundColor: t.inputBg },
              importStatus.phase !== 'idle' && importStatus.phase !== 'done' && importStatus.phase !== 'error'
                ? { opacity: 0.5 }
                : undefined,
            ]}
            onPress={onUploadCollectionWeb}
            disabled={importStatus.phase !== 'idle' && importStatus.phase !== 'done' && importStatus.phase !== 'error'}
          >
            <Text style={[styles.btnText, { color: t.text }]}>Upload Collection (CSV or MARC)</Text>
          </TouchableOpacity>
        </View>

        {importStatus.phase !== 'idle' && (
          <View style={{ marginTop: 10 }}>
            <View
              style={{
                height: 6,
                backgroundColor: t.cardBorder,
                borderRadius: 3,
                overflow: 'hidden',
              }}
            >
              <View
                style={{
                  height: 6,
                  width: `${importStatus.pct}%` as any,
                  backgroundColor:
                    importStatus.phase === 'error'
                      ? t.danger
                      : importStatus.phase === 'done'
                      ? t.accent
                      : t.accentBorder,
                  borderRadius: 3,
                }}
              />
            </View>
            <Text
              style={{
                color:
                  importStatus.phase === 'error'
                    ? t.danger
                    : importStatus.phase === 'done'
                    ? t.accent
                    : t.subtext,
                fontSize: 12,
                marginTop: 4,
              }}
            >
              {importStatus.label}
            </Text>
          </View>
        )}

        {localLibrarySupported ? (
          <View style={[styles.rowBetween, { marginTop: 16 }]}>
            <View style={{ flex: 1, paddingRight: 12 }}>
              <Text style={{ color: t.text, fontWeight: "700" }}>
                Use Local Collection for recommendations
              </Text>
              <Note>
                When enabled, external sources are disabled and recommendations come only from your
                imported holdings.
              </Note>
            </View>
            <Switch
              value={localLibraryEnabled}
              onValueChange={(next) => {
                if (next) {
                  // Turning on: disable all external sources first
                  setConfig((prev: any) => {
                    const n = deepClone(prev);
                    syncSchema(n);
                    n.recommendations.sourceEnabled.googleBooks = false;
                    n.recommendations.sourceEnabled.openLibrary = false;
                    n.recommendations.sourceEnabled.kitsu = false;
                    n.recommendations.sourceEnabled.gcd = false;
                    n.recommendations.sourceEnabled.nyt = false;
                    n.recommendations.sourceEnabled.localLibrary = true;
                    return n;
                  });
                } else {
                  setPath(["recommendations", "sourceEnabled", "localLibrary"], false);
                }
              }}
            />
          </View>
        ) : null}

        <Divider />

        {/* ── F. Admin Security ── */}
        <SectionTitle>F. Admin Security</SectionTitle>
        <Note>
          Set a PIN to protect these settings from casual access. This does not affect patrons using
          the app in Guest mode.
        </Note>

        <View style={[styles.rowBetween, { marginTop: 12 }]}>
          <Text style={{ color: t.text, fontWeight: "700" }}>Enable Admin PIN</Text>
          <Switch value={adminPinEnabled} onValueChange={() => togglePathBool(["admin", "pinEnabled"])} />
        </View>

        {adminPinEnabled ? (
          <>
            <Text style={[styles.label, { color: t.muted, marginTop: 14 }]}>6-digit PIN</Text>
            <TextInput
              style={[
                styles.input,
                { backgroundColor: t.inputBg, borderColor: t.inputBorder, color: t.text, maxWidth: 260 },
              ]}
              value={adminPin}
              onChangeText={(text) =>
                setPath(["admin", "pin"], text.replace(/\D/g, "").slice(0, 6))
              }
              placeholder="123456"
              placeholderTextColor="#7a8aa0"
              keyboardType="number-pad"
            />
            {adminPin.length > 0 && adminPin.length !== 6 ? (
              <Note color={t.danger}>PIN must be exactly 6 digits.</Note>
            ) : null}
          </>
        ) : null}

        <Divider />

        {/* ── G. Advanced (collapsible) ── */}
        <CollapsibleSection title="G. Advanced" defaultOpen={false} theme={t}>
          <View style={{ paddingTop: 8, gap: 4 }}>
            <Note>
              Library ID and hosted URL identify your configuration in the NovelIdeas network.
            </Note>
            <Text style={[styles.note, { color: t.subtext, marginTop: 8 }]}>
              {"Library ID: "}
              <Text style={{ fontWeight: "900", color: t.text }}>{libraryId}</Text>
            </Text>
            <Text style={[styles.note, { color: t.subtext, marginTop: 4 }]}>
              {"Hosted URL: "}
              <Text style={{ fontWeight: "900", color: t.text }}>{hostedConfigUrl}</Text>
            </Text>

            <View style={[styles.divider, { backgroundColor: t.cardBorder }]} />

            <Text style={[styles.label, { color: t.muted, marginBottom: 8 }]}>QR Export</Text>
            {qrTooBig ? (
              <Note color={t.danger}>QR payload is too large to render.</Note>
            ) : (
              <View style={{ alignItems: "flex-start", gap: 10 }}>
                <View style={{ padding: 14, backgroundColor: "#ffffff", borderRadius: 14 }}>
                  <QRCode value={qrPayload} size={200} />
                </View>
                <Note>Scan to open your library's hosted URL.</Note>
              </View>
            )}

            {SHOW_ADULT_KITSU_DEBUG_CONTROLS ? (
              <>
                <View style={[styles.divider, { backgroundColor: t.cardBorder }]} />
                <Text style={[styles.label, { color: t.muted, marginBottom: 6 }]}>Raw Config (JSON)</Text>
                <ScrollView horizontal style={{ maxHeight: 200 }}>
                  <Text style={{ fontFamily: "monospace", fontSize: 11, color: t.subtext }}>
                    {configText}
                  </Text>
                </ScrollView>
              </>
            ) : null}
          </View>
        </CollapsibleSection>

      </View>

    </ScrollView>

    {/* ── Sticky Save / Discard bar ── */}
    {showStickyBar ? (
      <View
        style={[styles.stickyBar, { backgroundColor: t.cardBg, borderTopColor: t.cardBorder }]}
        accessibilityLabel="Unsaved changes action bar"
      >
        {isDirty ? (
          <>
            <TouchableOpacity
              style={[styles.btnPrimary, { borderColor: t.accentBorder, backgroundColor: t.accent }]}
              onPress={onSave}
              accessibilityRole="button"
              accessibilityLabel="Save Changes"
            >
              <Text style={[styles.btnText, { color: t.accentTextOn }]}>Save Changes</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.btn, { borderColor: t.cardBorder, backgroundColor: t.inputBg }]}
              onPress={onDiscard}
              accessibilityRole="button"
              accessibilityLabel="Discard Changes"
            >
              <Text style={[styles.btnText, { color: t.text }]}>Discard Changes</Text>
            </TouchableOpacity>
            <Text style={{ color: t.subtext, fontSize: 11, marginLeft: 4 }}>
              You have unsaved changes.
            </Text>
          </>
        ) : saveStatus === "saved" ? (
          <Text style={{ color: t.success, fontSize: 13, fontWeight: "800" }}>{"Changes saved \u2713"}</Text>
        ) : saveStatus === "error" ? (
          <Text style={{ color: t.danger, fontSize: 13, fontWeight: "800" }}>Save failed. Please try again.</Text>
        ) : null}
      </View>
    ) : null}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  wrap: {
    marginTop: 18,
    marginHorizontal: 14,
    borderWidth: 2,
    borderRadius: 18,
    padding: 20,
    maxWidth: 980,
    alignSelf: "center",
    width: "100%",
  },
  pageHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    flexWrap: "wrap",
    gap: 12,
    marginBottom: 14,
  },
  pageHeaderActions: {
    alignItems: "flex-end",
    gap: 10,
  },
  headerActionButton: {
    minWidth: 160,
    alignItems: "center",
  },
  h1: { fontSize: 22, fontWeight: "900" },
  sub: { marginTop: 6, fontSize: 13, lineHeight: 18, maxWidth: 620 },
  divider: { height: 1, marginVertical: 16 },
  sectionTitle: { fontSize: 16, fontWeight: "900", marginBottom: 12 },
  label: { fontSize: 12, fontWeight: "800", marginBottom: 6 },
  note: { fontSize: 12, lineHeight: 18 },
  previewAcceptanceNote: { marginTop: 10 },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    fontWeight: "700",
  },
  rowBetween: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  btn: { borderWidth: 2, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10 },
  btnPrimary: { borderWidth: 2, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10 },
  btnText: { fontSize: 12, fontWeight: "900" },
  utilBtn: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6 },
  utilBtnText: { fontSize: 11, fontWeight: "800" },
  logoRow: {
    flexDirection: "row",
    gap: 14,
    marginTop: 10,
    alignItems: "flex-start",
    flexWrap: "wrap",
  },
  logoPreview: {
    width: 120,
    height: 120,
    borderWidth: 2,
    borderRadius: 14,
    justifyContent: "center",
    alignItems: "center",
    overflow: "hidden",
  },
  infoCard: { borderWidth: 1, borderRadius: 12, padding: 12, marginTop: 10 },
  badge: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5 },
  stickyBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderTopWidth: 1,
    flexWrap: "wrap",
  },
});
