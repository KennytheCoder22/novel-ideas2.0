/**
 * /how-it-works — Public explanation of how NovelIdeas works.
 *
 * Explains: swiping, recommendation generation, and optional anonymous Human Review.
 */

import React from "react";
import { router } from "expo-router";
import { Linking, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View, SafeAreaView } from "react-native";

export default function HowItWorksScreen() {
  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.closeBtn} accessibilityRole="button" accessibilityLabel="Close">
          <Text style={styles.closeBtnText}>✕</Text>
        </TouchableOpacity>
        <Text style={styles.title}>How to Use NovelIdeas</Text>
      </View>
      <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent}>
        <TutorialVideo />
        <Text style={styles.pageHeading}>How NovelIdeas Works</Text>

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
          If you tap <Text style={styles.bold}>Librarian Review</Text>, you enter a
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

function TutorialVideo() {
  if (Platform.OS === "web") {
    return React.createElement("video", {
      controls: true,
      playsInline: true,
      preload: "metadata",
      src: "/how-to-use-novelideas.mp4",
      title: "How to Use NovelIdeas video",
      style: {
        width: "100%",
        maxWidth: 760,
        height: "auto",
        alignSelf: "center",
        borderRadius: 12,
        backgroundColor: "#000",
        display: "block",
      },
    });
  }

  return (
    <TouchableOpacity
      style={styles.videoFallback}
      onPress={() => void Linking.openURL("https://novelideas.app/how-to-use-novelideas.mp4")}
      accessibilityRole="link"
      accessibilityLabel="Play How to Use NovelIdeas video"
    >
      <Text style={styles.videoFallbackText}>Play How to Use NovelIdeas Video</Text>
    </TouchableOpacity>
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
  pageHeading: { color: "#e5efff", fontSize: 20, fontWeight: "900", marginTop: 24, marginBottom: 20 },
  videoFallback: {
    width: "100%",
    maxWidth: 760,
    minHeight: 120,
    alignSelf: "center",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#d6b35a",
    backgroundColor: "#0e2442",
    padding: 20,
  },
  videoFallbackText: { color: "#e5efff", fontSize: 16, fontWeight: "800", textAlign: "center" },
  section: { marginBottom: 24 },
  heading: { color: "#c9d8f0", fontSize: 14, fontWeight: "800", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 8 },
  body_text: { color: "#b0c4de", fontSize: 15, lineHeight: 23 },
  bold: { fontWeight: "700", color: "#e5efff" },
});
