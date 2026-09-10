import { useState } from 'react';
import { View, Text, Pressable, StyleSheet, Image } from 'react-native';
import { UNWRITTEN_MAP_SCENARIOS, type UnwrittenMapSaveV2 } from '../../../lib/recommendationGames/unwrittenMap';
import { ADVENTURE_ACTIVITIES, ISLAND_CLUES, adventureProgress, adventureEpilogue } from '../../../lib/recommendationGames/unwrittenMapAdventure';

export function AdventureActivity({ scenarioId, onContinue }: { scenarioId: string; onContinue: () => void }) {
  const activity = ADVENTURE_ACTIVITIES[scenarioId];
  const [feedback, setFeedback] = useState('');
  const [solved, setSolved] = useState(false);
  if (!activity) return null;
  return <View style={s.card}>
    <Text style={s.eyebrow}>A MOMENT ON THE JOURNEY</Text>
    <Text accessibilityRole="header" style={s.title}>{activity.title}</Text>
    <Text style={s.copy}>{activity.prompt}</Text>
    {!solved ? activity.options.map((option, index) => <Pressable key={option} accessibilityRole="button" style={s.button} onPress={() => {
      if (index === activity.answer) { setSolved(true); setFeedback(activity.success); }
      else setFeedback('Not quite. ' + activity.hint);
    }}><Text style={s.buttonText}>{option}</Text></Pressable>) : null}
    <Text accessibilityLiveRegion="polite" style={s.copy}>{feedback}</Text>
    {!solved ? <Pressable accessibilityRole="button" style={s.button} onPress={() => { setSolved(true); setFeedback(activity.success); }}><Text style={s.buttonText}>Ask a companion for help</Text></Pressable> : null}
    <Text style={s.small}>A little extra discovery. Take help or move on; the same clue is yours either way.</Text>
    <Pressable accessibilityRole="button" style={s.button} onPress={onContinue}><Text style={s.buttonText}>{solved ? 'Continue the journey' : 'Keep exploring'}</Text></Pressable>
  </View>;
}

