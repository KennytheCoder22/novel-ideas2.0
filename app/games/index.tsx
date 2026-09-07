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
  useWindowDimensions,
} from "react-native";
import {
  buildGameRouteSourceParams,
  parseGameRouteConfig,
  type GameRouteParams,
} from "../../lib/recommendationGames/gameRecommendationRouteConfig";

type GameId = "media-mania" | "last-bookshop" | "unwritten-map" | "alchemists-cascade" | "melanies-game";

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
  route: "/media-mania" | "/games/last-bookshop" | "/games/unwritten-map" | "/games/alchemists-cascade" | "/games/melanies-game";
  theme: GameTheme;
};

const GAME_CARDS: GameCardConfig[] = [
  {
    id: "alchemists-cascade",
    title: "The Alchemist’s Cascade",
    subtitle: "Mix. Experiment. Discover.",
    duration: "3–8 min",
    whatYouDo: "Solve match puzzles, trigger cascades, and choose powerful catalysts.",
    whatLearns: "Shows how you balance novelty, structure, intensity, and imagination.",
    icon: "flask-outline",
    image: require("../../assets/games/alchemists-cascade.webp"),
    imageAlt: "An alchemist creating a glowing potion beside a jewel-filled match puzzle",
    route: "/games/alchemists-cascade",
    theme: { accent: "#f1ab2f", bright: "#ffd46a", surface: "#24170d", wash: "#4a2c0d" },
  },
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
    id: "melanies-game",
    title: "Melanie's Game",
    subtitle: "The Tournament of Stories",
    duration: "4–7 min",
    whatYouDo: "Choose, rank, and advance fictional book concepts through a personal tournament.",
    whatLearns: "Builds nuanced reading-taste evidence before finding real books for you.",
    icon: "tournament",
    image: require("../../assets/games/melanies-game/portal-melanie.webp"),
    imageAlt: "A black cat beside a glowing stack of books for Melanie's premise tournament",
    route: "/games/melanies-game",
    theme: { accent: "#e3a238", bright: "#ffd274", surface: "#1b130c", wash: "#4c3214" },
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
];

function GameCard({
  game,
  deferArtwork,
  showcase,
  stacked,
  onPress,
}: {
  game: GameCardConfig;
  deferArtwork: boolean;
  showcase: boolean;
  stacked: boolean;
  onPress: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [artworkVisible, setArtworkVisible] = useState(!deferArtwork);
  const artworkRef = useRef<View>(null);
  const highlighted = hovered || focused;
  const featured = game.id === "melanies-game";

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
          borderColor: highlighted || featured ? game.theme.bright : game.theme.accent,
          backgroundColor: game.theme.surface,
          shadowColor: featured ? "#f4ad35" : "#000000",
          shadowOpacity: highlighted || featured ? 0.78 : 0.46,
          transform: [{ translateY: pressed ? 1 : highlighted ? -3 : 0 }],
        },
        showcase && styles.gameCardShowcase,
        !showcase && styles.gameCardStandard,
        stacked && styles.gameCardStacked,
      ]}
    >
      <View ref={artworkRef} style={[styles.artworkFrame, showcase && styles.artworkFrameShowcase]}>
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

      <View style={[styles.cardBody, showcase && styles.cardBodyShowcase]}>
        <View style={styles.cardHeading}>
          {!showcase ? (
            <View style={[styles.iconMedallion, { borderColor: game.theme.accent, backgroundColor: game.theme.wash }]}>
              <MaterialCommunityIcons name={game.icon} size={28} color={game.theme.bright} />
            </View>
          ) : null}
          <View style={styles.titleBlock}>
            <Text style={[styles.gameTitle, showcase && styles.gameTitleShowcase]}>{game.title}</Text>
            <Text style={[styles.subtitle, showcase && styles.subtitleShowcase, { color: game.theme.bright }]}>{game.subtitle}</Text>
          </View>
          {!showcase ? <View style={[styles.duration, { borderColor: game.theme.accent }]}>
            <MaterialCommunityIcons name="clock-outline" size={13} color={game.theme.bright} />
            <Text style={[styles.durationText, { color: game.theme.bright }]}>{game.duration}</Text>
          </View> : null}
        </View>

        {!showcase ? <View style={styles.factList}>
          <View style={styles.factRow}>
            <MaterialCommunityIcons name="gamepad-variant-outline" size={19} color={game.theme.bright} />
            <Text style={styles.factText}>{game.whatYouDo}</Text>
          </View>
          <View style={styles.factRow}>
            <MaterialCommunityIcons name="star-four-points-outline" size={19} color={game.theme.bright} />
            <Text style={styles.factText}>{game.whatLearns}</Text>
          </View>
        </View> : null}

        {!showcase ? <View style={[styles.playButton, { borderColor: game.theme.accent, backgroundColor: game.theme.wash }, highlighted && { borderColor: game.theme.bright }]}>
          <Text style={[styles.playButtonText, { color: game.theme.bright }]}>PLAY</Text>
          <MaterialCommunityIcons name="arrow-right" size={19} color={game.theme.bright} />
        </View> : (
          <View style={[styles.showcaseDiamond, { borderColor: game.theme.bright }]} />
        )}
      </View>
    </Pressable>
  );
}

