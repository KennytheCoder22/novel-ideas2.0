/**
 * /feedback — Send feedback about NovelIdeas.
 *
 * Opens a mailto: link so users can email feedback directly.
 */

import { Linking, ScrollView, StyleSheet, Text, TouchableOpacity, View, SafeAreaView } from "react-native";
import BackToNovelIdeasHeader from "../components/BackToNovelIdeasHeader";
import { returnToNovelIdeas } from "../lib/secondaryRouteNavigation";

const FEEDBACK_EMAIL = "feedback@novelideas.app";
const FEEDBACK_SUBJECT = "NovelIdeas Feedback";

function openMailto() {
  const uri = `mailto:${FEEDBACK_EMAIL}?subject=${encodeURIComponent(FEEDBACK_SUBJECT)}`;
  Linking.openURL(uri).catch(() => {
    // Silently ignore if mailto: handler not available (e.g. desktop browser).
  });
}

export default function FeedbackScreen() {
  return (
    <SafeAreaView style={styles.safe}>
      <BackToNovelIdeasHeader
        title="Send Feedback"
        onPress={() => {
          void returnToNovelIdeas();
        }}
      />
      <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent}>
        <Text style={styles.intro}>
          We'd love to hear from you. Whether you found a bug, have a feature request, or want to
          share something that surprised you — your input directly shapes how NovelIdeas improves.
        </Text>

        <TouchableOpacity style={styles.emailBtn} onPress={openMailto} accessibilityRole="button">
          <Text style={styles.emailBtnText}>✉  Email Us</Text>
          <Text style={styles.emailAddress}>{FEEDBACK_EMAIL}</Text>
        </TouchableOpacity>

        <Text style={styles.hint}>
          Tapping the button above will open your default email app with the address pre-filled.
          If you prefer, you can also email us directly at{" "}
          <Text style={styles.emailInline}>{FEEDBACK_EMAIL}</Text>.
        </Text>

        <View style={styles.divider} />

        <Text style={styles.sectionHeading}>What to include</Text>
        <Text style={styles.hint}>
          • What you were trying to do{"\n"}
          • What happened instead{"\n"}
          • Device type and approximate date{"\n"}
          • Any other details that might help
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#071526" },
  body: { flex: 1 },
  bodyContent: { padding: 20, paddingBottom: 40 },
  intro: { color: "#b0c4de", fontSize: 15, lineHeight: 23, marginBottom: 24 },
  emailBtn: {
    backgroundColor: "#1e3a5f",
    borderRadius: 10,
    paddingVertical: 16,
    paddingHorizontal: 20,
    marginBottom: 16,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#2a5080",
  },
  emailBtnText: { color: "#e5efff", fontSize: 16, fontWeight: "800", marginBottom: 4 },
  emailAddress: { color: "#7ab3e0", fontSize: 13 },
  hint: { color: "#8aa8cc", fontSize: 14, lineHeight: 22 },
  divider: { borderTopWidth: 1, borderTopColor: "#1e3a5f", marginVertical: 20 },
  sectionHeading: { color: "#c9d8f0", fontSize: 13, fontWeight: "800", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 10 },
  emailInline: { color: "#7ab3e0", fontWeight: "600" },
});
