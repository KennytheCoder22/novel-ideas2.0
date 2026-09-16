import AsyncStorage from "@react-native-async-storage/async-storage";
import { useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Image, Platform, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { runRecommenderV2 } from "../../../app/recommender-v2/engine";
import { useGameRecommendationMilestone } from "../../../hooks/useGameRecommendationMilestone";
import { parseGameRouteConfig, gameRouteConfigScope, gameRouteSourceFlagsToEnabledSources, buildGamesPortalRouteParams, type GameRouteParams } from "../../../lib/recommendationGames/gameRecommendationRouteConfig";
import { createMelaniesGameStorageInstanceId } from "../../../lib/recommendationGames/melaniesGamePersistence";
import { melanieArtworkPhase, type MelanieArtworkPhase } from "../../../lib/recommendationGames/melanieArtwork";
import { catalogStoriesWithDiagnostics, storyRoundCount, startStoryTournament, finishStoryRound, restoreStoryTournament, storySignals, type StoryBook, type StoryTournament } from "../../../lib/recommendationGames/melaniesRealBooks";

const MELANIE_ARTWORK: Record<MelanieArtworkPhase, { left: number; right: number }> = {
  opening: {
    left: require("../../../assets/games/melanies-game/opening-left.webp"),
    right: require("../../../assets/games/melanies-game/opening-right.webp"),
  },
  ranking: {
    left: require("../../../assets/games/melanies-game/ranking-left.webp"),
    right: require("../../../assets/games/melanies-game/ranking-right.webp"),
  },
  challenger: {
    left: require("../../../assets/games/melanies-game/challenger-left.webp"),
    right: require("../../../assets/games/melanies-game/challenger-right.webp"),
  },
  reveal: {
    left: require("../../../assets/games/melanies-game/reveal-left.webp"),
    right: require("../../../assets/games/melanies-game/reveal-right.webp"),
  },
};

function MelanieBackdrop({ phase, compact }: { phase: MelanieArtworkPhase; compact: boolean }) {
  const artwork = MELANIE_ARTWORK[phase];
  return (
    <View
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={styles.backdrop}
    >
      <Image source={artwork.left} resizeMode="cover" style={[styles.edgeArtwork, styles.edgeArtworkLeft, compact && styles.edgeArtworkMobile]} />
      {!compact ? <Image source={artwork.right} resizeMode="cover" style={[styles.edgeArtwork, styles.edgeArtworkRight]} /> : null}
      <View style={[styles.centerWash, compact && styles.centerWashMobile]} />
      <View style={styles.vignette} />
    </View>
  );
}

function Cover({ book, hidden = false }: { book: StoryBook; hidden?: boolean }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [book.coverUrl]);
  return <View style={[styles.cover, hidden && styles.blurredCover]} accessible={!hidden} accessibilityElementsHidden={hidden} importantForAccessibility={hidden ? "no-hide-descendants" : "auto"} accessibilityLabel={hidden ? undefined : `Cover of ${book.title}`}>
    {book.coverUrl && !failed ? <Image source={{ uri: book.coverUrl }} blurRadius={hidden ? 3 : 0} onError={() => setFailed(true)} style={[styles.coverImage, hidden && styles.defocusedImage]} accessible={false} /> : <View style={[styles.coverImage, { backgroundColor: "#899894" }]} />}
    {!hidden && (failed || !book.coverUrl) ? <Text style={styles.placeholder}>Cover unavailable</Text> : null}
  </View>;
}
function Action({ label, onPress, disabled = false }: { label: string; onPress: () => void; disabled?: boolean }) {
  return <Pressable accessibilityRole="button" disabled={disabled} onPress={onPress} style={[styles.action, disabled && { opacity: 0.45 }]}><Text style={styles.actionText}>{label}</Text></Pressable>;
}
function reportDescriptionDiagnostics(
  ageBand: string,
  stage: string,
  diagnostics: ReturnType<typeof catalogStoriesWithDiagnostics>["diagnostics"],
) {
  if (process.env.NODE_ENV === "production") return;
  console.info("[Melanie's Game] description quality", { ageBand, stage, ...diagnostics });
}
export default function RealStoryTournament() {
  const { width } = useWindowDimensions();
  const params = useLocalSearchParams() as GameRouteParams;
  const config = parseGameRouteConfig(params);
  const scope = gameRouteConfigScope(config);
  const instance = useMemo(() => createMelaniesGameStorageInstanceId(config.playerId,config.libraryId,config.ageBand), [config.playerId,config.libraryId,config.ageBand]);
  const storageKey = `melanie-real-stories-v1:${scope}:${instance || "device"}`;
  const [state, setState] = useState<StoryTournament | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [privacy, setPrivacy] = useState(false);
  const lock = useRef(false);
  const scroll = useRef<ScrollView>(null);
  const active = useRef(storageKey);
  active.current = storageKey;
  const visibleState = state?.scope === scope ? state : null;
  const integration = useGameRecommendationMilestone({ game: "melanies_game", gameLabel: "Melanie's Game", playerId: config.playerId, libraryId: config.libraryId, ageBand: config.ageBand, sourceFlags: config.sourceFlags, localCollectionOnly: config.localCollectionOnly, evidenceMode: "semantic_only", sessionScopedEvidence: true, gameSessionId: visibleState?.sessionId || "" });

  useEffect(() => {
    scroll.current?.scrollTo({ y: 0, animated: false });
  }, [visibleState?.phase, visibleState?.rounds.length]);

  useEffect(() => {
    if (Platform.OS === "web") document.title = "Melanie's Game — Story First";
    let cancelled = false;
    setLoading(true); setState(null); setError(""); lock.current = false; setBusy(false);
    const key = storageKey;
    void (async () => {
      try {
        const saved = restoreStoryTournament(await AsyncStorage.getItem(key), scope);
        if (saved && (!config.localCollectionOnly || saved.pool.every(b => b.source === "localLibrary"))) {
          if (!cancelled) setState(saved);
          return;
        }
        const sessionId = `real-stories-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,10)}`;
        const enabledSources = gameRouteSourceFlagsToEnabledSources(config.sourceFlags);
        const base = { ageBand: config.ageBand, libraryId: config.libraryId, limit: 150, diversitySeed: sessionId, enabledSources, localLibraryCurationTrusted: config.localCollectionOnly };
        const result = await runRecommenderV2({ ...base, signals: [] });
        if (cancelled) return;
        const candidates = [...result.items];
        let catalog = catalogStoriesWithDiagnostics(candidates, config.localCollectionOnly);
        reportDescriptionDiagnostics(config.ageBand, "initial", catalog.diagnostics);
        let pool = catalog.stories;
        // These are search probes only, never reader-preference evidence. Avoid repeatedly
        // querying an unavailable service (including Google Books quota failures).
        for (const source of result.diagnostics.sources) {
          if (source.status === "failed") enabledSources[source.source] = false;
        }
        if (!config.localCollectionOnly && pool.length < 12) {
          for (const genre of ["mystery", "science fiction", "fantasy", "adventure"]) {
            if (cancelled) return;
            const extra = await runRecommenderV2({ ...base, enabledSources, signals: [{ id: `catalog-probe-${genre}`, action: "like", weight: 1, genres: [genre], format: "book" }] }).catch(() => null);
            if (cancelled) return;
            if (extra) {
              candidates.push(...extra.items);
              for (const source of extra.diagnostics.sources) {
                if (source.status === "failed") enabledSources[source.source] = false;
              }
              catalog = catalogStoriesWithDiagnostics(candidates, false);
              reportDescriptionDiagnostics(config.ageBand, `expanded-${genre}`, catalog.diagnostics);
              pool = catalog.stories;
            }
            if (pool.length >= 12) break;
          }
        }
        const next = startStoryTournament(pool.slice(0,180), scope, sessionId);
        await AsyncStorage.setItem(key, JSON.stringify(next));
        if (!cancelled) setState(next);
      } catch (e) { if (!cancelled) setError(e instanceof Error ? e.message : "We couldn't load story descriptions. Please retry."); }
      finally { if (!cancelled) setLoading(false); }
    })();
    return () => { cancelled = true; };
  // storageKey includes every route-config value used by this load, including source flags and age.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey, attempt]);

  async function commit(next: StoryTournament, recordEvidence = false) {
    if (lock.current) return;
    lock.current = true; setBusy(true); setError("");
    const key = storageKey;
    try {
      await AsyncStorage.setItem(key, JSON.stringify(next));
      if (active.current !== key) return;
      setState(next);
      if (recordEvidence && !await integration.recordBookTournament(storySignals(next), next.phase === "reveal" ? next.selected : [])) {
        setError("Your tournament is saved. Use Save results below if your preferences have not finished syncing.");
      }
    } catch { if (active.current === key) setError("That change could not be saved. Please try again."); }
    finally { if (active.current === key) { lock.current = false; setBusy(false); } }
  }
  function toggle(id: string) {
    if (!visibleState || busy) return;
    const selected = visibleState.selected.includes(id) ? visibleState.selected.filter(value => value !== id) : [...visibleState.selected,id];
    if (selected.length <= 3) void commit({ ...visibleState, selected });
  }
  function move(index: number, step: number) {
    if (!visibleState || busy) return;
    const selected = [...visibleState.selected];
    [selected[index],selected[index+step]] = [selected[index+step],selected[index]];
    void commit({ ...visibleState, selected });
  }
  async function saveResults(preferredBookId: string | null) {
    if (!visibleState || lock.current) return;
    lock.current = true; setBusy(true); setError(""); const key = storageKey;
    try {
      if (!await integration.recordBookTournament(storySignals(visibleState),visibleState.selected)) throw new Error("Preferences are still loading. Please try saving again.");
      if (active.current !== key) return;
      const recommendations = visibleState.selected.map((id,index) => {
        const b = visibleState.pool.find(book => book.id === id)!;
        return { id:b.id, source:b.source, sourceId:b.sourceId, title:b.title, author:b.author, rank:index+1 };
      });
      const saved = await integration.submitFinalRecommendationFeedback({ recommendations, ranking: visibleState.selected, preferredBookId, shownAt: visibleState.shownAt! });
      if (!saved) throw new Error("Feedback could not be saved. Please try again.");
      const next = {...visibleState,feedbackSaved:true};
      await AsyncStorage.setItem(key,JSON.stringify(next));
      if (active.current === key) setState(next);
    } catch(e) { if (active.current === key) setError(e instanceof Error ? e.message : "Please retry saving."); }
    finally { if (active.current === key) {lock.current=false;setBusy(false);} }
  }
  const books = new Map(visibleState?.pool.map(book => [book.id,book]));
  const exit = () => router.push({ pathname:"/games", params:buildGamesPortalRouteParams(config, params) });
  const artworkPhase = melanieArtworkPhase(visibleState?.phase || null, visibleState?.rounds.length || 0);
  const compact = width < 720;
  const openingGrid = artworkPhase === "opening" && width >= 900;
  const challengerGrid = artworkPhase === "challenger" && width >= 820;
  return <View style={styles.page}>
    <MelanieBackdrop phase={artworkPhase} compact={compact} />
    <ScrollView ref={scroll} style={styles.scroll} contentContainerStyle={[styles.content, compact && styles.contentCompact]} keyboardShouldPersistTaps="handled">
      <View style={styles.top}><Action label="Back to games" onPress={exit} /><Action label="What your choices tell us" onPress={() => setPrivacy(!privacy)} /></View>
      <View style={styles.hero}>
        <Text style={styles.eyebrow}>MELANIE’S GAME</Text>
        <Text accessibilityRole="header" style={[styles.title, compact && styles.titleCompact]}>Let the story win.</Text>
        <Text style={styles.intro}>Real books. Hidden identities. Follow the stories that make you want to read on.</Text>
      </View>
      {privacy ? <Text style={styles.notice}>Your selections and rankings help NovelIdeas learn which story themes you prefer. Unselected stories count only as weaker choices in this comparison. These choices do not mean you have read or disliked a book. Titles and authors stay hidden until the reveal; cover artwork is deliberately blurred.</Text> : null}
      {loading ? <View style={styles.notice}><ActivityIndicator color="#eed59a" /><Text style={styles.copy}>Finding real stories{config.localCollectionOnly ? " in your library’s collection" : " across your enabled book sources"}…</Text></View> : null}
      {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
      {!loading && !visibleState ? <Action label="Retry loading stories" onPress={() => setAttempt(a=>a+1)} /> : null}
      {visibleState && !loading ? <View style={styles.stage}>
        <Text style={styles.eyebrow}>{visibleState.phase === "reveal" ? "THE REVEAL" : `ROUND ${visibleState.rounds.length+1} OF ${storyRoundCount(visibleState.pool.length)} · ${visibleState.phase === "choose" ? "CHOOSE" : "RANK"}`}</Text>
        {visibleState.phase === "choose" ? <>
          <Text accessibilityRole="header" style={styles.heading}>Which three would you read?</Text>
          <Text style={styles.copy}>{visibleState.rounds.length ? "Your three survivors meet new challengers. Choose on the premise alone." : "Pick three of these story descriptions. Every one belongs to a real book."}</Text>
          <Text accessibilityLiveRegion="polite" style={styles.counter}>{visibleState.selected.length} of 3 selected</Text>
          <View style={styles.grid}>{visibleState.offered.map((id,index) => {
            const book=books.get(id)!; const selected=visibleState.selected.includes(id);
            return <Pressable key={id} disabled={busy || (!selected && visibleState.selected.length===3)} onPress={()=>toggle(id)} accessibilityRole="button" accessibilityState={{selected}} accessibilityLabel={`Story ${index+1}. ${book.synopsis}`} style={[styles.card, (openingGrid || challengerGrid) && styles.choiceCardWide, selected && styles.selected]}>
              <Cover book={book} hidden /><View style={styles.cardText}><Text style={styles.cardLabel}>STORY {index+1}{selected ? " · SELECTED" : ""}</Text><Text style={styles.synopsis}>{book.synopsis}</Text></View>
            </Pressable>;
          })}</View>
          <View style={styles.actions}><Action label="Rank my three choices" disabled={busy || visibleState.selected.length!==3} onPress={()=>void commit({...visibleState,phase:"rank"})} /></View>
        </> : visibleState.phase === "rank" ? <>
          <Text accessibilityRole="header" style={styles.heading}>Put your favorite first.</Text>
          <Text style={styles.copy}>Rank the descriptions from most to least appealing.</Text>
          <View style={styles.grid}>{visibleState.selected.map((id,index)=>{const book=books.get(id)!;return <View key={id} style={styles.card}>
            <View style={styles.rankBadge}><Text style={styles.rankNumber}>#{index+1}</Text></View><Cover book={book} hidden /><View style={styles.cardText}><Text style={styles.cardLabel}>YOUR #{index+1} · STORY {visibleState.offered.indexOf(id)+1}</Text><Text style={styles.synopsis}>{book.synopsis}</Text>
            <View style={styles.rankActions}><Action label={`Move rank ${index+1} up`} disabled={busy || index===0} onPress={()=>move(index,-1)} /><Action label={`Move rank ${index+1} down`} disabled={busy || index===2} onPress={()=>move(index,1)} /></View></View>
          </View>})}</View>
          <View style={styles.actions}><Action label={visibleState.rounds.length===storyRoundCount(visibleState.pool.length)-1 ? "Reveal my books" : "Meet the next challengers"} disabled={busy} onPress={()=>void commit(finishStoryRound(visibleState),true)} /><Action label="Change my picks" disabled={busy} onPress={()=>void commit({...visibleState,phase:"choose"})} /></View>
        </> : <>
          <Text accessibilityRole="header" style={styles.heading}>The books behind your favorite stories.</Text>
          <Text style={styles.copy}>These are the three real books your synopsis choices brought to the top{config.localCollectionOnly ? ", all from your library’s collection" : ""}. Now that their identities are revealed, which would you choose?</Text>
          <View style={styles.grid}>{visibleState.selected.map((id,index)=>{const book=books.get(id)!;return <View key={id} style={[styles.card, styles.revealCard]}>
            <Cover book={book} /><View style={styles.cardText}><Text style={styles.cardLabel}>{index===0 ? "YOUR TOP STORY MATCH" : `YOUR #${index+1} STORY MATCH`}</Text><Text style={styles.bookTitle}>{book.title}</Text><Text style={styles.author}>{book.author}</Text><Text style={styles.synopsis}>{book.description}</Text>
            <Action label={`I would choose ${book.title}`} disabled={busy || visibleState.feedbackSaved} onPress={()=>void saveResults(id)} /></View>
          </View>})}</View>
          {visibleState.feedbackSaved ? <Text accessibilityLiveRegion="polite" style={styles.notice}>Your choices are saved. Thank you for helping us improve your recommendations.</Text> : <Action label="Save results — none of these for now" disabled={busy} onPress={()=>void saveResults(null)} />}
          <Action label="Start a new tournament" disabled={busy} onPress={()=>{ if(lock.current)return;lock.current=true;setBusy(true);void AsyncStorage.removeItem(storageKey).then(()=>setAttempt(a=>a+1)).catch(()=>{lock.current=false;setBusy(false);setError("Could not start a new tournament. Please retry.");}); }} />
        </>}
      </View> : null}
    </ScrollView>
  </View>;
}
const styles=StyleSheet.create({
  page:{flex:1,backgroundColor:"#071b1d"},scroll:{flex:1},content:{width:"100%",maxWidth:980,alignSelf:"center",paddingHorizontal:28,paddingTop:18,paddingBottom:72,gap:18},contentCompact:{paddingHorizontal:14,paddingTop:12},
  backdrop:{...StyleSheet.absoluteFillObject,overflow:"hidden",backgroundColor:"#071b1d"},edgeArtwork:{position:"absolute",top:0,bottom:0,width:"29%",height:"100%",opacity:0.96},edgeArtworkLeft:{left:0},edgeArtworkRight:{right:0},edgeArtworkMobile:{width:"100%",opacity:0.38},centerWash:{...StyleSheet.absoluteFillObject,left:"20%",right:"20%",backgroundColor:"rgba(7,27,29,0.96)"},centerWashMobile:{left:0,right:0,backgroundColor:"rgba(7,27,29,0.88)"},vignette:{...StyleSheet.absoluteFillObject,backgroundColor:"rgba(0,0,0,0.12)"},
  top:{flexDirection:"row",flexWrap:"wrap",justifyContent:"space-between",gap:10},hero:{alignItems:"center",gap:8,paddingVertical:10},eyebrow:{color:"#d9bd78",fontWeight:"800",fontSize:12,letterSpacing:2,textAlign:"center"},title:{color:"#fff2d5",fontFamily:"Georgia",fontSize:46,lineHeight:54,fontWeight:"700",textAlign:"center",textShadowColor:"rgba(0,0,0,0.65)",textShadowRadius:8},titleCompact:{fontSize:36,lineHeight:43},intro:{color:"#e0e8df",fontSize:17,lineHeight:26,textAlign:"center",maxWidth:660},heading:{fontSize:28,lineHeight:35,fontFamily:"Georgia",fontWeight:"700",color:"#fff2d5"},bookTitle:{fontSize:25,lineHeight:31,fontFamily:"Georgia",fontWeight:"700",color:"#fff2d5"},author:{fontSize:15,lineHeight:22,color:"#d9bd78",fontWeight:"700"},copy:{fontSize:15,lineHeight:23,color:"#d1e0d7"},counter:{color:"#eed59a",fontWeight:"800",fontSize:15},
  stage:{width:"100%",gap:18,padding:22,borderWidth:1,borderColor:"rgba(238,213,154,0.34)",borderRadius:18,backgroundColor:"rgba(8,35,37,0.94)",shadowColor:"#000",shadowOpacity:0.42,shadowRadius:18,shadowOffset:{width:0,height:8}},grid:{flexDirection:"row",flexWrap:"wrap",gap:14},card:{width:"100%",backgroundColor:"rgba(22,61,63,0.96)",borderWidth:2,borderColor:"#45686a",borderRadius:13,padding:16,flexDirection:"row",gap:16,alignItems:"flex-start",shadowColor:"#000",shadowOpacity:0.2,shadowRadius:8,shadowOffset:{width:0,height:4}},choiceCardWide:{width:"31.8%",minWidth:240,flexGrow:1,flexDirection:"column"},selected:{borderColor:"#f3ce78",backgroundColor:"rgba(63,92,80,0.98)",shadowColor:"#f3ce78",shadowOpacity:0.38},cardText:{flex:1,minWidth:0,gap:10},cardLabel:{color:"#f3ce78",fontSize:12,fontWeight:"900",letterSpacing:1},synopsis:{color:"#faf4e5",fontSize:16,lineHeight:25},revealCard:{backgroundColor:"rgba(17,54,56,0.97)"},
  rankBadge:{width:42,height:42,borderRadius:21,borderWidth:1,borderColor:"#d9bd78",backgroundColor:"#102f31",alignItems:"center",justifyContent:"center"},rankNumber:{color:"#f3ce78",fontSize:15,fontWeight:"900"},rankActions:{flexDirection:"row",flexWrap:"wrap",gap:8},actions:{flexDirection:"row",flexWrap:"wrap",gap:10},
  cover:{width:88,height:126,backgroundColor:"#75847c",borderRadius:5,overflow:"hidden",justifyContent:"center",flexShrink:0},blurredCover:{width:58,height:86},coverImage:{position:"absolute",width:"100%",height:"100%"},defocusedImage:{transform:[{scale:1.18}]},placeholder:{fontSize:11,textAlign:"center",color:"#fff",padding:4},
  action:{backgroundColor:"#e9d7aa",paddingHorizontal:17,paddingVertical:12,borderRadius:8,minHeight:46,alignSelf:"flex-start",justifyContent:"center",borderWidth:1,borderColor:"#f5dfa8"},actionText:{color:"#17393b",fontSize:14,fontWeight:"900"},notice:{padding:18,backgroundColor:"rgba(25,73,74,0.96)",borderWidth:1,borderColor:"#567b72",color:"#f4ecd9",fontSize:15,lineHeight:24,borderRadius:10,gap:12},error:{color:"#ffd0b8",fontSize:16,lineHeight:24,backgroundColor:"rgba(77,31,28,0.92)",padding:14,borderRadius:8},
});
