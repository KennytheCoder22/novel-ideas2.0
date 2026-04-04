import {
  useMemo,
    useRef,
  useState
} from "react";
import { router } from "expo-router";
import { useFocusEffect } from "@react-navigation/native";
import {
  Alert,
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
import { buildTheme, type ThemeKey, type HighlightKey } from "../../constants/brandTheme";

function deepClone<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj));
}

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

  return cfg;
}

function tryLoadDesktopAdminDraft(): any | null {
  try {
    if (Platform.OS !== "web") return null;
    // Guard for environments where localStorage isn't available.
    // (Expo web should have it.)
    // @ts-ignore
    if (typeof localStorage === "undefined") return null;
    // @ts-ignore
    const saved = localStorage.getItem("novelideas_admin_config");
    if (!saved) return null;
    const parsed = JSON.parse(saved);
    return syncSchema(parsed);
  } catch {
    return null;
  }
}


type DeckKey = "k2" | "36" | "ms_hs" | "adult";
type SourceKey = "open_library" | "local_collection";

type SwipeCategoryKey = "books" | "movies" | "tv" | "games" | "youtube" | "anime" | "podcasts";
type SwipeCategories = Record<SwipeCategoryKey, boolean>;

const DEFAULT_SWIPE_CATEGORIES: SwipeCategories = {
  books: true,
  movies: true,
  tv: true,
  games: true,
  youtube: true,
  anime: true,
  podcasts: true,
};


