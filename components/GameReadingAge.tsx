import type { ComponentType } from "react";
import { Pressable, Text, View, StyleSheet } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import {
  buildGameReadingAgeParams,
  normalizeGameRouteAgeBand,
  type GameRouteParams,
} from "../lib/recommendationGames/gameRecommendationRouteConfig";

const bands = [
  ["kids", "Kids"],
  ["preteens", "Pre-Teens"],
  ["teens", "Teens"],
  ["adult", "Adults"],
] as const;

/** Remount gameplay on a route-age change so in-flight choices retain their original scope. */
export function withGameReadingAge(Game: ComponentType) {
  return function GameWithReadingAge() {
    const params = useLocalSearchParams() as GameRouteParams;
    const age = normalizeGameRouteAgeBand(params.ageBand);
    return <View style={styles.frame}>
      <View style={styles.bar} accessibilityLabel="Reading age">
        {bands.map(([id, label]) => {
          const selected = age === id;
          return (
            <Pressable
              key={id}
              accessibilityRole="button"
              accessibilityLabel={`${label} reading age`}
              accessibilityHint={selected ? "Currently selected" : "Switches this game to separate progress for this reading age"}
              accessibilityState={{ selected }}
              hitSlop={2}
              onPress={() => {
                if (!selected) router.setParams(buildGameReadingAgeParams(params, id));
              }}
              style={({ pressed }) => [
                styles.button,
                selected && styles.selected,
                pressed && !selected && styles.pressed,
              ]}
            >
              <Text numberOfLines={1} style={[styles.label, selected && styles.selectedLabel]}>{label}</Text>
            </Pressable>
          );
        })}
      </View>
      <Game key={`${age}:${params.readingAgeOverride || "inherited"}`} />
    </View>;
  };
}

const styles = StyleSheet.create({
  frame: { flex: 1 },
  bar: {
    minHeight: 52,
    flexDirection: "row",
    gap: 6,
    backgroundColor: "#102e31",
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  button: {
    flex: 1,
    minWidth: 0,
    minHeight: 44,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 4,
    borderRadius: 7,
    borderWidth: 1,
    borderColor: "#76938a",
  },
  label: { color: "#dce7df", fontWeight: "700", fontSize: 12, textAlign: "center" },
  selected: { backgroundColor: "#f0d08b", borderColor: "#fff2d5" },
  selectedLabel: { color: "#102e31", fontWeight: "900" },
  pressed: { backgroundColor: "#294a47" },
});
