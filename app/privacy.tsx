/**
 * /privacy — Privacy statement for NovelIdeas.
 *
 * Covers: anonymous reviewer IDs, local drafts, durable review storage,
 * and what is / isn't collected.
 */

import { router } from "expo-router";
import { ScrollView, StyleSheet, Text, TouchableOpacity, View, SafeAreaView } from "react-native";

export default function PrivacyScreen() {
  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.closeBtn} accessibilityRole="button" accessibilityLabel="Close">
          <Text style={styles.closeBtnText}>✕</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Privacy</Text>
      </View>
      <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent}>

        <Section heading="What NovelIdeas Does Not Collect">
          NovelIdeas does not ask for your name, email address, school ID, or any personal
          information to use the app. No account is created. No login is required.
        </Section>

        <Section heading="Swipe Preferences">
          Your swipe choices are used only to generate recommendations within your current
          session. They are not transmitted to any server or stored beyond your active use of
          the app.
        </Section>

        <Section heading="Anonymous Human Review">
          When you participate in the optional evaluation flow (Help Improve NovelIdeas), your
          review is saved with a randomly-generated anonymous reviewer ID. This ID is created
          automatically — you do not choose it and it is not linked to you in any external system.
          No name, email, student ID, or other identifying information is ever attached to a
          review record.
        </Section>

        <Section heading="Durable Review Storage">
          Anonymous reviews submitted through the evaluation flow are stored durably so the
          NovelIdeas team can use them to improve recommendation quality. These records contain
          only: the anonymous reviewer ID, the books shown, and your preference ratings. They
          cannot be used to identify you.
        </Section>

        <Section heading="Local Admin Drafts">
          If you are a library admin, any configuration changes you save (library name,
          branding, deck settings) are stored locally on your device. These drafts are not
          sent to any server unless you explicitly export or share them.
        </Section>

        <Section heading="Third-Party Book Sources">
          Recommendations are fetched from public book APIs (Google Books, Open Library, Kitsu,
          ComicVine). Queries sent to these services contain only search terms — not any
          personal information about you.
        </Section>

        <Section heading="Children's Privacy">
          NovelIdeas is designed to be safe for all ages. We do not collect personal information
          from users of any age. The app does not display advertisements.
        </Section>

        <Section heading="Contact">
          Questions? Email us at{" "}
          <Text style={styles.email}>feedback@novelideas.app</Text>.
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
  email: { color: "#7ab3e0", fontWeight: "600" },
});
