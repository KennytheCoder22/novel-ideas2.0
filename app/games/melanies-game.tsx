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
  createMelanieCoverArt,
  type MelanieCoverFrame,
  type MelanieCoverSubject,
} from "../../lib/recommendationGames/melaniesGameCoverArt";
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

const COVER_ICONS: Record<MelanieCoverSubject, keyof typeof MaterialCommunityIcons.glyphMap> = {
  animal: "paw-outline",
  archive: "archive-outline",
  art: "palette-outline",
  book: "book-open-page-variant-outline",
  castle: "castle",
  city: "city-variant-outline",
  clock: "clock-outline",
  coast: "lighthouse-on",
  desert: "weather-sunny",
  fire: "fire",
  food: "food-variant",
  forest: "pine-tree",
  garden: "flower-outline",
  ghost: "ghost-outline",
  history: "script-text-outline",
  home: "home-outline",
  journey: "map-marker-path",
  machine: "robot-outline",
  magic: "star-four-points-outline",
  moon: "moon-waning-crescent",
  mountain: "image-filter-hdr",
  music: "music-note",
  mystery: "key-variant",
  performance: "drama-masks",
  politics: "account-group-outline",
  romance: "heart-outline",
  school: "school-outline",
  science: "flask-outline",
  sea: "waves",
  signal: "radio-tower",
  space: "rocket-launch-outline",
  sport: "run",
  storm: "weather-lightning",
  train: "train",
};
const COVER_FRAME_ICONS: Record<MelanieCoverFrame, keyof typeof MaterialCommunityIcons.glyphMap> = {
  botanical: "leaf",
  celestial: "star-four-points-outline",
  geometric: "rhombus-outline",
  gothic: "gate",
  maritime: "anchor",
};

function DecorativeLibraryBackdrop({ entry = false }: { entry?: boolean }) {
  return (
    <View
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={styles.backdrop}
    >
      <Image
        source={entry
          ? require("../../assets/games/melanies-game/entry-left.webp")
          : require("../../assets/games/melanies-game/library-left.webp")}
        style={[styles.libraryArt, styles.libraryArtLeft]}
        contentFit="cover"
        accessibilityElementsHidden
      />
      <Image
        source={entry
          ? require("../../assets/games/melanies-game/entry-right.webp")
          : require("../../assets/games/melanies-game/library-right.webp")}
        style={[styles.libraryArt, styles.libraryArtRight]}
        contentFit="cover"
        accessibilityElementsHidden
      />
      <View style={styles.centerVeil} />
      <View style={[styles.glow, styles.glowLeft]} />
      <View style={[styles.glow, styles.glowRight]} />
      <View style={styles.topVignette} />
    </View>
  );
}

