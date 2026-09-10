import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
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
import {
  isMediaManiaGameplayKeyboardBlocked,
  normalizeMediaManiaAgeBand,
  reconcileMediaManiaRouteAge,
} from "../features/recommendation-games/media-mania/mediaManiaUiGuards";

const SOURCE_META: Record<MediaManiaSource, {
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  code: string;
  color: string;
}> = {
  books: { icon: "book-open-page-variant-outline", code: "BK", color: "#9b6cff" },
  movies: { icon: "movie-open-outline", code: "MV", color: "#ff4d67" },
  tv: { icon: "television-classic", code: "TV", color: "#27d8ff" },
  games: { icon: "controller-classic-outline", code: "GM", color: "#35f29b" },
  youtube: { icon: "youtube", code: "YT", color: "#ff426d" },
  anime: { icon: "emoticon-excited-outline", code: "AN", color: "#ff58df" },
  podcasts: { icon: "microphone-outline", code: "PC", color: "#f8bd29" },
};

const catalogById = new Map(MEDIA_MANIA_CATALOG.map((item) => [item.id, item]));
const titleFor = (id: string) => catalogById.get(id)?.title || "Unknown title";
const durablePersistenceNotice = (error: string | null) =>
  error === "durable_endpoint_unavailable"
    ? "Gameplay is saved on this device."
    : "Gameplay is saved on this device; durable sync will retry.";
const mediaManiaAgeBandToV2 = (band: MediaManiaAgeBand): AgeBandV2 => (band === "adults" ? "adult" : band);
const MEDIA_MOTIFS: (keyof typeof MaterialCommunityIcons.glyphMap)[] = [
  "book-open-page-variant-outline",
  "movie-open-outline",
  "television-classic",
  "controller-classic-outline",
  "emoticon-excited-outline",
  "music-note",
  "microphone-outline",
];

function CinematicBackdrop({ vivid = false }: { vivid?: boolean }) {
  return (
    <View
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={styles.cinematicBackdrop}
    >
      <Image
        source={require("../assets/games/media-mania.webp")}
        resizeMode="cover"
        style={[styles.roomArtwork, vivid ? styles.roomArtworkVivid : styles.roomArtworkMuted]}
      />
      <View style={[styles.roomVeil, vivid && styles.roomVeilVivid]} />
      <View style={styles.ceilingGlow} />
      <View style={styles.floorGlow} />
    </View>
  );
}

function MediaManiaLogo({ large = false }: { large?: boolean }) {
  return (
    <View style={[styles.logoSign, large && styles.logoSignLarge]} accessibilityRole="header">
      <Text style={[styles.logoWord, large && styles.logoWordLarge]}>MEDIA</Text>
      <Text style={[styles.logoWord, styles.logoWordAccent, large && styles.logoWordLarge]}>MANIA</Text>
      {large ? <MaterialCommunityIcons name="play" size={34} color="#c9fbff" style={styles.logoPlay} /> : null}
    </View>
  );
}

