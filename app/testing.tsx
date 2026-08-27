/**
 * /testing — Public evaluation route for NovelIdeas reader experience testing.
 *
 * This route reuses the production SwipeDeckScreen without modification.
 * All recommendation logic, ranking, routing, source policy, and eligibility
 * are identical to the production experience.
 *
 * Engineering controls hidden (but preserved in Admin/debug workflow):
 *   - Test A / Test B / Test C presets
 *   - Diagnostics / Codex Diagnostics
 *   - Engine selectors
 *   - Deep-debug controls
 *
 * "Evaluate Recommendations" appears only after a recommendation slate exists.
 */

import { useCallback, useState } from "react";
import { useLocalSearchParams, useRouter } from "expo-router";
import {
  Platform,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import SwipeDeckScreen from "../screens/SwipeDeckScreen";

const INTRO_DISMISSED_KEY = "novelideas_testing_intro_dismissed";

function safeGetStorage(key: string): string | null {
  try {
    if (typeof localStorage !== "undefined") return localStorage.getItem(key);
  } catch {}
  return null;
}
function safeSetStorage(key: string, value: string): void {
  try {
    if (typeof localStorage !== "undefined") localStorage.setItem(key, value);
  } catch {}
}

function IntroBanner({ onStart, onCancel }: { onStart: () => void; onCancel: () => void }) {
  return (
    <View style={styles.introOverlay}>
      <View style={styles.introPanel}>
        <ScrollView
          style={styles.introScroll}
          contentContainerStyle={styles.introContent}
          showsVerticalScrollIndicator={true}
        >
          <Text style={styles.introTitle}>Help Improve NovelIdeas</Text>
          <Text style={styles.introBody}>
            NovelIdeas uses human reviewers to evaluate the quality of its book recommendations.
          </Text>
          <Text style={styles.introBody}>
            You'll be shown the tastes a reader expressed while swiping and the books NovelIdeas recommended.
            Imagine that you are helping that reader choose what to read next, and judge each recommendation
            based only on the information shown.
          </Text>
          <Text style={styles.introBody}>
            We especially welcome feedback from librarians, teachers, booksellers, reading specialists, and
            others with experience matching readers with books. Anyone may participate; no professional
            credentials are required.
          </Text>
          <Text style={styles.introBody}>
            Your reviews help us identify where the recommender is working well and where it needs improvement.
            Reviews are stored anonymously and are used to evaluate NovelIdeas—not the reader.
          </Text>

          <Text style={styles.introHeading}>What you'll be asked about</Text>
          {[
            "How well the recommendation fits the reader's tastes",
            "Whether it offers an interesting or non-obvious discovery",
            "How confident you are in your judgment",
            "Whether there is a specific problem with the recommendation",
          ].map((item) => (
            <View key={item} style={styles.introBulletRow}>
              <Text style={styles.introBullet}>•</Text>
              <Text style={styles.introBulletText}>{item}</Text>
            </View>
          ))}

          <TouchableOpacity
            style={styles.introStartButton}
            onPress={onStart}
            accessibilityRole="button"
            accessibilityLabel="Start Reviewing"
          >
            <Text style={styles.introStartButtonText}>Start Reviewing</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.introCancelButton}
            onPress={onCancel}
            accessibilityRole="button"
            accessibilityLabel="Cancel and return"
          >
            <Text style={styles.introCancelButtonText}>Cancel</Text>
          </TouchableOpacity>
        </ScrollView>
      </View>
    </View>
  );
}

