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

import { useCallback, useRef, useState } from "react";
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
import type { AnonymousReviewSession } from "../lib/anonymousHumanReview";

const INTRO_DISMISSED_KEY = "novelideas_testing_intro_dismissed";
const ANONYMOUS_REVIEW_RECENT_KEY = "novelideas_anonymous_review_recent";

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

function readRecentAnonymousSessions(): string[] {
  try {
    const parsed = JSON.parse(safeGetStorage(ANONYMOUS_REVIEW_RECENT_KEY) || "[]");
    return Array.isArray(parsed) ? parsed.filter((value) => typeof value === "string").slice(-30) : [];
  } catch {
    return [];
  }
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
            {"You'll be shown the tastes a reader expressed while swiping and the books NovelIdeas recommended. "}
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

          <Text style={styles.introHeading}>{"What you'll be asked about"}</Text>
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

function ChoiceButton(props: { title: string; description: string; onPress: () => void }) {
  return (
    <TouchableOpacity
      style={styles.choiceButton}
      onPress={props.onPress}
      accessibilityRole="button"
      accessibilityLabel={props.title}
    >
      <Text style={styles.choiceTitle}>{props.title}</Text>
      <Text style={styles.choiceDescription}>{props.description}</Text>
    </TouchableOpacity>
  );
}

function ModeChooser(props: {
  unavailableMessage?: string;
  loadingAnonymous: boolean;
  onSelf: () => void;
  onAnonymous: () => void;
  onCancel: () => void;
}) {
  return (
    <View style={styles.introOverlay}>
      <View style={styles.modePanel}>
        <Text style={styles.introTitle}>{"Choose how you'd like to review"}</Text>
        {props.unavailableMessage ? <Text style={styles.unavailableText}>{props.unavailableMessage}</Text> : null}
        <ChoiceButton
          title="Review My Own Recommendations"
          description="Swipe normally, let NovelIdeas learn your tastes, receive recommendations, then evaluate how well NovelIdeas understood you."
          onPress={props.onSelf}
        />
        <ChoiceButton
          title={props.loadingAnonymous ? "Finding an anonymous session..." : "Review an Anonymous Reader's Recommendations"}
          description="See the likes, dislikes, and skips from a completed anonymous reader session, then evaluate the exact books NovelIdeas recommended."
          onPress={props.onAnonymous}
        />
        <TouchableOpacity
          style={styles.introCancelButton}
          onPress={props.onCancel}
          accessibilityRole="button"
          accessibilityLabel="Cancel and return"
        >
          <Text style={styles.introCancelButtonText}>Cancel</Text>
        </TouchableOpacity>
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
  const [showModeChooser, setShowModeChooser] = useState(false);
  const [reviewMode, setReviewMode] = useState<"self" | "anonymous">("self");
  const [anonymousSession, setAnonymousSession] = useState<AnonymousReviewSession | undefined>();
  const [anonymousLoading, setAnonymousLoading] = useState(false);
  const [anonymousUnavailable, setAnonymousUnavailable] = useState("");
  const anonymousRequestSerialRef = useRef(0);
  const anonymousRequestInFlightRef = useRef(false);

  const handleDismiss = useCallback(() => {
    safeSetStorage(INTRO_DISMISSED_KEY, "1");
    setIntroDismissed(true);
    setShowModeChooser(true);
    router.setParams({ intro: undefined });
  }, [router]);

  const handleCancel = useCallback(() => {
    anonymousRequestSerialRef.current += 1;
    anonymousRequestInFlightRef.current = false;
    router.replace(returnTo as any);
  }, [returnTo, router]);

  const chooseSelfReview = useCallback(() => {
    anonymousRequestSerialRef.current += 1;
    anonymousRequestInFlightRef.current = false;
    setAnonymousLoading(false);
    setReviewMode("self");
    setAnonymousSession(undefined);
    setAnonymousUnavailable("");
    setShowModeChooser(false);
  }, []);

  const chooseAnonymousReview = useCallback(async () => {
    if (anonymousRequestInFlightRef.current) return;
    anonymousRequestInFlightRef.current = true;
    const requestSerial = ++anonymousRequestSerialRef.current;
    setAnonymousLoading(true);
    setAnonymousUnavailable("");
    try {
      const excluded = readRecentAnonymousSessions();
      const nonce = Math.random().toString(36).slice(2, 14);
      const response = await fetch(
        `/api/anonymous-human-review-session?exclude=${encodeURIComponent(excluded.join(","))}&nonce=${nonce}`,
        {
        headers: { accept: "application/json" },
        cache: "no-store",
        },
      );
      const payload = await response.json().catch(() => ({}));
      if (requestSerial !== anonymousRequestSerialRef.current) return;
      if (!response.ok || payload?.status !== "ok" || !payload?.session) {
        setAnonymousUnavailable(
          "No eligible anonymous sessions are available yet. Older sessions did not preserve enough privacy-safe evidence for responsible review.",
        );
        setShowModeChooser(true);
        return;
      }
      setAnonymousSession(payload.session as AnonymousReviewSession);
      setReviewMode("anonymous");
      setShowModeChooser(false);
    } catch {
      if (requestSerial !== anonymousRequestSerialRef.current) return;
      setAnonymousUnavailable("Anonymous sessions could not be loaded right now. You can still review your own recommendations.");
      setShowModeChooser(true);
    } finally {
      if (requestSerial === anonymousRequestSerialRef.current) {
        anonymousRequestInFlightRef.current = false;
        setAnonymousLoading(false);
      }
    }
  }, []);

  const exitAnonymousReview = useCallback(() => {
    setAnonymousSession(undefined);
    setShowModeChooser(true);
  }, []);

  const completeAnonymousReview = useCallback(() => {
    if (anonymousSession) {
      const next = [
        ...readRecentAnonymousSessions(),
        anonymousSession.anonymousSessionId,
      ].slice(-30);
      safeSetStorage(ANONYMOUS_REVIEW_RECENT_KEY, JSON.stringify(next));
    }
    setAnonymousSession(undefined);
    setShowModeChooser(true);
  }, [anonymousSession]);

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
          anonymousReviewSession={reviewMode === "anonymous" ? anonymousSession : undefined}
          onExitAnonymousReview={exitAnonymousReview}
          onCompleteAnonymousReview={completeAnonymousReview}
        />
      </View>

      {!introDismissed ? (
        <IntroBanner onStart={handleDismiss} onCancel={handleCancel} />
      ) : null}
      {introDismissed && showModeChooser ? (
        <ModeChooser
          unavailableMessage={anonymousUnavailable}
          loadingAnonymous={anonymousLoading}
          onSelf={chooseSelfReview}
          onAnonymous={() => void chooseAnonymousReview()}
          onCancel={handleCancel}
        />
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
  modePanel: {
    backgroundColor: "#0e2442",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#2a4a7a",
    maxWidth: 640,
    width: "100%",
    padding: 24,
  },
  choiceButton: {
    backgroundColor: "#123159",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#2f5f96",
    padding: 18,
    marginBottom: 14,
  },
  choiceTitle: {
    color: "#f0f7ff",
    fontSize: 17,
    fontWeight: "900",
    marginBottom: 6,
  },
  choiceDescription: {
    color: "#b8cfe0",
    fontSize: 14,
    lineHeight: 20,
  },
  unavailableText: {
    color: "#fcd34d",
    fontSize: 13,
    lineHeight: 19,
    marginBottom: 14,
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