function ConceptCover({ concept, size = "small" }: { concept: MelanieConcept; size?: "small" | "rank" | "large" }) {
  const art = createMelanieCoverArt(concept);
  const large = size === "large";
  const primarySize = large ? 58 : size === "rank" ? 25 : 31;
  const secondarySize = large ? 39 : size === "rank" ? 18 : 23;
  const compositionRotation = art.composition === "diagonal" ? "-18deg" : art.composition === "split" ? "12deg" : "0deg";
  const primaryTopOffset = art.composition === "tower" ? 39 : art.composition === "constellation" ? 33 : 27;
  const secondaryTopOffset = art.composition === "horizon" ? 2 : art.composition === "portal" ? 16 : 10;
  return (
    <View
      accessibilityLabel={`Fictional cover for ${concept.title}`}
      style={[
        styles.conceptCover,
        size === "rank" && styles.conceptCoverRank,
        size === "large" && styles.conceptCoverLarge,
        { backgroundColor: concept.palette[1], borderColor: concept.palette[0] },
      ]}
    >
      <View style={[styles.coverMoon, {
        top: `${Math.max(8, art.horizonPercent - 35)}%`,
        left: `${Math.max(5, art.primaryXPercent - 16)}%`,
        borderColor: concept.palette[0],
      }]} />
      {Array.from({ length: art.starCount }).map((_, index) => (
        <View
          key={`${art.assetId}:star:${index}`}
          style={[
            styles.coverStar,
            {
              left: `${10 + ((art.sceneSeed >>> (index % 16)) % 78)}%`,
              top: `${6 + ((art.sceneSeed >>> ((index + 5) % 16)) % 48)}%`,
              backgroundColor: concept.palette[0],
            },
          ]}
        />
      ))}
      <View style={[styles.coverHorizon, { top: `${art.horizonPercent}%`, borderTopColor: concept.palette[0] }]} />
      <MaterialCommunityIcons
        name={COVER_ICONS[art.primarySubject]}
        size={primarySize}
        color="#fff0c8"
        style={[styles.coverPrimarySubject, {
          left: `${art.primaryXPercent}%`,
          top: `${Math.max(8, art.horizonPercent - primaryTopOffset)}%`,
          transform: [{ translateX: -primarySize / 2 }, { rotate: compositionRotation }],
        }]}
      />
      <MaterialCommunityIcons
        name={COVER_ICONS[art.secondarySubject]}
        size={secondarySize}
        color={concept.palette[0]}
        style={[styles.coverSecondarySubject, {
          left: `${art.secondaryXPercent}%`,
          top: `${Math.max(18, art.horizonPercent - secondaryTopOffset)}%`,
          transform: [{ translateX: -secondarySize / 2 }],
        }]}
      />
      <View style={[styles.coverGround, { top: `${art.horizonPercent + 1}%`, backgroundColor: concept.palette[0] }]} />
      <View style={[
        styles.coverFrame,
        art.frame === "gothic" && styles.coverFrameGothic,
        art.frame === "geometric" && styles.coverFrameGeometric,
        art.frame === "maritime" && styles.coverFrameMaritime,
        { borderColor: concept.palette[0] },
      ]} />
      <MaterialCommunityIcons
        name={COVER_FRAME_ICONS[art.frame]}
        size={large ? 24 : size === "rank" ? 12 : 15}
        color={concept.palette[0]}
        style={styles.coverFrameOrnament}
      />
      {size === "large" ? (
        <View style={styles.coverTitlePlate}>
          <Text numberOfLines={3} style={[styles.coverTitle, styles.coverTitleLarge]}>{concept.title}</Text>
        </View>
      ) : null}
    </View>
  );
}

function TournamentProgress({ step, compact }: { step: number; compact: boolean }) {
  const labels = compact
    ? ["CHOOSE", "RANK", "CHALLENGE", "RANK", "RECOMMEND"]
    : ["1. CHOOSE", "2. RANK", "3. CHALLENGE", "4. RANK", "5. RECOMMEND"];
  return (
    <View style={styles.progressWrap} accessibilityLabel={`Tournament step ${step} of 5`}>
      <View style={styles.progressRail} />
      {labels.map((label, index) => {
        const value = index + 1;
        const active = value <= step;
        return (
          <View key={`${label}-${value}`} style={styles.progressStep}>
            <View style={[styles.progressDot, active && styles.progressDotActive]}>
              {value === step ? <View style={styles.progressDotCore} /> : null}
            </View>
            <Text numberOfLines={1} style={[styles.progressLabel, active && styles.progressLabelActive]}>{label}</Text>
          </View>
        );
      })}
    </View>
  );
}

