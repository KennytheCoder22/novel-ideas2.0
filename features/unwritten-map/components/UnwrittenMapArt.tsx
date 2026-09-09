import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { Image, type ImageSource } from "expo-image";
import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import {
  unwrittenMapHasCommissionedArt,
  type UnwrittenMapActorRole,
  type UnwrittenMapArtDefinition,
} from "../../../lib/recommendationGames/unwrittenMapPresentationContract";
import {
  UNWRITTEN_MAP_REGION_REGISTRY,
  type UnwrittenMapRegionId,
} from "../../../lib/recommendationGames/unwrittenMapRegions";
import type { UnwrittenMapLocalAssetId } from "../../../lib/recommendationGames/unwrittenMapArtAssets";
import { UNWRITTEN_MAP_TOKENS } from "./UnwrittenMapTemplates";

const LOCAL_ART_SOURCES: Partial<Record<UnwrittenMapLocalAssetId, ImageSource>> = {
  "lantern-fair-encounter": require("../../../assets/games/unwritten-map/illustrations/sunmeadow/lantern-fair/lantern-fair-encounter.webp"),
  "lantern-fair-result-take-stage": require("../../../assets/games/unwritten-map/illustrations/sunmeadow/lantern-fair/lantern-fair-result-take-stage.webp"),
  "lantern-fair-result-balcony-view": require("../../../assets/games/unwritten-map/illustrations/sunmeadow/lantern-fair/lantern-fair-result-balcony-view.webp"),
  "lantern-fair-result-hidden-melody": require("../../../assets/games/unwritten-map/illustrations/sunmeadow/lantern-fair/lantern-fair-result-hidden-melody.webp"),
  "lantern-fair-result-help-lanterns": require("../../../assets/games/unwritten-map/illustrations/sunmeadow/lantern-fair/lantern-fair-result-help-lanterns.webp"),
  "lantern-fair-choice-take-stage": require("../../../assets/games/unwritten-map/illustrations/sunmeadow/lantern-fair/lantern-fair-choice-take-stage.webp"),
  "lantern-fair-choice-balcony-view": require("../../../assets/games/unwritten-map/illustrations/sunmeadow/lantern-fair/lantern-fair-choice-balcony-view.webp"),
  "lantern-fair-choice-hidden-melody": require("../../../assets/games/unwritten-map/illustrations/sunmeadow/lantern-fair/lantern-fair-choice-hidden-melody.webp"),
  "lantern-fair-choice-help-lanterns": require("../../../assets/games/unwritten-map/illustrations/sunmeadow/lantern-fair/lantern-fair-choice-help-lanterns.webp"),
  "whisper-orchard-encounter": require("../../../assets/games/unwritten-map/illustrations/sunmeadow/whisper-orchard/whisper-orchard-encounter.webp"),
  "whisper-orchard-choice-call-light": require("../../../assets/games/unwritten-map/illustrations/sunmeadow/whisper-orchard/whisper-orchard-choice-call-light.webp"),
  "whisper-orchard-choice-trail-light": require("../../../assets/games/unwritten-map/illustrations/sunmeadow/whisper-orchard/whisper-orchard-choice-trail-light.webp"),
  "whisper-orchard-choice-decode-trees": require("../../../assets/games/unwritten-map/illustrations/sunmeadow/whisper-orchard/whisper-orchard-choice-decode-trees.webp"),
  "whisper-orchard-choice-taste-fruit": require("../../../assets/games/unwritten-map/illustrations/sunmeadow/whisper-orchard/whisper-orchard-choice-taste-fruit.webp"),
  "whisper-orchard-result-call-light": require("../../../assets/games/unwritten-map/illustrations/sunmeadow/whisper-orchard/whisper-orchard-result-call-light.webp"),
  "whisper-orchard-result-trail-light": require("../../../assets/games/unwritten-map/illustrations/sunmeadow/whisper-orchard/whisper-orchard-result-trail-light.webp"),
  "whisper-orchard-result-decode-trees": require("../../../assets/games/unwritten-map/illustrations/sunmeadow/whisper-orchard/whisper-orchard-result-decode-trees.webp"),
  "whisper-orchard-result-taste-fruit": require("../../../assets/games/unwritten-map/illustrations/sunmeadow/whisper-orchard/whisper-orchard-result-taste-fruit.webp"),
  "clockwork-bridge-encounter": require("../../../assets/games/unwritten-map/illustrations/ironwood/clockwork-bridge/clockwork-bridge-encounter.webp"),
  "clockwork-bridge-choice-gear-puzzle": require("../../../assets/games/unwritten-map/illustrations/ironwood/clockwork-bridge/clockwork-bridge-choice-gear-puzzle.webp"),
  "clockwork-bridge-choice-rope-crossing": require("../../../assets/games/unwritten-map/illustrations/ironwood/clockwork-bridge/clockwork-bridge-choice-rope-crossing.webp"),
  "clockwork-bridge-choice-mediate-gears": require("../../../assets/games/unwritten-map/illustrations/ironwood/clockwork-bridge/clockwork-bridge-choice-mediate-gears.webp"),
  "clockwork-bridge-choice-paint-blueprint": require("../../../assets/games/unwritten-map/illustrations/ironwood/clockwork-bridge/clockwork-bridge-choice-paint-blueprint.webp"),
  "clockwork-bridge-result-gear-puzzle": require("../../../assets/games/unwritten-map/illustrations/ironwood/clockwork-bridge/clockwork-bridge-result-gear-puzzle.webp"),
  "clockwork-bridge-result-rope-crossing": require("../../../assets/games/unwritten-map/illustrations/ironwood/clockwork-bridge/clockwork-bridge-result-rope-crossing.webp"),
  "clockwork-bridge-result-mediate-gears": require("../../../assets/games/unwritten-map/illustrations/ironwood/clockwork-bridge/clockwork-bridge-result-mediate-gears.webp"),
  "clockwork-bridge-result-paint-blueprint": require("../../../assets/games/unwritten-map/illustrations/ironwood/clockwork-bridge/clockwork-bridge-result-paint-blueprint.webp"),
  "cloud-shepherd-encounter": require("../../../assets/games/unwritten-map/illustrations/ironwood/cloud-shepherd/cloud-shepherd-encounter.webp"),
  "mirror-marsh-encounter": require("../../../assets/games/unwritten-map/illustrations/mossmere/mirror-marsh/mirror-marsh-encounter.webp"),
  "rain-camp-encounter": require("../../../assets/games/unwritten-map/illustrations/westreach/rain-camp/rain-camp-encounter.webp"),
  "paper-dragon-encounter": require("../../../assets/games/unwritten-map/illustrations/westreach/paper-dragon/paper-dragon-encounter.webp"),
  "ember-library-encounter": require("../../../assets/games/unwritten-map/illustrations/ashpeak/ember-library/ember-library-encounter.webp"),
  "giant-garden-encounter": require("../../../assets/games/unwritten-map/illustrations/ashpeak/giant-garden/giant-garden-encounter.webp"),
  "old-lighthouse-encounter": require("../../../assets/games/unwritten-map/illustrations/tideglass/old-lighthouse/old-lighthouse-encounter.webp"),
  "star-ferry-encounter": require("../../../assets/games/unwritten-map/illustrations/tideglass/star-ferry/star-ferry-encounter.webp"),
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
  if (!unwrittenMapHasCommissionedArt(art) || !source) return null;

  if (!loadFailed) {
    return (
      <Image
        source={source}
        style={[styles.localArt, variant === "choice" && styles.localChoiceArt]}
        contentFit={variant === "choice" ? "contain" : "cover"}
        onError={() => setLoadFailed(true)}
        accessible={variant === "encounter"}
        aria-hidden={variant !== "encounter"}
        accessibilityElementsHidden={variant !== "encounter"}
        importantForAccessibility={variant !== "encounter" ? "no-hide-descendants" : "auto"}
        alt={variant !== "encounter" ? "" : undefined}
        accessibilityLabel={variant === "encounter" ? `${label}. Illustrated local artwork; depicted actor role: ${actorRole}.` : ""}
      />
    );
  }

  return (
    <View
      style={[styles.unavailable, variant === "choice" && styles.unavailableChoice]}
      accessibilityRole="image"
      accessible={variant !== "choice"}
      accessibilityElementsHidden={variant === "choice"}
      importantForAccessibility={variant === "choice" ? "no-hide-descendants" : "auto"}
      accessibilityLabel={variant === "choice" ? "" : `${label}. Authorized illustration unavailable.`}
    >
      <MaterialCommunityIcons
        name="image-broken-variant"
        size={variant === "choice" ? 22 : 34}
        color={UNWRITTEN_MAP_TOKENS.color.mutedInk}
      />
      <Text numberOfLines={variant === "choice" ? 2 : 3} style={[styles.unavailableText, variant === "choice" && styles.unavailableTextChoice]}>
        IMAGE COULD NOT LOAD
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
