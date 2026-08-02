import { StyleSheet, Text, TouchableOpacity, View } from "react-native";

type BackToNovelIdeasHeaderProps = {
  title: string;
  subtitle?: string;
  onPress: () => void | Promise<void>;
};

export default function BackToNovelIdeasHeader(props: BackToNovelIdeasHeaderProps) {
  const { title, subtitle, onPress } = props;

  return (
    <View style={styles.header}>
      <TouchableOpacity
        onPress={onPress}
        style={styles.backButton}
        accessibilityRole="button"
        accessibilityLabel="Back to NovelIdeas"
      >
        <Text style={styles.backButtonText}>← Back to NovelIdeas</Text>
      </TouchableOpacity>
      <Text style={styles.title}>{title}</Text>
      {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#1e3a5f",
    backgroundColor: "#071526",
  },
  backButton: {
    alignSelf: "flex-start",
    paddingVertical: 6,
  },
  backButtonText: {
    color: "#e5efff",
    fontSize: 15,
    fontWeight: "800",
  },
  title: {
    color: "#e5efff",
    fontSize: 20,
    fontWeight: "900",
    marginTop: 10,
  },
  subtitle: {
    color: "#6b8cb8",
    fontSize: 12,
    fontWeight: "600",
    marginTop: 4,
    letterSpacing: 0.3,
  },
});
