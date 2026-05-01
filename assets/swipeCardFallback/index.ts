import { Image } from "react-native";

type LocalAssetModule = number;

type SwipeFallbackEntry = {
  title: string;
  author?: string;
  asset: LocalAssetModule;
};

/**
 * Populate this list with local card images you want to ship as a fallback when
 * real-time image lookups fail.
 *
 * Example:
 * {
 *   title: "The Grand Budapest Hotel",
 *   author: "Searchlight Pictures",
 *   asset: require("./images/the-grand-budapest-hotel.jpg"),
 * }
 */
const SWIPE_CARD_FALLBACKS: SwipeFallbackEntry[] = [];

function normalizeToken(value: unknown): string {
  return String(value || "").trim().toLowerCase();
}

function normalizeCardKey(title: unknown, author?: unknown): string {
  return `${normalizeToken(title)}::${normalizeToken(author)}`;
}

const FALLBACK_URI_BY_KEY = new Map<string, string>();

for (const entry of SWIPE_CARD_FALLBACKS) {
  const key = normalizeCardKey(entry.title, entry.author);
  if (!key || key === "::") continue;
  const resolved = Image.resolveAssetSource(entry.asset);
  const uri = typeof resolved?.uri === "string" ? resolved.uri : "";
  if (!uri) continue;
  FALLBACK_URI_BY_KEY.set(key, uri);
}

export function getLocalSwipeCardFallbackUri(title: unknown, author?: unknown): string | undefined {
  const direct = FALLBACK_URI_BY_KEY.get(normalizeCardKey(title, author));
  if (direct) return direct;
  const titleOnly = FALLBACK_URI_BY_KEY.get(normalizeCardKey(title, ""));
  return titleOnly || undefined;
}
