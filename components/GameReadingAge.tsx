import { useState, type ComponentType } from "react";
import { Pressable, Text, View, StyleSheet } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { normalizeGameRouteAgeBand, type GameRouteParams } from "../lib/recommendationGames/gameRecommendationRouteConfig";

const bands = [["kids", "Kids"], ["preteens", "Pre-Teens"], ["teens", "Teens"], ["adult", "Adults"]] as const;

/** Remount gameplay on a route-age change so in-flight choices retain their original scope. */
export function withGameReadingAge(Game: ComponentType) {
  return function GameWithReadingAge() {
    const params = useLocalSearchParams() as GameRouteParams;
    const age = normalizeGameRouteAgeBand(params.ageBand);
    const [open, setOpen] = useState(false);
    const [pending, setPending] = useState(age);
    return <View style={styles.frame}>
      <View style={styles.bar}>
        <Pressable accessibilityRole="button" accessibilityState={{ expanded: open }} onPress={() => { setPending(age); setOpen(!open); }} style={styles.button}>
          <Text style={styles.label}>Reading age: {bands.find(([id]) => id === age)![1]} · Change</Text>
        </Pressable>
        {open ? <View style={styles.panel}>
          <Text style={styles.copy}>Choose the reading age for this game. Switching opens separate progress for that age group. Your library stays the same.</Text>
          <View style={styles.options}>{bands.map(([id, label]) => <Pressable key={id} accessibilityRole="radio" accessibilityState={{ checked: pending === id }} onPress={() => setPending(id)} style={[styles.button, pending === id && styles.selected]}><Text style={styles.label}>{label}</Text></Pressable>)}</View>
          <View style={styles.options}>
            <Pressable accessibilityRole="button" style={styles.button} onPress={() => { setOpen(false); if (pending !== age) router.setParams({ ageBand: pending, readingAgeOverride: "1" }); }}><Text style={styles.label}>Use this reading age</Text></Pressable>
            <Pressable accessibilityRole="button" style={styles.button} onPress={() => setOpen(false)}><Text style={styles.label}>Cancel</Text></Pressable>
          </View>
        </View> : null}
      </View>
      <Game key={`${age}:${params.readingAgeOverride || "inherited"}`} />
    </View>;
  };
}
const styles = StyleSheet.create({
 frame: { flex: 1 }, bar: { backgroundColor: "#102e31", paddingHorizontal: 16, paddingVertical: 6 },
 button: { minHeight: 44, justifyContent: "center", paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, borderWidth: 1, borderColor: "#76938a", alignSelf: "flex-start" },
 label: { color: "#fff2d5", fontWeight: "700", fontSize: 14 }, copy: { color: "#e0e9e3", fontSize: 14, lineHeight: 21 },
 panel: { gap: 10, paddingVertical: 10 }, options: { flexDirection: "row", flexWrap: "wrap", gap: 8 }, selected: { backgroundColor: "#45635b", borderColor: "#eed59a" },
});
