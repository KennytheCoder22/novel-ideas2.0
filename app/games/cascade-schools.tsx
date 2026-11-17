import AsyncStorage from '@react-native-async-storage/async-storage';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Image, Platform, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { withGameReadingAge } from '../../components/GameReadingAge';
import { decodeBoard, findLegalMoves, INGREDIENTS, type Coordinate } from '../../lib/recommendationGames/alchemistsCascade';
import { buildGamesPortalRouteParams, gameRouteConfigScope, parseGameRouteConfig, type GameRouteParams } from '../../lib/recommendationGames/gameRecommendationRouteConfig';
import { BOARD_VERSION, EXPERIMENT, RECIPE, chooseSchool, createExperiment, diagnostics, forecast, leaveExperiment, playMove, preview, restoreExperiment, retryExperiment, schoolName, type ExperimentSave, type School } from '../../lib/recommendationGames/cascadeSchoolsExperiment';

function Button({ label, onPress, disabled = false }: { label: string; onPress: () => void; disabled?: boolean }) {
  return <Pressable accessibilityRole="button" disabled={disabled} onPress={onPress} style={[styles.button, disabled && { opacity: 0.5 }]}><Text style={styles.buttonText}>{label}</Text></Pressable>;
}
function CascadeSchools() {
  const params = useLocalSearchParams() as GameRouteParams;
  const config = parseGameRouteConfig(params);
  const scope = gameRouteConfigScope(config);
  const key = `${EXPERIMENT}:${scope}`;
  const { width } = useWindowDimensions();
  const [state, setState] = useState<ExperimentSave | null>(null);
  const [selected, setSelected] = useState<Coordinate | null>(null);
  const [proposal, setProposal] = useState<{ from: Coordinate; to: Coordinate } | null>(null);
  const [showNotes, setShowNotes] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const activeKey = useRef(key); activeKey.current = key;
  useEffect(() => {
    let cancelled = false;
    setState(null); setSelected(null); setProposal(null); setError('');
    void (async () => {
      try {
        const raw = await AsyncStorage.getItem(key);
        let saved = restoreExperiment(raw, scope);
        if (raw && !saved) throw new Error('This field notebook could not be read. It has not been replaced.');
        if (!saved) {
          // Random allocation, fixed once saved; deterministic board/trial replay thereafter.
          saved = createExperiment(scope,config.ageBand,(RECIPE.seed ^ Math.floor(Math.random()*0x100000000)) >>> 0);
          await AsyncStorage.setItem(key,JSON.stringify(saved));
        }
        if (!cancelled) setState(saved);
      } catch (e) { if (!cancelled) setError(String(e)); }
    })();
    return () => { cancelled = true; };
  }, [key,scope,config.ageBand]);
  async function commit(next: ExperimentSave) {
    if (lock.current) return false;
    lock.current = true; setBusy(true);
    try {
      await AsyncStorage.setItem(key,JSON.stringify(next));
      if (activeKey.current !== key) return false;
      setState(next); setError(''); return true;
    } catch { setError('Could not save. Your previous notebook is safe; please try again.'); return false; }
    finally { lock.current = false; setBusy(false); }
  }
  async function act(action: () => ExperimentSave) {
    if (lock.current) return;
    try { if (await commit(action())) { setProposal(null); setSelected(null); } }
    catch (e) { setError(e instanceof Error ? e.message : 'Please try again.'); }
  }
  const s = state?.scope === scope ? state : null;
  const board = s ? decodeBoard(s.board)! : null;
  const playable = s && ['trial','play'].includes(s.stage);
  const cellSize = Math.floor((Math.min(width - 40, 490) - 18) / 7);
  async function cell(at: Coordinate) {
    if (!s || !playable || busy) return;
    if (!selected) { setSelected(at); return; }
    if (selected.row === at.row && selected.column === at.column) { setSelected(null); return; }
    const result = forecast(s,selected,at);
    if (!result.valid) { setSelected(at); setError('Choose two neighboring tiles that make a line of three.'); return; }
    setError(''); setProposal({from:selected,to:at});
  }
  const predicted = s && proposal && s.previewMove === `${proposal.from.row},${proposal.from.column}:${proposal.to.row},${proposal.to.column}` ? forecast(s,proposal.from,proposal.to) : null;
  const choosing = s && ['choose','midpoint'].includes(s.stage);
  const finished = s && ['won','lost'].includes(s.stage);
  const other: School = s?.school === 'oracle' ? 'veiled' : 'oracle';
  const opportunity = s?.school === 'oracle' ? '◎ See one swap’s result each turn. Use it or choose another.' : s?.stage === 'trial' ? '◇ Practice: a rune appears after move one. In the recipe: every fourth move.' : '◇ Every fourth move, a surprise rune appears. Match it to clear a row or column.';
  const trialLabel = s?.stage === 'trial' ? `Try ${s.trialsDone+1} of 2 · ${s.trialMoves}/2 moves` : null;
  function exportNotes() {
    if (!s || Platform.OS !== 'web') return;
    // Local download only; omit player/library scope. No network or recommender event.
    const payload = { experiment: EXPERIMENT, boardVersion: BOARD_VERSION, events: s.events, current: { stage:s.stage, school:s.school, attempt:s.attempt, diagnostics:diagnostics(s) } };
    const url = URL.createObjectURL(new Blob([JSON.stringify(payload,null,2)],{type:'application/json'}));
    const a = document.createElement('a'); a.href=url; a.download='cascade-school-field-notes.json'; a.click(); URL.revokeObjectURL(url);
  }
  return <View style={styles.root} {...(Platform.OS === 'web' ? {onKeyDown:(event:React.KeyboardEvent)=>{
    if(event.key === 'Escape'){setSelected(null);setProposal(null);return;}
    const offsets:Record<string,number[]>={ArrowUp:[-1,0],ArrowDown:[1,0],ArrowLeft:[0,-1],ArrowRight:[0,1],w:[-1,0],s:[1,0],a:[0,-1],d:[0,1]};
    const delta=offsets[event.key];
    if(delta && selected && playable && !busy){event.preventDefault();const at={row:selected.row+delta[0],column:selected.column+delta[1]};if(at.row>=0&&at.row<7&&at.column>=0&&at.column<7)void cell(at);}
  }} : {})}>
    <Image source={require('../../assets/games/alchemists-cascade/title-screen.webp')} style={StyleSheet.absoluteFillObject} resizeMode="cover" accessible={false}/>
    <ScrollView contentContainerStyle={styles.scroll}>
      <View style={styles.panel}>
        <Text style={styles.eyebrow}>THE ALCHEMIST’S CASCADE · A NEW DISCOVERY</Text>
        <Text accessibilityRole="header" style={styles.title}>The Hidden Bell</Text>
        <Text style={styles.text}>Copper Rain · One-recipe trial. Your campaign and book recommendations stay unchanged.</Text>
        <Button label="Save & back to games" onPress={() => { void (async () => { if (!s || await commit(leaveExperiment(s))) router.push({pathname:'/games',params:buildGamesPortalRouteParams(config,params)}); })(); }}/>
        {!s && !error ? <Text style={styles.text}>Opening your field notebook…</Text> : null}
        {s ? <>
          <Text accessibilityRole="header" style={styles.heading}>{trialLabel || (choosing ? s.stage === 'midpoint' ? 'The brew settles' : 'Choose your method' : finished ? s.stage === 'won' ? 'The hidden bell rings' : 'The brew needs another try' : schoolName(s.school))}</Text>
          {trialLabel ? <><Text style={styles.heading}>{schoolName(s.school)}</Text><Text style={styles.text}>{s.school === 'oracle' ? 'See a swap’s result before you make it. Try the Lens each practice move.' : 'Make one match. Watch a rune appear. Then try a second move.'}</Text></> : null}
          {choosing ? <>
            <Text style={styles.text}>{s.stage === 'midpoint' ? 'Same board. Same moves left. Which method now?' : 'You tried both. Choose one for this recipe.'}</Text>
            <Button disabled={busy} label={s.stage === 'midpoint' ? `Keep ${schoolName(s.school)}` : 'Use Oracle’s Lens'} onPress={() => void act(() => chooseSchool(s,s.stage === 'midpoint' ? s.school : 'oracle'))}/>
            <Button disabled={busy} label={s.stage === 'midpoint' ? `Switch to ${schoolName(other)}` : 'Use Veiled Crucible'} onPress={() => void act(() => chooseSchool(s,s.stage === 'midpoint' ? other : 'veiled'))}/>
            <Button disabled={busy} label="Let Fate Decide" onPress={() => void act(() => chooseSchool(s,'fate'))}/>
          </> : null}
          {playable ? <Text style={styles.text}>{opportunity}</Text> : null}
          <Text style={styles.stats}>{s.stage === 'trial' ? 'PRACTICE' : `${s.moves} moves left`} · Score {s.score}{s.stage === 'trial' ? '' : ` / ${RECIPE.scoreTarget}`}</Text>
          <Text style={styles.text}>{RECIPE.goals.map(g => `${INGREDIENTS[g.kind].symbol} ${INGREDIENTS[g.kind].name}: ${Math.min(g.target,s.collected[g.kind])}/${g.target}`).join('   ')}</Text>
          <View accessibilityLabel="Alchemy board, seven rows by seven columns" style={styles.board}>
            {board?.map((row,r) => <View key={r} style={styles.row}>{row.map((tile,c) => <Pressable key={c} disabled={!playable || busy} accessibilityRole="button" accessibilityLabel={`Row ${r+1}, column ${c+1}, ${INGREDIENTS[tile.kind].name}${tile.special === 'none' ? '' : `, ${tile.special} rune`}`} accessibilityHint="Select, then select a neighbor to swap" accessibilityState={{selected:selected?.row === r && selected.column === c}} onPress={() => void cell({row:r,column:c})} style={[styles.tile,{width:cellSize,height:cellSize,backgroundColor:INGREDIENTS[tile.kind].color},selected?.row === r && selected.column === c && styles.selected]}><Text style={{color:INGREDIENTS[tile.kind].ink,fontSize:Math.max(20,cellSize*0.45),fontWeight:'900'}}>{INGREDIENTS[tile.kind].symbol}</Text>{tile.special !== 'none' ? <Text style={styles.rune}>{tile.special === 'row' ? '━' : tile.special === 'column' ? '┃' : '⊕'}</Text> : null}</Pressable>)}</View>)}
          </View>
          {proposal && playable ? <View style={styles.inset}>
            <Text style={styles.text}>Swap {proposal.from.row+1},{proposal.from.column+1} with {proposal.to.row+1},{proposal.to.column+1}</Text>
            {s.school === 'oracle' && !s.previewUsed ? <Button disabled={busy} label="Look through Oracle’s Lens" onPress={() => { void commit(preview(s,proposal.from,proposal.to)); }}/>:null}
            {predicted ? <Text accessibilityLiveRegion="polite" style={styles.text}>Lens: +{predicted.scoreDelta} points · {RECIPE.goals.map(g=>`${predicted.collected[g.kind]} ${INGREDIENTS[g.kind].name}`).join(', ')} · {predicted.steps.length} reactions. You can still choose another swap.</Text> : null}
            <Button disabled={busy || (s.stage === 'trial' && s.school === 'oracle' && !s.previewUsed)} label="Make this swap" onPress={() => void act(()=>playMove(s,proposal.from,proposal.to))}/>
            <Button label="Choose another swap" onPress={()=>{setProposal(null);setSelected(null);}}/>
          </View>:null}
          {playable && !proposal ? <Button label="Show a possible match" onPress={()=>{const m=findLegalMoves(board!,RECIPE.goals)[0]; if(m){setSelected(m.from);setProposal({from:m.from,to:m.to});}}}/>:null}
          <Text accessibilityLiveRegion="polite" style={styles.notice}>{s.notice}</Text>
          {finished ? <>
            <Text style={styles.text}>{s.stage === 'won' ? s.school === 'oracle' ? 'The marks you traced resolve into a tiny brass bell. Its note wakes the greenhouse.' : 'The last transformation opens into a tiny brass bell. Its note wakes the greenhouse.' : 'The bell is still hidden. Both methods remain open to you.'}</Text>
            <Text style={styles.text}>This discovery gives no campaign stars, loot, or book advantage.</Text>
            <Button disabled={busy} label="Try this recipe again" onPress={()=>void act(()=>retryExperiment(s))}/>
          </>:null}
          <Button label={showNotes?'Close field notes':'Open field notes'} onPress={()=>setShowNotes(!showNotes)}/>
          {showNotes ? <View style={styles.inset}><Text style={styles.text}>These notes stay on this device. They record trials, method choices, board context, use counts, results, retries and explicit exits—not reading tastes. Download them to share for review. Closing the tab is not labeled abandonment.</Text><Text selectable style={styles.text}>{JSON.stringify({experiment:EXPERIMENT,stage:s.stage,events:s.events.length,uses:s.uses,lastDecision:s.events.filter(e=>e.diagnostics).at(-1)?.diagnostics},null,2)}</Text><Button label="Download field notes" onPress={exportNotes}/></View>:null}
        </>:null}
        {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text>:null}
      </View>
    </ScrollView>
  </View>;
}
const AgeScopedSchools = withGameReadingAge(CascadeSchools,{accentColor:'#F6C957',borderColor:'#766C5B',textColor:'#E9DFCE',selectedBackgroundColor:'rgba(246,201,87,0.14)'});
export default function ExperimentRoute() {
  return <View style={{flex:1,backgroundColor:'#10111b'}}><Stack.Screen options={{headerShown:false,title:'The Hidden Bell — Cascade'}}/><AgeScopedSchools/></View>;
}
const styles=StyleSheet.create({
  root:{flex:1,backgroundColor:'#10111b'},scroll:{padding:12,alignItems:'center'},panel:{width:'100%',maxWidth:740,padding:8,backgroundColor:'#10111b',borderWidth:1,borderColor:'#ad823a',borderRadius:12,gap:10},eyebrow:{color:'#e4bd71',fontSize:12,textAlign:'center',letterSpacing:1},title:{fontFamily:'Georgia',fontSize:30,color:'#fff0d2',textAlign:'center'},heading:{fontSize:22,color:'#f7cb77',fontWeight:'800',textAlign:'center'},text:{color:'#f1e6d1',fontSize:16,lineHeight:23},stats:{color:'#ffd277',fontSize:18,fontWeight:'800',textAlign:'center'},button:{borderWidth:1,borderColor:'#d8ac5d',backgroundColor:'#293037',borderRadius:8,padding:12,minHeight:44},buttonText:{fontSize:16,fontWeight:'700',color:'#ffe0a4',textAlign:'center'},board:{alignSelf:'center',gap:3,paddingVertical:8},row:{flexDirection:'row',gap:3},tile:{alignItems:'center',justifyContent:'center',borderRadius:6,borderWidth:2,borderColor:'transparent'},selected:{borderColor:'#fff'},rune:{position:'absolute',color:'#18212a',fontSize:26,fontWeight:'900'},inset:{padding:10,borderWidth:1,borderColor:'#ad823a',borderRadius:8,gap:8},notice:{color:'#ffd277',fontSize:16,lineHeight:22},error:{color:'#ffc6c6',fontSize:16}
});
