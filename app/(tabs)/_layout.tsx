import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Stack, useRouter } from "expo-router";
import { Platform, Text, TouchableOpacity, View } from "react-native";

import { getRuntimeLibraryName, subscribeRuntimeLibraryName } from "@/constants/runtimeConfig";
import { buildTheme, initWebHighlightColorFromStorage, type ThemeKey, type HighlightKey } from "../../constants/brandTheme";

if (Platform.OS === "web") initWebHighlightColorFromStorage();

function HeaderTitle(props: { onPress: () => void }) {
  const [title, setTitle] = useState<string>(() => getRuntimeLibraryName());

  useEffect(() => {
    return subscribeRuntimeLibraryName(() => {
      setTitle(getRuntimeLibraryName());
    });
  }, []);

  const displayTitle = title && title.trim().length > 0 ? title : "NovelIdeas";

  return (
    <TouchableOpacity
      onPress={props.onPress}
      accessibilityRole="button"
      style={{ paddingHorizontal: 12, paddingVertical: 6 }}
    >
      <View style={{ flexDirection: "row", alignItems: "center" }}>
        <Text style={{ fontWeight: "900", fontSize: 16, color: "#e5efff" }}>{displayTitle}</Text>
      </View>
    </TouchableOpacity>
  );
}

/**
 * IMPORTANT PATH NOTE
 * This file is intended to live at: app/(tabs)/_layout.tsx
 * (even though "tabs" are being removed).
 */

// Keep in sync with index.tsx, which reads/writes this key on web.
const ADMIN_DRAFT_STORAGE_KEY = "novelideas_admin_config";

function safeReadWebAdminDraft(): any | null {
  try {
    if (Platform.OS !== "web") return null;
    // @ts-ignore
    if (typeof localStorage === "undefined") return null;
    // @ts-ignore
    const raw = localStorage.getItem(ADMIN_DRAFT_STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export default function TabLayout() {
  const router = useRouter();

  const tapCountRef = useRef(0);
  const lastTapAtRef = useRef(0);

  const onTitleTap = useCallback(() => {
    const now = Date.now();

    // reset the counter if taps are spaced too far apart
    if (now - lastTapAtRef.current > 2000) {
      tapCountRef.current = 0;
    }

    lastTapAtRef.current = now;
    tapCountRef.current += 1;

    if (tapCountRef.current >= 7) {
      tapCountRef.current = 0;
      router.push("/admin");
    }
  }, [router]);

  // Read highlight/theme from the admin draft on web so the header line follows Admin highlight changes.
  // (On native, runtime config should be the long-term source of truth.)
  const [webDraftTick, setWebDraftTick] = useState(0);

  useEffect(() => {
    if (Platform.OS !== "web") return;

    const onStorage = (e: any) => {
      if (e?.key === ADMIN_DRAFT_STORAGE_KEY) setWebDraftTick((n) => n + 1);
    };

    // @ts-ignore
    window.addEventListener?.("storage", onStorage);
    return () => {
      // @ts-ignore
      window.removeEventListener?.("storage", onStorage);
    };
  }, []);

  const headerTheme = useMemo(() => {
    const draft = safeReadWebAdminDraft();

    const mainThemeKey: ThemeKey =
      (draft?.branding?.mainTheme as ThemeKey) ||
      (draft?.branding?.theme as ThemeKey) ||
      "dark_blue";

    const highlightKey: HighlightKey =
      (draft?.branding?.highlight as HighlightKey) || "gold_accent";

    // buildTheme in this project expects (mainTheme, highlight, titleTextColor).
    // Keep title text defaulted to "white" to match existing behavior.
    return buildTheme(mainThemeKey, highlightKey, "white" as any);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [webDraftTick]);

  return (
    <Stack
      initialRouteName="swipe"
      screenOptions={{
        headerShown: true,

        // Kill the default navigation shadow/divider (iOS + web).
        headerShadowVisible: false,

        headerStyle: {
          backgroundColor: "#071526",

          // RN Web sometimes needs this to ensure borders render predictably.
          borderStyle: "solid",

          // IMPORTANT: No divider line under the navigation header.
          // The single divider between nav header and the banner is owned by app/(tabs)/index.tsx.
          borderBottomWidth: 0,
          borderBottomColor: "transparent",

          ...(Platform.OS === "android" ? { elevation: 0 } : null),
        },

        headerTitle: () => <HeaderTitle onPress={onTitleTap} />,
        headerRight: () => null,
      }}
    >
      {/* Swipe is the true "home". Hide the native header because index.tsx already renders the branded header. */}
      <Stack.Screen name="swipe" options={{ headerShown: false }} />

      {/* "Home" (search/admin content) */}
      <Stack.Screen name="index" options={{ title: "Home" }} />

      <Stack.Screen name="explore" options={{ title: "Explore" }} />
    </Stack>
  );
}