export default function RecommendationGamesRoute() {
  const params = useLocalSearchParams<{ playerId?: string; libraryId?: string; ageBand?: string }>();
  const routeConfig = parseGameRouteConfig(params as GameRouteParams);
  const { width } = useWindowDimensions();
  const showcase = width >= 1100;
  const stacked = width < 640;

  function launchGame(game: GameCardConfig) {
    const forwardedParams = {
      playerId: routeConfig.playerId,
      libraryId: routeConfig.libraryId,
      // Forward the raw ageBand string unchanged (not the normalized AgeBandV2 form) so each
      // game route's own age-band vocabulary (e.g. Media Mania's plural "adults") keeps working
      // exactly as before; every route separately derives the shared AgeBandV2 via
      // `parseGameRouteConfig` from this same raw param.
      ageBand: String(params.ageBand || "teens"),
      ...buildGameRouteSourceParams(routeConfig.sourceFlags),
    };
    router.push({ pathname: game.route, params: forwardedParams } as any);
  }

  return (
    <SafeAreaView style={styles.safe}>
      <View pointerEvents="none" accessibilityElementsHidden style={styles.ambient}>
        <Image source={require("../../assets/games/melanies-game/portal-library-left.webp")} style={[styles.portalBackdrop, styles.portalBackdropLeft]} contentFit="cover" />
        <Image source={require("../../assets/games/melanies-game/portal-library-right.webp")} style={[styles.portalBackdrop, styles.portalBackdropRight]} contentFit="cover" />
        <View style={styles.portalVeil} />
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
          <Text style={[styles.pageTitle, !showcase && styles.pageTitleCompact]}>Choose a Game</Text>
          <Text style={styles.tagline}>Different paths. A thousand stories.</Text>
          {!showcase ? <Text style={styles.explainer}>
            Every choice quietly helps NovelIdeas understand which stories and experiences fit you best.
          </Text> : null}
        </View>

        <View style={[styles.grid, showcase && styles.gridShowcase, stacked && styles.gridStacked]}>
          {GAME_CARDS.map((game, index) => (
            <GameCard key={game.id} game={game} deferArtwork={index >= 2} showcase={showcase} stacked={stacked} onPress={() => launchGame(game)} />
          ))}
        </View>
        {showcase ? (
          <View pointerEvents="none" accessibilityElementsHidden style={styles.portalQuote}>
            <View style={styles.portalQuoteLine} />
            <Text style={styles.portalQuoteText}>Different stories.{"\n"}Brighter tomorrows.</Text>
            <View style={styles.portalQuoteLine} />
          </View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#050a11" },
  ambient: { ...StyleSheet.absoluteFillObject, overflow: "hidden", backgroundColor: "#050a11" },
  portalBackdrop: { position: "absolute", top: 0, bottom: 0, width: "25%", height: "100%", opacity: 0.9 },
  portalBackdropLeft: { left: 0 },
  portalBackdropRight: { right: 0 },
  portalVeil: { position: "absolute", top: 0, bottom: 0, left: "15%", right: "15%", backgroundColor: "rgba(2,9,18,0.78)" },
  backButton: {
    position: "absolute",
    zIndex: 10,
    top: 18,
    left: 18,
    minWidth: 86,
    minHeight: 44,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: "#b47828",
    borderRadius: 8,
    backgroundColor: "rgba(4,10,18,0.9)",
    flexDirection: "row",
    gap: 7,
    alignItems: "center",
    justifyContent: "center",
  },
  backButtonText: { color: "#e8e5f2", fontSize: 14, fontWeight: "800" },
  content: { width: "100%", maxWidth: 1480, minHeight: "100%", alignSelf: "center", paddingHorizontal: 26, paddingTop: 54, paddingBottom: 32 },
  intro: { alignItems: "center", paddingHorizontal: 12, paddingBottom: 34 },
  sparkRow: { flexDirection: "row", alignItems: "center", gap: 14 },
  arcadeLabel: { color: "#d28bda", fontSize: 12, lineHeight: 18, fontWeight: "900", letterSpacing: 3.4 },
  spark: { color: "#bd72cb", fontSize: 15 },
  pageTitle: { color: "#f7c864", fontFamily: "Georgia", fontSize: 62, lineHeight: 68, fontWeight: "800", letterSpacing: 0.6, textAlign: "center", textTransform: "uppercase", textShadowColor: "rgba(205,114,25,0.6)", textShadowRadius: 13 },
  pageTitleCompact: { fontSize: 42, lineHeight: 48 },
  tagline: { color: "#d5d7e0", fontSize: 20, lineHeight: 27, fontWeight: "500", textAlign: "center" },
  explainer: { maxWidth: 620, marginTop: 5, color: "#c5cada", fontSize: 14, lineHeight: 20, textAlign: "center" },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 16 },
  gridShowcase: { flexWrap: "nowrap", gap: 18, alignItems: "stretch" },
  gridStacked: { flexDirection: "column" },
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
  gameCardShowcase: { flexBasis: 0, flexGrow: 1, minWidth: 0, maxWidth: 280, minHeight: 426, borderRadius: 8, borderWidth: 1.5 },
  gameCardStandard: { flexBasis: "48%", flexGrow: 0, minHeight: 520 },
  gameCardStacked: { flexBasis: "auto", width: "100%", minWidth: 0 },
  artworkFrame: {
    aspectRatio: 16 / 9,
    width: "100%",
    overflow: "hidden",
    backgroundColor: "#111827",
  },
  artworkFrameShowcase: { aspectRatio: 1.08, minHeight: 238 },
  artwork: { width: "100%", height: "100%" },
  imageEdge: { position: "absolute", left: 0, right: 0, bottom: 0, height: 3, opacity: 0.82 },
  cardBody: { minHeight: 232, paddingHorizontal: 16, paddingTop: 14, paddingBottom: 15 },
  cardBodyShowcase: { minHeight: 170, alignItems: "center", justifyContent: "center", paddingHorizontal: 12, paddingVertical: 16 },
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
  gameTitleShowcase: { fontFamily: "Georgia", fontSize: 24, lineHeight: 29, textAlign: "center" },
  subtitle: { fontSize: 13, lineHeight: 18, fontWeight: "700", marginTop: 1 },
  subtitleShowcase: { minHeight: 50, marginTop: 10, fontSize: 17, lineHeight: 23, fontWeight: "500", textAlign: "center" },
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
  showcaseDiamond: { width: 16, height: 16, marginTop: 13, borderWidth: 2, transform: [{ rotate: "45deg" }] },
  portalQuote: { maxWidth: 380, width: "100%", alignSelf: "center", marginTop: 38, flexDirection: "row", alignItems: "center", gap: 12 },
  portalQuoteLine: { flex: 1, height: 1, backgroundColor: "#a26826" },
  portalQuoteText: { color: "#e1a74d", fontFamily: "Georgia", fontSize: 19, lineHeight: 25, fontStyle: "italic", textAlign: "center" },
});
