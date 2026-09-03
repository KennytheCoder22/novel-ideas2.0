import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { Image } from "expo-image";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useRef, useState } from "react";
import {
  ImageSourcePropType,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

type GameId = "media-mania" | "last-bookshop" | "unwritten-map" | "alchemists-cascade";

type GameTheme = {
  accent: string;
  bright: string;
  surface: string;
  wash: string;
};

type GameCardConfig = {
  id: GameId;
  title: string;
  subtitle: string;
  duration: string;
  whatYouDo: string;
  whatLearns: string;
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  image: ImageSourcePropType;
  imageAlt: string;
  route: "/media-mania" | "/games/last-bookshop" | "/games/unwritten-map" | "/games/alchemists-cascade";
  theme: GameTheme;
};

const GAME_CARDS: GameCardConfig[] = [
  {
    id: "media-mania",
    title: "Media Mania",
    subtitle: "Build your taste lineup.",
    duration: "2–5 min",
    whatYouDo: "Make rapid picks across books, movies, games, anime, and more.",
    whatLearns: "Reveals the favorites and cross-media connections that excite you.",
    icon: "lightning-bolt",
    image: require("../../assets/games/media-mania.webp"),
    imageAlt: "A colorful collage of books, film, television, music, and games for Media Mania",
    route: "/media-mania",
    theme: { accent: "#34d6ff", bright: "#92ecff", surface: "#071a2d", wash: "#0d3148" },
  },
  {
    id: "last-bookshop",
    title: "The Last Bookshop",
    subtitle: "Recommend the right story before dawn.",
    duration: "5–10 min",
    whatYouDo: "Read each visitor, search the shelves, and trust your instinct.",
    whatLearns: "Uncovers why a recommendation feels right—not only what you pick.",
    icon: "book-open-page-variant",
    image: require("../../assets/games/last-bookshop.webp"),
    imageAlt: "A warm midnight bookshop with a bookseller helping mysterious visitors",
    route: "/games/last-bookshop",
    theme: { accent: "#f2a83c", bright: "#ffd080", surface: "#211421", wash: "#432026" },
  },
  {
    id: "unwritten-map",
    title: "The Unwritten Map",
    subtitle: "Cross a strange world and write your own story.",
    duration: "5–15 min",
    whatYouDo: "Explore hidden regions, make choices, and fill your field journal.",
    whatLearns: "Maps the kinds of worlds, moods, and experiences you gravitate toward.",
    icon: "compass-outline",
    image: require("../../assets/games/unwritten-map.webp"),
    imageAlt: "A pixel-art explorer overlooking the varied regions of The Unwritten Map",
    route: "/games/unwritten-map",
    theme: { accent: "#b7d85a", bright: "#ddf58c", surface: "#10251d", wash: "#29452d" },
  },
  {
    id: "alchemists-cascade",
    title: "The Alchemist’s Cascade",
    subtitle: "Match ingredients. Make impossible choices.",
    duration: "3–8 min",
    whatYouDo: "Solve match puzzles, trigger cascades, and choose powerful catalysts.",
    whatLearns: "Shows how you balance novelty, structure, intensity, and imagination.",
    icon: "flask-outline",
    image: require("../../assets/games/alchemists-cascade.webp"),
    imageAlt: "An alchemist creating a glowing potion beside a jewel-filled match puzzle",
    route: "/games/alchemists-cascade",
    theme: { accent: "#f1ab2f", bright: "#ffd46a", surface: "#24170d", wash: "#4a2c0d" },
  },
];

function GameCard({
  game,
  deferArtwork,
  onPress,
}: {
  game: GameCardConfig;
  deferArtwork: boolean;
  onPress: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [artworkVisible, setArtworkVisible] = useState(!deferArtwork);
  const artworkRef = useRef<View>(null);
  const highlighted = hovered || focused;

  useEffect(() => {
    if (artworkVisible || !deferArtwork || typeof IntersectionObserver === "undefined") {
      if (deferArtwork && typeof IntersectionObserver === "undefined") setArtworkVisible(true);
      return;
    }
    const element = artworkRef.current as unknown as Element | null;
    if (!element) {
      setArtworkVisible(true);
      return;
    }
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) return;
      setArtworkVisible(true);
      observer.disconnect();
    }, { rootMargin: "240px 0px" });
    observer.observe(element);
    return () => observer.disconnect();
  }, [artworkVisible, deferArtwork]);

  return (
    <Pressable
      testID={`games-card-${game.id}`}
      onPress={onPress}
      onHoverIn={() => setHovered(true)}
      onHoverOut={() => setHovered(false)}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      accessibilityRole="button"
      accessibilityLabel={`Play ${game.title}`}
      style={({ pressed }) => [
        styles.gameCard,
        {
          borderColor: highlighted ? game.theme.bright : game.theme.accent,
          backgroundColor: game.theme.surface,
          shadowOpacity: highlighted ? 0.68 : 0.46,
          transform: [{ translateY: pressed ? 1 : highlighted ? -3 : 0 }],
        },
      ]}
    >
      <View ref={artworkRef} style={styles.artworkFrame}>
        {artworkVisible ? (
          <Image
            source={game.image}
            style={styles.artwork}
            contentFit="cover"
            priority={deferArtwork ? "low" : "high"}
            accessibilityLabel={game.imageAlt}
            alt={game.imageAlt}
          />
        ) : null}
        <View pointerEvents="none" style={[styles.imageEdge, { backgroundColor: game.theme.accent }]} />
      </View>

      <View style={styles.cardBody}>
        <View style={styles.cardHeading}>
          <View style={[styles.iconMedallion, { borderColor: game.theme.accent, backgroundColor: game.theme.wash }]}>
            <MaterialCommunityIcons name={game.icon} size={28} color={game.theme.bright} />
          </View>
          <View style={styles.titleBlock}>
            <Text style={styles.gameTitle}>{game.title}</Text>
            <Text style={[styles.subtitle, { color: game.theme.bright }]}>{game.subtitle}</Text>
          </View>
          <View style={[styles.duration, { borderColor: game.theme.accent }]}>
            <MaterialCommunityIcons name="clock-outline" size={13} color={game.theme.bright} />
            <Text style={[styles.durationText, { color: game.theme.bright }]}>{game.duration}</Text>
          </View>
        </View>

        <View style={styles.factList}>
          <View style={styles.factRow}>
            <MaterialCommunityIcons name="gamepad-variant-outline" size={19} color={game.theme.bright} />
            <Text style={styles.factText}>{game.whatYouDo}</Text>
          </View>
          <View style={styles.factRow}>
            <MaterialCommunityIcons name="star-four-points-outline" size={19} color={game.theme.bright} />
            <Text style={styles.factText}>{game.whatLearns}</Text>
          </View>
        </View>

        <View style={[styles.playButton, { borderColor: game.theme.accent, backgroundColor: game.theme.wash }, highlighted && { borderColor: game.theme.bright }]}>
          <Text style={[styles.playButtonText, { color: game.theme.bright }]}>PLAY</Text>
          <MaterialCommunityIcons name="arrow-right" size={19} color={game.theme.bright} />
        </View>
      </View>
    </Pressable>
  );
}

