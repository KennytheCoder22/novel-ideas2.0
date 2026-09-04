import { useEffect, useMemo, useRef, useState } from "react";
import { router, useLocalSearchParams } from "expo-router";
import { AccessibilityInfo, ActivityIndicator, Animated, Image, Modal, Platform, SafeAreaView, ScrollView, StyleSheet, Text, TouchableOpacity, useWindowDimensions, View } from "react-native";
import { MEDIA_MANIA_CATALOG } from "../features/recommendation-games/media-mania/mediaManiaCatalog";
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

const SOURCE_META: Record<MediaManiaSource, { icon: string; color: string }> = {
  books: { icon: "BK", color: "#8b5cf6" }, movies: { icon: "MV", color: "#ef4444" },
  tv: { icon: "TV", color: "#06b6d4" }, games: { icon: "GM", color: "#22c55e" },
  youtube: { icon: "YT", color: "#f43f5e" }, anime: { icon: "AN", color: "#ec4899" },
  podcasts: { icon: "PC", color: "#f59e0b" },
};

const catalogById = new Map(MEDIA_MANIA_CATALOG.map((item) => [item.id, item]));
const titleFor = (id: string) => catalogById.get(id)?.title || "Unknown title";
const normalizeAgeBand = (value: unknown): MediaManiaAgeBand => {
  const normalized = String(value || "").trim().toLowerCase();
  return MEDIA_MANIA_AGE_BANDS.includes(normalized as MediaManiaAgeBand)
    ? normalized as MediaManiaAgeBand
    : "teens";
};
const durablePersistenceNotice = (error: string | null) =>
  error === "durable_endpoint_unavailable"
    ? "Gameplay is saved on this device."
    : "Gameplay is saved on this device; durable sync will retry.";
const mediaManiaAgeBandToV2 = (band: MediaManiaAgeBand): AgeBandV2 => (band === "adults" ? "adult" : band);

