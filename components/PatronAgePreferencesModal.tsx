import { Modal, SafeAreaView, StyleSheet, Switch, Text, TouchableOpacity, View } from "react-native";
import { AGE_BAND_KEYS, type AgeBandKey, type AgeBandSelection } from "../lib/patronAgePreferences";

const LABELS: Record<AgeBandKey, string> = {
  k2: "Kids",
  "36": "Pre-Teens",
  ms_hs: "Teens",
  adult: "Adults",
};

type Props = {
  visible: boolean;
  available: AgeBandSelection;
  value: AgeBandSelection;
  colors: {
    background: string;
    card: string;
    border: string;
    text: string;
    muted: string;
    highlight: string;
  };
  onChange: (value: AgeBandSelection) => void;
  onCancel: () => void;
  onSave: () => void;
};

export function PatronAgePreferencesModal({ visible, available, value, colors, onChange, onCancel, onSave }: Props) {
  const selectedCount = AGE_BAND_KEYS.filter((key) => available[key] && value[key]).length;
  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onCancel}>
      <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.title, { color: colors.text }]}>Personal Preferences</Text>
          <Text style={[styles.subtitle, { color: colors.muted }]}>Age Band Preferences</Text>
          <Text style={[styles.explanation, { color: colors.muted }]}>
            These choices apply only to this patron. Library settings and other patrons will not change.
          </Text>

          <View style={styles.options}>
            {AGE_BAND_KEYS.map((key) => {
              const isAvailable = available[key];
              return (
                <View key={key} style={[styles.option, { borderBottomColor: colors.border }]}>
                  <View style={styles.optionCopy}>
                    <Text style={[styles.optionLabel, { color: isAvailable ? colors.text : colors.muted }]}>
                      {LABELS[key]}
                    </Text>
                    {!isAvailable ? (
                      <Text style={[styles.unavailable, { color: colors.muted }]}>Not available from this library</Text>
                    ) : null}
                  </View>
                  <Switch
                    value={isAvailable && value[key]}
                    disabled={!isAvailable}
                    onValueChange={(enabled) => onChange({ ...value, [key]: enabled })}
                    trackColor={{ true: colors.highlight }}
                    accessibilityLabel={`${LABELS[key]} personal preference`}
                  />
                </View>
              );
            })}
          </View>

          {selectedCount === 0 ? (
            <Text style={styles.validation}>Choose at least one available age band.</Text>
          ) : null}

          <View style={styles.actions}>
            <TouchableOpacity style={[styles.button, { borderColor: colors.border }]} onPress={onCancel}>
              <Text style={[styles.buttonText, { color: colors.text }]}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.button, { borderColor: colors.highlight }]}
              onPress={onSave}
              disabled={selectedCount === 0}
              accessibilityRole="button"
              accessibilityLabel="Save personal age band preferences"
            >
              <Text style={[styles.buttonText, { color: selectedCount ? colors.text : colors.muted }]}>Save Preferences</Text>
            </TouchableOpacity>
          </View>
        </View>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, justifyContent: "center", padding: 20 },
  card: { borderWidth: 1, borderRadius: 18, padding: 20, width: "100%", maxWidth: 520, alignSelf: "center" },
  title: { fontSize: 24, fontWeight: "900" },
  subtitle: { fontSize: 17, fontWeight: "800", marginTop: 5 },
  explanation: { fontSize: 14, lineHeight: 20, marginTop: 12 },
  options: { marginTop: 18 },
  option: { minHeight: 62, flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderBottomWidth: 1 },
  optionCopy: { flex: 1, paddingRight: 12 },
  optionLabel: { fontSize: 16, fontWeight: "800" },
  unavailable: { fontSize: 12, marginTop: 3 },
  validation: { color: "#fca5a5", fontSize: 13, fontWeight: "700", marginTop: 12 },
  actions: { flexDirection: "row", justifyContent: "flex-end", gap: 12, marginTop: 22 },
  button: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 15, paddingVertical: 11 },
  buttonText: { fontWeight: "800" },
});
