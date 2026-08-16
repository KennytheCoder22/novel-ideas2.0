import { useEffect, useMemo, useState } from "react";
import { router, useLocalSearchParams } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  Alert,
  Image,
  Platform,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import configFile from "../NovelIdeas.json";
import {
  autoChooseFontColor,
  highlightKeyToHex,
  isValidHex,
  mainKeyToHex,
  type HighlightKey,
  type ThemeKey,
} from "../constants/brandTheme";
import { loadSharedLibraryConfigWithDiagnostics } from "../lib/librarySharing/client";
import {
  clearPatronCustomization,
  clearPatronCustomizationAsync,
  effectivePatronSwipeCategories,
  normalizeAvailableSwipeCategories,
  readPatronCustomization,
  readPatronCustomizationAsync,
  SWIPE_CATEGORY_KEYS,
  writePatronCustomization,
  writePatronCustomizationAsync,
  type InheritedAppearance,
  type PatronAppearanceOverrides,
  type PatronCustomization,
  type SwipeCategoryKey,
} from "../lib/patronCustomization";
import {
  AGE_BAND_KEYS,
  clearPatronAgePreferences,
  clearPatronAgePreferencesAsync,
  effectivePatronAgeBands,
  normalizeAvailableAgeBands,
  readPatronAgePreferences,
  readPatronAgePreferencesAsync,
  type AgeBandKey,
  type AgeBandSelection,
} from "../lib/patronAgePreferences";
import { readOrCreatePatronId, readOrCreatePatronIdAsync } from "../lib/patronIdentity.mjs";

const AGE_LABELS: Record<AgeBandKey, string> = {
  k2: "Kids",
  "36": "Pre-Teens",
  ms_hs: "Teens",
  adult: "Adults",
};

const SWIPE_LABELS: Record<SwipeCategoryKey, string> = {
  books: "Books",
  movies: "Movies",
  tv: "TV",
  games: "Games",
  youtube: "YouTube",
  anime: "Anime",
  podcasts: "Podcasts",
};

function inheritedAppearance(config: any): InheritedAppearance {
  const mainThemeKey = (config?.branding?.mainTheme || config?.branding?.theme || config?.theme?.mainThemeKey || "dark_blue") as ThemeKey;
  const highlightKey = (config?.branding?.highlight || config?.theme?.highlightKey || "gold_accent") as HighlightKey;
  const mainColorHex = isValidHex(config?.branding?.mainColorHex)
    ? config.branding.mainColorHex
    : mainKeyToHex(mainThemeKey);
  const highlightColorHex = isValidHex(config?.branding?.highlightColorHex)
    ? config.branding.highlightColorHex
    : highlightKeyToHex(highlightKey);
  const configuredFontColor = config?.branding?.fontColorHex;
  return {
    name: String(config?.branding?.libraryName ?? config?.library?.name ?? "").trim(),
    logoDataUrl: String(config?.branding?.logoDataUrl || "").trim() || null,
    mainColorHex,
    highlightColorHex,
    fontColorHex: isValidHex(configuredFontColor) ? configuredFontColor : autoChooseFontColor(mainColorHex),
  };
}

function defaultConfig(): any {
  const config = JSON.parse(JSON.stringify(configFile));
  config.branding = config.branding || {};
  config.library = config.library || {};
  config.branding.libraryName = "";
  config.library.name = "";
  return config;
}

function libraryAgeBands(config: any): AgeBandSelection {
  return normalizeAvailableAgeBands(config?.enabledDecks ?? config?.decks?.enabled ?? {});
}

function librarySwipeCategories(config: any) {
  return normalizeAvailableSwipeCategories(config?.swipe?.categories ?? {});
}

