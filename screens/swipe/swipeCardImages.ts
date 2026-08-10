import type { SwipeCardCategory } from "../../data/swipeDecks/cardMetadata";

const WIKIPEDIA_MEDIA_SUFFIX: Partial<Record<SwipeCardCategory, string>> = {
  tv: "TV series",
  movies: "film",
  games: "video game",
  albums: "album",
  anime: "TV series",
  podcasts: "podcast",
};

export function wikipediaTitleCandidates(
  wikiTitle: string,
  category: SwipeCardCategory,
): string[] {
  const title = String(wikiTitle || "").replace(/\s+/g, " ").trim();
  if (!title) return [];
  const suffix = WIKIPEDIA_MEDIA_SUFFIX[category];
  const parenthetical = title.match(/^(.*?)\s+\([^()]+\)\s*$/);
  if (parenthetical) return [title, parenthetical[1].trim()];
  if (!suffix) return [title];
  return [`${title} (${suffix})`, title];
}
