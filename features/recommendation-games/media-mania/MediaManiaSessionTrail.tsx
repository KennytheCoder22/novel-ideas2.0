import { StyleSheet, Text, View } from 'react-native';
import { mediaManiaSessionProgress } from './mediaManiaSessionProgress';

export function MediaManiaSessionTrail({ completedRoundCount, tone = 'like' }: { completedRoundCount: number; tone?: 'like' | 'dislike' }) {
  const progress = mediaManiaSessionProgress(completedRoundCount);
  return <View style={styles.panel}>
    <View style={styles.heading}>
      <Text style={styles.label}>SET {progress.setNumber}</Text>
      <Text style={styles.count}>{progress.completed} / {progress.setSize} choices</Text>
    </View>
    <View accessibilityRole="progressbar" accessibilityLabel={`Set ${progress.setNumber} choices completed`} accessibilityValue={{ min: 0, max: progress.setSize, now: progress.completed }} style={styles.steps}>
      {Array.from({ length: progress.setSize }, (_, index) => <View key={index} style={[styles.step, index < progress.completed && (tone === 'dislike' ? styles.completeDislike : styles.completeLike)]} />)}
    </View>
    <Text accessibilityLiveRegion="polite" style={styles.copy}>{progress.atCheckpoint
      ? `Set ${progress.setNumber} complete! Keep exploring with the next choice, or save and leave whenever you like.`
      : 'Follow your taste. There are no right answers, and unfamiliar titles never cost you points.'}</Text>
  </View>;
}
const styles = StyleSheet.create({
  panel: { flex: 1, minWidth: 210, gap: 7 },
  heading: { flexDirection: 'row', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 },
  label: { color: '#ffe08a', fontSize: 11, fontWeight: '900', letterSpacing: 1.3 },
  count: { color: '#e4edf7', fontSize: 12, fontWeight: '800' },
  steps: { flexDirection: 'row', gap: 6 },
  step: { flex: 1, height: 8, backgroundColor: 'rgba(4, 16, 29, 0.82)', borderRadius: 4, borderWidth: 1, borderColor: 'rgba(181, 204, 222, 0.15)' },
  completeLike: { backgroundColor: '#5ee1b7', borderColor: '#a7f3d0' },
  completeDislike: { backgroundColor: '#f5608d', borderColor: '#ffc0d1' },
  copy: { color: '#becbd9', fontSize: 11, lineHeight: 16 },
});
