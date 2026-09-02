import { DarkTheme, DefaultTheme, ThemeProvider } from "@react-navigation/native";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import "react-native-reanimated";

import { useColorScheme } from "@/hooks/use-color-scheme";
import { initializePwaRuntime } from "@/lib/pwaRuntime";

export const unstable_settings = {
  anchor: "(tabs)",
};

export default function RootLayout() {
  const colorScheme = useColorScheme();

  useEffect(() => {
    initializePwaRuntime();
  }, []);

  return (
    <ThemeProvider value={colorScheme === "dark" ? DarkTheme : DefaultTheme}>
      <Stack>
        {/* Let (tabs) control its own header */}
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="app_admin-web" options={{ headerShown: false }} />
        <Stack.Screen name="admin/human-review" options={{ headerShown: false }} />
        <Stack.Screen name="testing" options={{ headerShown: false }} />
        <Stack.Screen name="games/last-bookshop" options={{ headerShown: false }} />
        <Stack.Screen name="customize-my-experience" options={{ headerShown: false }} />
        <Stack.Screen name="modal" options={{ presentation: "modal", title: "Modal" }} />
        <Stack.Screen name="how-it-works" options={{ presentation: "modal", headerShown: false }} />
        <Stack.Screen name="feedback" options={{ presentation: "modal", headerShown: false }} />
        <Stack.Screen name="privacy" options={{ presentation: "modal", headerShown: false }} />
        <Stack.Screen name="about" options={{ presentation: "modal", headerShown: false }} />
      </Stack>
      <StatusBar style="auto" />
    </ThemeProvider>
  );
}