function MediaArtwork({ item }: { item: MediaManiaCatalogItem }) {
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
        style={styles.artwork}
        resizeMode="cover"
        onError={() => {
          if (bundledSource && !bundledFailed) setBundledFailed(true);
          else setCandidateIndex((index) => index + 1);
        }}
      />
    );
  }

  if (lookupStatus === "loading") {
    return <View style={[styles.artwork, styles.artworkLoading]}><ActivityIndicator color="#d6e5f5" /><Text style={styles.artworkStatus}>Finding artwork...</Text></View>;
  }

  const failed = bundledFailed || candidates.length > 0 || lookupStatus === "lookup_failed";
  return (
    <View style={[styles.artwork, styles.artworkFallback, { backgroundColor: meta.color }]}>
      <Text style={styles.artworkIcon}>{failed ? "!" : meta.icon}</Text>
      <Text style={styles.artworkSource}>{failed ? "ARTWORK UNAVAILABLE" : "NO ARTWORK AVAILABLE"}</Text>
    </View>
  );
}
export default function MediaManiaScreen() {
  const params = useLocalSearchParams<{ playerId?: string; libraryId?: string; ageBand?: string }>();
  const playerId = String(params.playerId || "media-mania-player");
  const libraryId = String(params.libraryId || "default");
  const initialAgeBand = normalizeAgeBand(params.ageBand);
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
        const lifecycle = saved
          ? recordMediaManiaSessionContinued(saved.state)
          : recordMediaManiaSessionStarted(createMediaManiaState({
              playerId,
              sessionId: createMediaManiaSessionId(),
              libraryId,
              ageBand: initialAgeBand,
            }));
        const nextEvents = [...(saved?.events || []), ...lifecycle.events];
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
      if (event.repeat || locked || showDislikeHint || !state?.currentRound || state.unlockStatus === "offered") return;
      if (["1", "2", "3"].includes(event.key)) {
        event.preventDefault();
        const candidate = state.currentRound.candidates[Number(event.key) - 1];
        if (candidate) {
          if (event.shiftKey) unknownCandidate(candidate.id);
          else choose(candidate.id);
        }
      } else if (event.key.toLowerCase() === "r") {
        event.preventDefault();
        const basis = state.currentRound.basisItems[0];
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
    return <SafeAreaView style={styles.safe}><ActivityIndicator size="large" color="#fbbf24" /></SafeAreaView>;
  }

  if (!state.startingSource) {
    return (
      <SafeAreaView style={styles.safe}>
        <ScrollView contentContainerStyle={styles.startContent}>
          <TouchableOpacity accessibilityRole="button" accessibilityLabel="Back to NovelIdeas" onPress={() => void exitGame()} style={styles.backButton}><Text style={styles.backText}>{"< NovelIdeas"}</Text></TouchableOpacity>
          <Text style={styles.eyebrow}>RECOMMENDATION GAMES</Text>
          {persistenceNotice ? <Text accessibilityRole="alert" style={styles.persistenceNotice}>{persistenceNotice}</Text> : null}
          <Text style={styles.startTitle}>{"Let's get ready to play Media Mania!"}</Text>
          <AgeBandControl ageBand={state.ageBand} onChange={selectAgeBand} />
          <Text style={styles.startSubtitle}>Where would you like to start?</Text>
          <View style={styles.sourceGrid}>
            {MEDIA_MANIA_SOURCES.map((source) => (
              <TouchableOpacity
                key={source}
                accessibilityRole="button"
                accessibilityLabel={`Start with ${MEDIA_MANIA_SOURCE_LABELS[source]}`}
                accessibilityState={{ disabled: !availableSources.includes(source) }}
                disabled={locked || !availableSources.includes(source)}
                style={[styles.sourceCard, { borderColor: SOURCE_META[source].color }, !availableSources.includes(source) && styles.sourceCardDisabled]}
                onPress={() => void commit(startMediaMania(state, source, MEDIA_MANIA_CATALOG))}
              >
                <Text style={styles.sourceIcon}>{SOURCE_META[source].icon}</Text>
                <Text style={styles.sourceLabel}>{MEDIA_MANIA_SOURCE_LABELS[source]}</Text>
                <Text style={[styles.sourceArrow, { color: SOURCE_META[source].color }]}>{availableSources.includes(source) ? "PLAY >" : "NOT IN THIS BAND"}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  if (state.unlockStatus === "offered") {
    return (
      <SafeAreaView style={styles.safe}>
        <ScrollView contentContainerStyle={styles.unlockContent}>
          <Text style={styles.unlockIcon}>+</Text>
          {persistenceNotice ? <Text accessibilityRole="alert" style={styles.persistenceNotice}>{persistenceNotice}</Text> : null}
          <Text style={styles.unlockTitle}>New media unlocked!</Text>
          <Text style={styles.unlockSubtitle}>Choose a new world to mix into your taste - or keep playing your current one.</Text>
          <AgeBandControl ageBand={state.ageBand} onChange={selectAgeBand} compact />
          {state.lastChoiceUndo ? <TouchableOpacity accessibilityRole="button" style={styles.undoButton} onPress={undoLastChoice}><Text style={styles.undoText}>Undo last choice</Text></TouchableOpacity> : null}
          <View style={styles.unlockOptions}>
            {state.unlockOptions.map((source) => (
              <TouchableOpacity key={source} style={[styles.unlockCard, { borderColor: SOURCE_META[source].color }]} onPress={() => void commit(resolveMediaManiaUnlock(state, source, MEDIA_MANIA_CATALOG))}>
                <Text style={styles.sourceIcon}>{SOURCE_META[source].icon}</Text>
                <Text style={styles.sourceLabel}>{MEDIA_MANIA_SOURCE_LABELS[source]}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <TouchableOpacity style={styles.continueButton} onPress={() => void commit(resolveMediaManiaUnlock(state, null, MEDIA_MANIA_CATALOG))}><Text style={styles.continueText}>Keep playing {MEDIA_MANIA_SOURCE_LABELS[state.startingSource]}</Text></TouchableOpacity>
        </ScrollView>
      </SafeAreaView>
    );
  }

  const round = state.currentRound;
  if (!round) return <SafeAreaView style={styles.safe}><ActivityIndicator color="#fbbf24" /></SafeAreaView>;
  const dislikeRound = round.roundType === "DISLIKE";

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.gameContent} keyboardShouldPersistTaps="handled">
        <View style={styles.topBar}>
          <TouchableOpacity accessibilityRole="button" accessibilityLabel="Back to NovelIdeas" onPress={() => void exitGame()} style={styles.backButton}><Text style={styles.backText}>{"< Back"}</Text></TouchableOpacity>
          <Text style={styles.logo}>MEDIA <Text style={styles.logoAccent}>MANIA</Text></Text>
          <View style={styles.roundMeta}>
            <Text style={styles.roundLabel}>{MEDIA_MANIA_AGE_BAND_LABELS[state.ageBand].toUpperCase()}</Text>
            <Text style={styles.roundLabel}>ROUND {round.roundNumber}</Text>
          </View>
          {persistenceNotice ? <Text accessibilityRole="alert" style={styles.persistenceNotice}>{persistenceNotice}</Text> : null}
        </View>
        <AgeBandControl ageBand={state.ageBand} onChange={selectAgeBand} compact />
        <Animated.View
          testID={`media-mania-${dislikeRound ? "dislike" : "like"}-round`}
          accessibilityLabel={`${dislikeRound ? "Dislike" : "Like"} round: ${dislikeRound ? "Pick the one you'd skip" : "Pick the one you want most"}`}
          style={[
            styles.roundSurface,
            dislikeRound ? styles.dislikeRoundSurface : styles.likeRoundSurface,
            { opacity: roundTransitionOpacity },
          ]}
        >
          <View style={[styles.roundModeBanner, dislikeRound ? styles.dislikeRoundBanner : styles.likeRoundBanner]}>
            <Text style={[styles.roundModeLabel, dislikeRound && styles.dislikeRoundLabel]}>{dislikeRound ? "DISLIKE ROUND" : "LIKE ROUND"}</Text>
            <Text style={[styles.roundModeInstruction, dislikeRound && styles.dislikeRoundInstruction]}>{dislikeRound ? "Pick the one you'd SKIP" : "Pick the one you WANT most"}</Text>
          </View>
          <View style={[styles.scorePanel, dislikeRound ? styles.dislikeInsetPanel : styles.likeInsetPanel]}>
            <View style={styles.scoreRow}><Text style={styles.scoreLabel}>Taste Score</Text><Text style={styles.scoreValue}>{state.tasteScore}{state.unlockStatus === "locked" ? ` / ${MEDIA_MANIA_UNLOCK_SCORE}` : " unlocked"}</Text></View>
            <View style={styles.progressTrack}><View testID="media-mania-unlock-progress" style={[styles.progressFill, { width: `${progress * 100}%` }]} /></View>
            <Text style={styles.progressHint}>{state.unlockStatus === "locked" ? `${Math.max(0, MEDIA_MANIA_UNLOCK_SCORE - state.tasteScore)} points to a new media unlock` : `${state.activeSources.length} media worlds active`}</Text>
            {state.lastChoiceUndo ? <TouchableOpacity accessibilityRole="button" style={styles.undoButton} onPress={undoLastChoice}><Text style={styles.undoText}>Undo last choice</Text></TouchableOpacity> : null}
          </View>

          {(positiveTitles.length || negativeTitles.length) ? (
            <View style={[styles.contextPanel, dislikeRound ? styles.dislikeInsetPanel : styles.likeInsetPanel]}>
              {positiveTitles.length ? <View style={styles.contextLine}><Text style={styles.contextLabel}>YOU LIKE</Text><Text style={styles.contextText}>{positiveTitles.join("  +  ")}</Text></View> : null}
              {negativeTitles.length ? <View style={styles.contextLine}><Text style={[styles.contextLabel, styles.negativeLabel]}>NOT FOR YOU</Text><Text style={styles.contextText}>{negativeTitles.join("   /   ")}</Text></View> : null}
            </View>
          ) : (
            <View style={[styles.anchorPanel, dislikeRound ? styles.dislikeInsetPanel : styles.likeInsetPanel]}>
              <Text style={styles.contextLabel}>STARTING WITH</Text>
              {round.basisItems.map((item) => <View key={item.id} style={styles.anchorRow}><Text style={styles.anchorTitle}>{item.title}</Text><TouchableOpacity accessibilityRole="button" onPress={() => unknownBasis(item.id)} style={styles.unknownAnchor}><Text style={styles.unknownText}>{"I don't know this"}</Text></TouchableOpacity></View>)}
            </View>
          )}

          <Text style={[styles.prompt, dislikeRound ? styles.dislikePrompt : styles.likePrompt]}>{dislikeRound ? "Pick the one you'd SKIP" : "Pick the one you WANT most"}</Text>
          {round.isCrossMedia ? <Text style={styles.crossMedia}>CROSS-MEDIA ROUND  +3 BONUS</Text> : null}

          <View style={[styles.candidateRow, compact && styles.candidateColumn]}>
            {round.candidates.map((candidate, candidateIndex) => {
              const selected = selectedCandidateId === candidate.id;
              return (
                <View key={candidate.id} style={[styles.candidateShell, compact && styles.candidateShellCompact]}>
                  <TouchableOpacity
                    accessibilityRole="button"
                    accessibilityLabel={`${dislikeRound ? "Skip" : "Pick"} ${candidate.title}`}
                    accessibilityState={{ selected }}
                    disabled={locked || showDislikeHint}
                    activeOpacity={0.68}
                    onPress={() => void choose(candidate.id)}
                    style={[
                      styles.candidateCard,
                      dislikeRound ? styles.candidateCardDislike : styles.candidateCardLike,
                      selected && (dislikeRound ? styles.candidateCardDislikeSelected : styles.candidateCardLikeSelected),
                    ]}
                  >
                    <Text style={[styles.keyHint, dislikeRound ? styles.keyHintDislike : styles.keyHintLike]}>{candidateIndex + 1}</Text>
                    {selected ? <View style={[styles.selectionBadge, dislikeRound ? styles.selectionBadgeDislike : styles.selectionBadgeLike]}><Text style={styles.selectionBadgeText}>{dislikeRound ? "SKIP" : "MY PICK"}</Text></View> : null}
                    <MediaArtwork item={candidate} />
                    <View style={styles.candidateCopy}>
                      <Text style={[styles.mediaPill, { color: SOURCE_META[candidate.mediaSource].color }]}>{MEDIA_MANIA_SOURCE_LABELS[candidate.mediaSource].toUpperCase()}</Text>
                      <Text style={styles.candidateTitle} numberOfLines={3}>{candidate.title}</Text>
                      {candidate.creator ? <Text style={styles.candidateCreator} numberOfLines={1}>{candidate.creator}</Text> : null}
                    </View>
                  </TouchableOpacity>
                  <TouchableOpacity accessibilityRole="button" accessibilityLabel={`I do not know ${candidate.title}`} disabled={locked || showDislikeHint} onPress={() => unknownCandidate(candidate.id)} style={styles.unknownCandidate}><Text style={styles.unknownText}>{"I don't know this"}</Text></TouchableOpacity>
                </View>
              );
            })}
          </View>
          {Platform.OS === "web" ? <Text style={styles.keyboardHint}>Keys 1-3 choose  /  Shift + 1-3 replaces an unknown  /  R replaces the starting item</Text> : null}
        </Animated.View>
      </ScrollView>
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
            reason: gameRecommendationMilestone.pendingReward.reason,
          }}
          onRespond={(response) => gameRecommendationMilestone.respond(response, () => undefined)}
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

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#06172a" },
  startContent: { flexGrow: 1, alignItems: "center", padding: 24, paddingBottom: 48 },
  backButton: { minHeight: 44, justifyContent: "center", alignSelf: "flex-start" },
  backText: { color: "#b8c8dc", fontSize: 16, fontWeight: "800" },
  eyebrow: { color: "#fbbf24", fontWeight: "900", letterSpacing: 2.2, marginTop: 20 },
  startTitle: { color: "#f8fafc", fontSize: 38, lineHeight: 44, fontWeight: "900", textAlign: "center", maxWidth: 760, marginTop: 14 },
  startSubtitle: { color: "#9fb2ca", fontSize: 22, fontWeight: "700", marginTop: 12, marginBottom: 28 },
  ageBandControl: { flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: 8, marginTop: 18 },
  ageBandControlCompact: { marginTop: 12 },
  ageBandButton: { minHeight: 44, justifyContent: "center", paddingHorizontal: 15, borderWidth: 1, borderColor: "#3a5875", borderRadius: 999, backgroundColor: "#0a1d33" },
  ageBandButtonCompact: { minHeight: 36, paddingHorizontal: 12 },
  ageBandButtonSelected: { borderColor: "#fbbf24", backgroundColor: "#4a3510" },
  ageBandText: { color: "#b8c8dc", fontSize: 13, fontWeight: "900" },
  ageBandTextSelected: { color: "#fde68a" },
  sourceGrid: { width: "100%", maxWidth: 900, flexDirection: "row", flexWrap: "wrap", gap: 14, justifyContent: "center" },
  sourceCard: { width: 205, minHeight: 170, borderWidth: 2, borderRadius: 24, backgroundColor: "#0d233d", padding: 20, alignItems: "center", justifyContent: "center" },
  sourceCardDisabled: { opacity: 0.42 },
  sourceIcon: { fontSize: 42 }, sourceLabel: { color: "#f8fafc", fontWeight: "900", fontSize: 21, marginTop: 10 }, sourceArrow: { fontWeight: "900", marginTop: 14, letterSpacing: 1.4 },
  gameContent: { flexGrow: 1, width: "100%", maxWidth: 1180, alignSelf: "center", padding: 18, paddingBottom: 44 },
  topBar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  roundMeta: { alignItems: "flex-end", gap: 3 },
  logo: { color: "#f8fafc", fontWeight: "900", fontSize: 23, letterSpacing: 1 }, logoAccent: { color: "#fbbf24" }, roundLabel: { color: "#7890ad", fontSize: 12, fontWeight: "900", letterSpacing: 1.5 },
  roundSurface: { marginTop: 14, padding: 10, borderRadius: 26, borderWidth: 2 },
  likeRoundSurface: { backgroundColor: "#071f25", borderColor: "#247d68" },
  dislikeRoundSurface: { backgroundColor: "#25111b", borderColor: "#a83d57" },
  roundModeBanner: { borderRadius: 18, borderWidth: 3, padding: 14, alignItems: "center" }, likeRoundBanner: { backgroundColor: "#0b4138", borderColor: "#5ee1b7" }, dislikeRoundBanner: { backgroundColor: "#5a1629", borderColor: "#fb7185" }, roundModeLabel: { color: "#a7f3d0", fontSize: 21, fontWeight: "900", letterSpacing: 2 }, dislikeRoundLabel: { color: "#ffe4e6" }, roundModeInstruction: { color: "#ecfdf5", fontSize: 19, fontWeight: "900", marginTop: 4 }, dislikeRoundInstruction: { color: "#fff1f2" },
  scorePanel: { marginTop: 12, padding: 14, backgroundColor: "#0b213a", borderRadius: 18, borderWidth: 1, borderColor: "#214566" },
  likeInsetPanel: { backgroundColor: "#0a292c", borderWidth: 1, borderColor: "#1c6658" },
  dislikeInsetPanel: { backgroundColor: "#301521", borderWidth: 1, borderColor: "#813047" },
  scoreRow: { flexDirection: "row", justifyContent: "space-between" }, scoreLabel: { color: "#d6e5f5", fontWeight: "900", fontSize: 16 }, scoreValue: { color: "#fbbf24", fontWeight: "900", fontSize: 18 },
  progressTrack: { height: 9, borderRadius: 9, backgroundColor: "#183651", marginTop: 10, overflow: "hidden" }, progressFill: { height: "100%", backgroundColor: "#fbbf24", borderRadius: 9 }, progressHint: { color: "#7890ad", fontSize: 12, marginTop: 7 },
  contextPanel: { marginTop: 14, padding: 14, borderRadius: 18, backgroundColor: "#0a1d33", gap: 9 }, contextLine: { flexDirection: "row", flexWrap: "wrap", gap: 10 }, contextLabel: { color: "#54d68b", fontSize: 11, fontWeight: "900", letterSpacing: 1.2 }, negativeLabel: { color: "#fb7185" }, contextText: { color: "#d6e5f5", flexShrink: 1 },
  anchorPanel: { marginTop: 14, padding: 14, borderRadius: 18, backgroundColor: "#0a1d33" }, anchorRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12, marginTop: 6 }, anchorTitle: { color: "#f8fafc", fontWeight: "900", fontSize: 19, flex: 1 }, unknownAnchor: { minHeight: 44, paddingHorizontal: 12, justifyContent: "center" },
  prompt: { fontSize: 28, lineHeight: 34, fontWeight: "900", textAlign: "center", marginVertical: 20 }, likePrompt: { color: "#86efcc" }, dislikePrompt: { color: "#fda4af" }, crossMedia: { color: "#67e8f9", textAlign: "center", fontSize: 12, fontWeight: "900", letterSpacing: 1.2, marginTop: -12, marginBottom: 14 },
  candidateRow: { flexDirection: "row", gap: 14, alignItems: "stretch" }, candidateColumn: { flexDirection: "column" }, candidateShell: { flex: 1, minWidth: 0 }, candidateShellCompact: { width: "100%", flex: 0 },
  candidateCard: { flex: 1, minHeight: 390, borderWidth: 3, borderRadius: 22, backgroundColor: "#0d2540", overflow: "hidden" },
  candidateCardLike: { borderColor: "#36b98f" },
  candidateCardDislike: { borderColor: "#d15370" },
  candidateCardLikeSelected: { borderColor: "#86efcc", backgroundColor: "#104438" },
  candidateCardDislikeSelected: { borderColor: "#fda4af", backgroundColor: "#561a2d" },
  keyHint: { position: "absolute", zIndex: 2, top: 10, left: 10, color: "#06172a", width: 30, height: 30, borderRadius: 15, textAlign: "center", lineHeight: 30, fontWeight: "900", borderWidth: 2 },
  keyHintLike: { backgroundColor: "#86efcc", borderColor: "#d1fae5" },
  keyHintDislike: { backgroundColor: "#fda4af", borderColor: "#ffe4e6" },
  selectionBadge: { position: "absolute", zIndex: 3, top: 10, right: 10, minHeight: 30, justifyContent: "center", paddingHorizontal: 12, borderRadius: 999, borderWidth: 2 },
  selectionBadgeLike: { backgroundColor: "#0f765c", borderColor: "#a7f3d0" },
  selectionBadgeDislike: { backgroundColor: "#9f294a", borderColor: "#fecdd3" },
  selectionBadgeText: { color: "#fff", fontSize: 12, fontWeight: "900", letterSpacing: 1 },
  artwork: { width: "100%", height: 230, backgroundColor: "#102943" }, artworkLoading: { alignItems: "center", justifyContent: "center", gap: 10 }, artworkStatus: { color: "#91a7c0", fontWeight: "800" }, artworkFallback: { alignItems: "center", justifyContent: "center" }, artworkIcon: { fontSize: 62 }, artworkSource: { color: "#fff", fontSize: 12, fontWeight: "900", letterSpacing: 1.6, marginTop: 8 },
  candidateCopy: { padding: 15 }, mediaPill: { fontSize: 11, fontWeight: "900", letterSpacing: 1.3 }, candidateTitle: { color: "#f8fafc", fontSize: 21, lineHeight: 25, fontWeight: "900", marginTop: 7 }, candidateCreator: { color: "#91a7c0", marginTop: 7, fontWeight: "700" },
  undoButton: { minHeight: 44, alignSelf: "center", justifyContent: "center", paddingHorizontal: 16, marginTop: 10, borderWidth: 1, borderColor: "#7890ad", borderRadius: 999 }, undoText: { color: "#d6e5f5", fontWeight: "900" },
  unknownCandidate: { minHeight: 48, alignItems: "center", justifyContent: "center", marginTop: 7 }, unknownText: { color: "#9fb2ca", fontWeight: "800", fontSize: 13 }, keyboardHint: { color: "#657e9c", textAlign: "center", marginTop: 18, fontSize: 12 },
  persistenceNotice: { color: "#fde68a", backgroundColor: "#422006", borderColor: "#a16207", borderWidth: 1, borderRadius: 10, padding: 10, textAlign: "center", fontWeight: "800", marginVertical: 8 },
  hintBackdrop: { flex: 1, backgroundColor: "rgba(3, 10, 20, 0.86)", alignItems: "center", justifyContent: "center", padding: 24 }, hintCard: { width: "100%", maxWidth: 480, borderRadius: 24, borderWidth: 3, borderColor: "#fb7185", backgroundColor: "#3b1220", padding: 26, alignItems: "center" }, hintEyebrow: { color: "#fecdd3", fontSize: 14, fontWeight: "900", letterSpacing: 2 }, hintTitle: { color: "#fff", fontSize: 28, lineHeight: 34, fontWeight: "900", textAlign: "center", marginTop: 10 }, hintCopy: { color: "#ffe4e6", fontSize: 17, lineHeight: 24, textAlign: "center", marginTop: 10 }, hintButton: { minHeight: 52, marginTop: 22, borderRadius: 999, backgroundColor: "#fb7185", paddingHorizontal: 22, justifyContent: "center" }, hintButtonText: { color: "#310b16", fontWeight: "900", fontSize: 16 },
  flash: { position: "absolute", top: "42%", alignSelf: "center", borderRadius: 999, borderWidth: 3, paddingVertical: 16, paddingHorizontal: 28 }, flashLike: { backgroundColor: "#5ee1b7", borderColor: "#d1fae5" }, flashDislike: { backgroundColor: "#be3458", borderColor: "#fecdd3" }, flashText: { color: "#06241d", fontWeight: "900", fontSize: 20 }, flashTextDislike: { color: "#fff1f2" },
  unlockContent: { flexGrow: 1, alignItems: "center", justifyContent: "center", padding: 24 }, unlockIcon: { color: "#fbbf24", fontSize: 70 }, unlockTitle: { color: "#f8fafc", fontSize: 38, fontWeight: "900", textAlign: "center" }, unlockSubtitle: { color: "#9fb2ca", fontSize: 18, lineHeight: 25, textAlign: "center", maxWidth: 650, marginTop: 12 }, unlockOptions: { flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: 14, marginTop: 28 }, unlockCard: { width: 190, minHeight: 155, borderWidth: 2, borderRadius: 22, backgroundColor: "#0d233d", alignItems: "center", justifyContent: "center" }, continueButton: { minHeight: 48, justifyContent: "center", marginTop: 25, paddingHorizontal: 18 }, continueText: { color: "#b8c8dc", fontWeight: "800" },
});
