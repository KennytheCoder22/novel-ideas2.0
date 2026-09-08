import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { Image, type ImageSource } from "expo-image";
import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import type {
  UnwrittenMapActorRole,
  UnwrittenMapArtDefinition,
} from "../../../lib/recommendationGames/unwrittenMapPresentationContract";
import {
  UNWRITTEN_MAP_REGION_REGISTRY,
  unwrittenMapPaletteHex,
  type UnwrittenMapRegionId,
} from "../../../lib/recommendationGames/unwrittenMapRegions";
import type { UnwrittenMapLocalAssetId } from "../../../lib/recommendationGames/unwrittenMapArtAssets";
import { UNWRITTEN_MAP_TOKENS } from "./UnwrittenMapTemplates";

const LOCAL_ART_SOURCES: Partial<Record<UnwrittenMapLocalAssetId, ImageSource>> = {
  "frog-parliament-encounter": require("../../../assets/games/unwritten-map/frog-encounter.webp"),
  "frog-parliament-choice-hear-frogs": require("../../../assets/games/unwritten-map/frog-hear.webp"),
  "frog-parliament-choice-night-pageant": require("../../../assets/games/unwritten-map/frog-pageant.webp"),
  "frog-parliament-choice-moon-experiment": require("../../../assets/games/unwritten-map/frog-experiment.webp"),
  "frog-parliament-choice-grand-speech": require("../../../assets/games/unwritten-map/frog-speech.webp"),
  "frog-parliament-result-hear-frogs": require("../../../assets/games/unwritten-map/result-frog-hear.webp"),
  "frog-parliament-result-night-pageant": require("../../../assets/games/unwritten-map/result-frog-pageant.webp"),
  "frog-parliament-result-moon-experiment": require("../../../assets/games/unwritten-map/result-moon-frog.webp"),
  "frog-parliament-result-grand-speech": require("../../../assets/games/unwritten-map/result-frog-speech.webp"),
};

const MOTIF_ICONS: Record<string, keyof typeof MaterialCommunityIcons.glyphMap> = {
  "wildflowers": "flower-outline",
  "lantern-glow": "lightbulb",
  "orchard-blossom": "flower-pollen-outline",
  "meadow-grass": "grass",
  "golden-light": "weather-sunny",
  "striped-pavilion": "tent",
  "meadow-vista": "image-filter-hdr",
  "brass-gears": "cog-outline",
  "timber-beams": "bridge",
  "windmill-blades": "wind-turbine",
  "highland-pasture": "land-fields",
  "cloud-flock": "weather-cloudy",
  "forge-glow": "fire",
  "ironwood-vista": "image-filter-hdr",
  "reeds": "grass",
  "frogs": "paw",
  "lily-pads": "flower-outline",
  "marsh-water": "waves",
  "mist": "weather-fog",
  "wetland-flora": "sprout",
  "wetland-vista": "image-filter-hdr",
  "storm-clouds": "weather-lightning",
  "canvas-tents": "tent",
  "kite-string": "kite-outline",
  "rolling-hills": "image-filter-hdr",
  "rain-sheets": "weather-pouring",
  "wagon-wheels": "wheel-barrow",
  "westreach-vista": "image-filter-hdr",
  "blue-embers": "fire",
  "ash-drift": "weather-windy",
  "vine-stairway": "stairs",
  "cinder-stone": "terrain",
  "lantern-books": "book-open-page-variant-outline",
  "peach-cloud-light": "weather-sunset",
  "ashpeak-vista": "image-filter-hdr",
  "sea-glass": "diamond-stone",
  "lighthouse-beam": "lighthouse-on",
  "star-fall": "star-shooting-outline",
  "tide-foam": "waves",
  "ferry-lanterns": "ferry",
  "night-tide": "weather-night",
  "tideglass-vista": "image-filter-hdr",
};

