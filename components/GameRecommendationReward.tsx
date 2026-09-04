// Shared reward component for the game-recommendation-milestone loop. Every recommendation game
// (Media Mania, The Last Bookshop, The Unwritten Map, The Alchemist's Cascade) renders the same
// component so the reward moment always looks and behaves identically: a real production book
// cover/title/author/reason, no star ratings, four prominent accessible response buttons, and
// subtle foreshadowing of a future recommendation without a progress bar.
import {
  Image,
  Modal,
  Pressable,
  ScrollView,
  Text,
  View,
  useWindowDimensions,
  type GestureResponderEvent,
} from "react-native";
import type { GameRecommendationResponse } from "../lib/recommendationGames/gameRecommendationFeedback";
import { computeGameRecommendationRewardLayout } from "../lib/recommendationGames/gameRecommendationRewardLayout";

export type GameRecommendationRewardCadence = "first" | "later";

export type GameRecommendationRewardBook = {
  title: string;
  author: string;
  coverUrl?: string | null;
  reason: string;
};

export type { GameRecommendationRewardLayout } from "../lib/recommendationGames/gameRecommendationRewardLayout";
export { computeGameRecommendationRewardLayout };

const RESPONSE_OPTIONS: { value: GameRecommendationResponse; label: string; accessibilityHint: string }[] = [
  { value: "yes", label: "Yes", accessibilityHint: "I would choose this book" },
  { value: "maybe", label: "Maybe", accessibilityHint: "I might choose this book" },
  { value: "no", label: "No", accessibilityHint: "I would not choose this book" },
  { value: "already_read", label: "Already read it", accessibilityHint: "I have already read or seen this, this is not a taste signal" },
];

export type GameRecommendationRewardProps = {
  visible: boolean;
  cadence: GameRecommendationRewardCadence;
  gameLabel: string;
  book: GameRecommendationRewardBook;
  onRespond: (response: GameRecommendationResponse) => void;
};

export function GameRecommendationReward({ visible, cadence, gameLabel, book, onRespond }: GameRecommendationRewardProps) {
  const { width } = useWindowDimensions();
  const layout = computeGameRecommendationRewardLayout(width);

  if (!visible) return null;

  const eyebrow = cadence === "first" ? "Taste unlocked!" : "Your taste is taking shape.";
  const headline = cadence === "first" ? "Here's our first guess." : "We know you better now. Try this.";

  function handleRespond(event: GestureResponderEvent | undefined, response: GameRecommendationResponse) {
    event?.preventDefault?.();
    onRespond(response);
  }

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      accessibilityViewIsModal
      onRequestClose={() => undefined}
    >
      <View
        style={{ flex: 1, backgroundColor: "rgba(5,8,15,0.82)", alignItems: "center", justifyContent: "center", padding: 16 }}
        testID="game-recommendation-reward-backdrop"
      >
        <ScrollView
          contentContainerStyle={{ width: "100%", maxWidth: 560 }}
          keyboardShouldPersistTaps="handled"
        >
          <View
            accessibilityRole="none"
            style={{
              width: "100%",
              borderRadius: 18,
              borderWidth: 1,
              borderColor: "#3a3350",
              backgroundColor: "#171226",
              padding: 20,
              gap: 14,
            }}
          >
            <Text
              accessibilityRole="header"
              style={{ color: "#e7c1ff", fontSize: 13, fontWeight: "900", letterSpacing: 1.6, textTransform: "uppercase" }}
            >
              {eyebrow}
            </Text>
            <Text style={{ color: "#fbf7ff", fontSize: 22, lineHeight: 27, fontWeight: "900" }}>{headline}</Text>

            <View
              style={{
                flexDirection: layout === "sideBySide" ? "row" : "column",
                gap: 14,
                alignItems: layout === "sideBySide" ? "flex-start" : "center",
              }}
            >
              {book.coverUrl ? (
                <Image
                  source={{ uri: book.coverUrl }}
                  accessibilityIgnoresInvertColors
                  accessibilityLabel={`Cover of ${book.title} by ${book.author || "an unlisted author"}`}
                  style={{ width: 120, height: 176, borderRadius: 8, backgroundColor: "#2a2440" }}
                  resizeMode="cover"
                />
              ) : (
                <View
                  accessibilityLabel={`No cover available for ${book.title}`}
                  style={{ width: 120, height: 176, borderRadius: 8, backgroundColor: "#2a2440", alignItems: "center", justifyContent: "center" }}
                >
                  <Text style={{ color: "#8f88ac", fontSize: 12, textAlign: "center", paddingHorizontal: 8 }}>No cover yet</Text>
                </View>
              )}
              <View style={{ flex: 1, gap: 6, minWidth: 0 }}>
                <Text style={{ color: "#fbf7ff", fontSize: 18, lineHeight: 23, fontWeight: "800" }}>{book.title}</Text>
                {book.author ? <Text style={{ color: "#c8bfe0", fontSize: 14, lineHeight: 19 }}>{book.author}</Text> : null}
                <Text style={{ color: "#d9d2ee", fontSize: 14, lineHeight: 20 }}>{book.reason}</Text>
              </View>
            </View>

            <Text accessibilityRole="text" style={{ color: "#fbf7ff", fontSize: 16, lineHeight: 21, fontWeight: "700", marginTop: 4 }}>
              Would you choose this book?
            </Text>

            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
              {RESPONSE_OPTIONS.map((option) => (
                <Pressable
                  key={option.value}
                  onPress={(event) => handleRespond(event, option.value)}
                  accessibilityRole="button"
                  accessibilityLabel={option.label}
                  accessibilityHint={option.accessibilityHint}
                  // Keyboard/touch accessible by default via Pressable's built-in
                  // focus + press handling; react-native-web adds a visible focus
                  // outline automatically for keyboard navigation on web.
                  style={({ pressed }: { pressed: boolean }) => ({
                    minWidth: 96,
                    minHeight: 44,
                    flexGrow: 1,
                    paddingHorizontal: 14,
                    paddingVertical: 11,
                    borderRadius: 10,
                    borderWidth: 1,
                    borderColor: "#4a4166",
                    backgroundColor: pressed ? "#332b52" : "#241d3a",
                    alignItems: "center",
                    justifyContent: "center",
                  })}
                >
                  <Text style={{ color: "#fbf7ff", fontSize: 15, fontWeight: "800" }}>{option.label}</Text>
                </Pressable>
              ))}
            </View>

            <Text style={{ color: "#8f88ac", fontSize: 12, lineHeight: 16, fontStyle: "italic", marginTop: 2 }}>
              Keep playing {gameLabel} - your next recommendation is already forming.
            </Text>
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
}
