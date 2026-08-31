import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState
} from "react";
import { router, useFocusEffect } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { getRuntimeLibraryName, setRuntimeLibraryId, setRuntimeLibraryName } from "../../constants/runtimeConfig";
import {
  Alert,
  Linking,
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  Image,
  ActivityIndicator,
  SafeAreaView,
  Modal
} from "react-native";
import QRCode from "react-native-qrcode-svg";
import configFile from "../../NovelIdeas.json";
import SwipeDeckScreen from "../../screens/SwipeDeckScreen";
import { MyListModal } from "../../components/MyListModal";
import {
  applyWebHighlightColor,
  autoChooseFontColor,
  buildTheme,
  highlightKeyToHex,
  isValidHex,
  mainKeyToHex,
  type ThemeKey,
  type HighlightKey,
  type TitleTextKey
} from "../../constants/brandTheme";
import { isAdminSessionActive } from "../../lib/adminSession";
import { usePwaInstall } from "../../hooks/use-pwa-install";
import { updatePwaDocumentBranding } from "../../lib/pwaRuntime";
import {
  loadSharedLibraryConfigWithDiagnostics,
  saveSharedLibraryConfig,
  type SharedLibraryConfigLoadDiagnostics,
} from "../../lib/librarySharing/client";
import { isPreviewAcceptanceEnvironmentEnabled } from "../../lib/previewAcceptanceHarness";
import {
  readPatronLibraries,
  rememberPatronLibrary,
  type SavedLibrary,
} from "../../lib/savedLibraries";
import { libraryIdReadCandidates } from "../../lib/libraryIdMigration.js";
import {
  readOrCreatePatronId,
  readOrCreatePatronIdAsync,
  resetPatronIdentity,
  resetPatronIdentityAsync,
} from "../../lib/patronIdentity.mjs";
import {
  addSavedRecommendation,
  clearAllPatronMyLists,
  clearAllPatronMyListsAsync,
  patronMyListStorageKey,
  readPatronMyList,
  readPatronMyListAsync,
  removeSavedRecommendation,
  writePatronMyList,
  writePatronMyListAsync,
  type SavedRecommendation,
} from "../../lib/patronMyList";
import {
  clearAllPatronAgePreferences,
  clearAllPatronAgePreferencesAsync,
  effectivePatronAgeBands,
  normalizeAvailableAgeBands,
  readPatronAgePreferences,
  readPatronAgePreferencesAsync,
} from "../../lib/patronAgePreferences";
import {
  clearAllPatronCustomizations,
  clearAllPatronCustomizationsAsync,
  effectivePatronSwipeCategories,
  normalizeAvailableSwipeCategories,
  readPatronCustomization,
  readPatronCustomizationAsync,
  resolvePatronAppearance,
  type PatronCustomization,
} from "../../lib/patronCustomization";
import {
  loadLocalCollectionRecommendationArtifact,
  type LocalCollectionRecommendationRecord,
} from "../../lib/localCollection/storage";
import { searchLocalCollection } from "../../lib/localCollection/search";

const SHOW_ADULT_KITSU_DEBUG_CONTROLS =
  String(
    (globalThis as any)?.__NOVEL_IDEAS_SHOW_ADULT_KITSU_DEBUG_CONTROLS__ ||
      (typeof process !== "undefined" ? (process as any)?.env?.EXPO_PUBLIC_SHOW_ADULT_KITSU_DEBUG_CONTROLS : "") ||
      ""
  ).toLowerCase() === "true";

function deepClone<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj));
}

export default HomeScreen;

// Keep Home compatible with both older schema and the current canonical schema.
// Canonical:
//   - branding.libraryName
//   - enabledDecks.{k2,"36",ms_hs,adult}
// Legacy (still present in some configs / older code paths):
//   - library.name
//   - decks.enabled.{k2,"36",ms_hs,adult}
function syncSchema(cfg: any) {
  if (!cfg || typeof cfg !== "object") return cfg;

  cfg.branding = (cfg.branding && typeof cfg.branding === "object") ? cfg.branding : {};
  cfg.library = (cfg.library && typeof cfg.library === "object") ? cfg.library : {};

  const legacyName = typeof cfg.library?.name === "string" ? cfg.library.name : "";
  const canonName = typeof cfg.branding?.libraryName === "string" ? cfg.branding.libraryName : "";
  const chosenName = (canonName || legacyName || "").toString();

  cfg.branding.libraryName = chosenName;
  cfg.library.name = chosenName;

  cfg.enabledDecks = (cfg.enabledDecks && typeof cfg.enabledDecks === "object") ? cfg.enabledDecks : {};
  cfg.decks = (cfg.decks && typeof cfg.decks === "object") ? cfg.decks : {};
  cfg.decks.enabled = (cfg.decks.enabled && typeof cfg.decks.enabled === "object") ? cfg.decks.enabled : {};

  const deckKeys: DeckKey[] = ["k2", "36", "ms_hs", "adult"];
  for (const k of deckKeys) {
    const canonVal = cfg.enabledDecks?.[k];
    const legacyVal = cfg.decks?.enabled?.[k];

    let v: boolean;
    if (typeof canonVal === "boolean") v = canonVal;
    else if (typeof legacyVal === "boolean") v = legacyVal;
    else v = true;

    cfg.enabledDecks[k] = v;
    cfg.decks.enabled[k] = v;
  }

  cfg.recommendations = (cfg.recommendations && typeof cfg.recommendations === "object") ? cfg.recommendations : {};
  const sourceSettings = resolveRecommendationSourceSettings(cfg);
  cfg.recommendations.sourceEnabled = sourceSettings.sourceEnabled;
  const adultKitsuForceQuery = String(cfg.recommendations.adultKitsuOnlyForceQueryForValidation || "").trim().toLowerCase();
  if (SHOW_ADULT_KITSU_DEBUG_CONTROLS && adultKitsuForceQuery === "dystopian") cfg.recommendations.adultKitsuOnlyForceQueryForValidation = "dystopian";
  else delete cfg.recommendations.adultKitsuOnlyForceQueryForValidation;
  if (typeof cfg.recommendations.localLibrarySupported !== "boolean") {
    cfg.recommendations.localLibrarySupported = false;
  }

  return cfg;
}

function resolveHostedBranding(cfg: any): {
  libraryName: string;
  mainThemeKey: ThemeKey;
  highlightKey: HighlightKey;
  titleTextKey: TitleTextKey;
  mainColorHex: string;
  highlightColorHex: string;
  fontColorHex: string;
} {
  const libraryName = String(cfg?.branding?.libraryName ?? cfg?.library?.name ?? "").trim();
  const mainThemeKey: ThemeKey =
    (cfg?.branding?.mainTheme as ThemeKey) ||
    (cfg?.branding?.theme as ThemeKey) ||
    (cfg?.theme?.mainThemeKey as ThemeKey) ||
    "dark_blue";
  const highlightKey: HighlightKey =
    (cfg?.branding?.highlight as HighlightKey) ||
    (cfg?.theme?.highlightKey as HighlightKey) ||
    "gold_accent";
  const titleTextKey: TitleTextKey =
    (cfg?.branding?.titleTextColor as TitleTextKey) ||
    (cfg?.theme?.titleTextColor as TitleTextKey) ||
    "white";

  const mainColorHex = isValidHex(cfg?.branding?.mainColorHex)
    ? cfg.branding.mainColorHex
    : mainKeyToHex(mainThemeKey);
  const highlightColorHex = isValidHex(cfg?.branding?.highlightColorHex)
    ? cfg.branding.highlightColorHex
    : highlightKeyToHex(highlightKey);
  const autoFontColorEnabled =
    typeof cfg?.branding?.autoFontColor === "boolean" ? cfg.branding.autoFontColor : true;

  let fontColorHex = cfg?.branding?.fontColorHex;
  if (!isValidHex(fontColorHex)) {
    fontColorHex = autoFontColorEnabled
      ? autoChooseFontColor(mainColorHex)
      : (titleTextKey === "black" ? "#000000" : "#ffffff");
  }

  return {
    libraryName,
    mainThemeKey,
    highlightKey,
    titleTextKey,
    mainColorHex,
    highlightColorHex,
    fontColorHex,
  };
}


type DeckKey = "k2" | "36" | "ms_hs" | "adult";
type SourceKey = "open_library" | "local_collection";
type RecommendationSourceToggleKey = "googleBooks" | "openLibrary" | "localLibrary" | "kitsu" | "gcd" | "nyt";
type RecommendationSourceEnabled = Record<RecommendationSourceToggleKey, boolean>;

type SwipeCategoryKey = "books" | "movies" | "tv" | "games" | "youtube" | "anime" | "podcasts";
type SwipeCategories = Record<SwipeCategoryKey, boolean>;

const DEFAULT_RECOMMENDATION_SOURCE_ENABLED: RecommendationSourceEnabled = {
  googleBooks: true,
  openLibrary: true,
  localLibrary: false,
  kitsu: true,
  gcd: true,
  nyt: false,
};

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

function resolveRecommendationSourceSettings(cfg: any): {
  sourceEnabled: RecommendationSourceEnabled;
  deckSourceEnabled: Record<DeckKey, RecommendationSourceEnabled>;
  localLibrarySupported: boolean;
} {
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

  const routedSourceEnabled = applyLocalCollectionOnlySourceRouting(sourceEnabled);
  return {
    sourceEnabled: routedSourceEnabled,
    deckSourceEnabled: { k2: routedSourceEnabled, "36": routedSourceEnabled, ms_hs: routedSourceEnabled, adult: routedSourceEnabled },
    localLibrarySupported,
  };
}


type OLDoc = {
  key?: string;
  title?: string;
  author_name?: string[];
  first_publish_year?: number;
  cover_i?: number;
};

type ManualSearchResult = {
  id: string;
  source: SourceKey;
  title: string;
  author: string;
  publicationYear?: number;
  coverUrl?: string;
  shelvingLocation?: string;
  localPlacement?: string;
  callNumber?: string;
  isbn?: string;
};

function deckLabel(k: DeckKey) {
  if (k === "k2") return "Kids";
  if (k === "36") return "Pre-Teens";
  if (k === "ms_hs") return "Teens";
  if (k === "adult") return "Adults";
  return k;
}

function sourceLabel(s: SourceKey) {
  if (s === "open_library") return "Open Library";
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
    case "cardinal_red":
      return "Cardinal Red";
    case "pink":
      return "Pink";
    case "purple":
      return "Purple";
    case "slate":
      return "Slate";
    case "gold_accent":
      return "Gold";
    default:
      return "Dark Blue";
  }
}

function highlightLabel(h: HighlightKey) {
  if (h === "white") return "White";
  if (h === "black") return "Black";
  if (h === "silver") return "Silver / Gray";
  // For shared keys, reuse theme labels.
  return themeLabel(h as ThemeKey);
}

function titleTextLabel(t: TitleTextKey) {
  return t === "black" ? "Black" : "White";
}

function coverUrlFromCoverId(coverId?: number, size: "S" | "M" | "L" = "M") {
  if (!coverId) return null;
  return `https://covers.openlibrary.org/b/id/${coverId}-${size}.jpg`;
}

function showSourceInfo() {
  Alert.alert(
    "What does this mean?",
    [
      "• Open Library: Students get recommendations from the public Open Library catalog. You don’t need to upload anything.",
      "",
      "• This library’s collection: Students only get recommendations that your library actually owns. Upload/import your collection from Admin → Upload collection.",
      "",
      "Privacy note: NovelIdeas does not ask for student logins. Preferences can be stored locally on the device. If you choose Open Library, you can avoid uploading any collection data.",
    ].join("\n")
  );
}



function DefaultBookLogo(props: { highlight: string }) {
  // Simple “open book” drawing using Views (no external assets).
  return (
    <View style={[styles.logoWrap, { borderColor: props.highlight }]} accessibilityLabel="Default book logo">
      <Image source={require("../../assets/book_logo.png")} style={[styles.bookLogoImg, { tintColor: props.highlight }]} resizeMode="contain" />
    </View>
  );
}

