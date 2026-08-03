import React, { useCallback, useRef, useState } from "react";
import { Platform, Text, TextInput, TouchableOpacity, View } from "react-native";
import { isValidHex } from "../../constants/brandTheme";

interface Props {
  label: string;
  value: string; // 6-digit hex, e.g. "#0b1e33"
  onChange: (hex: string) => void;
  theme: {
    text: string;
    muted: string;
    subtext: string;
    inputBg: string;
    inputBorder: string;
    cardBorder: string;
  };
  /** Optional extra note shown below the field */
  hint?: string;
  testID?: string;
}

/**
 * Full-range color picker field.
 * On web: uses the browser's native <input type="color"> plus an editable hex text field.
 * On native (future-proof): shows hex text input only.
 */
export function ColorPickerField({ label, value, onChange, theme, hint, testID }: Props) {
  const isWeb = Platform.OS === "web";

  // Local draft for the hex text input so the user can type a complete value
  // before committing (avoids spurious updates mid-type).
  const [hexDraft, setHexDraft] = useState(value);
  const prevValue = useRef(value);

  // Keep hexDraft in sync when parent value changes externally.
  if (prevValue.current !== value) {
    prevValue.current = value;
    setHexDraft(value);
  }

  const commitHex = useCallback(
    (raw: string) => {
      const normalized = raw.trim().startsWith("#") ? raw.trim() : `#${raw.trim()}`;
      if (isValidHex(normalized)) {
        onChange(normalized.toLowerCase());
        setHexDraft(normalized.toLowerCase());
      } else {
        // Revert draft to last-good value
        setHexDraft(value);
      }
    },
    [onChange, value]
  );

  const commitPickerHex = useCallback(
    (raw: string) => {
      if (!isValidHex(raw)) return;
      const normalized = raw.toLowerCase();
      onChange(normalized);
      setHexDraft(normalized);
    },
    [onChange]
  );

  const swatchStyle = {
    width: 36,
    height: 36,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: theme.cardBorder,
    backgroundColor: isValidHex(value) ? value : "#888888",
    overflow: "hidden" as const,
  };

  return (
    <View testID={testID} style={{ marginBottom: 14 }}>
      <Text style={{ fontSize: 12, fontWeight: "800", color: theme.muted, marginBottom: 6 }}>{label}</Text>

      <View style={{ flexDirection: "row", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        {/* Color swatch / native picker trigger on web */}
        {isWeb ? (
          <View style={swatchStyle}>
            {/* Native <input type="color"> rendered as an absolutely-covering transparent element on web */}
            <input
              type="color"
              value={isValidHex(value) ? value : "#888888"}
              onInput={(e: any) => commitPickerHex(String(e?.target?.value || ""))}
              onChange={(e: any) => commitPickerHex(String(e?.target?.value || ""))}
              onBlur={(e: any) => commitPickerHex(String(e?.target?.value || ""))}
              style={{
                position: "absolute",
                inset: 0,
                opacity: 0,
                cursor: "pointer",
                width: "100%",
                height: "100%",
                border: "none",
                padding: 0,
              }}
              title={`Pick ${label}`}
              aria-label={`Pick ${label}`}
            />
          </View>
        ) : (
          <View style={swatchStyle} />
        )}

        {/* Editable hex text */}
        <TextInput
          value={hexDraft}
          onChangeText={setHexDraft}
          onBlur={() => commitHex(hexDraft)}
          onSubmitEditing={() => commitHex(hexDraft)}
          placeholder="#000000"
          placeholderTextColor="#7a8aa0"
          maxLength={7}
          autoCapitalize="none"
          autoCorrect={false}
          style={{
            borderWidth: 1,
            borderRadius: 10,
            paddingHorizontal: 10,
            paddingVertical: 8,
            fontSize: 13,
            fontWeight: "700",
            color: theme.text,
            backgroundColor: theme.inputBg,
            borderColor: theme.inputBorder,
            width: 100,
          }}
        />

        {!isValidHex(hexDraft) && hexDraft !== "" ? (
          <Text style={{ fontSize: 11, color: "#fecaca" }}>Invalid hex</Text>
        ) : null}
      </View>

      {hint ? (
        <Text style={{ fontSize: 11, color: theme.subtext, marginTop: 4, lineHeight: 16 }}>{hint}</Text>
      ) : null}
    </View>
  );
}
