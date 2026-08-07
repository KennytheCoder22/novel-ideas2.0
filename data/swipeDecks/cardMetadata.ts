import type { SwipeDeckCard } from "./types";

function normalizeKey(value: unknown): string {
  return String(value || "").trim().toLowerCase();
}

export function cardIdentityKey(card: SwipeDeckCard): string {
  return (
    normalizeKey(card.id) ||
    normalizeKey(card.title) ||
    normalizeKey(card.prompt) ||
    JSON.stringify(card)
  );
}

export type SwipeCardCategory =
  | "books"
  | "movies"
  | "tv"
  | "games"
  | "albums"
  | "youtube"
  | "anime"
  | "podcasts";

export function cardCategoryFromTags(card: SwipeDeckCard): SwipeCardCategory {
  const tags = Array.isArray(card?.tags) ? card.tags : [];
  const mediaTag = tags.find((tag) => typeof tag === "string" && tag.startsWith("media:"));
  if (!mediaTag) return "books";
  const value = mediaTag.slice("media:".length).toLowerCase();
  if (value === "tv" || value === "show" || value === "shows") return "tv";
  if (value === "movie" || value === "movies") return "movies";
  if (value === "game" || value === "games") return "games";
  if (value === "album" || value === "albums") return "albums";
  if (value === "youtube" || value === "video") return "youtube";
  if (value === "anime") return "anime";
  if (value === "podcast" || value === "podcasts") return "podcasts";
  return "books";
}

export function swipeCardPerformanceIdentity(card: SwipeDeckCard): string {
  return `${cardIdentityKey(card)}::${cardCategoryFromTags(card)}`;
}