// ---------- STUDENT VIEW ----------
function StudentView(props: {
  theme: ReturnType<typeof buildTheme>;
  libraryName: string;
  logoDataUrl?: string | null;
  enabledDecks: Record<string, boolean>;
  source: SourceKey;
  deck: DeckKey;
  setDeck: (d: DeckKey) => void;
  query: string;
  setQuery: (q: string) => void;
  loading: boolean;
  results: ManualSearchResult[];
  currentResultIndex: number;
  errorMsg: string | null;
  onSearch: () => void;
  onClear: () => void;
  onPrevResult: () => void;
  onNextResult: () => void;
  onTitleTap: () => void;
  onLogoTap: () => void;
  queryInputRef: any;
  showHeader?: boolean;
}) {
  return (
    <View style={{ width: "100%", maxWidth: 720 }}>
      {props.showHeader !== false ? (
      <View style={[styles.headerFrame, { backgroundColor: props.theme.accent, borderColor: props.theme.highlight }]}>
        <View style={styles.headerRow}>
          <TouchableOpacity
            style={styles.headerLeft}
            onPress={props.onLogoTap}
            accessibilityRole="button"
            accessibilityLabel="NovelIdeas logo"
          >
            {props.logoDataUrl ? (
              <Image
                source={{ uri: props.logoDataUrl }}
                style={[styles.uploadedLogo, { borderColor: props.theme.lightBorder }]}
                resizeMode="contain"
              />
            ) : (
              <DefaultBookLogo highlight={props.theme.highlight} />
            )}
          </TouchableOpacity>

          <TouchableOpacity
            onPress={props.onTitleTap}
            style={styles.headerCenter}
            accessibilityRole="button"
          >
            <View style={styles.titleRow}>

            {(((props.libraryName) || "").trim().length > 0) ? (

              <Text

                style={[styles.title, { color: props.theme.titleText }]}

                numberOfLines={1}

                ellipsizeMode="tail"

              >

                {props.libraryName}

              </Text>

            ) : (

              <>

                <Text style={[styles.title, { color: props.theme.titleText }]} >Novel</Text>

                            <View

                              style={[

                                styles.titleDivider,

                                { borderColor: props.theme.highlight },

                              ]}

                              accessibilityLabel="Title divider"

                            />

                            <Text style={[styles.title, { color: props.theme.titleText }]}>Ideas</Text>

              </>

            )}

          </View>
            <Text style={[styles.subtitle, { color: props.theme.highlight }]}>Book Finder</Text>
          </TouchableOpacity>

          <View style={styles.headerRight} />
        </View>
      </View>
      ) : null}

      <View
        style={[
          styles.card,
          { backgroundColor: props.theme.cardBg, borderColor: props.theme.lightBorder },
        ]}
      >
        <Text style={[styles.sectionTitle, { color: props.theme.text, marginTop: 0 }]}>Choose audience</Text>
        <View style={styles.rowWrap}>
          {(["k2", "36", "ms_hs", "adult"] as DeckKey[])
            .filter((dk) => !!props.enabledDecks[dk])
            .map((dk) => {
              const selected = props.deck === dk;

              return (
                <TouchableOpacity
                  key={dk}
                  onPress={() => props.setDeck(dk)}
                  style={[
                    styles.chip,
                    {
                      borderColor: props.theme.highlight,
                      backgroundColor: props.theme.inputBg,
                      borderWidth: 1.5,
                      borderRadius: 999,
                    },
                    selected && {
                      backgroundColor: props.theme.highlight,
                      borderColor: props.theme.lightBorder,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.chipText,
                      { color: props.theme.text },
                      selected && { color: props.theme.highlightTextOn },
                    ]}
                  >
                    {deckLabel(dk)}
                  </Text>
                </TouchableOpacity>
              );
            })}
        </View>

        <View style={[styles.divider, { backgroundColor: props.theme.cardBorder }]} />

        <Text style={[styles.sectionTitle, { color: props.theme.text }]}>
          {props.source === "local_collection" ? "Search This Library" : "Search Open Library"}
        </Text>

        <>
            <Text style={[styles.noteSmall, { color: props.theme.subtext }]}>
              {props.source === "local_collection"
                ? "Search this library's catalog by title, author, ISBN, genre, subject, shelf, or call number."
                : "Try a title, author, or topic (e.g., “Percy Jackson”, “mystery”, “Dora”)."}
            </Text>

            <TextInput
              ref={props.queryInputRef}
              style={[
                styles.input,
                {
                  backgroundColor: props.theme.inputBg,
                  borderColor: props.theme.inputBorder,
                  color: props.theme.text,
                },
              ]}
              value={props.query}
              onChangeText={props.setQuery}
              placeholder="Search books…"
              placeholderTextColor="#7a8aa0"
              onSubmitEditing={props.onSearch}
              returnKeyType="search"
              autoCorrect={false}
              autoCapitalize="none"
            />

            {props.results.length > 0 ? (
              <View style={styles.singleResultWrap}>
                <Text style={[styles.sectionTitle, { color: props.theme.text, marginTop: 6 }]}>Results</Text>
                <Text style={[styles.smallNote, { color: props.theme.muted, textAlign: "center" }]}>
                  {props.currentResultIndex + 1} of {props.results.length}
                </Text>
              </View>
            ) : null}

            {props.results.length > 0 ? (
              (() => {
                const d = props.results[props.currentResultIndex] ?? props.results[0];
                const title = d.title || "Untitled";
                const author = d.author || "Unknown author";
                const year = d.publicationYear ? ` (${d.publicationYear})` : "";
                const cover = d.coverUrl;
                const holdingLocation = [d.shelvingLocation, d.localPlacement].filter(Boolean).join(" · ");
                return (
                  <View style={[styles.resultRow, styles.resultRowCompact, styles.resultCardStack, { borderColor: props.theme.highlight, backgroundColor: props.theme.resultBg }]}>
                    {cover ? <Image source={{ uri: cover }} style={styles.coverLarge} resizeMode="cover" /> : <View style={[styles.coverPlaceholder, styles.coverLarge, { borderColor: props.theme.resultBorder }]}><Text style={[styles.coverPlaceholderText, { color: props.theme.muted }]}>No cover</Text></View>}
                    <View style={styles.resultMetaCentered}>
                      <Text style={[styles.resultTitle, { color: props.theme.text, textAlign: "center" }]} numberOfLines={2}>{title}<Text style={[styles.resultYear, { color: props.theme.muted }]}>{year}</Text></Text>
                      <Text style={[styles.resultAuthor, { color: props.theme.subtext, textAlign: "center" }]} numberOfLines={1}>{author}</Text>
                      <Text style={[styles.resultHint, { color: props.theme.muted, textAlign: "center" }]}>
                        {d.source === "local_collection" ? "In this library's catalog" : "Open Library result"}
                      </Text>
                      {holdingLocation ? <Text style={[styles.resultHint, { color: props.theme.subtext, textAlign: "center" }]}>Shelf: {holdingLocation}</Text> : null}
                      {d.callNumber ? <Text style={[styles.resultHint, { color: props.theme.subtext, textAlign: "center" }]}>Call number: {d.callNumber}</Text> : null}
                    </View>
                    <View style={styles.resultInternalNav}>
                      <TouchableOpacity style={[styles.smallBtn, styles.resultNavBtn, { borderColor: props.theme.lightBorder, backgroundColor: props.theme.inputBg }]} onPress={props.onPrevResult}>
                        <Text style={[styles.smallBtnText, { color: props.theme.text }]}>Back</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={[styles.smallBtn, styles.resultNavBtn, { borderColor: props.theme.lightBorder, backgroundColor: props.theme.inputBg }]} onPress={props.onNextResult}>
                        <Text style={[styles.smallBtnText, { color: props.theme.text }]}>Next</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                );
              })()
            ) : null}

            <View style={styles.rowBetween}>
              <TouchableOpacity
                style={[
                  styles.smallBtn,
                  { borderColor: props.theme.lightBorder, backgroundColor: props.theme.inputBg },
                ]}
                onPress={props.onClear}
              >
                <Text style={[styles.smallBtnText, { color: props.theme.text }]}>Clear</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.primaryBtn,
                  { backgroundColor: props.theme.accent, borderColor: props.theme.accentBorder },
                ]}
                onPress={props.onSearch}
              >
                <Text style={[styles.primaryBtnText, { color: props.theme.accentTextOn }]}>
                  Search
                </Text>
              </TouchableOpacity>
            </View>

            {props.loading ? (
              <View style={{ marginTop: 14, alignItems: "center" }}>
                <ActivityIndicator />
                <Text style={[styles.noteSmall, { color: props.theme.subtext }]}>Searching…</Text>
              </View>
            ) : null}

            {props.errorMsg ? (
              <Text style={[styles.errorText, { color: "#fecaca" }]}>{props.errorMsg}</Text>
            ) : null}

        </>

      </View>
    </View>
  );
}

// ---------- ADMIN VIEW ----------
function AdminView(props: {
  theme: ReturnType<typeof buildTheme>;
  libraryName: string;
    libraryId: string;
logoDataUrl?: string | null;

  // Provided by HomeScreen so imports can apply settings safely.
  setConfig: (updater: any) => void;
  setHasUnsavedChanges: (v: boolean) => void;

  mainThemeKey: ThemeKey;
  highlightKey: HighlightKey;
  titleTextKey: TitleTextKey;

  enabledDecks: Record<string, boolean>;
  sourceEnabled: RecommendationSourceEnabled;
  deckSourceEnabled: Record<DeckKey, RecommendationSourceEnabled>;
  adultKitsuOnlyForceQueryForValidation: string;
  localLibrarySupported: boolean;

  swipeCategories: SwipeCategories;
  toggleSwipeCategory: (k: SwipeCategoryKey) => void;

  adminPinEnabled: boolean;
  adminPin: string;
  setAdminPinEnabled: (v: boolean) => void;
  setAdminPin: (v: string) => void;
  clearAdminPin: () => void;

  setLibraryName: (name: string) => void;
    setLibraryId: (id: string) => void;
setMainThemeKey: (t: ThemeKey) => void;
  setHighlightKey: (h: HighlightKey) => void;
  setTitleTextKey: (t: TitleTextKey) => void;

  onUploadLogo: () => void;
  onRemoveLogo: () => void;

  toggleDeck: (dk: DeckKey) => void;
  setSourceEnabled: (key: RecommendationSourceToggleKey, enabled: boolean) => void;
  setSourceEnabledForDeck: (deck: DeckKey, key: RecommendationSourceToggleKey, enabled: boolean) => void;
  setAdultKitsuOnlyForceQueryForValidation: (enabled: boolean) => void;

  onExit: () => void;

  onSaveSettings: () => void;
  saveButtonLabel: string;
  saveButtonStyle: any;

  configPreview: string;
}) {
  const enabledList = (["k2", "36", "ms_hs", "adult"] as DeckKey[])
    .filter((k) => !!props.enabledDecks[k])
    .map(deckLabel)
    .join(", ");

  const logoLabel = props.logoDataUrl ? "Uploaded logo" : "Using default icon";


  // Import settings by pasting JSON (no camera dependency; reliable on iOS).
  const [importModalVisible, setImportModalVisible] = useState(false);
  const [importText, setImportText] = useState("");

  const applyImportedConfig = (raw: string) => {
    const trimmed = (raw || "").trim();
    if (!trimmed) {
      Alert.alert("Import settings", "Paste a JSON settings payload first.");
      return;
    }

    let parsed: any;
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      Alert.alert("Import settings", "That doesn’t look like valid JSON.");
      return;
    }

    if (!parsed || typeof parsed !== "object") {
      Alert.alert("Import settings", "No usable data found (not an object).");
      return;
    }

    // Normalize a few legacy / alias keys.
    if (parsed.recommendation && !parsed.recommendations) {
      parsed.recommendations = parsed.recommendation;
      delete parsed.recommendation;
    }
    if (parsed.library && typeof parsed.library === "object") {
      const legacyName = parsed.library["Random Library"];
      if (!parsed.library.name && typeof legacyName === "string") {
        parsed.library.name = legacyName;
      }
    }
    // Keep branding.libraryName and library.name aligned when either is present.
    if (parsed.branding && typeof parsed.branding === "object") {
      if (typeof parsed.branding.libraryName === "string" && !parsed.library?.name) {
        parsed.library = parsed.library ?? {};
        parsed.library.name = parsed.branding.libraryName;
      }
    }
    if (parsed.library && typeof parsed.library === "object") {
      if (typeof parsed.library.name === "string" && !parsed.branding?.libraryName) {
        parsed.branding = parsed.branding ?? {};
        parsed.branding.libraryName = parsed.library.name;
      }
    }

    const hasRecognizedKeys = [
      "branding",
      "theme",
      "decks",
      "recommendations",
      "swipe",
      "library",
      "version",
      "admin",
    ].some((k) => k in parsed);

    if (!hasRecognizedKeys) {
      Alert.alert("Import settings", "No usable data found (unrecognized settings object).");
      return;
    }

    // Deep-merge imported settings into existing config so partial imports work.
    const mergeDeep = (baseObj: any, incomingObj: any): any => {
      if (!incomingObj || typeof incomingObj !== "object") return baseObj;
      const out = Array.isArray(baseObj) ? [...baseObj] : { ...(baseObj || {}) };
      for (const key of Object.keys(incomingObj)) {
        const incVal = incomingObj[key];
        const baseVal = out[key];
        if (
          incVal &&
          typeof incVal === "object" &&
          !Array.isArray(incVal) &&
          baseVal &&
          typeof baseVal === "object" &&
          !Array.isArray(baseVal)
        ) {
          out[key] = mergeDeep(baseVal, incVal);
        } else {
          out[key] = incVal;
        }
      }
      return out;
    };

    props.setConfig((prev: any) => {
      const baseConfig = prev ? deepClone(prev) : deepClone(configFile);
      return mergeDeep(baseConfig, parsed);
    });
    props.setHasUnsavedChanges(true);

    // Close the import modal immediately; show confirmation after the state flush.
    setImportModalVisible(false);
    setImportText("");
    setTimeout(() => {
      Alert.alert("Imported", "Settings applied on this device.");
    }, 0);
  };
  return (
    <ScrollView style={{ width: "100%" }} contentContainerStyle={{ paddingBottom: 40 }}>
      <View
        style={[
          styles.card,
          {
            maxWidth: 720,
            alignSelf: "center",
            backgroundColor: props.theme.cardBg,
            borderColor: props.theme.lightBorder,
          },
        ]}
      >
        <View style={styles.rowBetween}>
          <Text style={[styles.adminTitle, { color: props.theme.text }]}>Admin</Text>

          <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
            <TouchableOpacity
              style={[styles.smallBtn, { borderColor: props.theme.cardBorder }]}
              onPress={() => {
                Alert.alert(
                  "Tip $5 (coming soon)",
                  "This will become an optional in-app tip. It will never be required to use NovelIdeas."
                );
              }}
            >
              <Text style={[styles.smallBtnText, { color: props.theme.text }]}>Tip $5</Text>
            </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.smallBtn,
              { borderColor: props.theme.lightBorder, backgroundColor: props.theme.inputBg },
            ]}
            onPress={props.onExit}
          >
            <Text style={[styles.smallBtnText, { color: props.theme.text }]}>Exit</Text>
          </TouchableOpacity>
        </View>
        </View>

        <Text style={[styles.noteSmall, { color: props.theme.subtext }]}>
          Changes you make here apply immediately in the app. Use{" "}
          <Text style={[styles.bold, { color: props.theme.text }]}>Save Settings</Text> to download an updated{" "}
          <Text style={[styles.bold, { color: props.theme.text }]}>NovelIdeas.json</Text> file.
        </Text>

        
{/* BRANDING */}
        <Text style={[styles.sectionTitle, { color: props.theme.text }]}>Branding</Text>

        <Text style={[styles.label, { color: props.theme.muted }]}>Library name</Text>
        <TextInput
          style={[
            styles.input,
            { backgroundColor: props.theme.inputBg, borderColor: props.theme.inputBorder, color: props.theme.text },
          ]}
          value={props.libraryName}
          onChangeText={props.setLibraryName}
          placeholder="Library name"
          placeholderTextColor="#7a8aa0"
        />

        <Text style={[styles.label, { color: props.theme.muted }]}>Library logo</Text>
        <Text style={[styles.noteSmall, { color: props.theme.subtext }]}>
          Optional. This logo appears in the top corner of the app.
        </Text>

        <View style={styles.logoRow}>
          <View style={styles.logoPreviewBox}>
            {props.logoDataUrl ? (
              <Image
                source={{ uri: props.logoDataUrl }}
                style={[styles.logoPreviewImage, { borderColor: props.theme.cardBorder }]}
                resizeMode="contain"
              />
            ) : (
              <View
                style={[
                  styles.logoPreviewImage,
                  { borderColor: props.theme.cardBorder, justifyContent: "center", alignItems: "center" },
                ]}
              >
                <DefaultBookLogo highlight={props.theme.highlight} />
              </View>
            )}
          </View>

          <View style={{ flex: 1 }}>
            <Text style={[styles.noteSmall, { color: props.theme.subtext }]}>{logoLabel}</Text>

            <View style={{ flexDirection: "row", gap: 10, marginTop: 10, flexWrap: "wrap" }}>
              <TouchableOpacity
                style={[
                  styles.smallBtn,
                  { borderColor: props.theme.accentBorder, backgroundColor: props.theme.inputBg, minWidth: 120 },
                ]}
                onPress={props.onUploadLogo}
              >
                <Text style={[styles.smallBtnText, { color: props.theme.text }]}>Upload logo</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.smallBtn,
                  { borderColor: props.theme.lightBorder, backgroundColor: props.theme.inputBg, minWidth: 120 },
                ]}
                onPress={props.onRemoveLogo}
              >
                <Text style={[styles.smallBtnText, { color: props.theme.text }]}>Remove logo</Text>
              </TouchableOpacity>
            </View>

