import React, { useState } from "react";
import { Platform, Text, TouchableOpacity, View } from "react-native";

interface Props {
  title: string;
  defaultOpen?: boolean;
  theme: {
    text: string;
    subtext: string;
    cardBorder: string;
  };
  children: React.ReactNode;
}

export function CollapsibleSection({ title, defaultOpen = false, theme, children }: Props) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <View>
      <TouchableOpacity
        onPress={() => setOpen((v) => !v)}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        style={{
          flexDirection: "row",
          justifyContent: "space-between",
          alignItems: "center",
          paddingVertical: 10,
        }}
      >
        <Text style={{ fontSize: 16, fontWeight: "900", color: theme.text }}>{title}</Text>
        <Text style={{ fontSize: 18, color: theme.subtext, lineHeight: 22 }}>{open ? "▲" : "▼"}</Text>
      </TouchableOpacity>

      {open ? <View>{children}</View> : null}
    </View>
  );
}
