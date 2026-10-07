import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { router } from "expo-router";
import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Platform,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

type PickedImage = {
  name: string;
  mimeType: string;
  dataUrl: string;
  size: number;
};

const WEB_ONLY_MESSAGE = "3D Workshop V1 currently runs in the web version of NovelIdeas.";

type QualityPreset = "balanced" | "detail" | "clean";

const QUALITY_PRESETS = {
  balanced: { label: "Balanced", description: "Best first try for most objects.", textureResolution: "1024", foregroundRatio: 0.85, remesh: "none", vertexCount: -1 },
  detail: { label: "More detail", description: "Higher texture detail and a tighter crop.", textureResolution: "2048", foregroundRatio: 0.92, remesh: "none", vertexCount: -1 },
  clean: { label: "Cleaner mesh", description: "Simplifies geometry for easier game use.", textureResolution: "1024", foregroundRatio: 0.88, remesh: "triangle", vertexCount: 12000 },
} as const;

async function autoFrameImage(sourceDataUrl: string): Promise<string> {
  if (Platform.OS !== "web") return sourceDataUrl;
  const doc = (globalThis as any).document;
  if (!doc) return sourceDataUrl;
  return await new Promise((resolve) => {
    const image = new (globalThis as any).Image();
    image.onload = () => {
      try {
        const width = Number(image.naturalWidth || image.width || 1);
        const height = Number(image.naturalHeight || image.height || 1);
        const scan = doc.createElement("canvas");
        scan.width = width;
        scan.height = height;
        const scanCtx = scan.getContext("2d", { willReadFrequently: true });
        if (!scanCtx) return resolve(sourceDataUrl);
        scanCtx.drawImage(image, 0, 0);
        const data = scanCtx.getImageData(0, 0, width, height).data;
        const corners = [0, (width - 1) * 4, ((height - 1) * width) * 4, ((height * width) - 1) * 4];
        const bg = corners.reduce((acc, idx) => ({ r: acc.r + data[idx], g: acc.g + data[idx + 1], b: acc.b + data[idx + 2] }), { r: 0, g: 0, b: 0 });
        bg.r /= 4; bg.g /= 4; bg.b /= 4;
        let minX = width, minY = height, maxX = -1, maxY = -1;
        const step = Math.max(1, Math.floor(Math.max(width, height) / 700));
        for (let y = 0; y < height; y += step) {
          for (let x = 0; x < width; x += step) {
            const idx = (y * width + x) * 4;
            if (data[idx + 3] < 20) continue;
            const dr = data[idx] - bg.r, dg = data[idx + 1] - bg.g, db = data[idx + 2] - bg.b;
            if (Math.sqrt(dr * dr + dg * dg + db * db) > 34) {
              minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
            }
          }
        }
        if (maxX < minX || maxY < minY) return resolve(sourceDataUrl);
        const objectW = maxX - minX + 1, objectH = maxY - minY + 1;
        const pad = Math.round(Math.max(objectW, objectH) * 0.12);
        minX = Math.max(0, minX - pad); minY = Math.max(0, minY - pad);
        maxX = Math.min(width - 1, maxX + pad); maxY = Math.min(height - 1, maxY + pad);
        const cropW = maxX - minX + 1, cropH = maxY - minY + 1;
        const side = Math.max(cropW, cropH);
        const canvas = doc.createElement("canvas");
        canvas.width = 1024; canvas.height = 1024;
        const ctx = canvas.getContext("2d");
        if (!ctx) return resolve(sourceDataUrl);
        ctx.fillStyle = "rgb(" + Math.round(bg.r) + "," + Math.round(bg.g) + "," + Math.round(bg.b) + ")";
        ctx.fillRect(0, 0, 1024, 1024);
        const scale = 1024 / side;
        const drawW = cropW * scale, drawH = cropH * scale;
        ctx.drawImage(image, minX, minY, cropW, cropH, (1024 - drawW) / 2, (1024 - drawH) / 2, drawW, drawH);
        resolve(canvas.toDataURL("image/png"));
      } catch {
        resolve(sourceDataUrl);
      }
    };
    image.onerror = () => resolve(sourceDataUrl);
    image.src = sourceDataUrl;
  });
}