<View style={{ flexDirection: "row", gap: 12, marginTop: 12 }}>
  <TouchableOpacity
    style={[
      styles.smallBtn,
      { borderColor: props.theme.lightBorder, backgroundColor: "transparent", flex: 1 },
    ]}
    onPress={() => router.push("/admin-collection")}
  >
    <Text style={[styles.smallBtnText, { color: props.theme.text }]}>Upload collection</Text>
  </TouchableOpacity>
</View>



            {Platform.OS !== "web" ? (
              <Text style={[styles.noteSmall, { color: props.theme.subtext, marginTop: 8 }]}>
                Logo upload is easiest on web. (Mobile upload can come later.)
              </Text>
            ) : null}
          </View>
        </View>

        <Text style={[styles.label, { color: props.theme.muted }]}>Main color</Text>
        <Text style={[styles.noteSmall, { color: props.theme.subtext }]}>
          Used for primary buttons and selected items.
        </Text>

        <View style={styles.rowWrap}>
          {(
            [
              "dark_blue",
              "classic_blue",
              "sky_blue",
              "forest_green",
              "cardinal_red",
              "pink",
              "purple",
              "slate",
              "gold_accent",
            ] as ThemeKey[]
          ).map((tk) => {
            const selected = props.mainThemeKey === tk;
            const tkTheme = buildTheme(tk, props.highlightKey);

            return (
              <TouchableOpacity
                key={tk}
                onPress={() => props.setMainThemeKey(tk)}
                style={[
                  styles.chip,
                  { borderColor: tkTheme.accentBorder, backgroundColor: props.theme.inputBg },
                  selected && { backgroundColor: tkTheme.accent, borderColor: tkTheme.accentBorder },
                ]}
              >
                <Text
                  style={[
                    styles.chipText,
                    { color: props.theme.text },
                    selected && { color: tkTheme.accentTextOn },
                  ]}
                >
                  {themeLabel(tk)}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <Text style={[styles.label, { color: props.theme.muted }]}>Highlight color</Text>
        <Text style={[styles.noteSmall, { color: props.theme.subtext }]}>
          Used for borders, the book icon, and the title divider.
        </Text>

        <View style={styles.rowWrap}>
          {(
            [
              "gold_accent",
              "white",
              "black",
              "silver",
              "dark_blue",
              "classic_blue",
              "sky_blue",
              "forest_green",
              "cardinal_red",
              "pink",
              "purple",
              "slate",
            ] as HighlightKey[]
          ).map((hk) => {
            const selected = props.highlightKey === hk;
            const hkTheme = buildTheme(props.mainThemeKey, hk);

            return (
              <TouchableOpacity
                key={hk}
                onPress={() => props.setHighlightKey(hk)}
                style={[
                  styles.chip,
                  { borderColor: hkTheme.lightBorder, backgroundColor: props.theme.inputBg },
                  selected && { backgroundColor: hkTheme.highlight, borderColor: hkTheme.lightBorder },
                ]}
              >
                <Text
                  style={[
                    styles.chipText,
                    { color: props.theme.text },
                    selected && { color: hkTheme.highlightTextOn },
                  ]}
                >
                  {highlightLabel(hk)}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <Text style={[styles.label, { color: props.theme.muted }]}>Title text color</Text>
        <Text style={[styles.noteSmall, { color: props.theme.subtext }]}>Used for the banner title (NovelIdeas / Library Name).</Text>

        <View style={styles.rowWrap}>
          {(["white", "black"] as TitleTextKey[]).map((tk) => {
            const selected = props.titleTextKey === tk;
            return (
              <TouchableOpacity
                key={tk}
                onPress={() => props.setTitleTextKey(tk)}
                style={[
                  styles.chip,
                  { borderColor: props.theme.lightBorder, backgroundColor: props.theme.inputBg },
                  selected && { backgroundColor: props.theme.highlight, borderColor: props.theme.lightBorder },
                ]}
              >
                <Text
                  style={[
                    styles.chipText,
                    { color: props.theme.text },
                    selected && { color: props.theme.highlightTextOn },
                  ]}
                >
                  {titleTextLabel(tk)}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        
        <View style={{ flexDirection: "row", gap: 10, marginTop: 12 }}>
          <TouchableOpacity
            style={[
              styles.smallBtn,
              { borderColor: props.theme.lightBorder, backgroundColor: props.theme.inputBg },
            ]}
            onPress={() => {
              // Default banner colors (canonical):
              // Dark background, yellow divider, white title text
              props.setMainThemeKey("dark_blue" as ThemeKey);
              props.setHighlightKey("gold_accent" as HighlightKey);
              props.setTitleTextKey("white" as TitleTextKey);
              props.setHasUnsavedChanges(true);
            }}
          >
            <Text style={[styles.smallBtnText, { color: props.theme.text }]}>Default</Text>
          </TouchableOpacity>
        </View>

<Text style={[styles.noteSmall, { color: props.theme.subtext }]}>
          All themes are designed for readability and accessibility.
        </Text>

        <View style={[styles.divider, { backgroundColor: props.theme.cardBorder }]} />

        {/* Recommendation source */}
<Text style={[styles.sectionTitle, { color: props.theme.text }]}>Recommendation Source</Text>

<Text style={[styles.noteSmall, { color: props.theme.subtext }]}>
  Toggle one or more sources. If all are off, recommendations will not run.
</Text>

<TouchableOpacity
  style={[styles.infoBtn, { borderColor: props.theme.cardBorder, backgroundColor: props.theme.inputBg }]}
  onPress={showSourceInfo}
>
  <Text style={[styles.infoBtnText, { color: props.theme.muted }]}>What does this mean?</Text>
</TouchableOpacity>

<View style={{ gap: 10 }}>
  <View style={styles.rowBetween}>
    <Text style={{ color: props.theme.text, fontWeight: "700" }}>Google Books</Text>
    <Switch
      value={props.sourceEnabled.googleBooks}
      onValueChange={(next) => props.setSourceEnabled("googleBooks", next)}
    />
  </View>
  <View style={styles.rowBetween}>
    <Text style={{ color: props.theme.text, fontWeight: "700" }}>Open Library</Text>
    <Switch
      value={props.sourceEnabled.openLibrary}
      onValueChange={(next) => props.setSourceEnabled("openLibrary", next)}
    />
  </View>
  <View style={styles.rowBetween}>
    <View>
      <Text style={{ color: props.theme.text, fontWeight: "700" }}>New York Times (limited)</Text>
      <Text style={[styles.noteSmall, { color: props.theme.subtext }]}>Injects at most 1–2 high-match anchors.</Text>
    </View>
    <Switch
      value={props.sourceEnabled.nyt}
      onValueChange={(next) => props.setSourceEnabled("nyt", next)}
    />
  </View>
  <View style={styles.rowBetween}>
    <View>
      <Text style={{ color: props.theme.text, fontWeight: "700" }}>This library’s collection</Text>
      {!props.localLibrarySupported ? (
        <Text style={[styles.noteSmall, { color: props.theme.subtext }]}>Not supported in this build yet.</Text>
      ) : null}
    </View>
    <Switch
      value={props.sourceEnabled.localLibrary && props.localLibrarySupported}
      disabled={!props.localLibrarySupported}
      onValueChange={(next) => props.setSourceEnabled("localLibrary", next)}
    />
  </View>
</View>

<Text style={[styles.label, { color: props.theme.muted, marginTop: 12 }]}>Per age band visual sources</Text>
{(["k2", "36", "ms_hs", "adult"] as DeckKey[]).map((dk) => (
  <View key={`visual-${dk}`} style={{ borderWidth: 1, borderColor: props.theme.lightBorder, borderRadius: 10, padding: 10 }}>
    <Text style={{ color: props.theme.text, fontWeight: "700", marginBottom: 8 }}>{deckLabel(dk)}</Text>
    <View style={styles.rowBetween}>
      <Text style={{ color: props.theme.text, fontWeight: "700" }}>Kitsu (Manga)</Text>
      <Switch value={props.deckSourceEnabled[dk]?.kitsu !== false} onValueChange={(next) => props.setSourceEnabledForDeck(dk, "kitsu", next)} />
    </View>
    <View style={styles.rowBetween}>
      <Text style={{ color: props.theme.text, fontWeight: "700" }}>ComicVine (Comics)</Text>
      <Switch value={props.deckSourceEnabled[dk]?.gcd !== false} onValueChange={(next) => props.setSourceEnabledForDeck(dk, "gcd", next)} />
    </View>
  </View>
))}

{!props.sourceEnabled.googleBooks &&
 !props.sourceEnabled.openLibrary &&
 !(props.sourceEnabled.localLibrary && props.localLibrarySupported) &&
 !props.sourceEnabled.kitsu &&
 !props.sourceEnabled.gcd &&
 !props.sourceEnabled.nyt ? (
  <Text style={[styles.noteSmall, { color: props.theme.danger, marginTop: 8 }]}>
    All recommendation sources are disabled. Enable at least one source before running recommendations.
  </Text>
) : null}


{SHOW_ADULT_KITSU_DEBUG_CONTROLS ? (
  <View style={[styles.rowBetween, { marginTop: 12 }]}>
    <View style={{ flex: 1, paddingRight: 12 }}>
      <Text style={{ color: props.theme.text, fontWeight: "700" }}>Force Adult Kitsu query: dystopian</Text>
      <Text style={[styles.noteSmall, { color: props.theme.subtext }]}>Hidden debug validation only. Applies only when Adult has Kitsu as the sole enabled source.</Text>
    </View>
    <Switch
      value={props.adultKitsuOnlyForceQueryForValidation === "dystopian"}
      onValueChange={props.setAdultKitsuOnlyForceQueryForValidation}
    />
  </View>
) : null}

{props.localLibrarySupported ? (
  <View style={{ marginTop: 10, gap: 10 }}>
    <Text style={[styles.noteSmall, { color: props.theme.subtext }]}>
      This mode recommends only titles your library has uploaded. Use the button below to upload or replace your collection.
    </Text>

    <TouchableOpacity
      style={[
        styles.smallBtn,
        { borderColor: props.theme.lightBorder, backgroundColor: props.theme.inputBg, alignSelf: "flex-start" },
      ]}
      onPress={() => router.push("/admin-collection")}
    >
      <Text style={[styles.smallBtnText, { color: props.theme.text }]}>Upload / Replace Collection</Text>
    </TouchableOpacity>
  </View>
) : null}

<View style={[styles.divider, { backgroundColor: props.theme.cardBorder }]} />

        {/* Decks */}
        <Text style={[styles.sectionTitle, { color: props.theme.text }]}>Decks</Text>
        <Text style={[styles.noteSmall, { color: props.theme.subtext }]}>
          Enabled decks: <Text style={[styles.bold, { color: props.theme.text }]}>{enabledList || "None"}</Text>
        </Text>

        {(["k2", "36", "ms_hs", "adult"] as DeckKey[]).map((dk) => (
          <View key={dk} style={styles.switchRow}>
            <Text style={[styles.switchLabel, { color: props.theme.text }]}>{deckLabel(dk)}</Text>
            <Switch value={!!props.enabledDecks[dk]} onValueChange={() => props.toggleDeck(dk)} />
          </View>
        ))}

        <View style={[styles.divider, { backgroundColor: props.theme.cardBorder }]} />

        <Text style={[styles.sectionTitle, { color: props.theme.text }]}>Swipe card types</Text>
        <Text style={[styles.noteSmall, { color: props.theme.subtext }]}>
          These control what appears in the swipe deck. Recommendations remain books-only.
        </Text>

        {([
          ["books", "Books"],
          ["movies", "Movies"],
          ["tv", "TV Shows"],
          ["games", "Games"],
          ["youtube", "YouTube"],
          ["anime", "Anime"],
          ["podcasts", "Podcasts"],
        ] as [SwipeCategoryKey, string][]).map(([k, label]) => (
          <View key={k} style={styles.switchRow}>
            <Text style={[styles.switchLabel, { color: props.theme.text }]}>{label}</Text>
            <Switch value={!!props.swipeCategories[k]} onValueChange={() => props.toggleSwipeCategory(k)} />
          </View>
        ))}

        <View style={[styles.divider, { backgroundColor: props.theme.cardBorder }]} />

        {/* Save */}
        <View style={styles.rowBetween}>
          <Text style={[styles.sectionTitle, { color: props.theme.text }]}>Save</Text>

          <TouchableOpacity style={[styles.saveBtnBase, props.saveButtonStyle]} onPress={props.onSaveSettings}>
            <Text style={styles.saveBtnText}>{props.saveButtonLabel}</Text>
          </TouchableOpacity>
        </View>

        <Text style={[styles.noteSmall, { color: props.theme.subtext }]}>
          If this downloads a file, replace your project’s{" "}
          <Text style={[styles.bold, { color: props.theme.text }]}>NovelIdeas.json</Text> with the downloaded one.
        </Text>


        {/* ADMIN LOCK */}
        <Text style={[styles.sectionTitle, { color: props.theme.text }]}>Admin Lock</Text>

        <Text style={[styles.noteSmall, { color: props.theme.subtext }]}>
          If enabled, a 6-digit PIN is required to open Admin (via the 7 taps). Normal app use never requires a PIN.
        </Text>

        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 10 }}>
          <Text style={[styles.label, { color: props.theme.muted }]}>Require 6-digit PIN</Text>
          <TouchableOpacity
            style={[
              styles.smallBtn,
              {
                minWidth: 110,
                borderColor: props.theme.lightBorder,
                backgroundColor: props.adminPinEnabled ? props.theme.highlight : props.theme.inputBg,
              },
            ]}
            onPress={() => {
              const next = !props.adminPinEnabled;
              props.setAdminPinEnabled(next);
              if (!next) {
                props.clearAdminPin();
              }
            }}
          >
            <Text
              style={[
                styles.smallBtnText,
                { color: props.adminPinEnabled ? props.theme.accentTextOn : props.theme.text },
              ]}
            >
              {props.adminPinEnabled ? "On" : "Off"}
            </Text>
          </TouchableOpacity>
        </View>

        <Text style={[styles.label, { color: props.theme.muted, marginTop: 10 }]}>Admin PIN (6 digits)</Text>
        <TextInput
          value={props.adminPin}
          onChangeText={(t) => props.setAdminPin(t.replace(/\D/g, "").slice(0, 6))}
          placeholder="Set PIN"
          placeholderTextColor={props.theme.muted}
          keyboardType="number-pad"
          maxLength={6}
          secureTextEntry
          style={[
            styles.input,
            { backgroundColor: props.theme.inputBg, borderColor: props.theme.inputBorder, color: props.theme.text },
          ]}
        />

        <View style={{ flexDirection: "row", gap: 10, marginTop: 10, flexWrap: "wrap", alignItems: "center" }}>
          <TouchableOpacity
            style={[styles.smallBtn, { borderColor: props.theme.lightBorder, backgroundColor: props.theme.inputBg }]}
            onPress={props.clearAdminPin}
          >
            <Text style={[styles.smallBtnText, { color: props.theme.text }]}>Clear PIN</Text>
          </TouchableOpacity>

          {props.adminPinEnabled && props.adminPin.length !== 6 ? (
            <Text style={[styles.noteSmall, { color: props.theme.subtext, marginTop: 2 }]}>
              PIN must be exactly 6 digits to take effect.
            </Text>
          ) : (
            <Text style={[styles.noteSmall, { color: props.theme.subtext, marginTop: 2 }]}> </Text>
          )}
        </View>

        {/* SHARE / QR CODE */}
        <View style={[styles.divider, { backgroundColor: props.theme.cardBorder }]} />

        <Text style={[styles.sectionTitle, { color: props.theme.text }]}>Share this library</Text>
        <Text style={[styles.noteSmall, { color: props.theme.subtext }]}>
          This QR code is specific to this library. Scanning it can open NovelIdeas and load this library (import flow coming next).
        </Text>

        <Text style={[styles.label, { color: props.theme.muted }]}>Library ID</Text>
        <TextInput
          style={[
            styles.input,
            { backgroundColor: props.theme.inputBg, borderColor: props.theme.inputBorder, color: props.theme.text },
          ]}
          value={props.libraryId}
          onChangeText={(t) => props.setLibraryId((t || "").replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 40))}
          placeholder="e.g., yvhs-001"
          placeholderTextColor="#7a8aa0"
          autoCapitalize="none"
          autoCorrect={false}
        />

        <View style={{ flexDirection: "row", gap: 10, marginTop: 10, flexWrap: "wrap" }}>
          <TouchableOpacity
            style={[
              styles.smallBtn,
              { borderColor: props.theme.accentBorder, backgroundColor: props.theme.inputBg, minWidth: 160 },
            ]}
            onPress={() => {
              if (props.libraryId && props.libraryId.length >= 6) {
                // already set
                return;
              }
              const id = `lib-${Math.random().toString(36).slice(2, 8)}-${Math.random()
                .toString(36)
                .slice(2, 8)}`;
              props.setLibraryId(id);
              Alert.alert("Library ID created", "A unique Library ID was generated. Be sure to Save Settings.");
            }}
          >
            <Text style={[styles.smallBtnText, { color: props.theme.text }]}>Generate Library ID</Text>
          </TouchableOpacity>
        </View>

        <View style={{ alignItems: "center", marginTop: 16 }}>
          {props.libraryId && props.libraryId.length >= 6 ? (
            <>
              <View
                style={{
                  padding: 14,
                  borderRadius: 16,
                  borderWidth: 1,
                  borderColor: props.theme.cardBorder,
                  backgroundColor: "#071526",
                }}
              >
                <QRCode
                  value={`https://novelideas.app/${encodeURIComponent(props.libraryId)}`}
                  size={220}
                />
              </View>

              <Text style={[styles.noteSmall, { color: props.theme.subtext, marginTop: 10, textAlign: "center" }]}>
                Encoded link:
              </Text>
              <Text selectable style={[styles.jsonText, { color: props.theme.subtext, textAlign: "center" }]}>
                {`https://novelideas.app/${props.libraryId}`}
              </Text>

              <Text style={[styles.noteSmall, { color: props.theme.subtext, marginTop: 10, textAlign: "center" }]}>
                Note: this is a hosted-config link (Option C). The app-side auto-import will be implemented next.
              </Text>
            </>
          ) : (
            <Text style={[styles.noteSmall, { color: props.theme.subtext, textAlign: "center" }]}>
              Set a Library ID (or generate one) to create a QR code.
            </Text>
          )}
        </View>

        <Text style={[styles.sectionTitle, { color: props.theme.text }]}>Preview (copyable)</Text>
        <View style={[styles.jsonBox, { borderColor: props.theme.cardBorder, backgroundColor: "#071526" }]}>
          <Text selectable style={[styles.jsonText, { color: props.theme.subtext }]}>
            {props.configPreview}
          </Text>
        </View>
      </View>
        {/* Desktop Admin & Import */}
        <View style={{ marginTop: 18 }}>
          <Text style={[styles.sectionTitle, { color: props.theme.text }]}>
            Desktop Admin & Import
          </Text>
          <Text style={[styles.note, { color: props.theme.subtext }]}>
            Use Desktop Admin on the web for logo upload and full editing. Import settings to this phone by pasting JSON.
          </Text>

          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 10 }}>
            <TouchableOpacity
              style={[styles.smallBtn, { borderColor: props.theme.accentBorder, backgroundColor: props.theme.inputBg }]}
              onPress={() => {
                if (Platform.OS === "web") {
                  window.open("/admin-web", "_blank");
                } else {
                  Alert.alert(
                    "Desktop Admin",
                    "Open the web version of NovelIdeas on a desktop and visit /admin-web to edit settings and generate JSON."
                  );
                }
              }}
            >
              <Text style={[styles.smallBtnText, { color: props.theme.text }]}>
                Open Desktop Admin
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.smallBtn, { borderColor: props.theme.lightBorder, backgroundColor: props.theme.inputBg }]}
              onPress={() => {
                setImportModalVisible(true);
              }}
            >
              <Text style={[styles.smallBtnText, { color: props.theme.text }]}>
                Import (Paste JSON)
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        <Modal
          transparent
          animationType="fade"
          visible={importModalVisible}
          onRequestClose={() => setImportModalVisible(false)}
        >
          <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "center", padding: 18 }}>
            <View
              style={{
                backgroundColor: props.theme.cardBg,
                borderColor: props.theme.lightBorder,
                borderWidth: 2,
                borderRadius: 16,
                padding: 14,
                maxWidth: 760,
                width: "100%",
                alignSelf: "center",
              }}
            >
              <Text style={{ color: props.theme.text, fontWeight: "900", fontSize: 16 }}>
                Import settings (paste JSON)
              </Text>
              <Text style={{ color: props.theme.subtext, marginTop: 6, lineHeight: 18 }}>
                On Desktop Admin, click “Copy JSON”, then paste it here. (iPhone Camera often won’t open raw JSON QRs.)
              </Text>

              <TextInput
                style={{
                  marginTop: 12,
                  backgroundColor: props.theme.inputBg,
                  borderColor: props.theme.inputBorder,
                  borderWidth: 1,
                  borderRadius: 12,
                  padding: 10,
                  minHeight: 180,
                  color: props.theme.text,
                  fontWeight: "700",
                }}
                value={importText}
                onChangeText={setImportText}
                placeholder="Paste JSON here…"
                placeholderTextColor="#7a8aa0"
                multiline
                autoCapitalize="none"
                autoCorrect={false}
              />

              <View style={{ flexDirection: "row", justifyContent: "flex-end", gap: 10, marginTop: 12, flexWrap: "wrap" }}>
                <TouchableOpacity
                  style={[styles.smallBtn, { borderColor: props.theme.lightBorder, backgroundColor: props.theme.inputBg }]}
                  onPress={() => {
                    setImportModalVisible(false);
                    setImportText("");
                  }}
                >
                  <Text style={[styles.smallBtnText, { color: props.theme.text }]}>Cancel</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.smallBtn, { borderColor: props.theme.accentBorder, backgroundColor: props.theme.inputBg }]}
                  onPress={() => applyImportedConfig(importText)}
                >
                  <Text style={[styles.smallBtnText, { color: props.theme.text }]}>Apply</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>

    </ScrollView>
  );
}

