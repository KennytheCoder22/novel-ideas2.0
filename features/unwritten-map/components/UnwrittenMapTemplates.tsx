import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import type { PropsWithChildren, ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";

export const UNWRITTEN_MAP_TOKENS = {
  color: {
    ink: "#302416",
    darkGreen: "#17251c",
    forest: "#253b2c",
    parchment: "#f0dda6",
    parchmentLight: "#f7e7b0",
    parchmentPanel: "rgba(242,222,169,0.97)",
    gold: "#c18a37",
    goldLine: "#80612e",
    mutedInk: "#58452d",
    danger: "#743c2e",
  },
  radius: {
    control: 3,
    panel: 4,
  },
  space: {
    control: 44,
    gutter: 14,
    panel: 22,
  },
  breakpoint: {
    compact: 700,
    tablet: 1024,
  },
  font: {
    display: "Georgia",
  },
} as const;

type TemplateProps = PropsWithChildren<{
  testID: string;
  accent?: string;
  decoration?: ReactNode;
}>;

function CartographicRule({ accent }: { accent: string }) {
  return (
    <View pointerEvents="none" style={styles.rule}>
      <View style={[styles.ruleLine, { backgroundColor: accent }]} />
      <MaterialCommunityIcons name="compass-rose" size={17} color={accent} />
      <View style={[styles.ruleLine, { backgroundColor: accent }]} />
    </View>
  );
}

function ParchmentTemplate({
  children,
  testID,
  accent = UNWRITTEN_MAP_TOKENS.color.goldLine,
  decoration,
  variant,
}: TemplateProps & { variant: "entry" | "map" | "encounter" | "result" | "history" }) {
  return (
    <View
      testID={testID}
      style={[
        styles.template,
        variant === "entry" && styles.entry,
        variant === "map" && styles.map,
        variant === "encounter" && styles.encounter,
        variant === "result" && styles.result,
        variant === "history" && styles.history,
        { borderColor: accent },
      ]}
    >
      <View pointerEvents="none" style={styles.cornerTopLeft} />
      <View pointerEvents="none" style={styles.cornerBottomRight} />
      {decoration}
      {variant === "entry" || variant === "map" ? null : <CartographicRule accent={accent} />}
      {children}
    </View>
  );
}

export function UnwrittenMapEntryTemplate(props: TemplateProps) {
  return <ParchmentTemplate {...props} variant="entry" />;
}

export function UnwrittenMapRegionMapTemplate(props: TemplateProps) {
  return <ParchmentTemplate {...props} variant="map" />;
}

export function UnwrittenMapEncounterTemplate(props: TemplateProps) {
  return <ParchmentTemplate {...props} variant="encounter" />;
}

export function UnwrittenMapResultTemplate(props: TemplateProps) {
  return <ParchmentTemplate {...props} variant="result" />;
}

export function UnwrittenMapFieldNotesTemplate({
  title = "FIELD NOTES",
  subtitle,
  children,
  testID,
  accent,
  decoration,
}: TemplateProps & { title?: string; subtitle?: string }) {
  return (
    <ParchmentTemplate testID={testID} accent={accent} decoration={decoration} variant="history">
      <View style={styles.historyHeading}>
        <MaterialCommunityIcons name="notebook-outline" size={24} color={UNWRITTEN_MAP_TOKENS.color.ink} />
        <View style={styles.historyHeadingCopy}>
          <Text style={styles.historyTitle}>{title}</Text>
          {subtitle ? <Text style={styles.historySubtitle}>{subtitle}</Text> : null}
        </View>
        <MaterialCommunityIcons name="feather" size={22} color={UNWRITTEN_MAP_TOKENS.color.ink} />
      </View>
      {children}
    </ParchmentTemplate>
  );
}

const styles = StyleSheet.create({
  template: {
    position: "relative",
    width: "100%",
    overflow: "hidden",
    borderWidth: 2,
    borderRadius: UNWRITTEN_MAP_TOKENS.radius.panel,
    backgroundColor: UNWRITTEN_MAP_TOKENS.color.parchmentPanel,
    shadowColor: "#000",
    shadowOpacity: 0.44,
    shadowRadius: 13,
    shadowOffset: { width: 4, height: 7 },
  },
  entry: {
    maxWidth: 690,
    minHeight: 500,
    paddingHorizontal: 24,
    paddingVertical: 30,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(239,217,163,0.72)",
  },
  map: {
    maxWidth: 980,
    alignItems: "center",
    borderWidth: 0,
    backgroundColor: "transparent",
    shadowOpacity: 0,
  },
  encounter: {
    maxWidth: 920,
    minHeight: 430,
    paddingHorizontal: 24,
    paddingVertical: 22,
    marginTop: 6,
  },
  result: {
    maxWidth: 920,
    minHeight: 430,
    paddingHorizontal: 34,
    paddingVertical: 28,
    marginTop: 8,
    backgroundColor: "rgba(246,226,177,0.98)",
  },
  history: {
    maxWidth: 760,
    padding: 18,
    marginVertical: 8,
    alignSelf: "center",
    backgroundColor: "rgba(242,222,169,0.98)",
  },
  rule: {
    width: "100%",
    minHeight: 24,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 8,
    opacity: 0.7,
  },
  ruleLine: {
    flex: 1,
    height: 1,
  },
  cornerTopLeft: {
    position: "absolute",
    left: 8,
    top: 8,
    width: 22,
    height: 22,
    borderLeftWidth: 1,
    borderTopWidth: 1,
    borderColor: "rgba(48,36,22,0.35)",
  },
  cornerBottomRight: {
    position: "absolute",
    right: 8,
    bottom: 8,
    width: 22,
    height: 22,
    borderRightWidth: 1,
    borderBottomWidth: 1,
    borderColor: "rgba(48,36,22,0.35)",
  },
  historyHeading: {
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderBottomWidth: 2,
    borderColor: "#8a7147",
    paddingBottom: 8,
  },
  historyHeadingCopy: {
    flex: 1,
  },
  historyTitle: {
    color: UNWRITTEN_MAP_TOKENS.color.ink,
    fontFamily: UNWRITTEN_MAP_TOKENS.font.display,
    fontSize: 14,
    fontWeight: "900",
    letterSpacing: 2,
  },
  historySubtitle: {
    color: UNWRITTEN_MAP_TOKENS.color.mutedInk,
    fontSize: 10,
    lineHeight: 15,
    marginTop: 2,
  },
});
