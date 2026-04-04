import React, { useEffect, useMemo, useState } from "react";
import { router } from "expo-router";
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

function deepClone<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj));
}

async function makeTinyLogoDataUrl(dataUrl: string, size = 32): Promise<string> {
  // Create a tiny, QR-friendly logo. Default: 32x32.
  // Prefer JPEG for size unless we detect transparency (alpha), in which case use PNG.
  return await new Promise((resolve) => {
    try {
      if (typeof document === "undefined") return resolve(dataUrl);

      const img = new Image();
      img.onload = () => {
        try {
          const canvas = document.createElement("canvas");
          canvas.width = size;
          canvas.height = size;

          const ctx = canvas.getContext("2d", { willReadFrequently: true } as any);
          if (!ctx) return resolve(dataUrl);

          ctx.clearRect(0, 0, size, size);

          // Cover-fit (center crop) into a square.
          const sw = img.width;
          const sh = img.height;
          const s = Math.min(sw, sh);
          const sx = Math.floor((sw - s) / 2);
          const sy = Math.floor((sh - s) / 2);
          ctx.drawImage(img, sx, sy, s, s, 0, 0, size, size);

          // Detect transparency (alpha) in the downscaled image.
          let hasAlpha = false;
          try {
            const imgData = ctx.getImageData(0, 0, size, size).data;
            for (let i = 3; i < imgData.length; i += 4) {
              if (imgData[i] < 250) {
                hasAlpha = true;
                break;
              }
            }
          } catch {
            // If we can't read pixels, fall back to PNG (safe for transparency).
            hasAlpha = true;
          }

          if (hasAlpha) {
            const png = canvas.toDataURL("image/png");
            return resolve(png);
          }

          // Opaque: JPEG is usually much smaller.
          const jpg = canvas.toDataURL("image/jpeg", 0.55);
          return resolve(jpg);
        } catch {
          return resolve(dataUrl);
        }
      };
      img.onerror = () => resolve(dataUrl);
      img.src = dataUrl;
    } catch {
      resolve(dataUrl);
    }
  });
}

