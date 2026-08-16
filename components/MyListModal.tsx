import { Image, Modal, SafeAreaView, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import type { SavedRecommendation } from "../lib/patronMyList";

type Props = {
  visible: boolean;
  items: readonly SavedRecommendation[];
  colors: {
    background: string;
    card: string;
    border: string;
    text: string;
    muted: string;
    highlight: string;
  };
  onClose: () => void;
  onRemove: (itemId: string) => void;
};

export function MyListModal({ visible, items, colors, onClose, onRemove }: Props) {
  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
        <View style={[styles.header, { borderBottomColor: colors.border }]}>
          <Text style={[styles.title, { color: colors.text }]}>My List</Text>
          <TouchableOpacity
            onPress={onClose}
            style={[styles.closeButton, { borderColor: colors.border }]}
            accessibilityRole="button"
            accessibilityLabel="Close My List"
          >
            <Text style={[styles.closeButtonText, { color: colors.text }]}>Close</Text>
          </TouchableOpacity>
        </View>
        <ScrollView contentContainerStyle={styles.content}>
          {items.length === 0 ? (
            <Text style={[styles.emptyText, { color: colors.muted }]}>
              Save recommendations with the + button to find them here.
            </Text>
          ) : (
            items.map((item) => {
              const location = [item.subLocation, item.callNumber].filter(Boolean).join(" • ");
              return (
                <View
                  key={item.id}
                  style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}
                >
                  {item.coverUrl ? (
                    <Image source={{ uri: item.coverUrl }} style={styles.cover} resizeMode="contain" />
                  ) : (
                    <View style={[styles.cover, styles.coverPlaceholder, { borderColor: colors.border }]}>
                      <Text style={[styles.coverPlaceholderText, { color: colors.muted }]}>Cover unavailable</Text>
                    </View>
                  )}
                  <View style={styles.metadata}>
                    <Text style={[styles.bookTitle, { color: colors.text }]}>{item.title}</Text>
                    <Text style={[styles.author, { color: colors.muted }]}>{item.author}</Text>
                    {location ? <Text style={[styles.location, { color: colors.muted }]}>{location}</Text> : null}
                    <TouchableOpacity
                      onPress={() => onRemove(item.id)}
                      style={[styles.removeButton, { borderColor: colors.highlight }]}
                      accessibilityRole="button"
                      accessibilityLabel={`Remove ${item.title} from My List`}
                    >
                      <Text style={[styles.removeText, { color: colors.text }]}>Remove from List</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              );
            })
          )}
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  header: {
    minHeight: 68,
    paddingHorizontal: 20,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderBottomWidth: 1,
  },
  title: { fontSize: 24, fontWeight: "900" },
  closeButton: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 9 },
  closeButtonText: { fontWeight: "800" },
  content: { padding: 18, gap: 16 },
  emptyText: { textAlign: "center", marginTop: 48, fontSize: 15, lineHeight: 22 },
  card: { borderWidth: 1, borderRadius: 16, padding: 14, flexDirection: "row", gap: 16 },
  cover: { width: 100, height: 150, borderRadius: 8, backgroundColor: "#000" },
  coverPlaceholder: { borderWidth: 1, alignItems: "center", justifyContent: "center", padding: 8 },
  coverPlaceholderText: { textAlign: "center", fontSize: 12, fontWeight: "700" },
  metadata: { flex: 1, justifyContent: "center" },
  bookTitle: { fontSize: 17, fontWeight: "900", lineHeight: 22 },
  author: { marginTop: 5, fontSize: 14, fontWeight: "700" },
  location: { marginTop: 9, fontSize: 13, lineHeight: 18 },
  removeButton: { alignSelf: "flex-start", borderWidth: 1, borderRadius: 10, marginTop: 16, paddingHorizontal: 12, paddingVertical: 9 },
  removeText: { fontWeight: "800", fontSize: 13 },
});
