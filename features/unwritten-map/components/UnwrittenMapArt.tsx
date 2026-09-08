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
  type UnwrittenMapRegionId,
} from "../../../lib/recommendationGames/unwrittenMapRegions";
import type { UnwrittenMapLocalAssetId } from "../../../lib/recommendationGames/unwrittenMapArtAssets";
import { UNWRITTEN_MAP_TOKENS } from "./UnwrittenMapTemplates";

const LOCAL_ART_SOURCES: Partial<Record<UnwrittenMapLocalAssetId, ImageSource>> = {
  "lantern-fair-encounter": require("../../../assets/games/unwritten-map/illustrations/sunmeadow/lantern-fair/lantern-fair-encounter.webp"),
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
  "brass-gears": "cog-outline",
  "windmill-blades": "wind-turbine",
  "cloud-flock": "weather-cloudy",
  "reeds": "grass",
  "frogs": "paw",
  "lily-pads": "flower-outline",
  "marsh-water": "waves",
  "mist": "weather-fog",
  "storm-clouds": "weather-lightning",
  "canvas-tents": "tent",
  "kite-string": "kite-outline",
  "rain-sheets": "weather-pouring",
  "blue-embers": "fire",
  "vine-stairway": "stairs",
  "lantern-books": "book-open-page-variant-outline",
  "sea-glass": "diamond-stone",
  "lighthouse-beam": "lighthouse-on",
  "star-fall": "star-shooting-outline",
  "tide-foam": "waves",
  "ferry-lanterns": "ferry",
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
  const [loadFailed, setLoadFailed] = useState(false);
  const source = art.localAssetId ? LOCAL_ART_SOURCES[art.localAssetId] : undefined;
  const available = art.status === "approved" && source && !loadFailed;

  if (available) {
    return (
      <Image
        source={source}
        style={[styles.localArt, variant === "choice" && styles.localChoiceArt]}
        contentFit={variant === "choice" ? "contain" : "cover"}
        onError={() => setLoadFailed(true)}
        accessibilityLabel={`${label}. Illustrated local artwork; depicted actor role: ${actorRole}.`}
      />
    );
  }

  return (
    <View
      style={[styles.unavailable, variant === "choice" && styles.unavailableChoice]}
      accessibilityRole="image"
      accessibilityLabel={`${label}. Authorized illustration unavailable.`}
    >
      <MaterialCommunityIcons
        name={loadFailed ? "image-broken-variant" : "image-outline"}
        size={variant === "choice" ? 22 : 34}
        color={UNWRITTEN_MAP_TOKENS.color.mutedInk}
      />
      <Text numberOfLines={variant === "choice" ? 2 : 3} style={[styles.unavailableText, variant === "choice" && styles.unavailableTextChoice]}>
        {loadFailed ? "IMAGE COULD NOT LOAD" : "AUTHORIZED ILLUSTRATION REQUIRED"}
      </Text>
      {variant === "choice" ? null : <Text style={styles.assetId}>{art.assetId}</Text>}
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
    minHeight: 150,
  },
  localChoiceArt: {
    width: 70,
    minHeight: 58,
    height: 58,
    marginRight: 10,
  },
  unavailable: {
    width: "100%",
    minHeight: 150,
    padding: 14,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: "#765b34",
    backgroundColor: "rgba(235,220,183,0.82)",
    alignItems: "center",
    justifyContent: "center",
  },
  unavailableChoice: {
    width: 70,
    minHeight: 58,
    height: 58,
    marginRight: 10,
    padding: 4,
  },
  unavailableText: {
    color: UNWRITTEN_MAP_TOKENS.color.mutedInk,
    fontSize: 9,
    lineHeight: 13,
    fontWeight: "900",
    letterSpacing: 0.7,
    textAlign: "center",
    marginTop: 6,
  },
  unavailableTextChoice: {
    fontSize: 6,
    lineHeight: 8,
    marginTop: 2,
  },
  assetId: {
    color: "#765b31",
    fontSize: 8,
    marginTop: 5,
  },
  regionMotifs: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    opacity: 0.55,
  },
});
