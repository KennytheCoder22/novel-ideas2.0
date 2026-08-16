import { useEffect, useRef, useState } from "react";
import Slider from "@react-native-community/slider";
import { Platform, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { isValidHex } from "../constants/brandTheme";
import { hexToHsv, hsvToHex, type HsvColor } from "../lib/colorSelection";

type Props = {
  label: string;
  value: string;
  inheritedValue: string;
  onChange: (hex: string) => void;
  onUseInherited: () => void;
  isOverridden: boolean;
  testID: string;
};

const HUE_STOPS = [0, 30, 60, 120, 180, 210, 240, 280, 320] as const;

export function PatronColorPickerField({
  label,
  value,
  inheritedValue,
  onChange,
  onUseInherited,
  isOverridden,
  testID,
}: Props) {
  const safeValue = isValidHex(value) ? value.toLowerCase() : inheritedValue.toLowerCase();
  const [hexDraft, setHexDraft] = useState(safeValue);
  const [hsv, setHsv] = useState(() => hexToHsv(safeValue));
  const lastEmittedHex = useRef<string | null>(null);

  useEffect(() => {
    setHexDraft(safeValue);
    if (lastEmittedHex.current === safeValue) {
      lastEmittedHex.current = null;
      return;
    }
    setHsv(hexToHsv(safeValue));
  }, [isOverridden, safeValue]);

  function changeHsv(next: Partial<HsvColor>) {
    const nextHsv = { ...hsv, ...next };
    const nextHex = hsvToHex(nextHsv);
    setHsv(nextHsv);
    setHexDraft(nextHex);
    lastEmittedHex.current = nextHex;
    onChange(nextHex);
  }

  function commitHex() {
    const normalized = hexDraft.trim().startsWith("#") ? hexDraft.trim() : `#${hexDraft.trim()}`;
    if (isValidHex(normalized)) {
      const nextHex = normalized.toLowerCase();
      setHsv(hexToHsv(nextHex));
      lastEmittedHex.current = nextHex;
      onChange(nextHex);
      setHexDraft(nextHex);
    } else {
      setHexDraft(safeValue);
    }
  }

  function commitNativePicker(raw: string) {
    if (!isValidHex(raw)) return;
    const nextHex = raw.toLowerCase();
    setHsv(hexToHsv(nextHex));
    setHexDraft(nextHex);
    lastEmittedHex.current = nextHex;
    onChange(nextHex);
  }

  return (
    <View testID={testID} style={styles.container}>
      <View style={styles.headingRow}>
        <Text style={styles.label}>{label}</Text>
        {isOverridden ? (
          <TouchableOpacity
            onPress={onUseInherited}
            style={styles.inheritedButton}
            accessibilityRole="button"
            accessibilityLabel={`Use inherited ${label.toLowerCase()}`}
          >
            <Text style={styles.inheritedButtonText}>Use inherited color</Text>
          </TouchableOpacity>
        ) : (
          <Text style={styles.inheritedStatus}>Using inherited color</Text>
        )}
      </View>

      <View style={styles.swatchRow}>
        <View style={[styles.swatch, { backgroundColor: safeValue }]}>
          {Platform.OS === "web" ? (
            <input
              type="color"
              value={safeValue}
              onInput={(event: any) => commitNativePicker(String(event?.target?.value || ""))}
              onChange={(event: any) => commitNativePicker(String(event?.target?.value || ""))}
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
              aria-label={`Open visual ${label.toLowerCase()} picker`}
              title={`Open visual ${label.toLowerCase()} picker`}
            />
          ) : null}
        </View>
        <View style={styles.swatchCopy}>
          <Text style={styles.currentColor}>Current color</Text>
          <Text style={styles.hexValue}>{safeValue}</Text>
          <Text style={styles.swatchHint}>
            {Platform.OS === "web" ? "Tap the swatch for your browser picker, or use the sliders." : "Use the sliders below."}
          </Text>
        </View>
      </View>

      <Text style={styles.visualPickerLabel}>Visual hue choices</Text>
      <View style={styles.hueChoices}>
        {HUE_STOPS.map((hue) => (
          <TouchableOpacity
            key={hue}
            style={[
              styles.hueChoice,
              { backgroundColor: hsvToHex({ hue, saturation: 1, value: 1 }) },
              Math.abs(hsv.hue - hue) < 15 ? styles.hueChoiceSelected : undefined,
            ]}
            onPress={() => changeHsv({ hue, saturation: Math.max(hsv.saturation, 0.65), value: Math.max(hsv.value, 0.65) })}
            accessibilityRole="button"
            accessibilityLabel={`Choose ${hue} degree hue for ${label.toLowerCase()}`}
          />
        ))}
      </View>

      <ColorSlider
        fieldLabel={label}
        label="Hue"
        value={hsv.hue}
        minimumValue={0}
        maximumValue={359}
        onChange={(hue) => changeHsv({ hue })}
        minimumTrackTintColor={hsvToHex({ hue: hsv.hue, saturation: 1, value: 1 })}
        testID={`${testID}-hue`}
      />
      <ColorSlider
        fieldLabel={label}
        label="Saturation"
        value={hsv.saturation}
        minimumValue={0}
        maximumValue={1}
        onChange={(saturation) => changeHsv({ saturation })}
        minimumTrackTintColor={hsvToHex({ hue: hsv.hue, saturation: 1, value: hsv.value })}
        testID={`${testID}-saturation`}
      />
      <ColorSlider
        fieldLabel={label}
        label="Brightness"
        value={hsv.value}
        minimumValue={0}
        maximumValue={1}
        onChange={(brightness) => changeHsv({ value: brightness })}
        minimumTrackTintColor={hsvToHex({ hue: hsv.hue, saturation: hsv.saturation, value: 1 })}
        testID={`${testID}-brightness`}
      />

      <View style={styles.hexRow}>
        <Text style={styles.hexLabel}>Hex value</Text>
        <TextInput
          value={hexDraft}
          onChangeText={setHexDraft}
          onBlur={commitHex}
          onSubmitEditing={commitHex}
          maxLength={7}
          autoCapitalize="none"
          autoCorrect={false}
          style={styles.hexInput}
          accessibilityLabel={`${label} hex value`}
        />
      </View>
    </View>
  );
}

function ColorSlider(props: {
  fieldLabel: string;
  label: string;
  value: number;
  minimumValue: number;
  maximumValue: number;
  onChange: (value: number) => void;
  minimumTrackTintColor: string;
  testID: string;
}) {
  return (
    <View style={styles.sliderRow}>
      <Text style={styles.sliderLabel}>{props.label}</Text>
      <Slider
        testID={props.testID}
        style={styles.slider}
        value={props.value}
        minimumValue={props.minimumValue}
        maximumValue={props.maximumValue}
        step={props.maximumValue > 2 ? 1 : 0.01}
        onValueChange={props.onChange}
        minimumTrackTintColor={props.minimumTrackTintColor}
        maximumTrackTintColor="#315277"
        thumbTintColor="#f8fafc"
        accessibilityLabel={`${props.fieldLabel} ${props.label.toLowerCase()} slider`}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { borderTopWidth: 1, borderTopColor: "#315277", paddingTop: 16, marginTop: 6, marginBottom: 20 },
  headingRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" },
  label: { color: "#d7e4f6", fontSize: 16, fontWeight: "900" },
  inheritedButton: { minHeight: 42, justifyContent: "center", borderWidth: 1, borderColor: "#315277", borderRadius: 10, paddingHorizontal: 12 },
  inheritedButtonText: { color: "#93c5fd", fontSize: 13, fontWeight: "800" },
  inheritedStatus: { color: "#6f8bad", fontSize: 12, fontWeight: "700" },
  swatchRow: { flexDirection: "row", alignItems: "center", gap: 14, marginTop: 14, marginBottom: 10 },
  swatch: { width: 76, height: 76, borderRadius: 14, borderWidth: 2, borderColor: "#d7e4f6", overflow: "hidden", position: "relative" },
  swatchCopy: { flex: 1 },
  currentColor: { color: "#d7e4f6", fontSize: 13, fontWeight: "800" },
  hexValue: { color: "#e5efff", fontSize: 16, fontWeight: "900", marginTop: 2 },
  swatchHint: { color: "#93aeca", fontSize: 12, lineHeight: 17, marginTop: 4 },
  visualPickerLabel: { color: "#b9cce4", fontSize: 12, fontWeight: "800", marginBottom: 8 },
  hueChoices: { flexDirection: "row", minHeight: 44, borderRadius: 10, overflow: "hidden", marginBottom: 6 },
  hueChoice: { flex: 1, minWidth: 28, minHeight: 44, borderWidth: 0 },
  hueChoiceSelected: { borderWidth: 3, borderColor: "#ffffff" },
  sliderRow: { minHeight: 52, flexDirection: "row", alignItems: "center", gap: 8 },
  sliderLabel: { color: "#b9cce4", width: 76, fontSize: 13, fontWeight: "800" },
  slider: { flex: 1, height: 44, minWidth: 180 },
  hexRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12, marginTop: 6 },
  hexLabel: { color: "#93aeca", fontSize: 12, fontWeight: "800" },
  hexInput: { width: 112, color: "#e5efff", backgroundColor: "#071526", borderColor: "#315277", borderWidth: 1, borderRadius: 9, paddingHorizontal: 10, paddingVertical: 9, fontWeight: "800" },
});
