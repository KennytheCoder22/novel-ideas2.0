import { GameReadingAgeControl } from "../../../components/GameReadingAge";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Image, Platform, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { runRecommenderV2 } from "../../../app/recommender-v2/engine";
import { useGameRecommendationMilestone } from "../../../hooks/useGameRecommendationMilestone";
import { parseGameRouteConfig, gameRouteConfigScope, gameRouteSourceFlagsToEnabledSources, buildGamesPortalRouteParams, type GameRouteParams } from "../../../lib/recommendationGames/gameRecommendationRouteConfig";
import { createMelaniesGameStorageInstanceId } from "../../../lib/recommendationGames/melaniesGamePersistence";
import { melanieArtworkPhase } from "../../../lib/recommendationGames/melanieArtwork";
import { catalogStoriesWithDiagnostics, SECRET_HAND_TARGET, SECRET_HAND_MINIMUM, canRankSecretHand, saveStoryDeal, rankSecretHand, startStoryTournament, finishStoryRound, restoreStoryTournament, storySignals, type StoryBook, type StoryTournament } from "../../../lib/recommendationGames/melaniesRealBooks";

function MelanieBackdrop({ compact }: { compact: boolean }) {
  return <View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={styles.backdrop}>
    <Image source={require("../../../assets/games/melanies-game/library-scene.webp")} resizeMode="cover" style={[StyleSheet.absoluteFillObject, {width:"100%",height:"100%"}]} />
    <View style={[styles.vignette, compact && styles.mobileWash]} />
  </View>;
}

