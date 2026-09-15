import AsyncStorage from "@react-native-async-storage/async-storage";
import { useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Image, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { runRecommenderV2 } from "../../../app/recommender-v2/engine";
import { useGameRecommendationMilestone } from "../../../hooks/useGameRecommendationMilestone";
import { parseGameRouteConfig, gameRouteSourceFlagsToEnabledSources, buildGameRouteSourceParams, type GameRouteParams } from "../../../lib/recommendationGames/gameRecommendationRouteConfig";
import { createMelaniesGameStorageInstanceId } from "../../../lib/recommendationGames/melaniesGamePersistence";
import { catalogStories, storyRoundCount, startStoryTournament, finishStoryRound, restoreStoryTournament, storySignals, type StoryBook, type StoryTournament } from "../../../lib/recommendationGames/melaniesRealBooks";

function Cover({ book, hidden = false }: { book: StoryBook; hidden?: boolean }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [book.coverUrl]);
  return <View style={[styles.cover, hidden && styles.blurredCover]} accessible={!hidden} accessibilityElementsHidden={hidden} importantForAccessibility={hidden ? "no-hide-descendants" : "auto"} accessibilityLabel={hidden ? undefined : `Cover of ${book.title}`}>
    {book.coverUrl && !failed ? <Image source={{ uri: book.coverUrl }} blurRadius={hidden ? 4 : 0} onError={() => setFailed(true)} style={[styles.coverImage, hidden && styles.defocusedImage]} accessible={false} /> : <View style={[styles.coverImage, { backgroundColor: "#899894" }]} />}
    {!hidden && (failed || !book.coverUrl) ? <Text style={styles.placeholder}>Cover unavailable</Text> : null}
  </View>;
}
function Action({ label, onPress, disabled = false }: { label: string; onPress: () => void; disabled?: boolean }) {
  return <Pressable accessibilityRole="button" disabled={disabled} onPress={onPress} style={[styles.action, disabled && { opacity: 0.45 }]}><Text style={styles.actionText}>{label}</Text></Pressable>;
}
export default function RealStoryTournament() {
  const params = useLocalSearchParams() as GameRouteParams;
  const config = parseGameRouteConfig(params);
  const scope = JSON.stringify([config.playerId, config.libraryId, config.ageBand, config.sourceFlags]);
  const instance = useMemo(() => createMelaniesGameStorageInstanceId(config.playerId,config.libraryId,config.ageBand), [config.playerId,config.libraryId,config.ageBand]);
  const storageKey = `melanie-real-stories-v1:${scope}:${instance || "device"}`;
  const [state, setState] = useState<StoryTournament | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [privacy, setPrivacy] = useState(false);
  const lock = useRef(false);
  const active = useRef(storageKey);
  active.current = storageKey;
  const visibleState = state?.scope === scope ? state : null;
  const integration = useGameRecommendationMilestone({ game: "melanies_game", gameLabel: "Melanie's Game", playerId: config.playerId, libraryId: config.libraryId, ageBand: config.ageBand, sourceFlags: config.sourceFlags, localCollectionOnly: config.localCollectionOnly, evidenceMode: "semantic_only", sessionScopedEvidence: true, gameSessionId: visibleState?.sessionId || "" });

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
        let pool = catalogStories(candidates, config.localCollectionOnly);
        // These are search probes only, never reader-preference evidence. Avoid repeatedly
        // querying an unavailable service (including Google Books quota failures).
        for (const source of result.diagnostics.sources) {
          if (source.status === "failed") enabledSources[source.source] = false;
        }
        if (!config.localCollectionOnly && pool.length < 12) {
          for (const genre of ["mystery", "science fiction"]) {
            if (cancelled) return;
            const extra = await runRecommenderV2({ ...base, enabledSources, signals: [{ id: `catalog-probe-${genre}`, action: "like", weight: 1, genres: [genre], format: "book" }] }).catch(() => null);
            if (cancelled) return;
            if (extra) {
              candidates.push(...extra.items);
              for (const source of extra.diagnostics.sources) {
                if (source.status === "failed") enabledSources[source.source] = false;
              }
              pool = catalogStories(candidates, false);
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
  const exit = () => router.push({ pathname:"/games", params:{ playerId:config.playerId, libraryId:config.libraryId, ageBand:config.ageBand, ...buildGameRouteSourceParams(config.sourceFlags) } });
  return <ScrollView style={styles.page} contentContainerStyle={styles.content}>
    <View style={styles.top}><Action label="Back to games" onPress={exit} /><Action label="What your choices tell us" onPress={() => setPrivacy(!privacy)} /></View>
    <Text style={styles.eyebrow}>MELANIE’S GAME</Text>
    <Text accessibilityRole="header" style={styles.title}>Let the story win.</Text>
    <Text style={styles.intro}>Real books. Hidden identities. Follow the stories that make you want to read on.</Text>
    {privacy ? <Text style={styles.notice}>Your selections and rankings help NovelIdeas learn which story themes you prefer. Unselected stories count only as weaker choices in this comparison. These choices do not mean you have read or disliked a book. Titles and authors stay hidden until the reveal; cover artwork is deliberately blurred.</Text> : null}
    {loading ? <View style={styles.notice}><ActivityIndicator /><Text style={styles.copy}>Finding real stories{config.localCollectionOnly ? " in your library’s collection" : " across your enabled book sources"}…</Text></View> : null}
    {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
    {!loading && !visibleState ? <Action label="Retry loading stories" onPress={() => setAttempt(a=>a+1)} /> : null}
    {visibleState && !loading ? <>
      <Text style={styles.eyebrow}>{visibleState.phase === "reveal" ? "THE REVEAL" : `ROUND ${visibleState.rounds.length+1} OF ${storyRoundCount(visibleState.pool.length)} · ${visibleState.phase === "choose" ? "CHOOSE" : "RANK"}`}</Text>
      {visibleState.phase === "choose" ? <>
        <Text accessibilityRole="header" style={styles.heading}>Which three would you read?</Text>
        <Text style={styles.copy}>{visibleState.rounds.length ? "Your three survivors meet new challengers. Choose on the premise alone." : "Pick three of these story descriptions. Every one belongs to a real book."}</Text>
        <Text accessibilityLiveRegion="polite" style={styles.counter}>{visibleState.selected.length} of 3 selected</Text>
        <View style={styles.grid}>{visibleState.offered.map((id,index) => {
          const book=books.get(id)!; const selected=visibleState.selected.includes(id);
          return <Pressable key={id} disabled={busy || (!selected && visibleState.selected.length===3)} onPress={()=>toggle(id)} accessibilityRole="button" accessibilityState={{selected}} accessibilityLabel={`Story ${index+1}. ${book.synopsis}`} style={[styles.card,selected && styles.selected]}>
            <Cover book={book} hidden /><View style={styles.cardText}><Text style={styles.cardLabel}>STORY {index+1}{selected ? " · SELECTED" : ""}</Text><Text style={styles.synopsis}>{book.synopsis}</Text></View>
          </Pressable>;
        })}</View>
        <Action label="Rank my three choices" disabled={busy || visibleState.selected.length!==3} onPress={()=>void commit({...visibleState,phase:"rank"})} />
      </> : visibleState.phase === "rank" ? <>
        <Text accessibilityRole="header" style={styles.heading}>Put your favorite first.</Text>
        <Text style={styles.copy}>Rank the descriptions from most to least appealing.</Text>
        {visibleState.selected.map((id,index)=>{const book=books.get(id)!;return <View key={id} style={styles.card}>
          <Cover book={book} hidden /><View style={styles.cardText}><Text style={styles.cardLabel}>YOUR #{index+1} · STORY {visibleState.offered.indexOf(id)+1}</Text><Text style={styles.synopsis}>{book.synopsis}</Text>
          <View style={styles.top}><Action label={`Move rank ${index+1} up`} disabled={busy || index===0} onPress={()=>move(index,-1)} /><Action label={`Move rank ${index+1} down`} disabled={busy || index===2} onPress={()=>move(index,1)} /></View></View>
        </View>})}
        <Action label={visibleState.rounds.length===storyRoundCount(visibleState.pool.length)-1 ? "Reveal my books" : "Meet the next challengers"} disabled={busy} onPress={()=>void commit(finishStoryRound(visibleState),true)} />
        <Action label="Change my picks" disabled={busy} onPress={()=>void commit({...visibleState,phase:"choose"})} />
      </> : <>
        <Text accessibilityRole="header" style={styles.heading}>The books behind your favorite stories.</Text>
        <Text style={styles.copy}>These are the three real books your synopsis choices brought to the top{config.localCollectionOnly ? ", all from your library’s collection" : ""}. Now that their identities are revealed, which would you choose?</Text>
        {visibleState.selected.map((id,index)=>{const book=books.get(id)!;return <View key={id} style={styles.card}>
          <Cover book={book} /><View style={styles.cardText}><Text style={styles.cardLabel}>{index===0 ? "YOUR TOP STORY MATCH" : `YOUR #${index+1} STORY MATCH`}</Text><Text style={styles.heading}>{book.title}</Text><Text style={styles.copy}>{book.author}</Text><Text style={styles.synopsis}>{book.description}</Text>
          <Action label={`I would choose ${book.title}`} disabled={busy || visibleState.feedbackSaved} onPress={()=>void saveResults(id)} /></View>
        </View>})}
        {visibleState.feedbackSaved ? <Text accessibilityLiveRegion="polite" style={styles.notice}>Your choices are saved. Thank you for helping us improve your recommendations.</Text> : <Action label="Save results — none of these for now" disabled={busy} onPress={()=>void saveResults(null)} />}
        <Action label="Start a new tournament" disabled={busy} onPress={()=>{ if(lock.current)return;lock.current=true;setBusy(true);void AsyncStorage.removeItem(storageKey).then(()=>setAttempt(a=>a+1)).catch(()=>{lock.current=false;setBusy(false);setError("Could not start a new tournament. Please retry.");}); }} />
      </>}
    </> : null}
  </ScrollView>;
}
const styles=StyleSheet.create({
  page:{flex:1,backgroundColor:"#102e31"},content:{width:"100%",maxWidth:1080,alignSelf:"center",padding:24,paddingBottom:60,gap:20},
  top:{flexDirection:"row",flexWrap:"wrap",gap:10},eyebrow:{color:"#b9d9c4",fontWeight:"800",fontSize:12,letterSpacing:2},title:{color:"#fff2d5",fontFamily:"Georgia",fontSize:42,fontWeight:"700"},intro:{color:"#dae6de",fontSize:18,lineHeight:28},heading:{fontSize:23,fontWeight:"700",color:"#fff2d5"},copy:{fontSize:15,lineHeight:23,color:"#d1e0d7"},counter:{color:"#eed59a",fontWeight:"700"},
  grid:{gap:14},card:{backgroundColor:"#1c4144",borderWidth:2,borderColor:"#446165",borderRadius:14,padding:18,flexDirection:"row",gap:18,alignItems:"flex-start"},selected:{borderColor:"#eed59a",backgroundColor:"#285054"},cardText:{flex:1,minWidth:0,gap:12},cardLabel:{color:"#eed59a",fontSize:12,fontWeight:"800",letterSpacing:1},synopsis:{color:"#faf4e5",fontSize:17,lineHeight:27},
  cover:{width:76,height:112,backgroundColor:"#75847c",borderRadius:5,overflow:"hidden",justifyContent:"center"},blurredCover:{width:56,height:84},coverImage:{position:"absolute",width:"100%",height:"100%"},defocusedImage:{transform:[{scale:1.18}]},placeholder:{fontSize:11,textAlign:"center",color:"#fff",padding:4},
  action:{backgroundColor:"#e9d7aa",paddingHorizontal:18,paddingVertical:14,borderRadius:9,minHeight:48,alignSelf:"flex-start"},actionText:{color:"#17393b",fontSize:15,fontWeight:"800"},notice:{padding:18,backgroundColor:"#23494b",color:"#f4ecd9",fontSize:15,lineHeight:24,borderRadius:10,gap:12},error:{color:"#ffd0b8",fontSize:16,lineHeight:24},
});
