import { Modal, SafeAreaView, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";

type GuideColors = {
  background: string;
  card: string;
  border: string;
  text: string;
  muted: string;
  accent: string;
  accentText: string;
};

type Props = {
  visible: boolean;
  colors: GuideColors;
  onClose: () => void;
};

const GUIDE_SECTIONS = [
  {
    title: "1. Create or Select Your Library",
    body:
      "Choose Create New Library to begin a new setup, or select an existing library to manage its saved scope. Reset to Defaults prepares default settings in the current draft; Save & Return saves the draft and returns home.",
  },
  {
    title: "2. A. Library Identity",
    body:
      "Enter the library name and Library ID. New IDs must contain at least three characters; existing shorter IDs remain supported. Upload a PNG, JPG, or SVG logo, or remove the current logo. The saved logo appears in the app header.",
  },
  {
    title: "3. B. Appearance",
    body:
      "Choose the Main Color and Highlight Color with the visual picker, hex value, and Hue, Saturation, and Brightness controls. Auto Font Color selects black or white text for legibility. You can reset the theme or copy either main/highlight color to the other. Live Preview updates from the draft immediately, but changes are not saved until you use a Save control.",
  },
  {
    title: "4. C. Reader Experience: Age Groups",
    body:
      "Choose which reading levels patrons can use: Kids (K–2), Pre-Teens (3–6), Teens (Middle & High School), and Adults. Disabling an age group removes that option from the patron experience.",
  },
  {
    title: "5. C. Reader Experience: Swipe Categories",
    body:
      "Choose Books, Movies, TV Shows, Games, YouTube, Anime / Manga, and Podcasts. These switches control which media types can appear as swipe cards used to learn patron taste. They do not turn recommendation sources on or off.",
  },
  {
    title: "6. D. Recommendation Sources",
    body:
      "Choose which external services NovelIdeas may use for recommendations: Google Books, Open Library, Kitsu (Manga), ComicVine (Comics), and New York Times (limited). Turning on any external source turns off Local Collection recommendation mode.",
  },
  {
    title: "7. E. Local Collection",
    body:
      "Upload a CSV or MARC export of the library's holdings. After a successful import, you can enable Local Collection for recommendations. In the current implementation, this mode recommends only from that library's imported titles and cannot run alongside external sources; enabling it turns all external sources off.",
  },
  {
    title: "8. F. Admin Security",
    body:
      "Enable Admin PIN to protect Librarian Settings from casual access, then save a six-digit PIN. This protection does not affect patrons using Guest mode.",
  },
  {
    title: "9. G. Advanced",
    body:
      "Open Advanced to review the Library ID and Hosted Library URL. Copy URL places the hosted address on the clipboard, Go To Library opens it in a new tab, and QR Export creates a code that opens the same hosted URL.",
  },
  {
    title: "10. Save and Test",
    body:
      "Use Save & Return, then open the hosted library. Verify the enabled age groups and swipe categories, complete a swipe session, generate recommendations, and confirm the saved branding and settings appear as expected.",
  },
] as const;

export function LibrarianSetupGuideModal({ visible, colors, onClose }: Props) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      accessibilityViewIsModal
      testID="librarian-setup-guide-modal"
    >
      <SafeAreaView style={[styles.overlay, { backgroundColor: "rgba(0, 0, 0, 0.72)" }]}>
        <View
          style={[styles.dialog, { backgroundColor: colors.card, borderColor: colors.border }]}
          testID="librarian-setup-guide-dialog"
        >
          <View style={[styles.header, { borderBottomColor: colors.border }]}>
            <View style={styles.headerCopy}>
              <Text style={[styles.title, { color: colors.text }]}>Librarian Setup Guide</Text>
              <Text style={[styles.subtitle, { color: colors.muted }]}>
                Follow the Settings page from top to bottom. Closing this guide keeps your current draft unchanged.
              </Text>
            </View>
            <TouchableOpacity
              onPress={onClose}
              style={[styles.closeButton, { borderColor: colors.border, backgroundColor: colors.background }]}
              accessibilityRole="button"
              accessibilityLabel="Close Librarian Setup Guide"
              testID="close-librarian-setup-guide"
            >
              <Text style={[styles.closeButtonText, { color: colors.text }]}>Close</Text>
            </TouchableOpacity>
          </View>

          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.content}
            showsVerticalScrollIndicator
          >
            {GUIDE_SECTIONS.map((section) => (
              <View
                key={section.title}
                style={[styles.section, { backgroundColor: colors.background, borderColor: colors.border }]}
              >
                <Text style={[styles.sectionTitle, { color: colors.accent }]}>{section.title}</Text>
                <Text style={[styles.body, { color: colors.text }]}>{section.body}</Text>
              </View>
            ))}
          </ScrollView>

          <View style={[styles.footer, { borderTopColor: colors.border }]}>
            <TouchableOpacity
              onPress={onClose}
              style={[styles.doneButton, { backgroundColor: colors.accent, borderColor: colors.accent }]}
              accessibilityRole="button"
              accessibilityLabel="Done reading Librarian Setup Guide"
            >
              <Text style={[styles.doneButtonText, { color: colors.accentText }]}>Done</Text>
            </TouchableOpacity>
          </View>
        </View>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 16,
  },
  dialog: {
    width: "100%",
    maxWidth: 760,
    maxHeight: "94%",
    minHeight: 0,
    borderWidth: 2,
    borderRadius: 18,
    overflow: "hidden",
  },
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    flexWrap: "wrap",
    gap: 12,
    padding: 18,
    borderBottomWidth: 1,
  },
  headerCopy: {
    flex: 1,
    minWidth: 220,
  },
  title: {
    fontSize: 22,
    lineHeight: 28,
    fontWeight: "900",
  },
  subtitle: {
    marginTop: 5,
    fontSize: 13,
    lineHeight: 19,
  },
  closeButton: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 13,
    paddingVertical: 9,
  },
  closeButtonText: {
    fontSize: 13,
    fontWeight: "800",
  },
  scroll: {
    flexShrink: 1,
  },
  content: {
    padding: 16,
    gap: 12,
  },
  section: {
    borderWidth: 1,
    borderRadius: 13,
    padding: 14,
  },
  sectionTitle: {
    fontSize: 15,
    lineHeight: 21,
    fontWeight: "900",
    marginBottom: 6,
  },
  body: {
    fontSize: 14,
    lineHeight: 21,
  },
  footer: {
    alignItems: "flex-end",
    padding: 14,
    borderTopWidth: 1,
  },
  doneButton: {
    minWidth: 120,
    alignItems: "center",
    borderWidth: 2,
    borderRadius: 12,
    paddingHorizontal: 18,
    paddingVertical: 10,
  },
  doneButtonText: {
    fontSize: 13,
    fontWeight: "900",
  },
});