function NeonSideRail({ side }: { side: "left" | "right" }) {
  const left = side === "left";
  return (
    <View
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[styles.neonSideRail, left ? styles.neonSideRailLeft : styles.neonSideRailRight]}
    >
      <MaterialCommunityIcons name={left ? "heart-outline" : "arrow-left-bottom"} size={38} color={left ? "#ff48cf" : "#ff2c9c"} />
      <Text style={[styles.railCopy, left ? styles.railCopyPink : styles.railCopyBlue]}>
        {left ? "GOOD\nSTORIES\nIN ANY\nFORMAT" : "FIND\nWHAT\nMOVES\nYOU"}
      </Text>
      <MaterialCommunityIcons name={left ? "controller-classic-outline" : "headphones"} size={38} color={left ? "#20dfff" : "#fe436f"} />
    </View>
  );
}

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
      {failed
        ? <Text style={styles.artworkIcon}>!</Text>
        : <MaterialCommunityIcons name={meta.icon} size={62} color="#fff" />}
      <Text style={styles.artworkSource}>{failed ? "ARTWORK UNAVAILABLE" : "NO ARTWORK AVAILABLE"}</Text>
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
  const { width, height } = useWindowDimensions();
  const compact = width < 760;
  const portrait = width < 560;
  const shortViewport = height < 720;
  const [state, setState] = useState<MediaManiaState | null>(null);
  const [events, setEvents] = useState<MediaManiaEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [locked, setLocked] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);
  const [firstDislikeHintSeen, setFirstDislikeHintSeen] = useState(false);
  const [showDislikeHint, setShowDislikeHint] = useState(false);
  const [selectedCandidateId, setSelectedCandidateId] = useState<string | null>(null);
  const [entryDismissed, setEntryDismissed] = useState(false);
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
    return <SafeAreaView style={styles.safe}><CinematicBackdrop /><ActivityIndicator size="large" color="#27d8ff" /></SafeAreaView>;
  }

  if (!state.startingSource) {
    if (!entryDismissed) {
      return (
        <SafeAreaView style={styles.safe} testID="media-mania-entry">
          <CinematicBackdrop vivid />
          <ScrollView contentContainerStyle={[styles.entryContent, shortViewport && styles.entryContentShort]}>
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel="Back to Games"
              onPress={() => void exitGame()}
              style={styles.backButton}
            >
              <MaterialCommunityIcons name="arrow-left" size={20} color="#d6e8ff" />
              <Text style={styles.backText}>Games</Text>
            </TouchableOpacity>
            <View
              pointerEvents="none"
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants"
              style={styles.motifRow}
            >
              {MEDIA_MOTIFS.map((icon, index) => (
                <View key={icon} style={[styles.motifOrb, { borderColor: index % 2 ? "#ff3fbe" : "#26dbff" }]}>
                  <MaterialCommunityIcons name={icon} size={portrait ? 19 : 24} color={index % 2 ? "#ff7bd8" : "#75efff"} />
                </View>
              ))}
            </View>
            <View style={styles.entryHero}>
              <MediaManiaLogo large />
              <Text style={styles.entryTitle}>Build your taste lineup.</Text>
              <Text style={styles.entrySubtitle}>Make quick picks across books, movies, TV, games, anime, music, podcasts, and more.</Text>
              {persistenceNotice ? <Text accessibilityRole="alert" style={styles.persistenceNotice}>{persistenceNotice}</Text> : null}
              <Text style={styles.entryPrompt}>Choose your age band</Text>
              <AgeBandControl ageBand={state.ageBand} onChange={selectAgeBand} />
              <TouchableOpacity
                accessibilityRole="button"
                accessibilityLabel="Enter Media Mania and choose a medium"
                disabled={locked}
                onPress={() => setEntryDismissed(true)}
                style={styles.entryPlayButton}
              >
                <MaterialCommunityIcons name="play" size={25} color="#04131f" />
                <Text style={styles.entryPlayText}>BUILD MY LINEUP</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </SafeAreaView>
      );
    }

    return (
      <SafeAreaView style={styles.safe} testID="media-mania-lobby">
        <CinematicBackdrop />
        {!compact ? <><NeonSideRail side="left" /><NeonSideRail side="right" /></> : null}
        <ScrollView contentContainerStyle={styles.startContent}>
          <TouchableOpacity accessibilityRole="button" accessibilityLabel="Back to NovelIdeas" onPress={() => void exitGame()} style={styles.backButton}>
            <MaterialCommunityIcons name="arrow-left" size={20} color="#d6e8ff" />
            <Text style={styles.backText}>NovelIdeas</Text>
          </TouchableOpacity>
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
                style={[
                  styles.sourceCard,
                  compact && styles.sourceCardCompact,
                  portrait && styles.sourceCardPortrait,
                  { borderColor: SOURCE_META[source].color, shadowColor: SOURCE_META[source].color },
                  !availableSources.includes(source) && styles.sourceCardDisabled,
                ]}
                onPress={() => void commit(startMediaMania(state, source, MEDIA_MANIA_CATALOG))}
              >
                <MaterialCommunityIcons name={SOURCE_META[source].icon} size={42} color={SOURCE_META[source].color} />
                <Text style={[styles.sourceCode, { color: SOURCE_META[source].color }]}>{SOURCE_META[source].code}</Text>
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
        <CinematicBackdrop />
        <ScrollView contentContainerStyle={styles.unlockContent}>
          <View style={styles.unlockIcon}><MaterialCommunityIcons name="plus" size={54} color="#04131f" /></View>
          {persistenceNotice ? <Text accessibilityRole="alert" style={styles.persistenceNotice}>{persistenceNotice}</Text> : null}
          <Text style={styles.unlockTitle}>New media unlocked!</Text>
          <Text style={styles.unlockSubtitle}>Choose a new world to mix into your taste - or keep playing your current one.</Text>
          <AgeBandControl ageBand={state.ageBand} onChange={selectAgeBand} compact />
          {state.lastChoiceUndo ? <TouchableOpacity accessibilityRole="button" style={styles.undoButton} onPress={undoLastChoice}><Text style={styles.undoText}>Undo last choice</Text></TouchableOpacity> : null}
          <View style={styles.unlockOptions}>
            {state.unlockOptions.map((source) => (
              <TouchableOpacity
                key={source}
                accessibilityRole="button"
                accessibilityLabel={`Add ${MEDIA_MANIA_SOURCE_LABELS[source]} to this game`}
                style={[styles.unlockCard, { borderColor: SOURCE_META[source].color }]}
                onPress={() => void commit(resolveMediaManiaUnlock(state, source, MEDIA_MANIA_CATALOG))}
              >
                <MaterialCommunityIcons name={SOURCE_META[source].icon} size={46} color={SOURCE_META[source].color} />
                <Text style={styles.sourceLabel}>{MEDIA_MANIA_SOURCE_LABELS[source]}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel={`Keep playing ${MEDIA_MANIA_SOURCE_LABELS[state.startingSource]}`}
            style={styles.continueButton}
            onPress={() => void commit(resolveMediaManiaUnlock(state, null, MEDIA_MANIA_CATALOG))}
          >
            <Text style={styles.continueText}>Keep playing {MEDIA_MANIA_SOURCE_LABELS[state.startingSource]}</Text>
          </TouchableOpacity>
        </ScrollView>
      </SafeAreaView>
    );
  }

  const round = state.currentRound;
  if (!round) return <SafeAreaView style={styles.safe}><ActivityIndicator color="#fbbf24" /></SafeAreaView>;
  const dislikeRound = round.roundType === "DISLIKE";

  return (
    <SafeAreaView style={styles.safe} testID="media-mania-gameplay">
      <CinematicBackdrop />
      {!compact ? <><NeonSideRail side="left" /><NeonSideRail side="right" /></> : null}
      <ScrollView contentContainerStyle={styles.gameContent} keyboardShouldPersistTaps="handled">
        <View style={styles.topBar}>
          <TouchableOpacity accessibilityRole="button" accessibilityLabel="Back to NovelIdeas" onPress={() => void exitGame()} style={styles.backButton}>
            <MaterialCommunityIcons name="arrow-left" size={20} color="#d6e8ff" />
            <Text style={styles.backText}>Back</Text>
          </TouchableOpacity>
          <MediaManiaLogo />
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
            description: gameRecommendationMilestone.pendingReward.description,
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
  safe: { flex: 1, backgroundColor: "#020817" },
  cinematicBackdrop: { position: "absolute", top: 0, right: 0, bottom: 0, left: 0, overflow: "hidden" },
  roomArtwork: { position: "absolute", top: 0, right: 0, bottom: 0, left: 0, width: "100%", height: "100%" },
  roomArtworkVivid: { opacity: 0.78 },
  roomArtworkMuted: { opacity: 0.24 },
  roomVeil: { position: "absolute", top: 0, right: 0, bottom: 0, left: 0, backgroundColor: "rgba(1, 8, 24, 0.72)" },
  roomVeilVivid: { backgroundColor: "rgba(1, 5, 18, 0.45)" },
  ceilingGlow: { position: "absolute", top: -80, left: "20%", width: "60%", height: 150, borderRadius: 120, backgroundColor: "rgba(30, 218, 255, 0.18)" },
  floorGlow: { position: "absolute", bottom: -110, left: "18%", width: "64%", height: 190, borderRadius: 160, backgroundColor: "rgba(255, 36, 190, 0.16)" },
  entryContent: { flexGrow: 1, justifyContent: "space-between", alignItems: "center", padding: 24, paddingBottom: 34, zIndex: 1 },
  entryContentShort: { paddingTop: 12, paddingBottom: 18 },
  entryHero: { width: "100%", maxWidth: 720, alignItems: "center", padding: 22, borderRadius: 30, borderWidth: 1, borderColor: "rgba(66, 228, 255, 0.62)", backgroundColor: "rgba(2, 10, 29, 0.84)" },
  entryTitle: { color: "#ffffff", fontSize: 28, lineHeight: 34, fontWeight: "900", textAlign: "center", marginTop: 17, textShadowColor: "#ff29c3", textShadowRadius: 12 },
  entrySubtitle: { color: "#c8ddf5", fontSize: 16, lineHeight: 23, fontWeight: "700", textAlign: "center", maxWidth: 590, marginTop: 7 },
  entryPrompt: { color: "#8ceeff", fontSize: 13, fontWeight: "900", letterSpacing: 1.8, marginTop: 18, textTransform: "uppercase" },
  entryPlayButton: { minHeight: 52, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 9, marginTop: 22, paddingHorizontal: 26, borderRadius: 12, borderWidth: 2, borderColor: "#d1fbff", backgroundColor: "#32e0ff", shadowColor: "#26d9ff", shadowOpacity: 0.9, shadowRadius: 16, shadowOffset: { width: 0, height: 0 }, elevation: 8 },
  entryPlayText: { color: "#04131f", fontSize: 15, fontWeight: "900", letterSpacing: 1.4 },
  motifRow: { width: "100%", maxWidth: 760, flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: 12, marginVertical: 14 },
  motifOrb: { width: 48, height: 48, alignItems: "center", justifyContent: "center", borderRadius: 14, borderWidth: 2, backgroundColor: "rgba(3, 13, 34, 0.82)" },
  logoSign: { minWidth: 154, alignItems: "center", paddingVertical: 6, paddingHorizontal: 18, borderRadius: 10, borderWidth: 2, borderColor: "#31dcff", backgroundColor: "rgba(2, 9, 29, 0.94)", shadowColor: "#25dcff", shadowOpacity: 0.95, shadowRadius: 12, shadowOffset: { width: 0, height: 0 }, elevation: 8 },
  logoSignLarge: { minWidth: 250, paddingVertical: 12, paddingHorizontal: 34, borderWidth: 3, borderRadius: 16 },
  logoWord: { color: "#8af3ff", fontSize: 17, lineHeight: 19, fontWeight: "900", letterSpacing: 2, textShadowColor: "#12dfff", textShadowRadius: 7 },
  logoWordLarge: { fontSize: 34, lineHeight: 37, letterSpacing: 3.5 },
  logoWordAccent: { color: "#ff65d4", textShadowColor: "#ff22b9" },
  logoPlay: { marginTop: 6, textShadowColor: "#24ddff", textShadowRadius: 10 },
  startContent: { flexGrow: 1, alignItems: "center", padding: 20, paddingHorizontal: 64, paddingBottom: 42, zIndex: 1 },
  backButton: { minHeight: 44, flexDirection: "row", alignItems: "center", gap: 7, justifyContent: "center", alignSelf: "flex-start", paddingHorizontal: 8, borderRadius: 8 },
  backText: { color: "#d6e8ff", fontSize: 15, fontWeight: "900" },
  eyebrow: { color: "#f7c926", fontSize: 12, fontWeight: "900", letterSpacing: 2.2, marginTop: 2 },
  startTitle: { color: "#ffffff", fontSize: 32, lineHeight: 38, fontWeight: "900", textAlign: "center", maxWidth: 760, marginTop: 8, textShadowColor: "#147eff", textShadowRadius: 10 },
  startSubtitle: { color: "#c9ddf3", fontSize: 17, fontWeight: "800", marginTop: 10, marginBottom: 18 },
  ageBandControl: { flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: 8, marginTop: 12 },
  ageBandControlCompact: { marginTop: 9 },
  ageBandButton: { minHeight: 44, justifyContent: "center", paddingHorizontal: 15, borderWidth: 1, borderColor: "#315b80", borderRadius: 999, backgroundColor: "rgba(5, 21, 48, 0.92)" },
  ageBandButtonCompact: { minHeight: 44, paddingHorizontal: 12 },
  ageBandButtonSelected: { borderColor: "#ffe04c", backgroundColor: "#55410c", shadowColor: "#ffd92b", shadowOpacity: 0.85, shadowRadius: 8, shadowOffset: { width: 0, height: 0 }, elevation: 5 },
  ageBandText: { color: "#bed2e9", fontSize: 12, fontWeight: "900" },
  ageBandTextSelected: { color: "#fff49a" },
  sourceGrid: { width: "100%", maxWidth: 940, flexDirection: "row", flexWrap: "wrap", gap: 12, justifyContent: "center" },
  sourceCard: { width: 205, minHeight: 156, borderWidth: 2, borderRadius: 13, backgroundColor: "rgba(4, 17, 39, 0.94)", padding: 14, alignItems: "center", justifyContent: "center", shadowOpacity: 0.42, shadowRadius: 10, shadowOffset: { width: 0, height: 0 }, elevation: 5 },
  sourceCardCompact: { width: "46%", minWidth: 145 },
  sourceCardPortrait: { width: "100%", minHeight: 132 },
  sourceCardDisabled: { opacity: 0.37, borderColor: "#425467", shadowOpacity: 0 },
  sourceCode: { fontSize: 12, fontWeight: "900", letterSpacing: 1.6, marginTop: 3 },
  sourceLabel: { color: "#ffffff", fontWeight: "900", fontSize: 18, marginTop: 2 },
  sourceArrow: { fontSize: 11, fontWeight: "900", marginTop: 8, letterSpacing: 1.2 },
  neonSideRail: { position: "absolute", zIndex: 1, top: "20%", width: 116, alignItems: "center", gap: 14, opacity: 0.88 },
  neonSideRailLeft: { left: 10 },
  neonSideRailRight: { right: 10 },
  railCopy: { textAlign: "center", fontSize: 18, lineHeight: 24, fontWeight: "900", letterSpacing: 1.2 },
  railCopyPink: { color: "#ff67d5", textShadowColor: "#ff16ae", textShadowRadius: 9 },
  railCopyBlue: { color: "#62eaff", textShadowColor: "#16d9ff", textShadowRadius: 9 },
  gameContent: { flexGrow: 1, width: "100%", maxWidth: 1040, alignSelf: "center", padding: 14, paddingBottom: 36, zIndex: 2 },
  topBar: { minHeight: 58, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  roundMeta: { alignItems: "flex-end", gap: 2 },
  roundLabel: { color: "#b6cce3", fontSize: 11, fontWeight: "900", letterSpacing: 1.4 },
  roundSurface: { marginTop: 9, padding: 10, borderRadius: 15, borderWidth: 2, shadowOpacity: 0.36, shadowRadius: 14, shadowOffset: { width: 0, height: 0 }, elevation: 6 },
  likeRoundSurface: { backgroundColor: "rgba(2, 28, 37, 0.96)", borderColor: "#1d806e", shadowColor: "#24e6c2" },
  dislikeRoundSurface: { backgroundColor: "rgba(39, 9, 28, 0.96)", borderColor: "#ad315b", shadowColor: "#ff3e86" },
  roundModeBanner: { borderRadius: 10, borderWidth: 1, padding: 8, alignItems: "center" },
  likeRoundBanner: { backgroundColor: "#063f3b", borderColor: "#36caaa" },
  dislikeRoundBanner: { backgroundColor: "#5d1534", borderColor: "#f35c8a" },
  roundModeLabel: { color: "#fff16a", fontSize: 15, fontWeight: "900", letterSpacing: 2 },
  dislikeRoundLabel: { color: "#ffd0df" },
  roundModeInstruction: { color: "#ffffff", fontSize: 14, fontWeight: "900", marginTop: 2 },
  dislikeRoundInstruction: { color: "#fff1f5" },
  scorePanel: { marginTop: 8, padding: 10, borderRadius: 10, borderWidth: 1 },
  likeInsetPanel: { backgroundColor: "#062f34", borderColor: "#17685e" },
  dislikeInsetPanel: { backgroundColor: "#3c1428", borderColor: "#80324f" },
  scoreRow: { flexDirection: "row", justifyContent: "space-between", gap: 12 },
  scoreLabel: { color: "#e2f3ff", fontWeight: "900", fontSize: 13 },
  scoreValue: { color: "#ffe143", fontWeight: "900", fontSize: 14 },
  progressTrack: { height: 8, borderRadius: 9, backgroundColor: "#113454", marginTop: 7, overflow: "hidden" },
  progressFill: { height: "100%", backgroundColor: "#72ef9a", borderRadius: 9 },
  progressHint: { color: "#9cb9d2", fontSize: 11, marginTop: 5 },
  contextPanel: { marginTop: 8, padding: 10, borderRadius: 10, gap: 6 },
  contextLine: { flexDirection: "row", flexWrap: "wrap", gap: 9 },
  contextLabel: { color: "#65f2ac", fontSize: 10, fontWeight: "900", letterSpacing: 1.2 },
  negativeLabel: { color: "#ff719e" },
  contextText: { color: "#e4f1ff", flexShrink: 1, fontSize: 12 },
  anchorPanel: { marginTop: 8, padding: 10, borderRadius: 10 },
  anchorRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12, marginTop: 4 },
  anchorTitle: { color: "#ffffff", fontWeight: "900", fontSize: 16, flex: 1 },
  unknownAnchor: { minHeight: 44, paddingHorizontal: 12, justifyContent: "center" },
  prompt: { fontSize: 24, lineHeight: 30, fontWeight: "900", textAlign: "center", marginVertical: 14 },
  likePrompt: { color: "#8ef9d6" },
  dislikePrompt: { color: "#ffabc5" },
  crossMedia: { color: "#69eaff", textAlign: "center", fontSize: 11, fontWeight: "900", letterSpacing: 1.2, marginTop: 10, marginBottom: 6 },
  candidateRow: { flexDirection: "row", gap: 10, alignItems: "stretch", marginTop: 10 },
  candidateColumn: { flexDirection: "column" },
  candidateShell: { flex: 1, minWidth: 0 },
  candidateShellCompact: { width: "100%", flex: 0 },
  candidateCard: { flex: 1, minHeight: 360, borderWidth: 2, borderRadius: 12, backgroundColor: "#062a43", overflow: "hidden" },
  candidateCardLike: { borderColor: "#35d3c0" },
  candidateCardDislike: { borderColor: "#ef5d88" },
  candidateCardLikeSelected: { borderColor: "#a2ffe7", backgroundColor: "#0c4a43" },
  candidateCardDislikeSelected: { borderColor: "#ffd0df", backgroundColor: "#5c1835" },
  keyHint: { position: "absolute", zIndex: 2, top: 8, left: 8, color: "#03121e", width: 28, height: 28, borderRadius: 14, textAlign: "center", lineHeight: 28, fontWeight: "900", borderWidth: 2 },
  keyHintLike: { backgroundColor: "#c7fff0", borderColor: "#ffffff" },
  keyHintDislike: { backgroundColor: "#ffd0df", borderColor: "#ffffff" },
  selectionBadge: { position: "absolute", zIndex: 3, top: 8, right: 8, minHeight: 30, justifyContent: "center", paddingHorizontal: 10, borderRadius: 999, borderWidth: 2 },
  selectionBadgeLike: { backgroundColor: "#08785f", borderColor: "#b5ffeb" },
  selectionBadgeDislike: { backgroundColor: "#a62755", borderColor: "#ffd0df" },
  selectionBadgeText: { color: "#fff", fontSize: 11, fontWeight: "900", letterSpacing: 1 },
  artwork: { width: "100%", height: 230, backgroundColor: "#0b2942" },
  artworkLoading: { alignItems: "center", justifyContent: "center", gap: 10 },
  artworkStatus: { color: "#a4bdd5", fontWeight: "800" },
  artworkFallback: { alignItems: "center", justifyContent: "center" },
  artworkIcon: { color: "#fff", fontSize: 62, fontWeight: "900" },
  artworkSource: { color: "#fff", fontSize: 11, fontWeight: "900", letterSpacing: 1.4, marginTop: 8 },
  candidateCopy: { padding: 12 },
  mediaPill: { fontSize: 10, fontWeight: "900", letterSpacing: 1.3 },
  candidateTitle: { color: "#ffffff", fontSize: 17, lineHeight: 21, fontWeight: "900", marginTop: 5 },
  candidateCreator: { color: "#aac0d6", marginTop: 5, fontSize: 12, fontWeight: "700" },
  undoButton: { minHeight: 44, alignSelf: "center", justifyContent: "center", paddingHorizontal: 16, marginTop: 7, borderWidth: 1, borderColor: "#7696b5", borderRadius: 999, backgroundColor: "rgba(2, 12, 29, 0.55)" },
  undoText: { color: "#dcecff", fontWeight: "900" },
  unknownCandidate: { minHeight: 48, alignItems: "center", justifyContent: "center", marginTop: 3 },
  unknownText: { color: "#b9cee1", fontWeight: "800", fontSize: 12, textDecorationLine: "underline" },
  keyboardHint: { color: "#8aa8c4", textAlign: "center", marginTop: 12, fontSize: 11 },
  persistenceNotice: { color: "#fff0a2", backgroundColor: "rgba(83, 52, 4, 0.92)", borderColor: "#d69c17", borderWidth: 1, borderRadius: 10, padding: 9, textAlign: "center", fontWeight: "800", marginVertical: 7 },
  hintBackdrop: { flex: 1, backgroundColor: "rgba(1, 5, 18, 0.91)", alignItems: "center", justifyContent: "center", padding: 24 },
  hintCard: { width: "100%", maxWidth: 480, borderRadius: 20, borderWidth: 3, borderColor: "#ff5c92", backgroundColor: "#421126", padding: 26, alignItems: "center" },
  hintEyebrow: { color: "#ffc2d5", fontSize: 13, fontWeight: "900", letterSpacing: 2 },
  hintTitle: { color: "#fff", fontSize: 27, lineHeight: 33, fontWeight: "900", textAlign: "center", marginTop: 9 },
  hintCopy: { color: "#ffe7ef", fontSize: 16, lineHeight: 23, textAlign: "center", marginTop: 9 },
  hintButton: { minHeight: 52, marginTop: 21, borderRadius: 999, backgroundColor: "#ff6b9c", paddingHorizontal: 22, justifyContent: "center" },
  hintButtonText: { color: "#310817", fontWeight: "900", fontSize: 15 },
  flash: { position: "absolute", zIndex: 5, top: "42%", alignSelf: "center", borderRadius: 999, borderWidth: 3, paddingVertical: 16, paddingHorizontal: 28 },
  flashLike: { backgroundColor: "#5ee1b7", borderColor: "#d1fae5" },
  flashDislike: { backgroundColor: "#c52f61", borderColor: "#ffd0df" },
  flashText: { color: "#06241d", fontWeight: "900", fontSize: 20 },
  flashTextDislike: { color: "#fff1f5" },
  unlockContent: { flexGrow: 1, alignItems: "center", justifyContent: "center", padding: 24, zIndex: 1 },
  unlockIcon: { width: 74, height: 74, alignItems: "center", justifyContent: "center", borderRadius: 37, backgroundColor: "#ffdd3f", borderWidth: 3, borderColor: "#fff3a0", shadowColor: "#ffdd3f", shadowOpacity: 0.9, shadowRadius: 18, shadowOffset: { width: 0, height: 0 }, elevation: 8 },
  unlockTitle: { color: "#ffffff", fontSize: 38, fontWeight: "900", textAlign: "center", marginTop: 14, textShadowColor: "#ff2dbd", textShadowRadius: 12 },
  unlockSubtitle: { color: "#c1d6eb", fontSize: 18, lineHeight: 25, textAlign: "center", maxWidth: 650, marginTop: 10 },
  unlockOptions: { flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: 14, marginTop: 24 },
  unlockCard: { width: 190, minHeight: 155, borderWidth: 2, borderRadius: 15, backgroundColor: "rgba(4, 17, 39, 0.95)", alignItems: "center", justifyContent: "center" },
  continueButton: { minHeight: 48, justifyContent: "center", marginTop: 22, paddingHorizontal: 18 },
  continueText: { color: "#d1e3f5", fontWeight: "900" },
});