export function HomeScreen(props: { libraryId?: string } = {}) {
  const pwaInstall = usePwaInstall();
  const [mode, setMode] = useState<"swipe" | "search">("swipe");
  const [patronId, setPatronId] = useState(() => {
    if (Platform.OS !== "web" || typeof localStorage === "undefined") return "";
    return readOrCreatePatronId(localStorage);
  });
  const [patronIdentityReady, setPatronIdentityReady] = useState(Platform.OS === "web");

  const [tapCount, setTapCount] = useState(0);
  const [showAdminPinPrompt, setShowAdminPinPrompt] = useState(false);
  const [adminPinEntry, setAdminPinEntry] = useState("");
  const [adminPinError, setAdminPinError] = useState<string | null>(null);
  const [adminUnlocked, setAdminUnlocked] = useState(false);
  const [showHeaderMenu, setShowHeaderMenu] = useState(false);
  const [showMyList, setShowMyList] = useState(false);
  const [patronCustomization, setPatronCustomization] = useState<PatronCustomization>({});
  const [myList, setMyList] = useState<SavedRecommendation[]>([]);
  const myListRef = useRef<SavedRecommendation[]>([]);
  const myListScopeRef = useRef("");
  const myListMutationVersionRef = useRef(0);
  const myListWriteQueueRef = useRef<Promise<void>>(Promise.resolve());
  const [savedLibraries, setSavedLibraries] = useState<SavedLibrary[]>(() => {
    try {
      return readPatronLibraries(typeof localStorage === "undefined" ? null : localStorage);
    } catch {
      return [];
    }
  });

  useEffect(() => {
    if (Platform.OS === "web") return;
    let cancelled = false;
    void readOrCreatePatronIdAsync(AsyncStorage).then((storedPatronId) => {
      if (!cancelled) {
        setPatronId(storedPatronId);
        setPatronIdentityReady(true);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!patronIdentityReady || !patronId) return;
    let cancelled = false;
    myListRef.current = [];
    setMyList([]);
    async function loadMyList() {
      try {
        const items = Platform.OS === "web" && typeof localStorage !== "undefined"
          ? readPatronMyList(localStorage, patronId, props.libraryId)
          : await readPatronMyListAsync(AsyncStorage, patronId, props.libraryId);
        if (!cancelled) {
          myListRef.current = items;
          setMyList(items);
        }
      } catch (error) {
        console.error("Failed to load patron My List:", error);
        if (!cancelled) {
          myListRef.current = [];
          setMyList([]);
        }
      }
    }
    void loadMyList();
    return () => {
      cancelled = true;
    };
  }, [patronId, patronIdentityReady, props.libraryId]);

  const [config, setConfig] = useState<any>(() => {
    // Check if a library-specific config is saved in localStorage
    if (props.libraryId) {
      try {
        for (const candidateId of libraryIdReadCandidates(props.libraryId)) {
          const saved = localStorage.getItem(`lib_config_${candidateId}`);
          if (saved) {
            if (candidateId !== props.libraryId) {
              localStorage.setItem(`lib_config_${props.libraryId}`, saved);
            }
            const parsed = JSON.parse(saved);
            syncSchema(parsed);
            return parsed;
          }
        }
      } catch (e) {
        console.error(`Failed to load config for library ${props.libraryId}:`, e);
      }
    }

    // Root route always starts from the default config file.
    // Admin draft state never determines the public root configuration.
    const init = deepClone(configFile);
    syncSchema(init);

    // First-run default: empty library name so branding shows "Novel | Ideas"
    // until an admin sets a library name (import or admin).
    if (init?.library) init.library.name = "";
    if (init?.branding) init.branding.libraryName = "";

    return init;
  });
  const [personalizedConfigLoading, setPersonalizedConfigLoading] = useState(Boolean(props.libraryId));
  const [personalizedConfigError, setPersonalizedConfigError] = useState(false);
  const [personalizedConfigDiagnostics, setPersonalizedConfigDiagnostics] = useState<SharedLibraryConfigLoadDiagnostics | null>(null);
  const [showPersonalizedConfigDiagnostics, setShowPersonalizedConfigDiagnostics] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  const [deck, setDeck] = useState<DeckKey>("ms_hs");
  const [query, setQuery] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [results, setResults] = useState<ManualSearchResult[]>([]);
  const [currentResultIndex, setCurrentResultIndex] = useState(0);
  const [manualSearchSource, setManualSearchSource] = useState<SourceKey>(
    props.libraryId && config?.recommendations?.localLibrarySupported ? "local_collection" : "open_library"
  );

  useEffect(() => {
    if (!props.libraryId) {
      setRuntimeLibraryId("");
      setRuntimeLibraryName("");
      setPersonalizedConfigLoading(false);
      setPersonalizedConfigError(false);
      setPersonalizedConfigDiagnostics(null);
      setShowPersonalizedConfigDiagnostics(false);
      return;
    }

    let cancelled = false;
    setPersonalizedConfigLoading(true);
    setPersonalizedConfigError(false);
    setShowPersonalizedConfigDiagnostics(false);

    async function loadSharedConfig() {
      try {
        const diagnosticsEnabled = isAdminSessionActive() || isPreviewAcceptanceEnvironmentEnabled();
        const result = await loadSharedLibraryConfigWithDiagnostics(props.libraryId as string, diagnosticsEnabled);
        const shared = result.config;
        if (cancelled) return;
        setPersonalizedConfigDiagnostics(result.diagnostics);
        if (shared) {
          const next = deepClone(shared);
          syncSchema(next);
          const configuredLibraryName = String(next?.branding?.libraryName ?? next?.library?.name ?? "").trim();
          if (configuredLibraryName) {
            setRuntimeLibraryName(configuredLibraryName);
            try {
              setSavedLibraries(rememberPatronLibrary(
                typeof localStorage === "undefined" ? null : localStorage,
                { libraryId: props.libraryId as string, libraryName: configuredLibraryName },
              ));
            } catch {}
          }
          setConfig(next);
        } else {
          setPersonalizedConfigError(true);
        }
      } catch {
        if (!cancelled) setPersonalizedConfigError(true);
      } finally {
        if (!cancelled) setPersonalizedConfigLoading(false);
      }
    }

    void loadSharedConfig();
    return () => {
      cancelled = true;
    };
  }, [props.libraryId]);

  // Keep a stable ref to avoid weird focus behavior from accidental remounts.
  const queryInputRef = useRef<TextInput | null>(null);
  const manualSearchRequestRef = useRef(0);
  const ownerLogoTapCountRef = useRef(0);
  const ownerLogoResetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    return () => {
      if (ownerLogoResetTimerRef.current) clearTimeout(ownerLogoResetTimerRef.current);
    };
  }, []);
  // Stable references: both objects are built from config so they must be memoized;
  // otherwise a new object literal on every render causes the deck to reshuffle mid-session.
  const libraryEnabledDecks = useMemo(
    () => config?.enabledDecks ?? config?.decks?.enabled ?? {},
    [config]
  );
  const availablePatronAgeBands = useMemo(
    () => normalizeAvailableAgeBands(libraryEnabledDecks),
    [libraryEnabledDecks],
  );
  const enabledDecks = useMemo(
    () => effectivePatronAgeBands(availablePatronAgeBands, patronCustomization.ageBands ?? null),
    [availablePatronAgeBands, patronCustomization.ageBands],
  );
  useFocusEffect(useCallback(() => {
    if (!patronIdentityReady || !patronId) return undefined;
    let cancelled = false;
    async function loadCustomization() {
      try {
        const legacyAgeBands = Platform.OS === "web" && typeof localStorage !== "undefined"
          ? readPatronAgePreferences(localStorage, patronId, props.libraryId, availablePatronAgeBands)
          : await readPatronAgePreferencesAsync(AsyncStorage, patronId, props.libraryId, availablePatronAgeBands);
        const customization = Platform.OS === "web" && typeof localStorage !== "undefined"
          ? readPatronCustomization(localStorage, patronId, props.libraryId, legacyAgeBands)
          : await readPatronCustomizationAsync(AsyncStorage, patronId, props.libraryId, legacyAgeBands);
        if (!cancelled) setPatronCustomization(customization);
      } catch (error) {
        console.error("Failed to load patron customization:", error);
        if (!cancelled) setPatronCustomization({});
      }
    }
    void loadCustomization();
    return () => {
      cancelled = true;
    };
  }, [availablePatronAgeBands, patronId, patronIdentityReady, props.libraryId]));
  useEffect(() => {
    if (enabledDecks[deck]) return;
    const firstEnabledDeck = (["k2", "36", "ms_hs", "adult"] as DeckKey[])
      .find((deckKey) => !!enabledDecks[deckKey]);
    if (firstEnabledDeck) setDeck(firstEnabledDeck);
  }, [deck, enabledDecks]);
  const librarySwipeCategories: SwipeCategories = useMemo(
    () => normalizeAvailableSwipeCategories(config?.swipe?.categories ?? {}),
    [config?.swipe?.categories],
  );
  const swipeCategories: SwipeCategories = useMemo(
    () => effectivePatronSwipeCategories(librarySwipeCategories, patronCustomization.swipeCategories),
    [librarySwipeCategories, patronCustomization.swipeCategories],
  );
  const runtimeLibraryName = props.libraryId ? getRuntimeLibraryName() : "";
  const hostedBranding = useMemo(() => resolveHostedBranding(config), [config]);
  const inheritedLibraryName = useMemo(
    () => hostedBranding.libraryName || runtimeLibraryName || "",
    [hostedBranding.libraryName, runtimeLibraryName]
  );

  
  const libraryId = useMemo(() => config?.library?.id ?? "", [config]);
  const recommendationSourceSettings = useMemo(
    () => resolveRecommendationSourceSettings(config),
    [config]
  );
  const sourceEnabled = recommendationSourceSettings.sourceEnabled;
  const deckSourceEnabled: Record<DeckKey, RecommendationSourceEnabled> = {
    k2: { ...sourceEnabled, ...(config?.recommendations?.sourceEnabledByDeck?.k2 || {}) },
    "36": { ...sourceEnabled, ...(config?.recommendations?.sourceEnabledByDeck?.["36"] || {}) },
    ms_hs: { ...sourceEnabled, ...(config?.recommendations?.sourceEnabledByDeck?.ms_hs || {}) },
    adult: { ...sourceEnabled, ...(config?.recommendations?.sourceEnabledByDeck?.adult || {}) },
  };
  const localLibrarySupported = recommendationSourceSettings.localLibrarySupported;
  const adultKitsuOnlyForceQueryForValidation = config?.recommendations?.adultKitsuOnlyForceQueryForValidation === "dystopian" ? "dystopian" : "";
  const source: SourceKey = manualSearchSource;

  useEffect(() => {
    manualSearchRequestRef.current += 1;
    setLoading(false);
    setResults([]);
    setCurrentResultIndex(0);
    setErrorMsg(null);
    setManualSearchSource(
      props.libraryId && localLibrarySupported ? "local_collection" : "open_library"
    );
  }, [props.libraryId, localLibrarySupported]);

  // Branding state from config (with safe defaults and support for saved hex colors).
  const { mainThemeKey, highlightKey, titleTextKey, mainColorHex, highlightColorHex, fontColorHex } = hostedBranding;
  const libraryLogoDataUrl: string | null = config?.branding?.logoDataUrl ?? null;
  const effectiveAppearance = useMemo(
    () => resolvePatronAppearance({
      name: inheritedLibraryName,
      logoDataUrl: libraryLogoDataUrl,
      mainColorHex,
      highlightColorHex,
      fontColorHex,
    }, patronCustomization.appearance),
    [fontColorHex, highlightColorHex, inheritedLibraryName, libraryLogoDataUrl, mainColorHex, patronCustomization.appearance],
  );
  const libraryName = effectiveAppearance.name;
  const logoDataUrl = effectiveAppearance.logoDataUrl;

  useEffect(() => {
    updatePwaDocumentBranding(props.libraryId, libraryName, mainColorHex, logoDataUrl);
  }, [libraryName, logoDataUrl, mainColorHex, props.libraryId]);

  const buildResolvedTheme = useCallback((resolvedMain: string, resolvedHighlight: string, resolvedFont: string) => {
    const presetTheme = buildTheme(mainThemeKey, highlightKey, titleTextKey);
    const accentTextOn = autoChooseFontColor(resolvedMain);
    const highlightTextOn = autoChooseFontColor(resolvedHighlight);
    return {
      ...presetTheme,
      accent: resolvedMain,
      accentBorder: resolvedMain,
      accentTextOn,
      highlight: resolvedHighlight,
      lightBorder: resolvedHighlight,
      highlightBg: resolvedHighlight,
      highlightTextOn,
      highlightText: highlightTextOn,
      titleText: resolvedFont,
    };
  }, [highlightKey, mainThemeKey, titleTextKey]);
  const libraryTheme = useMemo(
    () => buildResolvedTheme(mainColorHex, highlightColorHex, fontColorHex),
    [buildResolvedTheme, fontColorHex, highlightColorHex, mainColorHex],
  );
  const theme = useMemo(
    () => buildResolvedTheme(
      effectiveAppearance.mainColorHex,
      effectiveAppearance.highlightColorHex,
      effectiveAppearance.fontColorHex,
    ),
    [buildResolvedTheme, effectiveAppearance.fontColorHex, effectiveAppearance.highlightColorHex, effectiveAppearance.mainColorHex],
  );
  useEffect(() => {
    if (Platform.OS === "web") applyWebHighlightColor(theme.highlight);
  }, [theme.highlight]);

  const adminPinEnabled: boolean = !!config?.admin?.pinEnabled;
  const adminPin: string = typeof config?.admin?.pin === "string" ? config.admin.pin : "";
  const adminPinReady: boolean = adminPinEnabled && /^\d{6}$/.test(adminPin);

  
const configPreview = useMemo(() => JSON.stringify(config, null, 2), [config]);
  const diagnosticsVisibleForUser = isAdminSessionActive() || isPreviewAcceptanceEnvironmentEnabled();

  if (props.libraryId && personalizedConfigLoading) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: theme.appBg, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator color={theme.highlight} />
        <Text style={{ color: theme.text, fontWeight: "900", marginTop: 12 }}>Loading your library…</Text>
      </SafeAreaView>
    );
  }

  if (props.libraryId && personalizedConfigError) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: theme.appBg, alignItems: "center", justifyContent: "center", paddingHorizontal: 28 }}>
        <Text style={{ color: theme.text, fontWeight: "900", fontSize: 18, textAlign: "center", marginBottom: 10 }}>
          This library's configuration could not be loaded.
        </Text>
        <Text style={{ color: theme.subtext ?? theme.muted, fontSize: 14, textAlign: "center", marginBottom: 24 }}>
          Library: {props.libraryId}
        </Text>
        {diagnosticsVisibleForUser ? (
          <TouchableOpacity
            onPress={() => setShowPersonalizedConfigDiagnostics((v) => !v)}
            style={{
              borderColor: theme.lightBorder,
              borderWidth: 1,
              paddingHorizontal: 16,
              paddingVertical: 8,
              borderRadius: 8,
              marginBottom: 12,
            }}
          >
            <Text style={{ color: theme.text, fontWeight: "800" }}>
              {showPersonalizedConfigDiagnostics ? "Hide Diagnostics" : "Diagnostics"}
            </Text>
          </TouchableOpacity>
        ) : null}
        {diagnosticsVisibleForUser && showPersonalizedConfigDiagnostics && personalizedConfigDiagnostics ? (
          <View
            style={{
              width: "100%",
              borderColor: theme.cardBorder,
              borderWidth: 1,
              borderRadius: 10,
              padding: 12,
              marginBottom: 12,
              backgroundColor: theme.cardBg,
            }}
          >
            <Text style={{ color: theme.subtext, fontSize: 12 }}>Path: {personalizedConfigDiagnostics.pathname || "n/a"}</Text>
            <Text style={{ color: theme.subtext, fontSize: 12 }}>Library ID: {personalizedConfigDiagnostics.libraryId || "n/a"}</Text>
            <Text style={{ color: theme.subtext, fontSize: 12 }}>Status: {String(personalizedConfigDiagnostics.httpStatus ?? "n/a")}</Text>
            <Text style={{ color: theme.subtext, fontSize: 12 }}>Error: {personalizedConfigDiagnostics.appErrorCode || "n/a"}</Text>
            <Text style={{ color: theme.subtext, fontSize: 12 }}>Correlation: {personalizedConfigDiagnostics.correlationId}</Text>
            <Text style={{ color: theme.subtext, fontSize: 12 }}>Time: {personalizedConfigDiagnostics.timestamp}</Text>
            {personalizedConfigDiagnostics.backend ? (
              <Text style={{ color: theme.subtext, fontSize: 12 }}>Backend: {personalizedConfigDiagnostics.backend}</Text>
            ) : null}
            {personalizedConfigDiagnostics.configPath ? (
              <Text style={{ color: theme.subtext, fontSize: 12 }}>Config path: {personalizedConfigDiagnostics.configPath}</Text>
            ) : null}
            {personalizedConfigDiagnostics.exists !== null ? (
              <Text style={{ color: theme.subtext, fontSize: 12 }}>
                Exists: {personalizedConfigDiagnostics.exists ? "true" : "false"} | Readable:{" "}
                {personalizedConfigDiagnostics.readable ? "true" : "false"} | Valid JSON:{" "}
                {personalizedConfigDiagnostics.validJson ? "true" : "false"} | Valid config:{" "}
                {personalizedConfigDiagnostics.validConfig ? "true" : "false"}
              </Text>
            ) : null}
          </View>
        ) : null}
        <TouchableOpacity
          onPress={() => {
            setPersonalizedConfigError(false);
            setPersonalizedConfigLoading(true);
            setShowPersonalizedConfigDiagnostics(false);
            const diagnosticsEnabled = isAdminSessionActive() || isPreviewAcceptanceEnvironmentEnabled();
            loadSharedLibraryConfigWithDiagnostics(props.libraryId as string, diagnosticsEnabled).then((result) => {
              const shared = result.config;
              setPersonalizedConfigDiagnostics(result.diagnostics);
              if (shared) {
                const next = deepClone(shared);
                syncSchema(next);
                setConfig(next);
              } else {
                setPersonalizedConfigError(true);
              }
            }).catch(() => {
              setPersonalizedConfigError(true);
            }).finally(() => {
              setPersonalizedConfigLoading(false);
            });
          }}
          style={{ backgroundColor: theme.highlight, paddingHorizontal: 28, paddingVertical: 12, borderRadius: 8 }}
        >
          <Text style={{ color: "#fff", fontWeight: "900", fontSize: 16 }}>Retry</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  if (!adminUnlocked && showAdminPinPrompt) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: theme.appBg }}>
        <View
          style={{
            height: 56,
            paddingHorizontal: 16,
            flexDirection: "row",
            alignItems: "center",
          }}
        >
          <TouchableOpacity
            onPress={() => {
              setShowAdminPinPrompt(false);
              setAdminPinEntry("");
              setAdminPinError(null);
            }}
            style={{ flexDirection: "row", alignItems: "center" }}
          >
            <Text style={{ color: theme.accent, fontSize: 18, fontWeight: "900", marginRight: 10 }}>←</Text>
            <Text style={{ color: theme.text, fontWeight: "900", fontSize: 16 }}>NovelIdeas</Text>
          </TouchableOpacity>
        </View>

        <View style={{ flex: 1, justifyContent: "center", alignItems: "center", paddingHorizontal: 20, paddingBottom: 56 }}>
          <View
            style={{
              width: "100%",
              maxWidth: 420,
              backgroundColor: theme.cardBg,
              borderColor: theme.cardBorder,
              borderWidth: 1,
              borderRadius: 16,
              padding: 20,
            }}
          >
            <Text style={[styles.sectionTitle, { color: theme.text, textAlign: "center", marginTop: 0 }]}>
              Enter Admin PIN
            </Text>

            <Text style={[styles.noteSmall, { color: theme.subtext, textAlign: "center", marginTop: 8 }]}>
              Admin is locked. Enter the 6-digit PIN to continue.
            </Text>

            <TextInput
              style={[
                styles.input,
                {
                  backgroundColor: theme.inputBg,
                  borderColor: theme.inputBorder,
                  color: theme.text,
                  textAlign: "center",
                  letterSpacing: 6,
                },
              ]}
              value={adminPinEntry}
              onChangeText={(t) => {
                const digitsOnly = (t || "").replace(/\D+/g, "").slice(0, 6);
                setAdminPinEntry(digitsOnly);
                setAdminPinError(null);
              }}
              keyboardType="number-pad"
              placeholder="______"
              placeholderTextColor="#7a8aa0"
              maxLength={6}
              secureTextEntry
            />

            {adminPinError ? (
              <Text style={[styles.noteSmall, { color: theme.danger, textAlign: "center", marginTop: 8 }]}>
                {adminPinError}
              </Text>
            ) : null}

            <View style={{ flexDirection: "row", justifyContent: "center", gap: 10, marginTop: 14 }}>
              <TouchableOpacity
                style={{
                  paddingVertical: 10,
                  paddingHorizontal: 18,
                  borderRadius: 12,
                  borderWidth: 1,
                  borderColor: theme.lightBorder,
                  backgroundColor: "transparent",
                }}
                onPress={() => {
                  setShowAdminPinPrompt(false);
                  setAdminPinEntry("");
                  setAdminPinError(null);
                }}
              >
                <Text style={{ color: theme.text, fontWeight: "900" }}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={{
                  paddingVertical: 10,
                  paddingHorizontal: 18,
                  borderRadius: 12,
                  borderWidth: 1,
                  borderColor: theme.accentBorder,
                  backgroundColor: theme.accent,
                }}
                onPress={() => {
                  if (adminPinEntry.length !== 6) {
                    setAdminPinError("Please enter all 6 digits.");
                    return;
                  }
                  if (adminPinEntry !== adminPin) {
                    setAdminPinError("Incorrect PIN.");
                    return;
                  }
                  setShowAdminPinPrompt(false);
                  setAdminPinEntry("");
                  setAdminPinError(null);
                  if (Platform.OS === "web") {
                    const adminRoute = props.libraryId
                      ? `/app_admin-web?libraryId=${encodeURIComponent(String(props.libraryId))}`
                      : "/app_admin-web";
                    router.push(adminRoute as any);
                  } else {
                    setAdminUnlocked(true);
                  }
                }}
              >
                <Text style={{ color: theme.accentTextOn, fontWeight: "900" }}>Unlock</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </SafeAreaView>
    );
  }


  function openAdminEntry(source: "menu" | "easter_egg" = "menu") {
    const unlockMenu = source === "easter_egg";
    if (adminPinReady) {
      setAdminPinEntry("");
      setAdminPinError(null);
      setShowAdminPinPrompt(true);
      setTapCount(0);
      return;
    }

    if (Platform.OS === "web") {
      try {
        const adminRoute = props.libraryId
          ? `/app_admin-web?libraryId=${encodeURIComponent(String(props.libraryId))}`
          : "/app_admin-web";
        router.push(adminRoute as any);
        return;
      } catch {}
    }

    setAdminUnlocked(true);
    setTapCount(0);
  }

  function handleTitleTap() {
    const next = tapCount + 1;
    setTapCount(next);
    if (next >= 7) {
      openAdminEntry("easter_egg");
    }
  }

  function handleOwnerLogoTap() {
    ownerLogoTapCountRef.current += 1;
    if (ownerLogoResetTimerRef.current) clearTimeout(ownerLogoResetTimerRef.current);
    ownerLogoResetTimerRef.current = setTimeout(() => {
      ownerLogoTapCountRef.current = 0;
      ownerLogoResetTimerRef.current = null;
    }, 3000);

    if (ownerLogoTapCountRef.current < 7) return;
    ownerLogoTapCountRef.current = 0;
    if (ownerLogoResetTimerRef.current) clearTimeout(ownerLogoResetTimerRef.current);
    ownerLogoResetTimerRef.current = null;
    router.push("/admin/human-review" as any);
  }

  function toggleHeaderMenu() {
    setShowHeaderMenu((prev) => !prev);
  }

  function closeHeaderMenu() {
    setShowHeaderMenu(false);
  }

  function openInfoScreen(path: string) {
    closeHeaderMenu();
    router.push(path as any);
  }

  function openTestingInvite() {
    closeHeaderMenu();
    router.push({
      pathname: "/testing",
      params: {
        intro: "1",
        returnTo: props.libraryId ? `/${encodeURIComponent(props.libraryId)}` : "/",
      },
    } as any);
  }

  function openDeveloperTip() {
    closeHeaderMenu();
    Linking.openURL("https://venmo.com/u/ken-bragg").catch(() => {
      Alert.alert("Unable to open Venmo", "Visit venmo.com/u/ken-bragg to tip the developer.");
    });
  }

  function installNovelIdeas() {
    closeHeaderMenu();
    void pwaInstall.install();
  }

  function openMyList() {
    closeHeaderMenu();
    setShowMyList(true);
  }

  function openPatronPreferences() {
    closeHeaderMenu();
    router.push({
      pathname: "/customize-my-experience",
      params: props.libraryId ? { libraryId: props.libraryId } : {},
    } as any);
  }

  async function persistMyList(items: SavedRecommendation[]) {
    if (Platform.OS === "web" && typeof localStorage !== "undefined") {
      writePatronMyList(localStorage, patronId, props.libraryId, items);
      return;
    }
    await writePatronMyListAsync(AsyncStorage, patronId, props.libraryId, items);
  }

  myListScopeRef.current = patronMyListStorageKey(patronId, props.libraryId);

  function queueMyListWrite(
    nextItems: SavedRecommendation[],
    previousItems: SavedRecommendation[],
    scopeKey: string,
    mutationVersion: number,
    errorTitle: string,
    errorMessage: string,
  ) {
    myListWriteQueueRef.current = myListWriteQueueRef.current
      .catch(() => undefined)
      .then(() => persistMyList(nextItems))
      .catch((error) => {
        console.error(`${errorTitle}:`, error);
        if (
          myListScopeRef.current === scopeKey &&
          myListMutationVersionRef.current === mutationVersion
        ) {
          myListRef.current = previousItems;
          setMyList(previousItems);
        }
        Alert.alert(errorTitle, errorMessage);
      });
  }

  async function saveRecommendationToMyList(item: SavedRecommendation): Promise<boolean> {
    const previousItems = myListRef.current;
    const result = addSavedRecommendation(previousItems, item);
    if (!result.added) return false;
    const mutationVersion = ++myListMutationVersionRef.current;
    const scopeKey = myListScopeRef.current;
    myListRef.current = result.items;
    setMyList(result.items);
    queueMyListWrite(
      result.items,
      previousItems,
      scopeKey,
      mutationVersion,
      "Unable to save",
      "This recommendation could not be added to My List.",
    );
    return true;
  }

  function removeRecommendationFromMyList(itemId: string) {
    const previousItems = myListRef.current;
    const nextItems = removeSavedRecommendation(previousItems, itemId);
    if (nextItems.length === previousItems.length) return;
    const mutationVersion = ++myListMutationVersionRef.current;
    const scopeKey = myListScopeRef.current;
    myListRef.current = nextItems;
    setMyList(nextItems);
    queueMyListWrite(
      nextItems,
      previousItems,
      scopeKey,
      mutationVersion,
      "Unable to remove",
      "This recommendation could not be removed from My List.",
    );
  }

  function renderMyList() {
    return (
      <MyListModal
        visible={showMyList}
        items={myList}
        colors={{
          background: theme.appBg,
          card: theme.inputBg,
          border: theme.lightBorder,
          text: theme.text,
          muted: theme.muted,
          highlight: theme.highlight,
        }}
        onClose={() => setShowMyList(false)}
        onRemove={removeRecommendationFromMyList}
      />
    );
  }

  function openSavedLibrary(library: SavedLibrary) {
    closeHeaderMenu();
    router.replace(library.hostedPath as any);
  }

  async function resetCurrentPatron() {
    const isWebStorage = Platform.OS === "web" && typeof localStorage !== "undefined";
    if (!isWebStorage) setPatronIdentityReady(false);
    try {
      await myListWriteQueueRef.current;
      if (patronId) {
        if (isWebStorage) {
          clearAllPatronMyLists(localStorage, patronId);
          clearAllPatronAgePreferences(localStorage, patronId);
          clearAllPatronCustomizations(localStorage, patronId);
        } else {
          await clearAllPatronMyListsAsync(AsyncStorage, patronId);
          await clearAllPatronAgePreferencesAsync(AsyncStorage, patronId);
          await clearAllPatronCustomizationsAsync(AsyncStorage, patronId);
        }
      }
      const result = isWebStorage
        ? resetPatronIdentity(localStorage)
        : await resetPatronIdentityAsync(AsyncStorage);
      myListRef.current = [];
      setMyList([]);
      setShowMyList(false);
      setPatronCustomization({});
      setPatronId(result.nextId);
      setPatronIdentityReady(true);
      setMode("swipe");
    } catch (error) {
      console.error("Failed to reset patron identity:", error);
      setPatronIdentityReady(true);
      Alert.alert("Unable to reset user", "The patron could not be reset. Please try again.");
    }
  }

  function confirmResetUser() {
    closeHeaderMenu();
    const message = "This clears this patron's personal preferences, My List, swipe history, and recommendation history and starts with a new identity. Library and admin settings will not change.";
    if (Platform.OS === "web" && typeof window !== "undefined") {
      if (window.confirm(`Reset User?\n\n${message}`)) void resetCurrentPatron();
      return;
    }
    Alert.alert(
      "Reset User?",
      message,
      [
        { text: "Cancel", style: "cancel" },
        { text: "Reset User", style: "destructive", onPress: () => void resetCurrentPatron() },
      ],
    );
  }


  function renderHeaderMenu() {
    return (
      <View style={styles.menuAnchor}>
        <TouchableOpacity
          onPress={toggleHeaderMenu}
          style={styles.headerMenuButton}
          accessibilityRole="button"
          accessibilityLabel="Open main menu"
        >
          <Text style={[styles.headerMenuButtonText, { color: theme.titleText || "#f8fafc" }]}>⋮</Text>
        </TouchableOpacity>
        {showHeaderMenu ? (
          <View style={[styles.headerMenuPopover, { borderColor: theme.lightBorder, backgroundColor: theme.inputBg }]}>
            {savedLibraries.length ? (
              <>
                <Text style={[styles.headerMenuSectionLabel, { color: theme.muted }]}>My Libraries</Text>
                {savedLibraries.map((savedLibrary) => (
                  <TouchableOpacity
                    key={savedLibrary.libraryId}
                    style={styles.headerMenuItem}
                    onPress={() => openSavedLibrary(savedLibrary)}
                    accessibilityLabel={`Go to ${savedLibrary.libraryName}`}
                  >
                    <Text
                      style={[
                        styles.headerMenuItemText,
                        { color: theme.text },
                        savedLibrary.libraryId === props.libraryId ? { fontWeight: "900" } : undefined,
                      ]}
                      numberOfLines={1}
                    >
                      {savedLibrary.libraryName}
                    </Text>
                  </TouchableOpacity>
                ))}
                <View style={[styles.headerMenuDivider, { borderTopColor: theme.lightBorder }]} />
              </>
            ) : null}
            <Text style={[styles.headerMenuSectionLabel, { color: theme.muted }]}>Personal</Text>
            <TouchableOpacity style={styles.headerMenuItem} onPress={openPatronPreferences}>
              <Text style={[styles.headerMenuItemText, { color: theme.text }]}>Customize My Experience</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.headerMenuItem}
              onPress={() => {
                closeHeaderMenu();
                openAdminEntry();
              }}
            >
              <Text style={[styles.headerMenuItemText, { color: theme.text }]}>Librarian Settings</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.headerMenuItem} onPress={openTestingInvite}>
              <Text style={[styles.headerMenuItemText, { color: theme.text }]}>Librarian Review</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.headerMenuItem}
              accessibilityLabel="Play Recommendation Games"
              onPress={() => {
                closeHeaderMenu();
                router.push({
                  pathname: "/media-mania",
                  params: {
                    playerId: patronId,
                    libraryId: props.libraryId || "default",
                    ageBand: deck === "k2" ? "kids" : deck === "36" ? "preteens" : deck === "adult" ? "adults" : "teens",
                  },
                } as any);
              }}
            >
              <Text style={[styles.headerMenuItemText, { color: theme.text }]}>Play Recommendation Games</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.headerMenuItem} onPress={() => openInfoScreen("/how-it-works")}>
              <Text style={[styles.headerMenuItemText, { color: theme.text }]}>How to Use NovelIdeas</Text>
            </TouchableOpacity>
            {pwaInstall.shouldShowInstall ? (
              <TouchableOpacity
                style={styles.headerMenuItem}
                onPress={installNovelIdeas}
                accessibilityRole="button"
                accessibilityLabel="Install NovelIdeas"
              >
                <Text style={[styles.headerMenuItemText, { color: theme.text }]}>Install NovelIdeas</Text>
              </TouchableOpacity>
            ) : null}
            <TouchableOpacity style={styles.headerMenuItem} onPress={() => openInfoScreen("/feedback")}>
              <Text style={[styles.headerMenuItemText, { color: theme.text }]}>Send Feedback</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.headerMenuItem} onPress={openMyList}>
              <Text style={[styles.headerMenuItemText, { color: theme.text }]}>My List</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.headerMenuItem}
              onPress={openDeveloperTip}
              accessibilityRole="link"
              accessibilityLabel="Tip the Developer on Venmo"
            >
              <Text style={[styles.headerMenuItemText, { color: theme.text }]}>Tip the Developer</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.headerMenuItem} onPress={() => openInfoScreen("/privacy")}>
              <Text style={[styles.headerMenuItemText, { color: theme.text }]}>Privacy</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.headerMenuItem} onPress={confirmResetUser}>
              <Text style={[styles.headerMenuItemText, { color: theme.text }]}>Reset User</Text>
            </TouchableOpacity>
            <View style={[styles.headerMenuDivider, { borderTopColor: theme.lightBorder }]} />
            <TouchableOpacity style={styles.headerMenuItem} onPress={() => openInfoScreen("/about")}>
              <Text style={[styles.headerMenuItemText, { color: theme.text }]}>About</Text>
            </TouchableOpacity>
          </View>
        ) : null}
      </View>
    );
  }

  function setInConfig(path: (string | number)[], value: any) {
    setHasUnsavedChanges(true);
    setConfig((prev: any) => {
      const next = deepClone(prev);
      let cur = next;
      for (let i = 0; i < path.length - 1; i++) {
        const key = path[i] as any;
        if (cur[key] == null) cur[key] = {};
        cur = cur[key];
      }
      cur[path[path.length - 1] as any] = value;
      return next;
    });
  }

  function toggleDeck(dk: DeckKey) {
    // Back-compat: some configs store deck enablement at config.enabledDecks (legacy),
    // canonical stores it at config.decks.enabled.
    const useLegacy = !!config?.enabledDecks && typeof config?.enabledDecks === "object";
    const path: (string | number)[] = useLegacy ? ["enabledDecks", dk] : ["decks", "enabled", dk];
    setInConfig(path, !libraryEnabledDecks[dk]);
  }

  function toggleSwipeCategory(k: SwipeCategoryKey) {
    const prev: SwipeCategories = librarySwipeCategories;
    const next: SwipeCategories = { ...prev, [k]: !prev[k] };

    // Guardrail: if everything is off, default Books back on.
    const anyOn = Object.values(next).some(Boolean);
    if (!anyOn) next.books = true;

    setInConfig(["swipe", "categories"], next);
  }

  function setSourceEnabledValue(key: RecommendationSourceToggleKey, enabled: boolean) {
    if (key === "localLibrary" && !localLibrarySupported) return;
    setHasUnsavedChanges(true);
    setConfig((prev: any) => {
      const next = deepClone(prev);
      next.recommendations = (next.recommendations && typeof next.recommendations === "object") ? next.recommendations : {};
      next.recommendations.sourceEnabled = (next.recommendations.sourceEnabled && typeof next.recommendations.sourceEnabled === "object")
        ? next.recommendations.sourceEnabled
        : {};
      next.recommendations.sourceEnabled[key] = enabled;
      if (key === "localLibrary" && enabled) {
        next.recommendations.sourceEnabled.googleBooks = false;
        next.recommendations.sourceEnabled.openLibrary = false;
        next.recommendations.sourceEnabled.kitsu = false;
        next.recommendations.sourceEnabled.gcd = false;
        next.recommendations.sourceEnabled.nyt = false;
      } else if (enabled) {
        next.recommendations.sourceEnabled.localLibrary = false;
      }
      return next;
    });
  }
  function setSourceEnabledForDeckValue(deckKey: DeckKey, key: RecommendationSourceToggleKey, enabled: boolean) {
    if (key === "localLibrary" && !localLibrarySupported) return;
    setInConfig(["recommendations", "sourceEnabledByDeck", deckKey, key], enabled);
  }

  function setAdultKitsuOnlyForceQueryForValidationValue(enabled: boolean) {
    setInConfig(["recommendations", "adultKitsuOnlyForceQueryForValidation"], enabled ? "dystopian" : "");
  }

  function setMainThemeKeyValue(t: ThemeKey) {
    setInConfig(["branding", "mainTheme"], t);
  }

  function setHighlightKeyValue(h: HighlightKey) {
    setInConfig(["branding", "highlight"], h);
  }

  function setTitleTextKeyValue(t: TitleTextKey) {
    setInConfig(["branding", "titleTextColor"], t);
  }

  function removeLogo() {
    setInConfig(["branding", "logoDataUrl"], null);
  }

  function uploadLogo() {
    if (Platform.OS !== "web") {
      Alert.alert("Upload logo", "Logo upload is easiest on web for now. Open the app in a browser to upload.");
      return;
    }

    try {
      const doc = (globalThis as any).document;
      if (!doc) {
        Alert.alert("Upload logo", "Could not access the file picker in this environment.");
        return;
      }

      const input = doc.createElement("input");
      input.type = "file";
      input.accept = "image/*";

      input.onchange = () => {
        const file = input.files?.[0];
        if (!file) return;

        // Optional: basic size guard (helps keep JSON reasonable)
        const maxBytes = 1_500_000; // ~1.5MB
        if (file.size > maxBytes) {
          Alert.alert("Logo too large", "Please choose a smaller image (under ~1.5MB). A simple PNG works best.");
          return;
        }

        const reader = new FileReader();
        reader.onload = () => {
          const dataUrl = String(reader.result || "");
          if (!dataUrl.startsWith("data:image/")) {
            Alert.alert("Upload logo", "That file doesn't look like an image. Try another file.");
            return;
          }
          setInConfig(["branding", "logoDataUrl"], dataUrl);
        };
        reader.readAsDataURL(file);
      };

      input.click();
    } catch {
      Alert.alert("Upload logo", "Something blocked the file picker. Try again, or use a different browser.");
    }
  }

  async function saveSettings() {
    const json = JSON.stringify(config, null, 2);

    // If a library ID is set, also save this config to localStorage for personalized access
    const sharedId = String(props.libraryId || libraryId || "").trim();
    if (sharedId) {
      try {
        localStorage.setItem(`lib_config_${sharedId}`, json);
      } catch (e) {
        console.error(`Failed to save config for library ${sharedId}:`, e);
      }
      await saveSharedLibraryConfig(sharedId, config as Record<string, unknown>);
    }

    if (Platform.OS === "web") {
      const blob = new Blob([json], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "NovelIdeas.json";
      a.click();
      URL.revokeObjectURL(url);

      setHasUnsavedChanges(false);
      return;
    }

    Alert.alert(
      "Saved",
      "On mobile, saving downloads is easiest on web. Open the app in a browser to download the updated NovelIdeas.json file."
    );
    setHasUnsavedChanges(false);
  }

  async function runManualSearch() {
    const q = query.trim();
    if (!q) {
      setErrorMsg("Type something to search (title, author, or topic).");
      return;
    }

    const maxResults = deck === "k2" ? 8 : deck === "36" ? 10 : 12;
    const requestId = ++manualSearchRequestRef.current;
    const isCurrentRequest = () => manualSearchRequestRef.current === requestId;

    setLoading(true);
    setErrorMsg(null);

    try {
      const activeLibraryId = String(props.libraryId || "").trim();
      if (activeLibraryId) {
        const artifact = await loadLocalCollectionRecommendationArtifact(activeLibraryId);
        if (!isCurrentRequest()) return;
        const localRecords = Array.isArray(artifact?.records) ? artifact.records : [];
        if (localRecords.length > 0) {
          setManualSearchSource("local_collection");
          const matches = searchLocalCollection(localRecords, q, maxResults);
          setResults(matches.map((record: LocalCollectionRecommendationRecord) => ({
            id: `local:${activeLibraryId}:${record.localId}`,
            source: "local_collection",
            title: record.title,
            author: record.author,
            publicationYear: record.publicationYear,
            coverUrl: record.coverUrl,
            shelvingLocation: record.shelvingLocation,
            localPlacement: record.localPlacement,
            callNumber: record.callNumber,
            isbn: record.isbn13 || record.isbn10,
          })));
          setCurrentResultIndex(0);
          if (!matches.length) setErrorMsg(`No matching books were found in ${libraryName || "this library"}'s catalog.`);
          return;
        }
      }

      if (!sourceEnabled.openLibrary) {
        setErrorMsg("Open Library is turned off in Admin. Enable Open Library under Recommendation Source to search.");
        setResults([]);
        setCurrentResultIndex(0);
        return;
      }

      setManualSearchSource("open_library");
      const url = `/api/openlibrary?q=${encodeURIComponent(q)}&limit=${maxResults}`;
      const resp = await fetch(url);
      if (!resp.ok) throw new Error(`Open Library error: ${resp.status}`);
      const data = await resp.json();
      if (!isCurrentRequest()) return;
      const docs: OLDoc[] = Array.isArray(data?.docs) ? data.docs : [];
      setResults(docs.filter((d) => d?.title).slice(0, maxResults).map((doc) => ({
        id: String(doc.key || `${doc.title}:${doc.author_name?.[0] || ""}`),
        source: "open_library",
        title: String(doc.title || ""),
        author: String(doc.author_name?.[0] || "Unknown author"),
        publicationYear: doc.first_publish_year,
        coverUrl: coverUrlFromCoverId(doc.cover_i, "M") || undefined,
      })));
      setCurrentResultIndex(0);
    } catch (err: any) {
      if (!isCurrentRequest()) return;
      setErrorMsg(err?.message || "Something went wrong contacting Open Library. Try again.");
      setResults([]);
      setCurrentResultIndex(0);
    } finally {
      if (isCurrentRequest()) setLoading(false);
    }
  }

  const saveButtonLabel = hasUnsavedChanges ? "Save Settings" : "Saved";
  const saveButtonStyle = hasUnsavedChanges
    ? { backgroundColor: libraryTheme.highlight, borderColor: libraryTheme.lightBorder }
    : styles.saveBtnGreen;

  // Admin view takes precedence and is reachable from BOTH swipe + search
  if (adminUnlocked) {
    return (
      <View style={[styles.container, { backgroundColor: libraryTheme.appBg }]}>
        <AdminView
theme={libraryTheme}
libraryName={inheritedLibraryName}
                    libraryId={libraryId}
logoDataUrl={libraryLogoDataUrl}
          setConfig={setConfig}
          setHasUnsavedChanges={setHasUnsavedChanges}
          mainThemeKey={mainThemeKey}
          highlightKey={highlightKey}
          titleTextKey={titleTextKey}
          enabledDecks={libraryEnabledDecks}
          sourceEnabled={sourceEnabled}
          deckSourceEnabled={deckSourceEnabled}
          adultKitsuOnlyForceQueryForValidation={adultKitsuOnlyForceQueryForValidation}
          localLibrarySupported={localLibrarySupported}
          swipeCategories={librarySwipeCategories}
          toggleSwipeCategory={toggleSwipeCategory}
          adminPinEnabled={adminPinEnabled}
          adminPin={adminPin}
          setAdminPinEnabled={(v) => setInConfig(["admin", "pinEnabled"], v)}
          setAdminPin={(v) => setInConfig(["admin", "pin"], v)}
          clearAdminPin={() => setInConfig(["admin", "pin"], "")}
          setLibraryName={(name) => setInConfig(["branding", "libraryName"], name)}
          setLibraryId={(id) => setInConfig(["library", "id"], id)}
          setMainThemeKey={setMainThemeKeyValue}
          setHighlightKey={setHighlightKeyValue}
          setTitleTextKey={setTitleTextKeyValue}
          onUploadLogo={uploadLogo}
          onRemoveLogo={removeLogo}
          toggleDeck={toggleDeck}
          setSourceEnabled={setSourceEnabledValue}
          setSourceEnabledForDeck={setSourceEnabledForDeckValue}
          setAdultKitsuOnlyForceQueryForValidation={setAdultKitsuOnlyForceQueryForValidationValue}
          onExit={() => {
            setAdminUnlocked(false);
          }}
          onSaveSettings={saveSettings}
          saveButtonLabel={saveButtonLabel}
          saveButtonStyle={saveButtonStyle}
          configPreview={configPreview}
        />
      </View>
    );
  }

  if (mode === "swipe") {
    return (
      <View
        style={[
          styles.swipeScreen,
          { backgroundColor: theme.appBg },
          Platform.OS === "web" ? ({ overflowX: "hidden" } as any) : null,
        ]}
      >
        {/* Title opens Librarian Settings; seven quick logo taps open owner analytics authentication. */}
        <View style={[styles.headerFrame, { backgroundColor: theme.accent, borderColor: theme.highlight }]}>
          <View style={styles.headerRow}>
            <TouchableOpacity
              style={styles.headerLeft}
              onPress={handleOwnerLogoTap}
              accessibilityRole="button"
              accessibilityLabel="NovelIdeas logo"
            >
              {logoDataUrl ? (
                <Image
                  source={{ uri: logoDataUrl }}
                  style={[styles.uploadedLogo, { borderColor: theme.lightBorder }]}
                  resizeMode="contain"
                />
              ) : (
                <DefaultBookLogo highlight={theme.highlight} />
              )}
            </TouchableOpacity>

            <TouchableOpacity
              onPress={handleTitleTap}
              style={styles.headerCenter}
              accessibilityRole="button"
            >
              <View style={styles.titleRow}>

                {(((libraryName) || "").trim().length > 0) ? (

                  <Text

                    style={[styles.title, { color: theme.titleText }]}

                    numberOfLines={1}

                    ellipsizeMode="tail"

                  >

                    {libraryName}

                  </Text>

                ) : (

                  <>

                    <Text style={[styles.title, { color: theme.titleText }]}>Novel</Text>

                                    <View style={[styles.titleDivider, { borderColor: theme.highlight }]} />

                                    <Text style={[styles.title, { color: theme.titleText }]}>Ideas</Text>

                  </>

                )}

              </View>
              <Text style={[styles.subtitle, { color: theme.muted }]}>Book Finder</Text>
            </TouchableOpacity>

            {renderHeaderMenu()}
          </View>
</View>

        <View style={styles.swipeStage}>
          {patronIdentityReady ? (
            <SwipeDeckScreen
              key={`${patronId}:${props.libraryId || "default"}`}
              patronId={patronId}
              libraryId={props.libraryId}
              onResetUser={() => void resetCurrentPatron()}
              savedRecommendationIds={myList.map((item) => item.id)}
              onSaveRecommendation={saveRecommendationToMyList}
              swipeCategories={swipeCategories}
              enabledDecks={enabledDecks}
              recommendationSourceEnabled={deckSourceEnabled[deck] || sourceEnabled}
              recommendationSourceEnabledByDeck={deckSourceEnabled}
              adultKitsuOnlyForceQueryForValidation={adultKitsuOnlyForceQueryForValidation}
              localLibrarySupported={localLibrarySupported}
              onOpenSearch={() => {
                closeHeaderMenu();
                setMode("search");
                setTimeout(() => queryInputRef.current?.focus?.(), 50);
              }}
              isAdminMode={adminUnlocked}
            />
          ) : (
            <ActivityIndicator size="large" color={theme.highlight} />
          )}
        </View>
        {renderMyList()}
      </View>
    );
  }

  // Search mode
  return (
    <View style={{ flex: 1, backgroundColor: theme.appBg }}>
      <View style={[styles.headerFrame, { backgroundColor: theme.accent, borderColor: theme.highlight }]}>
        <View style={styles.headerRow}>
          <TouchableOpacity
            style={styles.headerLeft}
            onPress={handleOwnerLogoTap}
            accessibilityRole="button"
            accessibilityLabel="NovelIdeas logo"
          >
            {logoDataUrl ? (
              <Image source={{ uri: logoDataUrl }} style={[styles.uploadedLogo, { borderColor: theme.lightBorder }]} resizeMode="contain" />
            ) : (
              <DefaultBookLogo highlight={theme.highlight} />
            )}
          </TouchableOpacity>
          <TouchableOpacity onPress={handleTitleTap} style={styles.headerCenter} accessibilityRole="button">
            <View style={styles.titleRow}>
              {(libraryName || "").trim().length > 0 ? (
                <Text style={[styles.title, { color: theme.titleText }]} numberOfLines={1} ellipsizeMode="tail">
                  {libraryName}
                </Text>
              ) : (
                <>
                  <Text style={[styles.title, { color: theme.titleText }]}>Novel</Text>
                  <View style={[styles.titleDivider, { borderColor: theme.highlight }]} accessibilityLabel="Title divider" />
                  <Text style={[styles.title, { color: theme.titleText }]}>Ideas</Text>
                </>
              )}
            </View>
            <Text style={[styles.subtitle, { color: theme.muted }]}>Book Finder</Text>
          </TouchableOpacity>
          {renderHeaderMenu()}
        </View>
      </View>

      <ScrollView
        style={styles.searchScroll}
        contentContainerStyle={styles.searchScrollContent}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.searchStage}>
          <View style={styles.searchTopRow}>
            <TouchableOpacity
              style={[
                styles.smallBtn,
                { borderColor: theme.lightBorder, backgroundColor: theme.inputBg, minWidth: 120 },
              ]}
              onPress={() => {
                closeHeaderMenu();
                setMode("swipe");
              }}
            >
              <Text style={[styles.smallBtnText, { color: theme.text }]}>Back to Swipe</Text>
            </TouchableOpacity>
          </View>

          <StudentView
            theme={theme}
            libraryName={libraryName}
            logoDataUrl={logoDataUrl}
            enabledDecks={enabledDecks}
            source={source}
            deck={deck}
            setDeck={setDeck}
            query={query}
            setQuery={setQuery}
            loading={loading}
            results={results}
            currentResultIndex={currentResultIndex}
            errorMsg={errorMsg}
            onSearch={runManualSearch}
            onClear={() => {
              manualSearchRequestRef.current += 1;
              setLoading(false);
              setQuery("");
              setResults([]);
              setCurrentResultIndex(0);
              setErrorMsg(null);
              queryInputRef.current?.focus?.();
            }}
            onPrevResult={() =>
              setCurrentResultIndex((i) => (results.length > 0 ? (i - 1 + results.length) % results.length : 0))
            }
            onNextResult={() =>
              setCurrentResultIndex((i) => (results.length > 0 ? (i + 1) % results.length : 0))
            }
            onTitleTap={handleTitleTap}
            onLogoTap={handleOwnerLogoTap}
            queryInputRef={queryInputRef}
            showHeader={false}
          />
        </View>
      </ScrollView>
      {renderMyList()}
    </View>
  );
}