export default function CustomizeMyExperienceScreen() {
  const params = useLocalSearchParams<{ libraryId?: string | string[] }>();
  const libraryId = String(Array.isArray(params.libraryId) ? params.libraryId[0] : params.libraryId || "").trim();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [patronId, setPatronId] = useState("");
  const [config, setConfig] = useState<any>(() => defaultConfig());
  const [draft, setDraft] = useState<PatronCustomization>({});
  const [error, setError] = useState("");

  const inherited = useMemo(() => inheritedAppearance(config), [config]);
  const availableAgeBands = useMemo(() => libraryAgeBands(config), [config]);
  const availableSwipeCategories = useMemo(() => librarySwipeCategories(config), [config]);
  const selectedAgeBands = useMemo(
    () => effectivePatronAgeBands(availableAgeBands, draft.ageBands ?? null),
    [availableAgeBands, draft.ageBands],
  );
  const selectedSwipeCategories = useMemo(
    () => effectivePatronSwipeCategories(availableSwipeCategories, draft.swipeCategories),
    [availableSwipeCategories, draft.swipeCategories],
  );

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const nextConfig = libraryId
          ? (await loadSharedLibraryConfigWithDiagnostics(libraryId, false)).config
          : defaultConfig();
        if (cancelled) return;
        const resolvedConfig = nextConfig || defaultConfig();
        setConfig(resolvedConfig);
        const id = Platform.OS === "web" && typeof localStorage !== "undefined"
          ? readOrCreatePatronId(localStorage)
          : await readOrCreatePatronIdAsync(AsyncStorage);
        const available = libraryAgeBands(resolvedConfig);
        const legacyAge = Platform.OS === "web" && typeof localStorage !== "undefined"
          ? readPatronAgePreferences(localStorage, id, libraryId || undefined, available)
          : await readPatronAgePreferencesAsync(AsyncStorage, id, libraryId || undefined, available);
        const customization = Platform.OS === "web" && typeof localStorage !== "undefined"
          ? readPatronCustomization(localStorage, id, libraryId || undefined, legacyAge)
          : await readPatronCustomizationAsync(AsyncStorage, id, libraryId || undefined, legacyAge);
        if (!cancelled) {
          setPatronId(id);
          setDraft(customization);
        }
      } catch (loadError) {
        console.error("Failed to load patron customization:", loadError);
        if (!cancelled) setError("Your personal settings could not be loaded.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [libraryId]);

  function setAppearance(key: keyof PatronAppearanceOverrides, value?: string) {
    setDraft((current) => {
      const appearance = { ...(current.appearance || {}) };
      if (value) appearance[key] = value;
      else delete appearance[key];
      return { ...current, appearance: Object.keys(appearance).length ? appearance : undefined };
    });
  }

  function toggleAgeBand(key: AgeBandKey, enabled: boolean) {
    setDraft((current) => ({
      ...current,
      ageBands: { ...selectedAgeBands, [key]: enabled },
    }));
  }

  function toggleSwipeCategory(key: SwipeCategoryKey, enabled: boolean) {
    setDraft((current) => ({
      ...current,
      swipeCategories: { ...selectedSwipeCategories, [key]: enabled },
    }));
  }

  function uploadLogo() {
    if (Platform.OS !== "web") {
      Alert.alert("Upload image", "Open NovelIdeas in your mobile browser to upload a personal image.");
      return;
    }
    const documentRef = (globalThis as any).document;
    if (!documentRef) return;
    const input = documentRef.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) return;
      if (file.size > 1_500_000) {
        Alert.alert("Image too large", "Choose an image under approximately 1.5 MB.");
        return;
      }
      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = String(reader.result || "");
        if (dataUrl.startsWith("data:image/")) setAppearance("logoDataUrl", dataUrl);
      };
      reader.readAsDataURL(file);
    };
    input.click();
  }

  async function save() {
    if (!patronId) return;
    if (!AGE_BAND_KEYS.some((key) => selectedAgeBands[key])) {
      setError("Choose at least one available age band.");
      return;
    }
    if (!SWIPE_CATEGORY_KEYS.some((key) => selectedSwipeCategories[key])) {
      setError("Choose at least one available swipe category.");
      return;
    }
    for (const key of ["mainColorHex", "highlightColorHex", "fontColorHex"] as const) {
      const value = draft.appearance?.[key];
      if (value && !isValidHex(value)) {
        setError(`${key === "mainColorHex" ? "Main" : key === "highlightColorHex" ? "Highlight" : "Font"} color must be a valid hex color.`);
        return;
      }
    }
    setSaving(true);
    setError("");
    try {
      const boundedDraft: PatronCustomization = {
        ...draft,
        ageBands: draft.ageBands ? selectedAgeBands : undefined,
        swipeCategories: draft.swipeCategories ? selectedSwipeCategories : undefined,
      };
      if (Platform.OS === "web" && typeof localStorage !== "undefined") {
        writePatronCustomization(localStorage, patronId, libraryId || undefined, boundedDraft);
        clearPatronAgePreferences(localStorage, patronId, libraryId || undefined);
      } else {
        await writePatronCustomizationAsync(AsyncStorage, patronId, libraryId || undefined, boundedDraft);
        await clearPatronAgePreferencesAsync(AsyncStorage, patronId, libraryId || undefined);
      }
      router.back();
    } catch (saveError) {
      console.error("Failed to save patron customization:", saveError);
      setError("Your personal settings could not be saved.");
    } finally {
      setSaving(false);
    }
  }

  async function resetCustomizations() {
    try {
      if (Platform.OS === "web" && typeof localStorage !== "undefined") {
        clearPatronCustomization(localStorage, patronId, libraryId || undefined);
        clearPatronAgePreferences(localStorage, patronId, libraryId || undefined);
      } else {
        await clearPatronCustomizationAsync(AsyncStorage, patronId, libraryId || undefined);
        await clearPatronAgePreferencesAsync(AsyncStorage, patronId, libraryId || undefined);
      }
      setDraft({});
    } catch (resetError) {
      console.error("Failed to reset patron customization:", resetError);
      setError("Your personal customizations could not be reset.");
    }
  }

  function confirmResetCustomizations() {
    const message = "This restores inherited library/default appearance and preferences. Your patron identity, My List, and recommendation history will remain.";
    if (Platform.OS === "web" && typeof window !== "undefined") {
      if (window.confirm(`Reset My Customizations?\n\n${message}`)) void resetCustomizations();
      return;
    }
    Alert.alert("Reset My Customizations?", message, [
      { text: "Cancel", style: "cancel" },
      { text: "Reset", style: "destructive", onPress: () => void resetCustomizations() },
    ]);
  }

  if (loading) {
    return <SafeAreaView style={styles.loading}><Text style={styles.bodyText}>Loading your experience...</Text></SafeAreaView>;
  }

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.headerButton} accessibilityLabel="Close Customize My Experience">
          <Text style={styles.headerButtonText}>Close</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Customize My Experience</Text>
      </View>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.intro}>
          These settings apply only to this patron. Librarian settings and other patrons will not change.
        </Text>

        <Section title="Personal Appearance">
          <Field
            label="Name"
            inherited={inherited.name || "NovelIdeas"}
            value={draft.appearance?.name}
            onChange={(value) => setAppearance("name", value)}
            onReset={() => setAppearance("name")}
          />
          <Text style={styles.label}>Logo / image</Text>
          <View style={styles.logoRow}>
            {(draft.appearance?.logoDataUrl || inherited.logoDataUrl) ? (
              <Image source={{ uri: draft.appearance?.logoDataUrl || inherited.logoDataUrl || "" }} style={styles.logo} resizeMode="contain" />
            ) : <View style={styles.logoPlaceholder}><Text style={styles.muted}>Inherited default icon</Text></View>}
            <View style={styles.logoActions}>
              <Action label="Upload personal image" onPress={uploadLogo} />
              {draft.appearance?.logoDataUrl ? <Action label="Use inherited image" onPress={() => setAppearance("logoDataUrl")} /> : null}
            </View>
          </View>
          <Field label="Main color" inherited={inherited.mainColorHex} value={draft.appearance?.mainColorHex} onChange={(value) => setAppearance("mainColorHex", value)} onReset={() => setAppearance("mainColorHex")} />
          <Field label="Highlight color" inherited={inherited.highlightColorHex} value={draft.appearance?.highlightColorHex} onChange={(value) => setAppearance("highlightColorHex", value)} onReset={() => setAppearance("highlightColorHex")} />
          <Field label="Font color" inherited={inherited.fontColorHex} value={draft.appearance?.fontColorHex} onChange={(value) => setAppearance("fontColorHex", value)} onReset={() => setAppearance("fontColorHex")} />
          <Action label="Restore inherited appearance" onPress={() => setDraft((current) => ({ ...current, appearance: undefined }))} />
        </Section>

        <Section title="Age Band Preferences">
          {AGE_BAND_KEYS.map((key) => (
            <PreferenceRow
              key={key}
              label={AGE_LABELS[key]}
              available={availableAgeBands[key]}
              value={selectedAgeBands[key]}
              onChange={(enabled) => toggleAgeBand(key, enabled)}
            />
          ))}
        </Section>

        <Section title="Swipe Deck Preferences">
          <Text style={styles.sectionHelp}>Choose which permitted swipe categories appear in your personal deck.</Text>
          {SWIPE_CATEGORY_KEYS.map((key) => (
            <PreferenceRow
              key={key}
              label={SWIPE_LABELS[key]}
              available={availableSwipeCategories[key]}
              value={selectedSwipeCategories[key]}
              onChange={(enabled) => toggleSwipeCategory(key, enabled)}
            />
          ))}
        </Section>

        {error ? <Text style={styles.error}>{error}</Text> : null}
        <TouchableOpacity style={styles.saveButton} onPress={() => void save()} disabled={saving}>
          <Text style={styles.saveButtonText}>{saving ? "Saving..." : "Save My Experience"}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.resetButton} onPress={confirmResetCustomizations}>
          <Text style={styles.resetButtonText}>Reset My Customizations</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return <View style={styles.section}><Text style={styles.sectionTitle}>{title}</Text>{children}</View>;
}

