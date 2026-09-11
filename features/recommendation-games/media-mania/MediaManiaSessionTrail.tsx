import { StyleSheet, Text, View } from 'react-native';
import { mediaManiaSessionProgress } from './mediaManiaSessionProgress';

export function MediaManiaSessionTrail({ completedRoundCount }: { completedRoundCount: number }) {
  const progress = mediaManiaSessionProgress(completedRoundCount);
  return <View style={styles.panel}>
    <View style={styles.heading}>
      <Text style={styles.label}>SET {progress.setNumber}</Text>
      <Text style={styles.count}>{progress.completed} / {progress.setSize} choices</Text>
    </View>
    <View accessibilityRole="progressbar" accessibilityLabel={`Set ${progress.setNumber} choices completed`} accessibilityValue={{ min: 0, max: progress.setSize, now: progress.completed }} style={styles.steps}>
      {Array.from({ length: progress.setSize }, (_, index) => <View key={index} style={[styles.step, index < progress.completed && styles.complete]} />)}
    </View>
    <Text accessibilityLiveRegion="polite" style={styles.copy}>{progress.atCheckpoint
      ? `Set ${progress.setNumber} complete! Keep exploring with the next choice, or save and leave whenever you like.`
      : 'Follow your taste. There are no right answers, and unfamiliar titles never cost you points.'}</Text>
  </View>;
}
const styles = StyleSheet.create({
  panel: { gap: 8, marginTop: 12 },
  heading: { flexDirection: 'row', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 },
  label: { color: '#fde68a', fontWeight: '900', letterSpacing: 1.3 },
  count: { color: '#d6e5f5', fontWeight: '700' },
  steps: { flexDirection: 'row', gap: 6 },
  step: { flex: 1, height: 8, backgroundColor: '#183651', borderRadius: 4 },
  complete: { backgroundColor: '#5ee1b7' },
  copy: { color: '#b8c8dc', fontSize: 13, lineHeight: 19 },
});
