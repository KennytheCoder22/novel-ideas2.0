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

type GameReadingAgeTheme = {
  accentColor: string;
  borderColor: string;
  textColor: string;
  selectedBackgroundColor: string;
};

const defaultTheme: GameReadingAgeTheme = {
  accentColor: "#eed59a",
  borderColor: "#76938a",
  textColor: "#dce7df",
  selectedBackgroundColor: "rgba(238, 213, 154, 0.14)",
};

/** Remount gameplay on a route-age change so in-flight choices retain their original scope. */
export function withGameReadingAge(Game: ComponentType, theme: GameReadingAgeTheme = defaultTheme) {
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
                { borderColor: theme.borderColor },
                selected && {
                  borderColor: theme.accentColor,
                  backgroundColor: theme.selectedBackgroundColor,
                },
                pressed && !selected && styles.pressed,
              ]}
            >
              <Text
                numberOfLines={1}
                style={[
                  styles.label,
                  { color: selected ? theme.accentColor : theme.textColor },
                  selected && styles.selectedLabel,
                ]}
              >
                {label}
              </Text>
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
    alignSelf: "center",
    maxWidth: "100%",
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: 6,
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  button: {
    minHeight: 36,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 12,
    borderRadius: 999,
    borderWidth: 1,
    backgroundColor: "transparent",
  },
  label: { fontWeight: "700", fontSize: 12, textAlign: "center" },
  selectedLabel: { fontWeight: "900" },
  pressed: { opacity: 0.72 },
});
