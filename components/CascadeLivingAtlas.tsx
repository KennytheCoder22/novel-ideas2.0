import { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { CASCADE_LEVELS, CASCADE_REALMS, type CascadeSaveV1, type LevelConfig } from '../lib/recommendationGames/alchemistsCascade';
import { DISCOVERIES, chooseDiscovery, readDiscoveryJournal, type DiscoveryJournal, type Interest } from '../lib/recommendationGames/cascadeDiscoveries';
import { withCrossTabStorageLock, type CrossTabLockStorage } from '../lib/recommendationGames/crossTabStorageLock';

type Props = { save: CascadeSaveV1; storage: CrossTabLockStorage; busy: boolean; syncWarning: string | null; onExit: () => void; onOpenLevel: (level: LevelConfig) => void; onOpenNotes: () => void };
export function CascadeLivingAtlas({ save, storage, busy, syncWarning, onExit, onOpenLevel, onOpenNotes }: Props) {
  const { width } = useWindowDimensions();
  const key = `cascade-discoveries-v1:${save.libraryScopeId}:${save.anonymousPlayerId}:${save.gameSessionId}`;
  const [journal, setJournal] = useState<DiscoveryJournal | null>(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const lock = useRef(false);
  const [selected, setSelected] = useState<number | null>(null);
  useEffect(() => {
    let current = true;
    setJournal(null);
    storage.getItem(key).then(raw => { if (current) setJournal(readDiscoveryJournal(raw)); }).catch(() => { if (current) setError('Your discovery journal could not be read. It has not been overwritten. Recipes are still available.'); });
    return () => { current = false; };
  }, [key, storage]);
  async function update(transform: (value: DiscoveryJournal) => DiscoveryJournal) {
    if (lock.current || !journal) return;
    lock.current = true; setSaving(true); setError('');
    try {
      const next = await withCrossTabStorageLock(storage, key, async assertOwnership => {
        const latest = readDiscoveryJournal(await storage.getItem(key));
        const changed = transform(latest);
        await assertOwnership();
        await storage.setItem(key, JSON.stringify(changed));
        return changed;
      });
      setJournal(next);
    } catch { setError('That choice was not saved. Please try again; your recipe progress is unchanged.'); }
    finally { lock.current = false; setSaving(false); }
  }
  const total = Object.values(save.levelStars).reduce((a,b) => a+b, 0);
  const complete = CASCADE_LEVELS.every(level => (save.levelStars[level.id] || 0) > 0);
  const discoveries = journal ? Object.values(journal.entries).filter(e => e.ending !== undefined).length : 0;
  const story = selected === null ? null : DISCOVERIES[selected];
  const entry = story ? journal?.entries[story.id] || {} : {};
  const first = story && entry.first !== undefined ? story.first[entry.first] : null;
  const final = story && entry.first !== undefined && entry.ending !== undefined ? story.endings[entry.first][entry.ending] : null;
  const canFinish = selected !== null && !!save.levelStars[`level-${selected*3+3}`];
  const stage = entry.first === undefined ? 'first' : 'ending';
  const options = story ? stage === 'first' ? story.first : story.endings[entry.first!] : [];
  return <ScrollView style={s.root} contentContainerStyle={s.content}>
    <View style={[s.toolbar, width < 520 && s.mobileToolbar]}>
      <Pressable accessibilityRole="button" accessibilityLabel="Back to Games" disabled={busy || saving} onPress={onExit} style={s.quiet}><Text style={s.link}>← Back to Games</Text></Pressable>
      <Text style={s.eyebrow}>THE ALCHEMIST’S CASCADE</Text>
      <Text accessibilityLabel={`${total} total stars`} style={s.stars}>✦ {total} / 36</Text>
    </View>
    <View style={s.hero}>
      <Text style={s.seal}>✧</Text>
      <Text style={s.eyebrow}>{complete ? 'TWELVE RECIPES. A WORLD YOU CHANGED.' : 'BREW SOMETHING. CHANGE SOMETHING.'}</Text>
      <Text accessibilityRole="header" style={s.title}>{story ? story.title : complete ? 'The atlas is yours.' : 'A little chemistry.\nA different tomorrow.'}</Text>
      <Text style={s.intro}>{story ? 'No best answer. Different choices leave different things behind.' : complete ? `Every recipe is complete. Now discover what your creations set in motion. ${discoveries} of 4 stories resolved.` : 'Your recipes open doors. Who you help—and what you leave behind—writes the story of this laboratory.'}</Text>
    </View>
    {error ? <Text accessibilityRole="alert" style={s.error}>{error}</Text> : null}
    {story && selected !== null ? <View style={s.story}>
      <Pressable accessibilityRole="button" onPress={() => setSelected(null)} disabled={saving} style={s.quiet}><Text style={s.link}>← Back to your atlas</Text></Pressable>
      <Text style={s.eyebrow}>{final ? 'WHAT YOU LEFT BEHIND' : first ? 'CHAPTER II · THE CONSEQUENCE' : 'CHAPTER I · THE DISCOVERY'}</Text>
      <Text style={s.prose}>{first ? first.outcome : story.opening}</Text>
      {first ? <View style={s.keepsake}><Text style={s.gold}>IN YOUR KEEPING · {first.keepsake}</Text></View> : null}
      {first && !final ? <Text style={s.prose}>{canFinish ? story.next[entry.first!] : 'The story will continue when you complete the third recipe in this realm. Your discovery is safe in the atlas.'}</Text> : null}
      {final ? <>
        <Text accessibilityRole="header" style={s.chapter}>{final.keepsake}</Text>
        <Text style={s.prose}>{final.outcome}</Text>
        <View style={s.feedback}>
          <Text style={s.chapter}>Would you read more like this?</Text>
          <Text style={s.small}>Optional. This is separate from your story decision and never changes rewards.</Text>
          <View style={s.row}>{(['more','not-for-me','unsure'] as Interest[]).map((interest,i) => <Pressable key={interest} accessibilityRole="button" accessibilityState={{ selected: entry.interest === interest, disabled: saving }} disabled={saving} onPress={() => void update(value => ({ ...value, entries: { ...value.entries, [story.id]: { ...value.entries[story.id], interest } } }))} style={[s.pill, entry.interest === interest && s.chosen]}><Text style={s.link}>{['Yes, more like this','Not my thing','Not sure'][i]}</Text></Pressable>)}</View>
          {entry.interest ? <Text accessibilityLiveRegion="polite" style={s.small}>Saved on this device. You can change this answer.</Text> : null}
        </View>
      </> : (!first || canFinish) ? <View style={s.choices}>{options.map((option,i) => <Pressable key={option.title} accessibilityRole="button" disabled={saving || !journal} onPress={() => void update(value => chooseDiscovery(value, selected, stage, i as 0|1, save.levelStars))} style={({pressed}) => [s.choice, pressed && s.chosen, saving && s.disabled]}><Text style={s.chapter}>{option.title} →</Text><Text style={s.small}>{option.detail}</Text></Pressable>)}<Text style={s.small}>Your choice changes this story and its keepsake—not your score, moves or recommendation rank. You can leave and decide later.</Text></View> : null}
    </View> : <View style={s.grid}>{CASCADE_REALMS.map((realm,index) => {
      const e = journal?.entries[realm.id];
      const scene = DISCOVERIES[index];
      const unlocked = !!save.levelStars[`level-${index*3+1}`];
      const keepsake = e?.first !== undefined ? e.ending !== undefined ? scene.endings[e.first][e.ending].keepsake : scene.first[e.first].keepsake : null;
      return <View key={realm.id} style={[s.realm,{width:width>=820?'48.8%':'100%',borderColor:realm.accent,backgroundColor:realm.background}]}>
        <View style={s.realmTop}><Text style={[s.realmIcon,{color:realm.accent}]}>{scene.symbol}</Text><View style={s.flex}><Text style={s.eyebrow}>REALM 0{index+1}</Text><Text accessibilityRole="header" style={s.realmTitle}>{realm.name}</Text></View></View>
        <Text style={s.small}>{keepsake ? `Your world: ${keepsake}` : realm.fiction}</Text>
        <View style={s.recipes}>{CASCADE_LEVELS.slice(index*3,index*3+3).map(level => <Pressable key={level.id} accessibilityRole="button" accessibilityLabel={`${level.name}, recipe ${level.number}, ${save.levelStars[level.id] || 0} of 3 stars`} disabled={busy || level.number>save.unlockedLevel} onPress={() => onOpenLevel(level)} style={[s.recipe,level.number>save.unlockedLevel&&s.disabled]}><Text style={s.recipeNumber}>{String(level.number).padStart(2,'0')}</Text><Text style={s.recipeName}>{level.name}</Text><Text style={s.gold}>{'★'.repeat(save.levelStars[level.id]||0)}{'☆'.repeat(3-(save.levelStars[level.id]||0))}</Text></Pressable>)}</View>
        <Pressable accessibilityRole="button" disabled={!unlocked || !journal} onPress={() => setSelected(index)} style={[s.discoveryButton,(!unlocked||!journal)&&s.disabled]}><Text style={s.link}>{!unlocked ? 'Complete the first recipe to discover more' : e?.ending !== undefined ? 'Revisit your story →' : e?.first !== undefined ? 'Continue your story →' : 'A discovery is waiting →'}</Text></Pressable>
      </View>;
    })}</View>}
    <View style={s.footer}><Pressable accessibilityRole="button" onPress={onOpenNotes} style={s.quiet}><Text style={s.link}>Brewing help</Text></Pressable><Text style={s.small}>Discovery journal · saved only on this device for this campaign. Story choices and optional reading-interest responses are kept separately. They are not yet used to rank books.</Text>{syncWarning ? <Text accessibilityRole="alert" style={s.error}>{syncWarning}</Text> : null}</View>
  </ScrollView>;
}
const s=StyleSheet.create({
  root:{flex:1,backgroundColor:'#0D101A'},content:{alignItems:'center',padding:20,paddingBottom:45},toolbar:{width:'100%',maxWidth:1120,flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:10},mobileToolbar:{flexDirection:'column',justifyContent:'center',gap:4},quiet:{padding:12,minHeight:44},link:{color:'#F3DFB7',fontSize:14,fontWeight:'700'},eyebrow:{color:'#B4A58D',fontSize:10,letterSpacing:2,fontWeight:'800'},stars:{color:'#ECCA7E',fontSize:16,fontWeight:'800'},hero:{maxWidth:760,alignItems:'center',paddingVertical:30,gap:12},seal:{fontSize:44,color:'#D8B86E'},title:{fontSize:36,lineHeight:42,color:'#F8EDD8',fontWeight:'700',textAlign:'center'},intro:{fontSize:16,lineHeight:25,color:'#BFC3CF',textAlign:'center',maxWidth:640},grid:{width:'100%',maxWidth:1120,flexDirection:'row',flexWrap:'wrap',justifyContent:'space-between',gap:18},realm:{padding:18,borderWidth:1,borderRadius:18,gap:15},realmTop:{flexDirection:'row',gap:14,alignItems:'center'},realmIcon:{fontSize:40},flex:{flex:1,gap:5},realmTitle:{fontSize:23,color:'#F8EDD8',fontWeight:'700'},small:{fontSize:13,lineHeight:20,color:'#BBC0CB'},recipes:{flexDirection:'row',gap:8},recipe:{flex:1,padding:10,minHeight:106,borderRadius:10,backgroundColor:'#FFFFFF09',justifyContent:'space-between',gap:8},recipeNumber:{color:'#AFA48C',fontSize:12},recipeName:{color:'#F5EAD4',fontSize:12,fontWeight:'700'},gold:{color:'#ECCA7E',fontSize:12},discoveryButton:{padding:14,borderRadius:10,backgroundColor:'#FFFFFF0C',minHeight:48},disabled:{opacity:0.4},story:{width:'100%',maxWidth:780,borderWidth:1,borderColor:'#67583A',borderRadius:20,padding:24,backgroundColor:'#171C29',gap:20},prose:{color:'#E1DEDA',fontSize:18,lineHeight:29},chapter:{color:'#F4E3BF',fontSize:20,lineHeight:27,fontWeight:'700'},keepsake:{padding:16,borderLeftWidth:3,borderColor:'#D1AB58',backgroundColor:'#D1AB580C'},choices:{gap:12},choice:{padding:20,borderRadius:12,borderWidth:1,borderColor:'#655A43',gap:8,backgroundColor:'#242938'},chosen:{backgroundColor:'#49412D',borderColor:'#ECCA7E'},feedback:{gap:14,borderTopWidth:1,borderColor:'#434958',paddingTop:24},row:{flexDirection:'row',flexWrap:'wrap',gap:8},pill:{minHeight:44,padding:12,borderWidth:1,borderColor:'#5B5F6B',borderRadius:24},footer:{width:'100%',maxWidth:780,alignItems:'center',marginTop:24,gap:10},error:{color:'#FFBBA6',padding:12,fontSize:14},
});
