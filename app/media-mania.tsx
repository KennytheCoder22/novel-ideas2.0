import { useEffect, useMemo, useRef, useState } from "react";
import { router, useLocalSearchParams } from "expo-router";
import { ActivityIndicator, Image, Modal, Platform, SafeAreaView, ScrollView, StyleSheet, Text, TouchableOpacity, useWindowDimensions, View } from "react-native";
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
  resolveMediaManiaUnlock,
  startMediaMania,
  undoLastMediaManiaChoice,
  type MediaManiaAgeBand,
  type MediaManiaCatalogItem,
  type MediaManiaEvent,
  type MediaManiaSource,
  type MediaManiaState,
} from "../features/recommendation-games/media-mania/mediaManiaCore.mjs";
import { createMediaManiaSessionId, loadMediaManiaSave, saveMediaMania } from "../features/recommendation-games/media-mania/mediaManiaPersistence";
import { initialMediaManiaArtworkCandidates, resolveMediaManiaArtwork, type MediaManiaArtworkCandidate } from "../features/recommendation-games/media-mania/mediaManiaArtwork";
import { getSwipeCardFallbackImage } from "../assets/swipeCardFallback";

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
  const { width } = useWindowDimensions();
  const compact = width < 760;
  const [state, setState] = useState<MediaManiaState | null>(null);
  const [events, setEvents] = useState<MediaManiaEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [locked, setLocked] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);
  const [firstDislikeHintSeen, setFirstDislikeHintSeen] = useState(false);
  const [showDislikeHint, setShowDislikeHint] = useState(false);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let cancelled = false;
    void loadMediaManiaSave(playerId, libraryId).then((saved) => {
      if (cancelled) return;
      if (saved) {
        setState(saved.state);
        setEvents(saved.events);
      } else {
        setState(createMediaManiaState({ playerId, sessionId: createMediaManiaSessionId(), ageBand: initialAgeBand }));
      }
      setLoading(false);
    });
    return () => {
      cancelled = true;
      if (flashTimer.current) clearTimeout(flashTimer.current);
    };
  }, [initialAgeBand, libraryId, playerId]);

  async function commit(result: { state: MediaManiaState; events: MediaManiaEvent[] }, delay = 0, message?: string) {
    const nextEvents = [...events, ...result.events];
    setEvents(nextEvents);
    await saveMediaMania(playerId, libraryId, result.state, nextEvents);
    if (!delay) {
      setState(result.state);
      return;
    }
    setFlash(message || "Taste captured!");
    flashTimer.current = setTimeout(() => {
      setState(result.state);
      setFlash(null);
      setLocked(false);
    }, delay);
  }

  function choose(candidateId: string) {
    if (!state || !state.currentRound || locked) return;
    setLocked(true);
    const result = chooseMediaManiaCandidate(state, candidateId, MEDIA_MANIA_CATALOG);
    const delta = Number(result.events[0]?.scoreDelta || 0);
    const message = state.currentRound.roundType === "DISLIKE" ? `Boundary found! +${delta}` : `Taste match! +${delta}`;
    void commit(result, 360, message);
  }

  function unknownCandidate(candidateId: string) {
    if (!state || locked) return;
    void commit(markMediaManiaCandidateUnknown(state, candidateId, MEDIA_MANIA_CATALOG));
  }

  function undoLastChoice() {
    if (!state?.lastChoiceUndo || locked) return;
    setLocked(true);
    void commit(undoLastMediaManiaChoice(state)).finally(() => setLocked(false));
  }

  function unknownBasis(basisId: string) {
    if (!state || locked) return;
    void commit(markMediaManiaBasisUnknown(state, basisId, MEDIA_MANIA_CATALOG));
  }

  function selectAgeBand(ageBand: MediaManiaAgeBand) {
    if (!state || locked || state.ageBand === ageBand) return;
    void commit(changeMediaManiaAgeBand(state, ageBand, MEDIA_MANIA_CATALOG));
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
        router.back();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  });

  const progress = Math.min(1, (state?.tasteScore || 0) / MEDIA_MANIA_UNLOCK_SCORE);
  const positiveTitles = useMemo(() => state?.positiveItemIds.slice(-2).map(titleFor) || [], [state?.positiveItemIds]);
  const negativeTitles = useMemo(() => state?.negativeItemIds.slice(-2).map(titleFor) || [], [state?.negativeItemIds]);
  const availableSources = useMemo(
    () => state ? availableMediaManiaSources(MEDIA_MANIA_CATALOG, state.ageBand) : [],
    [state?.ageBand],
  );

  if (loading || !state) {
    return <SafeAreaView style={styles.safe}><ActivityIndicator size="large" color="#fbbf24" /></SafeAreaView>;
  }

  if (!state.startingSource) {
    return (
      <SafeAreaView style={styles.safe}>
        <ScrollView contentContainerStyle={styles.startContent}>
          <TouchableOpacity accessibilityRole="button" accessibilityLabel="Back to NovelIdeas" onPress={() => router.back()} style={styles.backButton}><Text style={styles.backText}>{"< NovelIdeas"}</Text></TouchableOpacity>
          <Text style={styles.eyebrow}>RECOMMENDATION GAMES</Text>
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
                disabled={!availableSources.includes(source)}
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
          <TouchableOpacity accessibilityRole="button" accessibilityLabel="Back to NovelIdeas" onPress={() => router.back()} style={styles.backButton}><Text style={styles.backText}>{"< Back"}</Text></TouchableOpacity>
          <Text style={styles.logo}>MEDIA <Text style={styles.logoAccent}>MANIA</Text></Text>
          <View style={styles.roundMeta}>
            <Text style={styles.roundLabel}>{MEDIA_MANIA_AGE_BAND_LABELS[state.ageBand].toUpperCase()}</Text>
            <Text style={styles.roundLabel}>ROUND {round.roundNumber}</Text>
          </View>
        </View>
        <AgeBandControl ageBand={state.ageBand} onChange={selectAgeBand} compact />
        <View style={[styles.roundModeBanner, dislikeRound ? styles.dislikeRoundBanner : styles.likeRoundBanner]}>
          <Text style={[styles.roundModeLabel, dislikeRound && styles.dislikeRoundLabel]}>{dislikeRound ? "DISLIKE ROUND" : "LIKE ROUND"}</Text>
          <Text style={[styles.roundModeInstruction, dislikeRound && styles.dislikeRoundInstruction]}>{dislikeRound ? "Pick the one you'd skip" : "Pick the one that fits your taste"}</Text>
        </View>
        <View style={styles.scorePanel}>
          <View style={styles.scoreRow}><Text style={styles.scoreLabel}>Taste Score</Text><Text style={styles.scoreValue}>{state.tasteScore}{state.unlockStatus === "locked" ? ` / ${MEDIA_MANIA_UNLOCK_SCORE}` : " unlocked"}</Text></View>
          <View style={styles.progressTrack}><View testID="media-mania-unlock-progress" style={[styles.progressFill, { width: `${progress * 100}%` }]} /></View>
          <Text style={styles.progressHint}>{state.unlockStatus === "locked" ? `${Math.max(0, MEDIA_MANIA_UNLOCK_SCORE - state.tasteScore)} points to a new media unlock` : `${state.activeSources.length} media worlds active`}</Text>
          {state.lastChoiceUndo ? <TouchableOpacity accessibilityRole="button" style={styles.undoButton} onPress={undoLastChoice}><Text style={styles.undoText}>Undo last choice</Text></TouchableOpacity> : null}
        </View>

        {(positiveTitles.length || negativeTitles.length) ? (
          <View style={styles.contextPanel}>
            {positiveTitles.length ? <View style={styles.contextLine}><Text style={styles.contextLabel}>YOU LIKE</Text><Text style={styles.contextText}>{positiveTitles.join("  +  ")}</Text></View> : null}
            {negativeTitles.length ? <View style={styles.contextLine}><Text style={[styles.contextLabel, styles.negativeLabel]}>NOT FOR YOU</Text><Text style={styles.contextText}>{negativeTitles.join("   /   ")}</Text></View> : null}
          </View>
        ) : (
          <View style={styles.anchorPanel}>
            <Text style={styles.contextLabel}>STARTING WITH</Text>
            {round.basisItems.map((item) => <View key={item.id} style={styles.anchorRow}><Text style={styles.anchorTitle}>{item.title}</Text><TouchableOpacity accessibilityRole="button" onPress={() => unknownBasis(item.id)} style={styles.unknownAnchor}><Text style={styles.unknownText}>{"I don't know this"}</Text></TouchableOpacity></View>)}
          </View>
        )}

        <Text style={[styles.prompt, dislikeRound && styles.dislikePrompt]}>{dislikeRound ? "Pick the one you'd skip" : round.visiblePositiveContext.length ? "What fits your taste next?" : `If you like ${round.basisItems[0]?.title}, what else would you enjoy?`}</Text>
        {round.isCrossMedia ? <Text style={styles.crossMedia}>CROSS-MEDIA ROUND  +3 BONUS</Text> : null}

        <View style={[styles.candidateRow, compact && styles.candidateColumn]}>
          {round.candidates.map((candidate, candidateIndex) => (
            <View key={candidate.id} style={[styles.candidateShell, compact && styles.candidateShellCompact]}>
              <TouchableOpacity accessibilityRole="button" accessibilityLabel={`${dislikeRound ? "Not for me" : "Choose"} ${candidate.title}`} disabled={locked || showDislikeHint} onPress={() => choose(candidate.id)} style={[styles.candidateCard, dislikeRound && styles.candidateCardDislike]}>
                <Text style={styles.keyHint}>{candidateIndex + 1}</Text>
                <MediaArtwork item={candidate} />
                <View style={styles.candidateCopy}>
                  <Text style={[styles.mediaPill, { color: SOURCE_META[candidate.mediaSource].color }]}>{MEDIA_MANIA_SOURCE_LABELS[candidate.mediaSource].toUpperCase()}</Text>
                  <Text style={styles.candidateTitle} numberOfLines={3}>{candidate.title}</Text>
                  {candidate.creator ? <Text style={styles.candidateCreator} numberOfLines={1}>{candidate.creator}</Text> : null}
                </View>
              </TouchableOpacity>
              <TouchableOpacity accessibilityRole="button" accessibilityLabel={`I do not know ${candidate.title}`} disabled={locked || showDislikeHint} onPress={() => unknownCandidate(candidate.id)} style={styles.unknownCandidate}><Text style={styles.unknownText}>{"I don't know this"}</Text></TouchableOpacity>
            </View>
          ))}
        </View>
        {Platform.OS === "web" ? <Text style={styles.keyboardHint}>Keys 1-3 choose  /  Shift + 1-3 replaces an unknown  /  R replaces the starting item</Text> : null}
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
      {flash ? <View pointerEvents="none" style={styles.flash}><Text style={styles.flashText}>{flash}</Text></View> : null}
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
  roundModeBanner: { marginTop: 14, borderRadius: 18, borderWidth: 2, padding: 14, alignItems: "center" }, likeRoundBanner: { backgroundColor: "#0d2f2b", borderColor: "#2f9b74" }, dislikeRoundBanner: { backgroundColor: "#481524", borderColor: "#fb7185" }, roundModeLabel: { color: "#6ee7b7", fontSize: 18, fontWeight: "900", letterSpacing: 2 }, dislikeRoundLabel: { color: "#fecdd3", fontSize: 22 }, roundModeInstruction: { color: "#d1fae5", fontSize: 15, fontWeight: "800", marginTop: 4 }, dislikeRoundInstruction: { color: "#fff1f2", fontSize: 19 },
  scorePanel: { marginTop: 12, padding: 14, backgroundColor: "#0b213a", borderRadius: 18, borderWidth: 1, borderColor: "#214566" },
  scoreRow: { flexDirection: "row", justifyContent: "space-between" }, scoreLabel: { color: "#d6e5f5", fontWeight: "900", fontSize: 16 }, scoreValue: { color: "#fbbf24", fontWeight: "900", fontSize: 18 },
  progressTrack: { height: 9, borderRadius: 9, backgroundColor: "#183651", marginTop: 10, overflow: "hidden" }, progressFill: { height: "100%", backgroundColor: "#fbbf24", borderRadius: 9 }, progressHint: { color: "#7890ad", fontSize: 12, marginTop: 7 },
  contextPanel: { marginTop: 14, padding: 14, borderRadius: 18, backgroundColor: "#0a1d33", gap: 9 }, contextLine: { flexDirection: "row", flexWrap: "wrap", gap: 10 }, contextLabel: { color: "#54d68b", fontSize: 11, fontWeight: "900", letterSpacing: 1.2 }, negativeLabel: { color: "#fb7185" }, contextText: { color: "#d6e5f5", flexShrink: 1 },
  anchorPanel: { marginTop: 14, padding: 14, borderRadius: 18, backgroundColor: "#0a1d33" }, anchorRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12, marginTop: 6 }, anchorTitle: { color: "#f8fafc", fontWeight: "900", fontSize: 19, flex: 1 }, unknownAnchor: { minHeight: 44, paddingHorizontal: 12, justifyContent: "center" },
  prompt: { color: "#f8fafc", fontSize: 28, lineHeight: 34, fontWeight: "900", textAlign: "center", marginVertical: 20 }, dislikePrompt: { color: "#fda4af" }, crossMedia: { color: "#67e8f9", textAlign: "center", fontSize: 12, fontWeight: "900", letterSpacing: 1.2, marginTop: -12, marginBottom: 14 },
  candidateRow: { flexDirection: "row", gap: 14, alignItems: "stretch" }, candidateColumn: { flexDirection: "column" }, candidateShell: { flex: 1, minWidth: 0 }, candidateShellCompact: { width: "100%", flex: 0 },
  candidateCard: { flex: 1, minHeight: 390, borderWidth: 2, borderColor: "#2b5b82", borderRadius: 22, backgroundColor: "#0d2540", overflow: "hidden" }, candidateCardDislike: { borderColor: "#9f3c52" }, keyHint: { position: "absolute", zIndex: 2, top: 10, left: 10, color: "#06172a", backgroundColor: "#f8fafc", width: 28, height: 28, borderRadius: 14, textAlign: "center", lineHeight: 28, fontWeight: "900" },
  artwork: { width: "100%", height: 230, backgroundColor: "#102943" }, artworkLoading: { alignItems: "center", justifyContent: "center", gap: 10 }, artworkStatus: { color: "#91a7c0", fontWeight: "800" }, artworkFallback: { alignItems: "center", justifyContent: "center" }, artworkIcon: { fontSize: 62 }, artworkSource: { color: "#fff", fontSize: 12, fontWeight: "900", letterSpacing: 1.6, marginTop: 8 },
  candidateCopy: { padding: 15 }, mediaPill: { fontSize: 11, fontWeight: "900", letterSpacing: 1.3 }, candidateTitle: { color: "#f8fafc", fontSize: 21, lineHeight: 25, fontWeight: "900", marginTop: 7 }, candidateCreator: { color: "#91a7c0", marginTop: 7, fontWeight: "700" },
  undoButton: { minHeight: 44, alignSelf: "center", justifyContent: "center", paddingHorizontal: 16, marginTop: 10, borderWidth: 1, borderColor: "#7890ad", borderRadius: 999 }, undoText: { color: "#d6e5f5", fontWeight: "900" },
  unknownCandidate: { minHeight: 48, alignItems: "center", justifyContent: "center", marginTop: 7 }, unknownText: { color: "#9fb2ca", fontWeight: "800", fontSize: 13 }, keyboardHint: { color: "#657e9c", textAlign: "center", marginTop: 18, fontSize: 12 },
  hintBackdrop: { flex: 1, backgroundColor: "rgba(3, 10, 20, 0.86)", alignItems: "center", justifyContent: "center", padding: 24 }, hintCard: { width: "100%", maxWidth: 480, borderRadius: 24, borderWidth: 3, borderColor: "#fb7185", backgroundColor: "#3b1220", padding: 26, alignItems: "center" }, hintEyebrow: { color: "#fecdd3", fontSize: 14, fontWeight: "900", letterSpacing: 2 }, hintTitle: { color: "#fff", fontSize: 28, lineHeight: 34, fontWeight: "900", textAlign: "center", marginTop: 10 }, hintCopy: { color: "#ffe4e6", fontSize: 17, lineHeight: 24, textAlign: "center", marginTop: 10 }, hintButton: { minHeight: 52, marginTop: 22, borderRadius: 999, backgroundColor: "#fb7185", paddingHorizontal: 22, justifyContent: "center" }, hintButtonText: { color: "#310b16", fontWeight: "900", fontSize: 16 },
  flash: { position: "absolute", top: "42%", alignSelf: "center", backgroundColor: "#fbbf24", borderRadius: 999, paddingVertical: 16, paddingHorizontal: 28 }, flashText: { color: "#071629", fontWeight: "900", fontSize: 20 },
  unlockContent: { flexGrow: 1, alignItems: "center", justifyContent: "center", padding: 24 }, unlockIcon: { color: "#fbbf24", fontSize: 70 }, unlockTitle: { color: "#f8fafc", fontSize: 38, fontWeight: "900", textAlign: "center" }, unlockSubtitle: { color: "#9fb2ca", fontSize: 18, lineHeight: 25, textAlign: "center", maxWidth: 650, marginTop: 12 }, unlockOptions: { flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: 14, marginTop: 28 }, unlockCard: { width: 190, minHeight: 155, borderWidth: 2, borderRadius: 22, backgroundColor: "#0d233d", alignItems: "center", justifyContent: "center" }, continueButton: { minHeight: 48, justifyContent: "center", marginTop: 25, paddingHorizontal: 18 }, continueText: { color: "#b8c8dc", fontWeight: "800" },
});
