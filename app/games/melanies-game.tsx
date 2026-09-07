import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { Image } from "expo-image";
import { router, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AccessibilityInfo,
  ActivityIndicator,
  Animated,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { useGameRecommendationMilestone } from "../../hooks/useGameRecommendationMilestone";
import {
  adaptMelanieEvidenceToSignals,
  applyMelanieRecommendations,
  chooseMelanieRecommendation,
  completeMelanieFinal,
  completeMelanieRanking,
  conceptIndex,
  createInitialMelanieGame,
  rankMelanieRecommendation,
  reorderMelanieRanking,
  selectMelanieConcepts,
  updateMelanieFinalSelection,
  type MelanieConcept,
  type MelanieGameState,
  type MelanieRecommendationSnapshot,
} from "../../lib/recommendationGames/melaniesGame";
import {
  enqueueMelanieEvidence,
  flushMelanieEvidence,
} from "../../lib/recommendationGames/melaniesGameEvidenceClient";
import {
  createMelaniesGameStorageInstanceId,
  loadMelaniesGame,
  saveMelaniesGame,
} from "../../lib/recommendationGames/melaniesGamePersistence";
import {
  buildGameRouteSourceParams,
  parseGameRouteConfig,
  type GameRouteParams,
} from "../../lib/recommendationGames/gameRecommendationRouteConfig";

const STEP_BY_STAGE: Record<MelanieGameState["stage"], number> = {
  "choose-1": 1,
  "rank-1": 2,
  "choose-2": 3,
  "rank-2": 4,
  final: 5,
  recommendations: 5,
};

const POSITION_COPY = {
  strongest: ["Strongest match", "Closest to the choices that kept winning."],
  strong: ["Another strong match", "A second confident direction from your tournament."],
  adventurous: ["A little adventurous", "Just outside your center, supported by nearby signals."],
} as const;

function DecorativeLibraryBackdrop() {
  const shelf = (side: "left" | "right") => (
    <View style={[styles.shelf, side === "left" ? styles.shelfLeft : styles.shelfRight]}>
      {[0, 1, 2, 3].map((row) => (
        <View key={row} style={styles.shelfRow}>
          {[0, 1, 2, 3, 4].map((book) => (
            <View
              key={book}
              style={[
                styles.shelfBook,
                {
                  height: 33 + ((row * 7 + book * 11) % 20),
                  backgroundColor: ["#64331f", "#183f4d", "#54263b", "#79531f", "#26395c"][(row + book) % 5],
                },
              ]}
            />
          ))}
        </View>
      ))}
      <View style={styles.lamp}>
        <View style={styles.lampShade} />
        <View style={styles.lampStem} />
      </View>
    </View>
  );
  return (
    <View
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={styles.backdrop}
    >
      <View style={[styles.glow, styles.glowLeft]} />
      <View style={[styles.glow, styles.glowRight]} />
      {shelf("left")}
      {shelf("right")}
      <View style={[styles.libraryBanner, styles.bannerLeft]}>
        <Text style={styles.bannerText}>GREAT{"\n"}STORIES{"\n"}FIND{"\n"}CURIOUS{"\n"}PEOPLE</Text>
      </View>
      <View style={[styles.libraryBanner, styles.bannerRight]}>
        <Text style={styles.bannerText}>DIFFERENT{"\n"}STORIES{"\n"}BRIGHTER{"\n"}TOMORROWS</Text>
      </View>
      <MaterialCommunityIcons name="leaf" size={62} color="#31563f" style={styles.ivyLeft} />
      <MaterialCommunityIcons name="leaf" size={62} color="#31563f" style={styles.ivyRight} />
      <View style={styles.starField}>
        <Text style={styles.starDust}>✦　·　✧　　　　·　✦　　　✧　·</Text>
      </View>
    </View>
  );
}

function ConceptCover({ concept, size = "small" }: { concept: MelanieConcept; size?: "small" | "large" }) {
  const motif = concept.id.split("").reduce((sum, value) => sum + value.charCodeAt(0), 0) % 4;
  return (
    <View
      accessibilityLabel={`Fictional cover for ${concept.title}`}
      style={[
        styles.conceptCover,
        size === "large" && styles.conceptCoverLarge,
        { backgroundColor: concept.palette[1], borderColor: concept.palette[0] },
      ]}
    >
      <View style={[styles.coverFrame, { borderColor: concept.palette[0] }]} />
      {motif === 0 ? <MaterialCommunityIcons name="moon-waning-crescent" size={size === "large" ? 54 : 30} color={concept.palette[0]} /> : null}
      {motif === 1 ? <MaterialCommunityIcons name="tree-outline" size={size === "large" ? 56 : 31} color={concept.palette[0]} /> : null}
      {motif === 2 ? <MaterialCommunityIcons name="star-four-points-outline" size={size === "large" ? 56 : 31} color={concept.palette[0]} /> : null}
      {motif === 3 ? <MaterialCommunityIcons name="key-variant" size={size === "large" ? 54 : 30} color={concept.palette[0]} /> : null}
      <Text numberOfLines={3} style={[styles.coverTitle, size === "large" && styles.coverTitleLarge]}>{concept.title}</Text>
      <View style={[styles.coverRule, { backgroundColor: concept.palette[0] }]} />
    </View>
  );
}

function ConceptCard({
  concept,
  selected,
  survivor,
  selectionNumber,
  finalist,
  disabled,
  onPress,
}: {
  concept: MelanieConcept;
  selected: boolean;
  survivor: boolean;
  selectionNumber: number | null;
  finalist: boolean;
  disabled: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      testID={`melanie-concept-${concept.id}`}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: selected, disabled }}
      accessibilityLabel={`${concept.title}. ${concept.synopsis}`}
      accessibilityHint={selected ? "Remove this book concept from your picks" : "Choose this book concept"}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.conceptCard,
        finalist && styles.conceptFinalist,
        { borderColor: selected ? concept.palette[0] : "#45606b", backgroundColor: concept.palette[1] },
        selected && styles.conceptSelected,
        pressed && !disabled && styles.pressed,
        disabled && styles.disabled,
      ]}
    >
      <View style={[styles.bookSpine, { backgroundColor: concept.palette[0] }]} />
      <ConceptCover concept={concept} size={finalist ? "large" : "small"} />
      <View style={styles.conceptBody}>
        <View style={styles.conceptMeta}>
          {finalist ? <Text style={styles.finalistPill}>FINALIST</Text> : survivor ? <Text style={styles.survivorPill}>SURVIVOR</Text> : <Text style={styles.challengerPill}>CHALLENGER</Text>}
          <Text
            style={[
              styles.pickNumber,
              { borderColor: concept.palette[0], color: selected ? "#182027" : concept.palette[0] },
              selected && { backgroundColor: concept.palette[0] },
            ]}
          >
            {selectionNumber || ""}
          </Text>
        </View>
        <Text style={styles.conceptTitle}>{concept.title}</Text>
        <Text style={styles.synopsis}>{concept.synopsis}</Text>
      </View>
    </Pressable>
  );
}