function Field(props: {
  label: string;
  inherited: string;
  value?: string;
  onChange: (value: string) => void;
  onReset: () => void;
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{props.label}</Text>
      <TextInput
        style={styles.input}
        value={props.value || ""}
        placeholder={`Inherited: ${props.inherited}`}
        placeholderTextColor="#6f8bad"
        onChangeText={props.onChange}
        autoCapitalize="none"
      />
      {props.value ? <Action label={`Use inherited ${props.label.toLowerCase()}`} onPress={props.onReset} /> : null}
    </View>
  );
}

function PreferenceRow(props: {
  label: string;
  available: boolean;
  value: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <View style={styles.preferenceRow}>
      <View style={styles.preferenceCopy}>
        <Text style={[styles.preferenceLabel, !props.available && styles.disabled]}>{props.label}</Text>
        {!props.available ? <Text style={styles.unavailable}>Not available from this library</Text> : null}
      </View>
      <Switch value={props.available && props.value} disabled={!props.available} onValueChange={props.onChange} />
    </View>
  );
}

function Action({ label, onPress }: { label: string; onPress: () => void }) {
  return <TouchableOpacity onPress={onPress} style={styles.action}><Text style={styles.actionText}>{label}</Text></TouchableOpacity>;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#071526" },
  loading: { flex: 1, backgroundColor: "#071526", alignItems: "center", justifyContent: "center" },
  header: { flexDirection: "row", alignItems: "center", padding: 14, borderBottomWidth: 1, borderBottomColor: "#1e3a5f" },
  headerButton: { paddingVertical: 8, paddingRight: 14 },
  headerButtonText: { color: "#93c5fd", fontWeight: "800" },
  title: { color: "#e5efff", fontSize: 20, fontWeight: "900", flex: 1 },
  content: { padding: 18, paddingBottom: 48, width: "100%", maxWidth: 680, alignSelf: "center" },
  intro: { color: "#b0c4de", fontSize: 15, lineHeight: 22, marginBottom: 18 },
  section: { backgroundColor: "#10243f", borderColor: "#223b6b", borderWidth: 1, borderRadius: 16, padding: 16, marginBottom: 16 },
  sectionTitle: { color: "#e5efff", fontSize: 18, fontWeight: "900", marginBottom: 10 },
  sectionHelp: { color: "#93aeca", fontSize: 13, lineHeight: 19, marginBottom: 8 },
  field: { marginBottom: 16 },
  label: { color: "#d7e4f6", fontSize: 14, fontWeight: "800", marginBottom: 7 },
  input: { color: "#e5efff", backgroundColor: "#071526", borderColor: "#315277", borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 11 },
  action: { alignSelf: "flex-start", borderColor: "#315277", borderWidth: 1, borderRadius: 9, paddingHorizontal: 11, paddingVertical: 8, marginTop: 8 },
  actionText: { color: "#93c5fd", fontSize: 13, fontWeight: "800" },
  logoRow: { flexDirection: "row", alignItems: "center", marginBottom: 18, gap: 14 },
  logo: { width: 84, height: 84, borderRadius: 12, backgroundColor: "#071526" },
  logoPlaceholder: { width: 120, height: 84, borderColor: "#315277", borderWidth: 1, borderRadius: 12, alignItems: "center", justifyContent: "center", padding: 8 },
  logoActions: { flex: 1 },
  muted: { color: "#6f8bad", fontSize: 12, textAlign: "center" },
  preferenceRow: { minHeight: 56, flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderTopColor: "#223b6b", borderTopWidth: 1 },
  preferenceCopy: { flex: 1, paddingRight: 12 },
  preferenceLabel: { color: "#e5efff", fontSize: 15, fontWeight: "800" },
  disabled: { color: "#6f8bad" },
  unavailable: { color: "#6f8bad", fontSize: 12, marginTop: 2 },
  bodyText: { color: "#e5efff" },
  error: { color: "#fca5a5", fontWeight: "800", marginBottom: 12 },
  saveButton: { backgroundColor: "#fbbf24", borderRadius: 12, alignItems: "center", padding: 15 },
  saveButtonText: { color: "#172033", fontWeight: "900", fontSize: 16 },
  resetButton: { borderColor: "#fca5a5", borderWidth: 1, borderRadius: 12, alignItems: "center", padding: 14, marginTop: 12 },
  resetButtonText: { color: "#fca5a5", fontWeight: "900" },
});
