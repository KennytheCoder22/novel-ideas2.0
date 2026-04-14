// screens/SwipeDeckScreen.tsx
import React from "react";
import { SafeAreaView, Text, View } from "react-native";

export default function SwipeDeckScreen() {
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#b91c1c" }}>
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 24 }}>
        <Text style={{ color: "white", fontSize: 28, fontWeight: "800", textAlign: "center" }}>
          SwipeDeckScreen is rendering
        </Text>
        <Text style={{ color: "white", fontSize: 16, marginTop: 12, textAlign: "center" }}>
          If you can see this, the blank screen is coming from inside the original SwipeDeckScreen logic.
        </Text>
      </View>
    </SafeAreaView>
  );
}