export function AdventureJournal({ save, finale = false }: { save: UnwrittenMapSaveV2; finale?: boolean }) {
  const [expanded, setExpanded] = useState(finale);
  const [target, setTarget] = useState('');
  const progress = adventureProgress(save);
  const targetScenario = progress.remaining.find(item => item.id === target);
  const nearest = [...progress.remaining].sort((a, b) => (Math.abs(a.position.x-save.position.x)+Math.abs(a.position.y-save.position.y))-(Math.abs(b.position.x-save.position.x)+Math.abs(b.position.y-save.position.y)))[0];
  const goal = targetScenario || nearest;
  return <View style={s.card}>
    <Text style={s.eyebrow}>{finale ? 'THE ISLAND BETWEEN THE STARS' : `ASTER’S UNFINISHED ATLAS · ${progress.clues.length}/4 CLUES`}</Text>
    <Text accessibilityRole="header" style={s.title}>{finale ? 'A shore worth finding.' : progress.ready ? 'The island is coming into focus.' : 'Find the shore that no light touches.'}</Text>
    <Text style={s.copy}>{finale ? adventureEpilogue(save) : 'Aster vanished while mapping an island no one else could see. Four places remember the way: the orchard, the bridge, the mirror marsh and the lighthouse. Explore them in any order; every approach can reveal a clue.'}</Text>
    {progress.clues.map(clue => <View key={clue.id} style={s.clue}><Text style={s.clueTitle}>✦ {clue.name}</Text><Text style={s.copy}>{clue.text}</Text></View>)}
    {!finale ? <Pressable accessibilityRole="button" accessibilityState={{ expanded }} style={s.button} onPress={() => setExpanded(!expanded)}><Text style={s.buttonText}>{expanded ? 'Fold the atlas' : 'Open atlas & directions'}</Text></Pressable> : null}
    {expanded ? <>
      <View accessibilityLabel="Illustrated journey overview" style={s.map}>
        <Image source={require('../../../assets/games/unwritten-map/board-map.webp')} style={{ position: 'absolute', width: '100%', height: '100%', opacity: 0.65 }} resizeMode="stretch" accessibilityElementsHidden />
        {UNWRITTEN_MAP_SCENARIOS.map(item => {
          const done = save.decisions.some(d => d.scenarioId === item.id);
          return <View key={item.id} style={[s.pin, { left: `${item.position.x / 29 * 88}%`, top: `${item.position.y / 21 * 80}%`, backgroundColor: done ? '#234e3e' : item.color }]}><Text style={s.pinText}>{done ? '✓' : '◇'}</Text></View>;
        })}
        <Text style={s.mapCaption}>{finale ? 'YOUR TWELVE PLACES, ONE JOURNEY' : 'N ↑     ✓ RECORDED     ◇ UNEXPLORED'}</Text>
      </View>
      {UNWRITTEN_MAP_SCENARIOS.map(item => {
        const decision = save.decisions.find(d => d.scenarioId === item.id);
        return <Pressable key={item.id} disabled={!!decision || finale} accessibilityRole="button" accessibilityLabel={`${item.location}${decision ? ', recorded' : ', show directions'}`} style={s.row} onPress={() => setTarget(item.id)}><Text style={s.copy}>{decision ? '✓' : '◇'} {item.location}{ISLAND_CLUES[item.id] ? ' · island clue' : ''}</Text></Pressable>;
      })}
      {!finale && goal ? <Text accessibilityLiveRegion="polite" style={s.clueTitle}>Toward {goal.location}: {goal.position.x === save.position.x ? '' : `${Math.abs(goal.position.x-save.position.x)} tiles ${goal.position.x > save.position.x ? 'east' : 'west'} `}{goal.position.y === save.position.y ? '' : `${Math.abs(goal.position.y-save.position.y)} tiles ${goal.position.y > save.position.y ? 'south' : 'north'}`}. Follow roads around water and trees.</Text> : null}
    </> : null}
  </View>;
}

export function AdventureDiscovery({ scenarioId }: { scenarioId: string }) {
  const clue = ISLAND_CLUES[scenarioId];
  return clue ? <View style={s.card}><Text style={s.eyebrow}>ATLAS CLUE FOUND</Text><Text style={s.title}>{clue.name}</Text><Text style={s.copy}>{clue.text}</Text></View> : null;
}

const s = StyleSheet.create({
  card: { width: '100%', maxWidth: 940, alignSelf: 'center', backgroundColor: '#eee0b6', borderColor: '#92733d', borderWidth: 1, borderRadius: 12, padding: 20, gap: 12, marginVertical: 12 },
  eyebrow: { color: '#725a29', fontSize: 11, fontWeight: '800', letterSpacing: 1.5 },
  title: { color: '#243e31', fontSize: 24, fontWeight: '800' },
  copy: { color: '#343c2c', fontSize: 15, lineHeight: 23 },
  small: { color: '#5b583f', fontSize: 12, lineHeight: 18 },
  button: { backgroundColor: '#234e3e', borderRadius: 8, padding: 14, minHeight: 48 },
  buttonText: { color: '#fff2ca', fontWeight: '700', fontSize: 15 },
  clue: { borderLeftWidth: 3, borderLeftColor: '#987634', paddingLeft: 12, gap: 4 },
  clueTitle: { color: '#234e3e', fontWeight: '700', fontSize: 15 },
  row: { paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#cebd8e', minHeight: 44 },
  map: { height: 230, backgroundColor: '#d1c798', borderRadius: 10, borderWidth: 1, borderColor: '#92733d' },
  pin: { position: 'absolute', width: 27, height: 27, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  pinText: { color: '#fff8db', fontWeight: '800' },
  mapCaption: { position: 'absolute', bottom: 8, left: 12, fontSize: 10, color: '#243e31', fontWeight: '800' },
});
