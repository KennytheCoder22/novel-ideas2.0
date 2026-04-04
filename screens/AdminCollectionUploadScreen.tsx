import React, { useMemo, useState } from "react";
import { Alert, ActivityIndicator, SafeAreaView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { router } from "expo-router";

/**
 * NovelIdeas — Admin Collection Upload (MVP)
 *
 * This screen wires the librarian's "collection upload" to Supabase (Option A).
 *
 * You'll need to install:
 *   - @supabase/supabase-js
 *   - expo-document-picker
 *
 * Then set your Supabase URL + anon key below (or move them into env / app config).
 */

let createClient: any;
try {
  // Lazy require so the app can still boot before deps are installed.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  createClient = require("@supabase/supabase-js").createClient;
} catch (e) {
  createClient = null;
}

let DocumentPicker: any;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  DocumentPicker = require("expo-document-picker");
} catch (e) {
  DocumentPicker = null;
}

const SUPABASE_URL = "PASTE_YOUR_SUPABASE_URL_HERE";
const SUPABASE_ANON_KEY = "PASTE_YOUR_SUPABASE_ANON_KEY_HERE";

/**
 * Storage bucket for uploaded MARC files
 * Recommended: private bucket named "collections"
 */
const COLLECTIONS_BUCKET = "collections";

/**
 * Edge Function name (Supabase)
 * We'll create this later as: "import-collection"
 */
const IMPORT_FUNCTION = "import-collection";

export default function AdminCollectionUploadScreen() {
  const [libraryId, setLibraryId] = useState<string>("yvhs");
  const [busy, setBusy] = useState(false);
  const [lastStatus, setLastStatus] = useState<string>("");

  const supabase = useMemo(() => {
    if (!createClient) return null;
    if (!SUPABASE_URL.startsWith("http")) return null;
    if (!SUPABASE_ANON_KEY || SUPABASE_ANON_KEY.includes("PASTE_")) return null;
    return createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  }, []);

  async function pickAndUpload() {
    if (!DocumentPicker) {
      Alert.alert(
        "Missing dependency",
        "Install expo-document-picker (and @supabase/supabase-js), then reload the app."
      );
      return;
    }
    if (!supabase) {
      Alert.alert(
        "Supabase not configured",
        "Paste your Supabase URL and anon key into this screen (or wire env config)."
      );
      return;
    }

    setBusy(true);
    setLastStatus("Opening file picker…");

    try {
      const res = await DocumentPicker.getDocumentAsync({
        type: ["*/*"],
        copyToCacheDirectory: true,
        multiple: false,
      });

      if (!res || res.canceled) {
        setBusy(false);
        setLastStatus("");
        return;
      }

      const file = res.assets?.[0];
      if (!file?.uri) throw new Error("No file selected.");

      // Basic extension check (Destiny often exports .001)
      const name = file.name || "collection.marc";
      const ext = (name.split(".").pop() || "").toLowerCase();
      if (!["001", "mrc", "marc", "dat"].includes(ext)) {
        // Allow anyway, but warn
        Alert.alert(
          "Heads up",
          "This doesn't look like a typical Destiny MARC export (.001). We'll try uploading it anyway."
        );
      }

      // Fetch file bytes
      setLastStatus("Reading file…");
      const blob = await (await fetch(file.uri)).blob();

      // Upload to Storage
      const stamp = new Date().toISOString().replace(/[:.]/g, "-");
      const storagePath = `${libraryId}/${stamp}_${name}`;

      setLastStatus("Uploading to Supabase…");

      const up = await supabase.storage
        .from(COLLECTIONS_BUCKET)
        .upload(storagePath, blob, { contentType: "application/octet-stream", upsert: true });

      if (up.error) throw new Error(up.error.message);

      // Kick off import job via Edge Function
      setLastStatus("Starting import job…");

      const invoke = await supabase.functions.invoke(IMPORT_FUNCTION, {
        body: { libraryId, storagePath },
      });

      if (invoke.error) throw new Error(invoke.error.message);

      setLastStatus("Import started. You can leave this screen.");
      Alert.alert("Upload complete", "Import started successfully.");
    } catch (err: any) {
      Alert.alert("Upload failed", err?.message || "Unknown error");
      setLastStatus("Upload failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.wrap}>
        <Text style={styles.title}>Upload Library Collection</Text>
        <Text style={styles.sub}>
          Upload your Destiny export (MARC, UTF-8). This will replace the previous collection for this library.
        </Text>

        <View style={styles.card}>
          <Text style={styles.label}>Library ID</Text>
          <Text style={styles.value}>{libraryId}</Text>

          <Text style={styles.hint}>
            For MVP, this is hard-coded. We’ll wire it to your Admin Branding settings next.
          </Text>

          <TouchableOpacity style={styles.btn} onPress={pickAndUpload} disabled={busy}>
            <Text style={styles.btnText}>{busy ? "Working…" : "Choose MARC file & Upload"}</Text>
          </TouchableOpacity>

          {busy ? <ActivityIndicator style={{ marginTop: 12 }} /> : null}
          {lastStatus ? <Text style={styles.status}>{lastStatus}</Text> : null}
        </View>

        <TouchableOpacity style={styles.link} onPress={() => router.back()}>
          <Text style={styles.linkText}>Back</Text>
        </TouchableOpacity>

        <Text style={styles.footer}>
          Note: this screen requires Supabase project setup + Edge Function “import-collection”. We’ll generate those next.
        </Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#0b0b10" },
  wrap: { flex: 1, padding: 16, gap: 12 },
  title: { color: "white", fontSize: 22, fontWeight: "800" },
  sub: { color: "rgba(255,255,255,0.75)", fontSize: 14, lineHeight: 20 },
  card: {
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
    borderRadius: 14,
    padding: 14,
    gap: 10,
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  label: { color: "rgba(255,255,255,0.7)", fontSize: 12 },
  value: { color: "white", fontSize: 16, fontWeight: "700" },
  hint: { color: "rgba(255,255,255,0.65)", fontSize: 12, lineHeight: 18 },
  btn: {
    marginTop: 4,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.35)",
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: "center",
  },
  btnText: { color: "white", fontSize: 14, fontWeight: "700" },
  status: { color: "rgba(255,255,255,0.8)", fontSize: 12, marginTop: 8 },
  link: { alignSelf: "flex-start", paddingVertical: 8, paddingHorizontal: 6 },
  linkText: { color: "rgba(255,255,255,0.9)", fontSize: 14, fontWeight: "700" },
  footer: { color: "rgba(255,255,255,0.55)", fontSize: 12, lineHeight: 18, marginTop: 8 },
});