function RankList({
  state,
  concepts,
  locked,
  onMove,
}: {
  state: MelanieGameState;
  concepts: Map<string, MelanieConcept>;
  locked: boolean;
  onMove: (id: string, direction: -1 | 1) => void;
}) {
  return (
    <View style={styles.rankList}>
      {state.ranking.map((id, index) => {
        const concept = concepts.get(id);
        if (!concept) return null;
        return (
          <View
            key={id}
            testID={`melanie-rank-${index + 1}`}
            style={[styles.rankRow, { borderColor: concept.palette[0] }]}
            accessibilityLabel={`Rank ${index + 1}, ${concept.title}`}
          >
            <Text style={[styles.rankNumber, { color: concept.palette[0] }]}>{index + 1}</Text>
            <ConceptCover concept={concept} />
            <View style={styles.rankCopy}>
              <Text style={styles.rankTitle}>{concept.title}</Text>
              <Text numberOfLines={2} style={styles.rankSynopsis}>{concept.synopsis}</Text>
            </View>
            <View style={styles.rankControls}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Move ${concept.title} up`}
                disabled={locked || index === 0}
                onPress={() => onMove(id, -1)}
                style={({ pressed }) => [styles.iconButton, (locked || index === 0) && styles.disabled, pressed && styles.pressed]}
              >
                <MaterialCommunityIcons name="arrow-up" size={21} color="#f5f0de" />
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Move ${concept.title} down`}
                disabled={locked || index === state.ranking.length - 1}
                onPress={() => onMove(id, 1)}
                style={({ pressed }) => [styles.iconButton, (locked || index === state.ranking.length - 1) && styles.disabled, pressed && styles.pressed]}
              >
                <MaterialCommunityIcons name="arrow-down" size={21} color="#f5f0de" />
              </Pressable>
            </View>
          </View>
        );
      })}
    </View>
  );
}

