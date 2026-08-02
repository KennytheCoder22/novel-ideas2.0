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
 * Controls kept visible:
 *   - "Evaluate Recommendations" (above)
 *   - "Fresh User" (below)
 */

import { useCallback, useRef, useState } from "react";
import {
  Animated,
  Platform,
  SafeAreaView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import BackToNovelIdeasHeader from "../components/BackToNovelIdeasHeader";
import { returnToNovelIdeas } from "../lib/secondaryRouteNavigation";
import SwipeDeckScreen from "../screens/SwipeDeckScreen";
import type { SwipeDeckScreenHandle } from "../screens/SwipeDeckScreen";

const INTRO_DISMISSED_KEY = "novelideas_testing_intro_dismissed";
const INTRO_TEXT =
  "NovelIdeas is testing how well it understands readers' tastes. Swipe according to your immediate reaction. After receiving recommendations, press the Evaluate Recommendations button and you will be asked whether the results fit the preferences you expressed. You do not need to know or have read every recommended book. There are no right or wrong answers.";

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

function IntroBanner({ onDismiss }: { onDismiss: () => void }) {
  const [opacity] = useState(() => new Animated.Value(1));

  const dismiss = useCallback(() => {
    Animated.timing(opacity, {
      toValue: 0,
      duration: 250,
      useNativeDriver: Platform.OS !== "web",
    }).start(() => {
      onDismiss();
    });
  }, [opacity, onDismiss]);

  return (
    <Animated.View style={[styles.banner, { opacity }]}>
      <View style={styles.bannerInner}>
        <Text style={styles.bannerTitle}>Welcome to NovelIdeas Testing</Text>
        <Text style={styles.bannerBody}>{INTRO_TEXT}</Text>
        <TouchableOpacity
          style={styles.bannerButton}
          onPress={dismiss}
          accessibilityRole="button"
          accessibilityLabel="Dismiss introduction"
        >
          <Text style={styles.bannerButtonText}>Got it — Start swiping</Text>
        </TouchableOpacity>
      </View>
    </Animated.View>
  );
}

export default function TestingRoute() {
  const swipeDeckRef = useRef<SwipeDeckScreenHandle | null>(null);
  const [introDismissed, setIntroDismissed] = useState<boolean>(() => {
    if (Platform.OS !== "web") return true; // intro is web-only
    return safeGetStorage(INTRO_DISMISSED_KEY) === "1";
  });

  const handleDismiss = useCallback(() => {
    safeSetStorage(INTRO_DISMISSED_KEY, "1");
    setIntroDismissed(true);
  }, []);

  const handleReturnToNovelIdeas = useCallback(async () => {
    await returnToNovelIdeas({
      beforeNavigate: async () => {
        const guard = swipeDeckRef.current?.prepareToLeaveTesting;
        return guard ? await guard() : true;
      },
    });
  }, []);

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
      <BackToNovelIdeasHeader
        title="NovelIdeas"
        subtitle="Reader Experience Testing"
        onPress={handleReturnToNovelIdeas}
      />

      <View style={styles.swipeStage}>
        <SwipeDeckScreen
          ref={swipeDeckRef}
          isTestingMode={true}
          enabledDecks={enabledDecks}
          swipeCategories={swipeCategories}
          recommendationSourceEnabled={recommendationSourceEnabled as any}
        />
        {Platform.OS === "web" && !introDismissed ? (
          <IntroBanner onDismiss={handleDismiss} />
        ) : null}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#071526",
  },
  swipeStage: {
    flex: 1,
    position: "relative",
  },

  // Intro banner — positioned as an overlay at the top of the swipe stage
  banner: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(7, 21, 38, 0.92)",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 100,
    padding: 24,
  },
  bannerInner: {
    backgroundColor: "#0e2442",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#2a4a7a",
    padding: 28,
    maxWidth: 520,
    width: "100%",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
  },
  bannerTitle: {
    color: "#e5efff",
    fontSize: 20,
    fontWeight: "900",
    marginBottom: 14,
    textAlign: "center",
  },
  bannerBody: {
    color: "#b8cfe0",
    fontSize: 15,
    lineHeight: 22,
    textAlign: "center",
    marginBottom: 24,
  },
  bannerButton: {
    backgroundColor: "#1a6bbf",
    borderRadius: 10,
    paddingVertical: 14,
    paddingHorizontal: 28,
    alignItems: "center",
  },
  bannerButtonText: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "800",
  },
});