const ROLE_ICONS: Record<UnwrittenMapActorRole, keyof typeof MaterialCommunityIcons.glyphMap> = {
  explorer: "hiking",
  community: "account-group-outline",
  creature: "paw-outline",
  environment: "image-filter-hdr",
};

export type UnwrittenMapArtProps = {
  art: UnwrittenMapArtDefinition;
  actorRole: UnwrittenMapActorRole;
  regionId: UnwrittenMapRegionId;
  label: string;
  variant: "encounter" | "choice" | "result";
};

export function UnwrittenMapArt({
  art,
  actorRole,
  regionId,
  label,
  variant,
}: UnwrittenMapArtProps) {
  const [failedAssetId, setFailedAssetId] = useState<UnwrittenMapLocalAssetId | null>(null);
  const region = UNWRITTEN_MAP_REGION_REGISTRY[regionId];
  const accent = unwrittenMapPaletteHex(art.paletteId) || region.paletteHex.primary;
  const source = art.kind === "local_asset" ? LOCAL_ART_SOURCES[art.assetId] : undefined;
  const useLocalAsset = art.kind === "local_asset" && source && failedAssetId !== art.assetId;
  const motifTokens = art.kind === "vector_composition"
    ? art.motifTokens
    : [region.canonicalMotifTokens[0], region.fallbackMotifToken];
  const visibleMotifs = motifTokens.slice(0, variant === "choice" ? 2 : 3);
  const shapeTokens = art.kind === "vector_composition" ? art.shapeTokens : [];
  const sigil = label
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean)
    .slice(0, 3)
    .map((word) => word[0])
    .join("")
    .toUpperCase();

  if (useLocalAsset) {
    return (
      <View
        style={[styles.localArtFrame, variant === "choice" && styles.localArtFrameChoice]}
        accessibilityRole="image"
        accessibilityLabel={`${label}. ${actorRole === "explorer" ? "The explorer performs this action." : "Encounter illustration."}`}
      >
        <Image
          source={source}
          style={styles.localArt}
          contentFit={variant === "choice" ? "contain" : "cover"}
          onError={() => setFailedAssetId(art.assetId)}
          accessibilityElementsHidden
        />
        {actorRole === "explorer" ? (
          <View style={[styles.localExplorerSeal, { borderColor: accent }]}>
            <MaterialCommunityIcons name="hiking" size={variant === "choice" ? 16 : 24} color={UNWRITTEN_MAP_TOKENS.color.ink} />
          </View>
        ) : null}
      </View>
    );
  }

  return (
    <View
      style={[
        styles.composition,
        variant === "choice" && styles.choiceComposition,
        { backgroundColor: `${accent}2b`, borderColor: accent },
      ]}
      accessibilityRole="image"
      accessibilityLabel={`${label}. ${actorRole === "explorer" ? "The explorer performs this action." : "Encounter illustration."}`}
    >
      <View style={[styles.horizon, { backgroundColor: `${region.paletteHex.fallback}99` }]} />
      <View style={styles.shapeRow}>
        {shapeTokens.map((shape, index) => (
          <View
            key={`${art.id}:${shape}`}
            style={[
              styles.shapeMark,
              shape === "dot-cluster" && styles.shapeDot,
              shape === "arc" && styles.shapeArc,
              shape === "band" && styles.shapeBand,
              shape === "lattice" && styles.shapeLattice,
              { borderColor: accent, transform: [{ rotate: `${(art.id.length + index * 17) % 35 - 17}deg` }] },
            ]}
          />
        ))}
      </View>
      <View style={styles.motifRow}>
        {visibleMotifs.map((motif, index) => (
          <MaterialCommunityIcons
            key={`${art.id}:${motif}`}
            name={MOTIF_ICONS[motif] || "star-four-points-outline"}
            size={variant === "choice" ? 20 + index * 3 : 34 + index * 5}
            color={index === 1 ? region.paletteHex.accent : accent}
          />
        ))}
      </View>
      <View style={[styles.actorSeal, variant === "choice" && styles.actorSealChoice, { borderColor: accent }]}>
        <MaterialCommunityIcons
          name={ROLE_ICONS[actorRole]}
          size={variant === "choice" ? 23 : 42}
          color={UNWRITTEN_MAP_TOKENS.color.ink}
        />
      </View>
      <Text style={[styles.sigil, variant === "choice" && styles.sigilChoice]}>{sigil}</Text>
      {variant === "choice" ? null : (
        <Text numberOfLines={2} style={styles.caption}>{label.toUpperCase()}</Text>
      )}
    </View>
  );
}