type OLDoc = {
  key?: string;
  title?: string;
  author_name?: string[];
  first_publish_year?: number;
  cover_i?: number;
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
    <View style={styles.logoWrap} accessibilityLabel="Default book logo">
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
  results: OLDoc[];
  errorMsg: string | null;
  onSearch: () => void;
  onClear: () => void;
  onTitleTap: () => void;
  queryInputRef: any;
}) {
  const enabledList = (["k2", "36", "ms_hs", "adult"] as DeckKey[])
    .filter((k) => !!props.enabledDecks[k])
    .map(deckLabel)
    .join(", ");

  const sourceText =
    props.source === "open_library"
      ? "Open Library"
      : "Local Collection (coming next)";

  return (
    <View style={{ width: "100%", maxWidth: 720 }}>
      {/* Header row with logo (upper left) */}
      <View style={styles.headerRow}>
        <View style={styles.headerLeft}>
          {props.logoDataUrl ? (
            <Image
              source={{ uri: props.logoDataUrl }}
              style={[styles.uploadedLogo, { borderColor: props.theme.lightBorder }]}
              resizeMode="contain"
            />
          ) : (
            <DefaultBookLogo highlight={props.theme.highlight} />
          )}
        </View>

        <TouchableOpacity
          onPress={props.onTitleTap}
          style={styles.headerCenter}
          accessibilityRole="button"
        >
          <View style={styles.titleRow}>

            {(((props.libraryName) || "").trim().length > 0) ? (

              <Text

                style={[styles.title, { color: props.theme.text }]}

                numberOfLines={1}

                ellipsizeMode="tail"

              >

                {props.libraryName}

              </Text>

            ) : (

              <>

                <Text style={[styles.title, { color: props.theme.text }]}>Novel</Text>

                            <View

                              style={[

                                styles.titleDivider,

                                { borderColor: props.theme.highlight },

                              ]}

                              accessibilityLabel="Title divider"

                            />

                            <Text style={[styles.title, { color: props.theme.text }]}>Ideas</Text>

              </>

            )}

          </View>
          <Text style={[styles.subtitle, { color: props.theme.muted }]}>Book Finder</Text>
        </TouchableOpacity>

        <View style={styles.headerRight} />
      </View>

      <View
        style={[
          styles.card,
          { backgroundColor: props.theme.cardBg, borderColor: props.theme.lightBorder },
        ]}
      >
        <Text style={[styles.sectionTitle, { color: props.theme.text }]}>Loaded config</Text>
        <Text style={[styles.text, { color: props.theme.subtext }]}>
          Library:{" "}
          <Text style={[styles.bold, { color: props.theme.text }]}>{props.libraryName}</Text>
        </Text>
        <Text style={[styles.text, { color: props.theme.subtext }]}>
          Enabled decks:{" "}
          <Text style={[styles.bold, { color: props.theme.text }]}>{enabledList || "None"}</Text>
        </Text>
        <Text style={[styles.text, { color: props.theme.subtext }]}>
          Source:{" "}
          <Text style={[styles.bold, { color: props.theme.text }]}>{sourceText}</Text>
        </Text>

        <View style={[styles.divider, { backgroundColor: props.theme.cardBorder }]} />

        <Text style={[styles.sectionTitle, { color: props.theme.text }]}>Choose audience</Text>
        <View style={styles.rowWrap}>
          {(["k2", "36", "ms_hs", "adult"] as DeckKey[]).map((dk) => {
            const enabled = !!props.enabledDecks[dk];
            const selected = props.deck === dk;

            return (
              <TouchableOpacity
                key={dk}
                disabled={!enabled}
                onPress={() => props.setDeck(dk)}
                style={[
                  styles.chip,
                  {
                    borderColor: props.theme.highlight,
                    backgroundColor: props.theme.inputBg,
                    borderWidth: 1.5,
                    borderRadius: 999,
                  },
                  !enabled && styles.chipDisabled,
                ]}
              >
                <Text
                  style={[
                    styles.chipText,
                    { color: props.theme.text },
                    !enabled && styles.chipTextDisabled,
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
          {props.source === "open_library"
            ? "Search Open Library"
            : "Search This Library (coming next)"}
        </Text>

        {props.source === "open_library" ? (
          <>
            <Text style={[styles.noteSmall, { color: props.theme.subtext }]}>
              Try a title, author, or topic (e.g., “Percy Jackson”, “mystery”, “Dora”).
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

            <View style={styles.rowBetween}>
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

              <TouchableOpacity
                style={[
                  styles.smallBtn,
                  { borderColor: props.theme.lightBorder, backgroundColor: props.theme.inputBg },
                ]}
                onPress={props.onClear}
              >
                <Text style={[styles.smallBtnText, { color: props.theme.text }]}>Clear</Text>
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

            {props.results.length > 0 ? (
              <>
                <Text style={[styles.sectionTitle, { color: props.theme.text }]}>Results</Text>

                <View style={{ marginTop: 8 }}>
                  {props.results.map((d, idx) => {
                    const title = d.title || "Untitled";
                    const author = d.author_name?.[0] || "Unknown author";
                    const year = d.first_publish_year ? ` (${d.first_publish_year})` : "";
                    const cover = coverUrlFromCoverId(d.cover_i, "M");

                    return (
                      <View
                        key={`${d.key || title}-${idx}`}
                        style={[
                          styles.resultRow,
                          {
                            borderColor: props.theme.resultBorder,
                            backgroundColor: props.theme.resultBg,
                          },
                        ]}
                      >
                        {cover ? (
                          <Image source={{ uri: cover }} style={styles.cover} resizeMode="cover" />
                        ) : (
                          <View
                            style={[
                              styles.coverPlaceholder,
                              { borderColor: props.theme.resultBorder },
                            ]}
                          >
                            <Text
                              style={[
                                styles.coverPlaceholderText,
                                { color: props.theme.muted },
                              ]}
                            >
                              No cover
                            </Text>
                          </View>
                        )}

                        <View style={{ flex: 1 }}>
                          <Text style={[styles.resultTitle, { color: props.theme.text }]}>
                            {title}
                            <Text style={[styles.resultYear, { color: props.theme.muted }]}>{year}</Text>
                          </Text>
                          <Text style={[styles.resultAuthor, { color: props.theme.subtext }]}>
                            {author}
                          </Text>

                          <View style={styles.resultActions}>
                            <TouchableOpacity
                              style={[styles.tinyBtn, { borderColor: props.theme.accentBorder }]}
                              onPress={() =>
                                Alert.alert("Saved (v1)", `Added "${title}" to your list (coming next).`)
                              }
                            >
                              <Text style={[styles.tinyBtnText, { color: props.theme.text }]}>
                                Add to list
                              </Text>
                            </TouchableOpacity>

                            <TouchableOpacity
                              style={[styles.tinyBtn, { borderColor: props.theme.accentBorder }]}
                              onPress={() => Alert.alert("Feedback (v1)", "Ratings + DNF reasons next.")}
                            >
                              <Text style={[styles.tinyBtnText, { color: props.theme.text }]}>
                                Feedback
                              </Text>
                            </TouchableOpacity>
                          </View>
                        </View>
                      </View>
                    );
                  })}
                </View>
              </>
            ) : null}
          </>
        ) : (
          <>
            <Text style={[styles.noteSmall, { color: props.theme.subtext }]}>
              This mode will recommend only books that this library actually owns. Upload/import tools are coming next.
              For now, switch Source to Open Library if you want instant recommendations without uploading anything.
            </Text>

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
            </View>
          </>
        )}

        <Text style={[styles.hint, { color: props.theme.muted }]}>Tap the title 7 times to open Admin.</Text>
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
  source: SourceKey;

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
  setSource: (s: SourceKey) => void;

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
  Choose where recommendations come from. Open Library is the privacy-friendly default.
</Text>

<TouchableOpacity
  style={[styles.infoBtn, { borderColor: props.theme.cardBorder, backgroundColor: props.theme.inputBg }]}
  onPress={showSourceInfo}
>
  <Text style={[styles.infoBtnText, { color: props.theme.muted }]}>What does this mean?</Text>
</TouchableOpacity>

<View style={styles.rowWrap}>
  {(["open_library", "local_collection"] as SourceKey[]).map((s) => {
    const selected = props.source === s;
    return (
      <TouchableOpacity
        key={s}
        onPress={() => props.setSource(s)}
        style={[
          styles.chip,
          { borderColor: props.theme.lightBorder, backgroundColor: props.theme.inputBg },
          selected && { backgroundColor: props.theme.accent, borderColor: props.theme.accentBorder },
        ]}
      >
        <Text
          style={[
            styles.chipText,
            { color: props.theme.text },
            selected && { color: props.theme.accentTextOn },
          ]}
        >
          {sourceLabel(s)}
        </Text>
      </TouchableOpacity>
    );
  })}
</View>

{props.source === "local_collection" ? (
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
                  value={`https://novelideas.com/c/${encodeURIComponent(props.libraryId)}`}
                  size={220}
                />
              </View>

              <Text style={[styles.noteSmall, { color: props.theme.subtext, marginTop: 10, textAlign: "center" }]}>
                Encoded link:
              </Text>
              <Text selectable style={[styles.jsonText, { color: props.theme.subtext, textAlign: "center" }]}>
                {`https://novelideas.com/c/${props.libraryId}`}
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

export default function HomeScreen() {
  const [mode, setMode] = useState<"swipe" | "search">("swipe");

  const [tapCount, setTapCount] = useState(0);
  const [showAdminPinPrompt, setShowAdminPinPrompt] = useState(false);
  const [adminPinEntry, setAdminPinEntry] = useState("");
  const [adminPinError, setAdminPinError] = useState<string | null>(null);
  const [adminUnlocked, setAdminUnlocked] = useState(false);

  const [config, setConfig] = useState<any>(() => {
    // Desktop web: if the admin-web page saved a draft into localStorage,
    // use that as the starting point for the Home screen.
    const fromDraft = tryLoadDesktopAdminDraft();
    if (fromDraft) return fromDraft;

    const init = deepClone(configFile);
    syncSchema(init);

    // First-run default: empty library name so branding shows "Novel | Ideas"
    // until an admin sets a library name (import or admin).
    if (init?.library) init.library.name = "";
    if (init?.branding) init.branding.libraryName = "";

    return init;
  });
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  const [deck, setDeck] = useState<DeckKey>("ms_hs");
  const [query, setQuery] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [results, setResults] = useState<OLDoc[]>([]);

  // Keep a stable ref to avoid weird focus behavior from accidental remounts.
  const queryInputRef = useRef<TextInput | null>(null);

  const enabledDecks = (config?.enabledDecks ?? config?.decks?.enabled ?? {});
  const swipeCategories: SwipeCategories = {
    ...DEFAULT_SWIPE_CATEGORIES,
    ...(config?.swipe?.categories ?? {}),
  };
  const libraryName = useMemo(() => (config?.branding?.libraryName ?? config?.library?.name ?? ""), [config]);

  
  const libraryId = useMemo(() => config?.library?.id ?? "", [config]);
const source: SourceKey = (config?.recommendation?.source as SourceKey) || "open_library";

  // Branding state from config (with safe defaults)
  // Back-compat: if older config uses branding.theme, treat it as main color.
  const mainThemeKey: ThemeKey =
    (config?.branding?.mainTheme as ThemeKey) ||
    (config?.branding?.theme as ThemeKey) ||
    "dark_blue";

  const highlightKey: HighlightKey =
    (config?.branding?.highlight as HighlightKey) || "gold_accent";

  const titleTextKey: TitleTextKey =
    (config?.branding?.titleTextColor as TitleTextKey) || "white";

  const logoDataUrl: string | null = config?.branding?.logoDataUrl ?? null;

  const theme = useMemo(
    () => buildTheme(mainThemeKey, highlightKey, titleTextKey),
    [mainThemeKey, highlightKey, titleTextKey]
  );

  const adminPinEnabled: boolean = !!config?.admin?.pinEnabled;
  const adminPin: string = typeof config?.admin?.pin === "string" ? config.admin.pin : "";
  const adminPinReady: boolean = adminPinEnabled && /^\d{6}$/.test(adminPin);
  const showCustomizeButton = Platform.OS === "web";

  
const configPreview = useMemo(() => JSON.stringify(config, null, 2), [config]);

  // Desktop web: whenever the Home screen regains focus, re-hydrate from the
  // Desktop Admin draft if it exists. This is what makes toggles + library name
  // updates reflect on the main desktop screen after you press "Save Settings".
  useFocusEffect(
    useMemo(
      () => () => {
        const draft = tryLoadDesktopAdminDraft();
        if (!draft) return;

        setConfig((prev: any) => {
          try {
            // Avoid re-render loops if nothing changed.
            const a = JSON.stringify(prev);
            const b = JSON.stringify(draft);
            return a === b ? prev : draft;
          } catch {
            return draft;
          }
        });
      },
      []
    )
  );


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
                    router.push("/app_admin-web");
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


  function openAdminEntry() {
    if (adminPinReady) {
      setAdminPinEntry("");
      setAdminPinError(null);
      setShowAdminPinPrompt(true);
      setTapCount(0);
      return;
    }

    if (Platform.OS === "web") {
      try {
        router.push("/app_admin-web");
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
      openAdminEntry();
    }
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
    setInConfig(path, !enabledDecks[dk]);
  }

  function toggleSwipeCategory(k: SwipeCategoryKey) {
    const prev: SwipeCategories = {
      ...DEFAULT_SWIPE_CATEGORIES,
      ...(config?.swipe?.categories ?? {}),
    };
    const next: SwipeCategories = { ...prev, [k]: !prev[k] };

    // Guardrail: if everything is off, default Books back on.
    const anyOn = Object.values(next).some(Boolean);
    if (!anyOn) next.books = true;

    setInConfig(["swipe", "categories"], next);
  }

  function setSourceValue(s: SourceKey) {
    setInConfig(["recommendation", "source"], s);
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

  function saveSettings() {
    const json = JSON.stringify(config, null, 2);

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

  async function runOpenLibrarySearch() {
    if (source !== "open_library") {
      setErrorMsg("Open Library is turned off in Admin. Switch Source to Open Library to search.");
      return;
    }

    const q = query.trim();
    if (!q) {
      setErrorMsg("Type something to search (title, author, or topic).");
      return;
    }

    const maxResults = deck === "k2" ? 8 : deck === "36" ? 10 : 12;

    setLoading(true);
    setErrorMsg(null);

    try {
      const url = `/api/openlibrary?q=${encodeURIComponent(q)}&limit=${maxResults}`;
      const resp = await fetch(url);
      if (!resp.ok) throw new Error(`Open Library error: ${resp.status}`);
      const data = await resp.json();
      const docs: OLDoc[] = Array.isArray(data?.docs) ? data.docs : [];
      setResults(docs.filter((d) => d?.title).slice(0, maxResults));
    } catch (err: any) {
      setErrorMsg(err?.message || "Something went wrong contacting Open Library. Try again.");
      setResults([]);
    } finally {
      setLoading(false);
    }
  }

  const saveButtonLabel = hasUnsavedChanges ? "Save Settings" : "Saved";
  const saveButtonStyle = hasUnsavedChanges ? styles.saveBtnYellow : styles.saveBtnGreen;

  // Admin view takes precedence and is reachable from BOTH swipe + search
  if (adminUnlocked) {
    return (
      <View style={[styles.container, { backgroundColor: theme.appBg }]}>
        <AdminView
          theme={theme}
          libraryName={libraryName}
                    libraryId={libraryId}
logoDataUrl={logoDataUrl}
          setConfig={setConfig}
          setHasUnsavedChanges={setHasUnsavedChanges}
          mainThemeKey={mainThemeKey}
          highlightKey={highlightKey}
          titleTextKey={titleTextKey}
          enabledDecks={enabledDecks}
          source={source}
          swipeCategories={swipeCategories}
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
          setSource={setSourceValue}
          onExit={() => setAdminUnlocked(false)}
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
      <View style={{ flex: 1, backgroundColor: theme.appBg }}>
        {/* Novel | Ideas header (tap 7x = Admin) */}
        <View style={[styles.headerFrame, { backgroundColor: theme.accent, borderColor: theme.highlight }]}>
          <View style={styles.headerRow}>
            <View style={styles.headerLeft}>
              {logoDataUrl ? (
                <Image
                  source={{ uri: logoDataUrl }}
                  style={[styles.uploadedLogo, { borderColor: theme.lightBorder }]}
                  resizeMode="contain"
                />
              ) : (
                <DefaultBookLogo highlight={theme.highlight} />
              )}
            </View>

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

            <View style={styles.headerRight} />
          </View>
</View>

        <View style={styles.swipeStage}>
          <SwipeDeckScreen
            swipeCategories={swipeCategories}
            enabledDecks={enabledDecks}
            onOpenSearch={() => {
              setMode("search");
              setTimeout(() => queryInputRef.current?.focus?.(), 50);
            }}
          />

          {showCustomizeButton ? (
            <View style={styles.customizeOverlay}>
              <TouchableOpacity
                style={[
                  styles.chip,
                  { borderColor: theme.highlight, backgroundColor: theme.inputBg },
                ]}
                onPress={openAdminEntry}
              >
                <Text style={[styles.chipText, { color: theme.text }]}>Customize</Text>
              </TouchableOpacity>
            </View>
          ) : null}
        </View>
      </View>
    );
  }

  // Search mode
  return (
    <View style={[styles.container, { backgroundColor: theme.appBg }]}>
      <View style={styles.searchTopRow}>
        <TouchableOpacity
          style={[
            styles.smallBtn,
            { borderColor: theme.lightBorder, backgroundColor: theme.inputBg, minWidth: 120 },
          ]}
          onPress={() => setMode("swipe")}
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
        errorMsg={errorMsg}
        onSearch={runOpenLibrarySearch}
        onClear={() => {
          setQuery("");
          setResults([]);
          setErrorMsg(null);
          queryInputRef.current?.focus?.();
        }}
        onTitleTap={handleTitleTap}
        queryInputRef={queryInputRef}
      />
    </View>
  );
}


const styles = StyleSheet.create({
  container: { flex: 1, alignItems: "center", justifyContent: "center", padding: 20 },

  // Header frame with synchronized highlight borders (top & bottom)
  headerFrame: {
    paddingHorizontal: 20,
    paddingTop: 20,
    zIndex: 10,
    position: "relative",
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    overflow: "hidden",
    transform: [{ translateY: 0.5 }],
  },

  headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 },
  headerLeft: { width: 72, alignItems: "flex-start", justifyContent: "center" },
  headerCenter: { flex: 1, alignItems: "center", justifyContent: "center" },
  headerRight: { width: 72 },

  titleRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10 as any },
  title: { fontSize: 30, fontWeight: "900", marginBottom: 2 },
  subtitle: { fontSize: 13, fontWeight: "700" },

  // Mimics the “spine” line in the book icon
  titleDivider: {
    height: 22,
    borderWidth: 1,
    borderRadius: 2,
    marginBottom: 2,
    width: 2,
  },

  card: { borderRadius: 16, padding: 20, borderWidth: 1, width: "100%" },

  adminTitle: { fontSize: 22, fontWeight: "900" },
  sectionTitle: { marginTop: 14, fontSize: 14, fontWeight: "900" },
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
  saveBtnYellow: { backgroundColor: "#fbbf24", borderColor: "#f59e0b" },
  saveBtnGreen: { backgroundColor: "#22c55e", borderColor: "#16a34a" },
  saveBtnText: { color: "#0b1e33", fontWeight: "900" },

  jsonBox: { marginTop: 8, maxHeight: 280, padding: 10, borderRadius: 12, borderWidth: 1 },
  jsonText: { fontSize: 11, lineHeight: 15 },

  resultRow: { flexDirection: "row", gap: 12 as any, padding: 12, borderRadius: 14, borderWidth: 1, marginBottom: 10 },

  cover: { width: 56, height: 84, borderRadius: 8, backgroundColor: "#071526" },
  coverPlaceholder: { width: 56, height: 84, borderRadius: 8, borderWidth: 1, alignItems: "center", justifyContent: "center", padding: 6 },
  coverPlaceholderText: { fontSize: 10, textAlign: "center", fontWeight: "800" },

  resultTitle: { fontWeight: "900", fontSize: 14 },
  resultYear: { fontWeight: "700" },
  resultAuthor: { marginTop: 4, fontSize: 12, fontWeight: "700" },

  resultActions: { marginTop: 10, flexDirection: "row", gap: 10 as any },
  tinyBtn: { paddingVertical: 8, paddingHorizontal: 10, borderRadius: 999, borderWidth: 1, backgroundColor: "rgba(11, 30, 51, 0.9)" },
  tinyBtnText: { fontWeight: "800", fontSize: 12 },

  errorText: { marginTop: 12, fontWeight: "800" },

  bold: { fontWeight: "900" },

  // Logo pieces
  uploadedLogo: { width: 54, height: 54, borderRadius: 12, borderWidth: 1, backgroundColor: "#071526" },

  logoRow: { flexDirection: "row", gap: 14 as any, marginTop: 10, alignItems: "center" },
  logoPreviewBox: { width: 84, height: 84 },
  logoPreviewImage: { width: "100%", height: "100%", borderRadius: 14, borderWidth: 1, backgroundColor: "#071526" },

  logoWrap: { width: 54, height: 54, borderRadius: 12, borderWidth: 1, borderColor: "#223b6b", backgroundColor: "#071526", padding: 5 },
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
    maxWidth: 720,
    alignItems: "flex-start",
    marginBottom: 10,
  },

  swipeStage: {
    flex: 1,
    position: "relative",
  },

  customizeOverlay: {
    position: "absolute",
    top: 12,
    right: 16,
    zIndex: 20,
  },
});
