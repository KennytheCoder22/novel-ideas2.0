import React from "react";
import { Text, View } from "react-native";
import { autoChooseFontColor, isValidHex } from "../../constants/brandTheme";

interface Props {
  mainColor: string;    // hex
  highlightColor: string; // hex
  fontColor: string;    // hex (for header/banner text)
  libraryName?: string;
}

/** Live preview panel showing representative app surfaces. Updates from draft state. */
export function ThemePreviewPanel({ mainColor, highlightColor, fontColor, libraryName = "Your Library" }: Props) {
  const safeMain = isValidHex(mainColor) ? mainColor : "#0b1e33";
  const safeHighlight = isValidHex(highlightColor) ? highlightColor : "#fbbf24";
  const safeFont = isValidHex(fontColor) ? fontColor : autoChooseFontColor(safeMain);

  // Derive readable text on highlight
  const textOnHighlight = autoChooseFontColor(safeHighlight);
  // Body text is always light (dark-base app)
  const bodyText = "#e5efff";
  const subtextColor = "#cbd5f5";
  const cardBg = "#10243f";
  const appBg = "#0b1e33";

  return (
    <View
      accessibilityLabel="Theme preview"
      style={{
        borderRadius: 14,
        overflow: "hidden",
        borderWidth: 2,
        borderColor: safeHighlight,
        width: "100%",
        maxWidth: 400,
        minWidth: 0,
      }}
    >
      {/* App background + body text */}
      <View style={{ backgroundColor: appBg, paddingHorizontal: 14, paddingTop: 10, paddingBottom: 6 }}>
        <Text style={{ fontSize: 11, fontWeight: "800", color: subtextColor, marginBottom: 8 }}>PREVIEW</Text>
      </View>

      {/* Header / banner strip */}
      <View
        style={{
          backgroundColor: safeMain,
          paddingHorizontal: 14,
          paddingVertical: 10,
          flexDirection: "row",
          alignItems: "center",
          gap: 8,
        }}
      >
        {/* Logo placeholder */}
        <View
          style={{
            width: 28,
            height: 28,
            borderRadius: 6,
            backgroundColor: safeHighlight,
            justifyContent: "center",
            alignItems: "center",
          }}
        >
          <Text style={{ fontSize: 12, fontWeight: "900", color: textOnHighlight }}>N</Text>
        </View>
        <Text style={{ fontSize: 15, fontWeight: "900", color: safeFont }} numberOfLines={1}>
          {libraryName}
        </Text>
      </View>

      {/* App body */}
      <View style={{ backgroundColor: appBg, padding: 12, gap: 10 }}>
        {/* Recommendation card */}
        <View
          style={{
            backgroundColor: cardBg,
            borderRadius: 10,
            borderWidth: 1.5,
            borderColor: safeHighlight,
            padding: 12,
          }}
        >
          <Text style={{ fontSize: 13, fontWeight: "900", color: bodyText }}>The Lantern Archive</Text>
          <Text style={{ fontSize: 11, color: subtextColor, marginTop: 2 }}>NovelIdeas · Fiction</Text>
          <View
            style={{
              marginTop: 8,
              height: 4,
              borderRadius: 2,
              backgroundColor: safeHighlight,
              width: "60%",
            }}
          />
        </View>

        {/* Buttons row */}
        <View style={{ flexDirection: "row", gap: 8 }}>
          {/* Selected button */}
          <View
            style={{
              flex: 1,
              borderRadius: 10,
              borderWidth: 2,
              borderColor: safeHighlight,
              backgroundColor: safeHighlight,
              paddingVertical: 8,
              alignItems: "center",
            }}
          >
            <Text style={{ fontSize: 12, fontWeight: "900", color: textOnHighlight }}>Selected</Text>
          </View>
          {/* Unselected button */}
          <View
            style={{
              flex: 1,
              borderRadius: 10,
              borderWidth: 2,
              borderColor: "#223b6b",
              backgroundColor: appBg,
              paddingVertical: 8,
              alignItems: "center",
            }}
          >
            <Text style={{ fontSize: 12, fontWeight: "900", color: bodyText }}>Unselected</Text>
          </View>
        </View>
      </View>
    </View>
  );
}