// Keep desktop admin compatible with both the older config schema and the
// current canonical schema.
// Canonical:
//   - branding.libraryName
//   - enabledDecks.{k2,"36",ms_hs,adult}
// Legacy (still seen in older JSON/config files):
//   - library.name
//   - decks.enabled.{k2,"36",ms_hs,adult}
function syncSchema(cfg: any) {
  if (!cfg || typeof cfg !== "object") return;

  // Branding / library name
  cfg.branding = (cfg.branding && typeof cfg.branding === "object") ? cfg.branding : {};
  cfg.library = (cfg.library && typeof cfg.library === "object") ? cfg.library : {};

  const hasCanonName = typeof cfg.branding?.libraryName === "string";
  const hasLegacyName = typeof cfg.library?.name === "string";

  const canonName = hasCanonName ? cfg.branding.libraryName : undefined;
  const legacyName = hasLegacyName ? cfg.library.name : undefined;

  // Prefer canonical if present (even if it's an empty string); otherwise adopt legacy.
  const chosenName = (hasCanonName ? canonName : (legacyName ?? "")).toString();

  cfg.branding.libraryName = chosenName;
  cfg.library.name = chosenName;

  // Deck enablement
  cfg.enabledDecks = (cfg.enabledDecks && typeof cfg.enabledDecks === "object") ? cfg.enabledDecks : {};
  cfg.decks = (cfg.decks && typeof cfg.decks === "object") ? cfg.decks : {};
  cfg.decks.enabled = (cfg.decks.enabled && typeof cfg.decks.enabled === "object") ? cfg.decks.enabled : {};

  const deckKeys: DeckKey[] = ["k2", "36", "ms_hs", "adult"];
  for (const k of deckKeys) {
    const canonVal = cfg.enabledDecks?.[k];
    const legacyVal = cfg.decks?.enabled?.[k];

    // Determine a boolean value without forcing defaults unless neither exists.
    let v: boolean;
    if (typeof canonVal === "boolean") v = canonVal;
    else if (typeof legacyVal === "boolean") v = legacyVal;
    else v = true;

    cfg.enabledDecks[k] = v;
    cfg.decks.enabled[k] = v;
  }

  // Theme compatibility
  // Canonical (mobile + Home): branding.mainTheme + branding.highlight
  // Legacy (older web configs): theme.mainThemeKey + theme.highlightKey
  cfg.theme = (cfg.theme && typeof cfg.theme === "object") ? cfg.theme : {};

  const themeKeys = ["classic_blue", "sky_blue", "forest_green", "kelly_green", "cardinal_red", "purple", "slate", "gold_accent"] as const;

const mainThemeKeys = (["dark_blue", ...themeKeys] as const) satisfies readonly ThemeKey[];
  const highlightKeys = ["white", "black", "silver", ...themeKeys] as const;

  const isThemeKey = (v: any): v is (typeof themeKeys)[number] =>
    typeof v === "string" && (themeKeys as readonly string[]).includes(v);

  const isHighlightKey = (v: any): v is (typeof highlightKeys)[number] =>
    typeof v === "string" && (highlightKeys as readonly string[]).includes(v);

  const isTitleTextKey = (v: any): v is TitleTextKey => v === "white" || v === "black";

  const mainCandidate = cfg?.branding?.mainTheme ?? cfg?.branding?.theme ?? cfg?.theme?.mainThemeKey;
  const highlightCandidate = cfg?.branding?.highlight ?? cfg?.theme?.highlightKey;
  const titleTextCandidate = cfg?.branding?.titleTextColor ?? cfg?.theme?.titleTextColor;

  // UI default: if nothing is set, treat it as Dark Blue (i.e., the app's built-in default theme).
  const mainTheme = isThemeKey(mainCandidate) ? mainCandidate : "dark_blue";
  const highlight = isHighlightKey(highlightCandidate) ? highlightCandidate : "gold_accent";
  const titleTextColor: TitleTextKey = isTitleTextKey(titleTextCandidate) ? titleTextCandidate : "white";

  if (!cfg.branding) cfg.branding = {};
  if (!cfg.theme) cfg.theme = {};

  // Persist main theme only when it's not the default. The default is represented by "unset".
  if (mainTheme === "dark_blue") {
    delete cfg.branding.mainTheme;
    delete cfg.branding.theme;
    delete cfg.theme.mainThemeKey;
  } else {
    cfg.branding.mainTheme = mainTheme;
    // Back-compat: older code may read branding.theme
    cfg.branding.theme = mainTheme;
    cfg.theme.mainThemeKey = mainTheme;
  }

  // Persist highlight always (existing behavior), but keep back-compat fields aligned.
  cfg.branding.highlight = highlight;
  cfg.theme.highlightKey = highlight;
  cfg.branding.highlight = highlight;

  // Persist title text color only when it differs from the default (white).
  if (titleTextColor === "white") {
    delete cfg.branding.titleTextColor;
    delete cfg.theme.titleTextColor;
  } else {
    cfg.branding.titleTextColor = titleTextColor;
    cfg.theme.titleTextColor = titleTextColor;
  }

  cfg.theme.mainThemeKey = mainTheme;
  cfg.theme.highlightKey = highlight;
}

type ThemeKey =
  | "dark_blue"
  | "classic_blue"
  | "sky_blue"
  | "forest_green"
  | "kelly_green"
  | "cardinal_red"
  | "purple"
  | "slate"
  | "gold_accent";

type HighlightKey = ThemeKey | "white" | "black" | "silver";

type TitleTextKey = "white" | "black";

type DeckKey = "k2" | "36" | "ms_hs" | "adult";
type SourceKey = "open_library" | "local_collection";

type SwipeCategoryKey = "books" | "movies" | "tv" | "games" | "youtube" | "anime" | "podcasts";

function deckLabel(k: DeckKey) {
  if (k === "k2") return "Kids";
  if (k === "36") return "Pre-Teens";
  if (k === "ms_hs") return "Teens";
  if (k === "adult") return "Adults";
  return k;
}