export default function RecommendationGamesRoute() {
  const params = useLocalSearchParams<{ playerId?: string; libraryId?: string; ageBand?: string }>();

  function launchGame(game: GameCardConfig) {
    if (game.id === "media-mania") {
      router.push({
        pathname: game.route,
        params: {
          playerId: params.playerId || "media-mania-player",
          libraryId: params.libraryId || "default",
          ageBand: params.ageBand || "teens",
        },
      } as any);
      return;
    }
    if (game.id === "unwritten-map" || game.id === "alchemists-cascade") {
      router.push({
        pathname: game.route,
        params: {
          ...(params.playerId ? { playerId: params.playerId } : {}),
          ...(params.libraryId ? { libraryId: params.libraryId } : {}),
        },
      } as any);
      return;
    }
    router.push(game.route as any);
  }

  return (
    <SafeAreaView style={styles.safe}>
      <View pointerEvents="none" style={styles.ambient}>
        <View style={[styles.ambientOrb, styles.ambientOrbLeft]} />
        <View style={[styles.ambientOrb, styles.ambientOrbRight]} />
      </View>
      <TouchableOpacity
        style={styles.backButton}
        onPress={() => router.back()}
        accessibilityRole="button"
        accessibilityLabel="Back"
      >
        <MaterialCommunityIcons name="arrow-left" size={18} color="#e8e5f2" />
        <Text style={styles.backButtonText}>Back</Text>
      </TouchableOpacity>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.intro}>
          <View style={styles.sparkRow}>
            <Text style={styles.spark}>✦</Text>
            <Text style={styles.arcadeLabel}>ARCADE AFTER DARK</Text>
            <Text style={styles.spark}>✦</Text>
          </View>
          <Text style={styles.pageTitle}>Choose a Game</Text>
          <Text style={styles.tagline}>Four ways to play. Four ways to discover your taste.</Text>
          <Text style={styles.explainer}>
            Every choice quietly helps NovelIdeas understand which stories and experiences fit you best.
          </Text>
        </View>

        <View style={styles.grid}>
          {GAME_CARDS.map((game, index) => (
            <GameCard key={game.id} game={game} deferArtwork={index >= 2} onPress={() => launchGame(game)} />
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#050b17" },
  ambient: { ...StyleSheet.absoluteFillObject, overflow: "hidden" },
  ambientOrb: { position: "absolute", width: 520, height: 520, borderRadius: 260, opacity: 0.1 },
  ambientOrbLeft: { left: -300, top: 140, backgroundColor: "#145d85" },
  ambientOrbRight: { right: -330, bottom: -210, backgroundColor: "#7a3d16" },
  backButton: {
    position: "absolute",
    zIndex: 10,
    top: 18,
    left: 18,
    minWidth: 86,
    minHeight: 42,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: "#35435d",
    borderRadius: 8,
    backgroundColor: "#080e1c",
    flexDirection: "row",
    gap: 7,
    alignItems: "center",
    justifyContent: "center",
  },
  backButtonText: { color: "#e8e5f2", fontSize: 14, fontWeight: "800" },
  content: { width: "100%", maxWidth: 1180, alignSelf: "center", paddingHorizontal: 20, paddingTop: 18, paddingBottom: 44 },
  intro: { alignItems: "center", paddingHorizontal: 12, paddingBottom: 22 },
  sparkRow: { flexDirection: "row", alignItems: "center", gap: 14 },
  arcadeLabel: { color: "#d28bda", fontSize: 12, lineHeight: 18, fontWeight: "900", letterSpacing: 3.4 },
  spark: { color: "#bd72cb", fontSize: 15 },
  pageTitle: { color: "#fff5df", fontSize: 43, lineHeight: 49, fontWeight: "900", letterSpacing: -1.2, textAlign: "center" },
  tagline: { color: "#d580df", fontSize: 18, lineHeight: 24, fontWeight: "800", textAlign: "center" },
  explainer: { maxWidth: 620, marginTop: 5, color: "#c5cada", fontSize: 14, lineHeight: 20, textAlign: "center" },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 16 },
  gameCard: {
    flexBasis: "48%",
    flexGrow: 1,
    flexShrink: 1,
    minWidth: 280,
    overflow: "hidden",
    borderWidth: 1.5,
    borderRadius: 16,
    shadowColor: "#000000",
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 12 },
  },
  artworkFrame: {
    aspectRatio: 16 / 9,
    width: "100%",
    overflow: "hidden",
    backgroundColor: "#111827",
  },
  artwork: { width: "100%", height: "100%" },
  imageEdge: { position: "absolute", left: 0, right: 0, bottom: 0, height: 3, opacity: 0.82 },
  cardBody: { minHeight: 232, paddingHorizontal: 16, paddingTop: 14, paddingBottom: 15 },
  cardHeading: { flexDirection: "row", alignItems: "center", gap: 11 },
  iconMedallion: {
    width: 52,
    height: 52,
    borderRadius: 26,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
  },
  titleBlock: { flex: 1, minWidth: 0 },
  gameTitle: { color: "#fff9ed", fontSize: 23, lineHeight: 28, fontWeight: "900", letterSpacing: -0.45 },
  subtitle: { fontSize: 13, lineHeight: 18, fontWeight: "700", marginTop: 1 },
  duration: {
    alignSelf: "flex-start",
    borderWidth: 1,
    borderRadius: 7,
    paddingHorizontal: 8,
    paddingVertical: 6,
    backgroundColor: "rgba(0,0,0,0.34)",
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  durationText: { fontSize: 12, lineHeight: 15, fontWeight: "900" },
  factList: { flex: 1, gap: 7, marginTop: 13 },
  factRow: { flexDirection: "row", alignItems: "flex-start", gap: 9 },
  factText: { flex: 1, color: "#d9deea", fontSize: 13, lineHeight: 19, fontWeight: "600" },
  playButton: {
    minHeight: 48,
    marginTop: 14,
    borderWidth: 1.5,
    borderRadius: 8,
    flexDirection: "row",
    gap: 8,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000000",
    shadowOpacity: 0.36,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
  },
  playButtonText: { fontSize: 15, lineHeight: 19, fontWeight: "900", letterSpacing: 2.4 },
});