function ConceptCard({
  concept,
  selected,
  survivor,
  selectionNumber,
  finalist,
  compact,
  disabled,
  onPress,
}: {
  concept: MelanieConcept;
  selected: boolean;
  survivor: boolean;
  selectionNumber: number | null;
  finalist: boolean;
  compact: boolean;
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
        compact && styles.conceptCardCompact,
        finalist && styles.conceptFinalist,
        { borderColor: selected ? concept.palette[0] : "#45606b", backgroundColor: concept.palette[1] },
        selected && styles.conceptSelected,
        pressed && !disabled && styles.pressed,
        disabled && styles.disabled,
      ]}
    >
      {finalist ? (
        <>
          <ConceptCover concept={concept} size="large" />
          <View style={styles.finalistPedestal}>
            <Text style={styles.finalistPill}>❧ FINALIST ❧</Text>
            <Text numberOfLines={2} style={styles.finalistTitle}>{concept.title}</Text>
          </View>
        </>
      ) : (
        <>
          <View style={[styles.bookSpine, { backgroundColor: concept.palette[0] }]} />
          <ConceptCover concept={concept} />
          <View style={styles.conceptBody}>
            <View style={styles.conceptMeta}>
              {survivor ? <Text style={styles.survivorPill}>SURVIVOR</Text> : <Text style={styles.challengerPill}>NEW STORY</Text>}
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
        </>
      )}
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
            <ConceptCover concept={concept} size="rank" />
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
  const wide = width >= 1180;
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
        <DecorativeLibraryBackdrop entry />
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
            <Text style={[styles.entryTitle, compact && styles.entryTitleCompact]}>Melanie&apos;s Game</Text>
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
      <View style={[styles.topBar, compact && styles.topBarCompact]}>
        <Pressable accessibilityRole="button" accessibilityLabel="Back to Games" onPress={exitGame} style={[styles.backButton, compact && styles.headerButtonCompact]}>
          <MaterialCommunityIcons name="arrow-left" size={18} color="#f8f1dc" />
          {!compact ? <Text style={styles.backText}>Games</Text> : null}
        </Pressable>
        <View style={styles.brand}>
          <View style={styles.brandCrest}>
            <Text style={styles.brandLaurel}>❧</Text>
            <MaterialCommunityIcons name="book-open-page-variant-outline" size={wide ? 28 : 22} color="#eab34d" />
            <Text style={[styles.brandLaurel, styles.brandLaurelRight]}>❧</Text>
          </View>
          <Text style={[styles.brandTitle, compact && styles.brandTitleCompact]}>Melanie&apos;s Game</Text>
          <Text style={styles.brandEyebrow}>THE TOURNAMENT OF STORIES</Text>
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel="Start a new tournament" onPress={() => void restart()} style={[styles.restartButton, compact && styles.headerButtonCompact]}>
          <MaterialCommunityIcons name="refresh" size={18} color="#f8f1dc" />
          {!compact ? <Text style={styles.backText}>New</Text> : null}
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <TournamentProgress step={stageStep} compact={compact} />

        <Animated.View style={[styles.stage, entranceStyle]}>
          {state.stage === "choose-1" ? (
            <View style={styles.hero}>
              <Text style={styles.heroKicker}>ROUND 1 OF 5</Text>
              <Text testID="melanie-self-choice-instruction" accessibilityRole="header" style={styles.heroTitle}>
                There is no imaginary person. Pick the book YOU want.
              </Text>
              <Text style={styles.heroCopy}>Read each one-sentence premise. Choose up to 3 books.</Text>
            </View>
          ) : null}
          {state.stage === "choose-2" ? (
            <View style={styles.hero}>
              <Text style={styles.heroKicker}>ROUND 3 OF 5</Text>
              <Text accessibilityRole="header" style={styles.heroTitle}>Your favorites return, with new challengers.</Text>
              <Text style={styles.heroCopy}>Which of these would you most want to read? Choose up to 3.</Text>
            </View>
          ) : null}
          {isRank ? (
            <View style={styles.hero}>
              <Text style={styles.heroKicker}>ROUND {state.stage === "rank-1" ? "2" : "4"} OF 5</Text>
              <Text accessibilityRole="header" style={styles.heroTitle}>Put these in the order you&apos;d want to read them.</Text>
              <Text style={styles.heroCopy}>Move your favorite to the top. The order changes what we learn.</Text>
            </View>
          ) : null}
          {isFinal ? (
            <View style={styles.hero}>
              <Text style={styles.heroKicker}>FINAL ROUND</Text>
              <Text accessibilityRole="header" style={styles.heroTitle}>Choose up to three finalists, then order them.</Text>
              <Text style={styles.heroCopy}>These are the strongest contenders based on your choices so far.</Text>
            </View>
          ) : null}

          {(isChoose || isFinal) ? (
            <>
              <View style={[styles.conceptGrid, isFinal && state.selectedIds.length === 3 && styles.finalistGrid, compact && styles.conceptGridCompact]}>
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
                      compact={compact}
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
                  <Text style={styles.primaryButtonText}>
                    {isFinal ? "Reveal My Recommendations" : state.stage === "choose-2" ? "Next: Rank Again" : "Next: Rank Your Picks"}
                  </Text>
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
                  <Text style={styles.primaryButtonText}>Next Round</Text>
                  <MaterialCommunityIcons name="arrow-right" size={20} color="#1b2330" />
                </Pressable>
              </View>
            </>
          ) : null}

          {state.stage === "recommendations" ? (
            <View>
              <View style={styles.hero}>
                <Text style={styles.heroKicker}>TOURNAMENT COMPLETE</Text>
                <Text accessibilityRole="header" style={styles.heroTitle}>Your Reading Recommendations</Text>
                <Text style={styles.heroCopy}>Real books from your library and beyond, based on your choices.</Text>
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
                    <Text style={styles.feedbackHint}>Your answer helps us get even better. This step is optional.</Text>
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
                        style={[styles.secondaryButton, (locked || state.feedbackRecorded || !state.finalFeedbackInteracted) && styles.disabled]}
                      >
                        <Text style={styles.secondaryButtonText}>{state.feedbackRecorded || feedbackSaved ? "Answer saved" : "Save optional answer"}</Text>
                      </Pressable>
                      <Pressable accessibilityRole="button" onPress={exitGame} style={styles.primaryButton}>
                        <Text style={styles.primaryButtonText}>Finish</Text>
                      </Pressable>
                    </View>
                  </View>
                </>
              )}
            </View>
          ) : null}

          {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
          {isChoose ? (
            <View pointerEvents="none" accessibilityElementsHidden style={styles.closingOrnament}>
              <View style={styles.ornamentLine} />
              <Text style={styles.closingQuote}>“Stories aren&apos;t just escape. They&apos;re better maps.”</Text>
              <View style={styles.ornamentLine} />
            </View>
          ) : null}
        </Animated.View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#02090e" },
  backdrop: { ...StyleSheet.absoluteFillObject, overflow: "hidden", backgroundColor: "#02090e" },
  libraryArt: { position: "absolute", top: 0, bottom: 0, width: "27%", height: "100%", opacity: 0.93 },
  libraryArtLeft: { left: 0 },
  libraryArtRight: { right: 0 },
  centerVeil: { position: "absolute", top: 0, bottom: 0, left: "18%", right: "18%", backgroundColor: "rgba(2,13,19,0.9)" },
  topVignette: { position: "absolute", top: 0, left: 0, right: 0, height: 150, backgroundColor: "rgba(1,7,11,0.42)" },
  glow: { position: "absolute", width: 520, height: 520, borderRadius: 260, opacity: 0.1 },
  glowLeft: { left: -310, top: 110, backgroundColor: "#0f8394" },
  glowRight: { right: -300, bottom: -180, backgroundColor: "#e4862c" },
  topBar: { minHeight: 116, paddingHorizontal: 20, paddingVertical: 8, flexDirection: "row", alignItems: "center", justifyContent: "space-between", backgroundColor: "rgba(2,10,15,0.68)" },
  topBarCompact: { minHeight: 92, paddingHorizontal: 10 },
  backButton: { minWidth: 88, minHeight: 44, paddingHorizontal: 13, borderRadius: 7, borderWidth: 1, borderColor: "#c98a31", flexDirection: "row", gap: 7, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(4,14,20,0.88)" },
  restartButton: { minWidth: 70, minHeight: 44, paddingHorizontal: 12, borderRadius: 7, borderWidth: 1, borderColor: "#c98a31", flexDirection: "row", gap: 7, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(4,14,20,0.88)" },
  headerButtonCompact: { minWidth: 48, paddingHorizontal: 8 },
  backText: { color: "#f5c66b", fontWeight: "800", fontSize: 14 },
  brand: { alignItems: "center", flex: 1, paddingHorizontal: 8 },
  brandCrest: { flexDirection: "row", alignItems: "center", gap: 10, height: 28 },
  brandLaurel: { color: "#dca849", fontFamily: "Georgia", fontSize: 27, transform: [{ rotate: "-15deg" }] },
  brandLaurelRight: { transform: [{ rotate: "15deg" }, { scaleX: -1 }] },
  brandEyebrow: { color: "#e3aa46", fontFamily: "Georgia", fontSize: 10, lineHeight: 14, fontWeight: "800", letterSpacing: 2.3 },
  brandTitle: { color: "#f7c765", fontFamily: "Georgia", fontSize: 34, lineHeight: 38, fontWeight: "800", textTransform: "uppercase", textShadowColor: "rgba(222,132,34,0.48)", textShadowRadius: 10 },
  brandTitleCompact: { fontSize: 20, lineHeight: 24 },
  scroll: { width: "100%", maxWidth: 1080, alignSelf: "center", paddingHorizontal: 22, paddingTop: 0, paddingBottom: 40 },
  progressWrap: { position: "relative", flexDirection: "row", maxWidth: 760, width: "100%", minHeight: 45, alignSelf: "center", justifyContent: "space-between" },
  progressRail: { position: "absolute", left: "9%", right: "9%", top: 7, height: 2, backgroundColor: "#46616a" },
  progressStep: { flex: 1, alignItems: "center", gap: 6 },
  progressDot: { width: 14, height: 14, borderRadius: 7, borderWidth: 2, borderColor: "#5e777b", backgroundColor: "#07151c", alignItems: "center", justifyContent: "center" },
  progressDotActive: { borderColor: "#f0bc54", backgroundColor: "#8e6326", shadowColor: "#f6b842", shadowOpacity: 0.8, shadowRadius: 7 },
  progressDotCore: { width: 4, height: 4, borderRadius: 2, backgroundColor: "#ffe4a0" },
  progressLabel: { color: "#789095", fontSize: 10, lineHeight: 13, fontWeight: "800", letterSpacing: 0.5, textAlign: "center" },
  progressLabelActive: { color: "#f4c76c" },
  stage: { width: "100%", paddingHorizontal: 12, paddingBottom: 18, borderWidth: 1, borderColor: "rgba(185,126,44,0.18)", borderRadius: 12, backgroundColor: "rgba(2,14,20,0.72)" },
  hero: { alignItems: "center", paddingTop: 10, paddingBottom: 16, gap: 4 },
  heroKicker: { color: "#e0ad51", fontSize: 11, lineHeight: 16, fontWeight: "800", letterSpacing: 1.6, textAlign: "center" },
  heroTitle: { maxWidth: 920, color: "#fff1cd", fontFamily: "Georgia", fontSize: 28, lineHeight: 34, fontWeight: "800", letterSpacing: -0.35, textAlign: "center", textShadowColor: "rgba(0,0,0,0.9)", textShadowRadius: 8 },
  heroCopy: { maxWidth: 680, color: "#d3d8d3", fontSize: 14, lineHeight: 20, textAlign: "center" },
  conceptGrid: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  conceptGridCompact: { flexDirection: "column" },
  finalistGrid: { maxWidth: 850, width: "100%", alignSelf: "center", alignItems: "flex-end", justifyContent: "center", paddingTop: 8 },
  conceptCard: { flexBasis: "31%", flexGrow: 1, minWidth: 270, minHeight: 160, borderWidth: 1.5, borderRadius: 8, overflow: "hidden", flexDirection: "row", alignItems: "stretch", shadowColor: "#000", shadowOpacity: 0.55, shadowRadius: 14, shadowOffset: { width: 0, height: 8 } },
  conceptCardCompact: { flexBasis: "auto", flexGrow: 0, width: "100%", minWidth: 0 },
  conceptFinalist: { minWidth: 230, minHeight: 330, flexDirection: "column", alignItems: "center", justifyContent: "flex-end", paddingTop: 18, borderColor: "#d9942f", backgroundColor: "rgba(13,31,38,0.92)", shadowColor: "#f0aa3d", shadowOpacity: 0.55, shadowRadius: 20 },
  conceptSelected: { transform: [{ translateY: -3 }], shadowColor: "#efb74d", shadowOpacity: 0.66, shadowRadius: 15 },
  bookSpine: { width: 6 },
  conceptBody: { flex: 1, paddingHorizontal: 14, paddingVertical: 12 },
  conceptCover: { width: 82, height: 126, minHeight: 126, margin: 10, marginRight: 0, borderWidth: 1.5, borderRadius: 4, alignItems: "center", justifyContent: "center", overflow: "hidden", shadowColor: "#000", shadowOpacity: 0.68, shadowRadius: 8 },
  conceptCoverRank: { width: 64, height: 88, minHeight: 88, margin: 0 },
  conceptCoverLarge: { width: 172, height: 252, minHeight: 252, margin: 0, shadowColor: "#e3a844", shadowOpacity: 0.62, shadowRadius: 16 },
  coverMoon: { position: "absolute", width: "54%", aspectRatio: 1, borderRadius: 999, borderWidth: 1, backgroundColor: "rgba(255,238,189,0.08)", opacity: 0.74 },
  coverStar: { position: "absolute", width: 3, height: 3, borderRadius: 2, opacity: 0.78 },
  coverHorizon: { position: "absolute", left: "8%", right: "8%", borderTopWidth: 1, opacity: 0.72 },
  coverGround: { position: "absolute", left: 0, right: 0, bottom: 0, opacity: 0.1 },
  coverPrimarySubject: { position: "absolute", zIndex: 2, textShadowColor: "rgba(0,0,0,0.9)", textShadowRadius: 6 },
  coverSecondarySubject: { position: "absolute", zIndex: 3, textShadowColor: "rgba(0,0,0,0.95)", textShadowRadius: 5 },
  coverFrame: { ...StyleSheet.absoluteFillObject, margin: 5, borderWidth: 1, borderRadius: 3, opacity: 0.6 },
  coverFrameGothic: { borderTopWidth: 3, borderBottomWidth: 2, borderRadius: 12 },
  coverFrameGeometric: { margin: 7, borderWidth: 2, transform: [{ rotate: "1.5deg" }] },
  coverFrameMaritime: { borderTopWidth: 2, borderBottomWidth: 3 },
  coverFrameOrnament: { position: "absolute", bottom: 7, right: 8, zIndex: 4, opacity: 0.78 },
  coverTitlePlate: { position: "absolute", left: 8, right: 8, bottom: 9, paddingHorizontal: 5, paddingVertical: 6, borderWidth: 1, borderColor: "rgba(244,196,104,0.64)", backgroundColor: "rgba(4,13,18,0.82)" },
  coverTitle: { color: "#fff5dc", fontFamily: "Georgia", fontSize: 10, lineHeight: 12, fontWeight: "800", textAlign: "center" },
  coverTitleLarge: { fontSize: 15, lineHeight: 18 },
  conceptMeta: { minHeight: 28, flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  survivorPill: { color: "#06232b", backgroundColor: "#85d8da", borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3, fontSize: 9, fontWeight: "900", letterSpacing: 1.2 },
  challengerPill: { color: "#d5a85b", fontSize: 9, fontWeight: "900", letterSpacing: 1.1 },
  finalistPill: { color: "#f6c568", fontFamily: "Georgia", fontSize: 15, lineHeight: 20, fontWeight: "800", letterSpacing: 1.5, textAlign: "center" },
  finalistPedestal: { width: "100%", minHeight: 70, marginTop: -2, paddingHorizontal: 10, paddingVertical: 9, borderTopWidth: 2, borderTopColor: "#d99631", backgroundColor: "#29170d", alignItems: "center", justifyContent: "center", shadowColor: "#f0a83b", shadowOpacity: 0.4, shadowRadius: 12 },
  finalistTitle: { color: "#fff0c8", fontFamily: "Georgia", fontSize: 13, lineHeight: 17, fontWeight: "800", textAlign: "center", marginTop: 2 },
  pickNumber: { width: 30, height: 30, lineHeight: 27, borderRadius: 15, borderWidth: 1.5, fontSize: 13, fontWeight: "900", textAlign: "center", overflow: "hidden" },
  conceptTitle: { color: "#fff1cf", fontFamily: "Georgia", fontSize: 18, lineHeight: 22, fontWeight: "800", marginTop: 5 },
  synopsis: { color: "#d9ddda", fontSize: 13, lineHeight: 18, marginTop: 6 },
  pressed: { opacity: 0.76, transform: [{ scale: 0.99 }] },
  disabled: { opacity: 0.42 },
  changeFinalists: { alignSelf: "center", minHeight: 44, marginTop: 12, paddingHorizontal: 18, borderRadius: 8, borderWidth: 1, borderColor: "#866332", alignItems: "center", justifyContent: "center" },
  changeFinalistsText: { color: "#e9bd6b", fontSize: 13, fontWeight: "800" },
  actionBar: { marginTop: 14, paddingHorizontal: 16, paddingVertical: 11, borderWidth: 1, borderColor: "#72502b", borderRadius: 8, backgroundColor: "rgba(3,15,21,0.96)", flexDirection: "row", flexWrap: "wrap", gap: 13, alignItems: "center", justifyContent: "space-between" },
  selectionCount: { color: "#d3dfdf", fontWeight: "800", fontSize: 14 },
  primaryButton: { minHeight: 48, paddingHorizontal: 21, paddingVertical: 12, borderRadius: 7, borderWidth: 1, borderColor: "#ffd576", backgroundColor: "#efb54d", flexDirection: "row", gap: 8, alignItems: "center", justifyContent: "center", shadowColor: "#f0ad40", shadowOpacity: 0.45, shadowRadius: 11 },
  primaryButtonText: { color: "#1b2330", fontSize: 14, lineHeight: 19, fontWeight: "900" },
  rankList: { width: "100%", maxWidth: 760, alignSelf: "center", gap: 9 },
  rankRow: { minHeight: 112, borderWidth: 1.25, borderRadius: 8, backgroundColor: "rgba(12,38,48,0.95)", padding: 9, flexDirection: "row", alignItems: "center", gap: 10, shadowColor: "#000", shadowOpacity: 0.42, shadowRadius: 10 },
  rankNumber: { width: 38, height: 38, lineHeight: 38, borderRadius: 6, backgroundColor: "#bfece3", fontSize: 20, fontWeight: "900", textAlign: "center", overflow: "hidden" },
  rankCopy: { flex: 1 },
  rankTitle: { color: "#fff8e5", fontSize: 18, lineHeight: 23, fontWeight: "900" },
  rankSynopsis: { color: "#b9c8ca", fontSize: 13, lineHeight: 18, marginTop: 3 },
  rankControls: { flexDirection: "column", gap: 6 },
  iconButton: { width: 44, height: 44, borderRadius: 7, borderWidth: 1, borderColor: "#78603b", alignItems: "center", justifyContent: "center", backgroundColor: "#142c36" },
  finalRank: { width: "100%", maxWidth: 760, alignSelf: "center", marginTop: 24 },
  sectionTitle: { color: "#f3c66f", fontFamily: "Georgia", fontSize: 23, lineHeight: 28, fontWeight: "800", textAlign: "center", marginBottom: 12 },
  loading: { flex: 1, alignItems: "center", justifyContent: "center", gap: 14, padding: 24 },
  loadingText: { color: "#d8e0de", textAlign: "center" },
  retryCard: { maxWidth: 560, alignSelf: "center", alignItems: "center", gap: 12, padding: 28, borderRadius: 12, borderWidth: 1, borderColor: "#a47734", backgroundColor: "#142730" },
  retryTitle: { color: "#fff7df", fontSize: 21, fontWeight: "900", textAlign: "center" },
  retryCopy: { color: "#b9c8ca", textAlign: "center", lineHeight: 21 },
  recommendationGrid: { maxWidth: 960, width: "100%", alignSelf: "center", flexDirection: "row", flexWrap: "wrap", gap: 14, alignItems: "stretch" },
  recommendationCard: { flexBasis: "31%", flexGrow: 1, minWidth: 260, padding: 15, borderRadius: 4, borderWidth: 3, borderColor: "#8b5a29", backgroundColor: "#eddcb1", shadowColor: "#000", shadowOpacity: 0.62, shadowRadius: 15, shadowOffset: { width: 0, height: 8 } },
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
  feedbackPanel: { maxWidth: 700, width: "100%", alignSelf: "center", marginTop: 28, padding: 22, borderWidth: 1, borderColor: "#73512c", borderRadius: 9, backgroundColor: "rgba(5,20,27,0.96)", shadowColor: "#000", shadowOpacity: 0.55, shadowRadius: 18 },
  feedbackHint: { color: "#aebfc1", textAlign: "center", marginTop: -7, marginBottom: 13 },
  feedbackRow: { minHeight: 58, marginTop: 6, paddingHorizontal: 10, borderWidth: 1, borderColor: "#35535e", borderRadius: 7, backgroundColor: "#0c2732", flexDirection: "row", alignItems: "center", gap: 10 },
  feedbackRank: { width: 28, color: "#f2be64", fontSize: 20, fontWeight: "900", textAlign: "center" },
  feedbackBook: { flex: 1, color: "#fff7df", fontSize: 14, fontWeight: "800" },
  smallIconButton: { width: 44, height: 44, borderWidth: 1, borderColor: "#49626b", borderRadius: 9, alignItems: "center", justifyContent: "center" },
  feedbackActions: { marginTop: 16, flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: 10 },
  secondaryButton: { minHeight: 48, paddingHorizontal: 16, borderWidth: 1, borderColor: "#5b7076", borderRadius: 12, alignItems: "center", justifyContent: "center" },
  secondaryButtonText: { color: "#d8e0de", fontWeight: "800" },
  error: { maxWidth: 760, alignSelf: "center", color: "#ffc2ba", backgroundColor: "#4a2828", borderRadius: 10, padding: 12, marginTop: 16, textAlign: "center" },
  entryScroll: { minHeight: "100%", paddingHorizontal: 20, paddingVertical: 18, alignItems: "center", justifyContent: "center" },
  entryBack: { position: "absolute", top: 18, left: 18, minWidth: 82, minHeight: 44, paddingHorizontal: 12, borderRadius: 7, borderWidth: 1, borderColor: "#93632b", backgroundColor: "rgba(5,15,21,0.9)", flexDirection: "row", gap: 7, alignItems: "center", justifyContent: "center" },
  entryBackText: { color: "#f4c463", fontSize: 14, fontWeight: "800" },
  entryCenter: { width: "100%", maxWidth: 720, alignItems: "center", paddingHorizontal: 24, paddingVertical: 34, borderRadius: 12, backgroundColor: "rgba(2,14,21,0.64)", shadowColor: "#000", shadowOpacity: 0.82, shadowRadius: 30 },
  crest: { flexDirection: "row", alignItems: "center", gap: 18 },
  laurel: { color: "#dca849", fontSize: 44, transform: [{ rotate: "-18deg" }] },
  entryTitle: { color: "#f5c66b", fontFamily: "Georgia", fontSize: 56, lineHeight: 61, fontWeight: "800", textAlign: "center", textTransform: "uppercase", textShadowColor: "#8f4f1e", textShadowRadius: 11 },
  entryTitleCompact: { fontSize: 38, lineHeight: 44 },
  entrySubtitle: { color: "#df9f3f", fontFamily: "Georgia", fontSize: 15, lineHeight: 20, fontWeight: "800", letterSpacing: 2.2, textAlign: "center" },
  ornament: { width: "72%", maxWidth: 420, marginVertical: 16, flexDirection: "row", alignItems: "center", gap: 10 },
  ornamentLine: { flex: 1, height: 1, backgroundColor: "#9b6a2e" },
  ornamentStar: { color: "#f3bd57", fontSize: 16 },
  entryInstruction: { maxWidth: 620, color: "#ffe5ac", fontFamily: "Georgia", fontSize: 25, lineHeight: 31, fontWeight: "900", textAlign: "center", textShadowColor: "#000", textShadowRadius: 8 },
  entryCopy: { maxWidth: 610, color: "#d2d6cf", fontSize: 14, lineHeight: 21, textAlign: "center", marginTop: 12 },
  entryButton: { minHeight: 52, marginTop: 24, paddingHorizontal: 24, borderRadius: 7, borderWidth: 1, borderColor: "#ffd77c", backgroundColor: "#ecb34f", flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 9, shadowColor: "#efa73a", shadowOpacity: 0.58, shadowRadius: 14 },
  entryButtonText: { color: "#191d1f", fontSize: 15, fontWeight: "900" },
  closingOrnament: { maxWidth: 700, width: "100%", alignSelf: "center", marginTop: 14, flexDirection: "row", alignItems: "center", gap: 12 },
  closingQuote: { color: "#c98d48", fontFamily: "Georgia", fontSize: 13, lineHeight: 18, fontStyle: "italic", textAlign: "center" },
});
