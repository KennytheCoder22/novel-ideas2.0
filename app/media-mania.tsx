import { useEffect, useMemo, useRef, useState, type ComponentProps } from "react";
import { router, useLocalSearchParams } from "expo-router";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { AccessibilityInfo, ActivityIndicator, Animated, Image, Modal, Platform, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, TouchableOpacity, useWindowDimensions, View } from "react-native";
import { MEDIA_MANIA_CATALOG } from "../features/recommendation-games/media-mania/mediaManiaCatalog";
import { MediaManiaEnvironment } from "../features/recommendation-games/media-mania/MediaManiaEnvironment";
import { mediaManiaEnvironmentScene } from "../features/recommendation-games/media-mania/mediaManiaPresentation";
import { MediaManiaSessionTrail } from "../features/recommendation-games/media-mania/MediaManiaSessionTrail";
import {
  MEDIA_MANIA_AGE_BAND_LABELS,
  MEDIA_MANIA_AGE_BANDS,
  MEDIA_MANIA_SOURCE_LABELS,
  MEDIA_MANIA_SOURCES,
  MEDIA_MANIA_UNLOCK_SCORE,
  availableMediaManiaSources,
  changeMediaManiaAgeBand,
  chooseMediaManiaCandidate,
  createMediaManiaState,
  markMediaManiaBasisUnknown,
  markMediaManiaCandidateUnknown,
  recordMediaManiaSessionContinued,
  recordMediaManiaSessionExited,
  recordMediaManiaSessionStarted,
  resolveMediaManiaUnlock,
  startMediaMania,
  undoLastMediaManiaChoice,
  type MediaManiaAgeBand,
  type MediaManiaCatalogItem,
  type MediaManiaEvent,
  type MediaManiaSource,
  type MediaManiaState,
} from "../features/recommendation-games/media-mania/mediaManiaCore.mjs";
import {
  createMediaManiaSessionId,
  createMediaManiaStorageInstanceId,
  loadMediaManiaSave,
  saveMediaMania,
} from "../features/recommendation-games/media-mania/mediaManiaPersistence";
import { initialMediaManiaArtworkCandidates, resolveMediaManiaArtwork, type MediaManiaArtworkCandidate } from "../features/recommendation-games/media-mania/mediaManiaArtwork";
import { getSwipeCardFallbackImage } from "../assets/swipeCardFallback";
import { GameRecommendationReward } from "../components/GameRecommendationReward";
import { useGameRecommendationMilestone } from "../hooks/useGameRecommendationMilestone";
import { adaptMediaManiaEvidenceToSignals, MEDIA_MANIA_EVIDENCE_MODE } from "../lib/recommendationGames/gameRecommendationEvidenceAdapters";
import { mediaManiaMilestone } from "../lib/recommendationGames/gameRecommendationMilestones";
import { parseGameRouteConfig, type GameRouteParams } from "../lib/recommendationGames/gameRecommendationRouteConfig";
import type { AgeBandV2 } from "../app/recommender-v2";
import {
  isMediaManiaGameplayKeyboardBlocked,
  normalizeMediaManiaAgeBand,
  reconcileMediaManiaRouteAge,
} from "../features/recommendation-games/media-mania/mediaManiaUiGuards";

type MediaManiaIconName = ComponentProps<typeof MaterialCommunityIcons>["name"];
const SOURCE_META: Record<MediaManiaSource, { icon: MediaManiaIconName; fallback: string; color: string }> = {
  books: { icon: "book-open-page-variant", fallback: "BK", color: "#9f86ff" },
  movies: { icon: "movie-open", fallback: "MV", color: "#ff665f" },
  tv: { icon: "television-classic", fallback: "TV", color: "#42d9f5" },
  games: { icon: "gamepad-variant", fallback: "GM", color: "#55e58f" },
  youtube: { icon: "youtube", fallback: "YT", color: "#ff536b" },
  anime: { icon: "creation", fallback: "AN", color: "#ff63bf" },
  podcasts: { icon: "podcast", fallback: "PC", color: "#ffbf58" },
};

const catalogById = new Map(MEDIA_MANIA_CATALOG.map((item) => [item.id, item]));
const titleFor = (id: string) => catalogById.get(id)?.title || "Unknown title";
const durablePersistenceNotice = (error: string | null) =>
  error === "durable_endpoint_unavailable"
    ? "Gameplay is saved on this device."
    : "Gameplay is saved on this device; durable sync will retry.";
const mediaManiaAgeBandToV2 = (band: MediaManiaAgeBand): AgeBandV2 => (band === "adults" ? "adult" : band);