function sourceLabel(s: SourceKey) {
  if (s === "open_library") return "Google Books";
  if (s === "local_collection") return "This library’s collection";
  return s;
}

function themeLabel(t: ThemeKey) {
  switch (t) {
    case "dark_blue":
      return "Dark Blue";
    case "classic_blue":
      return "Blue";
    case "sky_blue":
      return "Sky Blue";
    case "forest_green":
      return "Forest Green";
    case "kelly_green":
      return "Kelly Green";
    case "cardinal_red":
      return "Cardinal Red";
    case "purple":
      return "Purple";
    case "slate":
      return "Slate";
    case "gold_accent":
      return "Gold";
  }
}

function highlightLabel(h: HighlightKey) {
  if (h === "white") return "White";
  if (h === "black") return "Black";
  if (h === "silver") return "Silver / Gray";
  return themeLabel(h as ThemeKey);
}

function slugifyLibraryId(name: string) {
  const raw = String(name || "").trim().toLowerCase();
  const slug = raw
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return slug || "default-library";
}

function buildTheme(mainThemeKey: ThemeKey, highlightKey: HighlightKey) {
  const base = {
    appBg: "#0b1e33",
    cardBg: "#10243f",
    cardBorder: "#223b6b",
    text: "#e5efff",
    subtext: "#cbd5f5",
    muted: "#93c5fd",
    inputBg: "#0b1e33",
    inputBorder: "#223b6b",
    danger: "#fecaca",
  };

  const mainPresets: Record<ThemeKey, { accent: string; accentBorder: string; accentTextOn: string }> = {
    dark_blue: { accent: "#0b1e33", accentBorder: "#223b6b", accentTextOn: "#e5efff" },
    classic_blue: { accent: "#2563eb", accentBorder: "#1d4ed8", accentTextOn: "#f9fafb" },
    sky_blue: { accent: "#38bdf8", accentBorder: "#0284c7", accentTextOn: "#0b1e33" },    forest_green: { accent: "#15803d", accentBorder: "#166534", accentTextOn: "#f9fafb" },
    kelly_green: { accent: "#22c55e", accentBorder: "#16a34a", accentTextOn: "#0b1e33" },
    cardinal_red: { accent: "#ef4444", accentBorder: "#dc2626", accentTextOn: "#0b1e33" },
    purple: { accent: "#a855f7", accentBorder: "#7c3aed", accentTextOn: "#0b1e33" },
    slate: { accent: "#64748b", accentBorder: "#475569", accentTextOn: "#f9fafb" },
    gold_accent: { accent: "#fbbf24", accentBorder: "#f59e0b", accentTextOn: "#1f2933" },
  };

  const highlightPresets: Record<HighlightKey, { highlight: string; highlightBorder: string; highlightTextOn: string }> = {
    classic_blue: { highlight: "#2563eb", highlightBorder: "#1d4ed8", highlightTextOn: "#f9fafb" },
    sky_blue: { highlight: "#38bdf8", highlightBorder: "#0284c7", highlightTextOn: "#0b1e33" },    forest_green: { highlight: "#15803d", highlightBorder: "#166534", highlightTextOn: "#f9fafb" },
    kelly_green: { highlight: "#22c55e", highlightBorder: "#16a34a", highlightTextOn: "#0b1e33" },
    cardinal_red: { highlight: "#ef4444", highlightBorder: "#dc2626", highlightTextOn: "#0b1e33" },
    purple: { highlight: "#a855f7", highlightBorder: "#7c3aed", highlightTextOn: "#0b1e33" },
    slate: { highlight: "#64748b", highlightBorder: "#475569", highlightTextOn: "#f9fafb" },
    gold_accent: { highlight: "#fbbf24", highlightBorder: "#f59e0b", highlightTextOn: "#1f2933" },
    white: { highlight: "#ffffff", highlightBorder: "#e5e7eb", highlightTextOn: "#0b1e33" },
    black: { highlight: "#111827", highlightBorder: "#0b1220", highlightTextOn: "#f9fafb" },
    silver: { highlight: "#d1d5db", highlightBorder: "#9ca3af", highlightTextOn: "#0b1e33" },
  };

  const main = mainPresets[mainThemeKey];
  const hi = highlightPresets[highlightKey];

  return {
    ...base,
    ...main,
    ...hi,
    highlightBg: hi.highlight,
    highlightText: hi.highlightTextOn,
  };
}


