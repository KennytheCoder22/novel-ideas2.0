import type { ReactNode } from "react";
import { Image, type ImageSourcePropType, StyleSheet, View } from "react-native";
import type { MediaManiaEnvironmentScene } from "./mediaManiaPresentation";

const SCENE_ASSETS: Record<MediaManiaEnvironmentScene, ImageSourcePropType> = {
  landing: require("../../../assets/games/media-mania-environment/landing.webp"),
  like: require("../../../assets/games/media-mania-environment/like.webp"),
  dislike: require("../../../assets/games/media-mania-environment/dislike.webp"),
  unlock: require("../../../assets/games/media-mania-environment/landing.webp"),
};

export function MediaManiaEnvironment({
  scene,
  compact,
  children,
}: {
  scene: MediaManiaEnvironmentScene;
  compact: boolean;
  children: ReactNode;
}) {
  const dislike = scene === "dislike";
  const like = scene === "like";
  return (
    <View style={[styles.root, dislike && styles.rootDislike, like && styles.rootLike]}>
      <View
        pointerEvents="none"
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        testID={`media-mania-environment-${scene}`}
        style={styles.artworkLayer}
      >
        <Image
          source={SCENE_ASSETS[scene]}
          resizeMode="cover"
          accessible={false}
          style={[styles.artwork, compact && styles.artworkCompact]}
        />
        <View style={[styles.colorWash, dislike ? styles.dislikeWash : like ? styles.likeWash : styles.landingWash]} />
        <View style={[styles.centerVeil, compact && styles.centerVeilCompact]} />
        <View style={styles.edgeVignette} />
      </View>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, position: "relative", overflow: "hidden", backgroundColor: "#040b18" },
  rootLike: { backgroundColor: "#041713" },
  rootDislike: { backgroundColor: "#1a0710" },
  artworkLayer: { ...StyleSheet.absoluteFillObject, overflow: "hidden" },
  artwork: { ...StyleSheet.absoluteFillObject, width: "100%", height: "100%", opacity: 0.96 },
  artworkCompact: { transform: [{ scale: 1.35 }] },
  colorWash: { ...StyleSheet.absoluteFillObject },
  landingWash: { backgroundColor: "rgba(3, 9, 22, 0.1)" },
  likeWash: { backgroundColor: "rgba(0, 34, 31, 0.1)" },
  dislikeWash: { backgroundColor: "rgba(62, 0, 25, 0.08)" },
  centerVeil: {
    position: "absolute",
    top: 0,
    bottom: 0,
    left: "13%",
    right: "13%",
    backgroundColor: "rgba(2, 8, 18, 0.3)",
  },
  centerVeilCompact: { left: 0, right: 0, backgroundColor: "rgba(2, 8, 18, 0.56)" },
  edgeVignette: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0, 0, 0, 0.08)" },
});