export default function MelaniesGameScreen() {
  const params = useLocalSearchParams<{
    playerId?: string;
    libraryId?: string;
    ageBand?: string;
    srcGoogleBooks?: string;
    srcOpenLibrary?: string;
    srcLocalLibrary?: string;
    srcKitsu?: string;
    srcComicVine?: string;
    srcNyt?: string;
  }>();
  const routeConfig = useMemo(() => parseGameRouteConfig(params as GameRouteParams), [params]);
  const storageInstanceId = useMemo(
    () => createMelaniesGameStorageInstanceId(routeConfig.playerId, routeConfig.libraryId, routeConfig.ageBand),
    [routeConfig.ageBand, routeConfig.libraryId, routeConfig.playerId],
  );
  const { width } = useWindowDimensions();
  const compact = width < 720;
  const [state, setState] = useState<MelanieGameState | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [locked, setLocked] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reducedMotion, setReducedMotion] = useState(true);
  const [feedbackSaved, setFeedbackSaved] = useState(false);
  const operationRef = useRef(0);
  const commitInFlightRef = useRef(false);
  const activeContextRef = useRef("");
  const transition = useRef(new Animated.Value(1)).current;
  const concepts = useMemo(() => conceptIndex(routeConfig.ageBand), [routeConfig.ageBand]);
  const activeStage = state?.stage;
  const contextKey = `${routeConfig.playerId}:${routeConfig.libraryId}:${routeConfig.ageBand}`;
  const recommendationIntegration = useGameRecommendationMilestone({
    game: "melanies_game",
    gameLabel: "Melanie's Game",
    playerId: routeConfig.playerId,
    gameSessionId: state?.gameSessionId || "",
    libraryId: routeConfig.libraryId,
    ageBand: routeConfig.ageBand,
    sourceFlags: routeConfig.sourceFlags,
    localCollectionOnly: routeConfig.localCollectionOnly,
    evidenceMode: "semantic_only",
    sessionScopedEvidence: true,
  });

  useEffect(() => {
    if (Platform.OS === "web" && typeof document !== "undefined") document.title = "Melanie's Game";
  }, []);

  useEffect(() => {
    const contextToken = contextKey;
    activeContextRef.current = contextToken;
    operationRef.current += 1;
    setLoading(true);
    setState(null);
    setError(null);
    let cancelled = false;
    void (async () => {
      try {
        const saved = await loadMelaniesGame(
          routeConfig.playerId,
          routeConfig.libraryId,
          routeConfig.ageBand,
          storageInstanceId,
        );
        const next = saved || createInitialMelanieGame({
          anonymousPlayerId: routeConfig.playerId,
          libraryId: routeConfig.libraryId,
          ageBand: routeConfig.ageBand,
        });
        if (!saved) await saveMelaniesGame(next, storageInstanceId);
        try {
          await enqueueMelanieEvidence(next.evidence);
          void flushMelanieEvidence().catch((syncError) => {
            console.warn("[melanies-game] evidence_flush_failed", syncError);
          });
        } catch (syncError) {
          console.warn("[melanies-game] evidence_reconcile_failed", syncError);
        }
        if (!cancelled && activeContextRef.current === contextToken) setState(next);
      } catch {
        if (!cancelled && activeContextRef.current === contextToken) {
          setError("Saved progress could not be loaded. Start a new tournament to continue.");
        }
      } finally {
        if (!cancelled && activeContextRef.current === contextToken) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
      operationRef.current += 1;
    };
  }, [contextKey, loadAttempt, routeConfig.ageBand, routeConfig.libraryId, routeConfig.playerId, storageInstanceId]);

  useEffect(() => {
    void AccessibilityInfo.isReduceMotionEnabled().then(setReducedMotion);
    const subscription = AccessibilityInfo.addEventListener("reduceMotionChanged", setReducedMotion);
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    void flushMelanieEvidence().catch((syncError) => console.warn("[melanies-game] evidence_flush_failed", syncError));
    if (Platform.OS !== "web" || typeof window === "undefined") return;
    const flush = () => {
      void flushMelanieEvidence().catch((syncError) => console.warn("[melanies-game] evidence_flush_failed", syncError));
    };
    window.addEventListener("online", flush);
    return () => window.removeEventListener("online", flush);
  }, []);

  useEffect(() => {
    if (!activeStage) return;
    transition.stopAnimation();
    if (reducedMotion) {
      transition.setValue(1);
      return;
    }
    transition.setValue(0);
    Animated.timing(transition, { toValue: 1, duration: 260, useNativeDriver: true }).start();
  }, [activeStage, reducedMotion, transition]);

  const commit = useCallback(async (next: MelanieGameState) => {
    if (commitInFlightRef.current) return false;
    const contextToken = activeContextRef.current;
    if (
      next.anonymousPlayerId !== routeConfig.playerId
      || next.libraryId !== routeConfig.libraryId
      || next.ageBand !== routeConfig.ageBand
    ) return false;
    commitInFlightRef.current = true;
    setLocked(true);
    setError(null);
    try {
      await saveMelaniesGame(next, storageInstanceId);
      if (activeContextRef.current !== contextToken) return false;
      let evidenceQueued = true;
      try {
        await enqueueMelanieEvidence(next.evidence);
      } catch (syncError) {
        evidenceQueued = false;
        console.warn("[melanies-game] evidence_enqueue_failed", syncError);
      }
      if (activeContextRef.current !== contextToken) return false;
      setState(next);
      if (evidenceQueued && next.evidence.length) {
        void flushMelanieEvidence().catch((syncError) => {
          console.warn("[melanies-game] evidence_flush_failed", syncError);
        });
      } else if (!evidenceQueued) {
        setError("Your progress is saved, but evidence sync is paused. It will retry with your next choice or reload.");
      }
      return true;
    } catch {
      setError("That choice was not saved. Please try again.");
      return false;
    } finally {
      commitInFlightRef.current = false;
      setLocked(false);
    }
  }, [routeConfig.ageBand, routeConfig.libraryId, routeConfig.playerId, storageInstanceId]);

  function toggleChoice(id: string) {
    if (!state || locked) return;
    const selected = state.selectedIds.includes(id);
    const nextIds = selected ? state.selectedIds.filter((value) => value !== id) : [...state.selectedIds, id];
    if (!selected && state.selectedIds.length >= 3) return;
    const next = state.stage === "final"
      ? updateMelanieFinalSelection(state, nextIds)
      : { ...state, selectedIds: nextIds, ranking: nextIds, updatedAt: new Date().toISOString() };
    void commit(next);
  }

  function confirmChoice() {
    if (!state || !state.selectedIds.length || locked) return;
    void commit(selectMelanieConcepts(state, state.selectedIds));
  }

  function moveRanking(id: string, direction: -1 | 1) {
    if (!state || locked) return;
    void commit(reorderMelanieRanking(state, id, direction));
  }

  function finishRanking() {
    if (!state || !state.ranking.length || locked) return;
    void commit(completeMelanieRanking(state));
  }

  async function unlockRecommendations() {
    if (!state || state.stage !== "final" || !state.ranking.length || locked) return;
    const operation = ++operationRef.current;
    const completed = completeMelanieFinal(state);
    if (!await commit(completed) || operation !== operationRef.current) return;
    setLocked(true);
    setError(null);
    try {
      const generated = await recommendationIntegration.generateFinalRecommendations(
        `${completed.gameSessionId}:final-tournament`,
        adaptMelanieEvidenceToSignals(completed.evidence),
      );
      if (!generated || operation !== operationRef.current) return;
      const recommendations: MelanieRecommendationSnapshot[] = generated.items.map((item) => ({
        ...item.book,
        position: item.position,
        coverUrl: item.coverUrl,
        description: item.description,
        reason: item.reason,
      }));
      await commit(applyMelanieRecommendations(completed, recommendations, generated.shownAt));
    } catch (generationError) {
      if (operation === operationRef.current) {
        console.warn("[melanies-game] final_recommendation_failed", generationError);
        setError("We couldn't reach the recommendation shelves. Your tournament is safe; try again.");
      }
    } finally {
      if (operation === operationRef.current) setLocked(false);
    }
  }

  function retryRecommendations() {
    if (!state || state.stage !== "recommendations" || state.recommendations.length) return;
    const retryState = { ...state, stage: "final" as const };
    setState(retryState);
    void unlockRecommendationsFrom(retryState);
  }

  async function unlockRecommendationsFrom(source: MelanieGameState) {
    const operation = ++operationRef.current;
    setLocked(true);
    setError(null);
    try {
      const generated = await recommendationIntegration.generateFinalRecommendations(
        `${source.gameSessionId}:final-tournament`,
        adaptMelanieEvidenceToSignals(source.evidence),
      );
      if (!generated || operation !== operationRef.current) return;
      const recommendations: MelanieRecommendationSnapshot[] = generated.items.map((item) => ({
        ...item.book,
        position: item.position,
        coverUrl: item.coverUrl,
        description: item.description,
        reason: item.reason,
      }));
      await commit(applyMelanieRecommendations({ ...source, stage: "recommendations" }, recommendations, generated.shownAt));
    } catch (generationError) {
      if (operation === operationRef.current) {
        console.warn("[melanies-game] final_recommendation_retry_failed", generationError);
        setError("Recommendations are still unavailable. Your tournament remains saved.");
      }
    } finally {
      if (operation === operationRef.current) setLocked(false);
    }
  }

  function moveRecommendation(id: string, direction: -1 | 1) {
    if (!state || locked || state.feedbackRecorded) return;
    void commit(rankMelanieRecommendation(state, id, direction));
  }

  function chooseRecommendation(id: string) {
    if (!state || locked || state.feedbackRecorded) return;
    void commit(chooseMelanieRecommendation(state, state.finalPreferredBookId === id ? null : id));
  }

  async function saveFinalPreference() {
    if (!state || state.feedbackRecorded || !state.finalFeedbackInteracted || !state.recommendationShownAt || locked) return;
    setLocked(true);
    try {
      const saved = await recommendationIntegration.submitFinalRecommendationFeedback({
        recommendations: state.recommendations.map(({ id, source, sourceId, title, author, rank }) => ({
          id, source, sourceId, title, author, rank,
        })),
        ranking: state.finalRecommendationRanking,
        preferredBookId: state.finalPreferredBookId,
        shownAt: state.recommendationShownAt,
      });
      if (!saved) throw new Error("feedback_queue_failed");
      const next = { ...state, feedbackRecorded: true, updatedAt: new Date().toISOString() };
      await saveMelaniesGame(next, storageInstanceId);
      setState(next);
      setFeedbackSaved(true);
    } catch (feedbackError) {
      console.warn("[melanies-game] final_feedback_save_failed", feedbackError);
      setError("Your answer could not be saved yet. Please try again.");
    } finally {
      setLocked(false);
    }
  }

  function exitGame() {
    operationRef.current += 1;
    router.replace({
      pathname: "/games",
      params: {
        playerId: routeConfig.playerId,
        libraryId: routeConfig.libraryId,
        ageBand: routeConfig.ageBand,
        ...buildGameRouteSourceParams(routeConfig.sourceFlags),
      },
    });
  }

  async function restart() {
    if (locked) return;
    operationRef.current += 1;
    const next = createInitialMelanieGame({
      anonymousPlayerId: routeConfig.playerId,
      libraryId: routeConfig.libraryId,
      ageBand: routeConfig.ageBand,
    });
    await recommendationIntegration.resetSession(next.gameSessionId);
    setFeedbackSaved(false);
    await commit(next);
  }

  const stateMatchesRoute = state?.anonymousPlayerId === routeConfig.playerId
    && state.libraryId === routeConfig.libraryId
    && state.ageBand === routeConfig.ageBand;
  if (loading || (!state && !error) || (state && !stateMatchesRoute)) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.loading}>
          <ActivityIndicator size="large" color="#ffd26f" />
          <Text style={styles.loadingText}>Setting the tournament table...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!state) {
    return (
      <SafeAreaView style={styles.safe}>
        <DecorativeLibraryBackdrop />
        <View style={styles.loading}>
          <MaterialCommunityIcons name="bookshelf" size={44} color="#ffd26f" />
          <Text accessibilityRole="alert" style={styles.loadingText}>{error}</Text>
          <Pressable accessibilityRole="button" onPress={() => setLoadAttempt((attempt) => attempt + 1)} style={styles.primaryButton}>
            <Text style={styles.primaryButtonText}>Try loading again</Text>
          </Pressable>
          <Pressable accessibilityRole="button" onPress={exitGame} style={styles.secondaryButton}>
            <Text style={styles.secondaryButtonText}>Back to Games</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  if (!state.introDismissed) {
    return (
      <SafeAreaView style={styles.safe}>
        <DecorativeLibraryBackdrop />
        <ScrollView contentContainerStyle={styles.entryScroll}>
          <Pressable accessibilityRole="button" accessibilityLabel="Back to Games" onPress={exitGame} style={styles.entryBack}>
            <MaterialCommunityIcons name="arrow-left" size={18} color="#f5c66b" />
            <Text style={styles.entryBackText}>Back</Text>
          </Pressable>
          <View style={styles.entryCenter}>
            <View style={styles.crest}>
              <Text style={styles.laurel}>❧</Text>
              <MaterialCommunityIcons name="book-open-page-variant-outline" size={48} color="#f2bd5f" />
              <Text style={styles.laurel}>❧</Text>
            </View>
            <Text style={styles.entryTitle}>Melanie&apos;s Game</Text>
            <Text style={styles.entrySubtitle}>THE TOURNAMENT OF STORIES</Text>
            <View style={styles.ornament}><View style={styles.ornamentLine} /><Text style={styles.ornamentStar}>✦</Text><View style={styles.ornamentLine} /></View>
            <Text testID="melanie-self-choice-instruction" accessibilityRole="header" style={styles.entryInstruction}>
              There is no imaginary person.{"\n"}Pick the book YOU want.
            </Text>
            <Text style={styles.entryCopy}>
              Read the one-sentence premises. Choose the ones you&apos;d most like to read. Each round helps us learn what you love.
            </Text>
            <Pressable
              testID="melanie-begin"
              accessibilityRole="button"
              onPress={() => void commit({ ...state, introDismissed: true, updatedAt: new Date().toISOString() })}
              style={({ pressed }) => [styles.entryButton, pressed && styles.pressed]}
            >
              <Text style={styles.entryButtonText}>Let the Tournament Begin</Text>
              <MaterialCommunityIcons name="arrow-right" size={20} color="#191d1f" />
            </Pressable>
          </View>
          <View
            pointerEvents="none"
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
            style={styles.entryCat}
          >
            <MaterialCommunityIcons name="cat" size={88} color="#0c1012" />
            <View style={styles.entryBookPile}>
              <View style={[styles.entryBook, { width: 132, backgroundColor: "#7b3a22" }]} />
              <View style={[styles.entryBook, { width: 112, backgroundColor: "#183e52" }]} />
              <View style={[styles.entryBook, { width: 142, backgroundColor: "#604927" }]} />
            </View>
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  const stageStep = STEP_BY_STAGE[state.stage];
  const isChoose = state.stage === "choose-1" || state.stage === "choose-2";
  const isRank = state.stage === "rank-1" || state.stage === "rank-2";
  const isFinal = state.stage === "final";
  const currentConcepts = state.currentConceptIds.map((id) => concepts.get(id)).filter((value): value is MelanieConcept => Boolean(value));
  const entranceStyle = {
    opacity: transition,
    transform: [{ translateY: transition.interpolate({ inputRange: [0, 1], outputRange: [reducedMotion ? 0 : 12, 0] }) }],
  };

  return (
    <SafeAreaView style={styles.safe}>
      <DecorativeLibraryBackdrop />
      <View style={styles.topBar}>
        <Pressable accessibilityRole="button" accessibilityLabel="Back to Games" onPress={exitGame} style={styles.backButton}>
          <MaterialCommunityIcons name="arrow-left" size={18} color="#f8f1dc" />
          <Text style={styles.backText}>Games</Text>
        </Pressable>
        <View style={styles.brand}>
          <Text style={styles.brandEyebrow}>THE PREMISE TOURNAMENT</Text>
          <Text style={styles.brandTitle}>Melanie&apos;s Game</Text>
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel="Start a new tournament" onPress={() => void restart()} style={styles.restartButton}>
          <MaterialCommunityIcons name="refresh" size={18} color="#f8f1dc" />
          {!compact ? <Text style={styles.backText}>New</Text> : null}
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <View style={styles.progressWrap} accessibilityLabel={`Tournament step ${stageStep} of 5`}>
          {[1, 2, 3, 4, 5].map((step) => (
            <View key={step} style={[styles.progressSegment, step <= stageStep && styles.progressActive]} />
          ))}
        </View>

        <Animated.View style={[styles.stage, entranceStyle]}>
          {state.stage === "choose-1" ? (
            <View style={styles.hero}>
              <Text style={styles.heroKicker}>ROUND ONE · CHOOSE UP TO THREE</Text>
              <Text testID="melanie-self-choice-instruction" accessibilityRole="header" style={styles.heroTitle}>
                There is no imaginary person. Pick the book YOU want.
              </Text>
              <Text style={styles.heroCopy}>Read every one-sentence premise, then advance the stories you would genuinely open.</Text>
            </View>
          ) : null}
          {state.stage === "choose-2" ? (
            <View style={styles.hero}>
              <Text style={styles.heroKicker}>ROUND TWO · SURVIVORS + CHALLENGERS</Text>
              <Text accessibilityRole="header" style={styles.heroTitle}>Which would you most want to read now?</Text>
              <Text style={styles.heroCopy}>Your strongest picks stayed. New challengers were chosen to test what made them win.</Text>
            </View>
          ) : null}
          {isRank ? (
            <View style={styles.hero}>
              <Text style={styles.heroKicker}>{state.stage === "rank-1" ? "ROUND ONE" : "ROUND TWO"} · RANK</Text>
              <Text accessibilityRole="header" style={styles.heroTitle}>Put these in the order you&apos;d want to read them.</Text>
              <Text style={styles.heroCopy}>Move your strongest choice to the top. The order changes what advances.</Text>
            </View>
          ) : null}
          {isFinal ? (
            <View style={styles.hero}>
              <Text style={styles.heroKicker}>FINAL COMPARISON</Text>
              <Text accessibilityRole="header" style={styles.heroTitle}>Choose up to three finalists, then order them.</Text>
              <Text style={styles.heroCopy}>Two proven favorites face the last adaptive challengers.</Text>
            </View>
          ) : null}

          {(isChoose || isFinal) ? (
            <>
              <View style={[styles.conceptGrid, compact && styles.conceptGridCompact]}>
                {(isFinal && state.selectedIds.length === 3
                  ? currentConcepts.filter((concept) => state.selectedIds.includes(concept.id))
                  : currentConcepts).map((concept) => {
                  const selectedIndex = state.selectedIds.indexOf(concept.id);
                  const selected = selectedIndex >= 0;
                  return (
                    <ConceptCard
                      key={concept.id}
                      concept={concept}
                      selected={selected}
                      survivor={state.survivorIds.includes(concept.id)}
                      selectionNumber={selected ? selectedIndex + 1 : null}
                      finalist={isFinal && state.selectedIds.length === 3}
                      disabled={locked || (!selected && state.selectedIds.length >= 3)}
                      onPress={() => toggleChoice(concept.id)}
                    />
                  );
                })}
              </View>
              {isFinal && state.selectedIds.length === 3 ? (
                <Pressable
                  accessibilityRole="button"
                  onPress={() => void commit(updateMelanieFinalSelection(state, []))}
                  style={styles.changeFinalists}
                >
                  <Text style={styles.changeFinalistsText}>Change finalists</Text>
                </Pressable>
              ) : null}
              {isFinal && state.ranking.length ? (
                <View style={styles.finalRank}>
                  <Text style={styles.sectionTitle}>Order your finalists</Text>
                  <RankList state={state} concepts={concepts} locked={locked} onMove={moveRanking} />
                </View>
              ) : null}
              <View style={styles.actionBar}>
                <Text style={styles.selectionCount}>{state.selectedIds.length} of 3 selected</Text>
                <Pressable
                  testID={isFinal ? "melanie-unlock-recommendations" : "melanie-confirm-selection"}
                  accessibilityRole="button"
                  disabled={locked || !state.selectedIds.length}
                  onPress={isFinal ? () => void unlockRecommendations() : confirmChoice}
                  style={({ pressed }) => [styles.primaryButton, (!state.selectedIds.length || locked) && styles.disabled, pressed && styles.pressed]}
                >
                  {locked && isFinal ? <ActivityIndicator color="#1b2330" /> : null}
                  <Text style={styles.primaryButtonText}>{isFinal ? "Unlock real recommendations" : "Advance these books"}</Text>
                  <MaterialCommunityIcons name="arrow-right" size={20} color="#1b2330" />
                </Pressable>
              </View>
            </>
          ) : null}

          {isRank ? (
            <>
              <RankList state={state} concepts={concepts} locked={locked} onMove={moveRanking} />
              <View style={styles.actionBar}>
                <Text style={styles.selectionCount}>Top choice carries the most weight</Text>
                <Pressable
                  testID="melanie-confirm-ranking"
                  accessibilityRole="button"
                  disabled={locked}
                  onPress={finishRanking}
                  style={({ pressed }) => [styles.primaryButton, locked && styles.disabled, pressed && styles.pressed]}
                >
                  <Text style={styles.primaryButtonText}>Lock this ranking</Text>
                  <MaterialCommunityIcons name="trophy-outline" size={20} color="#1b2330" />
                </Pressable>
              </View>
            </>
          ) : null}

          {state.stage === "recommendations" ? (
            <View>
              <View style={styles.hero}>
                <Text style={styles.heroKicker}>TOURNAMENT COMPLETE</Text>
                <Text accessibilityRole="header" style={styles.heroTitle}>Three real books rose from your choices.</Text>
                <Text style={styles.heroCopy}>These came from the active NovelIdeas sources for your age and library context.</Text>
              </View>
              {!state.recommendations.length ? (
                <View style={styles.retryCard}>
                  {locked ? <ActivityIndicator size="large" color="#ffd26f" /> : <MaterialCommunityIcons name="bookshelf" size={40} color="#ffd26f" />}
                  <Text style={styles.retryTitle}>{locked ? "Searching the real shelves..." : "The shelves didn't answer yet."}</Text>
                  <Text style={styles.retryCopy}>Your tournament is saved. Retry without replaying any round.</Text>
                  {!locked ? (
                    <Pressable accessibilityRole="button" onPress={retryRecommendations} style={styles.primaryButton}>
                      <Text style={styles.primaryButtonText}>Try recommendations again</Text>
                    </Pressable>
                  ) : null}
                </View>
              ) : (
                <>
                  <View style={[styles.recommendationGrid, compact && styles.conceptGridCompact]}>
                    {state.recommendations.map((book) => {
                      const copy = POSITION_COPY[book.position];
                      const preferred = state.finalPreferredBookId === book.id;
                      return (
                        <Pressable
                          key={book.id}
                          testID={`melanie-real-recommendation-${book.position}`}
                          accessibilityRole="radio"
                          accessibilityState={{ selected: preferred }}
                          accessibilityLabel={`${copy[0]}: ${book.title} by ${book.author}`}
                          disabled={locked || state.feedbackRecorded}
                          onPress={() => chooseRecommendation(book.id)}
                          style={({ pressed }) => [
                            styles.recommendationCard,
                            preferred && styles.recommendationSelected,
                            state.feedbackRecorded && styles.disabled,
                            pressed && styles.pressed,
                          ]}
                        >
                          <Text style={styles.positionLabel}>{copy[0]}</Text>
                          <Text style={styles.positionCopy}>{copy[1]}</Text>
                          {book.coverUrl ? (
                            <Image
                              source={{ uri: book.coverUrl }}
                              style={styles.cover}
                              contentFit="cover"
                              accessibilityLabel={`Cover of ${book.title}`}
                            />
                          ) : <View style={[styles.cover, styles.coverFallback]}><MaterialCommunityIcons name="book-open-variant" size={34} color="#a8b2b5" /></View>}
                          <Text style={styles.recommendationTitle}>{book.title}</Text>
                          {book.author ? <Text style={styles.author}>by {book.author}</Text> : null}
                          {book.description ? <Text style={styles.description}>{book.description}</Text> : null}
                          <Text style={styles.whyLabel}>WHY IT FITS</Text>
                          <Text style={styles.reason}>{book.reason}</Text>
                          <View style={[styles.readFirst, preferred && styles.readFirstSelected]}>
                            <Text style={styles.readFirstText}>{preferred ? "My first pick" : "I'd read this first"}</Text>
                          </View>
                        </Pressable>
                      );
                    })}
                  </View>
                  <View style={styles.feedbackPanel}>
                    <Text style={styles.sectionTitle}>Which would you read first?</Text>
                    <Text style={styles.feedbackHint}>Optional: choose a card, or refine the full order below.</Text>
                    {state.finalRecommendationRanking.map((id, index) => {
                      const book = state.recommendations.find((candidate) => candidate.id === id);
                      if (!book) return null;
                      return (
                        <View key={id} style={styles.feedbackRow}>
                          <Text style={styles.feedbackRank}>{index + 1}</Text>
                          <Text style={styles.feedbackBook}>{book.title}</Text>
                          <Pressable
                            accessibilityRole="button"
                            accessibilityLabel={`Move ${book.title} up`}
                            disabled={locked || state.feedbackRecorded || index === 0}
                            onPress={() => moveRecommendation(id, -1)}
                            style={[styles.smallIconButton, (locked || state.feedbackRecorded || index === 0) && styles.disabled]}
                          >
                            <MaterialCommunityIcons name="arrow-up" size={18} color="#f8f1dc" />
                          </Pressable>
                          <Pressable
                            accessibilityRole="button"
                            accessibilityLabel={`Move ${book.title} down`}
                            disabled={locked || state.feedbackRecorded || index === state.finalRecommendationRanking.length - 1}
                            onPress={() => moveRecommendation(id, 1)}
                            style={[styles.smallIconButton, (locked || state.feedbackRecorded || index === state.finalRecommendationRanking.length - 1) && styles.disabled]}
                          >
                            <MaterialCommunityIcons name="arrow-down" size={18} color="#f8f1dc" />
                          </Pressable>
                        </View>
                      );
                    })}
                    <View style={styles.feedbackActions}>
                      <Pressable
                        testID="melanie-save-final-feedback"
                        accessibilityRole="button"
                        disabled={locked || state.feedbackRecorded || !state.finalFeedbackInteracted}
                        onPress={() => void saveFinalPreference()}
                        style={[styles.primaryButton, (locked || state.feedbackRecorded || !state.finalFeedbackInteracted) && styles.disabled]}
                      >
                        <Text style={styles.primaryButtonText}>{state.feedbackRecorded || feedbackSaved ? "Answer saved" : "Save optional answer"}</Text>
                      </Pressable>
                      <Pressable accessibilityRole="button" onPress={exitGame} style={styles.secondaryButton}>
                        <Text style={styles.secondaryButtonText}>Finish without answering</Text>
                      </Pressable>
                    </View>
                  </View>
                </>
              )}
            </View>
          ) : null}

          {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
        </Animated.View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#07131c" },
  backdrop: { ...StyleSheet.absoluteFillObject, overflow: "hidden", backgroundColor: "#07131c" },
  glow: { position: "absolute", width: 520, height: 520, borderRadius: 260, opacity: 0.13 },
  glowLeft: { left: -310, top: 110, backgroundColor: "#0f8394" },
  glowRight: { right: -300, bottom: -180, backgroundColor: "#e4862c" },
  shelf: { position: "absolute", top: 0, bottom: 0, width: 142, paddingHorizontal: 11, paddingTop: 92, opacity: 0.48, backgroundColor: "#160f0d", borderColor: "#744222" },
  shelfLeft: { left: 0, borderRightWidth: 3 },
  shelfRight: { right: 0, borderLeftWidth: 3, transform: [{ scaleX: -1 }] },
  shelfRow: { height: 82, marginBottom: 20, borderBottomWidth: 7, borderBottomColor: "#6e3c21", flexDirection: "row", alignItems: "flex-end", gap: 4 },
  shelfBook: { flex: 1, minWidth: 12, borderWidth: 1, borderColor: "#a36832", borderTopLeftRadius: 3, borderTopRightRadius: 3 },
  lamp: { position: "absolute", top: 42, left: 49, alignItems: "center" },
  lampShade: { width: 42, height: 30, borderTopLeftRadius: 20, borderTopRightRadius: 20, backgroundColor: "#efac42", opacity: 0.85, shadowColor: "#ffb944", shadowOpacity: 1, shadowRadius: 20 },
  lampStem: { width: 4, height: 24, backgroundColor: "#9d6530" },
  starField: { position: "absolute", top: 28, left: 170, right: 170, alignItems: "center" },
  starDust: { color: "#dca94f", opacity: 0.42, fontSize: 17, letterSpacing: 7 },
  libraryBanner: { position: "absolute", top: 120, width: 90, minHeight: 186, borderWidth: 1, borderColor: "#a46e2e", backgroundColor: "#073242", paddingHorizontal: 8, paddingVertical: 18, alignItems: "center" },
  bannerLeft: { left: 26 },
  bannerRight: { right: 26 },
  bannerText: { color: "#dca84b", fontFamily: "Georgia", fontSize: 12, lineHeight: 23, textAlign: "center" },
  ivyLeft: { position: "absolute", left: 100, top: 17, transform: [{ rotate: "22deg" }] },
  ivyRight: { position: "absolute", right: 100, top: 17, transform: [{ rotate: "-22deg" }, { scaleX: -1 }] },
  topBar: { minHeight: 76, paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: "#6b4925", flexDirection: "row", alignItems: "center", justifyContent: "space-between", backgroundColor: "rgba(5,16,24,0.96)" },
  backButton: { minWidth: 78, minHeight: 44, paddingHorizontal: 12, borderRadius: 7, borderWidth: 1, borderColor: "#9d6a2c", flexDirection: "row", gap: 7, alignItems: "center", justifyContent: "center", backgroundColor: "#101b20" },
  restartButton: { minWidth: 54, minHeight: 44, paddingHorizontal: 12, borderRadius: 7, borderWidth: 1, borderColor: "#9d6a2c", flexDirection: "row", gap: 7, alignItems: "center", justifyContent: "center", backgroundColor: "#101b20" },
  backText: { color: "#f5c66b", fontWeight: "800", fontSize: 14 },
  brand: { alignItems: "center", flex: 1, paddingHorizontal: 8 },
  brandEyebrow: { color: "#d39b3d", fontSize: 9, lineHeight: 13, fontWeight: "900", letterSpacing: 2.1 },
  brandTitle: { color: "#f5c66b", fontFamily: "Georgia", fontSize: 25, lineHeight: 29, fontWeight: "800" },
  scroll: { width: "100%", maxWidth: 1120, alignSelf: "center", paddingHorizontal: 24, paddingTop: 16, paddingBottom: 54 },
  progressWrap: { flexDirection: "row", gap: 7, maxWidth: 560, width: "100%", alignSelf: "center" },
  progressSegment: { flex: 1, height: 4, borderRadius: 2, backgroundColor: "#273e48", borderWidth: 1, borderColor: "#34535e" },
  progressActive: { backgroundColor: "#e7aa43", borderColor: "#ffd06d", shadowColor: "#ffbd4c", shadowOpacity: 0.65, shadowRadius: 8 },
  stage: { width: "100%" },
  hero: { alignItems: "center", paddingVertical: 22, gap: 7 },
  heroKicker: { color: "#dca84b", fontSize: 11, lineHeight: 16, fontWeight: "900", letterSpacing: 2.3, textAlign: "center" },
  heroTitle: { maxWidth: 760, color: "#fff2d0", fontFamily: "Georgia", fontSize: 32, lineHeight: 39, fontWeight: "800", letterSpacing: -0.5, textAlign: "center", textShadowColor: "rgba(0,0,0,0.8)", textShadowRadius: 9 },
  heroCopy: { maxWidth: 650, color: "#c1ccd0", fontSize: 14, lineHeight: 21, textAlign: "center" },
  conceptGrid: { flexDirection: "row", flexWrap: "wrap", gap: 14 },
  conceptGridCompact: { flexDirection: "column" },
  conceptCard: { flexBasis: "31%", flexGrow: 1, minWidth: 285, minHeight: 176, borderWidth: 1.5, borderRadius: 9, overflow: "hidden", flexDirection: "row", alignItems: "stretch", shadowColor: "#000", shadowOpacity: 0.4, shadowRadius: 14, shadowOffset: { width: 0, height: 8 } },
  conceptFinalist: { minHeight: 328, flexDirection: "column", alignItems: "center", justifyContent: "flex-start", paddingTop: 16, borderColor: "#e5a846", backgroundColor: "#142732", shadowColor: "#f0aa3d", shadowOpacity: 0.48, shadowRadius: 18 },
  conceptSelected: { transform: [{ translateY: -3 }], shadowColor: "#efb74d", shadowOpacity: 0.66, shadowRadius: 15 },
  bookSpine: { width: 6 },
  conceptBody: { flex: 1, padding: 14 },
  conceptCover: { width: 80, minHeight: 126, margin: 11, marginRight: 0, borderWidth: 1.5, borderRadius: 5, alignItems: "center", justifyContent: "center", paddingHorizontal: 7, overflow: "hidden", shadowColor: "#000", shadowOpacity: 0.5, shadowRadius: 7 },
  conceptCoverLarge: { width: 142, height: 210, minHeight: 210, margin: 0, shadowColor: "#e3a844", shadowOpacity: 0.48, shadowRadius: 12 },
  coverFrame: { ...StyleSheet.absoluteFillObject, margin: 5, borderWidth: 1, borderRadius: 3, opacity: 0.6 },
  coverTitle: { color: "#fff5dc", fontFamily: "Georgia", fontSize: 10, lineHeight: 12, fontWeight: "800", textAlign: "center", marginTop: 8 },
  coverTitleLarge: { fontSize: 16, lineHeight: 19, paddingHorizontal: 7 },
  coverRule: { width: 34, height: 1, marginTop: 8, opacity: 0.8 },
  conceptMeta: { minHeight: 25, flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  survivorPill: { color: "#102428", backgroundColor: "#66cbd1", borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3, fontSize: 9, fontWeight: "900", letterSpacing: 1.2 },
  challengerPill: { color: "#c79b50", fontSize: 9, fontWeight: "900", letterSpacing: 1.2 },
  finalistPill: { color: "#251708", backgroundColor: "#e9b34f", borderRadius: 10, paddingHorizontal: 10, paddingVertical: 4, fontSize: 10, fontWeight: "900", letterSpacing: 1.5 },
  pickNumber: { width: 28, height: 28, lineHeight: 25, borderRadius: 14, borderWidth: 1.5, fontSize: 13, fontWeight: "900", textAlign: "center", overflow: "hidden" },
  conceptTitle: { color: "#fff1cf", fontFamily: "Georgia", fontSize: 19, lineHeight: 23, fontWeight: "800", marginTop: 8 },
  synopsis: { color: "#d3dcda", fontSize: 13, lineHeight: 19, marginTop: 7 },
  pressed: { opacity: 0.76, transform: [{ scale: 0.99 }] },
  disabled: { opacity: 0.42 },
  changeFinalists: { alignSelf: "center", minHeight: 44, marginTop: 12, paddingHorizontal: 18, borderRadius: 8, borderWidth: 1, borderColor: "#866332", alignItems: "center", justifyContent: "center" },
  changeFinalistsText: { color: "#e9bd6b", fontSize: 13, fontWeight: "800" },
  actionBar: { marginTop: 20, padding: 12, borderWidth: 1, borderColor: "#735029", borderRadius: 10, backgroundColor: "rgba(7,20,28,0.96)", flexDirection: "row", flexWrap: "wrap", gap: 13, alignItems: "center", justifyContent: "space-between" },
  selectionCount: { color: "#b9c8ca", fontWeight: "700", fontSize: 14 },
  primaryButton: { minHeight: 48, paddingHorizontal: 19, paddingVertical: 12, borderRadius: 7, borderWidth: 1, borderColor: "#ffd576", backgroundColor: "#e9ad46", flexDirection: "row", gap: 8, alignItems: "center", justifyContent: "center", shadowColor: "#f0ad40", shadowOpacity: 0.38, shadowRadius: 10 },
  primaryButtonText: { color: "#1b2330", fontSize: 14, lineHeight: 19, fontWeight: "900" },
  rankList: { width: "100%", maxWidth: 760, alignSelf: "center", gap: 12 },
  rankRow: { minHeight: 118, borderWidth: 1.5, borderRadius: 9, backgroundColor: "#102833", padding: 10, flexDirection: "row", alignItems: "center", gap: 10, shadowColor: "#000", shadowOpacity: 0.35, shadowRadius: 10 },
  rankNumber: { width: 38, height: 38, lineHeight: 38, borderRadius: 6, backgroundColor: "#d9ebe4", fontSize: 20, fontWeight: "900", textAlign: "center", overflow: "hidden" },
  rankCopy: { flex: 1 },
  rankTitle: { color: "#fff8e5", fontSize: 18, lineHeight: 23, fontWeight: "900" },
  rankSynopsis: { color: "#b9c8ca", fontSize: 13, lineHeight: 18, marginTop: 3 },
  rankControls: { flexDirection: "column", gap: 6 },
  iconButton: { width: 44, height: 44, borderRadius: 7, borderWidth: 1, borderColor: "#78603b", alignItems: "center", justifyContent: "center", backgroundColor: "#142c36" },
  finalRank: { marginTop: 25 },
  sectionTitle: { color: "#f3c66f", fontFamily: "Georgia", fontSize: 23, lineHeight: 28, fontWeight: "800", textAlign: "center", marginBottom: 12 },
  loading: { flex: 1, alignItems: "center", justifyContent: "center", gap: 14, padding: 24 },
  loadingText: { color: "#d8e0de", textAlign: "center" },
  retryCard: { maxWidth: 560, alignSelf: "center", alignItems: "center", gap: 12, padding: 28, borderRadius: 12, borderWidth: 1, borderColor: "#a47734", backgroundColor: "#142730" },
  retryTitle: { color: "#fff7df", fontSize: 21, fontWeight: "900", textAlign: "center" },
  retryCopy: { color: "#b9c8ca", textAlign: "center", lineHeight: 21 },
  recommendationGrid: { flexDirection: "row", flexWrap: "wrap", gap: 14, alignItems: "stretch" },
  recommendationCard: { flexBasis: "31%", flexGrow: 1, minWidth: 260, padding: 17, borderRadius: 7, borderWidth: 3, borderColor: "#8b5a29", backgroundColor: "#ead9af", shadowColor: "#000", shadowOpacity: 0.52, shadowRadius: 13, shadowOffset: { width: 0, height: 8 } },
  recommendationSelected: { borderColor: "#ffd36d", backgroundColor: "#f5e7c3", transform: [{ translateY: -3 }], shadowColor: "#e9ae46", shadowOpacity: 0.7 },
  positionLabel: { alignSelf: "center", color: "#38240f", backgroundColor: "#e4a83f", paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10, fontSize: 10, fontWeight: "900", letterSpacing: 1.1, textTransform: "uppercase" },
  positionCopy: { minHeight: 38, color: "#5d4a36", fontSize: 12, lineHeight: 17, marginTop: 7, textAlign: "center" },
  cover: { width: 128, height: 188, borderRadius: 4, alignSelf: "center", marginVertical: 14, backgroundColor: "#293c42", borderWidth: 2, borderColor: "#724921" },
  coverFallback: { alignItems: "center", justifyContent: "center" },
  recommendationTitle: { color: "#251a12", fontFamily: "Georgia", fontSize: 19, lineHeight: 24, fontWeight: "900", textAlign: "center" },
  author: { color: "#5f4936", fontSize: 13, marginTop: 2, textAlign: "center" },
  description: { color: "#3d3025", fontSize: 13, lineHeight: 19, marginTop: 10, textAlign: "center" },
  whyLabel: { color: "#77511f", fontSize: 10, fontWeight: "900", letterSpacing: 1.2, marginTop: 13, textAlign: "center" },
  reason: { color: "#55422f", fontSize: 13, lineHeight: 19, marginTop: 3, textAlign: "center" },
  readFirst: { minHeight: 44, marginTop: 14, borderRadius: 7, borderWidth: 1, borderColor: "#876033", backgroundColor: "#172a31", alignItems: "center", justifyContent: "center" },
  readFirstSelected: { borderColor: "#c8872d", backgroundColor: "#6b431b" },
  readFirstText: { color: "#fff0c9", fontWeight: "800", fontSize: 13 },
  feedbackPanel: { maxWidth: 760, width: "100%", alignSelf: "center", marginTop: 26, padding: 18, borderWidth: 1, borderColor: "#45606b", borderRadius: 17, backgroundColor: "#14262d" },
  feedbackHint: { color: "#aebfc1", textAlign: "center", marginTop: -7, marginBottom: 13 },
  feedbackRow: { minHeight: 56, borderTopWidth: 1, borderTopColor: "#32474e", flexDirection: "row", alignItems: "center", gap: 10 },
  feedbackRank: { width: 24, color: "#f2be64", fontSize: 19, fontWeight: "900" },
  feedbackBook: { flex: 1, color: "#fff7df", fontSize: 14, fontWeight: "800" },
  smallIconButton: { width: 38, height: 38, borderWidth: 1, borderColor: "#49626b", borderRadius: 9, alignItems: "center", justifyContent: "center" },
  feedbackActions: { marginTop: 16, flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: 10 },
  secondaryButton: { minHeight: 48, paddingHorizontal: 16, borderWidth: 1, borderColor: "#5b7076", borderRadius: 12, alignItems: "center", justifyContent: "center" },
  secondaryButtonText: { color: "#d8e0de", fontWeight: "800" },
  error: { maxWidth: 760, alignSelf: "center", color: "#ffc2ba", backgroundColor: "#4a2828", borderRadius: 10, padding: 12, marginTop: 16, textAlign: "center" },
  entryScroll: { minHeight: "100%", paddingHorizontal: 20, paddingVertical: 18, alignItems: "center", justifyContent: "center" },
  entryBack: { position: "absolute", top: 18, left: 18, minWidth: 82, minHeight: 44, paddingHorizontal: 12, borderRadius: 7, borderWidth: 1, borderColor: "#93632b", backgroundColor: "rgba(5,15,21,0.9)", flexDirection: "row", gap: 7, alignItems: "center", justifyContent: "center" },
  entryBackText: { color: "#f4c463", fontSize: 14, fontWeight: "800" },
  entryCenter: { width: "100%", maxWidth: 760, alignItems: "center", paddingHorizontal: 24, paddingVertical: 42, borderRadius: 12, borderWidth: 1, borderColor: "rgba(190,129,45,0.38)", backgroundColor: "rgba(5,19,27,0.82)", shadowColor: "#000", shadowOpacity: 0.7, shadowRadius: 26 },
  crest: { flexDirection: "row", alignItems: "center", gap: 18 },
  laurel: { color: "#dca849", fontSize: 44, transform: [{ rotate: "-18deg" }] },
  entryTitle: { color: "#f5c66b", fontFamily: "Georgia", fontSize: 52, lineHeight: 58, fontWeight: "800", textAlign: "center", textShadowColor: "#8f4f1e", textShadowRadius: 11 },
  entrySubtitle: { color: "#df9f3f", fontFamily: "Georgia", fontSize: 15, lineHeight: 20, fontWeight: "800", letterSpacing: 2.2, textAlign: "center" },
  ornament: { width: "72%", maxWidth: 420, marginVertical: 20, flexDirection: "row", alignItems: "center", gap: 10 },
  ornamentLine: { flex: 1, height: 1, backgroundColor: "#9b6a2e" },
  ornamentStar: { color: "#f3bd57", fontSize: 16 },
  entryInstruction: { maxWidth: 620, color: "#ffe3aa", fontSize: 24, lineHeight: 31, fontWeight: "900", textAlign: "center", textShadowColor: "#000", textShadowRadius: 8 },
  entryCopy: { maxWidth: 610, color: "#d2d6cf", fontSize: 14, lineHeight: 21, textAlign: "center", marginTop: 12 },
  entryButton: { minHeight: 52, marginTop: 24, paddingHorizontal: 24, borderRadius: 7, borderWidth: 1, borderColor: "#ffd77c", backgroundColor: "#ecb34f", flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 9, shadowColor: "#efa73a", shadowOpacity: 0.58, shadowRadius: 14 },
  entryButtonText: { color: "#191d1f", fontSize: 15, fontWeight: "900" },
  entryCat: { position: "absolute", right: 28, bottom: 24, width: 170, height: 150, alignItems: "center", justifyContent: "flex-start", opacity: 0.88 },
  entryBookPile: { position: "absolute", bottom: 0, alignItems: "center", gap: 3 },
  entryBook: { height: 18, borderWidth: 1, borderColor: "#c68a37", borderRadius: 3 },
});