function makeViewerHtml(modelUrl: string) {
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <script type="module" src="https://unpkg.com/@google/model-viewer/dist/model-viewer.min.js"></script>
  <style>
    html,body{margin:0;width:100%;height:100%;background:#07111d;overflow:hidden}
    model-viewer{width:100%;height:100%;background:radial-gradient(circle at 50% 35%,#18304a 0,#07111d 68%);--poster-color:transparent}
  </style>
</head>
<body>
  <model-viewer src="${modelUrl}" camera-controls auto-rotate shadow-intensity="1" exposure="1" interaction-prompt="auto" alt="Generated 3D model"></model-viewer>
</body>
</html>`;
}

export default function ThreeDWorkshopRoute() {
  const [picked, setPicked] = useState<PickedImage | null>(null);
  const [modelUrl, setModelUrl] = useState<string | null>(null);
  const [status, setStatus] = useState("Choose a single object image to begin.");
  const [generating, setGenerating] = useState(false);
  const [qualityPreset, setQualityPreset] = useState<QualityPreset>("balanced");
  const [generationCount, setGenerationCount] = useState(0);
  const [autoFrame, setAutoFrame] = useState(true);
  const [preparedDataUrl, setPreparedDataUrl] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      if (modelUrl && Platform.OS === "web") URL.revokeObjectURL(modelUrl);
    };
  }, [modelUrl]);

  const viewerHtml = useMemo(() => (modelUrl ? makeViewerHtml(modelUrl) : ""), [modelUrl]);

  function chooseImage() {
    if (Platform.OS !== "web") {
      setStatus(WEB_ONLY_MESSAGE);
      return;
    }
    const doc = (globalThis as any).document;
    if (!doc) {
      setStatus("The browser file picker is unavailable.");
      return;
    }
    const input = doc.createElement("input");
    input.type = "file";
    input.accept = "image/png,image/jpeg,image/webp";
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) return;
      if (file.size > 3 * 1024 * 1024) {
        setStatus("Use an image smaller than 3 MB for this first version.");
        return;
      }
      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = typeof reader.result === "string" ? reader.result : "";
        if (!dataUrl) {
          setStatus("NovelIdeas could not read that image.");
          return;
        }
        if (modelUrl) URL.revokeObjectURL(modelUrl);
        setModelUrl(null);
        setPicked({
          name: file.name || "image",
          mimeType: file.type || "image/png",
          dataUrl,
          size: file.size,
        });
        setStatus("Image ready. Auto-frame is on; you can turn it off below if you prefer the original.");
      };
      reader.onerror = () => setStatus("NovelIdeas could not read that image.");
      reader.readAsDataURL(file);
    };
    input.click();
  }

  async function generateModel() {
    if (!picked || generating || Platform.OS !== "web") return;
    setGenerating(true);
    setStatus("Building the 3D model…");
    try {
      const response = await fetch("/api/3d-generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imageBase64: picked.dataUrl,
          mimeType: picked.mimeType,
          textureResolution: "1024",
          foregroundRatio: 0.85,
          remesh: "none",
          vertexCount: -1,
        }),
      });

      if (!response.ok) {
        let message = "The model could not be generated.";
        try {
          const body = await response.json();
          if (typeof body?.message === "string") message = body.message;
        } catch {}
        throw new Error(message);
      }

      const blob = await response.blob();
      if (modelUrl) URL.revokeObjectURL(modelUrl);
      const nextUrl = URL.createObjectURL(blob);
      setModelUrl(nextUrl);
      setStatus("Model ready. Drag to rotate it, scroll to zoom, or save the GLB.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "The model could not be generated.");
    } finally {
      setGenerating(false);
    }
  }

  function downloadModel() {
    if (!modelUrl || Platform.OS !== "web") return;
    const doc = (globalThis as any).document;
    if (!doc) return;
    const anchor = doc.createElement("a");
    anchor.href = modelUrl;
    anchor.download = "novelideas-3d-model.glb";
    anchor.click();
  }

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.topBar}>
          <TouchableOpacity style={styles.backButton} onPress={() => router.back()} accessibilityRole="button">
            <MaterialCommunityIcons name="arrow-left" size={20} color="#e7edf7" />
            <Text style={styles.backText}>NovelIdeas</Text>
          </TouchableOpacity>
          <View style={styles.badge}>
            <MaterialCommunityIcons name="cube-scan" size={16} color="#8dd8ff" />
            <Text style={styles.badgeText}>V1</Text>
          </View>
        </View>

        <View style={styles.hero}>
          <Text style={styles.eyebrow}>NOVELIDEAS LAB</Text>
          <Text style={styles.title}>3D Workshop</Text>
          <Text style={styles.subtitle}>Turn a single 2D object image into a textured, rotatable 3D model.</Text>
        </View>

        {Platform.OS !== "web" ? (
          <View style={styles.notice}>
            <Text style={styles.noticeTitle}>Web version required for V1</Text>
            <Text style={styles.noticeText}>{WEB_ONLY_MESSAGE}</Text>
          </View>
        ) : (
          <View style={styles.workspace}>
            <View style={styles.panel}>
              <Text style={styles.panelTitle}>1. Source image</Text>
              <Text style={styles.help}>
                Best results come from one clearly visible object with little or no background.
              </Text>

              <TouchableOpacity style={styles.primaryButton} onPress={chooseImage} accessibilityRole="button">
                <MaterialCommunityIcons name="image-plus" size={20} color="#06121f" />
                <Text style={styles.primaryButtonText}>{picked ? "Choose a different image" : "Choose image"}</Text>
              </TouchableOpacity>

              {picked ? (
                <View style={styles.previewCard}>
                  <Image source={{ uri: autoFrame && preparedDataUrl ? preparedDataUrl : picked.dataUrl }} style={styles.previewImage} resizeMode="contain" />
                  <Text style={styles.fileName} numberOfLines={1}>{picked.name}</Text>
                  <Text style={styles.fileMeta}>{autoFrame ? "Auto-framed preview" : "Original image"} · {Math.max(1, Math.round(picked.size / 1024))} KB</Text>
                </View>
              ) : (
                <View style={styles.emptyPreview}>
                  <MaterialCommunityIcons name="image-outline" size={44} color="#63809a" />
                  <Text style={styles.emptyText}>No image selected</Text>
                </View>
              )}

              <TouchableOpacity
                style={[styles.generateButton, (!picked || generating) && styles.disabledButton]}
                onPress={generateModel}
                disabled={!picked || generating}
                accessibilityRole="button"
              >
                {generating ? <ActivityIndicator color="#06121f" /> : <MaterialCommunityIcons name="cube-outline" size={21} color="#06121f" />}
                <Text style={styles.generateButtonText}>{generating ? "Generating…" : generationCount > 0 ? "Generate another version" : "Generate 3D model"}</Text>
              </TouchableOpacity>
            </View>

            <View style={[styles.panel, styles.viewerPanel]}>
              <Text style={styles.panelTitle}>2. 3D model</Text>
              {modelUrl ? (
                <>
                  {React.createElement("iframe" as any, {
                    title: "NovelIdeas 3D model viewer",
                    srcDoc: viewerHtml,
                    style: {
                      width: "100%",
                      height: 480,
                      border: "1px solid #27445e",
                      borderRadius: 14,
                      background: "#07111d",
                    },
                  })}
                  <TouchableOpacity style={styles.secondaryButton} onPress={downloadModel} accessibilityRole="button">
                    <MaterialCommunityIcons name="download" size={20} color="#bce9ff" />
                    <Text style={styles.secondaryButtonText}>Save GLB</Text>
                  </TouchableOpacity>
                </>
              ) : (
                <View style={styles.emptyViewer}>
                  <MaterialCommunityIcons name="cube-scan" size={72} color="#355a76" />
                  <Text style={styles.emptyViewerTitle}>Your model will appear here</Text>
                  <Text style={styles.emptyViewerText}>Once generated, you will be able to rotate, zoom, inspect, and save it.</Text>
                </View>
              )}
            </View>
          </View>
        )}

        <View style={styles.statusBox}>
          <Text style={styles.statusLabel}>STATUS</Text>
          <Text style={styles.statusText}>{status}</Text>
        </View>

        <Text style={styles.engineNote}>
          Engine: Stability AI Stable Fast 3D. The API key stays on the NovelIdeas server and is never sent to the browser.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#040b13" },
  content: { width: "100%", maxWidth: 1320, alignSelf: "center", padding: 22, paddingBottom: 50 },
  topBar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 18 },
  backButton: { minHeight: 44, flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 12, borderRadius: 10, borderWidth: 1, borderColor: "#29455d", backgroundColor: "#091725" },
  backText: { color: "#e7edf7", fontWeight: "800" },
  badge: { flexDirection: "row", gap: 6, alignItems: "center", paddingHorizontal: 10, paddingVertical: 7, borderRadius: 999, borderWidth: 1, borderColor: "#2e607c", backgroundColor: "#092033" },
  badgeText: { color: "#8dd8ff", fontSize: 12, fontWeight: "900", letterSpacing: 1 },
  hero: { alignItems: "center", paddingVertical: 24, paddingHorizontal: 12 },
  eyebrow: { color: "#78cfff", fontSize: 12, fontWeight: "900", letterSpacing: 3 },
  title: { color: "#f5f8fc", fontSize: 48, lineHeight: 54, fontWeight: "900", textAlign: "center", marginTop: 5 },
  subtitle: { maxWidth: 700, color: "#b9c8d6", fontSize: 18, lineHeight: 27, textAlign: "center", marginTop: 8 },
  workspace: { flexDirection: "row", flexWrap: "wrap", gap: 18, alignItems: "stretch" },
  panel: { flexGrow: 1, flexBasis: 380, minWidth: 300, padding: 18, borderRadius: 18, borderWidth: 1, borderColor: "#1d4058", backgroundColor: "#081521" },
  viewerPanel: { flexBasis: 560 },
  panelTitle: { color: "#f1f6fb", fontSize: 21, fontWeight: "900", marginBottom: 7 },
  help: { color: "#94a9bb", fontSize: 14, lineHeight: 20, marginBottom: 14 },
  primaryButton: { minHeight: 48, borderRadius: 11, backgroundColor: "#7bd4ff", flexDirection: "row", gap: 9, alignItems: "center", justifyContent: "center", paddingHorizontal: 16 },
  primaryButtonText: { color: "#06121f", fontSize: 15, fontWeight: "900" },
  previewCard: { marginTop: 16, borderRadius: 14, borderWidth: 1, borderColor: "#23445b", backgroundColor: "#06101a", padding: 12 },
  previewImage: { width: "100%", height: 300, borderRadius: 10, backgroundColor: "#ffffff" },
  fileName: { color: "#dfeaf3", fontSize: 14, fontWeight: "800", marginTop: 10 },
  fileMeta: { color: "#7890a4", fontSize: 12, marginTop: 2 },
  emptyPreview: { height: 340, marginTop: 16, borderRadius: 14, borderWidth: 1, borderStyle: "dashed", borderColor: "#29475d", backgroundColor: "#06101a", alignItems: "center", justifyContent: "center", gap: 8 },
  emptyText: { color: "#71879a", fontWeight: "700" },
  generateButton: { minHeight: 52, marginTop: 16, borderRadius: 11, backgroundColor: "#76e0b4", flexDirection: "row", gap: 9, alignItems: "center", justifyContent: "center", paddingHorizontal: 16 },
  disabledButton: { opacity: 0.4 },
  generateButtonText: { color: "#06121f", fontSize: 15, fontWeight: "900" },
  secondaryButton: { minHeight: 48, marginTop: 14, borderRadius: 11, borderWidth: 1, borderColor: "#3b718f", backgroundColor: "#0a2232", flexDirection: "row", gap: 8, alignItems: "center", justifyContent: "center" },
  secondaryButtonText: { color: "#bce9ff", fontSize: 15, fontWeight: "900" },
  emptyViewer: { minHeight: 545, borderRadius: 14, borderWidth: 1, borderStyle: "dashed", borderColor: "#29475d", backgroundColor: "#06101a", alignItems: "center", justifyContent: "center", padding: 30 },
  emptyViewerTitle: { color: "#c9d7e4", fontSize: 19, fontWeight: "900", marginTop: 14, textAlign: "center" },
  emptyViewerText: { maxWidth: 420, color: "#7890a4", fontSize: 14, lineHeight: 21, marginTop: 7, textAlign: "center" },
  notice: { padding: 20, borderRadius: 14, borderWidth: 1, borderColor: "#705b27", backgroundColor: "#211b0d" },
  noticeTitle: { color: "#ffe29b", fontSize: 18, fontWeight: "900" },
  noticeText: { color: "#dbc995", marginTop: 7, lineHeight: 21 },
  statusBox: { marginTop: 18, padding: 14, borderRadius: 12, borderWidth: 1, borderColor: "#203d52", backgroundColor: "#07131e", flexDirection: "row", gap: 12, alignItems: "flex-start" },
  statusLabel: { color: "#68c9f7", fontSize: 11, fontWeight: "900", letterSpacing: 1.6, paddingTop: 2 },
  statusText: { flex: 1, color: "#c4d3df", fontSize: 14, lineHeight: 20 },
  sourcePrepSection: { marginTop: 16 },
  sourcePrepCard: { flexDirection: "row", alignItems: "center", gap: 10, padding: 11, borderRadius: 10, borderWidth: 1, borderColor: "#24445a", backgroundColor: "#07111b" },
  sourcePrepCardActive: { borderColor: "#3d7897", backgroundColor: "#082033" },
  sourcePrepCopy: { flex: 1 },
  sourcePrepTitle: { color: "#e6eff6", fontSize: 13, fontWeight: "900" },
  sourcePrepText: { color: "#7f95a7", fontSize: 11, lineHeight: 15, marginTop: 2 },
  sourcePrepState: { color: "#7890a4", fontSize: 10, fontWeight: "900", letterSpacing: 1 },
  sourcePrepStateActive: { color: "#7bd4ff" },
  qualitySection: { marginTop: 16 },
  qualityTitle: { color: "#dbe8f2", fontSize: 12, fontWeight: "900", letterSpacing: 1, textTransform: "uppercase", marginBottom: 8 },
  qualityRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  qualityCard: { flexGrow: 1, flexBasis: 105, minWidth: 100, padding: 10, borderRadius: 10, borderWidth: 1, borderColor: "#24445a", backgroundColor: "#07111b" },
  qualityCardSelected: { borderColor: "#65bfe8", backgroundColor: "#0b2638" },
  qualityLabel: { color: "#b9c8d6", fontSize: 13, fontWeight: "900" },
  qualityLabelSelected: { color: "#8dd8ff" },
  qualityDescription: { color: "#7f95a7", fontSize: 11, lineHeight: 15, marginTop: 3 },
  qualityMeta: { color: "#58768b", fontSize: 10, marginTop: 6 },
  engineNote: { color: "#657d90", fontSize: 12, lineHeight: 18, textAlign: "center", marginTop: 14 },
});