function MediaArtwork({ item, compact = false }: { item: MediaManiaCatalogItem; compact?: boolean }) {
  const meta = SOURCE_META[item.mediaSource];
  const deckKey = item.source.split(":")[1] || "";
  const bundledSource = useMemo(() => getSwipeCardFallbackImage(deckKey, item.title), [deckKey, item.title]);
  const [bundledFailed, setBundledFailed] = useState(false);
  const [candidates, setCandidates] = useState<MediaManiaArtworkCandidate[]>(() => initialMediaManiaArtworkCandidates(item));
  const [candidateIndex, setCandidateIndex] = useState(0);
  const [lookupStatus, setLookupStatus] = useState<"loading" | "resolved" | "none" | "lookup_failed">("loading");

  useEffect(() => {
    let cancelled = false;
    setBundledFailed(false);
    setCandidateIndex(0);
    setCandidates(initialMediaManiaArtworkCandidates(item));
    setLookupStatus("loading");
    void resolveMediaManiaArtwork(item).then((result) => {
      if (cancelled) return;
      setCandidates(result.candidates);
      setLookupStatus(result.lookupStatus);
    });
    return () => {
      cancelled = true;
    };
  }, [item]);

  const remoteCandidate = candidates[candidateIndex];
  const imageSource = bundledSource && !bundledFailed ? bundledSource : remoteCandidate ? { uri: remoteCandidate.uri } : null;
  if (imageSource) {
    return (
      <Image
        accessibilityLabel={`Artwork for ${item.title}`}
        source={imageSource}
        style={[styles.artwork, compact && styles.artworkCompact]}
        resizeMode="cover"
        onError={() => {
          if (bundledSource && !bundledFailed) setBundledFailed(true);
          else setCandidateIndex((index) => index + 1);
        }}
      />
    );
  }

  if (lookupStatus === "loading") {
    return <View style={[styles.artwork, compact && styles.artworkCompact, styles.artworkLoading]}><ActivityIndicator color="#d6e5f5" /><Text style={styles.artworkStatus}>Finding artwork...</Text></View>;
  }

  const failed = bundledFailed || candidates.length > 0 || lookupStatus === "lookup_failed";
  return (
    <View style={[styles.artwork, compact && styles.artworkCompact, styles.artworkFallback, { backgroundColor: meta.color }]}>
      <Text style={[styles.artworkIcon, compact && styles.artworkIconCompact]}>{failed ? "!" : meta.fallback}</Text>
      <Text style={[styles.artworkSource, compact && styles.artworkSourceCompact]}>{failed ? "ARTWORK UNAVAILABLE" : "NO ARTWORK AVAILABLE"}</Text>
    </View>
  );
}
export default function MediaManiaScreen() {
  const params = useLocalSearchParams<{ playerId?: string; libraryId?: string; ageBand?: string }>();
  const playerId = String(params.playerId || "media-mania-player");
  const libraryId = String(params.libraryId || "default");
  const initialAgeBand = normalizeMediaManiaAgeBand(params.ageBand);
  const routeConfig = useMemo(() => parseGameRouteConfig(params as GameRouteParams), [params]);
  const storageInstanceId = useMemo(
    () => createMediaManiaStorageInstanceId(playerId, libraryId),
    [libraryId, playerId],
  );
  const { width } = useWindowDimensions();
  const compact = width < 760;
  const [state, setState] = useState<MediaManiaState | null>(null);
  const [events, setEvents] = useState<MediaManiaEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [locked, setLocked] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);
  const [firstDislikeHintSeen, setFirstDislikeHintSeen] = useState(false);
  const [showDislikeHint, setShowDislikeHint] = useState(false);
  const [selectedCandidateId, setSelectedCandidateId] = useState<string | null>(null);
  const [hoveredCandidateId, setHoveredCandidateId] = useState<string | null>(null);
  const [focusedCandidateId, setFocusedCandidateId] = useState<string | null>(null);
  const [reduceMotionEnabled, setReduceMotionEnabled] = useState(true);
  const [persistenceNotice, setPersistenceNotice] = useState<string | null>(null);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const commitInFlight = useRef(false);
  const roundTransitionOpacity = useRef(new Animated.Value(1)).current;
  const gameRecommendationMilestone = useGameRecommendationMilestone({
    game: "media_mania",
    gameLabel: "Media Mania",
    playerId,
    gameSessionId: state?.sessionId || "",
    libraryId,
    ageBand: mediaManiaAgeBandToV2(state?.ageBand || initialAgeBand),
    sourceFlags: routeConfig.sourceFlags,
    localCollectionOnly: routeConfig.localCollectionOnly,
    evidenceMode: MEDIA_MANIA_EVIDENCE_MODE,
  });

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const saved = await loadMediaManiaSave(playerId, libraryId, storageInstanceId);
        const routedSave = saved
          ? reconcileMediaManiaRouteAge(saved.state, initialAgeBand, MEDIA_MANIA_CATALOG)
          : null;
        const lifecycle = saved
          ? recordMediaManiaSessionContinued(routedSave?.state || saved.state)
          : recordMediaManiaSessionStarted(createMediaManiaState({
              playerId,
              sessionId: createMediaManiaSessionId(),
              libraryId,
              ageBand: initialAgeBand,
            }));
        const nextEvents = [...(saved?.events || []), ...(routedSave?.events || []), ...lifecycle.events];
        const persisted = await saveMediaMania(playerId, libraryId, lifecycle.state, nextEvents, storageInstanceId);
        if (cancelled) return;
        setState(lifecycle.state);
        setEvents(nextEvents);
        setPersistenceNotice(persisted.durableSynced ? null : durablePersistenceNotice(persisted.durableError));
      } catch {
        if (cancelled) return;
        const lifecycle = recordMediaManiaSessionStarted(createMediaManiaState({
          playerId,
          sessionId: createMediaManiaSessionId(),
          libraryId,
          ageBand: initialAgeBand,
        }));
        setState(lifecycle.state);
        setEvents(lifecycle.events);
        setPersistenceNotice("Media Mania could not read or write saved gameplay on this device.");
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
      if (flashTimer.current) clearTimeout(flashTimer.current);
    };
  }, [initialAgeBand, libraryId, playerId, storageInstanceId]);

  useEffect(() => {
    void AccessibilityInfo.isReduceMotionEnabled().then(setReduceMotionEnabled);
    const subscription = AccessibilityInfo.addEventListener("reduceMotionChanged", setReduceMotionEnabled);
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    roundTransitionOpacity.stopAnimation();
    if (reduceMotionEnabled) {
      roundTransitionOpacity.setValue(1);
      return;
    }
    roundTransitionOpacity.setValue(0.45);
    Animated.timing(roundTransitionOpacity, {
      toValue: 1,
      duration: 220,
      useNativeDriver: true,
    }).start();
  }, [reduceMotionEnabled, roundTransitionOpacity, state?.currentRound?.id]);

  async function commit(result: { state: MediaManiaState; events: MediaManiaEvent[] }, delay = 0, message?: string): Promise<boolean> {
    if (commitInFlight.current) return false;
    commitInFlight.current = true;
    setLocked(true);
    const nextEvents = [...events, ...result.events];
    try {
      const persisted = await saveMediaMania(playerId, libraryId, result.state, nextEvents, storageInstanceId);
      setEvents(nextEvents);
      setPersistenceNotice(persisted.durableSynced ? null : durablePersistenceNotice(persisted.durableError));
      if (!delay) {
        setState(result.state);
        setLocked(false);
        commitInFlight.current = false;
        return true;
      }
      setFlash(message || "Taste captured!");
      flashTimer.current = setTimeout(() => {
        setState(result.state);
        setFlash(null);
        setSelectedCandidateId(null);
        setLocked(false);
        commitInFlight.current = false;
      }, delay);
      return true;
    } catch {
      setSelectedCandidateId(null);
      setLocked(false);
      commitInFlight.current = false;
      setPersistenceNotice("This choice was not saved. Please try again.");
      return false;
    }
  }

  async function choose(candidateId: string) {
    if (!state || !state.currentRound || locked || commitInFlight.current) return;
    setSelectedCandidateId(candidateId);
    const round = state.currentRound;
    const result = chooseMediaManiaCandidate(state, candidateId, MEDIA_MANIA_CATALOG);
    const delta = Number(result.events[0]?.scoreDelta || 0);
    const message = round.roundType === "DISLIKE" ? `Skip - not for me  +${delta}` : `My pick - fits me  +${delta}`;
    if (!await commit(result, 360, message)) return;
    const roundCompleted = result.events.find((event) => event.action === "round_completed");
    if (roundCompleted?.eventId) {
      const isDislike = round.roundType === "DISLIKE";
      const signals = adaptMediaManiaEvidenceToSignals({
        newPositiveItemIds: isDislike ? [] : [candidateId],
        newNegativeItemIds: isDislike ? [candidateId] : [],
        catalog: MEDIA_MANIA_CATALOG,
      });
      await gameRecommendationMilestone.notifyEvidence(
        String(roundCompleted.eventId),
        signals,
        (lastMilestoneEvidenceCount) => mediaManiaMilestone(result.state.completedRoundCount, lastMilestoneEvidenceCount),
      );
    }
  }

  function unknownCandidate(candidateId: string) {
    if (!state || locked || commitInFlight.current) return;
    void commit(markMediaManiaCandidateUnknown(state, candidateId, MEDIA_MANIA_CATALOG));
  }

  async function undoLastChoice() {
    if (!state?.lastChoiceUndo || locked || commitInFlight.current) return;
    const nativeEvidenceId = state.lastChoiceUndo.completedEventId;
    if (await commit(undoLastMediaManiaChoice(state))) {
      await gameRecommendationMilestone.retractEvidence(nativeEvidenceId);
    }
  }

  function unknownBasis(basisId: string) {
    if (!state || locked || commitInFlight.current) return;
    void commit(markMediaManiaBasisUnknown(state, basisId, MEDIA_MANIA_CATALOG));
  }

  async function selectAgeBand(ageBand: MediaManiaAgeBand) {
    if (!state || locked || commitInFlight.current || state.ageBand === ageBand) return;
    if (await commit(changeMediaManiaAgeBand(state, ageBand, MEDIA_MANIA_CATALOG))) {
      await gameRecommendationMilestone.resetSession(state.sessionId);
    }
  }

  async function exitGame() {
    if (!state || commitInFlight.current) return;
    if (await commit(recordMediaManiaSessionExited(state))) router.back();
  }

  useEffect(() => {
    const round = state?.currentRound;
    if (round?.roundType === "DISLIKE" && !firstDislikeHintSeen) {
      setFirstDislikeHintSeen(true);
      setShowDislikeHint(true);
    }
  }, [firstDislikeHintSeen, state?.currentRound]);

  useEffect(() => {
    if (Platform.OS !== "web" || typeof document === "undefined") return;
    const onKeyDown = (event: KeyboardEvent) => {
      const round = state?.currentRound;
      if (!round) return;
      if (isMediaManiaGameplayKeyboardBlocked({
        repeat: event.repeat,
        locked,
        hintVisible: showDislikeHint,
        recommendationRewardVisible: Boolean(gameRecommendationMilestone.pendingReward),
        hasCurrentRound: true,
        unlockOffered: state?.unlockStatus === "offered",
      })) return;
      if (["1", "2", "3"].includes(event.key)) {
        event.preventDefault();
        const candidate = round.candidates[Number(event.key) - 1];
        if (candidate) {
          if (event.shiftKey) unknownCandidate(candidate.id);
          else choose(candidate.id);
        }
      } else if (event.key.toLowerCase() === "r") {
        event.preventDefault();
        const basis = round.basisItems[0];
        if (basis) unknownBasis(basis.id);
      } else if (event.key === "Escape") {
        void exitGame();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  });

  const progress = Math.min(1, (state?.tasteScore || 0) / MEDIA_MANIA_UNLOCK_SCORE);
  const positiveTitles = useMemo(() => state?.positiveItemIds.slice(-2).map(titleFor) || [], [state?.positiveItemIds]);
  const negativeTitles = useMemo(() => state?.negativeItemIds.slice(-2).map(titleFor) || [], [state?.negativeItemIds]);
  const activeAgeBand = state?.ageBand;
  const availableSources = useMemo(
    () => activeAgeBand ? availableMediaManiaSources(MEDIA_MANIA_CATALOG, activeAgeBand) : [],
    [activeAgeBand],
  );

  if (loading || !state) {
    return <SafeAreaView style={styles.safe}><MediaManiaEnvironment scene="landing" compact={compact}><View style={styles.loading}><ActivityIndicator size="large" color="#ffd56a" /></View></MediaManiaEnvironment></SafeAreaView>;
  }

  if (!state.startingSource) {
    return (
      <SafeAreaView style={styles.safe}>
        <MediaManiaEnvironment scene="landing" compact={compact}>
          <ScrollView style={styles.scroll} contentContainerStyle={[styles.startContent, compact && styles.startContentCompact]} showsVerticalScrollIndicator={false}>
            <View testID="media-mania-live-ui" style={styles.liveUi}>
              <View style={styles.landingTopBar}>
                <TouchableOpacity accessibilityRole="button" accessibilityLabel="Back to NovelIdeas" onPress={() => void exitGame()} style={styles.backButton}><Text style={styles.backText}>{"← BACK TO GAMES"}</Text></TouchableOpacity>
                <View style={styles.landingMeta}><Text style={styles.landingMetaValue}>{MEDIA_MANIA_AGE_BAND_LABELS[state.ageBand].toUpperCase()}</Text><Text style={styles.landingMetaLabel}>CHOOSE A START</Text></View>
              </View>
              <MediaManiaMarquee compact={compact} />
              {persistenceNotice ? <Text accessibilityRole="alert" style={styles.persistenceNotice}>{persistenceNotice}</Text> : null}
              <Text style={[styles.startTitle, compact && styles.startTitleCompact]}>{"Let's get ready to play Media Mania!"}</Text>
              <View style={[styles.howToPlay, compact && styles.howToPlayCompact]}>
                <Text style={styles.howToTitle}>Three titles. One instinct.</Text>
                <Text style={styles.howToCopy}>Pick the one you want most. When the round turns pink, pick the one you would skip.</Text>
                <Text style={styles.howToCopy}>Don’t know a title? Swap it for another. Play in sets of six choices, unlock another media world, and discover book recommendations along the way.</Text>
                <Text style={styles.howToCopy}>No timer. No wrong answers. You can undo your last choice.</Text>
              </View>
              <AgeBandControl ageBand={state.ageBand} onChange={selectAgeBand} />
              <Text style={[styles.startSubtitle, compact && styles.startSubtitleCompact]}>Where would you like to start?</Text>
              <View style={styles.sourceGrid}>
                {MEDIA_MANIA_SOURCES.map((source) => {
                  const available = availableSources.includes(source);
                  return (
                    <Pressable
                      key={source}
                      accessibilityRole="button"
                      accessibilityLabel={`Start with ${MEDIA_MANIA_SOURCE_LABELS[source]}`}
                      accessibilityState={{ disabled: !available }}
                      disabled={locked || !available}
                      style={({ pressed }) => [
                        styles.sourceCard,
                        compact && styles.sourceCardCompact,
                        { borderColor: SOURCE_META[source].color },
                        pressed && available && styles.sourceCardPressed,
                        !available && styles.sourceCardDisabled,
                      ]}
                      onPress={() => void commit(startMediaMania(state, source, MEDIA_MANIA_CATALOG))}
                    >
                      <View style={[styles.sourceIconHalo, { borderColor: SOURCE_META[source].color }]}>
                        <MaterialCommunityIcons name={SOURCE_META[source].icon} size={compact ? 28 : 34} color={SOURCE_META[source].color} />
                      </View>
                      <Text style={[styles.sourceLabel, compact && styles.sourceLabelCompact]}>{MEDIA_MANIA_SOURCE_LABELS[source]}</Text>
                      <Text style={[styles.sourceArrow, { color: SOURCE_META[source].color }]}>{available ? "PRESS PLAY" : "NOT IN THIS BAND"}</Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          </ScrollView>
        </MediaManiaEnvironment>
      </SafeAreaView>
    );
  }

  if (state.unlockStatus === "offered") {
    return (
      <SafeAreaView style={styles.safe}>
        <MediaManiaEnvironment scene="unlock" compact={compact}>
          <ScrollView style={styles.scroll} contentContainerStyle={styles.unlockContent} showsVerticalScrollIndicator={false}>
            <View testID="media-mania-live-ui" style={styles.unlockPanel}>
              <MediaManiaMarquee compact />
              <View style={styles.unlockGlyph}><MaterialCommunityIcons name="star-four-points" size={42} color="#ffd56a" /></View>
              {persistenceNotice ? <Text accessibilityRole="alert" style={styles.persistenceNotice}>{persistenceNotice}</Text> : null}
              <Text style={[styles.unlockTitle, compact && styles.unlockTitleCompact]}>New media unlocked!</Text>
              <Text style={styles.unlockSubtitle}>Choose a new world to mix into your taste - or keep playing your current one.</Text>
              <AgeBandControl ageBand={state.ageBand} onChange={selectAgeBand} compact />
              {state.lastChoiceUndo ? <TouchableOpacity accessibilityRole="button" style={styles.undoButton} onPress={undoLastChoice}><Text style={styles.undoText}>Undo last choice</Text></TouchableOpacity> : null}
              <View style={styles.unlockOptions}>
                {state.unlockOptions.map((source) => (
                  <TouchableOpacity key={source} accessibilityRole="button" style={[styles.unlockCard, compact && styles.unlockCardCompact, { borderColor: SOURCE_META[source].color }]} onPress={() => void commit(resolveMediaManiaUnlock(state, source, MEDIA_MANIA_CATALOG))}>
                    <MaterialCommunityIcons name={SOURCE_META[source].icon} size={38} color={SOURCE_META[source].color} />
                    <Text style={styles.sourceLabel}>{MEDIA_MANIA_SOURCE_LABELS[source]}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <TouchableOpacity accessibilityRole="button" style={styles.continueButton} onPress={() => void commit(resolveMediaManiaUnlock(state, null, MEDIA_MANIA_CATALOG))}><Text style={styles.continueText}>Keep playing {MEDIA_MANIA_SOURCE_LABELS[state.startingSource]}</Text></TouchableOpacity>
            </View>
          </ScrollView>
        </MediaManiaEnvironment>
      </SafeAreaView>
    );
  }

  const round = state.currentRound;
  if (!round) return <SafeAreaView style={styles.safe}><ActivityIndicator color="#fbbf24" /></SafeAreaView>;
  const dislikeRound = round.roundType === "DISLIKE";

  return (
    <SafeAreaView style={styles.safe}>
      <MediaManiaEnvironment scene={mediaManiaEnvironmentScene(state)} compact={compact}>
        <ScrollView style={styles.scroll} contentContainerStyle={[styles.gameContent, compact && styles.gameContentCompact]} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <View testID="media-mania-live-ui">
            <View style={[styles.topBar, compact && styles.topBarCompact]}>
              <TouchableOpacity accessibilityRole="button" accessibilityLabel="Save and leave Media Mania" onPress={() => void exitGame()} style={styles.backButton}><Text style={styles.backText}>{"← SAVE & LEAVE"}</Text></TouchableOpacity>
              {!compact ? <MediaManiaMarquee header /> : null}
              <View style={styles.roundMeta}>
                <Text style={styles.roundLabel}>{MEDIA_MANIA_AGE_BAND_LABELS[state.ageBand].toUpperCase()}</Text>
                <Text style={styles.roundNumber}>ROUND {round.roundNumber}</Text>
              </View>
            </View>
            {compact ? <MediaManiaMarquee compact header /> : null}
            {persistenceNotice ? <Text accessibilityRole="alert" style={styles.persistenceNotice}>{persistenceNotice}</Text> : null}
            <AgeBandControl ageBand={state.ageBand} onChange={selectAgeBand} compact />
            <Animated.View
              testID={`media-mania-${dislikeRound ? "dislike" : "like"}-round`}
              accessibilityLabel={`${dislikeRound ? "Dislike" : "Like"} round: ${dislikeRound ? "Pick the one you'd skip" : "Pick the one you want most"}`}
              style={[
                styles.roundSurface,
                compact && styles.roundSurfaceCompact,
                dislikeRound ? styles.dislikeRoundSurface : styles.likeRoundSurface,
                { opacity: roundTransitionOpacity },
              ]}
            >
              <View style={[styles.roundModeBanner, dislikeRound ? styles.dislikeRoundBanner : styles.likeRoundBanner]}>
                <View style={[styles.roundModeIcon, dislikeRound ? styles.roundModeIconDislike : styles.roundModeIconLike]}>
                  <MaterialCommunityIcons name={dislikeRound ? "thumb-down" : "thumb-up"} size={22} color={dislikeRound ? "#ffd9e1" : "#caffea"} />
                </View>
                <View style={styles.roundModeCopy}>
                  <Text style={[styles.roundModeLabel, dislikeRound && styles.dislikeRoundLabel]}>{dislikeRound ? "DISLIKE ROUND" : "LIKE ROUND"}</Text>
                  <Text style={[styles.roundModeInstruction, dislikeRound && styles.dislikeRoundInstruction]}>{dislikeRound ? "Pick the one you'd SKIP" : "Pick the one you WANT most"}</Text>
                </View>
              </View>

              <View style={[styles.consolePanel, dislikeRound ? styles.dislikeInsetPanel : styles.likeInsetPanel]}>
                <View style={[styles.consoleGrid, compact && styles.consoleGridCompact]}>
                  <View style={styles.scorePanel}>
                    <View style={styles.scoreRow}><Text style={styles.scoreLabel}>TASTE SCORE</Text><Text style={styles.scoreValue}>{state.tasteScore}{state.unlockStatus === "locked" ? ` / ${MEDIA_MANIA_UNLOCK_SCORE}` : " UNLOCKED"}</Text></View>
                    {state.unlockStatus === "locked" ? <View style={styles.progressTrack}><View testID="media-mania-unlock-progress" style={[styles.progressFill, dislikeRound && styles.progressFillDislike, { width: `${progress * 100}%` }]} /></View> : null}
                    <Text style={styles.progressHint}>{state.unlockStatus === "locked" ? `${Math.max(0, MEDIA_MANIA_UNLOCK_SCORE - state.tasteScore)} points to a new media unlock` : `${state.activeSources.length} media worlds active`}</Text>
                  </View>
                  <MediaManiaSessionTrail completedRoundCount={state.completedRoundCount} tone={dislikeRound ? "dislike" : "like"} />
                  <View style={styles.consoleActions}>
                    {state.lastChoiceUndo ? <TouchableOpacity accessibilityRole="button" style={styles.undoButton} onPress={undoLastChoice}><MaterialCommunityIcons name="undo-variant" size={17} color="#f7ead0" /><Text style={styles.undoText}>Undo last choice</Text></TouchableOpacity> : <Text style={styles.consoleTip}>Choose by instinct. Unknown titles never cost points.</Text>}
                  </View>
                </View>
                {(positiveTitles.length || negativeTitles.length) ? (
                  <View style={styles.contextPanel}>
                    {positiveTitles.length ? <View style={styles.contextLine}><Text style={styles.contextLabel}>YOU LIKE</Text><Text style={styles.contextText}>{positiveTitles.join("  +  ")}</Text></View> : null}
                    {negativeTitles.length ? <View style={styles.contextLine}><Text style={[styles.contextLabel, styles.negativeLabel]}>NOT FOR YOU</Text><Text style={styles.contextText}>{negativeTitles.join("   /   ")}</Text></View> : null}
                  </View>
                ) : (
                  <View style={styles.anchorPanel}>
                    <Text style={styles.contextLabel}>STARTING WITH</Text>
                    {round.basisItems.map((item) => <View key={item.id} style={styles.anchorRow}><Text style={styles.anchorTitle}>{item.title}</Text><TouchableOpacity accessibilityRole="button" accessibilityLabel={`I do not know ${item.title}`} onPress={() => unknownBasis(item.id)} style={styles.unknownAnchor}><Text style={styles.unknownText}>{"I don't know this"}</Text></TouchableOpacity></View>)}
                  </View>
                )}
              </View>

              <Text style={[styles.prompt, compact && styles.promptCompact, dislikeRound ? styles.dislikePrompt : styles.likePrompt]}>{dislikeRound ? "Pick the one you'd SKIP" : "Pick the one you WANT most"}</Text>
              {round.isCrossMedia ? <Text style={styles.crossMedia}>CROSS-MEDIA ROUND  +3 BONUS</Text> : null}

              <View style={[styles.candidateRow, compact && styles.candidateColumn]}>
                {round.candidates.map((candidate, candidateIndex) => {
                  const selected = selectedCandidateId === candidate.id;
                  const highlighted = hoveredCandidateId === candidate.id || focusedCandidateId === candidate.id;
                  return (
                    <View key={candidate.id} style={[styles.candidateShell, compact && styles.candidateShellCompact]}>
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={`${dislikeRound ? "Skip" : "Pick"} ${candidate.title}`}
                        accessibilityState={{ selected }}
                        disabled={locked || showDislikeHint}
                        onHoverIn={() => setHoveredCandidateId(candidate.id)}
                        onHoverOut={() => setHoveredCandidateId(null)}
                        onFocus={() => setFocusedCandidateId(candidate.id)}
                        onBlur={() => setFocusedCandidateId(null)}
                        onPress={() => void choose(candidate.id)}
                        style={({ pressed }) => [
                          styles.candidateCard,
                          compact && styles.candidateCardCompact,
                          dislikeRound ? styles.candidateCardDislike : styles.candidateCardLike,
                          highlighted && (dislikeRound ? styles.candidateCardDislikeHover : styles.candidateCardLikeHover),
                          pressed && styles.candidateCardPressed,
                          selected && (dislikeRound ? styles.candidateCardDislikeSelected : styles.candidateCardLikeSelected),
                        ]}
                      >
                        <Text style={[styles.keyHint, dislikeRound ? styles.keyHintDislike : styles.keyHintLike]}>{candidateIndex + 1}</Text>
                        {selected ? <View style={[styles.selectionBadge, dislikeRound ? styles.selectionBadgeDislike : styles.selectionBadgeLike]}><Text style={styles.selectionBadgeText}>{dislikeRound ? "SKIP" : "MY PICK"}</Text></View> : null}
                        <MediaArtwork item={candidate} compact={compact} />
                        <View style={[styles.candidateCopy, compact && styles.candidateCopyCompact]}>
                          <View style={styles.mediaPillRow}><MaterialCommunityIcons name={SOURCE_META[candidate.mediaSource].icon} size={14} color={SOURCE_META[candidate.mediaSource].color} /><Text style={[styles.mediaPill, { color: SOURCE_META[candidate.mediaSource].color }]}>{MEDIA_MANIA_SOURCE_LABELS[candidate.mediaSource].toUpperCase()}</Text></View>
                          <Text style={[styles.candidateTitle, compact && styles.candidateTitleCompact]} numberOfLines={compact ? undefined : 3}>{candidate.title}</Text>
                          {candidate.creator ? <Text style={styles.candidateCreator} numberOfLines={1}>{candidate.creator}</Text> : null}
                        </View>
                      </Pressable>
                      <TouchableOpacity accessibilityRole="button" accessibilityLabel={`I do not know ${candidate.title}`} disabled={locked || showDislikeHint} onPress={() => unknownCandidate(candidate.id)} style={styles.unknownCandidate}><MaterialCommunityIcons name="help-circle-outline" size={16} color="#b4c4d9" /><Text style={styles.unknownText}>{"I don't know this"}</Text></TouchableOpacity>
                    </View>
                  );
                })}
              </View>
              {Platform.OS === "web" ? <Text style={styles.keyboardHint}>Keys 1-3 choose  /  Shift + 1-3 replaces an unknown  /  R replaces the starting item</Text> : null}
            </Animated.View>
          </View>
        </ScrollView>
      </MediaManiaEnvironment>
      <Modal visible={showDislikeHint} transparent animationType="fade" onRequestClose={() => setShowDislikeHint(false)}>
        <View style={styles.hintBackdrop}>
          <View style={styles.hintCard}>
            <Text style={styles.hintEyebrow}>FIRST DISLIKE ROUND</Text>
            <Text style={styles.hintTitle}>The rule flips this round.</Text>
            <Text style={styles.hintCopy}>Choose the title you would skip or that feels least like your taste.</Text>
            <TouchableOpacity accessibilityRole="button" style={styles.hintButton} onPress={() => setShowDislikeHint(false)}><Text style={styles.hintButtonText}>Got it - pick the skip</Text></TouchableOpacity>
          </View>
        </View>
      </Modal>
      {flash ? <View pointerEvents="none" style={[styles.flash, dislikeRound ? styles.flashDislike : styles.flashLike]}><Text style={[styles.flashText, dislikeRound && styles.flashTextDislike]}>{flash}</Text></View> : null}
      {gameRecommendationMilestone.pendingReward ? (
        <GameRecommendationReward
          visible
          cadence={gameRecommendationMilestone.pendingReward.cadence}
          gameLabel={gameRecommendationMilestone.pendingReward.gameLabel}
          book={{
            title: gameRecommendationMilestone.pendingReward.book.title,
            author: gameRecommendationMilestone.pendingReward.book.author,
            coverUrl: gameRecommendationMilestone.pendingReward.coverUrl,
            description: gameRecommendationMilestone.pendingReward.description,
            reason: gameRecommendationMilestone.pendingReward.reason,
          }}
          onRespond={(response) => gameRecommendationMilestone.respond(response, () => undefined)}
          theme="media-mania"
        />
      ) : null}
    </SafeAreaView>
  );
}

function AgeBandControl({ ageBand, onChange, compact = false }: { ageBand: MediaManiaAgeBand; onChange: (ageBand: MediaManiaAgeBand) => void; compact?: boolean }) {
  return (
    <View style={[styles.ageBandControl, compact && styles.ageBandControlCompact]} accessibilityLabel={`Active age band: ${MEDIA_MANIA_AGE_BAND_LABELS[ageBand]}`}>
      {MEDIA_MANIA_AGE_BANDS.map((band) => {
        const selected = band === ageBand;
        return (
          <TouchableOpacity
            key={band}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            accessibilityLabel={`Use ${MEDIA_MANIA_AGE_BAND_LABELS[band]} age band`}
            onPress={() => onChange(band)}
            style={[styles.ageBandButton, compact && styles.ageBandButtonCompact, selected && styles.ageBandButtonSelected]}
          >
            <Text style={[styles.ageBandText, selected && styles.ageBandTextSelected]}>{MEDIA_MANIA_AGE_BAND_LABELS[band]}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

function MediaManiaMarquee({ compact = false, header = false }: { compact?: boolean; header?: boolean }) {
  return (
    <View style={[styles.marquee, header && styles.marqueeHeader, compact && styles.marqueeCompact]} accessibilityRole="header">
      <View style={styles.marqueeBulbs}>
        {Array.from({ length: compact ? 7 : 11 }, (_, index) => <View key={index} style={styles.marqueeBulb} />)}
      </View>
      <Text style={[styles.logo, compact && styles.logoCompact]}>
        <Text style={styles.logoMedia}>MEDIA </Text>
        <Text style={styles.logoAccent}>MANIA</Text>
      </Text>
      <Text style={[styles.eyebrow, compact && styles.eyebrowCompact]}>RECOMMENDATION GAMES</Text>
      <Text style={[styles.tagline, compact && styles.taglineCompact]}>Different worlds. Brighter stories.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#040b18" },
  loading: { flex: 1, alignItems: "center", justifyContent: "center" },
  scroll: { flex: 1, zIndex: 2 },
  liveUi: { width: "100%", alignItems: "center" },
  startContent: { flexGrow: 1, alignItems: "center", paddingHorizontal: 24, paddingTop: 16, paddingBottom: 46 },
  startContentCompact: { paddingHorizontal: 12, paddingTop: 10 },
  landingTopBar: { width: "100%", maxWidth: 1220, flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between" },
  backButton: { minHeight: 44, minWidth: 128, justifyContent: "center", alignItems: "center", alignSelf: "flex-start", paddingHorizontal: 14, borderWidth: 1, borderColor: "#d8ad53", borderRadius: 8, backgroundColor: "rgba(5, 16, 34, 0.92)" },
  backText: { color: "#f7ead0", fontSize: 12, fontWeight: "900", letterSpacing: 0.7 },
  landingMeta: { minWidth: 126, minHeight: 52, alignItems: "flex-end", justifyContent: "center", paddingHorizontal: 12, borderWidth: 1, borderColor: "#d8ad53", borderRadius: 8, backgroundColor: "rgba(5, 16, 34, 0.92)" },
  landingMetaValue: { color: "#fff0bd", fontSize: 13, lineHeight: 17, fontWeight: "900", letterSpacing: 1.1 },
  landingMetaLabel: { color: "#e1b85b", fontSize: 8, fontWeight: "900", letterSpacing: 1.2 },
  marquee: { width: "100%", maxWidth: 650, alignItems: "center", marginTop: -30, paddingHorizontal: 34, paddingTop: 15, paddingBottom: 11, borderWidth: 2, borderColor: "#d7a34a", borderRadius: 28, backgroundColor: "rgba(6, 15, 33, 0.95)", shadowColor: "#ff9f32", shadowOpacity: 0.55, shadowRadius: 18, shadowOffset: { width: 0, height: 0 }, elevation: 8 },
  marqueeHeader: { width: "55%", maxWidth: 590, marginTop: 0 },
  marqueeCompact: { maxWidth: 430, marginTop: 2, paddingHorizontal: 18, paddingTop: 10, paddingBottom: 8, borderRadius: 20 },
  marqueeBulbs: { position: "absolute", left: 14, right: 14, top: 6, flexDirection: "row", justifyContent: "space-between" },
  marqueeBulb: { width: 4, height: 4, borderRadius: 2, backgroundColor: "#ffd780" },
  logo: { fontSize: 43, lineHeight: 48, fontWeight: "900", letterSpacing: 1.4, textAlign: "center", textShadowColor: "#0e75ff", textShadowRadius: 13, textShadowOffset: { width: 0, height: 0 } },
  logoCompact: { fontSize: 28, lineHeight: 32 },
  logoMedia: { color: "#9ad5ff" },
  logoAccent: { color: "#ffc071", textShadowColor: "#ff6c20", textShadowRadius: 12, textShadowOffset: { width: 0, height: 0 } },
  eyebrow: { color: "#ffe38d", fontSize: 12, fontWeight: "900", letterSpacing: 2.4, marginTop: 1 },
  eyebrowCompact: { fontSize: 9, letterSpacing: 1.8 },
  tagline: { color: "#dbe9ff", fontFamily: "Georgia", fontStyle: "italic", fontSize: 13, marginTop: 4 },
  taglineCompact: { fontSize: 11 },
  startTitle: { color: "#ffffff", fontSize: 29, lineHeight: 35, fontWeight: "900", textAlign: "center", maxWidth: 760, marginTop: 16, textShadowColor: "#000", textShadowRadius: 8, textShadowOffset: { width: 0, height: 2 } },
  startTitleCompact: { fontSize: 23, lineHeight: 29 },
  howToPlay: { width: "100%", maxWidth: 700, marginTop: 10, paddingVertical: 14, paddingHorizontal: 20, borderRadius: 15, backgroundColor: "rgba(5, 22, 43, 0.9)", borderWidth: 1, borderColor: "rgba(245, 193, 83, 0.72)", gap: 7 },
  howToPlayCompact: { padding: 14 },
  howToTitle: { color: "#ffe08a", fontSize: 19, fontWeight: "900" },
  howToCopy: { color: "#e1ebf7", fontSize: 13, lineHeight: 19 },
  startSubtitle: { color: "#f7f8fb", fontSize: 21, fontWeight: "900", marginTop: 12, marginBottom: 14, textShadowColor: "#000", textShadowRadius: 6, textShadowOffset: { width: 0, height: 1 } },
  startSubtitleCompact: { fontSize: 18, textAlign: "center" },
  ageBandControl: { flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: 8, marginTop: 12 },
  ageBandControlCompact: { marginTop: 9 },
  ageBandButton: { minHeight: 44, justifyContent: "center", paddingHorizontal: 16, borderWidth: 1, borderColor: "#58728f", borderRadius: 999, backgroundColor: "rgba(6, 23, 43, 0.94)" },
  ageBandButtonCompact: { minHeight: 36, paddingHorizontal: 12 },
  ageBandButtonSelected: { borderColor: "#ffd15c", backgroundColor: "rgba(89, 58, 12, 0.96)", shadowColor: "#ffac32", shadowOpacity: 0.55, shadowRadius: 8, shadowOffset: { width: 0, height: 0 } },
  ageBandText: { color: "#c5d4e6", fontSize: 13, fontWeight: "900" },
  ageBandTextSelected: { color: "#fff0b8" },
  sourceGrid: { width: "100%", maxWidth: 1120, flexDirection: "row", flexWrap: "wrap", gap: 12, justifyContent: "center" },
  sourceCard: { width: 145, minHeight: 148, borderWidth: 2, borderRadius: 20, backgroundColor: "rgba(5, 18, 38, 0.93)", padding: 14, alignItems: "center", justifyContent: "center", shadowColor: "#000", shadowOpacity: 0.7, shadowRadius: 9, shadowOffset: { width: 0, height: 4 }, elevation: 6 },
  sourceCardCompact: { width: "46%", minWidth: 142, maxWidth: 190, minHeight: 132 },
  sourceCardPressed: { opacity: 0.76, transform: [{ scale: 0.98 }] },
  sourceCardDisabled: { opacity: 0.43 },
  sourceIconHalo: { width: 54, height: 54, borderRadius: 27, alignItems: "center", justifyContent: "center", borderWidth: 1.5, backgroundColor: "rgba(2, 9, 21, 0.72)" },
  sourceLabel: { color: "#fff", fontWeight: "900", fontSize: 18, marginTop: 8, textAlign: "center" },
  sourceLabelCompact: { fontSize: 16 },
  sourceArrow: { fontSize: 9, fontWeight: "900", marginTop: 10, letterSpacing: 1.2, textAlign: "center" },
  gameContent: { flexGrow: 1, width: "100%", maxWidth: 1040, alignSelf: "center", paddingHorizontal: 18, paddingTop: 10, paddingBottom: 44 },
  gameContentCompact: { paddingHorizontal: 10, paddingTop: 8 },
  topBar: { minHeight: 108, flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 14 },
  topBarCompact: { minHeight: 0, flexWrap: "wrap" },
  roundMeta: { minWidth: 128, minHeight: 48, alignItems: "flex-end", justifyContent: "center", gap: 2, paddingHorizontal: 12, borderWidth: 1, borderColor: "#d8ad53", borderRadius: 8, backgroundColor: "rgba(5, 16, 34, 0.92)" },
  roundLabel: { color: "#d9e3f1", fontSize: 10, fontWeight: "900", letterSpacing: 1.4 },
  roundNumber: { color: "#ffd66c", fontSize: 13, fontWeight: "900", letterSpacing: 1.2 },
  roundSurface: { marginTop: 10, padding: 14, borderRadius: 26, borderWidth: 2, shadowColor: "#000", shadowOpacity: 0.78, shadowRadius: 18, shadowOffset: { width: 0, height: 8 }, elevation: 8 },
  roundSurfaceCompact: { padding: 9, borderRadius: 20 },
  likeRoundSurface: { backgroundColor: "rgba(3, 23, 27, 0.89)", borderColor: "#41d7b0", shadowColor: "#1ed3ad" },
  dislikeRoundSurface: { backgroundColor: "rgba(37, 7, 20, 0.9)", borderColor: "#f05282", shadowColor: "#e62e69" },
  roundModeBanner: { alignSelf: "center", minWidth: 300, maxWidth: 600, flexDirection: "row", borderRadius: 18, borderWidth: 2, paddingVertical: 10, paddingHorizontal: 18, alignItems: "center", justifyContent: "center", gap: 12 },
  likeRoundBanner: { backgroundColor: "rgba(7, 72, 63, 0.95)", borderColor: "#73f0c7" },
  dislikeRoundBanner: { backgroundColor: "rgba(101, 13, 43, 0.96)", borderColor: "#ff80a7" },
  roundModeIcon: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center", borderWidth: 1 },
  roundModeIconLike: { backgroundColor: "#0c604e", borderColor: "#9af6d6" },
  roundModeIconDislike: { backgroundColor: "#8e1945", borderColor: "#ffb2c8" },
  roundModeCopy: { alignItems: "center" },
  roundModeLabel: { color: "#b9ffe7", fontSize: 18, lineHeight: 22, fontWeight: "900", letterSpacing: 2.1 },
  dislikeRoundLabel: { color: "#ffe1e8" },
  roundModeInstruction: { color: "#effff9", fontSize: 15, lineHeight: 20, fontWeight: "900" },
  dislikeRoundInstruction: { color: "#fff0f4" },
  consolePanel: { marginTop: 12, padding: 13, borderRadius: 17, borderWidth: 1 },
  consoleGrid: { flexDirection: "row", alignItems: "center", gap: 18 },
  consoleGridCompact: { flexDirection: "column", alignItems: "stretch", gap: 8 },
  scorePanel: { flex: 1, minWidth: 210 },
  likeInsetPanel: { backgroundColor: "rgba(4, 41, 40, 0.9)", borderColor: "rgba(79, 223, 184, 0.62)" },
  dislikeInsetPanel: { backgroundColor: "rgba(57, 10, 28, 0.92)", borderColor: "rgba(244, 88, 132, 0.66)" },
  scoreRow: { flexDirection: "row", justifyContent: "space-between", gap: 12 },
  scoreLabel: { color: "#e8f3f2", fontWeight: "900", fontSize: 12, letterSpacing: 1.3 },
  scoreValue: { color: "#ffd56a", fontWeight: "900", fontSize: 17 },
  progressTrack: { height: 8, borderRadius: 8, backgroundColor: "rgba(4, 16, 29, 0.82)", marginTop: 8, overflow: "hidden" },
  progressFill: { height: "100%", backgroundColor: "#55e0b3", borderRadius: 8 },
  progressFillDislike: { backgroundColor: "#f5608d" },
  progressHint: { color: "#aebed0", fontSize: 11, marginTop: 6 },
  consoleActions: { flex: 0.8, alignItems: "center", justifyContent: "center" },
  consoleTip: { color: "#c0ccda", fontSize: 11, lineHeight: 16, textAlign: "center" },
  contextPanel: { marginTop: 11, paddingTop: 10, borderTopWidth: 1, borderTopColor: "rgba(205, 225, 239, 0.18)", gap: 6 },
  contextLine: { flexDirection: "row", flexWrap: "wrap", alignItems: "baseline", gap: 9 },
  contextLabel: { color: "#67e6ad", fontSize: 10, fontWeight: "900", letterSpacing: 1.3 },
  negativeLabel: { color: "#ff7699" },
  contextText: { color: "#edf3fa", flexShrink: 1, fontWeight: "700" },
  anchorPanel: { marginTop: 11, paddingTop: 10, borderTopWidth: 1, borderTopColor: "rgba(205, 225, 239, 0.18)" },
  anchorRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12, marginTop: 4 },
  anchorTitle: { color: "#fff", fontWeight: "900", fontSize: 17, flex: 1 },
  unknownAnchor: { minHeight: 44, paddingHorizontal: 12, justifyContent: "center" },
  prompt: { fontSize: 27, lineHeight: 33, fontWeight: "900", textAlign: "center", marginTop: 17, marginBottom: 13, textShadowColor: "#000", textShadowRadius: 8, textShadowOffset: { width: 0, height: 2 } },
  promptCompact: { fontSize: 22, lineHeight: 27 },
  likePrompt: { color: "#a4ffdc" },
  dislikePrompt: { color: "#ffabc0" },
  crossMedia: { color: "#7de9ff", textAlign: "center", fontSize: 11, fontWeight: "900", letterSpacing: 1.2, marginTop: -6, marginBottom: 12 },
  candidateRow: { flexDirection: "row", gap: 14, alignItems: "stretch" },
  candidateColumn: { flexDirection: "column" },
  candidateShell: { flex: 1, minWidth: 0 },
  candidateShellCompact: { width: "100%", flex: 0 },
  candidateCard: { flex: 1, minHeight: 392, borderWidth: 2, borderRadius: 19, backgroundColor: "rgba(7, 19, 36, 0.96)", overflow: "hidden", shadowColor: "#000", shadowOpacity: 0.7, shadowRadius: 9, shadowOffset: { width: 0, height: 5 }, elevation: 6 },
  candidateCardCompact: { flexDirection: "row", minHeight: 146, flex: 0, alignItems: "stretch" },
  candidateCardLike: { borderColor: "#33b98f" },
  candidateCardDislike: { borderColor: "#d64b73" },
  candidateCardLikeHover: { borderColor: "#adffe4", shadowColor: "#4aebbd", shadowOpacity: 0.9, shadowRadius: 15 },
  candidateCardDislikeHover: { borderColor: "#ffc1d1", shadowColor: "#ff4f85", shadowOpacity: 0.9, shadowRadius: 15 },
  candidateCardPressed: { opacity: 0.82, transform: [{ scale: 0.99 }] },
  candidateCardLikeSelected: { borderColor: "#d0ffef", backgroundColor: "#104438" },
  candidateCardDislikeSelected: { borderColor: "#ffd5df", backgroundColor: "#561a2d" },
  keyHint: { position: "absolute", zIndex: 2, top: 10, left: 10, color: "#06172a", width: 32, height: 32, borderRadius: 16, textAlign: "center", lineHeight: 29, fontWeight: "900", borderWidth: 2 },
  keyHintLike: { backgroundColor: "#9affd9", borderColor: "#e3fff5" },
  keyHintDislike: { backgroundColor: "#ffabc0", borderColor: "#fff0f4" },
  selectionBadge: { position: "absolute", zIndex: 3, top: 10, right: 10, minHeight: 30, justifyContent: "center", paddingHorizontal: 12, borderRadius: 999, borderWidth: 2 },
  selectionBadgeLike: { backgroundColor: "#0f765c", borderColor: "#a7f3d0" },
  selectionBadgeDislike: { backgroundColor: "#9f294a", borderColor: "#fecdd3" },
  selectionBadgeText: { color: "#fff", fontSize: 12, fontWeight: "900", letterSpacing: 1 },
  artwork: { width: "100%", height: 230, backgroundColor: "#102943" },
  artworkCompact: { width: 106, height: "100%", minHeight: 146 },
  artworkLoading: { alignItems: "center", justifyContent: "center", gap: 10 },
  artworkStatus: { color: "#b7c7da", fontWeight: "800", textAlign: "center" },
  artworkFallback: { alignItems: "center", justifyContent: "center" },
  artworkIcon: { fontSize: 62 },
  artworkIconCompact: { fontSize: 30 },
  artworkSource: { color: "#fff", fontSize: 12, fontWeight: "900", letterSpacing: 1.6, marginTop: 8 },
  artworkSourceCompact: { fontSize: 9, letterSpacing: 0, paddingHorizontal: 6, textAlign: "center" },
  candidateCopy: { padding: 15, minHeight: 136 },
  candidateCopyCompact: { flex: 1, minWidth: 0, minHeight: 0, padding: 12, justifyContent: "center" },
  mediaPillRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  mediaPill: { fontSize: 10, fontWeight: "900", letterSpacing: 1.3 },
  candidateTitle: { color: "#fff", fontSize: 20, lineHeight: 24, fontWeight: "900", marginTop: 8 },
  candidateTitleCompact: { fontSize: 17, lineHeight: 21 },
  candidateCreator: { color: "#b7c5d8", marginTop: 7, fontWeight: "700" },
  undoButton: { minHeight: 44, alignSelf: "center", flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7, paddingHorizontal: 14, borderWidth: 1, borderColor: "#b7a574", borderRadius: 999, backgroundColor: "rgba(5, 14, 28, 0.55)" },
  undoText: { color: "#f4ead5", fontWeight: "900", fontSize: 12 },
  unknownCandidate: { minHeight: 46, flexDirection: "row", gap: 6, alignItems: "center", justifyContent: "center", marginTop: 4, borderRadius: 12, backgroundColor: "rgba(4, 12, 24, 0.7)" },
  unknownText: { color: "#c3d0df", fontWeight: "800", fontSize: 12 },
  keyboardHint: { color: "#a8b7c9", textAlign: "center", marginTop: 14, fontSize: 11 },
  persistenceNotice: { width: "100%", maxWidth: 760, color: "#ffe9aa", backgroundColor: "rgba(66, 32, 6, 0.94)", borderColor: "#c98c25", borderWidth: 1, borderRadius: 10, padding: 9, textAlign: "center", fontWeight: "800", marginVertical: 8, alignSelf: "center" },
  hintBackdrop: { flex: 1, backgroundColor: "rgba(3, 8, 18, 0.88)", alignItems: "center", justifyContent: "center", padding: 24 },
  hintCard: { width: "100%", maxWidth: 480, borderRadius: 24, borderWidth: 2, borderColor: "#ff7099", backgroundColor: "#3b1220", padding: 26, alignItems: "center", shadowColor: "#ec376d", shadowOpacity: 0.65, shadowRadius: 22, shadowOffset: { width: 0, height: 0 }, elevation: 10 },
  hintEyebrow: { color: "#fecdd3", fontSize: 13, fontWeight: "900", letterSpacing: 2 },
  hintTitle: { color: "#fff", fontSize: 28, lineHeight: 34, fontWeight: "900", textAlign: "center", marginTop: 10 },
  hintCopy: { color: "#ffe4e6", fontSize: 17, lineHeight: 24, textAlign: "center", marginTop: 10 },
  hintButton: { minHeight: 52, marginTop: 22, borderRadius: 999, backgroundColor: "#ff789c", paddingHorizontal: 22, justifyContent: "center" },
  hintButtonText: { color: "#310b16", fontWeight: "900", fontSize: 16 },
  flash: { position: "absolute", zIndex: 20, top: "42%", alignSelf: "center", borderRadius: 999, borderWidth: 3, paddingVertical: 16, paddingHorizontal: 28, shadowColor: "#000", shadowOpacity: 0.7, shadowRadius: 14, shadowOffset: { width: 0, height: 6 } },
  flashLike: { backgroundColor: "#5ee1b7", borderColor: "#d1fae5" },
  flashDislike: { backgroundColor: "#be3458", borderColor: "#fecdd3" },
  flashText: { color: "#06241d", fontWeight: "900", fontSize: 20 },
  flashTextDislike: { color: "#fff1f2" },
  unlockContent: { flexGrow: 1, alignItems: "center", justifyContent: "center", padding: 20 },
  unlockPanel: { width: "100%", maxWidth: 850, alignItems: "center", padding: 24, borderWidth: 2, borderColor: "#d8ad53", borderRadius: 28, backgroundColor: "rgba(5, 15, 32, 0.94)", shadowColor: "#f0a62e", shadowOpacity: 0.38, shadowRadius: 22, shadowOffset: { width: 0, height: 0 }, elevation: 8 },
  unlockGlyph: { width: 72, height: 72, borderRadius: 36, alignItems: "center", justifyContent: "center", marginTop: 20, borderWidth: 2, borderColor: "#ffd56a", backgroundColor: "#4d3109" },
  unlockTitle: { color: "#fff", fontSize: 38, fontWeight: "900", textAlign: "center", marginTop: 10 },
  unlockTitleCompact: { fontSize: 29 },
  unlockSubtitle: { color: "#cbd8e7", fontSize: 17, lineHeight: 24, textAlign: "center", maxWidth: 650, marginTop: 8 },
  unlockOptions: { flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: 12, marginTop: 23 },
  unlockCard: { width: 180, minHeight: 145, borderWidth: 2, borderRadius: 20, backgroundColor: "rgba(8, 28, 50, 0.96)", alignItems: "center", justifyContent: "center" },
  unlockCardCompact: { width: 140, minHeight: 126 },
  continueButton: { minHeight: 48, justifyContent: "center", marginTop: 20, paddingHorizontal: 18, borderWidth: 1, borderColor: "#7c8ea5", borderRadius: 999 },
  continueText: { color: "#d8e3ef", fontWeight: "800" },
});