export default function TestingRoute() {
  const router = useRouter();
  const params = useLocalSearchParams<{ intro?: string | string[]; returnTo?: string | string[] }>();
  const introRequested = (Array.isArray(params.intro) ? params.intro[0] : params.intro) === "1";
  const requestedReturnTo = Array.isArray(params.returnTo) ? params.returnTo[0] : params.returnTo;
  const returnTo =
    typeof requestedReturnTo === "string" && requestedReturnTo.startsWith("/") && !requestedReturnTo.startsWith("//")
      ? requestedReturnTo
      : "/";
  const [introDismissed, setIntroDismissed] = useState<boolean>(() => {
    if (introRequested) return false;
    if (Platform.OS !== "web") return true;
    return safeGetStorage(INTRO_DISMISSED_KEY) === "1";
  });

  const handleStart = useCallback(() => {
    safeSetStorage(INTRO_DISMISSED_KEY, "1");
    setIntroDismissed(true);
    router.setParams({ intro: undefined, returnTo: undefined });
  }, [router]);

  const handleCancel = useCallback(() => {
    router.replace(returnTo as any);
  }, [returnTo, router]);

  // Default testing config: all age bands enabled, all standard sources on.
  const enabledDecks = { k2: true, "36": true, ms_hs: true, adult: true };
  const swipeCategories = {
    books: true,
    movies: true,
    tv: true,
    games: true,
    youtube: true,
    anime: true,
    podcasts: true,
  };
  const recommendationSourceEnabled = {
    googleBooks: true,
    openLibrary: true,
    localLibrary: false,
    kitsu: true,
    gcd: true,
    nyt: false,
  };

  return (
    <SafeAreaView style={styles.root}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>NovelIdeas</Text>
        <Text style={styles.headerSubtitle}>Reader Experience Testing</Text>
      </View>

      <View style={styles.swipeStage}>
        <SwipeDeckScreen
          isTestingMode={true}
          enabledDecks={enabledDecks}
          swipeCategories={swipeCategories}
          recommendationSourceEnabled={recommendationSourceEnabled as any}
        />
      </View>

      {!introDismissed ? (
        <IntroBanner onStart={handleStart} onCancel={handleCancel} />
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#071526",
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: Platform.OS === "web" ? 16 : 8,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#1a3355",
    alignItems: "center",
  },
  headerTitle: {
    color: "#e5efff",
    fontSize: 20,
    fontWeight: "900",
    letterSpacing: 0.5,
  },
  headerSubtitle: {
    color: "#6b8cb8",
    fontSize: 12,
    fontWeight: "600",
    marginTop: 2,
    letterSpacing: 0.3,
  },
  swipeStage: {
    flex: 1,
  },

  introOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(7, 21, 38, 0.92)",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 100,
    padding: 16,
  },
  introPanel: {
    backgroundColor: "#0e2442",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#2a4a7a",
    maxWidth: 600,
    maxHeight: "92%",
    width: "100%",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
  },
  introScroll: {
    width: "100%",
  },
  introContent: {
    padding: 24,
  },
  introTitle: {
    color: "#e5efff",
    fontSize: 24,
    fontWeight: "900",
    marginBottom: 16,
    textAlign: "center",
  },
  introBody: {
    color: "#b8cfe0",
    fontSize: 14,
    lineHeight: 21,
    marginBottom: 12,
  },
  introHeading: {
    color: "#e5efff",
    fontSize: 16,
    fontWeight: "900",
    marginTop: 6,
    marginBottom: 8,
  },
  introBulletRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginBottom: 7,
  },
  introBullet: {
    color: "#74b9ff",
    fontSize: 15,
    lineHeight: 21,
    marginRight: 8,
  },
  introBulletText: {
    color: "#b8cfe0",
    flex: 1,
    fontSize: 14,
    lineHeight: 21,
  },
  introStartButton: {
    backgroundColor: "#1a6bbf",
    borderRadius: 10,
    paddingVertical: 14,
    paddingHorizontal: 28,
    alignItems: "center",
    marginTop: 16,
  },
  introStartButtonText: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "800",
  },
  introCancelButton: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#55759f",
    paddingVertical: 12,
    paddingHorizontal: 28,
    alignItems: "center",
    marginTop: 10,
  },
  introCancelButtonText: {
    color: "#dbeafe",
    fontSize: 15,
    fontWeight: "800",
  },
});
