import { deck36 } from "../../../data/swipeDecks/36";
import adultDeck from "../../../data/swipeDecks/adult";
import k2Deck from "../../../data/swipeDecks/k2";
import msHsDeck from "../../../data/swipeDecks/ms_hs";
import type { SwipeDeck, SwipeDeckCard } from "../../../data/swipeDecks/types";
import type { MediaManiaAgeBand, MediaManiaCatalogItem, MediaManiaSource } from "./mediaManiaCore.mjs";
import { staticMediaManiaArtworkUrl } from "./mediaManiaArtwork";

const decks: SwipeDeck[] = [k2Deck, deck36 as unknown as SwipeDeck, msHsDeck, adultDeck];
const ageBandByDeckKey: Record<SwipeDeck["deckKey"], MediaManiaAgeBand> = {
  k2: "kids",
  "36": "preteens",
  ms_hs: "teens",
  adult: "adults",
};

function sourceFromCard(card: SwipeDeckCard): MediaManiaSource {
  const tags = Array.isArray(card.tags) ? card.tags.map((tag) => String(tag).toLowerCase()) : [];
  if (tags.includes("media:anime")) return "anime";
  if (tags.includes("media:youtube")) return "youtube";
  if (tags.includes("media:podcast") || tags.includes("media:podcasts")) return "podcasts";
  if (tags.includes("media:tv") || tags.includes("media:show")) return "tv";
  if (tags.includes("media:movie") || tags.includes("media:movies")) return "movies";
  if (tags.includes("media:game") || tags.includes("media:games")) return "games";
  return "books";
}

function slug(value: string): string {
  return value.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80);
}

function traitKeys(card: SwipeDeckCard): string[] {
  const tags = Array.isArray(card.tags) ? card.tags.map((tag) => String(tag).toLowerCase()) : [];
  const axes = Object.entries(card.tasteTraits || {}).map(([key, value]) => `${key}:${Number(value) > 0.33 ? "high" : Number(value) < -0.33 ? "low" : "mid"}`);
  return [...new Set([...tags.filter((tag) => !tag.startsWith("audience:") && !tag.startsWith("age:") && !tag.startsWith("media:")), ...axes])];
}

const catalogById = new Map<string, MediaManiaCatalogItem>();
for (const deck of decks) {
  for (const [cardIndex, card] of deck.cards.entries()) {
    const title = String(card.title || card.prompt || "").trim();
    if (!title) continue;
    const mediaSource = sourceFromCard(card);
    const creator = String(card.author || card.display?.studio || card.display?.publisher || "").trim();
    const stablePart = String(card.id || `${slug(title)}-${slug(creator) || cardIndex}`);
    const id = `media-mania:${mediaSource}:${stablePart}`;
    const ageBand = ageBandByDeckKey[deck.deckKey];
    const existing = catalogById.get(id);
    if (existing) {
      if (!existing.ageBands.includes(ageBand)) existing.ageBands.push(ageBand);
      continue;
    }
    const mappedImage = staticMediaManiaArtworkUrl(title, creator);
    catalogById.set(id, {
      id,
      source: `novelideas_swipe_deck:${deck.deckKey}`,
      mediaSource,
      title,
      creator,
      ageBands: [ageBand],
      imageUri: card.imageUri || mappedImage,
      imageOrigin: card.imageUri ? "deck" : mappedImage ? "static_map" : undefined,
      wikiTitle: card.wikiTitle,
      traitKeys: traitKeys(card),
    });
  }
}

export const MEDIA_MANIA_CATALOG: MediaManiaCatalogItem[] = Array.from(catalogById.values());

export function mediaManiaCatalogCounts(): Record<MediaManiaSource, number> {
  return MEDIA_MANIA_CATALOG.reduce((counts, item) => {
    counts[item.mediaSource] += 1;
    return counts;
  }, { books: 0, movies: 0, tv: 0, games: 0, youtube: 0, anime: 0, podcasts: 0 });
}

export function mediaManiaCatalogCountsByAgeBand(ageBand: MediaManiaAgeBand): Record<MediaManiaSource, number> {
  return MEDIA_MANIA_CATALOG.reduce((counts, item) => {
    if (item.ageBands.includes(ageBand)) counts[item.mediaSource] += 1;
    return counts;
  }, { books: 0, movies: 0, tv: 0, games: 0, youtube: 0, anime: 0, podcasts: 0 });
}