function Cover({ book, hidden = false }: { book: StoryBook; hidden?: boolean }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [book.coverUrl]);
  return <View style={[styles.cover, hidden && styles.blurredCover]} accessible={!hidden} accessibilityElementsHidden={hidden} importantForAccessibility={hidden ? "no-hide-descendants" : "auto"} accessibilityLabel={hidden ? undefined : `Cover of ${book.title}`}>
    {hidden ? <View style={styles.secretCover}><Text style={styles.secretMark}>◇</Text></View> : book.coverUrl && !failed ? <Image source={{ uri: book.coverUrl }} onError={() => setFailed(true)} style={styles.coverImage} accessible={false} /> : <View style={[styles.coverImage, { backgroundColor: "#899894" }]} />}
    {!hidden && (failed || !book.coverUrl) ? <Text style={styles.placeholder}>Cover unavailable</Text> : null}
  </View>;
}
function Action({ label, onPress, disabled = false, outline = false }: { label: string; onPress: () => void; disabled?: boolean; outline?: boolean }) {
  return <Pressable accessibilityRole="button" disabled={disabled} onPress={onPress} style={[styles.action, outline && styles.outlineAction, disabled && { opacity: 0.45 }]}><Text style={[styles.actionText, outline && styles.outlineText]}>{label}</Text></Pressable>;
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
  const [expandedStories, setExpandedStories] = useState<string[]>([]);
  const [reviewHand, setReviewHand] = useState(false);
  const [savedMessage, setSavedMessage] = useState("");
  const lock = useRef(false);
  const scroll = useRef<ScrollView>(null);
  const active = useRef(storageKey);
  active.current = storageKey;
  const visibleState = state?.scope === scope ? state : null;
  const integration = useGameRecommendationMilestone({ game: "melanies_game", gameLabel: "Melanie's Game", playerId: config.playerId, libraryId: config.libraryId, ageBand: config.ageBand, sourceFlags: config.sourceFlags, localCollectionOnly: config.localCollectionOnly, evidenceMode: "semantic_only", sessionScopedEvidence: true, gameSessionId: visibleState?.sessionId || "" });

  useEffect(() => {
    scroll.current?.scrollTo({ y: 0, animated: false });
  }, [visibleState?.phase, visibleState?.deals.length]);

  useEffect(() => {
    if (Platform.OS === "web") document.title = "Melanie's Game — Story First";
    let cancelled = false;
    setLoading(true); setState(null); setError(""); lock.current = false; setBusy(false); setReviewHand(false); setSavedMessage(""); setExpandedStories([]);
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
    if (lock.current) return false;
    lock.current = true; setBusy(true); setError("");
    const key = storageKey;
    try {
      await AsyncStorage.setItem(key, JSON.stringify(next));
      if (active.current !== key) return false;
      setState(next);
      if (recordEvidence && !await integration.recordBookTournament(storySignals(next), next.phase === "reveal" ? next.selected : [])) {
        if (active.current === key) setError("Your hand is saved on this device. Retry saving preferences before leaving.");
      }
      return active.current === key;
    } catch { if (active.current === key) setError("That change could not be saved. Please try again."); return false; }
    finally { if (active.current === key) { lock.current = false; setBusy(false); } }
  }
  function toggle(id: string) {
    if (!visibleState || busy || visibleState.phase !== "choose") return;
    const selected = visibleState.selected.includes(id) ? visibleState.selected.filter(value => value !== id) : [...visibleState.selected,id];
    void commit({ ...visibleState, selected });
  }
  function move(index: number, step: number) {
    if (!visibleState || busy || visibleState.phase !== "rank" || index+step < 0 || index+step >= visibleState.selected.length) return;
    const selected = [...visibleState.selected];
    [selected[index],selected[index+step]] = [selected[index+step],selected[index]];
    void commit({ ...visibleState, selected });
  }
  async function saveDeal() {
    if (!visibleState || busy || lock.current) return;
    const count = visibleState.selected.length;
    if (!await commit(saveStoryDeal(visibleState), true)) return;
    setSavedMessage(count ? `${count} ${count === 1 ? "story added" : "stories added"} to My Picks. Identities stay secret until the reveal.` : "Deal passed. No likes or dislikes recorded.");
    setExpandedStories([]);
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
  const artworkPhase = melanieArtworkPhase(visibleState?.phase || null, 0);
  const compact = width < 720;
  const openingGrid = artworkPhase === "opening" && width >= 1000;
  const openingPair = artworkPhase === "opening" && width >= 620 && width < 1000;
  return <View style={styles.page}>
    <MelanieBackdrop compact={compact} />
    <View style={[styles.toolbar, compact && styles.toolbarCompact]}>
      <Action label="← Back to games" onPress={exit} outline />
      <GameReadingAgeControl />
      <Action label="What your choices tell us" onPress={() => setPrivacy(!privacy)} outline />
    </View>
    <ScrollView ref={scroll} style={styles.scroll} contentContainerStyle={[styles.content, compact && styles.contentCompact]} keyboardShouldPersistTaps="handled">
      <View style={styles.hero}>
        <Text style={styles.eyebrow}>── ◇  MELANIE’S GAME  ◇ ──</Text>
        <Text accessibilityRole="header" style={[styles.title, compact && styles.titleCompact]}>{visibleState?.phase === "rank" ? "Put your favorite first." : visibleState?.phase === "reveal" ? "The books behind your favorite stories." : "Let the story win."}</Text>
        <Text style={styles.intro}>{visibleState?.phase === "rank" ? "Rank the descriptions from most to least appealing." : "Real books. Hidden identities."}</Text>
      </View>
      {privacy ? <Text style={styles.notice}>Only stories you save count as interest. Passed-over stories are kept in your on-device deal history, not sent as dislikes. Your hand remembers which stories you saw, which you saved, and the order you saved them. Your final ranking gives stronger comparative preference evidence. None of this means you have read a book. Titles, authors, and real covers stay hidden until the reveal.</Text> : null}
      {loading ? <View style={styles.notice}><ActivityIndicator color="#eed59a" /><Text style={styles.copy}>Finding real stories{config.localCollectionOnly ? " in your library’s collection" : " across your enabled book sources"}…</Text></View> : null}
      {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
      {error && visibleState ? <Action label="Retry saving preferences" disabled={busy} onPress={()=>void commit(visibleState,true)} /> : null}
      {!loading && !visibleState ? <Action label="Retry loading stories" onPress={() => setAttempt(a=>a+1)} /> : null}
      {visibleState && !loading ? <View style={[styles.stage, artworkPhase !== "opening" && styles.narrowStage]}>
        <Text style={styles.eyebrow}>{visibleState.phase === "reveal" ? "THE REVEAL" : visibleState.phase === "rank" ? "RANK YOUR SECRET HAND" : `DEAL ${visibleState.deals.length+1} · BUILD YOUR SECRET HAND`}</Text>
        {visibleState.phase === "choose" ? <>
          <View style={styles.handDock}>
            <View style={styles.handHeading}><Text accessibilityRole="header" style={styles.counter}>MY PICKS · {visibleState.held.length}</Text><Text style={styles.copy}>{visibleState.held.length >= SECRET_HAND_TARGET ? "Your secret hand is ready." : `Aim for ${SECRET_HAND_TARGET}; you can rank from ${SECRET_HAND_MINIMUM}.`}</Text></View>
            <ScrollView horizontal contentContainerStyle={styles.handCards} accessibilityLabel="Saved anonymous stories">{visibleState.held.map((id,index)=><Pressable key={id} accessibilityRole="button" accessibilityLabel={`Review saved story ${index+1}`} onPress={()=>setReviewHand(true)} style={styles.handCard}><Text style={styles.secretMark}>◇</Text><Text style={styles.handNumber}>{index+1}</Text></Pressable>)}</ScrollView>
            {visibleState.held.length ? <Action label={reviewHand ? "Close hand review" : "Review my picks"} outline onPress={()=>setReviewHand(!reviewHand)} /> : <Text style={styles.copy}>Save only what genuinely intrigues you. It is fine to pass an entire deal.</Text>}
            {reviewHand ? visibleState.held.map((id,index)=><Text key={id} style={styles.copy}>PICK {index+1} · {books.get(id)!.synopsis}</Text>) : null}
            {(canRankSecretHand(visibleState) || visibleState.held.length + visibleState.selected.length >= SECRET_HAND_MINIMUM) ? <Action label={visibleState.selected.length ? "Save selections & rank my picks" : visibleState.held.length >= SECRET_HAND_TARGET ? "Rank my picks" : "Rank what I have"} disabled={busy} onPress={()=>void commit(rankSecretHand(visibleState),true)} /> : null}
          </View>
          {savedMessage ? <Text accessibilityLiveRegion="polite" style={styles.notice}>{savedMessage}</Text> : null}
          <View style={styles.parchmentHeading}><Text accessibilityRole="header" style={styles.parchmentTitle}>{visibleState.offered.length ? "Which stories intrigue you?" : "You’ve explored this collection."}</Text>
          <Text style={styles.parchmentCopy}>{visibleState.offered.length ? `Keep any that appeal — even none. ${visibleState.offered.length < 6 ? `These are the ${visibleState.offered.length} remaining new stories.` : "Six anonymous stories, all real books."}` : visibleState.held.length ? "Rank your saved stories whenever you’re ready. No extra picks required." : "Nothing caught your interest this time. You can return to games without recording any preference."}</Text></View>
          {visibleState.offered.length ? <Text accessibilityLiveRegion="polite" style={styles.counter}>{visibleState.selected.length} selected in this deal · {visibleState.held.length} saved</Text> : null}
          <View style={styles.grid}>{visibleState.offered.map((id,index) => {
            const book=books.get(id)!; const selected=visibleState.selected.includes(id);
            return <View key={id} style={[styles.card, {flexDirection:"column"}, artworkPhase === "opening" && styles.parchmentCard, openingGrid && styles.choiceCardWide, openingPair && styles.choiceCardPair, selected && styles.selected]}>
              <View style={styles.choiceBody}><Cover book={book} hidden /><View style={styles.cardText}><Text style={[styles.cardLabel, artworkPhase === "opening" && styles.inkLabel]}>STORY {index+1}</Text><Text numberOfLines={expandedStories.includes(id) ? undefined : 5} style={[styles.synopsis, artworkPhase === "opening" && styles.inkSynopsis]}>{book.synopsis}</Text>{book.synopsis.length > 100 ? <Pressable accessibilityRole="button" accessibilityLabel={`${expandedStories.includes(id) ? "Collapse" : "Read full"} synopsis for story ${index+1}`} onPress={event=>{event.stopPropagation();setExpandedStories(current=>current.includes(id)?current.filter(value=>value!==id):[...current,id]);}}><Text style={[styles.readMore, artworkPhase === "opening" && styles.inkLabel]}>{expandedStories.includes(id) ? "Show less" : "Read full synopsis"}</Text></Pressable> : null}</View></View>
              <Pressable {...(Platform.OS === "web" ? {onKeyDown:(event: React.KeyboardEvent)=>{if(event.key === " " && !event.repeat){event.preventDefault();toggle(id);}}} : {})} disabled={busy} onPress={()=>toggle(id)} accessibilityRole="checkbox" aria-checked={selected} accessibilityState={{checked:selected}} accessibilityLabel={`Story ${index+1}. ${book.synopsis}`} style={[styles.selectionFooter, artworkPhase === "opening" && styles.parchmentFooter]}><Text style={[styles.selectionText, artworkPhase === "opening" && styles.inkLabel]}>{selected ? "☑  Story selected" : "□  Select this story"}</Text></Pressable>
            </View>;
          })}</View>
          {visibleState.offered.length ? <View style={styles.actions}><Action label={visibleState.selected.length ? `Save ${visibleState.selected.length} & deal new stories` : "None of these — deal new stories"} disabled={busy} onPress={saveDeal} /></View> : <Action label="Back to games" onPress={exit} outline />}
        </> : visibleState.phase === "rank" ? <>

          <View style={styles.grid}>{visibleState.selected.map((id,index)=>{const book=books.get(id)!;return <View key={id} style={[styles.card, styles.rankCard, compact && styles.rankCardCompact]}>
            <Cover book={book} hidden /><View style={styles.cardText}><Text style={styles.cardLabel}>YOUR #{index+1} · PICK {visibleState.held.indexOf(id)+1}</Text><Text style={styles.synopsis}>{book.synopsis}</Text>
            </View><View style={[styles.rankActions, compact && styles.rankActionsCompact]}><Action label={`Move rank ${index+1} up`} disabled={busy || index===0} onPress={()=>move(index,-1)} /><Action label={`Move rank ${index+1} down`} disabled={busy || index===visibleState.selected.length-1} onPress={()=>move(index,1)} /></View>
          </View>})}</View>
          <View style={styles.actions}><Action label="Reveal my books" disabled={busy} onPress={()=>void commit(finishStoryRound(visibleState),true)} /><Action label="Keep collecting" disabled={busy} onPress={()=>void commit({...visibleState,selected:[],phase:"choose"})} /></View>
        </> : <>
          <Text style={styles.copy}>{visibleState.selected.length === 1 ? "This is your saved book" : `These are your ${visibleState.selected.length} saved books in your final preference order`}{config.localCollectionOnly ? ", from your library’s collection" : ""}. With {visibleState.selected.length === 1 ? "its identity" : "their identities"} revealed, would you choose {visibleState.selected.length === 1 ? "it" : "one"}?</Text>
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
  handDock:{width:"100%",padding:14,gap:10,borderRadius:10,borderWidth:1,borderColor:"#bba971",backgroundColor:"rgba(5,36,37,0.97)"},handHeading:{flexDirection:"row",flexWrap:"wrap",gap:10,alignItems:"center"},handCards:{gap:8},handCard:{width:46,height:62,borderRadius:5,borderWidth:1,borderColor:"#d9bd78",backgroundColor:"#284749",justifyContent:"center",alignItems:"center"},handNumber:{color:"#fff2d5",fontSize:12},secretCover:{flex:1,backgroundColor:"#284749",borderWidth:2,borderColor:"#bba971",justifyContent:"center",alignItems:"center"},secretMark:{color:"#eed59a",fontSize:26},
  page:{flex:1,backgroundColor:"#071b1d"},scroll:{flex:1},content:{width:"100%",maxWidth:1100,alignSelf:"center",paddingHorizontal:28,paddingTop:18,paddingBottom:48,gap:14},contentCompact:{paddingHorizontal:14,paddingTop:12},
  backdrop:{...StyleSheet.absoluteFillObject,overflow:"hidden",backgroundColor:"#071b1d"},vignette:{...StyleSheet.absoluteFillObject,backgroundColor:"rgba(0,0,0,0.18)"},
  hero:{alignItems:"center",gap:8,paddingVertical:10},eyebrow:{color:"#d9bd78",fontWeight:"800",fontSize:12,letterSpacing:2,textAlign:"center"},title:{color:"#fff2d5",fontFamily:"Georgia",fontSize:48,lineHeight:58,fontWeight:"700",textAlign:"center",textShadowColor:"rgba(0,0,0,0.65)",textShadowRadius:8},titleCompact:{fontSize:36,lineHeight:43},intro:{color:"#e0e8df",fontSize:17,lineHeight:26,textAlign:"center",maxWidth:760,fontFamily:"Georgia"},heading:{fontSize:28,lineHeight:35,fontFamily:"Georgia",fontWeight:"700",color:"#fff2d5"},bookTitle:{fontSize:25,lineHeight:31,fontFamily:"Georgia",fontWeight:"700",color:"#fff2d5"},author:{fontSize:15,lineHeight:22,color:"#d9bd78",fontWeight:"700"},copy:{fontSize:15,lineHeight:23,color:"#d1e0d7"},counter:{color:"#eed59a",fontWeight:"800",fontSize:15},
  stage:{width:"100%",gap:14},narrowStage:{maxWidth:940,alignSelf:"center"},grid:{flexDirection:"row",flexWrap:"wrap",gap:14},card:{width:"100%",backgroundColor:"rgba(5,32,33,0.93)",borderWidth:1,borderColor:"#cfb875",borderRadius:12,padding:16,flexDirection:"row",gap:16,alignItems:"flex-start",shadowColor:"#000",shadowOpacity:0.2,shadowRadius:8,shadowOffset:{width:0,height:4}},choiceCardWide:{width:"32%",flexGrow:1},choiceCardPair:{width:"48%",flexGrow:1},selected:{borderColor:"#ffe18a",borderWidth:3,shadowColor:"#f3ce78",shadowOpacity:0.65},cardText:{flex:1,minWidth:0,gap:10},cardLabel:{color:"#f3ce78",fontSize:12,fontWeight:"900",letterSpacing:1},synopsis:{color:"#faf4e5",fontSize:16,lineHeight:25},revealCard:{backgroundColor:"rgba(17,54,56,0.97)"},
  rankActions:{width:200,gap:8},rankActionsCompact:{width:"100%",flexDirection:"row",flexWrap:"wrap"},actions:{flexDirection:"row",flexWrap:"wrap",gap:10,justifyContent:"center",paddingTop:12},
  cover:{width:104,height:152,backgroundColor:"#75847c",borderRadius:5,overflow:"hidden",justifyContent:"center",flexShrink:0},blurredCover:{width:64,height:96},coverImage:{position:"absolute",width:"100%",height:"100%"},defocusedImage:{transform:[{scale:1.18}]},placeholder:{fontSize:11,textAlign:"center",color:"#fff",padding:4},
  toolbar:{flexDirection:"row",alignItems:"center",justifyContent:"space-between",flexWrap:"wrap",gap:8,paddingHorizontal:16,paddingVertical:6,backgroundColor:"#052425",borderBottomWidth:1,borderBottomColor:"#bca362"},
  toolbarCompact:{justifyContent:"center",paddingHorizontal:8},outlineAction:{backgroundColor:"transparent",borderColor:"#bba971",minHeight:40,paddingVertical:8},outlineText:{color:"#fff0ce",fontFamily:"Georgia"},
  mobileWash:{backgroundColor:"rgba(0,15,17,0.5)"},
  parchmentHeading:{alignSelf:"center",maxWidth:560,paddingHorizontal:28,paddingVertical:16,backgroundColor:"#e5c38b",...Platform.select({web:{backgroundImage:"radial-gradient(ellipse at center, #f5dfaf, #d2a565)"},default:{}}),borderWidth:1,borderColor:"#b28649",borderRadius:5,gap:6,shadowColor:"#000",shadowOpacity:0.4,shadowRadius:10},
  parchmentTitle:{fontFamily:"Georgia",fontSize:26,fontWeight:"700",color:"#38210f",textAlign:"center"},parchmentCopy:{fontFamily:"Georgia",fontSize:17,lineHeight:24,color:"#432b16",textAlign:"center"},
  parchmentCard:{flexDirection:"column",backgroundColor:"#e8cc98",...Platform.select({web:{backgroundImage:"radial-gradient(ellipse at center, #f5e1b4 0%, #e3be83 78%, #b58549 100%)"},default:{}}),borderColor:"#a97f47",borderRadius:6,padding:16,shadowOpacity:0.5,shadowRadius:9,shadowOffset:{width:0,height:6}},
  readMore:{fontSize:12,lineHeight:18,color:"#eed59a",textDecorationLine:"underline",paddingVertical:4},
  choiceBody:{flexDirection:"row",gap:14,width:"100%",flex:1},inkLabel:{color:"#65431e"},inkSynopsis:{fontFamily:"Georgia",color:"#352512",fontSize:16,lineHeight:23},
  selectionFooter:{borderTopWidth:1,borderTopColor:"#607366",paddingTop:10,paddingBottom:4,minHeight:40,width:"100%"},parchmentFooter:{borderTopColor:"#b99a66"},selectionText:{color:"#eed59a",fontFamily:"Georgia",fontSize:15,textAlign:"center"},
  rankCard:{alignItems:"center",padding:22},rankCardCompact:{flexWrap:"wrap",padding:14},
  action:{backgroundColor:"#f5d88e",paddingHorizontal:17,paddingVertical:12,borderRadius:8,minHeight:46,alignSelf:"flex-start",justifyContent:"center",borderWidth:1,borderColor:"#f5dfa8"},actionText:{color:"#17393b",fontSize:14,fontWeight:"900"},notice:{padding:18,backgroundColor:"rgba(25,73,74,0.96)",borderWidth:1,borderColor:"#567b72",color:"#f4ecd9",fontSize:15,lineHeight:24,borderRadius:10,gap:12},error:{color:"#ffd0b8",fontSize:16,lineHeight:24,backgroundColor:"rgba(77,31,28,0.92)",padding:14,borderRadius:8},
});
