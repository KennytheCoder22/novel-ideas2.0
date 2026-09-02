import { router, useLocalSearchParams } from "expo-router";
import { SafeAreaView, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";

type GameCardProps = {
  eyebrow: string;
  title: string;
  description: string;
  detail: string;
  colors: [string, string];
  onPress: () => void;
};

function GameCard({ eyebrow, title, description, detail, colors, onPress }: GameCardProps) {
  return (
    <TouchableOpacity
      style={[styles.gameCard, { backgroundColor: colors[0], borderColor: colors[1] }]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Play ${title}`}
    >
      <View style={[styles.gameArt, { borderColor: colors[1] }]}>
        <View style={[styles.gameArtCircle, { backgroundColor: colors[1] }]} />
        <View style={styles.gameArtLine} />
        <View style={[styles.gameArtBlock, { backgroundColor: colors[1] }]} />
      </View>
      <Text style={styles.eyebrow}>{eyebrow}</Text>
      <Text style={styles.gameTitle}>{title}</Text>
      <Text style={styles.description}>{description}</Text>
      <Text style={styles.detail}>{detail}</Text>
      <View style={[styles.playButton, { borderColor: colors[1] }]}>
        <Text style={styles.playButtonText}>PLAY</Text>
      </View>
    </TouchableOpacity>
  );
}

export default function RecommendationGamesRoute() {
  const params = useLocalSearchParams<{ playerId?: string; libraryId?: string; ageBand?: string }>();

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel="Back"
        >
          <Text style={styles.backButtonText}>Back</Text>
        </TouchableOpacity>
        <View style={styles.headerCopy}>
          <Text style={styles.headerKicker}>ARCADE AFTER DARK</Text>
          <Text style={styles.headerTitle}>Choose a Game</Text>
        </View>
        <View style={styles.headerSpacer} />
      </View>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.intro}>Quick games about taste, instinct, and impossible choices.</Text>
        <View style={styles.grid}>
          <GameCard
            eyebrow="FAST PICKS"
            title="Media Mania"
            description="Build a winning lineup across books, movies, games, anime, and more."
            detail="Rapid rounds | Familiar favorites | Unlock new media"
            colors={["#12263f", "#4fc3f7"]}
            onPress={() => router.push({
              pathname: "/media-mania",
              params: {
                playerId: params.playerId || "media-mania-player",
                libraryId: params.libraryId || "default",
                ageBand: params.ageBand || "teens",
              },
            } as any)}
          />
          <GameCard
            eyebrow="COZY STORY PUZZLES"
            title="The Last Bookshop"
            description="Read midnight visitors, search strange shelves, and choose the story each one needs."
            detail="Three nights | Recurring characters | Shop progression"
            colors={["#2a1d2d", "#d39a51"]}
            onPress={() => router.push("/games/last-bookshop" as any)}
          />
          <GameCard
            eyebrow="PIXEL WORLD ADVENTURE"
            title="The Unwritten Map"
            description="Cross a tiny mysterious country where every road, discovery, and decision changes your journey."
            detail="Top-down exploration | Four story encounters | Persistent map"
            colors={["#1b2a1d", "#cadb83"]}
            onPress={() => router.push("/games/unwritten-map" as any)}
          />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#090d18" },
  header: {
    minHeight: 76,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#27344e",
    flexDirection: "row",
    alignItems: "center",
  },
  backButton: {
    width: 72,
    minHeight: 44,
    borderWidth: 1,
    borderColor: "#3b4b69",
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  backButtonText: { color: "#d8e2f0", fontSize: 13, fontWeight: "800" },
  headerCopy: { flex: 1, alignItems: "center" },
  headerKicker: { color: "#8094b8", fontSize: 9, letterSpacing: 2.2, fontWeight: "900" },
  headerTitle: { color: "#f4f6fb", fontSize: 22, fontWeight: "900", marginTop: 2 },
  headerSpacer: { width: 72 },
  content: { flexGrow: 1, width: "100%", maxWidth: 980, alignSelf: "center", padding: 24, paddingBottom: 48 },
  intro: { color: "#a8b4ca", fontSize: 16, lineHeight: 24, textAlign: "center", marginVertical: 18 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 18, justifyContent: "center" },
  gameCard: {
    flexGrow: 1,
    flexBasis: 360,
    maxWidth: 460,
    minHeight: 460,
    borderWidth: 2,
    borderRadius: 18,
    padding: 22,
    shadowColor: "#000",
    shadowOpacity: 0.35,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
  },
  gameArt: {
    height: 158,
    borderWidth: 1,
    borderRadius: 12,
    marginBottom: 20,
    overflow: "hidden",
    position: "relative",
    backgroundColor: "rgba(0,0,0,0.22)",
  },
  gameArtCircle: { position: "absolute", width: 110, height: 110, borderRadius: 55, right: 28, top: 18, opacity: 0.8 },
  gameArtLine: { position: "absolute", height: 3, left: 24, right: 24, bottom: 38, backgroundColor: "#e9edf7", opacity: 0.65 },
  gameArtBlock: { position: "absolute", width: 86, height: 74, left: 30, bottom: 40, opacity: 0.75 },
  eyebrow: { color: "#aab7cb", fontSize: 10, fontWeight: "900", letterSpacing: 2 },
  gameTitle: { color: "#ffffff", fontSize: 30, fontWeight: "900", marginTop: 7 },
  description: { color: "#d0d7e3", fontSize: 15, lineHeight: 23, marginTop: 12 },
  detail: { color: "#91a0b8", fontSize: 12, lineHeight: 19, marginTop: 14 },
  playButton: {
    minHeight: 48,
    marginTop: "auto",
    borderWidth: 1,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.24)",
  },
  playButtonText: { color: "#ffffff", fontSize: 14, fontWeight: "900", letterSpacing: 2 },
});
