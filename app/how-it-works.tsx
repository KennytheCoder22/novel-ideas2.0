/**
 * /how-it-works — Public explanation of how NovelIdeas works.
 *
 * Explains: swiping, recommendation generation, and optional anonymous Human Review.
 */

import { router } from "expo-router";
import { ScrollView, StyleSheet, Text, TouchableOpacity, View, SafeAreaView } from "react-native";

export default function HowItWorksScreen() {
  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.closeBtn} accessibilityRole="button" accessibilityLabel="Close">
          <Text style={styles.closeBtnText}>✕</Text>
        </TouchableOpacity>
        <Text style={styles.title}>How NovelIdeas Works</Text>
      </View>
      <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent}>
        <Section heading="Swiping">
          NovelIdeas shows you cards from categories such as books, movies, TV shows, games,
          YouTube, anime/manga, and podcasts. Swipe right (or tap Like) when something appeals to
          you. Swipe left (or tap Pass) when it doesn't. There are no wrong answers — every choice
          helps NovelIdeas learn more about your taste.
        </Section>

        <Section heading="Getting Recommendations">
          After you've made enough choices, NovelIdeas analyzes the patterns in what you liked and
          disliked to find books you may enjoy. Your recommendations can come from several sources,
          depending on how your library is configured.
        </Section>

        <Section heading="Age-Band Decks">
          NovelIdeas supports Kids, Pre-Teens, Teens, and Adults. Each age band has its own
          age-appropriate swipe experience. Your library may also choose which age bands and swipe
          categories are available.
        </Section>

        <Section heading="Anonymous Human Review (Optional)">
          If you tap <Text style={styles.bold}>Help Improve NovelIdeas</Text>, you enter a
          separate anonymous evaluation flow. You'll swipe again and then rate whether the
          resulting recommendations matched your preferences. Your review is saved with a
          randomly-generated anonymous ID — no name, email, or login is ever required or recorded.
          Reviews help the team improve recommendation quality over time.
        </Section>

        <Section heading="No Account Required">
          NovelIdeas never asks you to sign in. Your preferences and personal customizations can be
          stored on your device so they survive new sessions; no name, email, or patron login is
          required.
        </Section>
      </ScrollView>
    </SafeAreaView>
  );
}

function Section({ heading, children }: { heading: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.heading}>{heading}</Text>
      <Text style={styles.body_text}>{children}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#071526" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#1e3a5f",
  },
  closeBtn: { padding: 8, marginRight: 8 },
  closeBtnText: { color: "#e5efff", fontSize: 16, fontWeight: "700" },
  title: { color: "#e5efff", fontSize: 18, fontWeight: "900", flex: 1 },
  body: { flex: 1 },
  bodyContent: { padding: 20, paddingBottom: 40 },
  section: { marginBottom: 24 },
  heading: { color: "#c9d8f0", fontSize: 14, fontWeight: "800", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 8 },
  body_text: { color: "#b0c4de", fontSize: 15, lineHeight: 23 },
  bold: { fontWeight: "700", color: "#e5efff" },
});