export function UnwrittenMapRegionMotifs({ regionId }: { regionId: UnwrittenMapRegionId }) {
  const region = UNWRITTEN_MAP_REGION_REGISTRY[regionId];
  return (
    <View pointerEvents="none" style={styles.regionMotifs}>
      {region.canonicalMotifTokens.slice(0, 4).map((motif, index) => (
        <MaterialCommunityIcons
          key={motif}
          name={MOTIF_ICONS[motif] || "star-four-points-outline"}
          size={22 + index * 4}
          color={index % 2 ? region.paletteHex.accent : region.paletteHex.primary}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  localArt: {
    width: "100%",
    height: "100%",
  },
  localArtFrame: {
    position: "relative",
    width: "100%",
    height: "100%",
    minHeight: 150,
  },
  localArtFrameChoice: {
    width: 70,
    minHeight: 58,
    height: 58,
    marginRight: 10,
  },
  localExplorerSeal: {
    position: "absolute",
    right: 6,
    bottom: 6,
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 1.5,
    backgroundColor: "rgba(247,231,176,0.9)",
    alignItems: "center",
    justifyContent: "center",
  },
  composition: {
    position: "relative",
    width: "100%",
    minHeight: 150,
    overflow: "hidden",
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  choiceComposition: {
    width: 70,
    minHeight: 58,
    height: 58,
    marginRight: 10,
    borderRadius: 3,
  },
  horizon: {
    position: "absolute",
    left: "-10%",
    right: "-10%",
    bottom: "-35%",
    height: "68%",
    borderTopLeftRadius: 999,
    borderTopRightRadius: 999,
  },
  shapeRow: {
    ...StyleSheet.absoluteFillObject,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-around",
    opacity: 0.34,
  },
  shapeMark: {
    width: 38,
    height: 38,
    borderWidth: 2,
  },
  shapeDot: {
    width: 13,
    height: 13,
    borderRadius: 7,
    borderWidth: 3,
  },
  shapeArc: {
    width: 48,
    height: 25,
    borderRadius: 24,
    borderBottomWidth: 0,
  },
  shapeBand: {
    width: 52,
    height: 10,
  },
  shapeLattice: {
    borderStyle: "dashed",
  },
  motifRow: {
    position: "absolute",
    left: 8,
    right: 8,
    top: 8,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    opacity: 0.82,
  },
  actorSeal: {
    width: 72,
    height: 72,
    borderRadius: 36,
    borderWidth: 2,
    backgroundColor: "rgba(247,231,176,0.86)",
    alignItems: "center",
    justifyContent: "center",
  },
  actorSealChoice: {
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 1,
  },
  sigil: {
    position: "absolute",
    right: 7,
    bottom: 7,
    color: UNWRITTEN_MAP_TOKENS.color.ink,
    fontFamily: UNWRITTEN_MAP_TOKENS.font.display,
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 1,
  },
  sigilChoice: {
    right: 3,
    bottom: 2,
    fontSize: 6,
  },
  caption: {
    position: "absolute",
    left: 8,
    right: 8,
    bottom: 7,
    color: UNWRITTEN_MAP_TOKENS.color.ink,
    fontFamily: UNWRITTEN_MAP_TOKENS.font.display,
    fontSize: 9,
    lineHeight: 12,
    fontWeight: "900",
    letterSpacing: 0.7,
    textAlign: "center",
  },
  regionMotifs: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    opacity: 0.55,
  },
});
