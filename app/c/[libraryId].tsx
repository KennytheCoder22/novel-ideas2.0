import { useEffect } from "react";
import { router, useLocalSearchParams } from "expo-router";
import { View, Text } from "react-native";
import { setRuntimeLibraryName } from "../../constants/runtimeConfig";

function humanizeLibraryId(raw: string): string {
  const slug = String(raw || "").trim().replace(/[_]+/g, "-").replace(/-+/g, "-").replace(/^-+|-+$/g, "");
  if (!slug) return "NovelIdeas";
  return slug
    .split("-")
    .filter(Boolean)
    .map((part) => {
      const cleaned = part.replace(/[^a-z0-9]/gi, "");
      if (!cleaned) return "";
      if (/^[A-Z0-9]{2,}$/.test(cleaned) || cleaned.length <= 4) return cleaned.toUpperCase();
      return cleaned[0].toUpperCase() + cleaned.slice(1).toLowerCase();
    })
    .filter(Boolean)
    .join(" ");
}

export default function LibraryLandingRoute() {
  const params = useLocalSearchParams<{ libraryId?: string | string[] }>();

  useEffect(() => {
    const raw = Array.isArray(params.libraryId) ? params.libraryId[0] : params.libraryId;
    setRuntimeLibraryName(humanizeLibraryId(raw || ""));
    router.replace("/" as any);
  }, [params.libraryId]);

  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#07182b" }}>
      <Text style={{ color: "#e5efff", fontWeight: "900" }}>Opening your library…</Text>
    </View>
  );
}
