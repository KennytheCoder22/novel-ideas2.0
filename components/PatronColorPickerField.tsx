import { useEffect, useRef, useState } from "react";
import Slider from "@react-native-community/slider";
import { Platform, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { isValidHex } from "../constants/brandTheme";
import { hexToHsv, hsvToHex, type HsvColor } from "../lib/colorSelection";

type Props = {
  label: string;
  value: string;
  inheritedValue?: string;
  onChange: (hex: string) => void;
  onUseInherited?: () => void;
  isOverridden?: boolean;
  testID: string;
};

const HUE_SPECTRUM =
  "linear-gradient(90deg, #000000 0%, #ff0000 10%, #ff8000 20%, #ffff00 30%, #00ff00 40%, #00ffff 50%, #0000ff 65%, #8000ff 75%, #ff00ff 90%, #ffffff 100%)";

export function PatronColorPickerField({
  label,
  value,
  inheritedValue,
  onChange,
  onUseInherited,
  isOverridden,
  testID,
}: Props) {
  const safeInheritedValue = isValidHex(inheritedValue || "") ? String(inheritedValue).toLowerCase() : "#000000";
  const safeValue = isValidHex(value) ? value.toLowerCase() : safeInheritedValue;
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

  function changeSpectrum(position: number) {
    if (position <= 10) {
      changeHsv({ value: position / 10 });
      return;
    }
    if (position >= 90) {
      changeHsv({ saturation: (100 - position) / 10, value: 1 });
      return;
    }
    changeHsv({
      hue: (position - 10) / 80 * 359,
      saturation: Math.max(hsv.saturation, 0.65),
      value: Math.max(hsv.value, 0.65),
    });
  }

  const spectrumPosition = 10 + hsv.hue / 359 * 80;

  return (
    <View testID={testID} style={styles.container}>
      <View style={styles.compactHeader}>
        <Text style={styles.label}>{label}</Text>
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
        {isOverridden && onUseInherited ? (
          <TouchableOpacity
            onPress={onUseInherited}
            style={styles.inheritedButton}
            accessibilityRole="button"
            accessibilityLabel={`Use inherited ${label.toLowerCase()}`}
          >
            <Text style={styles.inheritedButtonText}>Use inherited</Text>
          </TouchableOpacity>
        ) : onUseInherited ? (
          <Text style={styles.inheritedStatus}>Inherited</Text>
        ) : null}
      </View>

      <View style={styles.sliderRow}>
        <Text style={styles.sliderLabel}>Hue</Text>
        {Platform.OS === "web" ? (
          <>
            <style>{`
              .patron-hue-spectrum {
                -webkit-appearance: none;
                appearance: none;
                flex: 1;
                min-width: 0;
                height: 8px;
                margin: 10px 0;
                cursor: pointer;
                border-radius: 999px;
                background: ${HUE_SPECTRUM};
              }
              .patron-hue-spectrum::-webkit-slider-thumb {
                -webkit-appearance: none;
                width: 18px;
                height: 18px;
                border-radius: 50%;
                border: 2px solid #ffffff;
                background: currentColor;
                box-shadow: 0 0 0 1px #071526;
              }
              .patron-hue-spectrum::-moz-range-thumb {
                width: 16px;
                height: 16px;
                border-radius: 50%;
                border: 2px solid #ffffff;
                background: currentColor;
                box-shadow: 0 0 0 1px #071526;
              }
            `}</style>
            <input
              className="patron-hue-spectrum"
              data-testid={`${testID}-hue`}
              type="range"
              min="0"
              max="100"
              step="0.5"
              value={spectrumPosition}
              onInput={(event: any) => changeSpectrum(Number(event?.target?.value || 0))}
              onChange={(event: any) => changeSpectrum(Number(event?.target?.value || 0))}
              aria-label={`${label} hue spectrum`}
              style={{ color: safeValue, touchAction: "none", maxWidth: "100%" }}
            />
          </>
        ) : (
          <Slider
            testID={`${testID}-hue`}
            style={styles.slider}
            value={spectrumPosition}
            minimumValue={0}
            maximumValue={100}
            step={0.5}
            onValueChange={changeSpectrum}
            minimumTrackTintColor={safeValue}
            maximumTrackTintColor="#315277"
            thumbTintColor="#f8fafc"
            accessibilityLabel={`${label} hue spectrum`}
          />
        )}
      </View>
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
  container: { width: "100%", maxWidth: "100%", minWidth: 0, borderTopWidth: 1, borderTopColor: "#315277", paddingTop: 10, marginTop: 2, marginBottom: 10 },
  compactHeader: { width: "100%", maxWidth: "100%", minWidth: 0, minHeight: 40, flexDirection: "row", alignItems: "center", gap: 6 },
  label: { color: "#d7e4f6", fontSize: 14, fontWeight: "900", flexShrink: 1, minWidth: 0 },
  inheritedButton: { minHeight: 38, maxWidth: "100%", flexShrink: 1, justifyContent: "center", borderWidth: 1, borderColor: "#315277", borderRadius: 8, paddingHorizontal: 7, marginLeft: "auto" },
  inheritedButtonText: { color: "#93c5fd", fontSize: 11, fontWeight: "800" },
  inheritedStatus: { color: "#6f8bad", fontSize: 12, fontWeight: "700" },
  swatch: { width: 34, height: 34, borderRadius: 8, borderWidth: 1, borderColor: "#d7e4f6", overflow: "hidden", position: "relative", flexShrink: 0 },
  sliderRow: { width: "100%", maxWidth: "100%", minWidth: 0, minHeight: 38, flexDirection: "row", alignItems: "center", gap: 6 },
  sliderLabel: { color: "#b9cce4", width: 68, flexShrink: 0, fontSize: 12, fontWeight: "800" },
  slider: { flex: 1, height: 34, minWidth: 0 },
  hexInput: { width: 78, maxWidth: 78, flexShrink: 1, color: "#e5efff", backgroundColor: "#071526", borderColor: "#315277", borderWidth: 1, borderRadius: 8, paddingHorizontal: 6, paddingVertical: 7, fontSize: 12, fontWeight: "800" },
});