function PillButton(props: {
  label: string;
  selected: boolean;
  onPress: () => void;
  theme: any;
}) {
  const { label, selected, onPress, theme } = props;
  return (
    <TouchableOpacity
      onPress={onPress}
      style={{
        paddingVertical: 8,
        paddingHorizontal: 12,
        borderRadius: 999,
        borderWidth: 1,
        borderColor: selected ? theme.accentBorder : theme.cardBorder,
        backgroundColor: selected ? theme.accent : theme.inputBg,
      }}
    >
      <Text
        style={{
          fontWeight: "900",
          fontSize: 12,
          color: selected ? theme.accentTextOn : theme.text,
        }}
      >
        {label}
      </Text>
    </TouchableOpacity>
  );
}



export default function AdminWebScreen() {
  if (Platform.OS !== "web") {
    return (
      <View style={{ flex: 1, padding: 18, justifyContent: "center", alignItems: "center" }}>
        <Text style={{ color: "#e5efff", fontSize: 18, fontWeight: "800", marginBottom: 10 }}>
          Desktop Admin (Web Only)
        </Text>
        <Text style={{ color: "#cbd5f5", textAlign: "center", maxWidth: 520 }}>
          This page is intended for desktop web. Open it in a browser (Expo web build) to edit settings, upload a logo,
          and generate a QR code to import on your phone.
        </Text>
        <TouchableOpacity style={{ marginTop: 18 }} onPress={() => router.back()}>
          <Text style={{ color: "#93c5fd", fontWeight: "700" }}>Go back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const [config, setConfig] = useState<any>(() => {
    const base = deepClone(configFile);
    try {
      // Web-only: hydrate saved draft if present.
      if (Platform.OS === "web") {
        const saved = localStorage.getItem("novelideas_admin_config");
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
  const [showQr, setShowQr] = useState(true);

  // Persist draft on web so desktop edits survive refresh.
  useEffect(() => {
    if (Platform.OS !== "web") return;
    try {
      localStorage.setItem("novelideas_admin_config", JSON.stringify(config));
    } catch {
      // ignore
    }
  }, [config]);

  const mainThemeKey = (config?.branding?.mainTheme || config?.branding?.theme || config?.theme?.mainThemeKey || "dark_blue") as ThemeKey;
  const highlightKey = (config?.branding?.highlight || config?.theme?.highlightKey || "gold_accent") as HighlightKey;
  const titleTextKey = (config?.branding?.titleTextColor || config?.theme?.titleTextColor || "white") as TitleTextKey;

  const theme = useMemo(() => buildTheme(mainThemeKey, highlightKey), [mainThemeKey, highlightKey]);

  const libraryName = String(config?.branding?.libraryName || config?.library?.name || "").trim();
  const libraryId = useMemo(() => slugifyLibraryId(libraryName), [libraryName]);
  const hostedConfigUrl = useMemo(() => `https://novelideas.app/c/${libraryId}`, [libraryId]);

  const configText = useMemo(() => JSON.stringify(config, null, 2), [config]);
  const qrPayload = hostedConfigUrl;
  const qrTooBig = qrPayload.length > 2200;

  const setPath = (path: string[], value: any) => {
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
  };

  // Theme setters: write to canonical keys and keep legacy keys mirrored.
  const setThemeMain = (tk: ThemeKey) => {
    setConfig((prev: any) => {
      const next = deepClone(prev);
      if (next.branding == null) next.branding = {};
      if (next.theme == null) next.theme = {};

      if (tk === "dark_blue") {
        delete next.branding.mainTheme;
        delete next.branding.theme; // back-compat
        delete next.theme.mainThemeKey; // back-compat
      } else {
        next.branding.mainTheme = tk;
        next.branding.theme = tk; // back-compat
        next.theme.mainThemeKey = tk; // back-compat
      }

      syncSchema(next);
      return next;
    });
  };

  const setThemeHighlight = (hk: HighlightKey) => {
    setConfig((prev: any) => {
      const next = deepClone(prev);
      if (next.branding == null) next.branding = {};
      if (next.theme == null) next.theme = {};
      next.branding.highlight = hk;
      next.theme.highlightKey = hk; // back-compat
      syncSchema(next);
      return next;
    });
  };

  const setThemeTitleText = (t: TitleTextKey) => {
    setConfig((prev: any) => {
      const next = deepClone(prev);
      if (next.branding == null) next.branding = {};
      if (next.theme == null) next.theme = {};

      // Store only when non-default to keep JSON clean.
      if (t === "white") {
        delete next.branding.titleTextColor;
        delete next.theme.titleTextColor;
      } else {
        next.branding.titleTextColor = t;
        next.theme.titleTextColor = t; // back-compat
      }

      syncSchema(next);
      return next;
    });
  };

  const togglePathBool = (path: string[]) => {
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
  };

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

  const adminPinEnabled = !!config?.admin?.pinEnabled;
  const adminPin = String(config?.admin?.pin || "");

  return (
    <ScrollView style={{ flex: 1, backgroundColor: theme.appBg }} contentContainerStyle={{ paddingBottom: 56 }}>
      <View style={[styles.wrap, { borderColor: theme.highlightBorder, backgroundColor: theme.cardBg }]}>
        <View style={styles.headerRow}>
          <View>
            <Text style={[styles.h1, { color: theme.text }]}>Desktop Admin</Text>
            <Text style={[styles.sub, { color: theme.subtext }]}>
              Edit settings on desktop, upload logo, then generate a hosted library QR.
            </Text>
          </View>

          <View style={{ flexDirection: "row", gap: 10, alignItems: "center" }}>
            
            <TouchableOpacity
              style={[styles.btn, { borderColor: theme.cardBorder, backgroundColor: "transparent" }]}
              onPress={() => {
                Alert.alert(
                  "Tip $5 (coming soon)",
                  "This will become an optional in-app tip. It will never be required to use NovelIdeas."
                );
              }}
            >
              <Text style={[styles.btnText, { color: theme.text }]}>Tip $5</Text>
            </TouchableOpacity>

            
            <TouchableOpacity
              style={[styles.btnPrimary, { borderColor: theme.accentBorder, backgroundColor: theme.accent }]}
              onPress={() => {
                let savedOk = false;
                let copiedOk = false;

                try {
                  if (Platform.OS === "web") {
                    localStorage.setItem("novelideas_admin_config", configText);
                    savedOk = true;
                  }
                } catch {
                  savedOk = false;
                }

                try {
                  navigator.clipboard?.writeText(qrPayload);
                  copiedOk = true;
                } catch {
                  copiedOk = false;
                }

                if (savedOk && copiedOk) {
                  router.replace("/");
    Alert.alert("Saved", "Saved to this browser and copied settings to clipboard.");
                } else if (savedOk && !copiedOk) {
                  Alert.alert(
                    "Partially saved",
                    "Saved to this browser, but clipboard copy failed. (Clipboard may be blocked in this browser.)"
                  );
                } else if (!savedOk && copiedOk) {
                  Alert.alert("Partially saved", "Copied settings to clipboard, but local browser save failed.");
                } else {
                  Alert.alert("Save failed", "Could not save or copy settings in this browser.");
                }
              }}
            >
              <Text style={[styles.btnText, { color: theme.accentTextOn }]}>Save</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.btn, { borderColor: theme.cardBorder, backgroundColor: theme.inputBg }]}
              onPress={() => {
                try {
                  if (Platform.OS === "web") {
                    localStorage.removeItem("novelideas_admin_config");
                    setConfig(deepClone(configFile));
                    Alert.alert("Reset", "Reverted to defaults (and cleared saved draft).");
                  } else {
                    setConfig(deepClone(configFile));
                    Alert.alert("Reset", "Reverted to defaults.");
                  }
                } catch {
                  setConfig(deepClone(configFile));
                }
              }}
            >
              <Text style={[styles.btnText, { color: theme.text }]}>Reset</Text>
            </TouchableOpacity>
</View>
        </View>

        <View style={[styles.divider, { backgroundColor: theme.cardBorder }]} />

        <Text style={[styles.sectionTitle, { color: theme.text }]}>Branding</Text>

        <Text style={[styles.label, { color: theme.muted }]}>Library name</Text>
        <TextInput
          style={[styles.input, { backgroundColor: theme.inputBg, borderColor: theme.inputBorder, color: theme.text }]}
          value={String(config?.branding?.libraryName || "")}
          onChangeText={(v) => setPath(["branding", "libraryName"], v)}
          placeholder="Library name"
          placeholderTextColor="#7a8aa0"
        />
        <Text style={[styles.note, { color: theme.subtext, marginTop: 8 }]}>
          Hosted library ID: <Text style={{ fontWeight: "900", color: theme.text }}>{libraryId}</Text>
        </Text>
        <Text style={[styles.note, { color: theme.subtext, marginTop: 4 }]}>
          Hosted URL: <Text style={{ fontWeight: "900", color: theme.text }}>{hostedConfigUrl}</Text>
        </Text>

        <Text style={[styles.label, { color: theme.muted, marginTop: 14 }]}>Library logo</Text>
        <Text style={[styles.note, { color: theme.subtext }]}>
          Upload a logo here on desktop. Hosted config loading comes next.
        </Text>

        <View style={styles.logoRow}>
          <View style={[styles.logoPreview, { borderColor: theme.cardBorder, backgroundColor: theme.inputBg }]}>
            {config?.branding?.logoDataUrl ? (
              <Image
                source={{ uri: config.branding.logoDataUrl }}
                style={{ width: "100%", height: "100%" }}
                resizeMode="contain"
              />
            ) : (
              <Text style={{ color: theme.muted, fontWeight: "700" }}>No logo</Text>
            )}
          </View>

          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
              <TouchableOpacity
                style={[styles.btn, { borderColor: theme.accentBorder, backgroundColor: theme.inputBg }]}
                onPress={onUploadLogoWeb}
              >
                <Text style={[styles.btnText, { color: theme.text }]}>Upload logo</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.btn, { borderColor: theme.highlightBorder, backgroundColor: theme.inputBg }]}
                onPress={onRemoveLogo}
              >
                <Text style={[styles.btnText, { color: theme.text }]}>Remove logo</Text>
              </TouchableOpacity>
            </View>

            <Text style={[styles.note, { color: theme.subtext, marginTop: 10 }]}>
              This stage only changes the QR target. Route loading and config hydration are separate next steps.
            </Text>
          </View>
        </View>

        <View style={[styles.divider, { backgroundColor: theme.cardBorder }]} />

        <View style={styles.sectionHeaderRow}>
          <Text style={[styles.sectionTitle, { color: theme.text }]}>Theme</Text>
        </View>

        <Text style={[styles.label, { color: theme.muted }]}>Main color</Text>
        <View style={styles.rowWrap}>
          {(
            ["dark_blue", "classic_blue", "sky_blue", "forest_green", "kelly_green", "cardinal_red", "purple", "slate", "gold_accent"] as ThemeKey[]
          ).map((tk) => {
            const selected = mainThemeKey === tk;
            const tkTheme = buildTheme(tk, highlightKey);
            return (
              <TouchableOpacity
                key={tk}
                onPress={() => setThemeMain(tk)}
                style={[
                  styles.chip,
                  { borderColor: tkTheme.accentBorder, backgroundColor: theme.inputBg },
                  selected && { borderWidth: 2, borderColor: tkTheme.accentBorder, backgroundColor: tkTheme.accent },
                ]}
              >
                <Text style={[styles.chipText, { color: theme.text }, selected && { fontWeight: "700", color: tkTheme.accentTextOn }]}>
                  {themeLabel(tk)}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <Text style={[styles.label, { color: theme.muted }]}>Highlight color</Text>
        <View style={styles.rowWrap}>
          {(
            ["gold_accent", "white", "black", "silver", "classic_blue", "sky_blue", "forest_green", "cardinal_red", "purple", "slate"] as HighlightKey[]
          ).map((hk) => {
            const selected = highlightKey === hk;
            const hkTheme = buildTheme(mainThemeKey, hk);
            return (
              <TouchableOpacity
                key={hk}
                onPress={() => setThemeHighlight(hk)}
                style={[
                  styles.chip,
                  { borderColor: hkTheme.highlightBorder, backgroundColor: theme.inputBg },
                  selected && { borderWidth: 2, borderColor: hkTheme.highlightBorder, backgroundColor: hkTheme.highlight },
                ]}
              >
                <Text
                  style={[
                    styles.chipText,
                    { color: theme.text },
                    selected && { fontWeight: "700", color: hkTheme.highlightTextOn },
                  ]}
                >
                  {highlightLabel(hk)}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <Text style={[styles.label, { color: theme.muted, marginTop: 10 }]}>Title text color</Text>
        <View style={styles.rowWrap}>
          {(["white", "black"] as TitleTextKey[]).map((t) => (
            <PillButton
              key={t}
              label={t === "black" ? "Black" : "White"}
              selected={titleTextKey === t}
              onPress={() => setThemeTitleText(t)}
              theme={theme}
            />
          ))}
        </View>

        <View style={{ flexDirection: "row", marginTop: 10 }}>
        </View>


        <View style={[styles.divider, { backgroundColor: theme.cardBorder }]} />

        <Text style={[styles.sectionTitle, { color: theme.text }]}>Recommendation Source</Text>
        <View style={styles.rowWrap}>
          {(["open_library", "local_collection"] as SourceKey[]).map((s) => {
            const selected = (config?.recommendations?.source || "open_library") === s;
            return (
              <TouchableOpacity
                key={s}
                onPress={() => setPath(["recommendations", "source"], s)}
                style={[
                  styles.chip,
                  { borderColor: theme.highlightBorder, backgroundColor: theme.inputBg },
                  selected && { backgroundColor: theme.accent, borderColor: theme.accentBorder },
                ]}
              >
                <Text style={[styles.chipText, { color: theme.text }, selected && { color: theme.accentTextOn }]}>
                  {sourceLabel(s)}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <View style={[styles.divider, { backgroundColor: theme.cardBorder }]} />

        <Text style={[styles.sectionTitle, { color: theme.text }]}>Decks</Text>
        <View style={{ gap: 10 }}>
          {(["k2", "36", "ms_hs", "adult"] as DeckKey[]).map((dk) => {
            const enabled = !!(config?.enabledDecks?.[dk] ?? config?.decks?.enabled?.[dk]);
            return (
              <View key={dk} style={styles.rowBetween}>
                <Text style={{ color: theme.text, fontWeight: "700" }}>{deckLabel(dk)}</Text>
                <Switch value={enabled} onValueChange={() => togglePathBool(["enabledDecks", dk])} />
              </View>
            );
          })}
        </View>

        <View style={[styles.divider, { backgroundColor: theme.cardBorder }]} />

        <Text style={[styles.sectionTitle, { color: theme.text }]}>Swipe Categories</Text>
        <Text style={[styles.note, { color: theme.subtext }]}>
          These control which signal cards appear in swipe mode (books + media).
        </Text>
        <View style={{ gap: 10 }}>
          {(["books", "movies", "tv", "games", "youtube", "anime", "podcasts"] as SwipeCategoryKey[]).map((k) => {
            const enabled = config?.swipe?.categories ? !!config.swipe.categories[k] : true;
            return (
              <View key={k} style={styles.rowBetween}>
                <Text style={{ color: theme.text, fontWeight: "700" }}>{k.toUpperCase()}</Text>
                <Switch value={enabled} onValueChange={() => togglePathBool(["swipe", "categories", k])} />
              </View>
            );
          })}
        </View>

        <View style={[styles.divider, { backgroundColor: theme.cardBorder }]} />

        <Text style={[styles.sectionTitle, { color: theme.text }]}>Admin Lock</Text>
        <View style={styles.rowBetween}>
          <Text style={{ color: theme.text, fontWeight: "700" }}>Enable PIN</Text>
          <Switch value={adminPinEnabled} onValueChange={() => togglePathBool(["admin", "pinEnabled"])} />
        </View>

        <Text style={[styles.label, { color: theme.muted, marginTop: 10 }]}>6-digit PIN</Text>
        <TextInput
          style={[
            styles.input,
            { backgroundColor: theme.inputBg, borderColor: theme.inputBorder, color: theme.text, maxWidth: 260 },
          ]}
          value={adminPin}
          onChangeText={(t) => {
            const clean = t.replace(/\D/g, "").slice(0, 6);
            setPath(["admin", "pin"], clean);
          }}
          placeholder="123456"
          placeholderTextColor="#7a8aa0"
          keyboardType="number-pad"
        />
        {adminPinEnabled && adminPin.length !== 6 ? (
          <Text style={[styles.note, { color: theme.danger }]}>PIN must be exactly 6 digits.</Text>
        ) : null}

        <View style={[styles.divider, { backgroundColor: theme.cardBorder }]} />

        <Text style={[styles.sectionTitle, { color: theme.text }]}>QR Export</Text>
        <View style={styles.rowBetween}>
          <Text style={{ color: theme.subtext }}>Show QR</Text>
          <Switch value={showQr} onValueChange={setShowQr} />
        </View>

        {showQr ? (
          qrTooBig ? (
            <View style={{ marginTop: 14 }}>
              <Text style={[styles.note, { color: theme.danger, textAlign: "center" }]}>
                QR payload is too large to render. (Tip: the logo is excluded from QR, but other settings may still be large.)
              </Text>
            </View>
          ) : (
            <View style={{ marginTop: 14, alignItems: "center", gap: 10 }}>
              <View style={{ padding: 14, backgroundColor: "#ffffff", borderRadius: 14 }}>
                <QRCode value={qrPayload} size={240} />
              </View>
              <Text style={[styles.note, { color: theme.subtext, textAlign: "center" }]}>
                This QR now points to the hosted library URL only. Config loading is not connected yet in this stage.
              </Text>
              <Text style={[styles.note, { color: theme.subtext, textAlign: "center" }]}>
                {hostedConfigUrl}
              </Text>
            </View>
          )
        ) : null}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginTop: 18,
    marginHorizontal: 14,
    borderWidth: 2,
    borderRadius: 18,
    padding: 16,
    maxWidth: 980,
    alignSelf: "center",
    width: "100%",
  },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 14,
    alignItems: "flex-start",
    flexWrap: "wrap",
  },
  h1: { fontSize: 22, fontWeight: "900" },
  sub: { marginTop: 6, fontSize: 13, lineHeight: 18, maxWidth: 620 },
  divider: { height: 1, marginVertical: 14 },
  sectionTitle: { fontSize: 16, fontWeight: "900", marginBottom: 10 },
  sectionHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
    marginBottom: 10,
  },
  smallButton: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  smallButtonText: {
    fontSize: 12,
    fontWeight: "800",
  },
  label: { fontSize: 12, fontWeight: "800", marginBottom: 6 },
  note: { fontSize: 12, lineHeight: 18 },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    fontWeight: "700",
  },
  rowWrap: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  rowBetween: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  chip: {
    borderWidth: 2,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  chipText: { fontSize: 12, fontWeight: "800" },
  btn: {
    borderWidth: 2,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  btnPrimary: {
    borderWidth: 2,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  btnText: { fontSize: 12, fontWeight: "900" },
  logoRow: { flexDirection: "row", gap: 14, marginTop: 10, alignItems: "flex-start", flexWrap: "wrap" },
  logoPreview: {
    width: 140,
    height: 140,
    borderWidth: 2,
    borderRadius: 16,
    justifyContent: "center",
    alignItems: "center",
    overflow: "hidden",
  },
});
