/**
 * /how-it-works — Public explanation of how NovelIdeas works.
 *
 * Explains: swiping, recommendation generation, and optional anonymous Human Review.
 */

import { ScrollView, StyleSheet, Text, View, SafeAreaView } from "react-native";
import BackToNovelIdeasHeader from "../components/BackToNovelIdeasHeader";
import { returnToNovelIdeas } from "../lib/secondaryRouteNavigation";

export default function HowItWorksScreen() {
  return (
    <SafeAreaView style={styles.safe}>
      <BackToNovelIdeasHeader
        title="How NovelIdeas Works"
        onPress={() => {
          void returnToNovelIdeas();
        }}
      />
      <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent}>
        <Section heading="Swiping">
          NovelIdeas shows you books one at a time. Swipe right (or tap Like) if the book sounds
          interesting. Swipe left (or tap Pass) if it doesn't fit your mood. There are no wrong
          answers — every swipe teaches NovelIdeas about your taste.
        </Section>

        <Section heading="Getting Recommendations">
          After you've swiped a few books, NovelIdeas analyzes your choices and generates a
          personalized reading slate. Recommendations come from multiple sources — Google Books,
          Open Library, Kitsu, and others — so you'll see a diverse mix of titles.
        </Section>

        <Section heading="Age-Band Decks">
          NovelIdeas supports several reader age bands: picture books & early readers, middle
          grade (grades 3–6), middle school / high school, and adult. The deck used depends on
          how your library has been configured.
        </Section>

        <Section heading="Anonymous Human Review (Optional)">
          If you tap <Text style={styles.bold}>Help Improve NovelIdeas</Text>, you enter a
          separate anonymous evaluation flow. You'll swipe again and then rate whether the
          resulting recommendations matched your preferences. Your review is saved with a
          randomly-generated anonymous ID — no name, email, or login is ever required or recorded.
          Reviews help the team improve recommendation quality over time.
        </Section>

        <Section heading="No Account Required">
          NovelIdeas never asks you to sign in. Your preferences are used only to generate
          recommendations in the current session and are not stored on any server.
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
  body: { flex: 1 },
  bodyContent: { padding: 20, paddingBottom: 40 },
  section: { marginBottom: 24 },
  heading: { color: "#c9d8f0", fontSize: 14, fontWeight: "800", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 8 },
  body_text: { color: "#b0c4de", fontSize: 15, lineHeight: 23 },
  bold: { fontWeight: "700", color: "#e5efff" },
});