const styles = StyleSheet.create({
  container: { flex: 1, alignItems: "center", justifyContent: "center", padding: 20 },

  // Header frame with synchronized highlight borders (top & bottom)
  headerFrame: {
    width: "100%",
    maxWidth: "100%",
    minWidth: 0,
    paddingHorizontal: 20,
    paddingTop: 20,
    zIndex: 10,
    position: "relative",
    borderTopWidth: 1,
    borderBottomWidth: 1,
    overflow: "visible",
  },

  headerRow: { width: "100%", maxWidth: "100%", minWidth: 0, flexDirection: "row", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", marginBottom: 12 },
  headerLeft: { width: 72, flexShrink: 0, alignItems: "flex-start", justifyContent: "center" },
  headerCenter: { flex: 1, minWidth: 0, maxWidth: "100%", alignItems: "center", justifyContent: "center" },
  headerRight: { width: 72 },
  menuAnchor: { flexShrink: 0, alignItems: "flex-end", justifyContent: "center", position: "relative" },
  headerMenuButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "transparent",
  },
  headerMenuButtonText: { fontSize: 26, fontWeight: "700", lineHeight: 26 },
  headerMenuPopover: {
    position: "absolute",
    top: 44,
    right: 0,
    minWidth: 230,
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 6,
    zIndex: 40,
  },
  headerMenuItem: {
    paddingVertical: 9,
    paddingHorizontal: 12,
  },
  headerMenuDivider: {
    borderTopWidth: 1,
    marginTop: 4,
    marginBottom: 4,
  },
  headerMenuItemText: { fontSize: 14, fontWeight: "700" },
  headerMenuSectionLabel: {
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 0.7,
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 4,
    textTransform: "uppercase",
  },

  titleRow: { width: "100%", maxWidth: "100%", minWidth: 0, flexDirection: "row", flexWrap: "wrap", alignItems: "center", justifyContent: "center", gap: 10 as any },
  title: { maxWidth: "100%", minWidth: 0, flexShrink: 1, fontSize: 30, fontWeight: "900", marginBottom: 2, textAlign: "center" },
  subtitle: { fontSize: 13, fontWeight: "700" },

  // Mimics the “spine” line in the book icon
  titleDivider: {
    height: 22,
    borderWidth: 1,
    borderRadius: 2,
    marginBottom: 2,
    width: 2,
  },

  card: { borderRadius: 16, padding: 14, borderWidth: 1, width: "100%" },

  adminTitle: { fontSize: 22, fontWeight: "900" },
  sectionTitle: { marginTop: 10, fontSize: 14, fontWeight: "900" },
  text: { fontSize: 14, marginTop: 6 },

  hint: { marginTop: 12, fontSize: 12 },
  noteSmall: { marginTop: 10, fontSize: 12 },
  label: { marginTop: 12, marginBottom: 6, fontWeight: "700" },

  privacyNote: { marginTop: 8, fontSize: 12, lineHeight: 16 },

  infoBtn: {
    marginTop: 10,
    alignSelf: "flex-start",
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 999,
    borderWidth: 1,
  },
  infoBtnText: { fontWeight: "900", fontSize: 12 },

  input: { marginTop: 10, borderWidth: 1, padding: 10, borderRadius: 12 },

  divider: { height: 1, marginVertical: 14 },

  rowBetween: { marginTop: 12, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  rowWrap: { marginTop: 10, flexDirection: "row", flexWrap: "wrap", gap: 10 as any },

  chip: { paddingVertical: 8, paddingHorizontal: 12, borderRadius: 999, borderWidth: 1 },
  chipText: { fontWeight: "700" },
  chipDisabled: { opacity: 0.45 },
  chipTextDisabled: { color: "#cbd5f5" },

  switchRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 12 },
  switchLabel: { fontWeight: "700", flex: 1, paddingRight: 10 },

  primaryBtn: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    minWidth: 120,
    borderWidth: 1,
  },
  primaryBtnText: { fontWeight: "900" },

  smallBtn: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    minWidth: 90,
  },
  smallBtnText: { fontWeight: "800" },

  // Save Settings button styles (fixed yellow/green)
  saveBtnBase: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    minWidth: 140,
    borderWidth: 1,
  },
  saveBtnGreen: { backgroundColor: "#22c55e", borderColor: "#16a34a" },
  saveBtnText: { color: "#0b1e33", fontWeight: "900" },

  jsonBox: { marginTop: 8, maxHeight: 280, padding: 10, borderRadius: 12, borderWidth: 1 },
  jsonText: { fontSize: 11, lineHeight: 15 },

  resultRow: { flexDirection: "row", gap: 14 as any, padding: 14, borderRadius: 16, borderWidth: 1.5, marginBottom: 12, alignItems: "center" },
  resultMeta: { flex: 1, justifyContent: "center" },
  resultMetaCentered: { width: "100%", alignItems: "center", justifyContent: "center", marginTop: 10 },

  cover: { width: 72, height: 108, borderRadius: 10, backgroundColor: "#071526" },
  coverLarge: { width: 84, height: 126, borderRadius: 12 },
  coverPlaceholder: { width: 72, height: 108, borderRadius: 10, borderWidth: 1, alignItems: "center", justifyContent: "center", padding: 6 },
  coverPlaceholderText: { fontSize: 10, textAlign: "center", fontWeight: "800" },

  resultTitle: { fontWeight: "900", fontSize: 14 },
  resultYear: { fontWeight: "700" },
  resultAuthor: { marginTop: 4, fontSize: 12, fontWeight: "700" },
  resultHint: { marginTop: 4, fontSize: 11, fontWeight: "700" },

  resultActions: { marginTop: 10, flexDirection: "row", gap: 10 as any },
  singleResultWrap: { marginTop: 8 },
  resultRowCompact: { width: "100%", maxWidth: 440, alignSelf: "center" },
  resultCardStack: { marginTop: 8, flexDirection: "column", alignItems: "center", justifyContent: "center" },
  resultInternalNav: { marginTop: 12, width: "100%", flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  resultNavBtn: { minWidth: 90 },
  tinyBtn: { paddingVertical: 8, paddingHorizontal: 10, borderRadius: 999, borderWidth: 1, backgroundColor: "rgba(11, 30, 51, 0.9)" },
  tinyBtnText: { fontWeight: "800", fontSize: 12 },

  errorText: { marginTop: 12, fontWeight: "800" },

  bold: { fontWeight: "900" },

  // Logo pieces
  uploadedLogo: { width: 54, height: 54, borderRadius: 12, borderWidth: 1, backgroundColor: "#071526" },

  logoRow: { flexDirection: "row", gap: 14 as any, marginTop: 10, alignItems: "center" },
  logoPreviewBox: { width: 84, height: 84 },
  logoPreviewImage: { width: "100%", height: "100%", borderRadius: 14, borderWidth: 1, backgroundColor: "#071526" },

  logoWrap: { width: 54, height: 54, borderRadius: 12, borderWidth: 1, backgroundColor: "#071526", padding: 5 },
  bookSpine: { position: "absolute", left: "50%", top: 10, bottom: 10, width: 2, borderWidth: 1, borderRadius: 2, transform: [{ translateX: -1 }] },
  bookPages: { flex: 1, flexDirection: "row" },
  bookPage: { flex: 1, borderWidth: 2, borderRadius: 6, backgroundColor: "rgba(255,255,255,0.06)" },
  bookLogoImg: { width: 44, height: 44, alignSelf: "center" },
  bookPageLeft: { marginRight: 6 },

  // ✅ moved down so it won't cover the restored header
  swipeOverlay: {
    position: "absolute",
    right: 16,
    top: 96,
  },

  searchTopRow: {
    width: "100%",
    alignItems: "flex-start",
    marginBottom: 10,
  },

  searchScroll: {
    flex: 1,
    width: "100%",
  },
  searchScrollContent: {
    alignItems: "center",
    paddingHorizontal: 20,
    paddingBottom: 40,
  },
  searchStage: {
    width: "100%",
    maxWidth: 720,
    alignSelf: "center",
    marginTop: 20,
  },

  swipeStage: {
    flex: 1,
    width: "100%",
    maxWidth: "100%",
    minWidth: 0,
    position: "relative",
  },
  swipeScreen: {
    flex: 1,
    width: "100%",
    maxWidth: "100%",
    minWidth: 0,
  },

});
