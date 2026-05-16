// screens/SwipeDeckScreen.tsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  Dimensions,
  Image,
  PanResponder,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  Platform,
  Pressable,
} from "react-native";
import * as Clipboard from "expo-clipboard";
import { useRouter } from "expo-router";
import { getDeckLabel } from "../constants/deckLabels";
import type { SwipeDeck, SwipeDeckCard } from "../data/swipeDecks/types";
import * as k2DeckMod from "../data/swipeDecks/k2";
import * as deck36Mod from "../data/swipeDecks/36";
import msHsDeck from "../data/swipeDecks/ms_hs";
import adultDeck from "../data/swipeDecks/adult";
import { coverUrlFromCoverId, type TagCounts } from "./swipe/openLibraryFromTags";
import * as openLibraryFromTags from "./swipe/openLibraryFromTags";
import { getRecommendations } from "./recommenders/recommenderRouter";
import { RecommenderEqualizerPanel } from "./recommenders/dev/RecommenderEqualizerPanel";
import { loadProfileOverrides } from "./recommenders/dev/recommenderProfileOverrides";
import { laneFromDeckKey, type RecommenderLane, type RecommenderProfile } from "./recommenders/recommenderProfiles";
import { buildTasteProfile } from "./recommenders/taste/tasteProfileBuilder";
import type { TasteFeedbackEvent } from "./recommenders/taste/types";
import { RecommendationPipeline } from "./recommenders/taste/recommendationPipeline";
import type { PersonalityProfile, TasteVector } from "./recommenders/taste/personalityProfile";
import { initializePersonality } from "./recommenders/taste/personalityProfile";
import type { MoodProfile, SwipeSignal } from "./recommenders/taste/sessionMood";
import type { RecommenderInput } from "./recommenders/types";
import { estimateReaderSophisticationFromTaste } from "./recommenders/taste/sophisticationModel";
import { cardIdentityKey, selectAdaptiveCard } from "./swipe/adaptiveCardQueue";
import { getSwipeCardFallbackImage } from "../assets/swipeCardFallback";

const DEFAULT_SWIPE_CATEGORIES = {
  books: true,
  movies: true,
  tv: true,
  games: true,
  albums: true,
  youtube: true,
  anime: true,
  podcasts: true,
};

const DEFAULT_ADULT_CARDS: any[] = [];
const MIN_20Q_DECISION_SWIPES = 4;
const MAX_SINGLE_CARD_DIRECT_TRAIT_WEIGHT = 1.1;

type DeckKey = SwipeDeck["deckKey"];

type OLDoc = {
  key?: string;
  title?: string;
  author_name?: string[];
  first_publish_year?: number;
  cover_i?: number | string;
};

type FallbackBook = {
  title: string;
  author: string;
  year?: number;
};

type RecItem =
  | { kind: "open_library"; doc: OLDoc }
  | { kind: "fallback"; book: FallbackBook };

type FeedbackKind = "already_read" | "not_interested" | "next";
type RecFeedback = { itemId: string; kind: FeedbackKind; rating?: 1 | 2 | 3 | 4 | 5 };

type RecommendationHistoryBucket = {
  recommendedIds: Set<string>;
  recommendedKeys: Set<string>;
  authors: Set<string>;
  seriesKeys: Set<string>;
  rejectedIds: Set<string>;
  rejectedKeys: Set<string>;
};

type SwipeHistoryEntry = {
  direction: "like" | "dislike" | "skip";
  card: SwipeDeckCard;
};

type TestSessionPreset = {
  id: string;
  label: string;
  sequence: Array<"like" | "dislike" | "skip">;
};

type TwentyQAxis = keyof TasteVector;

type TwentyQObjective = {
  id: string;
  rung: number;
  axis: TwentyQAxis;
  label: string;
  description: string;
  threshold: number;
};

type TwentyQObjectiveStatus = TwentyQObjective & {
  score: number;
  resolved: boolean;
};

type Props = {
  onOpenSearch?: () => void;
  enabledDecks?: Partial<Record<DeckKey, boolean>>;
  recommendationSourceEnabled?: {
    googleBooks?: boolean;
    openLibrary?: boolean;
    localLibrary?: boolean;
    kitsu?: boolean;
    comicVine?: boolean;
  };
  localLibrarySupported?: boolean;
  swipeCategories?: {
    books: boolean;
    movies: boolean;
    tv: boolean;
    games: boolean;
    albums?: boolean;
    youtube?: boolean;
    anime?: boolean;
    podcasts?: boolean;
  };
};


function resolveDeckFromModule(mod: any, expectedKey: DeckKey, fallbackLabel: string): SwipeDeck {
  const candidates: any[] = [];
  if (mod && typeof mod === "object") {
    if (mod.default) candidates.push(mod.default);
    for (const v of Object.values(mod)) candidates.push(v);
    candidates.push(mod);
  } else if (mod) {
    candidates.push(mod);
  }

  for (const c of candidates) {
    if (!c || typeof c !== "object") continue;
    const dk = (c as any).deckKey;
    const cards = (c as any).cards;
    if (dk === expectedKey && Array.isArray(cards)) {
      const rules = (c as any).rules;
      if (rules && typeof rules === "object") return c as SwipeDeck;

      const target = (c as any).targetSwipesBeforeRecommend;
      const allow = (c as any).allowUpToSwipesBeforeRecommend;
      if (typeof target === "number" && typeof allow === "number") {
        return {
          ...(c as any),
          rules: { targetSwipesBeforeRecommend: target, allowUpToSwipesBeforeRecommend: allow },
        } as SwipeDeck;
      }

      return {
        ...(c as any),
        rules: { targetSwipesBeforeRecommend: 6, allowUpToSwipesBeforeRecommend: 10 },
      } as SwipeDeck;
    }
  }

  const maybeArr = (mod as any)?.default ?? mod;
  if (Array.isArray(maybeArr)) {
    return {
      deckKey: expectedKey,
      deckLabel: fallbackLabel,
      rules: { targetSwipesBeforeRecommend: 6, allowUpToSwipesBeforeRecommend: 10 },
      cards: maybeArr as any,
    } as SwipeDeck;
  }

  return ((mod as any)?.default ?? mod) as SwipeDeck;
}

const CONTROLLED_GRAPHIC_NOVEL_KEYWORDS = new Set([
  "superhero","fantasy","sci_fi","dystopian","romance","mystery","horror","adventure","comedy","mythology",
  "historical","drama","coming_of_age","survival","crime","school_life","paranormal","slice_of_life","action",
  "manga","queer_identity","sports","western",
]);

function inferGraphicNovelKeywordsForCard(card: any): string[] {
  const raw = Array.isArray(card?.graphicNovelKeywords) ? card.graphicNovelKeywords : [];
  const normalized = raw.map((v: unknown) => String(v || "").trim().toLowerCase()).filter(Boolean);
  const keywordBag = new Set<string>(normalized.filter((k) => CONTROLLED_GRAPHIC_NOVEL_KEYWORDS.has(k)));
  const tags = Array.isArray(card?.tags) ? card.tags.map((v: unknown) => String(v || "")) : [];
  const joined = [String(card?.title || ""), String(card?.genre || ""), ...tags].join(" ").toLowerCase();
  if (/superhero|superheroes|spider-man|batman|smallville|marvel|dc comics?\b/.test(joined)) keywordBag.add("superhero");
  if (/fantasy|dragon|wizard|magic|myth|witcher|zelda|merlin/.test(joined)) keywordBag.add("fantasy");
  if (/science fiction|sci[- ]?fi|cyberpunk|space|future|doctor who|mass effect/.test(joined)) keywordBag.add("sci_fi");
  if (/dystopian|apocalypse|rebellion|authoritarian|maze runner|hunger games/.test(joined)) keywordBag.add("dystopian");
  if (/romance|love|heartstopper|bridgerton/.test(joined)) keywordBag.add("romance");
  if (/mystery|detective|investigation|sherlock/.test(joined)) keywordBag.add("mystery");
  if (/horror|haunted|ghost|walking dead|conjuring/.test(joined)) keywordBag.add("horror");
  if (/paranormal|supernatural|occult|vampire/.test(joined)) keywordBag.add("paranormal");
  if (/crime|noir|heist/.test(joined)) keywordBag.add("crime");
  if (/coming of age|coming-of-age|high school|teen/.test(joined)) keywordBag.add("coming_of_age");
  if (/adventure|quest|journey/.test(joined)) keywordBag.add("adventure");
  if (/action|battle|fight|karate|arcane/.test(joined)) keywordBag.add("action");
  if (/manga|anime|my hero academia|one piece/.test(joined)) keywordBag.add("manga");
  if (keywordBag.size === 0) keywordBag.add("drama");
  return Array.from(keywordBag).slice(0, 4);
}

function attachGraphicNovelKeywords(cards: any[]): any[] {
  return cards.map((card) => ({ ...card, graphicNovelKeywords: inferGraphicNovelKeywordsForCard(card) }));
}

async function lookupOpenLibraryCover(
  title: string,
  author?: string
): Promise<{ coverUrl?: string; olWorkId?: string }> {
  const qParts: string[] = [];
  const safeTitle = String(title || "").trim();
  if (safeTitle) qParts.push(`intitle:${safeTitle}`);
  const safeAuthor = String(author || "").trim();
  if (safeAuthor) qParts.push(`inauthor:${safeAuthor}`);
  if (qParts.length === 0) return {};

  const params = new URLSearchParams();
  params.set("q", qParts.join(" "));
  params.set("printType", "books");
  params.set("orderBy", "relevance");
  params.set("maxResults", "1");
  params.set("langRestrict", "en");

  const apiKey = (process as any)?.env?.EXPO_PUBLIC_GOOGLE_BOOKS_API_KEY;
  if (typeof apiKey === "string" && apiKey.trim()) params.set("key", apiKey.trim());

  const url = `https://www.googleapis.com/books/v1/volumes?${params.toString()}`;
  const res = await fetch(url);
  if (!res.ok) {
    console.warn("[NovelIdeas][coverLookup] Google Books lookup failed", { status: res.status, url });
    return {};
  }

  const json = await res.json();
  const item = json?.items?.[0];
  const vi = item?.volumeInfo || {};
  const imageLinks = vi?.imageLinks || {};
  const thumb: string | undefined =
    (typeof imageLinks?.thumbnail === "string" ? imageLinks.thumbnail : undefined) ||
    (typeof imageLinks?.smallThumbnail === "string" ? imageLinks.smallThumbnail : undefined);
  if (!thumb) return {};
  const coverUrl = thumb.replace(/^http:\/\//, "https://");
  return { coverUrl };
}

async function lookupWikipediaThumbnail(wikiTitle: string): Promise<{ imageUrl?: string }> {
  try {
    const safeTitle = encodeURIComponent(wikiTitle.replace(/\s+/g, " ").trim());
    const url = `https://en.wikipedia.org/api/rest_v1/page/summary/${safeTitle}`;
    const res = await fetch(url);
    if (!res.ok) return {};
    const data: any = await res.json();
    const thumb = data?.thumbnail?.source as string | undefined;
    if (thumb && typeof thumb === "string" && thumb.startsWith("http")) return { imageUrl: thumb };
    return {};
  } catch {
    return {};
  }
}

const DEFAULT_K2_CARDS: any[] = [];

const k2DeckResolved: SwipeDeck = resolveDeckFromModule(k2DeckMod as any, "k2", "K–2");
const k2Deck: SwipeDeck =
  k2DeckResolved && Array.isArray((k2DeckResolved as any).cards) && (k2DeckResolved as any).cards.length > 0
    ? k2DeckResolved
    : ({
        deckKey: "k2",
        deckLabel: "K–2",
        rules: { targetSwipesBeforeRecommend: 6, allowUpToSwipesBeforeRecommend: 10 },
        cards: DEFAULT_K2_CARDS as any,
      } as SwipeDeck);

const DEFAULT_36_CARDS: any[] = [];

const deck36Resolved: SwipeDeck = ((deck36Mod as any)?.default ?? (deck36Mod as any)?.deck ?? (deck36Mod as any)?.deck36 ?? (deck36Mod as any)) as SwipeDeck;

const deck36: SwipeDeck = (() => {
  const candidate: any = deck36Resolved && typeof deck36Resolved === "object" ? deck36Resolved : null;
  const cardsFromCandidate = candidate?.cards;
  const looksLikeBookCards =
    Array.isArray(cardsFromCandidate) &&
    cardsFromCandidate.length > 0 &&
    typeof cardsFromCandidate[0] === "object" &&
    (typeof cardsFromCandidate[0]?.title === "string" ||
      typeof cardsFromCandidate[0]?.author === "string" ||
      typeof cardsFromCandidate[0]?.genre === "string");

  const cards: any[] = looksLikeBookCards ? cardsFromCandidate : DEFAULT_36_CARDS;
  const deckKey = candidate?.deckKey ?? "36";
  const deckLabel = candidate?.deckLabel ?? "Grades 3–6";
  const rules = candidate?.rules ?? { targetSwipesBeforeRecommend: 8, allowUpToSwipesBeforeRecommend: 12 };
  return { deckKey, deckLabel, rules, cards: attachGraphicNovelKeywords(cards) } as SwipeDeck;
})();

const DEFAULT_MSHS_CARDS: any[] = [];

const msHsDeckResolved: SwipeDeck = resolveDeckFromModule(({ default: msHsDeck } as any), "ms_hs", "Middle / High School");

const msHsDeckFinal: SwipeDeck = (() => {
  const candidate: any = msHsDeckResolved && typeof msHsDeckResolved === "object" ? msHsDeckResolved : null;
  const cardsFromCandidate = candidate?.cards;

  const cards: any[] =
    Array.isArray(cardsFromCandidate) && cardsFromCandidate.length > 0
      ? cardsFromCandidate
      : DEFAULT_MSHS_CARDS;

  const deckKey = candidate?.deckKey ?? "ms_hs";
  const deckLabel = candidate?.deckLabel ?? "Middle / High School";
  const rules = candidate?.rules ?? { targetSwipesBeforeRecommend: 10, allowUpToSwipesBeforeRecommend: 15 };

  return { deckKey, deckLabel, rules, cards: attachGraphicNovelKeywords(cards) } as SwipeDeck;
})();

const adultDeckResolved: SwipeDeck = resolveDeckFromModule(({ default: adultDeck } as any), "adult", "Advanced / Adult Readers");

const adultDeckFinal: SwipeDeck = (() => {
  const candidate: any = adultDeckResolved && typeof adultDeckResolved === "object" ? adultDeckResolved : null;
  const cardsFromCandidate = candidate?.cards;

  const cards: any[] =
    Array.isArray(cardsFromCandidate) && cardsFromCandidate.length > 0
      ? cardsFromCandidate
      : DEFAULT_ADULT_CARDS;

  const deckKey = candidate?.deckKey ?? "adult";
  const deckLabel = candidate?.deckLabel ?? "Advanced / Adult Readers";
  const rules = candidate?.rules ?? { targetSwipesBeforeRecommend: 10, allowUpToSwipesBeforeRecommend: 16 };

  return { deckKey, deckLabel, rules, cards: attachGraphicNovelKeywords(cards) } as SwipeDeck;
})();


function shuffleArray<T>(arr: T[]) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = a[i];
    a[i] = a[j];
    a[j] = tmp;
  }
  return a;
}

function cardCategoryFromTags(card: any): "books" | "movies" | "tv" | "games" | "albums" | "youtube" | "anime" | "podcasts" {
  const tags = Array.isArray(card?.tags) ? card.tags : [];
  const mediaTag = tags.find((t: any) => typeof t === "string" && t.startsWith("media:"));
  if (!mediaTag) return "books";
  const v = String(mediaTag).slice("media:".length).toLowerCase();
  if (v === "tv" || v === "show" || v === "shows") return "tv";
  if (v === "movie" || v === "movies") return "movies";
  if (v === "game" || v === "games") return "games";
  if (v === "album" || v === "albums") return "albums";
  if (v === "youtube" || v === "video") return "youtube";
  if (v === "anime") return "anime";
  if (v === "podcast" || v === "podcasts") return "podcasts";
  return "books";
}

function filterDeckCardsByCategory(deck: SwipeDeck, enabled?: any): SwipeDeck {
  const cats = { ...DEFAULT_SWIPE_CATEGORIES, ...(enabled || {}) };
  const cards = Array.isArray((deck as any).cards) ? ((deck as any).cards as any[]) : [];
  const filtered = cards.filter((c) => {
    const cat = cardCategoryFromTags(c);
    if (cat === "books") return !!cats.books;
    if (cat === "movies") return !!cats.movies;
    if (cat === "tv") return !!cats.tv;
    if (cat === "games") return !!cats.games;
    if (cat === "albums") return !!cats.albums;
    if (cat === "youtube") return !!cats.youtube;
    if (cat === "anime") return !!cats.anime;
    if (cat === "podcasts") return !!cats.podcasts;
    return true;
  });
  return { ...(deck as any), cards: filtered } as SwipeDeck;
}

function getDeckByKey(key: DeckKey): SwipeDeck {
  if (key === "k2") return k2Deck;
  if (key === "36") return deck36;
  if (key === "ms_hs") return msHsDeckFinal;
  return adultDeckFinal;
}

function deckLabel(key: DeckKey, compact = false) {
  return getDeckLabel(key as any, { compact });
}

function addTags(counts: TagCounts, tags: string[], delta: number) {
  const next: TagCounts = { ...counts };
  for (const t of tags) {
    if (!t) continue;
    const value = (next[t] || 0) + delta;
    if (value === 0) delete next[t];
    else next[t] = value;
  }
  return next;
}


function expandTeenCompanionTags(deckKey: DeckKey, tags: string[]): string[] {
  const base = Array.isArray(tags) ? tags.filter(Boolean) : [];
  if (deckKey !== "ms_hs") return base;

  const out = [...base];
  const hasAnime = base.includes("media:anime");
  const hasGraphicNovel = base.includes("format:graphic_novel");
  const hasComicLike =
    hasAnime ||
    hasGraphicNovel ||
    base.includes("genre:animation");

  if (hasAnime) {
    out.push("format:graphic_novel");
    out.push("topic:manga");
    out.push("vibe:fast");
  }

  if (hasComicLike) {
    out.push("format:graphic_novel");
  }

  return Array.from(new Set(out));
}

function docId(d: OLDoc): string {
  return String(d.key || `${d.title || "untitled"}::${d.author_name?.[0] || "unknown"}`);
}
function fallbackId(b: FallbackBook): string {
  return `fallback::${b.title}::${b.author}`;
}

function normalizeMemoryToken(value: unknown): string {
  return String(value || "").trim().toLowerCase();
}

function deriveSeriesKeyFromTitle(title: unknown): string {
  const normalized = normalizeMemoryToken(title)
    .replace(/\s*\([^)]*\)\s*/g, " ")
    .replace(/\s*\[[^\]]*\]\s*/g, " ")
    .split(":")[0]
    .replace(/,?\s+(book|bk|vol(?:ume)?|part|#)\s*\d+.*$/i, "")
    .replace(/\s+\d+\s*$/g, "")
    .replace(/\s+/g, " ")
    .trim();

  return normalized;
}

function createRecommendationHistoryBucket(): RecommendationHistoryBucket {
  return {
    recommendedIds: new Set<string>(),
    recommendedKeys: new Set<string>(),
    authors: new Set<string>(),
    seriesKeys: new Set<string>(),
    rejectedIds: new Set<string>(),
    rejectedKeys: new Set<string>(),
  };
}

function uniqueMemoryValues(...groups: Array<Array<string | undefined> | undefined>): string[] {
  const out = new Set<string>();
  for (const group of groups) {
    if (!Array.isArray(group)) continue;
    for (const value of group) {
      const normalized = normalizeMemoryToken(value);
      if (normalized) out.add(normalized);
    }
  }
  return Array.from(out);
}

function historyIdentityFromDoc(doc: OLDoc | undefined): { id?: string; key?: string; authors: string[]; seriesKey?: string } {
  if (!doc) return { authors: [] };

  const normalizedKey = normalizeMemoryToken(doc.key);
  const normalizedId = normalizeMemoryToken(docId(doc));
  const authors = Array.isArray(doc.author_name)
    ? doc.author_name.map((name) => normalizeMemoryToken(name)).filter(Boolean)
    : [];
  const seriesKey = deriveSeriesKeyFromTitle(doc.title);

  return {
    id: normalizedId || undefined,
    key: normalizedKey || undefined,
    authors,
    seriesKey: seriesKey || undefined,
  };
}

function ratingLabel(r: 1 | 2 | 3 | 4 | 5) {
  if (r === 5) return "Loved it";
  if (r === 4) return "Liked it";
  if (r === 3) return "It was ok";
  if (r === 2) return "Didn't like it";
  return "Hated it";
}

function numberOrZero(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function tasteVectorFromAxes(axes: Record<string, number> | undefined): TasteVector {
  const safeAxes = axes ?? {};
  return {
    ideaDensity: numberOrZero(safeAxes.ideaDensity ?? (safeAxes as any).idea_density),
    darkness: numberOrZero(safeAxes.darkness),
    warmth: numberOrZero(safeAxes.warmth),
    realism: numberOrZero(safeAxes.realism),
    characterFocus: numberOrZero(safeAxes.characterFocus ?? (safeAxes as any).character_focus),
    pacing: numberOrZero(safeAxes.pacing),
    humor: numberOrZero((safeAxes as any).humor),
    complexity: numberOrZero((safeAxes as any).complexity),
  };
}

function cardTagCounts(card: any): TagCounts {
  const tags = Array.isArray(card?.tags) ? card.tags.filter((t: any) => typeof t === "string" && t.trim()) : [];
  for (const keyword of inferGraphicNovelKeywordsForCard(card)) {
    if (CONTROLLED_GRAPHIC_NOVEL_KEYWORDS.has(keyword)) tags.push(`graphicNovel:${keyword}`);
  }
  if (tags.length > 0) {
    return tags.reduce((acc: TagCounts, tag: string) => {
      acc[tag] = (acc[tag] || 0) + 1;
      return acc;
    }, {});
  }

  if (typeof card?.genre === "string" && card.genre.trim()) {
    return { [`genre:${card.genre.trim()}`]: 1 };
  }

  return {};
}

function recommendationAuthor(doc: any): string {
  if (!doc) return "Unknown author";
  if (Array.isArray(doc.author_name) && doc.author_name.length > 0) return String(doc.author_name[0]);
  if (Array.isArray(doc.authors) && doc.authors.length > 0) return String(doc.authors[0]);
  if (typeof doc.author === "string" && doc.author.trim()) return doc.author.trim();
  return "Unknown author";
}

function recommendationCoverUrl(doc: any): string | null {
  if (!doc) return null;
  const directImage =
    (typeof doc?.imageUrl === "string" && doc.imageUrl) ||
    (typeof doc?.coverImageUrl === "string" && doc.coverImageUrl) ||
    "";
  if (directImage) return directImage.replace(/^http:\/\//, "https://");
  const fromCoverId = coverUrlFromCoverId(doc.cover_i || doc.coverId, "L");
  if (fromCoverId) return fromCoverId;
  const thumbnail =
    (typeof doc?.imageLinks?.thumbnail === "string" && doc.imageLinks.thumbnail) ||
    (typeof doc?.imageLinks?.smallThumbnail === "string" && doc.imageLinks.smallThumbnail) ||
    (typeof doc?.volumeInfo?.imageLinks?.thumbnail === "string" && doc.volumeInfo.imageLinks.thumbnail) ||
    (typeof doc?.volumeInfo?.imageLinks?.smallThumbnail === "string" && doc.volumeInfo.imageLinks.smallThumbnail) ||
    (typeof doc?.thumbnail === "string" && doc.thumbnail) ||
    (typeof doc?.coverImageUrl === "string" && doc.coverImageUrl) ||
    (typeof doc?.imageUrl === "string" && doc.imageUrl) ||
    "";
  return thumbnail ? thumbnail.replace(/^http:\/\//, "https://") : null;
}

function directTraitsFromCard(card: SwipeDeckCard | null | undefined): TasteVector | null {
  if (!card || !(card as any)?.tasteTraits) return null;
  return tasteVectorFromAxes((card as any).tasteTraits);
}

function semanticTraitsFromCard(card: SwipeDeckCard | null | undefined): TasteVector | null {
  if (!card) return null;

  const semantic = (card as any)?.semantic || {};
  const derivedTagCounts: TagCounts = {};

  const addTag = (raw: unknown, prefix = "theme") => {
    const token = String(raw || "").trim().toLowerCase();
    if (!token) return;
    const key = token.includes(":") ? token : `${prefix}:${token}`;
    derivedTagCounts[key] = (derivedTagCounts[key] || 0) + 1;
  };

  const addTokens = (tokens: unknown, prefix: string) => {
    if (!Array.isArray(tokens)) return;
    for (const token of tokens) addTag(token, prefix);
  };

  addTokens((card as any)?.tags, "theme");
  addTag((card as any)?.genre, "genre");
  addTokens(semantic.contentTraits, "theme");
  addTokens(semantic.toneTraits, "vibe");
  addTokens(semantic.characterTraits, "theme");
  addTokens(semantic.storyTraits, "theme");
  addTokens(semantic.aversionTraits, "theme");

  if (Object.keys(derivedTagCounts).length === 0) return null;

  const inferred = buildTasteProfile({
    tagCounts: derivedTagCounts,
    feedback: [] as TasteFeedbackEvent[],
    itemTraitsById: {},
  });
  return tasteVectorFromAxes((inferred as any)?.axes);
}

function weightedDirectTraitsHistory(
  history: SwipeHistoryEntry[]
): TasteVector[] {
  const decisionHistory = history.filter((entry) => entry.direction !== "skip");
  const totalDecisionCards = Math.max(decisionHistory.length, 1);

  return decisionHistory
    .map((entry) => {
      const direct = directTraitsFromCard(entry.card) || semanticTraitsFromCard(entry.card);
      if (!direct) return null;

      const directionScale = entry.direction === "like" ? 1 : -1;
      const perCardScale = Math.min(
        MAX_SINGLE_CARD_DIRECT_TRAIT_WEIGHT,
        1 / totalDecisionCards
      );

      const scaled: Record<string, number> = {};
      for (const [axis, value] of Object.entries(direct)) {
        scaled[axis] = numberOrZero(value) * directionScale * perCardScale;
      }
      return scaled as TasteVector;
    })
    .filter(Boolean) as TasteVector[];
}

function cardDirectAxisSignal(card: SwipeDeckCard, axis: TwentyQAxis): number {
  const direct = directTraitsFromCard(card);
  if (!direct) return 0;
  return numberOrZero((direct as any)[axis]);
}

function swipeSignalFromCard(card: SwipeDeckCard, direction: SwipeSignal["direction"]): SwipeSignal {
  let vector;

  if ((card as any)?.tasteTraits) {
    // Direct 20Q signal
    vector = tasteVectorFromAxes((card as any).tasteTraits);
  } else {
    const counts = cardTagCounts(card as any);
    const singleCardTaste = buildTasteProfile({
      tagCounts: counts,
      feedback: [] as TasteFeedbackEvent[],
      itemTraitsById: {},
    });
    vector = tasteVectorFromAxes((singleCardTaste as any)?.axes);
  }

  return {
    bookId:
      String((card as any)?.id || "") ||
      `${String((card as any)?.title || "untitled")}::${String((card as any)?.author || "unknown")}`,
    direction,
    vector,
    timestamp: new Date().toISOString(),
  };
}

function mergeActiveTasteIntoProfile(baseProfile: any, activeVector: TasteVector | null) {
  if (!activeVector) return baseProfile;

  return {
    ...baseProfile,
    axes: {
      ...(baseProfile?.axes || {}),
      ideaDensity: activeVector.ideaDensity,
      darkness: activeVector.darkness,
      warmth: activeVector.warmth,
      realism: activeVector.realism,
      characterFocus: activeVector.characterFocus,
      pacing: activeVector.pacing,
    },
    confidence: Math.max(numberOrZero(baseProfile?.confidence), 0.25),
  };
}

function formatTasteVectorPreview(vector: TasteVector | null | undefined) {
  if (!vector) return "(flat)";
  const entries = Object.entries(vector)
    .filter(([, value]) => Math.abs(value) >= 0.15)
    .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))
    .slice(0, 8)
    .map(([axis, value]) => `${axis}:${value > 0 ? "+" : ""}${value.toFixed(2)}`);

  return entries.length > 0 ? entries.join(", ") : "(flat)";
}

function axisValue(vector: TasteVector | null | undefined, axis: TwentyQAxis): number {
  if (!vector) return 0;
  return numberOrZero(vector[axis]);
}

function buildTwentyQObjectives(deckKey: DeckKey): TwentyQObjective[] {
  const lane = laneFromDeckKey(deckKey);
  const objectives: TwentyQObjective[] = [
    { id: "tone-warmth", rung: 1, axis: "warmth", label: "Tone", description: "Clarify warm vs sharp, hopeful vs bleak, and cozy vs unsettling tone signals.", threshold: 0.24 },
    { id: "tone-darkness", rung: 2, axis: "darkness", label: "Intensity", description: "Clarify gentle vs intense energy and emotionally quiet vs high-stakes preference.", threshold: 0.24 },
    { id: "drive-pacing", rung: 3, axis: "pacing", label: "Drive", description: "Clarify story momentum and what kind of narrative drive feels best.", threshold: 0.24 },
    { id: "world-reality", rung: 4, axis: "realism", label: "World", description: "Clarify realistic vs speculative/fantastical vs uncanny world preference.", threshold: 0.24 },
    { id: "mind-idea-density", rung: 5, axis: "ideaDensity", label: "Concept Load", description: "Clarify accessible vs layered vs philosophical/experimental concept load.", threshold: 0.24 },
    { id: "focus-character", rung: 6, axis: "characterFocus", label: "Final calibration", description: "Final calibration across character focus and blended appeal before recommendations.", threshold: 0.24 },
  ];

  if (lane === "kids") {
    return objectives.map((objective) => ({ ...objective, threshold: 0.2 }));
  }

  if (lane === "teen") {
    return objectives.map((objective) => ({
      ...objective,
      threshold: objective.axis === "pacing" ? 0.2 : objective.threshold,
    }));
  }

  return objectives;
}

function evaluateTwentyQObjective(objective: TwentyQObjective, tasteVector: TasteVector | null | undefined): TwentyQObjectiveStatus {
  const score = axisValue(tasteVector, objective.axis);
  return {
    ...objective,
    score,
    resolved: Math.abs(score) >= objective.threshold,
  };
}

function objectiveKeywords(axis: TwentyQAxis): string[] {
  if (axis === "warmth") return ["warm", "heart", "hope", "cozy", "uplifting", "friendship", "romance", "tender"];
  if (axis === "darkness") return ["dark", "grim", "bleak", "violent", "horror", "tragic", "crime", "danger"];
  if (axis === "realism") return ["realistic", "literary", "historical", "contemporary", "grounded", "slice", "memoir", "speculative", "fantasy", "sci-fi", "magic"];
  if (axis === "characterFocus") return ["character", "relationship", "family", "coming-of-age", "interpersonal", "ensemble"];
  if (axis === "pacing") return ["fast", "thriller", "action", "adventure", "page-turner", "slow", "quiet", "meditative"];
  return ["idea", "philosophical", "brainy", "intellectual", "concept", "big-idea", "thoughtful"];
}

function semanticStringsFromCard(card: any): string[] {
  const semantic = card?.semantic || {};
  return [
    ...(Array.isArray(card?.tags) ? card.tags : []),
    typeof card?.genre === "string" ? card.genre : "",
    typeof card?.title === "string" ? card.title : "",
    typeof card?.author === "string" ? card.author : "",
    ...(Array.isArray(semantic?.contentTraits) ? semantic.contentTraits : []),
    ...(Array.isArray(semantic?.toneTraits) ? semantic.toneTraits : []),
    ...(Array.isArray(semantic?.characterTraits) ? semantic.characterTraits : []),
    ...(Array.isArray(semantic?.storyTraits) ? semantic.storyTraits : []),
  ]
    .map((value) => String(value || "").toLowerCase())
    .filter(Boolean);
}

function cardSignalForAxis(card: SwipeDeckCard, axis: TwentyQAxis): number {
  const directSignal = cardDirectAxisSignal(card, axis);
  if (Math.abs(directSignal) > 0) {
    return Math.abs(directSignal) * 4;
  }

  const bag = semanticStringsFromCard(card as any);
  if (!bag.length) return 0;

  const joined = bag.join(" ");
  let score = 0;
  for (const keyword of objectiveKeywords(axis)) {
    if (joined.includes(keyword)) score += 1;
  }

  if (axis === "realism") {
    if (joined.includes("fantasy") || joined.includes("science fiction") || joined.includes("speculative")) score += 1.5;
    if (joined.includes("historical") || joined.includes("contemporary") || joined.includes("literary")) score += 1.25;
  }
  if (axis === "pacing") {
    if (joined.includes("fast") || joined.includes("thriller") || joined.includes("action")) score += 1.25;
    if (joined.includes("quiet") || joined.includes("slow")) score += 1.0;
  }
  if (axis === "characterFocus") {
    if (joined.includes("relationship") || joined.includes("family") || joined.includes("coming-of-age")) score += 1.25;
  }
  if (axis === "ideaDensity") {
    if (joined.includes("philosoph") || joined.includes("concept") || joined.includes("literary")) score += 1.25;
  }

  return score;
}

function selectTwentyQCard(args: {
  deckKey: DeckKey;
  cards: SwipeDeckCard[];
  tagCounts: TagCounts;
  recentCardKeys: string[];
  objective: TwentyQObjective | null;
}): SwipeDeckCard | null {
  const { deckKey, cards, tagCounts, recentCardKeys, objective } = args;
  if (!cards.length) return null;

  const hasSessionEvidence =
    recentCardKeys.length > 0 ||
    Object.values(tagCounts || {}).some((value) => Number(value || 0) !== 0);

  const fallback = selectAdaptiveCard({ deckKey, cards, tagCounts, recentCardKeys, recentCards: cards.filter((card) => recentCardKeys.includes(cardIdentityKey(card))) });

  // First card of a fresh session should not be locked to the strongest
  // diagnostic/20Q card. Use the already shuffled session deck plus the
  // adaptive weighted picker so every age band starts with real variety.
  if (!hasSessionEvidence) return fallback;

  if (!objective) return fallback;

  const recent = new Set(recentCardKeys);
  const scored = cards
    .map((card, index) => {
      const key = cardIdentityKey(card);
      const baseSignal = cardSignalForAxis(card, objective.axis);
      const noveltyBonus = recent.has(key) ? -2.0 : 0.45;
      const mediaBonus = objective.axis === "realism" && cardCategoryFromTags(card as any) !== "books" ? 0.2 : 0;
      const directSignal = cardDirectAxisSignal(card, objective.axis);

      // Direct 20Q traits are useful, but they were overpowering the picker and
      // causing the same high-signal cards to appear in the same early order.
      // Treat strong cards as qualified rather than automatically next.
      const directMagnitude = Math.abs(directSignal);
      const directBonus = directMagnitude > 0 ? Math.min(3.2, directMagnitude * 3.2) : 0;
      const score = directBonus + baseSignal * 1.9 + noveltyBonus + mediaBonus;

      return { card, index, score };
    })
    .sort((a, b) => b.score - a.score || a.index - b.index);

  const viable = scored.filter((entry) => entry.score > 0.5);
  if (!viable.length) return fallback;

  // Use a broader, flatter qualified pool so every age band keeps feeling fresh
  // after the first card while still asking useful 20Q questions.
  const candidatePool = viable.slice(0, Math.min(18, viable.length));
  const minScore = Math.min(...candidatePool.map((entry) => entry.score));
  const weightedPool = candidatePool.map((entry, index) => {
    const normalizedScore = Math.max(0, entry.score - minScore);
    return {
      ...entry,
      weight: Math.max(0.08, Math.sqrt(normalizedScore + 0.35) + Math.max(0, 0.45 - index * 0.015)),
    };
  });

  const totalWeight = weightedPool.reduce((sum, entry) => sum + entry.weight, 0);
  let roll = Math.random() * totalWeight;
  for (const entry of weightedPool) {
    roll -= entry.weight;
    if (roll <= 0) return entry.card;
  }

  return weightedPool[weightedPool.length - 1]?.card ?? fallback;
}

function shouldFinishTwentyQSession(args: {
  statuses: TwentyQObjectiveStatus[];
  decisionSwipes: number;
  rightSwipes: number;
  leftSwipes: number;
  tagCounts: TagCounts;
  totalSeenCards: number;
  totalCards: number;
}): boolean {
  const { statuses, decisionSwipes, rightSwipes, leftSwipes, tagCounts, totalSeenCards, totalCards } = args;
  const allResolved = statuses.length > 0 && statuses.every((status) => status.resolved);
  const hitDecisionCap = decisionSwipes >= Math.max(statuses.length + 2, 8);
  const strongSignals = Object.values(tagCounts || {}).filter((value) => Math.abs(Number(value || 0)) >= 1).length;
  const hasBalancedPreferenceEvidence = rightSwipes >= 3 && leftSwipes >= 3;
  const hasEnoughSignalBreadth = strongSignals >= 6;
  const hasSufficientEvidence = hasBalancedPreferenceEvidence && hasEnoughSignalBreadth;

  if (allResolved && decisionSwipes >= MIN_20Q_DECISION_SWIPES && hasSufficientEvidence) return true;
  if (hitDecisionCap) return true;
  if (totalSeenCards >= totalCards && decisionSwipes >= MIN_20Q_DECISION_SWIPES) return true;
  return false;
}

export default function SwipeDeckScreen(props: Props) {
  const router = useRouter();
  const { width: windowWidth, height: windowHeight } = Dimensions.get("window");
  const isSmallScreen = windowWidth < 420 || windowHeight < 750;
  const needsCardOffset = isSmallScreen || (Platform.OS === "web" && windowWidth < 600);
  const highlightColor = Platform.OS === "web" ? "var(--highlight-color)" : "#e0b84b";

  const [cardStageHeight, setCardStageHeight] = useState<number>(0);
  const [deckKey, setDeckKey] = useState<DeckKey>("ms_hs");

  const enabledDecks = props.enabledDecks ?? {};
  const sourceEnabled = {
    googleBooks: props.recommendationSourceEnabled?.googleBooks !== false,
    openLibrary: props.recommendationSourceEnabled?.openLibrary !== false,
    localLibrary: props.localLibrarySupported ? props.recommendationSourceEnabled?.localLibrary !== false : false,
    kitsu: props.recommendationSourceEnabled?.kitsu !== false,
    comicVine: props.recommendationSourceEnabled?.comicVine !== false,
  };
  const enabledDeckList = useMemo(
    () => (["k2", "36", "ms_hs", "adult"] as DeckKey[]).filter((k) => enabledDecks[k] !== false),
    [enabledDecks]
  );

  useEffect(() => {
    if (enabledDecks[deckKey] === false) {
      const next = enabledDeckList[0];
      if (next && next !== deckKey) setDeckKey(next);
    }
  }, [deckKey, enabledDecks, enabledDeckList]);

  const [sessionNonce, setSessionNonce] = useState(0);

  const deck = useMemo(
    () => filterDeckCardsByCategory(getDeckByKey(deckKey), props.swipeCategories),
    [deckKey, props.swipeCategories]
  );

  const twentyQObjectives = useMemo(() => buildTwentyQObjectives(deckKey), [deckKey]);

  const cards = useMemo(() => shuffleArray(deck.cards), [deckKey, sessionNonce, deck.cards]);

  const [seenCardKeys, setSeenCardKeys] = useState<string[]>([]);
  const [recentCardKeys, setRecentCardKeys] = useState<string[]>([]);
  const [rightSwipes, setRightSwipes] = useState(0);
  const [leftSwipes, setLeftSwipes] = useState(0);
  const [downSwipes, setDownSwipes] = useState(0);

  const [tagCounts, setTagCounts] = useState<TagCounts>({});
  const [swipeHistory, setSwipeHistory] = useState<SwipeHistoryEntry[]>([]);

  const [recQuery, setRecQuery] = useState<string>("");
  const [recEngineLabel, setRecEngineLabel] = useState<string>("");
  const [recLoading, setRecLoading] = useState(false);
  const [recError, setRecError] = useState<string | null>(null);
  const [recItems, setRecItems] = useState<RecItem[]>([]);
  const [recIndex, setRecIndex] = useState(0);
  const [recCoverCache, setRecCoverCache] = useState<Record<string, string>>({});
  const [autoSearched, setAutoSearched] = useState(false);
  const [forceRecommendationsView, setForceRecommendationsView] = useState(false);
  const [presetTestName, setPresetTestName] = useState<string>("");
  const [presetExecutionStarted, setPresetExecutionStarted] = useState<string>("");
  const [presetSwipesAppliedCount, setPresetSwipesAppliedCount] = useState(0);
  const [presetCardsMatchedCount, setPresetCardsMatchedCount] = useState(0);
  const [presetRecommendationTriggered, setPresetRecommendationTriggered] = useState(false);
  const [presetRecommendationCompleted, setPresetRecommendationCompleted] = useState(false);
  const [presetExportedAfterRecommendation, setPresetExportedAfterRecommendation] = useState(false);
  const [presetExecutionError, setPresetExecutionError] = useState<string>("");

  const [showRating, setShowRating] = useState(false);
  const [showEqualizer, setShowEqualizer] = useState(false);
  const [profileOverridesByLane, setProfileOverridesByLane] = useState<Partial<Record<RecommenderLane, Partial<RecommenderProfile>>>>({});
  const [ratingPreview, setRatingPreview] = useState<0 | 1 | 2 | 3 | 4 | 5>(0);
  const [feedback, setFeedback] = useState<RecFeedback[]>([]);

  const [lastRecommendationInput, setLastRecommendationInput] = useState<RecommenderInput | null>(null);
  const [lastRecommendationResult, setLastRecommendationResult] = useState<any | null>(null);
  const [lastRecommendationTimestamp, setLastRecommendationTimestamp] = useState<string>("");
  const [lastRecommendationSwipeSummary, setLastRecommendationSwipeSummary] = useState<string>("");
  const [lastSourceCounts, setLastSourceCounts] = useState<Record<string, { rawFetched: number; postFilterCandidates: number; finalSelected: number }> | null>(null);
  const [lastCandidatePool, setLastCandidatePool] = useState<any[]>([]);
  const [lastRawPool, setLastRawPool] = useState<any[]>([]);
  const [lastRungStats, setLastRungStats] = useState<any | null>(null);
  const [lastFilterAudit, setLastFilterAudit] = useState<any[]>([]);
  const [lastFilterAuditSummary, setLastFilterAuditSummary] = useState<any | null>(null);
  const [lastFinalRecommenderDebug, setLastFinalRecommenderDebug] = useState<any | null>(null);
  const [lastSourceEnabled, setLastSourceEnabled] = useState(sourceEnabled);
  const [lastSourceSkippedReason, setLastSourceSkippedReason] = useState<string[]>([]);
  const [lastDebugRouterVersion, setLastDebugRouterVersion] = useState<string>("");
  const [lastDebugGcdDispatchTrace, setLastDebugGcdDispatchTrace] = useState<any | null>(null);
  const [lastRouterResultTracePresent, setLastRouterResultTracePresent] = useState<boolean>(false);
  const [lastDeploymentRuntimeMarker, setLastDeploymentRuntimeMarker] = useState<string>("comicvine-proxy-phase");
  const [lastRouterResultKeys, setLastRouterResultKeys] = useState<string[]>([]);
  const [recommendFunctionCalled, setRecommendFunctionCalled] = useState<boolean>(false);
  const [recommendFunctionError, setRecommendFunctionError] = useState<string>("");
  const [recommendFunctionErrorStack, setRecommendFunctionErrorStack] = useState<string>("");
  const [recommendFunctionErrorPhase, setRecommendFunctionErrorPhase] = useState<string>("");
  const [recommendFunctionReturned, setRecommendFunctionReturned] = useState<boolean>(false);
  const [recommendationResultWasPersisted, setRecommendationResultWasPersisted] = useState<boolean>(false);

  const tasteProfile = useMemo(() => {
    return buildTasteProfile({
      tagCounts,
      directTraits: weightedDirectTraitsHistory(swipeHistory),
      feedback: feedback as TasteFeedbackEvent[],
      itemTraitsById: {},
    });
  }, [tagCounts, feedback, swipeHistory]);

  const [sessionMoodProfile, setSessionMoodProfile] = useState<MoodProfile | null>(null);
  const [personalityProfileState, setPersonalityProfileState] = useState<PersonalityProfile | null>(null);
  const [activeTasteVector, setActiveTasteVector] = useState<TasteVector | null>(null);
  const [activeTasteWeights, setActiveTasteWeights] = useState<{ personalityWeight: number; moodWeight: number } | null>(null);
  const [suppressPersonalityLearningForNextRun, setSuppressPersonalityLearningForNextRun] = useState(false);

  const pipelineUserId = useMemo(() => `novelideas:${deckKey}`, [deckKey]);
  const pipelineSessionId = useMemo(() => `swipe-session:${deckKey}:${sessionNonce}`, [deckKey, sessionNonce]);

  const personalityStoreRef = useRef<Record<string, PersonalityProfile>>({});
  const sessionSwipeStoreRef = useRef<Record<string, SwipeSignal[]>>({});
  const moodStoreRef = useRef<Record<string, MoodProfile>>({});
  const recommendationHistoryRef = useRef<Record<DeckKey, RecommendationHistoryBucket>>({
    k2: createRecommendationHistoryBucket(),
    "36": createRecommendationHistoryBucket(),
    ms_hs: createRecommendationHistoryBucket(),
    adult: createRecommendationHistoryBucket(),
  });

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const loaded = await loadProfileOverrides();
      if (!cancelled) setProfileOverridesByLane(loaded as Partial<Record<RecommenderLane, Partial<RecommenderProfile>>>);
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const recommendationPipeline = useMemo(() => {
    return new RecommendationPipeline({
      getPersonalityForUser: async (userId: string) => personalityStoreRef.current[userId] ?? null,
      savePersonalityForUser: async (profile: PersonalityProfile) => {
        personalityStoreRef.current[profile.userId] = profile;
      },
      getSessionSwipes: async (sessionId: string) => sessionSwipeStoreRef.current[sessionId] ?? [],
      saveSessionSwipes: async (sessionId: string, swipes: SwipeSignal[]) => {
        sessionSwipeStoreRef.current[sessionId] = swipes;
      },
      getMoodProfileForSession: async (sessionId: string) => moodStoreRef.current[sessionId] ?? null,
      saveMoodProfileForSession: async (profile: MoodProfile) => {
        moodStoreRef.current[profile.sessionId] = profile;
      },
      getCandidateBooks: async () => {
        const activeDeck = filterDeckCardsByCategory(getDeckByKey(deckKey), props.swipeCategories);
        const rawCards = Array.isArray(activeDeck?.cards) ? activeDeck.cards : [];
        const proseLike = rawCards.filter((card: any) => cardCategoryFromTags(card) === "books");
        const sourceCards = (proseLike.length > 0 ? proseLike : rawCards).slice(0, 40);

        return sourceCards
          .map((card: any, index: number) => {
            const title = String(card?.title || card?.prompt || "").trim();
            if (!title) return null;

            const author = String(card?.author || "Unknown").trim() || "Unknown";
            const genre = String(card?.genre || "").trim();
            const tags = Array.isArray(card?.tags)
              ? card.tags.filter((tag: any) => typeof tag === "string" && tag.trim())
              : [];

            const semantic = card?.semantic || {};

            return {
              id:
                String(card?.id || "").trim() ||
                `${deckKey}:${index}:${title}:${author}`.toLowerCase(),
              title,
              author,
              authors: [author],
              description: typeof card?.description === "string" ? card.description : undefined,
              genres: genre ? [genre] : [],
              tags,
              subjects: [
                ...tags,
                ...(Array.isArray(semantic?.contentTraits) ? semantic.contentTraits : []),
                ...(Array.isArray(semantic?.toneTraits) ? semantic.toneTraits : []),
                ...(Array.isArray(semantic?.characterTraits) ? semantic.characterTraits : []),
                ...(Array.isArray(semantic?.storyTraits) ? semantic.storyTraits : []),
              ],
              publicationYear: 0,
              averageRating: 0,
              ratingCount: 0,
              pageCount: 0,
              popularity: 0,
              source: "swipeDeck",
              raw: card,
            };
          })
          .filter(Boolean) as any[];
      },
    });
  }, [deckKey, props.swipeCategories]);

  const tasteProfileWithMood = useMemo(() => {
    return mergeActiveTasteIntoProfile(tasteProfile, activeTasteVector);
  }, [tasteProfile, activeTasteVector]);

  const sophisticationPreview = useMemo(() => {
    const lane = laneFromDeckKey(deckKey);
    const sophistication = estimateReaderSophisticationFromTaste(tasteProfileWithMood, lane);
    return `${sophistication.score.toFixed(2)} (${sophistication.confidence.toFixed(2)})`;
  }, [deckKey, tasteProfileWithMood]);

  const tasteProfilePreview = useMemo(() => {
    return Object.entries(tasteProfileWithMood.axes)
      .filter(([, value]) => Math.abs(value as number) >= 0.15)
      .sort((a, b) => Math.abs((b[1] as number)) - Math.abs((a[1] as number)))
      .slice(0, 8)
      .map(([axis, value]) => `${axis}:${(value as number) > 0 ? "+" : ""}${(value as number).toFixed(2)}`)
      .join(", ");
  }, [tasteProfileWithMood]);

  const twentyQStatuses = useMemo(() => {
    return twentyQObjectives.map((objective) =>
      evaluateTwentyQObjective(objective, activeTasteVector ?? tasteVectorFromAxes(tasteProfileWithMood.axes))
    );
  }, [twentyQObjectives, activeTasteVector, tasteProfileWithMood.axes]);

  const activeTwentyQIndex = useMemo(() => twentyQStatuses.findIndex((status) => !status.resolved), [twentyQStatuses]);
  const activeTwentyQObjective = activeTwentyQIndex >= 0 ? twentyQStatuses[activeTwentyQIndex] : null;
  const resolvedTwentyQCount = useMemo(() => twentyQStatuses.filter((status) => status.resolved).length, [twentyQStatuses]);

  const currentLaneOverride = useMemo(() => {
    return profileOverridesByLane[laneFromDeckKey(deckKey)] || undefined;
  }, [deckKey, profileOverridesByLane]);

  const { width, height } = Dimensions.get("window");
  const swipeThresholdX = Math.min(140, width * 0.25);
  const swipeThresholdDown = Math.min(170, height * 0.22);

  const position = useRef(new Animated.ValueXY({ x: 0, y: 0 })).current;
  const swipeAxisLock = useRef<"x" | "y" | null>(null);

  async function refreshPipelinePreview() {
    const personality =
      personalityStoreRef.current[pipelineUserId] ?? initializePersonality(pipelineUserId);
    setPersonalityProfileState(personality);

    const mood = moodStoreRef.current[pipelineSessionId] ?? null;
    setSessionMoodProfile(mood);

    try {
      const activeTaste = await recommendationPipeline.previewActiveTaste(pipelineUserId, pipelineSessionId);
      setActiveTasteVector(activeTaste.vector);
      setActiveTasteWeights({
        personalityWeight: activeTaste.personalityWeight,
        moodWeight: activeTaste.moodWeight,
      });
    } catch {
      setActiveTasteVector(null);
      setActiveTasteWeights(null);
    }
  }

  async function recordPipelineSwipe(card: SwipeDeckCard | null, direction: SwipeSignal["direction"]) {
    if (!card) return;
    try {
      await recommendationPipeline.recordSwipe(
        pipelineUserId,
        pipelineSessionId,
        swipeSignalFromCard(card, direction)
      );
      await refreshPipelinePreview();
    } catch {
    }
  }

  function getRecommendationHistoryBucket(targetDeckKey: DeckKey): RecommendationHistoryBucket {
    const existing = recommendationHistoryRef.current[targetDeckKey];
    if (existing) return existing;
    const created = createRecommendationHistoryBucket();
    recommendationHistoryRef.current[targetDeckKey] = created;
    return created;
  }

  function buildRecommendationInputWithHistory(baseInput: RecommenderInput): RecommenderInput {
    const targetDeckKey = baseInput.deckKey || deckKey;
    const history = getRecommendationHistoryBucket(targetDeckKey);

    const likedTagCounts: Record<string, number> = {};
    const dislikedTagCounts: Record<string, number> = {};
    const leftTagCounts: Record<string, number> = {};
    const skippedTagCounts: Record<string, number> = {};
    for (const entry of swipeHistory) {
      const tags = Array.isArray((entry as any)?.card?.tags) ? (entry as any).card.tags : [];
      for (const rawTag of tags) {
        const tag = String(rawTag || "").trim().toLowerCase();
        if (!tag) continue;
        if (entry.direction === "like") likedTagCounts[tag] = Number(likedTagCounts[tag] || 0) + 1;
        if (entry.direction === "dislike") {
          dislikedTagCounts[tag] = Number(dislikedTagCounts[tag] || 0) + 1;
          leftTagCounts[tag] = Number(leftTagCounts[tag] || 0) + 1;
        }
        if (entry.direction === "skip") skippedTagCounts[tag] = Number(skippedTagCounts[tag] || 0) + 1;
      }
    }

    return {
      ...baseInput,
      priorRecommendedIds: uniqueMemoryValues(baseInput.priorRecommendedIds, Array.from(history.recommendedIds)),
      priorRecommendedKeys: uniqueMemoryValues(baseInput.priorRecommendedKeys, Array.from(history.recommendedKeys)),
      priorAuthors: uniqueMemoryValues(baseInput.priorAuthors, Array.from(history.authors)),
      priorSeriesKeys: uniqueMemoryValues(baseInput.priorSeriesKeys, Array.from(history.seriesKeys)),
      priorRejectedIds: uniqueMemoryValues(baseInput.priorRejectedIds, Array.from(history.rejectedIds)),
      priorRejectedKeys: uniqueMemoryValues(baseInput.priorRejectedKeys, Array.from(history.rejectedKeys)),
      ...(likedTagCounts ? { likedTagCounts } : {}),
      ...(dislikedTagCounts ? { dislikedTagCounts } : {}),
      ...(leftTagCounts ? { leftTagCounts } : {}),
      ...(skippedTagCounts ? { skippedTagCounts } : {}),
    };
  }

  function rememberRecommendations(targetDeckKey: DeckKey, items: RecItem[]) {
    if (!Array.isArray(items) || items.length <= 0) return;
    const history = getRecommendationHistoryBucket(targetDeckKey);

    for (const item of items) {
      if (item.kind === "open_library") {
        const identity = historyIdentityFromDoc(item.doc);
        if (identity.id) history.recommendedIds.add(identity.id);
        if (identity.key) history.recommendedKeys.add(identity.key);
        for (const author of identity.authors) history.authors.add(author);
        if (identity.seriesKey) history.seriesKeys.add(identity.seriesKey);
        continue;
      }

      const itemId = normalizeMemoryToken(fallbackId(item.book));
      if (itemId) history.recommendedIds.add(itemId);
      const author = normalizeMemoryToken(item.book?.author);
      if (author) history.authors.add(author);
      const seriesKey = deriveSeriesKeyFromTitle(item.book?.title);
      if (seriesKey) history.seriesKeys.add(seriesKey);
    }
  }

  function rememberRecommendationFeedback(item: RecItem | null, kind: FeedbackKind) {
    if (!item || kind !== "not_interested") return;
    const history = getRecommendationHistoryBucket(deckKey);

    if (item.kind === "open_library") {
      const identity = historyIdentityFromDoc(item.doc);
      if (identity.id) history.rejectedIds.add(identity.id);
      if (identity.key) history.rejectedKeys.add(identity.key);
      return;
    }

    const itemId = normalizeMemoryToken(fallbackId(item.book));
    if (itemId) history.rejectedIds.add(itemId);
  }

  React.useEffect(() => {
    setSeenCardKeys([]);
    setRecentCardKeys([]);
    setRightSwipes(0);
    setLeftSwipes(0);
    setDownSwipes(0);
    setTagCounts({});
    setSwipeHistory([]);
    setRecQuery("");
    setRecEngineLabel("");
    setRecLoading(false);
    setRecError(null);
    setRecItems([]);
    setRecIndex(0);
    setAutoSearched(false);
    setShowRating(false);
    setLastSourceCounts(null);
    setLastCandidatePool([]);
    setLastRawPool([]);
    setLastRungStats(null);
    setLastFilterAudit([]);
    setLastFilterAuditSummary(null);
    setLastFinalRecommenderDebug(null);
    setLastSourceEnabled(sourceEnabled);
    setLastSourceSkippedReason([]);
    setFeedback([]);
    setSessionMoodProfile(null);
    setActiveTasteVector(null);
    setActiveTasteWeights(null);
    setPersonalityProfileState(personalityStoreRef.current[pipelineUserId] ?? initializePersonality(pipelineUserId));
    setLastRecommendationInput(null);
    setLastRecommendationTimestamp("");
    setLastRecommendationSwipeSummary("");
    sessionSwipeStoreRef.current[pipelineSessionId] = [];
    delete moodStoreRef.current[pipelineSessionId];
    position.setValue({ x: 0, y: 0 });
  }, [deckKey, sessionNonce, pipelineSessionId, pipelineUserId]);

  const decisionSwipes = rightSwipes + leftSwipes;
  const totalSeenCards = seenCardKeys.length;
  const remainingCards = useMemo(() => cards.filter((card) => !seenCardKeys.includes(cardIdentityKey(card))), [cards, seenCardKeys]);
  const isDone = shouldFinishTwentyQSession({
    statuses: twentyQStatuses,
    decisionSwipes,
    rightSwipes,
    leftSwipes,
    tagCounts,
    totalSeenCards,
    totalCards: cards.length,
  });
  const showRecommendationsView = isDone || forceRecommendationsView;
  const currentCard: SwipeDeckCard | null = useMemo(() => {
    if (isDone) return null;
    return selectTwentyQCard({
      deckKey,
      cards: remainingCards,
      tagCounts,
      recentCardKeys,
      objective: activeTwentyQObjective,
    });
  }, [isDone, deckKey, remainingCards, tagCounts, recentCardKeys, activeTwentyQObjective]);

  const [swipeCoverCache, setSwipeCoverCache] = useState<Record<string, string>>({});

  const currentCardKey = useMemo(() => {
    const t = (currentCard as any)?.title ?? "";
    const a = (currentCard as any)?.author ?? "";
    return `${t}::${a}`.toLowerCase();
  }, [currentCard]);

  const currentSwipeCoverUri = useMemo(() => {
    if (!currentCard) return undefined;
    const explicitImage = (currentCard as any)?.imageUri as string | undefined;
    if (explicitImage && explicitImage.trim().length > 0) return explicitImage;
    return swipeCoverCache[currentCardKey];
  }, [currentCard, currentCardKey, swipeCoverCache]);

  useEffect(() => {
    let cancelled = false;
    async function run() {
      if (!currentCard) return;

      const title = (currentCard as any)?.title as string | undefined;
      const author = (currentCard as any)?.author as string | undefined;
      const tags = Array.isArray((currentCard as any)?.tags) ? (currentCard as any).tags.map((t: any) => String(t).toLowerCase()) : [];
      const nonBookMediaCard = tags.some((t: string) => t === "media:tv" || t === "media:movie" || t === "media:game");
      if (!title || title.trim().length === 0) return;

      const wikiTitle = (currentCard as any)?.wikiTitle as string | undefined;
      const explicitImage = (currentCard as any)?.imageUri as string | undefined;
      if (!explicitImage && wikiTitle && wikiTitle.trim().length > 0) {
        if (!swipeCoverCache[currentCardKey]) {
          try {
            const foundWiki = await lookupWikipediaThumbnail(wikiTitle);
            if (cancelled) return;
            if (foundWiki?.imageUrl) {
              setSwipeCoverCache((prev) => ({ ...prev, [currentCardKey]: foundWiki.imageUrl! }));
              return;
            }
          } catch {
          }
        } else {
          return;
        }
      }

      if (swipeCoverCache[currentCardKey]) return;

      if (!nonBookMediaCard) {
        try {
          const found = await lookupOpenLibraryCover(title, author);
          if (cancelled) return;
          if (found?.coverUrl) {
            setSwipeCoverCache((prev) => ({ ...prev, [currentCardKey]: found.coverUrl! }));
            return;
          }
        } catch {
        }
      }

      const localFallbackImage = getSwipeCardFallbackImage(deckKey, title);
      const localFallbackUri = localFallbackImage ? Image.resolveAssetSource(localFallbackImage)?.uri : undefined;
      if (typeof localFallbackUri === "string" && localFallbackUri.length > 0) {
        setSwipeCoverCache((prev) => ({ ...prev, [currentCardKey]: localFallbackUri }));
      }
    }
    run();
    return () => {
      cancelled = true;
    };
  }, [currentCard, currentCardKey, swipeCoverCache]);

  function animateOffscreen(dir: "left" | "right" | "down", onDone: () => void) {
    let toX = 0;
    let toY = 0;
    if (dir === "right") toX = width + 120;
    if (dir === "left") toX = -(width + 120);
    if (dir === "down") toY = height + 220;

    Animated.timing(position, {
      toValue: { x: toX, y: toY },
      duration: 180,
      useNativeDriver: false,
    }).start(() => {
      position.setValue({ x: 0, y: 0 });
      onDone();
    });
  }

  function nextCard(card?: SwipeDeckCard | null) {
    if (!card) return;
    const key = cardIdentityKey(card);
    setSeenCardKeys((prev) => (prev.includes(key) ? prev : [...prev, key]));
    setRecentCardKeys((prev) => [...prev, key].slice(-4));
  }
function handleRight(card: SwipeDeckCard) {
  setRightSwipes((n) => n + 1);
  setSwipeHistory((prev) => [...prev, { direction: "like", card }]);
  const anyCard: any = card as any;
  if (Array.isArray(anyCard.tags)) {
    const expandedTags = expandTeenCompanionTags(deckKey, anyCard.tags);
    setTagCounts((prev) => addTags(prev, expandedTags, +1));
  } else if (typeof anyCard.genre === "string" && anyCard.genre.trim()) {
    setTagCounts((prev) => addTags(prev, [`genre:${anyCard.genre.trim()}`], +1));
  }
  void recordPipelineSwipe(card, "like");
  nextCard(card);
}
function handleLeft() {
  setLeftSwipes((n) => n + 1);
  const card = currentCard;
  if (card) {
    setSwipeHistory((prev) => [...prev, { direction: "dislike", card }]);
  }
  const anyCard: any = card as any;
  if (Array.isArray(anyCard?.tags)) {
    const expandedTags = expandTeenCompanionTags(deckKey, anyCard.tags);
    setTagCounts((prev) => addTags(prev, expandedTags, -1));
  } else if (typeof anyCard?.genre === "string" && anyCard.genre.trim()) {
    setTagCounts((prev) => addTags(prev, [`genre:${anyCard.genre.trim()}`], -1));
  }
  void recordPipelineSwipe(card, "dislike");
  nextCard(card);
}

  function handleDownNotSure() {
    setDownSwipes((n) => n + 1);
    if (currentCard) {
      setSwipeHistory((prev) => [...prev, { direction: "skip", card: currentCard }]);
    }
    void recordPipelineSwipe(currentCard, "skip");
    nextCard(currentCard);
  }

  const panResponder = useMemo(() => {
    return PanResponder.create({
      onMoveShouldSetPanResponder: () => !!currentCard,
      onPanResponderGrant: () => {
        swipeAxisLock.current = null;
      },
      onPanResponderMove: (_, gesture) => {
        if (!currentCard) return;
        const dx = gesture.dx;
        const dyRaw = gesture.dy;

        if (!swipeAxisLock.current) {
          const ax = Math.abs(dx);
          const ay = Math.abs(dyRaw);
          if (ax > ay * 1.1) swipeAxisLock.current = "x";
          else if (ay > ax * 1.1) swipeAxisLock.current = "y";
        }

        if (swipeAxisLock.current === "y") {
          const dy = Math.max(0, dyRaw);
          position.setValue({ x: 0, y: dy });
          return;
        }

        position.setValue({ x: dx, y: 0 });
      },
      onPanResponderRelease: (_, gesture) => {
        if (!currentCard) return;
        const lock = swipeAxisLock.current;
        const dx = gesture.dx;
        const dy = Math.max(0, gesture.dy);

        if (lock === "y") {
          if (dy > swipeThresholdDown) {
            animateOffscreen("down", handleDownNotSure);
            return;
          }
          Animated.spring(position, {
            toValue: { x: 0, y: 0 },
            useNativeDriver: false,
            friction: 6,
            tension: 80,
          }).start();
          return;
        }

        if (dx > swipeThresholdX) {
          animateOffscreen("right", () => handleRight(currentCard));
          return;
        }
        if (dx < -swipeThresholdX) {
          animateOffscreen("left", () => handleLeft());
          return;
        }

        Animated.spring(position, {
          toValue: { x: 0, y: 0 },
          useNativeDriver: false,
          friction: 6,
          tension: 80,
        }).start();
      },
    });
  }, [currentCard, swipeThresholdX, swipeThresholdDown, position]);

  function tryAgain() {
    setSessionNonce((n) => n + 1);
  }

  function normalizeRecommendationItems(rawItems: any[]): RecItem[] {
    const docsInOrder: OLDoc[] = Array.isArray(rawItems)
      ? rawItems
          .map((it: any) => it?.doc)
          .filter((doc: any) => doc && typeof doc === "object" && doc?.title)
      : [];

    return docsInOrder.map((doc: any) => ({
      kind: "open_library",
      doc: {
        ...doc,
        diagnostics: doc?.diagnostics || {
          source: doc?.source,
          queryText: doc?.queryText,
          queryRung: doc?.queryRung,
        },
      },
    }));
  }

  async function performRecommendationRun(input: RecommenderInput) {
    const allDisabled =
      !sourceEnabled.googleBooks &&
      !sourceEnabled.openLibrary &&
      !sourceEnabled.localLibrary &&
      !sourceEnabled.kitsu &&
      !sourceEnabled.comicVine;
    if (allDisabled) {
      setRecError("No enabled recommendation sources");
      setRecItems([]);
      setLastSourceEnabled(sourceEnabled);
      setLastSourceSkippedReason(["all_sources_disabled"]);
      return;
    }

    setRecLoading(true);
    setRecError(null);
    setRecItems([]);
    setRecIndex(0);
    setShowRating(false);

    const inputWithHistory = buildRecommendationInputWithHistory(input);
    setRecommendFunctionCalled(true);
    setRecommendFunctionError("");
    setRecommendFunctionErrorStack("");
    setRecommendFunctionErrorPhase("init");
    setRecommendFunctionReturned(false);
    setRecommendationResultWasPersisted(false);

    try {
      setRecommendFunctionErrorPhase("build taste profile");
      setRecommendFunctionErrorPhase("normalize lane weights");
      setRecommendFunctionErrorPhase("build ComicVine rungs");
      setRecommendFunctionErrorPhase("dispatch ComicVine");
      const result = await getRecommendations(
        {
          ...inputWithHistory,
          profileOverride: currentLaneOverride,
          sourceEnabled,
          localLibrarySupported: Boolean(props.localLibrarySupported),
        },
        "auto"
      );
      setRecommendFunctionReturned(true);
      setRecommendFunctionErrorPhase("filter candidates");
      setRecommendFunctionErrorPhase("final recommender");
      setRecommendFunctionErrorPhase("teen post-pass");

      console.log("[NovelIdeas] Recommendation source", {
        engineId: (result as any)?.engineId,
        engineLabel: (result as any)?.engineLabel,
        domainMode: (result as any)?.domainMode,
        query: (result as any)?.builtFromQuery,
        itemCount: Array.isArray((result as any)?.items) ? (result as any).items.length : 0,
        priorRecommendedIds: inputWithHistory.priorRecommendedIds?.length || 0,
        priorRecommendedKeys: inputWithHistory.priorRecommendedKeys?.length || 0,
        priorAuthors: inputWithHistory.priorAuthors?.length || 0,
        priorSeriesKeys: inputWithHistory.priorSeriesKeys?.length || 0,
        priorRejectedIds: inputWithHistory.priorRejectedIds?.length || 0,
        priorRejectedKeys: inputWithHistory.priorRejectedKeys?.length || 0,
        tasteProfile: input.tasteProfile,
        sessionMood: sessionMoodProfile,
        activeTasteVector,
        activeTasteWeights,
        profileOverride: currentLaneOverride,
      });

      setRecQuery(result.builtFromQuery || "");
      setRecEngineLabel(result.engineLabel || "");
      setLastSourceCounts(((result as any)?.debugSourceStats as Record<string, { rawFetched: number; postFilterCandidates: number; finalSelected: number }>) || null);
      setLastCandidatePool(Array.isArray((result as any)?.debugCandidatePool) ? (result as any).debugCandidatePool : []);
      setLastRawPool(Array.isArray((result as any)?.debugRawPool) ? (result as any).debugRawPool : []);
      setLastRungStats((result as any)?.debugRungStats || null);
      setLastFilterAudit(Array.isArray((result as any)?.debugFilterAudit) ? (result as any).debugFilterAudit : []);
      setLastFilterAuditSummary((result as any)?.debugFilterAuditSummary || null);
      setLastFinalRecommenderDebug((result as any)?.debugFinalRecommender || null);
      setLastSourceEnabled((result as any)?.sourceEnabled || sourceEnabled);
      setLastSourceSkippedReason(Array.isArray((result as any)?.sourceSkippedReason) ? (result as any).sourceSkippedReason : []);
      setLastDebugRouterVersion(typeof (result as any)?.debugRouterVersion === "string" ? (result as any).debugRouterVersion : "router-comicvine-proxy-default-v1");
      setLastRouterResultTracePresent(Boolean((result as any)?.routerResultTracePresent));
      setLastRouterResultKeys(Array.isArray((result as any)?.routerResultKeys) ? (result as any).routerResultKeys : Object.keys((result as any) || {}));
      setLastDeploymentRuntimeMarker(typeof (result as any)?.deploymentRuntimeMarker === "string" ? (result as any).deploymentRuntimeMarker : "comicvine-proxy-phase");
      const incomingTrace = (result as any)?.debugComicVineDispatchTrace || (result as any)?.debugGcdDispatchTrace;
      const fallbackTrace = {
        traceSource: "fallback" as const,
        sourceEnabledComicVine: Boolean(sourceEnabled?.comicVine),
        comicVineProxyUrl: "/api/comicvine",
        normalizedComicVineProxyUrl: "/api/comicvine",
        comicVineProxyConfigured: Boolean(sourceEnabled?.comicVine),
      };
      setLastDebugGcdDispatchTrace(incomingTrace ? { ...incomingTrace, traceSource: incomingTrace?.traceSource || "router" } : fallbackTrace);
      setLastRecommendationInput(input);
      setLastRecommendationResult(result as any);
      setLastRecommendationTimestamp(new Date().toISOString());
      setLastRecommendationSwipeSummary(`Right:${rightSwipes} • Left:${leftSwipes} • Skip:${downSwipes} • Decisions:${decisionSwipes} • 20Q:${resolvedTwentyQCount}/${twentyQObjectives.length}`);

      const normalizedItems = normalizeRecommendationItems(result.items);
      if (normalizedItems.length > 0) {
        rememberRecommendations(input.deckKey, normalizedItems);
        setRecommendationResultWasPersisted(true);
        setRecItems(normalizedItems);
        setRecError(null);
      } else {
        setRecItems([]);
        setRecError(
          "No matches found for this swipe. Try swiping a few different cards, or tap Next to try again."
        );
      }
    } catch (err: any) {
      setRecommendFunctionError(String(err?.message || err || "recommendation_call_failed"));
      setRecommendFunctionErrorStack(String(err?.stack || ""));
      setRecommendFunctionErrorPhase((prev) => prev || "unknown");
      const diag = (err as any)?.recommenderDiagnostics || null;
      console.log("[NovelIdeas][REC] router_error", { message: err?.message, diagnostics: diag });
      if (diag) {
        if (typeof diag?.builtQuery === "string") setRecQuery(diag.builtQuery);
        if (diag?.sourceEnabled) setLastSourceEnabled(diag.sourceEnabled);
        if (Array.isArray(diag?.sourceSkippedReason)) setLastSourceSkippedReason(diag.sourceSkippedReason);
        setLastDebugGcdDispatchTrace((prev) => ({ ...(prev || {}), preFatalDispatchState: diag }));
      }
      setRecItems([]);
      setRecError(err?.message || "Recommendation engine could not be reached (network blocked).");
    } finally {
      setRecLoading(false);
    }
  }

  async function runAutoRecommendations() {
    const tagCountsForQuery: any = { ...(tagCounts as any) };

    Object.keys(tagCountsForQuery).forEach((k) => {
      if (k.startsWith("age:") || k.startsWith("audience:")) delete tagCountsForQuery[k];
    });

    if (deckKey === "k2") {
      tagCountsForQuery["audience:kids"] = 1000;
      tagCountsForQuery["age:k2"] = 1000;
    } else if (deckKey === "36") {
      tagCountsForQuery["audience:kids"] = 1000;
      tagCountsForQuery["age:36"] = 1000;
    } else if (deckKey === "ms_hs") {
      tagCountsForQuery["audience:teen"] = 1000;
      tagCountsForQuery["age:mshs"] = 1000;
    } else if (deckKey === "adult") {
      tagCountsForQuery["audience:adult"] = 1000;
      tagCountsForQuery["age:adult"] = 1;
    }

    try {
      await refreshPipelinePreview();

      const input: RecommenderInput = {
        deckKey,
        tagCounts: tagCountsForQuery,
        tasteProfile: tasteProfileWithMood,
        limit: 10,
        timeoutMs: 9000,
      };

      await performRecommendationRun(input);

      if (suppressPersonalityLearningForNextRun) {
        setPersonalityProfileState(personalityStoreRef.current[pipelineUserId] ?? initializePersonality(pipelineUserId));
        setSessionMoodProfile(moodStoreRef.current[pipelineSessionId] ?? null);
        setActiveTasteVector(null);
        setActiveTasteWeights(null);
        setSuppressPersonalityLearningForNextRun(false);
        return;
      }

      const finalized = await recommendationPipeline.finalizeSession(pipelineUserId, pipelineSessionId);
      setPersonalityProfileState(finalized.nextPersonality);
      setSessionMoodProfile(finalized.mood);
      await refreshPipelinePreview();
    } catch (err: any) {
      console.log("[NovelIdeas][REC] auto_run_error", { message: err?.message });
    }
  }

  const testSessionPresets: TestSessionPreset[] = [
    { id: "test_a", label: "Test A", sequence: ["like", "like", "dislike", "skip", "like", "dislike", "like", "skip"] },
    { id: "test_b", label: "Test B", sequence: ["dislike", "dislike", "like", "skip", "dislike", "like", "skip", "like"] },
    { id: "test_c", label: "Test C", sequence: ["like", "skip", "like", "skip", "dislike", "like", "dislike", "like"] },
  ];

  async function runTestSessionPreset(preset: TestSessionPreset) {
    setPresetTestName(preset.label);
    setPresetExecutionStarted(new Date().toISOString());
    setPresetExecutionError("");
    setPresetRecommendationTriggered(false);
    setPresetRecommendationCompleted(false);
    setPresetExportedAfterRecommendation(false);
    const sampleCards = cards.slice(0, preset.sequence.length);
    if (sampleCards.length === 0) {
      Alert.alert("No cards", "This deck has no cards to run a test session.");
      return;
    }

    const entries: SwipeHistoryEntry[] = sampleCards.map((card, index) => ({
      card,
      direction: preset.sequence[index] || "skip",
    }));

    const nextTagCounts: TagCounts = {};
    for (const entry of entries) {
      const directionWeight = entry.direction === "like" ? 1 : entry.direction === "dislike" ? -1 : 0;
      if (!directionWeight) continue;
      const tags = Array.isArray((entry.card as any)?.tags) ? (entry.card as any).tags : [];
      for (const rawTag of tags) {
        const tag = String(rawTag || "").trim().toLowerCase();
        if (!tag) continue;
        nextTagCounts[tag] = Number(nextTagCounts[tag] || 0) + directionWeight;
      }
    }

    const likeCount = entries.filter((entry) => entry.direction === "like").length;
    const dislikeCount = entries.filter((entry) => entry.direction === "dislike").length;
    const skipCount = entries.filter((entry) => entry.direction === "skip").length;
    const seenKeys = entries.map((entry) => cardIdentityKey(entry.card));
    const decisions = likeCount + dislikeCount;

    setSwipeHistory(entries);
    setTagCounts(nextTagCounts);
    setRightSwipes(likeCount);
    setLeftSwipes(dislikeCount);
    setDownSwipes(skipCount);
    setSeenCardKeys(seenKeys);
    setRecentCardKeys(seenKeys.slice(-6));
    setForceRecommendationsView(true);
    setAutoSearched(true);
    setPresetSwipesAppliedCount(entries.length);
    setPresetCardsMatchedCount(sampleCards.length);
    setLastRecommendationSwipeSummary(`Right:${likeCount} • Left:${dislikeCount} • Skip:${skipCount} • Decisions:${decisions} • 20Q:${resolvedTwentyQCount}/${twentyQObjectives.length}`);

    const tagCountsForQuery: any = { ...nextTagCounts };
    tagCountsForQuery["audience:kids"] = 0;
    tagCountsForQuery["audience:teen"] = 0;
    tagCountsForQuery["audience:adult"] = 0;
    tagCountsForQuery["age:k2"] = 0;
    tagCountsForQuery["age:36"] = 0;
    tagCountsForQuery["age:mshs"] = 0;
    tagCountsForQuery["age:adult"] = 0;
    if (deckKey === "k2") {
      tagCountsForQuery["audience:kids"] = 1000;
      tagCountsForQuery["age:k2"] = 1000;
    } else if (deckKey === "36") {
      tagCountsForQuery["audience:kids"] = 1000;
      tagCountsForQuery["age:36"] = 1000;
    } else if (deckKey === "ms_hs") {
      tagCountsForQuery["audience:teen"] = 1000;
      tagCountsForQuery["age:mshs"] = 1000;
    } else if (deckKey === "adult") {
      tagCountsForQuery["audience:adult"] = 1000;
      tagCountsForQuery["age:adult"] = 1;
    }

    const input: RecommenderInput = {
      deckKey,
      tagCounts: tagCountsForQuery,
      tasteProfile: mergeActiveTasteIntoProfile(
        buildTasteProfile({
          tagCounts: nextTagCounts,
          directTraits: weightedDirectTraitsHistory(entries),
          feedback: [],
          itemTraitsById: {},
        }),
        activeTasteVector
      ),
      limit: 10,
      timeoutMs: 9000,
    };

    try {
      setPresetRecommendationTriggered(true);
      await performRecommendationRun(input);
      setPresetRecommendationCompleted(true);
    } catch (err: any) {
      setPresetExecutionError(String(err?.message || err || "preset_execution_failed"));
      setPresetRecommendationCompleted(false);
      throw err;
    }
  }

  function handleFreshUserReset() {
    const fresh = initializePersonality(pipelineUserId);

    personalityStoreRef.current[pipelineUserId] = fresh;
    sessionSwipeStoreRef.current[pipelineSessionId] = [];
    delete moodStoreRef.current[pipelineSessionId];
    recommendationHistoryRef.current[deckKey] = createRecommendationHistoryBucket();

    setProfileOverridesByLane((prev) => {
      const lane = laneFromDeckKey(deckKey);
      const next = { ...prev };
      delete next[lane];
      return next;
    });

    setSeenCardKeys([]);
    setRecentCardKeys([]);
    setRightSwipes(0);
    setLeftSwipes(0);
    setDownSwipes(0);
    setTagCounts({});
    setSwipeHistory([]);
    setFeedback([]);
    setRecQuery("");
    setRecEngineLabel("");
    setRecLoading(false);
    setRecError(null);
    setRecItems([]);
    setRecIndex(0);
    setRecCoverCache({});
    setAutoSearched(false);
    setForceRecommendationsView(false);
    setPresetTestName("");
    setPresetExecutionStarted("");
    setPresetSwipesAppliedCount(0);
    setPresetCardsMatchedCount(0);
    setPresetRecommendationTriggered(false);
    setPresetRecommendationCompleted(false);
    setPresetExportedAfterRecommendation(false);
    setPresetExecutionError("");
    setShowRating(false);
    setLastRecommendationInput(null);
    setLastRecommendationTimestamp("");
    setLastRecommendationSwipeSummary("");
    setLastSourceCounts(null);
    setLastCandidatePool([]);
    setLastRawPool([]);
    setLastRungStats(null);
    setLastFilterAudit([]);
    setLastFilterAuditSummary(null);
    setLastFinalRecommenderDebug(null);
    setSessionMoodProfile(null);
    setPersonalityProfileState(fresh);
    setActiveTasteVector(null);
    setActiveTasteWeights(null);
    setSuppressPersonalityLearningForNextRun(true);
    position.setValue({ x: 0, y: 0 });
    setSessionNonce((n) => n + 1);
  }


  function summarizeCounts(values: Array<string | number | undefined | null>) {
    const counts = new Map<string, number>();
    for (const value of values) {
      const key = String(value ?? "").trim();
      if (!key) continue;
      counts.set(key, (counts.get(key) || 0) + 1);
    }
    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([key, count]) => `${key}:${count}`)
      .join(", ");
  }

  function inferQueryFamily(queryText: unknown): string {
    const q = String(queryText || "").toLowerCase();
    if (!q) return "unknown";
    if (/(psychological horror|survival horror|haunted|ghost|supernatural|gothic horror|horror)/.test(q)) return "horror";
    if (/(science fiction|sci-fi|scifi|space opera|dystopian)/.test(q)) return "science fiction";
    if (/(domestic suspense|psychological suspense|crime thriller|spy thriller|thriller)/.test(q)) return "thriller";
    if (/(mystery|detective|crime)/.test(q)) return "mystery";
    if (/(dark fantasy|gothic fantasy|fantasy)/.test(q)) return "fantasy";
    if (/romance/.test(q)) return "romance";
    return "unknown";
  }

  function compactFieldBlock(label: string, value: unknown) {
    const normalized = String(value ?? "").trim();
    if (!normalized) return null;
    return `${label}: ${normalized}`;
  }

  function formatDiagnosticObject(value: any, allowList?: string[]) {
    if (!value || typeof value !== "object") return [] as string[];

    const keys = Array.isArray(allowList)
      ? allowList.filter((key) => value[key] != null && String(value[key]).trim() !== "")
      : Object.keys(value).filter((key) => value[key] != null && String(value[key]).trim() !== "");

    return keys.map((key) => `${key}:${typeof value[key] === "object" ? JSON.stringify(value[key]) : String(value[key])}`);
  }

  function candidateIdentityKey(row: any): string {
    return `${String(row?.title || "").trim().toLowerCase()}::${String(row?.author || "").trim().toLowerCase()}`;
  }

  function buildRawCandidateLookup(rows: any[]) {
    const map = new Map<string, any[]>();
    for (const row of Array.isArray(rows) ? rows : []) {
      const key = candidateIdentityKey(row);
      if (!key) continue;
      const bucket = map.get(key) || [];
      bucket.push(row);
      map.set(key, bucket);
    }
    return map;
  }

  function formatQueryFamilyBreakdown(rows: any[]) {
    if (!Array.isArray(rows) || rows.length === 0) return "(none)";
    return summarizeCounts(rows.map((row) => inferQueryFamily(row?.queryText)));
  }

  function formatLaneBreakdown(rows: any[]) {
    if (!Array.isArray(rows) || rows.length === 0) return "(none)";
    return summarizeCounts(rows.map((row) => row?.laneKind || "(none)"));
  }

  function formatRungBreakdown(rows: any[]) {
    if (!Array.isArray(rows) || rows.length === 0) return "(none)";
    return summarizeCounts(rows.map((row) => row?.queryRung != null ? `rung${row.queryRung}` : "rung?"));
  }

  function formatRecommendationDiagnostics(items: RecItem[], candidateRows: any[], rawRows: any[]) {
    if (!Array.isArray(items) || items.length === 0) return "(none)";

    const candidateLookup = buildRawCandidateLookup(candidateRows);
    const rawLookup = buildRawCandidateLookup(rawRows);

    return items.map((item, index) => {
      const title = item.kind === "open_library" ? item.doc?.title : item.book?.title;
      const author = item.kind === "open_library"
        ? (Array.isArray(item.doc?.author_name) && item.doc.author_name.length > 0 ? item.doc.author_name[0] : "Unknown author")
        : item.book?.author;
      const key = `${String(title || "").trim().toLowerCase()}::${String(author || "").trim().toLowerCase()}`;
      const candidate = (candidateLookup.get(key) || [])[0] || null;
      const matchingRawRows = rawLookup.get(key) || [];
      const diagnostics = item.kind === "open_library" ? (item.doc as any)?.diagnostics || {} : {};

      const traceBits = [
        compactFieldBlock("queryFamily", inferQueryFamily(candidate?.queryText ?? diagnostics?.queryText ?? (item.kind === "open_library" ? (item.doc as any)?.queryText : ""))),
        compactFieldBlock("candidateLane", candidate?.laneKind),
        compactFieldBlock("candidateRung", candidate?.queryRung),
        compactFieldBlock("candidateScore", typeof candidate?.score === "number" ? candidate.score.toFixed(3) : ""),
        compactFieldBlock("rawMatches", matchingRawRows.length),
        ...formatDiagnosticObject(diagnostics, ["source", "preFilterScore", "postFilterScore", "finalScore", "comicVineRelevanceScore", "titleMatchScore", "descriptionMatchScore", "tasteMatchScore", "reasonAccepted", "queryText", "queryRung", "filterTrace", "queryFamily", "baseIntent", "baseIntentLocked", "matchedQueryTokens", "rejectedBy"]),
        ...formatDiagnosticObject(candidate, ["queryText", "queryRung", "laneKind", "score", "baseIntent", "queryFamily", "matchedQueryTokens", "filterTrace", "filterType", "rejectedBy"]),
      ].filter(Boolean);

      return [`${index + 1}. ${title || "Untitled"} — ${author || "Unknown author"}`, ...traceBits.map((line) => `   ${line}`)].join("\n");
    }).join("\n");
  }


  function formatPoolDetailRows(rows: any[], label: string) {
    if (!Array.isArray(rows) || rows.length === 0) return "(none)";

    return rows.slice(0, 120).map((row, index) => {
      const title = row?.title || "Untitled";
      const author = row?.author || "Unknown author";
      const bits = [
        compactFieldBlock("source", row?.source),
        compactFieldBlock("queryFamily", inferQueryFamily(row?.queryText)),
        compactFieldBlock("queryText", row?.queryText),
        compactFieldBlock("queryRung", row?.queryRung),
        compactFieldBlock("laneKind", row?.laneKind),
        compactFieldBlock("score", typeof row?.score === "number" ? row.score.toFixed(3) : row?.score),
        compactFieldBlock("filterKept", row?.filterKept),
        compactFieldBlock("filterFamily", row?.filterFamily),
        compactFieldBlock("rejectReasons", Array.isArray(row?.filterRejectReasons) && row.filterRejectReasons.length ? row.filterRejectReasons.join(", ") : (Array.isArray(row?.rejectReasons) && row.rejectReasons.length ? row.rejectReasons.join(", ") : "")),
        compactFieldBlock("passedChecks", Array.isArray(row?.filterPassedChecks) && row.filterPassedChecks.length ? row.filterPassedChecks.join(", ") : (Array.isArray(row?.passedChecks) && row.passedChecks.length ? row.passedChecks.join(", ") : "")),
      ].filter(Boolean);

      return [`${index + 1}. ${title} — ${author}`, ...bits.map((bit) => `   ${bit}`)].join("\n");
    }).join("\n");
  }

  function formatFilterAuditSummary(summary: any) {
    if (!summary || typeof summary !== "object") return "(none)";
    const reasons = summary?.reasons && typeof summary.reasons === "object"
      ? Object.entries(summary.reasons)
          .sort((a: any, b: any) => Number(b[1]) - Number(a[1]) || String(a[0]).localeCompare(String(b[0])))
          .map(([reason, count]) => `${reason}:${count}`)
          .join(", ")
      : "(none)";

    return [
      `kept:${summary?.kept ?? 0}`,
      `rejected:${summary?.rejected ?? 0}`,
      `reasons:${reasons || "(none)"}`,
    ].join("\n");
  }

  function formatFilterAuditRows(rows: any[]) {
    if (!Array.isArray(rows) || rows.length === 0) return "(none)";

    return rows.slice(0, 160).map((row, index) => {
      const bits = [
        compactFieldBlock("source", row?.source),
        compactFieldBlock("queryText", row?.queryText),
        compactFieldBlock("queryRung", row?.queryRung),
        compactFieldBlock("laneKind", row?.laneKind),
        compactFieldBlock("kept", row?.kept),
        compactFieldBlock("filterFamily", row?.filterFamily),
        compactFieldBlock("wantsHorrorTone", row?.wantsHorrorTone),
        compactFieldBlock("pageCount", row?.pageCount),
        compactFieldBlock("ratingsCount", row?.ratingsCount),
        compactFieldBlock("rejectReasons", Array.isArray(row?.rejectReasons) && row.rejectReasons.length ? row.rejectReasons.join(", ") : ""),
        compactFieldBlock("passedChecks", Array.isArray(row?.passedChecks) && row.passedChecks.length ? row.passedChecks.join(", ") : ""),
        compactFieldBlock("flags", row?.flags ? JSON.stringify(row.flags) : ""),
      ].filter(Boolean);

      return [`${index + 1}. ${row?.title || "Untitled"} — ${row?.author || "Unknown author"}`, ...bits.map((bit) => `   ${bit}`)].join("\n");
    }).join("\n");
  }

  function formatFinalRecommenderDebug(debug: any) {
    if (!debug || typeof debug !== "object") return "(none)";
    const rejectionCounts = debug?.rejectionCounts && typeof debug.rejectionCounts === "object"
      ? Object.entries(debug.rejectionCounts)
          .sort((a: any, b: any) => Number(b[1]) - Number(a[1]) || String(a[0]).localeCompare(String(b[0])))
          .map(([reason, count]) => `${reason}:${count}`)
          .join(", ")
      : "(none)";

    return [
      `inputCount:${debug?.inputCount ?? 0}`,
      `dedupedCount:${debug?.dedupedCount ?? 0}`,
      `acceptedCount:${debug?.acceptedCount ?? 0}`,
      `rejectedCount:${debug?.rejectedCount ?? 0}`,
      `rejectionCounts:${rejectionCounts || "(none)"}`,
    ].join("\n");
  }

  function formatFinalRecommenderRejections(debug: any) {
    const rows = Array.isArray(debug?.rejected) ? debug.rejected : [];
    if (!rows.length) return "(none)";

    return rows.slice(0, 120).map((row: any, index: number) => {
      const bits = [
        compactFieldBlock("source", row?.source),
        compactFieldBlock("reason", row?.reason),
        compactFieldBlock("detail", row?.detail),
      ].filter(Boolean);

      return [`${index + 1}. ${row?.title || "Untitled"} — ${row?.author || "Unknown author"}`, ...bits.map((bit) => `   ${bit}`)].join("\n");
    }).join("\n");
  }

  async function handleCopyDiagnostics() {
    if (presetRecommendationCompleted) setPresetExportedAfterRecommendation(true);
    const recomputedRight = swipeHistory.filter((entry) => entry.direction === "like").length;
    const recomputedLeft = swipeHistory.filter((entry) => entry.direction === "dislike").length;
    const recomputedSkip = swipeHistory.filter((entry) => entry.direction === "skip").length;
    const recomputedDecisions = recomputedRight + recomputedLeft;
    const recomputedSummary = `Right:${recomputedRight} • Left:${recomputedLeft} • Skip:${recomputedSkip} • Decisions:${recomputedDecisions} • 20Q:${resolvedTwentyQCount}/${twentyQObjectives.length}`;
    const recommendationLines = recItems.length
      ? recItems.map((item, i) => {
          if (item.kind === "open_library") {
            const doc: any = item.doc;
            const title = doc?.title ?? "Untitled";
            const author =
              Array.isArray(doc?.author_name) && doc.author_name.length > 0
                ? doc.author_name[0]
                : "Unknown author";
            const year = doc?.first_publish_year ? ` (${doc.first_publish_year})` : "";
            const diagnostics = doc?.diagnostics || {};
            const queryText = diagnostics.queryText ?? doc?.queryText ?? "(missing)";

            return [
              `${i + 1}. ${title} — ${author}${year}`,
              `   source: ${diagnostics.source ?? doc?.source ?? "(unknown)"}`,
              `   queryFamily: ${inferQueryFamily(queryText)}`,
              `   preFilterScore: ${diagnostics.preFilterScore ?? "(missing)"}`,
              `   postFilterScore: ${diagnostics.postFilterScore ?? "(missing)"}`,
              `   queryText: ${queryText}`,
              `   queryRung: ${diagnostics.queryRung ?? doc?.queryRung ?? "(missing)"}`,
              ...formatDiagnosticObject(diagnostics, ["baseIntent", "baseIntentLocked", "matchedQueryTokens", "filterTrace", "filterType", "rejectedBy"]).map((line) => `   ${line}`),
            ].join("\n");
          }
          const title = item.book?.title ?? "Untitled";
          const author = item.book?.author ?? "Unknown author";
          const year = item.book?.year ? ` (${item.book.year})` : "";
          return `${i + 1}. ${title} — ${author}${year}`;
        }).join("\n")
      : "(none)";

    const sortedTagCounts = Object.keys(tagCounts).length
      ? Object.entries(tagCounts)
          .sort((a, b) => b[1] - a[1])
          .map(([k, v]) => `${k}:${v}`)
          .join(", ")
      : "(none)";

    const swipeHistoryLines = swipeHistory.length
      ? swipeHistory.map((entry, index) => {
          const anyCard: any = entry.card as any;
          const title = anyCard?.title || anyCard?.prompt || "(untitled)";
          const author = anyCard?.author || "";
          const genre = anyCard?.genre || "";
          const tags = Array.isArray(anyCard?.tags)
            ? anyCard.tags.filter((tag: any) => typeof tag === "string" && tag.trim()).join(", ")
            : "";
          const details = [author, genre, tags].filter(Boolean).join(" — ");
          return `${index + 1}. ${entry.direction.toUpperCase()} — ${title}${details ? ` — ${details}` : ""}`;
        }).join("\n")
      : "(none)";

    const rungQueryMap = new Map<string, string>();
    for (const row of rawPoolRows) {
      const rungValue = row?.queryRung;
      const queryText = typeof row?.queryText === "string" ? row.queryText.trim() : "";
      if (rungValue == null || !queryText) continue;
      const rungKey = String(rungValue);
      if (!rungQueryMap.has(rungKey)) {
        rungQueryMap.set(rungKey, queryText);
      }
    }

    const rungQueryLines = Array.from(rungQueryMap.entries())
      .sort((a, b) => Number(a[0]) - Number(b[0]))
      .map(([rung, query]) => `Rung ${rung}: ${query}`)
      .join("\n") || "(none)";

    const sourceCountSummary = sourceCountRows
      .map(({ key, label }) => {
        const stats = lastSourceCounts?.[key];
        return `${label}: raw=${stats?.rawFetched ?? 0}, postFilter=${stats?.postFilterCandidates ?? 0}, final=${stats?.finalSelected ?? 0}`;
      })
      .join("\n");
    const preFatalDispatchState = (lastDebugGcdDispatchTrace as any)?.preFatalDispatchState || null;
    const reportBuiltQuery =
      recQuery ||
      (typeof preFatalDispatchState?.builtQuery === "string" ? preFatalDispatchState.builtQuery : "") ||
      (Array.isArray(lastDebugGcdDispatchTrace?.comicVineQueryTexts) ? String(lastDebugGcdDispatchTrace.comicVineQueryTexts[0] || "") : "");
    const reportQueryFamily =
      inferQueryFamily(reportBuiltQuery) !== "unknown"
        ? inferQueryFamily(reportBuiltQuery)
        : (typeof preFatalDispatchState?.routerFamily === "string" ? preFatalDispatchState.routerFamily : "unknown");

    const sourceEnabledSummary = [
      `sourceEnabled.googleBooks:${Boolean(lastSourceEnabled?.googleBooks)}`,
      `sourceEnabled.openLibrary:${Boolean(lastSourceEnabled?.openLibrary)}`,
      `sourceEnabled.localLibrary:${Boolean(lastSourceEnabled?.localLibrary)}`,
      `sourceEnabled.kitsu:${Boolean(lastSourceEnabled?.kitsu)}`,
      `sourceEnabled.comicVine:${Boolean(lastSourceEnabled?.comicVine)}`,
      `sourceSkippedReason:${lastSourceSkippedReason.length ? lastSourceSkippedReason.join(", ") : "(none)"}`,
      `debugRouterVersion:${lastDebugRouterVersion || "router-comicvine-proxy-default-v1"}`,
      `deploymentRuntimeMarker:${lastDeploymentRuntimeMarker || "comicvine-proxy-phase"}`,
      `recommendFunctionCalled:${Boolean(recommendFunctionCalled)}`,
      `recommendFunctionReturned:${Boolean(recommendFunctionReturned)}`,
      `recommendationResultWasPersisted:${Boolean(recommendationResultWasPersisted)}`,
      `recommendFunctionError:${recommendFunctionError || "(none)"}`,
      `comicVineFinalScoreByTitle:${JSON.stringify((lastRecommendationResult as any)?.comicVineFinalScoreByTitle || [])}`,
      `comicVineScoreBreakdownByTitle:${JSON.stringify((lastRecommendationResult as any)?.comicVineScoreBreakdownByTitle || [])}`,
      `recommendFunctionErrorPhase:${recommendFunctionErrorPhase || "(none)"}`,
      `recommendFunctionErrorStack:${recommendFunctionErrorStack || "(none)"}`,
      `routerResultTracePresent:${Boolean(lastRouterResultTracePresent)}`,
      `routerResultKeys:${lastRouterResultKeys.length ? lastRouterResultKeys.join(", ") : "(none)"}`,
      `finalAcceptedDocsLength:${Number((lastRecommendationResult as any)?.finalAcceptedDocsLength || 0)}`,
      `renderedTopRecommendationsLength:${Number((lastRecommendationResult as any)?.renderedTopRecommendationsLength || 0)}`,
      `teenPostPassInputLength:${Number((lastRecommendationResult as any)?.teenPostPassInputLength || 0)}`,
      `teenPostPassOutputLength:${Number((lastRecommendationResult as any)?.teenPostPassOutputLength || 0)}`,
      `teenPostPassOutputTitles:${Array.isArray((lastRecommendationResult as any)?.teenPostPassOutputTitles) && (lastRecommendationResult as any).teenPostPassOutputTitles.length ? (lastRecommendationResult as any).teenPostPassOutputTitles.join(" | ") : "(none)"}`,
      `finalItemsLength:${Number((lastRecommendationResult as any)?.finalItemsLength || 0)}`,
      `finalItemsTitles:${Array.isArray((lastRecommendationResult as any)?.finalItemsTitles) && (lastRecommendationResult as any).finalItemsTitles.length ? (lastRecommendationResult as any).finalItemsTitles.join(" | ") : "(none)"}`,
      `returnedItemsLength:${Number((lastRecommendationResult as any)?.returnedItemsLength || 0)}`,
      `preTopUpFinalItemsLength:${Number((lastRecommendationResult as any)?.preTopUpFinalItemsLength || 0)}`,
      `topUpCandidatesConsideredLength:${Number((lastRecommendationResult as any)?.topUpCandidatesConsideredLength || 0)}`,
      `topUpCandidatesAcceptedLength:${Number((lastRecommendationResult as any)?.topUpCandidatesAcceptedLength || 0)}`,
      `topUpSourceRankedDocsLength:${Number((lastRecommendationResult as any)?.topUpSourceRankedDocsLength || 0)}`,
      `topUpSourceCandidateDocsLength:${Number((lastRecommendationResult as any)?.topUpSourceCandidateDocsLength || 0)}`,
      `topUpSourceNormalizedCandidatesLength:${Number((lastRecommendationResult as any)?.topUpSourceNormalizedCandidatesLength || 0)}`,
      `topUpSourceEnrichedDocsLength:${Number((lastRecommendationResult as any)?.topUpSourceEnrichedDocsLength || 0)}`,
      `topUpSourceDebugRawPoolLength:${Number((lastRecommendationResult as any)?.topUpSourceDebugRawPoolLength || 0)}`,
      `topUpMergedPoolBeforeFiltersLength:${Number((lastRecommendationResult as any)?.topUpMergedPoolBeforeFiltersLength || 0)}`,
      `topUpMergedPoolAfterDedupeLength:${Number((lastRecommendationResult as any)?.topUpMergedPoolAfterDedupeLength || 0)}`,
      `topUpMergedPoolAfterQualityFiltersLength:${Number((lastRecommendationResult as any)?.topUpMergedPoolAfterQualityFiltersLength || 0)}`,
      `topUpQualityRejectedReasons:${JSON.stringify((lastRecommendationResult as any)?.topUpQualityRejectedReasons || {})}`,
      `topUpQualityRejectedTitlesByReason:${JSON.stringify((lastRecommendationResult as any)?.topUpQualityRejectedTitlesByReason || {})}`,
      `entitySeedConvertedCount:${Number((lastRecommendationResult as any)?.entitySeedConvertedCount || 0)}`,
      `entitySeedTopUpEligibleCount:${Number((lastRecommendationResult as any)?.entitySeedTopUpEligibleCount || 0)}`,
      `entitySeedTopUpRejectedReasons:${JSON.stringify((lastRecommendationResult as any)?.entitySeedTopUpRejectedReasons || {})}`,
      `entitySeedTopUpRejectedTitlesByReason:${JSON.stringify((lastRecommendationResult as any)?.entitySeedTopUpRejectedTitlesByReason || {})}`,
      `topUpRejectedReasons:${JSON.stringify((lastRecommendationResult as any)?.topUpRejectedReasons || {})}`,
      `postTopUpFinalItemsLength:${Number((lastRecommendationResult as any)?.postTopUpFinalItemsLength || 0)}`,
      `recoveryTriggered:${Boolean((lastRecommendationResult as any)?.recoveryTriggered)}`,
      `recoveryInputPoolLength:${Number((lastRecommendationResult as any)?.recoveryInputPoolLength || 0)}`,
      `recoveryEntitySeedMatches:${Number((lastRecommendationResult as any)?.recoveryEntitySeedMatches || 0)}`,
      `recoveryRejectedReasons:${JSON.stringify((lastRecommendationResult as any)?.recoveryRejectedReasons || {})}`,
      `recoveryFinalItemsLength:${Number((lastRecommendationResult as any)?.recoveryFinalItemsLength || 0)}`,
      `countContractSatisfied:${Boolean((lastRecommendationResult as any)?.countContractSatisfied)}`,
      `finalEligibleNonNegativeCount:${Number((lastRecommendationResult as any)?.finalEligibleNonNegativeCount || 0)}`,
      `countContractShortfallReason:${String((lastRecommendationResult as any)?.countContractShortfallReason || "none")}`,
      `returnedItemsBuiltFrom:${String((lastRecommendationResult as any)?.returnedItemsBuiltFrom || "unknown")}`,
      `returnedItemsTitles:${Array.isArray((lastRecommendationResult as any)?.returnedItemsTitles) && (lastRecommendationResult as any).returnedItemsTitles.length ? (lastRecommendationResult as any).returnedItemsTitles.join(" | ") : "(none)"}`,
      `teenPostPassInputSource:${String((lastRecommendationResult as any)?.teenPostPassInputSource || "unknown")}`,
      `scoredCandidateUniverseCount:${Number((lastRecommendationResult as any)?.scoredCandidateUniverseCount || 0)}`,
      `convertedDocsAvailableForScoringCount:${Number((lastRecommendationResult as any)?.convertedDocsAvailableForScoringCount || 0)}`,
      `gcdStructuralEnrichmentCount:${Number((lastRecommendationResult as any)?.gcdStructuralEnrichmentCount || 0)}`,
      `gcdEntryPointLikeCount:${Number((lastRecommendationResult as any)?.gcdEntryPointLikeCount || 0)}`,
      `gcdCollectedLikeCount:${Number((lastRecommendationResult as any)?.gcdCollectedLikeCount || 0)}`,
      `gcdIssueLikeCount:${Number((lastRecommendationResult as any)?.gcdIssueLikeCount || 0)}`,
      `scoredCandidateUniverseSources:${JSON.stringify((lastRecommendationResult as any)?.scoredCandidateUniverseSources || {})}`,
      `scoredCandidateUniverseFranchiseRoots:${Array.isArray((lastRecommendationResult as any)?.scoredCandidateUniverseFranchiseRoots) && (lastRecommendationResult as any).scoredCandidateUniverseFranchiseRoots.length ? (lastRecommendationResult as any).scoredCandidateUniverseFranchiseRoots.join(" | ") : "(none)"}`,
      `broadArtifactRejectedTitles:${Array.isArray((lastRecommendationResult as any)?.broadArtifactRejectedTitles) && (lastRecommendationResult as any).broadArtifactRejectedTitles.length ? (lastRecommendationResult as any).broadArtifactRejectedTitles.join(" | ") : "(none)"}`,
      `zeroScoreBroadFillersUsed:${Number((lastRecommendationResult as any)?.zeroScoreBroadFillersUsed || 0)}`,
      `entitySeedCandidatesFoundBySeed:${JSON.stringify((lastRecommendationResult as any)?.entitySeedCandidatesFoundBySeed || {})}`,
      `entitySeedCandidatesSelected:${Array.isArray((lastRecommendationResult as any)?.entitySeedCandidatesSelected) && (lastRecommendationResult as any).entitySeedCandidatesSelected.length ? (lastRecommendationResult as any).entitySeedCandidatesSelected.join(" | ") : "(none)"}`,
      `parentFranchiseRootByTitle:${JSON.stringify((lastRecommendationResult as any)?.parentFranchiseRootByTitle || {})}`,
      `parentRootSourceByTitle:${JSON.stringify((lastRecommendationResult as any)?.parentRootSourceByTitle || {})}`,
      `normalizedParentRootAliases:${JSON.stringify((lastRecommendationResult as any)?.normalizedParentRootAliases || {})}`,
      `subtitleOnlyParentFragmentRejectedTitles:${Array.isArray((lastRecommendationResult as any)?.subtitleOnlyParentFragmentRejectedTitles) && (lastRecommendationResult as any).subtitleOnlyParentFragmentRejectedTitles.length ? (lastRecommendationResult as any).subtitleOnlyParentFragmentRejectedTitles.join(" | ") : "(none)"}`,
      `parentMetadataUsedForRootCount:${Number((lastRecommendationResult as any)?.parentMetadataUsedForRootCount || 0)}`,
      `cleanCandidateShortfallExpansionTriggered:${Boolean((lastRecommendationResult as any)?.cleanCandidateShortfallExpansionTriggered)}`,
      `expansionFetchAttempted:${Boolean((lastRecommendationResult as any)?.expansionFetchAttempted)}`,
      `expansionFetchResultsByQuery:${JSON.stringify((lastRecommendationResult as any)?.expansionFetchResultsByQuery || [])}`,
      `expansionRawCount:${Number((lastRecommendationResult as any)?.expansionRawCount || 0)}`,
      `expansionConvertedCount:${Number((lastRecommendationResult as any)?.expansionConvertedCount || 0)}`,
      `expansionMergedCandidateCount:${Number((lastRecommendationResult as any)?.expansionMergedCandidateCount || 0)}`,
      `expansionCleanEligibleCount:${Number((lastRecommendationResult as any)?.expansionCleanEligibleCount || 0)}`,
      `expansionSelectedTitles:${Array.isArray((lastRecommendationResult as any)?.expansionSelectedTitles) && (lastRecommendationResult as any).expansionSelectedTitles.length ? (lastRecommendationResult as any).expansionSelectedTitles.join(" | ") : "(none)"}`,
      `expansionCandidatesEnteredScoringCount:${Number((lastRecommendationResult as any)?.expansionCandidatesEnteredScoringCount || 0)}`,
      `expansionCandidatesSurvivedFiltersCount:${Number((lastRecommendationResult as any)?.expansionCandidatesSurvivedFiltersCount || 0)}`,
      `expansionCandidatesRejectedByReason:${JSON.stringify((lastRecommendationResult as any)?.expansionCandidatesRejectedByReason || {})}`,
      `expansionCandidatesAcceptedFinal:${Array.isArray((lastRecommendationResult as any)?.expansionCandidatesAcceptedFinal) && (lastRecommendationResult as any).expansionCandidatesAcceptedFinal.length ? (lastRecommendationResult as any).expansionCandidatesAcceptedFinal.join(" | ") : "(none)"}`,
      `primaryNarrativeQueryMode:${Boolean((lastRecommendationResult as any)?.primaryNarrativeQueryMode)}`,
      `primaryNarrativeQueries:${Array.isArray((lastRecommendationResult as any)?.primaryNarrativeQueries) && (lastRecommendationResult as any).primaryNarrativeQueries.length ? (lastRecommendationResult as any).primaryNarrativeQueries.join(" | ") : "(none)"}`,
      `broadGraphicNovelQueriesUsedAsFallback:${Boolean((lastRecommendationResult as any)?.broadGraphicNovelQueriesUsedAsFallback)}`,
      `broadGraphicNovelFallbackReason:${String((lastRecommendationResult as any)?.broadGraphicNovelFallbackReason || "none")}`,
      `negativeScoreRenderBlockedTitles:${Array.isArray((lastRecommendationResult as any)?.negativeScoreRenderBlockedTitles) && (lastRecommendationResult as any).negativeScoreRenderBlockedTitles.length ? (lastRecommendationResult as any).negativeScoreRenderBlockedTitles.join(" | ") : "(none)"}`,
      `finalUnderfillInsteadOfArtifactFallback:${Boolean((lastRecommendationResult as any)?.finalUnderfillInsteadOfArtifactFallback)}`,
      `expansionDropStageSummary:${String((lastRecommendationResult as any)?.expansionDropStageSummary || "none")}`,
      `formatSignalOnlyRejectedTitles:${Array.isArray((lastRecommendationResult as any)?.formatSignalOnlyRejectedTitles) && (lastRecommendationResult as any).formatSignalOnlyRejectedTitles.length ? (lastRecommendationResult as any).formatSignalOnlyRejectedTitles.join(" | ") : "(none)"}`,
      `genericCollectionArtifactRejectedTitles:${Array.isArray((lastRecommendationResult as any)?.genericCollectionArtifactRejectedTitles) && (lastRecommendationResult as any).genericCollectionArtifactRejectedTitles.length ? (lastRecommendationResult as any).genericCollectionArtifactRejectedTitles.join(" | ") : "(none)"}`,
      `finalTasteThresholdByTitle:${JSON.stringify((lastRecommendationResult as any)?.finalTasteThresholdByTitle || {})}`,
      `finalAcceptedTasteEvidenceByTitle:${JSON.stringify((lastRecommendationResult as any)?.finalAcceptedTasteEvidenceByTitle || {})}`,
      `finalCountCappedToTarget:${Boolean((lastRecommendationResult as any)?.finalCountCappedToTarget)}`,
      `expansionQueryRootMismatchRejectedTitles:${Array.isArray((lastRecommendationResult as any)?.expansionQueryRootMismatchRejectedTitles) && (lastRecommendationResult as any).expansionQueryRootMismatchRejectedTitles.length ? (lastRecommendationResult as any).expansionQueryRootMismatchRejectedTitles.join(" | ") : "(none)"}`,
      `expansionFalsePositiveRejectedTitles:${Array.isArray((lastRecommendationResult as any)?.expansionFalsePositiveRejectedTitles) && (lastRecommendationResult as any).expansionFalsePositiveRejectedTitles.length ? (lastRecommendationResult as any).expansionFalsePositiveRejectedTitles.join(" | ") : "(none)"}`,
      `expansionLocaleRejectedTitles:${Array.isArray((lastRecommendationResult as any)?.expansionLocaleRejectedTitles) && (lastRecommendationResult as any).expansionLocaleRejectedTitles.length ? (lastRecommendationResult as any).expansionLocaleRejectedTitles.join(" | ") : "(none)"}`,
      `expansionWeakFillerRejectedTitles:${Array.isArray((lastRecommendationResult as any)?.expansionWeakFillerRejectedTitles) && (lastRecommendationResult as any).expansionWeakFillerRejectedTitles.length ? (lastRecommendationResult as any).expansionWeakFillerRejectedTitles.join(" | ") : "(none)"}`,
      `sameParentSoftDuplicateRejectedTitles:${Array.isArray((lastRecommendationResult as any)?.sameParentSoftDuplicateRejectedTitles) && (lastRecommendationResult as any).sameParentSoftDuplicateRejectedTitles.length ? (lastRecommendationResult as any).sameParentSoftDuplicateRejectedTitles.join(" | ") : "(none)"}`,
      `finalEligibilityGateApplied:${Boolean((lastRecommendationResult as any)?.finalEligibilityGateApplied)}`,
      `finalEligibilityCleanCandidateCount:${Number((lastRecommendationResult as any)?.finalEligibilityCleanCandidateCount || 0)}`,
      `finalEligibilityAcceptedTitles:${Array.isArray((lastRecommendationResult as any)?.finalEligibilityAcceptedTitles) && (lastRecommendationResult as any).finalEligibilityAcceptedTitles.length ? (lastRecommendationResult as any).finalEligibilityAcceptedTitles.join(" | ") : "(none)"}`,
      `finalEligibilityRejectedTitlesByReason:${JSON.stringify((lastRecommendationResult as any)?.finalEligibilityRejectedTitlesByReason || {})}`,
      `finalRootDiversityCount:${Number((lastRecommendationResult as any)?.finalRootDiversityCount || 0)}`,
      `finalRootDuplicateCounts:${JSON.stringify((lastRecommendationResult as any)?.finalRootDuplicateCounts || {})}`,
      `finalRootSecondEntryReasons:${JSON.stringify((lastRecommendationResult as any)?.finalRootSecondEntryReasons || {})}`,
      `viableCandidateCountBeforeFinalSelection:${Number((lastRecommendationResult as any)?.viableCandidateCountBeforeFinalSelection || 0)}`,
      `viableCandidateRootsBeforeFinalSelection:${Array.isArray((lastRecommendationResult as any)?.viableCandidateRootsBeforeFinalSelection) && (lastRecommendationResult as any).viableCandidateRootsBeforeFinalSelection.length ? (lastRecommendationResult as any).viableCandidateRootsBeforeFinalSelection.join(" | ") : "(none)"}`,
      `positiveFitScoreByTitle:${JSON.stringify((lastRecommendationResult as any)?.positiveFitScoreByTitle || {})}`,
      `positiveFitReasonsByTitle:${JSON.stringify((lastRecommendationResult as any)?.positiveFitReasonsByTitle || {})}`,
      `penaltyReasonsByTitle:${JSON.stringify((lastRecommendationResult as any)?.penaltyReasonsByTitle || {})}`,
      `finalSelectionRejectedByReason:${JSON.stringify((lastRecommendationResult as any)?.finalSelectionRejectedByReason || {})}`,
      `swipeTasteVector:${JSON.stringify((lastRecommendationResult as any)?.swipeTasteVector || {})}`,
      `weightedSwipeTasteVector:${JSON.stringify((lastRecommendationResult as any)?.weightedSwipeTasteVector || {})}`,
      `ignoredGenericTasteSignals:${JSON.stringify((lastRecommendationResult as any)?.ignoredGenericTasteSignals || [])}`,
      `candidateTasteMatchScoreByTitle:${JSON.stringify((lastRecommendationResult as any)?.candidateTasteMatchScoreByTitle || {})}`,
      `candidateTastePenaltyByTitle:${JSON.stringify((lastRecommendationResult as any)?.candidateTastePenaltyByTitle || {})}`,
      `candidateMatchedLikedSignalsByTitle:${JSON.stringify((lastRecommendationResult as any)?.candidateMatchedLikedSignalsByTitle || {})}`,
      `candidateMatchedDislikedSignalsByTitle:${JSON.stringify((lastRecommendationResult as any)?.candidateMatchedDislikedSignalsByTitle || {})}`,
      `candidateWeightedTasteScoreByTitle:${JSON.stringify((lastRecommendationResult as any)?.candidateWeightedTasteScoreByTitle || {})}`,
      `candidateDislikePenaltyByTitle:${JSON.stringify((lastRecommendationResult as any)?.candidateDislikePenaltyByTitle || {})}`,
      `candidateSkipPenaltyByTitle:${JSON.stringify((lastRecommendationResult as any)?.candidateSkipPenaltyByTitle || {})}`,
      `finalRankingReasonByTitle:${JSON.stringify((lastRecommendationResult as any)?.finalRankingReasonByTitle || {})}`,
      `finalScoreComponentsByTitle:${JSON.stringify((lastRecommendationResult as any)?.finalScoreComponentsByTitle || {})}`,
      `tasteProfileSummary:${JSON.stringify((lastRecommendationResult as any)?.tasteProfileSummary || {})}`,
      `generatedComicVineQueriesFromTaste:${Array.isArray((lastRecommendationResult as any)?.generatedComicVineQueriesFromTaste) && (lastRecommendationResult as any).generatedComicVineQueriesFromTaste.length ? (lastRecommendationResult as any).generatedComicVineQueriesFromTaste.join(" | ") : "(none)"}`,
      `querySourceOfTruth:${String((lastRecommendationResult as any)?.querySourceOfTruth || "none")}`,
      `tasteQueriesUsedForPrimaryFetch:${Boolean((lastRecommendationResult as any)?.tasteQueriesUsedForPrimaryFetch)}`,
      `tasteQueriesBlockedByReason:${String((lastRecommendationResult as any)?.tasteQueriesBlockedByReason || "none")}`,
      `finalRungQueriesSource:${String((lastRecommendationResult as any)?.finalRungQueriesSource || "unknown")}`,
      `tasteQueryPoolUsedAsPrimary:${Boolean((lastRecommendationResult as any)?.tasteQueryPoolUsedAsPrimary)}`,
      `preFilterPoolBuiltFrom:${String((lastRecommendationResult as any)?.preFilterPoolBuiltFrom || "unknown")}`,
      `preFilterPoolOverlapWithPreviousSession:${Number((lastRecommendationResult as any)?.preFilterPoolOverlapWithPreviousSession || 0)}`,
      `primaryTasteQueryPoolRoots:${Array.isArray((lastRecommendationResult as any)?.primaryTasteQueryPoolRoots) && (lastRecommendationResult as any).primaryTasteQueryPoolRoots.length ? (lastRecommendationResult as any).primaryTasteQueryPoolRoots.join(" | ") : "(none)"}`,
      `primaryTasteQueryPoolTitles:${Array.isArray((lastRecommendationResult as any)?.primaryTasteQueryPoolTitles) && (lastRecommendationResult as any).primaryTasteQueryPoolTitles.length ? (lastRecommendationResult as any).primaryTasteQueryPoolTitles.slice(0, 20).join(" | ") : "(none)"}`,
      `staticRungPoolRoots:${Array.isArray((lastRecommendationResult as any)?.staticRungPoolRoots) && (lastRecommendationResult as any).staticRungPoolRoots.length ? (lastRecommendationResult as any).staticRungPoolRoots.join(" | ") : "(none)"}`,
      `recentReturnedTitlePenaltyApplied:${Number((lastRecommendationResult as any)?.recentReturnedTitlePenaltyApplied || 0)}`,
      `recentReturnedRootPenaltyApplied:${Number((lastRecommendationResult as any)?.recentReturnedRootPenaltyApplied || 0)}`,
      `repeatedTitleSuppressed:${Number((lastRecommendationResult as any)?.repeatedTitleSuppressed || 0)}`,
      `repeatedRootSuppressed:${Number((lastRecommendationResult as any)?.repeatedRootSuppressed || 0)}`,
      `crossSessionDiversityApplied:${Boolean((lastRecommendationResult as any)?.crossSessionDiversityApplied)}`,
      `crossSessionDiversityBypassedReason:${String((lastRecommendationResult as any)?.crossSessionDiversityBypassedReason || "none")}`,
      `diversityMemoryHitTitles:${Array.isArray((lastRecommendationResult as any)?.diversityMemoryHitTitles) && (lastRecommendationResult as any).diversityMemoryHitTitles.length ? (lastRecommendationResult as any).diversityMemoryHitTitles.join(" | ") : "(none)"}`,
      `diversityMemoryHitRoots:${Array.isArray((lastRecommendationResult as any)?.diversityMemoryHitRoots) && (lastRecommendationResult as any).diversityMemoryHitRoots.length ? (lastRecommendationResult as any).diversityMemoryHitRoots.join(" | ") : "(none)"}`,
      `diversityPenaltyStage:${String((lastRecommendationResult as any)?.diversityPenaltyStage || "none")}`,
      `diversitySuppressionStage:${String((lastRecommendationResult as any)?.diversitySuppressionStage || "none")}`,
      `diversityMemorySessionSize:${Number((lastRecommendationResult as any)?.diversityMemorySessionSize || 0)}`,
      `repeatPenaltyCandidateCount:${Number((lastRecommendationResult as any)?.repeatPenaltyCandidateCount || 0)}`,
      `staticDefaultQueriesUsed:${Boolean((lastRecommendationResult as any)?.staticDefaultQueriesUsed)}`,
      `staticDefaultQueriesSuppressedReason:${String((lastRecommendationResult as any)?.staticDefaultQueriesSuppressedReason || "none")}`,
      `tasteProfileBuildFailure:${Boolean((lastRecommendationResult as any)?.tasteProfileBuildFailure)}`,
      `tasteProfileBuildFailureReason:${String((lastRecommendationResult as any)?.tasteProfileBuildFailureReason || "none")}`,
      `preDispatchTasteProfileSummary:${JSON.stringify((lastRecommendationResult as any)?.preDispatchTasteProfileSummary || {})}`,
      `preDispatchGeneratedQueries:${Array.isArray((lastRecommendationResult as any)?.preDispatchGeneratedQueries) && (lastRecommendationResult as any).preDispatchGeneratedQueries.length ? (lastRecommendationResult as any).preDispatchGeneratedQueries.join(" | ") : "(none)"}`,
      `expansionNotTriggeredReason:${String((lastRecommendationResult as any)?.expansionNotTriggeredReason || "none")}`,
      `subtitleFragmentInheritedParentRootTitles:${Array.isArray((lastRecommendationResult as any)?.subtitleFragmentInheritedParentRootTitles) && (lastRecommendationResult as any).subtitleFragmentInheritedParentRootTitles.length ? (lastRecommendationResult as any).subtitleFragmentInheritedParentRootTitles.join(" | ") : "(none)"}`,
      `subtitleFragmentRejectedTitles:${Array.isArray((lastRecommendationResult as any)?.subtitleFragmentRejectedTitles) && (lastRecommendationResult as any).subtitleFragmentRejectedTitles.length ? (lastRecommendationResult as any).subtitleFragmentRejectedTitles.join(" | ") : "(none)"}`,
      `fragmentAcceptedBecauseCollectedEditionTitles:${Array.isArray((lastRecommendationResult as any)?.fragmentAcceptedBecauseCollectedEditionTitles) && (lastRecommendationResult as any).fragmentAcceptedBecauseCollectedEditionTitles.length ? (lastRecommendationResult as any).fragmentAcceptedBecauseCollectedEditionTitles.join(" | ") : "(none)"}`,
      `sideArcRejectedTitles:${Array.isArray((lastRecommendationResult as any)?.sideArcRejectedTitles) && (lastRecommendationResult as any).sideArcRejectedTitles.length ? (lastRecommendationResult as any).sideArcRejectedTitles.join(" | ") : "(none)"}`,
      `selectedParentFranchiseCounts:${JSON.stringify((lastRecommendationResult as any)?.selectedParentFranchiseCounts || {})}`,
      `duplicateTitleRejectedTitles:${Array.isArray((lastRecommendationResult as any)?.duplicateTitleRejectedTitles) && (lastRecommendationResult as any).duplicateTitleRejectedTitles.length ? (lastRecommendationResult as any).duplicateTitleRejectedTitles.join(" | ") : "(none)"}`,
      `negativeScoreRejectedTitles:${Array.isArray((lastRecommendationResult as any)?.negativeScoreRejectedTitles) && (lastRecommendationResult as any).negativeScoreRejectedTitles.length ? (lastRecommendationResult as any).negativeScoreRejectedTitles.join(" | ") : "(none)"}`,
      `untranslatedEditionRejectedTitles:${Array.isArray((lastRecommendationResult as any)?.untranslatedEditionRejectedTitles) && (lastRecommendationResult as any).untranslatedEditionRejectedTitles.length ? (lastRecommendationResult as any).untranslatedEditionRejectedTitles.join(" | ") : "(none)"}`,
      `semanticBreadthSelections:${Array.isArray((lastRecommendationResult as any)?.semanticBreadthSelections) && (lastRecommendationResult as any).semanticBreadthSelections.length ? (lastRecommendationResult as any).semanticBreadthSelections.join(" | ") : "(none)"}`,
      `adjacentSeedExpansionCandidates:${Array.isArray((lastRecommendationResult as any)?.adjacentSeedExpansionCandidates) && (lastRecommendationResult as any).adjacentSeedExpansionCandidates.length ? (lastRecommendationResult as any).adjacentSeedExpansionCandidates.join(" | ") : "(none)"}`,
      `seedSaturationPenaltyApplied:${JSON.stringify((lastRecommendationResult as any)?.seedSaturationPenaltyApplied || {})}`,
      `relaxedBreadthBackfillTriggered:${Boolean((lastRecommendationResult as any)?.relaxedBreadthBackfillTriggered)}`,
      `relaxedBreadthBackfillCandidates:${Array.isArray((lastRecommendationResult as any)?.relaxedBreadthBackfillCandidates) && (lastRecommendationResult as any).relaxedBreadthBackfillCandidates.length ? (lastRecommendationResult as any).relaxedBreadthBackfillCandidates.join(" | ") : "(none)"}`,
      `relaxedBreadthBackfillSelected:${Array.isArray((lastRecommendationResult as any)?.relaxedBreadthBackfillSelected) && (lastRecommendationResult as any).relaxedBreadthBackfillSelected.length ? (lastRecommendationResult as any).relaxedBreadthBackfillSelected.join(" | ") : "(none)"}`,
      `relaxedBreadthBackfillRejectedReasons:${JSON.stringify((lastRecommendationResult as any)?.relaxedBreadthBackfillRejectedReasons || {})}`,
      `selectedFranchiseRoots:${Array.isArray((lastRecommendationResult as any)?.selectedFranchiseRoots) && (lastRecommendationResult as any).selectedFranchiseRoots.length ? (lastRecommendationResult as any).selectedFranchiseRoots.join(" | ") : "(none)"}`,
      `profileSelectedEntitySeeds:${Array.isArray((lastRecommendationResult as any)?.profileSelectedEntitySeeds) && (lastRecommendationResult as any).profileSelectedEntitySeeds.length ? (lastRecommendationResult as any).profileSelectedEntitySeeds.join(" | ") : "(none)"}`,
      `suppressedGlobalSeedReason:${String((lastRecommendationResult as any)?.suppressedGlobalSeedReason || "none")}`,
      `scoredUniverseFailure:${Boolean((lastRecommendationResult as any)?.scoredUniverseFailure)}`,
      `scoredUniverseFailureReason:${String((lastRecommendationResult as any)?.scoredUniverseFailureReason || "none")}`,
      `scoredUniversePreviewTitles:${Array.isArray((lastRecommendationResult as any)?.scoredUniversePreviewTitles) && (lastRecommendationResult as any).scoredUniversePreviewTitles.length ? (lastRecommendationResult as any).scoredUniversePreviewTitles.join(" | ") : "(none)"}`,
      `finalRankedDocsBaseLength:${Number((lastRecommendationResult as any)?.finalRankedDocsBaseLength || 0)}`,
      `rankedDocsLength:${Number((lastRecommendationResult as any)?.rankedDocsLength || 0)}`,
      `finalAcceptedDocsSource:${String((lastRecommendationResult as any)?.finalAcceptedDocsSource || "none")}`,
      `finalAcceptedDocsTitles:${Array.isArray((lastRecommendationResult as any)?.finalAcceptedDocsTitles) && (lastRecommendationResult as any).finalAcceptedDocsTitles.length ? (lastRecommendationResult as any).finalAcceptedDocsTitles.join(" | ") : "(none)"}`,
      `finalRankedDocsBaseTitles:${Array.isArray((lastRecommendationResult as any)?.finalRankedDocsBaseTitles) && (lastRecommendationResult as any).finalRankedDocsBaseTitles.length ? (lastRecommendationResult as any).finalRankedDocsBaseTitles.join(" | ") : "(none)"}`,
      `rankedDocsTitles:${Array.isArray((lastRecommendationResult as any)?.rankedDocsTitles) && (lastRecommendationResult as any).rankedDocsTitles.length ? (lastRecommendationResult as any).rankedDocsTitles.join(" | ") : "(none)"}`,
      `normalizedDocsCount:${Number((lastRecommendationResult as any)?.normalizedDocsCount || 0)}`,
      `postCanonicalizationCount:${Number((lastRecommendationResult as any)?.postCanonicalizationCount || 0)}`,
      `postDeduplicationCount:${Number((lastRecommendationResult as any)?.postDeduplicationCount || 0)}`,
      `postAuthorityFilterCount:${Number((lastRecommendationResult as any)?.postAuthorityFilterCount || 0)}`,
      `postLaneFilterCount:${Number((lastRecommendationResult as any)?.postLaneFilterCount || 0)}`,
      `postShapeGateCount:${Number((lastRecommendationResult as any)?.postShapeGateCount || 0)}`,
      `postFinalShapingCount:${Number((lastRecommendationResult as any)?.postFinalShapingCount || 0)}`,
      `finalRecommenderInputCount:${Number((lastRecommendationResult as any)?.finalRecommenderInputCount || 0)}`,
      `stageDropReasons:${JSON.stringify((lastRecommendationResult as any)?.stageDropReasons || {})}`,
      `droppedBeforeRenderReason:${String((lastRecommendationResult as any)?.droppedBeforeRenderReason || "none")}`,
      `debugComicVineDispatchTrace.sourceEnabledComicVine:${Boolean(lastDebugGcdDispatchTrace?.sourceEnabledComicVine)}`,
      `debugComicVineDispatchTrace.traceSource:${String(lastDebugGcdDispatchTrace?.traceSource || "report-default")}`,
      `debugComicVineDispatchTrace.comicVineEnvVarPresent:${Boolean(lastDebugGcdDispatchTrace?.comicVineEnvVarPresent)}`,
      `debugComicVineDispatchTrace.comicVineKeyDetected:${Boolean(lastDebugGcdDispatchTrace?.comicVineKeyDetected)}`,
      `debugComicVineDispatchTrace.comicVineEnabledRuntime:${Boolean(lastDebugGcdDispatchTrace?.comicVineEnabledRuntime)}`,
      `debugComicVineDispatchTrace.runtimePlatform:${String(lastDebugGcdDispatchTrace?.runtimePlatform || "unknown")}`,
      `debugComicVineDispatchTrace.runtimeEnvironment:${String(lastDebugGcdDispatchTrace?.runtimeEnvironment || "unknown")}`,
      `debugComicVineDispatchTrace.comicVineEnvKeyLength:${Number(lastDebugGcdDispatchTrace?.comicVineEnvKeyLength || 0)}`,
      `debugComicVineDispatchTrace.comicVineProxyUrl:${String(lastDebugGcdDispatchTrace?.comicVineProxyUrl || "(none)")}`,
      `debugComicVineDispatchTrace.normalizedComicVineProxyUrl:${String(lastDebugGcdDispatchTrace?.normalizedComicVineProxyUrl || "(none)")}`,
      `debugComicVineDispatchTrace.comicVineProxyConfigured:${Boolean(lastDebugGcdDispatchTrace?.comicVineProxyConfigured)}`,
      `debugComicVineDispatchTrace.comicVineProxyHealthStatus:${String(lastDebugGcdDispatchTrace?.comicVineProxyHealthStatus || "unknown")}`,
      `debugComicVineDispatchTrace.comicVineProxyErrorBody:${String(lastDebugGcdDispatchTrace?.comicVineProxyErrorBody || "(none)")}`,
      `kitsuEligibleFromSwipes:${Boolean(lastDebugGcdDispatchTrace?.kitsuEligibleFromSwipes)}`,
      `likedAnimeMangaCount:${Number(lastDebugGcdDispatchTrace?.likedAnimeMangaCount || 0)}`,
      `skippedAnimeMangaCount:${Number(lastDebugGcdDispatchTrace?.skippedAnimeMangaCount || 0)}`,
      `kitsuRungsLength:${Number(lastDebugGcdDispatchTrace?.kitsuRungsLength || 0)}`,
      `buildComicVineFacetRungsCalled:${Boolean(lastDebugGcdDispatchTrace?.buildComicVineFacetRungsCalled)}`,
      `comicVineRungsLength:${Number(lastDebugGcdDispatchTrace?.comicVineRungsLength || 0)}`,
      `mainRungQueriesLength:${Number(lastDebugGcdDispatchTrace?.mainRungQueriesLength || 0)}`,
      `kitsuFetchAttempted:${Boolean(lastDebugGcdDispatchTrace?.kitsuFetchAttempted)}`,
      `comicVineFetchAttempted:${Boolean(lastDebugGcdDispatchTrace?.comicVineFetchAttempted)}`,
      `comicVineResolvedSeedQuery:${String(lastDebugGcdDispatchTrace?.comicVineResolvedSeedQuery || "(none)")}`,
      `comicVineFallbackReason:${String(lastDebugGcdDispatchTrace?.comicVineFallbackReason || "none")}`,
      `comicVineUsedFallbackQuery:${Boolean(lastDebugGcdDispatchTrace?.comicVineUsedFallbackQuery)}`,
      `comicVineExcludedTermsAppliedInFilterOnly:${Boolean(lastDebugGcdDispatchTrace?.comicVineExcludedTermsAppliedInFilterOnly)}`,
      `comicVineQueryTooLong:${Boolean(lastDebugGcdDispatchTrace?.comicVineQueryTooLong)}`,
      `comicVinePositiveQueries:${Array.isArray(lastDebugGcdDispatchTrace?.comicVinePositiveQueries) && lastDebugGcdDispatchTrace.comicVinePositiveQueries.length ? lastDebugGcdDispatchTrace.comicVinePositiveQueries.join(" | ") : "(none)"}`,
      `kitsuQueryTexts:${Array.isArray(lastDebugGcdDispatchTrace?.kitsuQueryTexts) && lastDebugGcdDispatchTrace.kitsuQueryTexts.length ? lastDebugGcdDispatchTrace.kitsuQueryTexts.join(" | ") : "(none)"}`,
      `comicVineQueryTexts:${Array.isArray(lastDebugGcdDispatchTrace?.comicVineQueryTexts) && lastDebugGcdDispatchTrace.comicVineQueryTexts.length ? lastDebugGcdDispatchTrace.comicVineQueryTexts.join(" | ") : "(none)"}`,
      `comicVineRungsBuilt:${Array.isArray(lastDebugGcdDispatchTrace?.comicVineRungsBuilt) && lastDebugGcdDispatchTrace.comicVineRungsBuilt.length ? lastDebugGcdDispatchTrace.comicVineRungsBuilt.join(" | ") : "(none)"}`,
      `comicVineQueriesActuallyFetched:${Array.isArray(lastDebugGcdDispatchTrace?.comicVineQueriesActuallyFetched) && lastDebugGcdDispatchTrace.comicVineQueriesActuallyFetched.length ? lastDebugGcdDispatchTrace.comicVineQueriesActuallyFetched.join(" | ") : "(none)"}`,
      `comicVineFetchResults:${Array.isArray(lastDebugGcdDispatchTrace?.comicVineFetchResults) && lastDebugGcdDispatchTrace.comicVineFetchResults.length ? lastDebugGcdDispatchTrace.comicVineFetchResults.map((row: any) => `${row?.query || "(query)"}=>${row?.status || "unknown"} raw=${Number(row?.rawCount || 0)}${row?.error ? ` err=${row.error}` : ""}`).join(" || ") : "(none)"}`,
      `comicVineFetchedRawTotal:${Number(lastDebugGcdDispatchTrace?.comicVineFetchedRawTotal || 0)}`,
      `comicVineRawRowsBeforeDocConversion:${Number(lastDebugGcdDispatchTrace?.comicVineRawRowsBeforeDocConversion || 0)}`,
      `comicVineDocConversionAttemptCount:${Number(lastDebugGcdDispatchTrace?.comicVineDocConversionAttemptCount || 0)}`,
      `comicVineDocConversionSuccessCount:${Number(lastDebugGcdDispatchTrace?.comicVineDocConversionSuccessCount || 0)}`,
      `comicVineDocConversionDropReasons:${JSON.stringify(lastDebugGcdDispatchTrace?.comicVineDocConversionDropReasons || {})}`,
      `comicVineConvertedDocTitles:${Array.isArray(lastDebugGcdDispatchTrace?.comicVineConvertedDocTitles) && lastDebugGcdDispatchTrace.comicVineConvertedDocTitles.length ? lastDebugGcdDispatchTrace.comicVineConvertedDocTitles.join(" | ") : "(none)"}`,
      `comicVineTitleMergeDebug:${JSON.stringify(lastDebugGcdDispatchTrace?.comicVineTitleMergeDebug || [])}`,
      `comicVineContentEmptyDropCount:${Number(lastDebugGcdDispatchTrace?.comicVineContentEmptyDropCount || 0)}`,
      `comicVineCanonicalEmptyDropCount:${Number(lastDebugGcdDispatchTrace?.comicVineCanonicalEmptyDropCount || 0)}`,
      `comicVineFinalEmptyDropCount:${Number(lastDebugGcdDispatchTrace?.comicVineFinalEmptyDropCount || 0)}`,
    ].join("\n");
    if (Boolean(lastSourceEnabled?.comicVine) && String(lastDebugGcdDispatchTrace?.traceSource || "report-default") === "report-default") {
      console.warn("ROUTER_TRACE_MISSING_FROM_RESULT_STATE");
    }

    const report = [
      "SESSION REPORT",
      `Deck: ${deck.deckLabel}`,
      `Deck Key: ${deckKey}`,
      `Engine: ${recEngineLabel || "—"}`,
      `Saved Query Time: ${lastRecommendationTimestamp || "—"}`,
      `Swipe Summary: ${recomputedSummary}`,
      `Swipe Summary (state): ${lastRecommendationSwipeSummary || `Right:${rightSwipes} • Left:${leftSwipes} • Skip:${downSwipes}`}`,
      `20Q Progress: ${resolvedTwentyQCount}/${twentyQObjectives.length}`,
      `Current 20Q Objective: ${activeTwentyQObjective ? `Rung ${activeTwentyQObjective.rung} • ${activeTwentyQObjective.label}` : "complete"}`,
      `Active query family: ${reportQueryFamily}`,
      "",
      "SWIPE HISTORY",
      swipeHistoryLines,
      "",
      `Built Query: ${reportBuiltQuery || "(none)"}`,
      `presetTestName:${presetTestName || "(none)"}`,
      `presetExecutionStarted:${presetExecutionStarted || "(none)"}`,
      `presetSwipesAppliedCount:${presetSwipesAppliedCount}`,
      `presetCardsMatchedCount:${presetCardsMatchedCount}`,
      `presetRecommendationTriggered:${presetRecommendationTriggered}`,
      `presetRecommendationCompleted:${presetRecommendationCompleted}`,
      `presetExportedAfterRecommendation:${presetRecommendationCompleted ? "true" : String(presetExportedAfterRecommendation)}`,
      `presetExecutionError:${presetExecutionError || "(none)"}`,
      "",
      "RUNG QUERIES",
      rungQueryLines,
      "",
      "FETCHER COUNTS",
      sourceCountSummary || "(none)",
      "",
      "SOURCE SETTINGS",
      sourceEnabledSummary,
      "",
      "RAW POOL SUMMARY",
      `count:${rawPoolRows.length}`,
      `queryFamilies:${formatQueryFamilyBreakdown(rawPoolRows)}`,
      `lanes:${formatLaneBreakdown(rawPoolRows)}`,
      `rungs:${formatRungBreakdown(rawPoolRows)}`,
      "",
      "RAW POOL DETAIL",
      formatPoolDetailRows(rawPoolRows, "raw"),
      "",
      "CANDIDATE POOL SUMMARY",
      `count:${candidatePoolRows.length}`,
      `queryFamilies:${formatQueryFamilyBreakdown(candidatePoolRows)}`,
      `lanes:${formatLaneBreakdown(candidatePoolRows)}`,
      `rungs:${formatRungBreakdown(candidatePoolRows)}`,
      "",
      "CANDIDATE POOL DETAIL",
      formatPoolDetailRows(candidatePoolRows, "candidate"),
      "",
      "FILTER AUDIT SUMMARY",
      formatFilterAuditSummary(lastFilterAuditSummary),
      "",
      "FILTER AUDIT DETAIL",
      formatFilterAuditRows(lastFilterAudit),
      "",
      "FINAL RECOMMENDER SUMMARY",
      formatFinalRecommenderDebug(lastFinalRecommenderDebug),
      "",
      "FINAL RECOMMENDER REJECTIONS",
      formatFinalRecommenderRejections(lastFinalRecommenderDebug),
      "",
      "ACTIVE TUNER OVERRIDE",
      currentLaneOverride && Object.keys(currentLaneOverride).length > 0
        ? Object.entries(currentLaneOverride)
            .map(([k, v]) => `${k}:${v}`)
            .join(", ")
        : "(none)",
      "",
      "TOP RECOMMENDATIONS",
      recommendationLines,
      "",
      "RECOMMENDATION TRACE",
      formatRecommendationDiagnostics(recItems, candidatePoolRows, rawPoolRows),
      "",
      "RUNNING TAG COUNTS",
      sortedTagCounts,
      "",
      "TASTE PROFILE",
      tasteProfilePreview || "(flat)",
      `confidence:${tasteProfileWithMood.confidence.toFixed(2)} • swipes:${tasteProfileWithMood.evidence.swipes} • feedback:${tasteProfileWithMood.evidence.feedbackEvents}`,
      "",
      "SESSION MOOD",
      formatTasteVectorPreview(sessionMoodProfile?.vector),
      `confidence:${sessionMoodProfile?.confidence?.toFixed(2) ?? "0.00"} • swipes:${sessionMoodProfile?.swipeCount ?? 0}`,
      "",
      "PERSONALITY PROFILE",
      formatTasteVectorPreview(personalityProfileState?.vector),
      `confidence:${personalityProfileState?.confidence?.toFixed(2) ?? "0.00"} • sessions:${personalityProfileState?.sessionCount ?? 0}`,
      "",
      "ACTIVE TASTE",
      formatTasteVectorPreview(activeTasteVector),
      `personality:${activeTasteWeights?.personalityWeight?.toFixed(2) ?? "0.00"} • mood:${activeTasteWeights?.moodWeight?.toFixed(2) ?? "0.00"}`,
      "",
      "RUNG STATS",
      lastRungStats ? JSON.stringify(lastRungStats, null, 2) : "(none)",
      "",
      "RECOMMENDATION MEMORY",
      (() => {
        const history = getRecommendationHistoryBucket(deckKey);
        return `shownIds:${history.recommendedIds.size} • shownKeys:${history.recommendedKeys.size} • authors:${history.authors.size} • series:${history.seriesKeys.size} • rejected:${history.rejectedIds.size}`;
      })(),
    ].join("\n");

    await Clipboard.setStringAsync(report);
    Alert.alert("Copied", "Diagnostics copied to clipboard.");
  }



  React.useEffect(() => {
    if (!isDone) return;
    if (autoSearched) return;
    setAutoSearched(true);
    runAutoRecommendations();
  }, [isDone, autoSearched, tasteProfileWithMood, currentLaneOverride]);

  const recDone = recItems.length > 0 && recIndex === recItems.length;

  const currentRec: RecItem | null =
    recItems.length > 0 && recIndex >= 0 && recIndex < recItems.length ? recItems[recIndex] : null;

  const currentRecKey = useMemo(() => {
    if (!currentRec) return "";
    if (currentRec.kind === "open_library") {
      const t = currentRec.doc?.title ?? "";
      const a = recommendationAuthor(currentRec.doc);
      return `ol::${t}::${a}`.toLowerCase();
    }
    const t = currentRec.book?.title ?? "";
    const a = currentRec.book?.author ?? "";
    return `fb::${t}::${a}`.toLowerCase();
  }, [currentRec]);

  useEffect(() => {
    let cancelled = false;
    async function run() {
      if (!currentRec) return;
      const key = currentRecKey;
      if (!key || recCoverCache[key]) return;
      const title = currentRec.kind === "open_library" ? currentRec.doc?.title : currentRec.book?.title;
      const author = currentRec.kind === "open_library" ? recommendationAuthor(currentRec.doc) : currentRec.book?.author;
      if (!title) return;
      if (currentRec.kind === "open_library" && recommendationCoverUrl(currentRec.doc)) return;
      try {
        const found = await lookupOpenLibraryCover(title, author);
        if (cancelled) return;
        if (found?.coverUrl) setRecCoverCache((prev) => ({ ...prev, [key]: found.coverUrl! }));
      } catch {}
    }
    run();
    return () => {
      cancelled = true;
    };
  }, [currentRec, currentRecKey, recCoverCache]);

  function advanceRec() {
    setShowRating(false);
    setRecIndex((i) => Math.min(i + 1, recItems.length));
  }

  function goBackRec() {
    setShowRating(false);
    setRecIndex((i) => Math.max(i - 1, 0));
  }

  function recordFeedback(item: RecItem, kind: FeedbackKind, rating?: 1 | 2 | 3 | 4 | 5) {
    const itemId = item.kind === "open_library" ? docId(item.doc) : fallbackId(item.book);
    rememberRecommendationFeedback(item, kind);
    setFeedback((prev) => prev.concat({ itemId, kind, rating }));
  }

  function handleAlreadyRead() {
    if (!currentRec) return;
    setRatingPreview(0);
    setShowRating(true);
    recordFeedback(currentRec, "already_read");
  }

  function handleBack() {
    if (recIndex <= 0) return;
    goBackRec();
  }

  function handleNext() {
    if (!currentRec) return;
    recordFeedback(currentRec, "next");
    advanceRec();
  }

  function handleRate(r: 1 | 2 | 3 | 4 | 5) {
    if (!currentRec) return;
    const itemId = currentRec.kind === "open_library" ? docId(currentRec.doc) : fallbackId(currentRec.book);
    setFeedback((prev) => {
      const copy = prev.slice();
      for (let i = copy.length - 1; i >= 0; i--) {
        if (copy[i].itemId === itemId && copy[i].kind === "already_read") {
          copy[i] = { ...copy[i], rating: r };
          return copy;
        }
      }
      copy.push({ itemId, kind: "already_read", rating: r });
      return copy;
    });
    advanceRec();
  }

  const cardFitStyle = useMemo(() => {
    const h = Math.max(0, cardStageHeight || 0);
    if (h <= 0) return {};
    const w = h * (2 / 3);
    return { height: h, width: w };
  }, [cardStageHeight]);

  const isFirstRec = recItems.length > 0 && recIndex === 0;
  const candidatePoolRows = Array.isArray(lastCandidatePool) ? lastCandidatePool : [];
  const rawPoolRows = Array.isArray(lastRawPool) ? lastRawPool : [];
  const sourceCountRows = [
    { key: "googleBooks", label: "Google Books" },
    { key: "openLibrary", label: "Open Library" },
    { key: "kitsu", label: "Kitsu" },
    { key: "comicVine", label: "ComicVine" },
  ];

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: "#071526" }]}>
      <View style={styles.container}>
        <View style={styles.topRow}>
          {enabledDeckList.map((k) => {
            const selected = deckKey === k;
            return (
              <TouchableOpacity
                key={k}
                onPress={() => setDeckKey(k)}
                style={[
                  styles.deckChip,
                  { borderColor: highlightColor },
                  selected && styles.deckChipSelected,
                  selected && { borderColor: highlightColor },
                ]}
              >
                <Text style={[styles.deckChipText, selected && styles.deckChipTextSelected]}>
                  {deckLabel(k, isSmallScreen)}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <View style={styles.statusRow}>
          <Text style={styles.statusText}>
            20Q: {resolvedTwentyQCount}/{twentyQObjectives.length} resolved
          </Text>
          <Text style={styles.statusText}>
            {activeTwentyQObjective ? `Rung ${activeTwentyQObjective.rung}: ${activeTwentyQObjective.label}` : "20Q complete"}
          </Text>
        </View>

        <View style={styles.statusDivider} />

        <View style={[styles.stage, needsCardOffset && styles.stageTop]}>
          {showRecommendationsView ? (
            <ScrollView style={{ width: "100%" }} contentContainerStyle={{ alignItems: "center", paddingBottom: 30 }}>
              <View style={[styles.doneCard, { borderColor: highlightColor }]}>
                <Text style={styles.doneTitle}>Recommendations</Text>
                <Text style={styles.doneSub}>
                  Deck: {deck.deckLabel} • Engine: {recEngineLabel || "—"} • 20Q resolved {resolvedTwentyQCount}/{twentyQObjectives.length}
                </Text>

                {recQuery ? (
                  <Text style={styles.smallNote}>
                    Search query: <Text style={{ fontWeight: "900" }}>{recQuery}</Text>
                  </Text>
                ) : (
                  <Text style={styles.smallNote}>Building your recommendations…</Text>
                )}

                {lastRecommendationTimestamp ? (
                  <Text style={styles.smallNote}>Saved query time: {lastRecommendationTimestamp}</Text>
                ) : null}

                {recLoading ? (
                  <View style={{ marginTop: 14, alignItems: "center" }}>
                    <ActivityIndicator />
                    <Text style={styles.smallNote}>Finding a good match…</Text>
                  </View>
                ) : null}

                {!!recError && !recLoading ? (
                  <View style={{ marginTop: 12 }}>
                    <Text style={styles.smallNote}>{recError}</Text>
                    <TouchableOpacity style={[styles.btn, styles.btnOutlineGold, { borderColor: highlightColor }, { marginTop: 10, alignSelf: "center" }]} onPress={tryAgain}>
                      <Text style={styles.btnText}>Try again</Text>
                    </TouchableOpacity>
                  </View>
                ) : null}

                {recItems.length > 0 && !recLoading && currentRec ? (
                  <View style={styles.recCard}>
                    <View style={styles.bigCoverWrap}>
                      {currentRec.kind === "open_library" ? (
                        (() => {
                          const cover = recommendationCoverUrl(currentRec.doc) || recCoverCache[currentRecKey] || null;
                          return cover ? (
                            <Image source={{ uri: cover }} style={styles.bigCover} resizeMode="contain" />
                          ) : (
                            <View style={styles.bigCoverPlaceholder}>
                              <Text style={styles.bigCoverPlaceholderText}>No cover</Text>
                            </View>
                          );
                        })()
                      ) : recCoverCache[currentRecKey] ? (
                        <Image source={{ uri: recCoverCache[currentRecKey] }} style={styles.bigCover} resizeMode="contain" />
                      ) : (
                        <View style={styles.bigCoverPlaceholder}>
                          <Text style={styles.bigCoverPlaceholderText}>No cover</Text>
                        </View>
                      )}
                    </View>

                    <View style={styles.recMeta}>
                      <Text style={styles.recBookTitle} numberOfLines={2}>
                        {currentRec.kind === "open_library" ? currentRec.doc.title ?? "Untitled" : currentRec.book.title ?? "Untitled"}
                      </Text>
                      <Text style={styles.recBookAuthor} numberOfLines={1}>
                        {currentRec.kind === "open_library"
                          ? recommendationAuthor(currentRec.doc)
                          : currentRec.book.author ?? "Unknown author"}
                      </Text>
                      <Text style={styles.recCounter}>
                        {recItems.length > 0 ? `${recIndex + 1} of ${recItems.length}` : "0 of 0"}
                      </Text>
                    </View>

                    <View style={styles.recActions}>
                      <TouchableOpacity
                        style={[styles.btn, styles.btnOutlineGold, { borderColor: highlightColor }]}
                        onPress={isFirstRec ? tryAgain : handleBack}
                      >
                        <Text style={styles.btnText}>{isFirstRec ? "Try Again" : "Back"}</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={[styles.btn, styles.btnOutlineGold, { borderColor: highlightColor }]} onPress={handleAlreadyRead}>
                        <Text style={styles.btnText}>Already Read It</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.btn, styles.btnOutlineGold, { borderColor: highlightColor }]}
                        onPress={handleNext}
                      >
                        <Text style={styles.btnText}>Next</Text>
                      </TouchableOpacity>
                    </View>

                    {showRating ? (
                      <View style={{ marginTop: 12 }}>
                        <Text style={styles.smallNote}>Did you like it?</Text>
                        <View style={styles.ratingRow}>
                          {([1, 2, 3, 4, 5] as const).map((r) => {
                            const filled = ratingPreview >= r;
                            return (
                              <TouchableOpacity
                                key={r}
                                style={styles.ratingStarBtn}
                                onPress={() => {
                                  setRatingPreview(r);
                                  setTimeout(() => handleRate(r), 80);
                                }}
                              >
                                <Text style={styles.ratingStar}>{filled ? "★" : "☆"}</Text>
                                <Text style={styles.ratingLabel} numberOfLines={1}>
                                  {ratingLabel(r)}
                                </Text>
                              </TouchableOpacity>
                            );
                          })}
                        </View>
                      </View>
                    ) : null}
                  </View>
                ) : null}

                {recItems.length > 0 && !recLoading && recDone ? (
                  <View style={styles.recCard}>
                    <View style={styles.recMeta}>
                      <Text style={styles.recBookTitle}>You’ve reached the end of your recommendations.</Text>
                      <Text style={styles.recCounter}>{recItems.length} of {recItems.length}</Text>
                    </View>

                    <View style={styles.recActions}>
                      <TouchableOpacity
                        style={[styles.btn, styles.btnOutlineGold, { borderColor: highlightColor }]}
                        onPress={handleBack}
                      >
                        <Text style={styles.btnText}>Back</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.btn, styles.btnOutlineGold, { borderColor: highlightColor }]}
                        onPress={tryAgain}
                      >
                        <Text style={styles.btnText}>Try Again</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                ) : null}

                <TouchableOpacity
                  style={[styles.btn, styles.btnOutlineGold, { borderColor: highlightColor }, { marginTop: 14, minWidth: 220, alignSelf: "center" }]}
                  onPress={() => (props.onOpenSearch ? props.onOpenSearch() : router.push("/(tabs)/index"))}
                >
                  <Text style={styles.btnText}>Search on my own</Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          ) : currentCard ? (
            <View style={[styles.cardArea, isSmallScreen && styles.cardAreaTight]}>
              <View style={styles.cardStage} onLayout={(e) => setCardStageHeight(e.nativeEvent.layout.height)}>
                <View style={styles.cardWrap}>
                  <Animated.View
                    {...panResponder.panHandlers}
                    style={[
                      styles.card,
                      { borderColor: highlightColor },
                      needsCardOffset && styles.cardOffset,
                      cardFitStyle,
                      { transform: [{ translateX: position.x }, { translateY: position.y }] },
                    ]}
                  >
                    {currentSwipeCoverUri ? (
                      <Image source={{ uri: currentSwipeCoverUri }} style={styles.swipeCover} resizeMode="contain" />
                    ) : null}

                    {((currentCard as any)?.title || (currentCard as any)?.author || (currentCard as any)?.genre) ? (
                      <View style={styles.swipeMetaBox}>
                        <Text style={styles.swipeTitle} numberOfLines={2}>
                          {(currentCard as any)?.title ?? ""}
                        </Text>
                        <Text style={styles.swipeAuthor} numberOfLines={1}>
                          {(currentCard as any)?.author ?? ""}
                        </Text>
                        <Text style={styles.swipeGenre} numberOfLines={1}>
                          {(currentCard as any)?.genre ?? ""}
                        </Text>
                      </View>
                    ) : (
                      <Text style={styles.cardPrompt}>{(currentCard as any)?.prompt ?? (currentCard as any)?.title ?? ""}</Text>
                    )}

                  </Animated.View>
                </View>
              </View>

              {isSmallScreen ? (
                <View style={styles.bottomPanel}>
                  <ScrollView style={{ width: "100%" }} contentContainerStyle={{ alignItems: "center", paddingBottom: 12 }} showsVerticalScrollIndicator={false}>
                    <View style={[styles.divider, isSmallScreen && styles.dividerTight]} />
                    <View style={styles.clueRow}>
                      <Text style={styles.clueText}>← Dislike</Text>
                      <Text style={styles.clueText}>↓ Skip</Text>
                      <Text style={styles.clueText}>Like →</Text>
                    </View>
                    <Pressable
                      style={({ pressed }) => [
                        styles.btn,
                        styles.btnOutlineGold,
                        { borderColor: highlightColor },
                        pressed && styles.btnPressedBlue,
                        { marginTop: 12, minWidth: 220 },
                      ]}
                      onPress={() => (props.onOpenSearch ? props.onOpenSearch() : router.push("/(tabs)/index"))}
                    >
                      {({ pressed }) => (
                        <Text style={[styles.btnText, pressed && styles.btnTextOnPrimary]}>Search on my own</Text>
                      )}
                    </Pressable>
                  </ScrollView>
                </View>
              ) : (
                <>
                  <View style={styles.actionRow}>
                    <Pressable
                      style={({ pressed }) => [styles.btn, styles.btnOutlineGold, { borderColor: highlightColor }, pressed && styles.btnPressedBlue, pressed && { borderColor: highlightColor }]}
                      onPress={() => animateOffscreen("left", handleLeft)}
                    >
                      {({ pressed }) => <Text style={[styles.btnText, pressed && styles.btnTextOnPrimary]}>Dislike</Text>}
                    </Pressable>
                    <Pressable
                      style={({ pressed }) => [styles.btn, styles.btnOutlineGold, { borderColor: highlightColor }, pressed && styles.btnPressedBlue, pressed && { borderColor: highlightColor }]}
                      onPress={() => animateOffscreen("down", handleDownNotSure)}
                    >
                      {({ pressed }) => <Text style={[styles.btnText, pressed && styles.btnTextOnPrimary]}>Skip</Text>}
                    </Pressable>
                    <Pressable
                      style={({ pressed }) => [styles.btn, styles.btnOutlineGold, { borderColor: highlightColor }, pressed && styles.btnPressedBlue, pressed && { borderColor: highlightColor }]}
                      onPress={() =>
                        animateOffscreen("right", () => {
                          if (currentCard) handleRight(currentCard);
                        })
                      }
                    >
                      {({ pressed }) => <Text style={[styles.btnText, pressed && styles.btnTextOnPrimary]}>Like</Text>}
                    </Pressable>
                  </View>
                  <Pressable
                    style={({ pressed }) => [
                      styles.btn,
                      styles.btnOutlineGold,
                      { borderColor: highlightColor },
                      pressed && styles.btnPressedBlue,
                      { marginTop: 12, minWidth: 220 },
                    ]}
                    onPress={() => (props.onOpenSearch ? props.onOpenSearch() : router.push("/(tabs)/index"))}
                  >
                    {({ pressed }) => (
                      <Text style={[styles.btnText, pressed && styles.btnTextOnPrimary]}>Search on my own</Text>
                    )}
                  </Pressable>
                </>
              )}
            </View>
          ) : (
            <View style={[styles.doneCard, { borderColor: highlightColor }]}>
              <Text style={styles.doneTitle}>No cards found</Text>
              <Text style={styles.doneSub}>This deck is empty.</Text>
            </View>
          )}
        </View>
      </View>

      <View style={styles.tempButtonsWrap}>
        <View style={styles.tempButtonsColumn}>
          <View style={styles.testPillRow}>
            {testSessionPresets.map((preset) => (
              <TouchableOpacity key={preset.id} style={styles.testPillButton} onPress={() => runTestSessionPreset(preset)}>
                <Text style={styles.debugToggleText}>{preset.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <TouchableOpacity style={styles.diagnosticsToggle} onPress={handleCopyDiagnostics}>
            <Text style={styles.debugToggleText}>Diagnostics</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.freshUserToggle} onPress={handleFreshUserReset}>
            <Text style={styles.debugToggleText}>Fresh User</Text>
          </TouchableOpacity>
        </View>
      </View>

      <RecommenderEqualizerPanel
        deckKey={deckKey}
        visible={showEqualizer}
        onClose={() => setShowEqualizer(false)}
        onProfileOverrideChange={(lane, profileOverride) => {
          setProfileOverridesByLane((prev) => ({ ...prev, [lane]: profileOverride }));
        }}
      />

    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#071526" },
  container: { flex: 1, minHeight: "100%", position: "relative", padding: 16, gap: 12 },
  divider: { width: "100%", height: 1, backgroundColor: "#223b6b", opacity: 0.9 },
  dividerTight: { marginTop: 6 },

  cardArea: { flex: 1, width: "100%", alignItems: "center", justifyContent: "flex-start", minHeight: 0 },
  cardAreaTight: { paddingTop: 0, paddingBottom: 0 },

  topRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  deckChip: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#e0b84b",
    backgroundColor: "#0b1e33",
  },
  deckChipSelected: { backgroundColor: "#2563eb", borderColor: "#e0b84b" },
  deckChipText: { color: "#e5efff", fontWeight: "800", fontSize: 12 },
  deckChipTextSelected: { color: "#f9fafb" },

  statusRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  statusText: { color: "#cbd5f5", fontWeight: "800", fontSize: 12 },

  stage: { flex: 1, justifyContent: "center", alignItems: "center" },
  stageTop: { justifyContent: "flex-start", paddingTop: 10 },

  statusDivider: { width: "100%", height: 1, backgroundColor: "rgba(255,255,255,0.10)", marginTop: 8, marginBottom: 8 },

  cardWrap: { width: "100%", maxWidth: 560, alignItems: "center", overflow: "hidden" },
  cardStage: { flex: 1, width: "100%", alignItems: "center", justifyContent: "flex-start", minHeight: 0, overflow: "hidden" },

  card: {
    width: "100%",
    alignSelf: "center",
    marginTop: 0,
    aspectRatio: 2 / 3,
    borderRadius: 18,
    borderWidth: 2,
    borderColor: "#e0b84b",
    backgroundColor: "#0b1e33",
    overflow: "hidden",
  },

  swipeCover: { backgroundColor: "#000", position: "absolute", top: 0, left: 0, right: 0, bottom: 0, borderRadius: 18 },

  swipeMetaBox: {
    position: "absolute",
    left: 14,
    bottom: 14,
    width: "66%",
    minHeight: "20%",
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderRadius: 14,
    backgroundColor: "rgba(0,0,0,0.65)",
    justifyContent: "flex-end",
  },
  swipeTitle: { fontSize: 16, fontWeight: "700", color: "#fff", marginBottom: 3 },
  swipeAuthor: { fontSize: 13, fontWeight: "500", color: "rgba(255,255,255,0.9)", marginBottom: 4 },
  swipeGenre: { fontSize: 12, fontWeight: "500", color: "rgba(255,255,255,0.75)" },

  cardPrompt: { color: "#e5efff", fontSize: 26, fontWeight: "900", lineHeight: 32 },

  cardOffset: { marginTop: 0 },

  actionRow: { marginTop: 12, flexDirection: "row", gap: 12, flexWrap: "wrap", justifyContent: "center" },
  bottomPanel: { width: "100%", marginTop: 0 },
  clueRow: { marginTop: 6, flexDirection: "row", gap: 14, justifyContent: "center", alignItems: "center", flexWrap: "wrap" },
  clueText: { color: "#cfe0ff", fontSize: 14, fontWeight: "800" },

  btn: {
    minWidth: 140,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 999,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  btnGhost: { backgroundColor: "#0b1e33", borderColor: "#223b6b" },
  btnPrimary: { backgroundColor: "#2563eb", borderColor: "#1d4ed8" },
  btnOutlineGold: { backgroundColor: "#0b1e33", borderColor: "#e0b84b" },
  btnPressedBlue: { backgroundColor: "#2563eb", borderColor: "#e0b84b" },
  btnDisabled: { opacity: 0.45 },
  btnText: { color: "#e5efff", fontWeight: "900", fontSize: 14 },
  btnTextOnPrimary: { color: "#f9fafb" },

  doneCard: {
    width: "100%",
    maxWidth: 760,
    borderRadius: 18,
    borderWidth: 2,
    borderColor: "#e0b84b",
    backgroundColor: "#0b1e33",
    padding: 18,
  },
  doneTitle: { color: "#e5efff", fontSize: 20, fontWeight: "900" },
  doneSub: { color: "#cbd5f5", fontSize: 12, fontWeight: "800", marginTop: 8 },

  recCard: { marginTop: 16 },
  bigCoverWrap: { width: "100%", alignItems: "center" },
  bigCover: { aspectRatio: 2 / 3, backgroundColor: "#000", width: 220, height: 320, borderRadius: 10 },
  bigCoverPlaceholder: { width: 220, height: 320, borderRadius: 10, borderWidth: 1, borderColor: "#223b6b", alignItems: "center", justifyContent: "center" },
  bigCoverPlaceholderText: { color: "#cbd5f5", fontWeight: "800" },

  recActions: { marginTop: 12, flexDirection: "row", gap: 12, justifyContent: "center" },
  smallNote: { color: "#cbd5f5", fontWeight: "800", fontSize: 12, marginTop: 8 },

  ratingRow: {
    marginTop: 8,
    width: "100%",
    maxWidth: 360,
    alignSelf: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  ratingStarBtn: { flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: 6, paddingHorizontal: 0, borderWidth: 0 },
  ratingStar: { fontSize: 26, fontWeight: "900", color: "#e5efff", lineHeight: 28 },
  ratingLabel: { marginTop: 4, color: "#e5efff", fontSize: 11, fontWeight: "800", textAlign: "center", width: "100%", lineHeight: 12, includeFontPadding: false },

  recBookTitle: { color: "#fff" },
  recBookAuthor: { color: "#fff" },
  recCounter: { color: "#cbd5f5", fontWeight: "800", fontSize: 12, marginTop: 6 },

  recMeta: { marginTop: 10, alignItems: "center" },

  tempButtonsWrap: {
    position: "absolute",
    right: 16,
    bottom: 16,
    alignItems: "flex-end",
    zIndex: 40,
  },
  tempButtonsColumn: {
    gap: 8,
    alignItems: "stretch",
    justifyContent: "flex-end",
  },
  testPillRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "flex-end",
    gap: 8,
  },
  testPillButton: {
    minWidth: 84,
    alignItems: "center",
    backgroundColor: "#0b1e33",
    borderColor: "#e0b84b",
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
  },

  genreQuickToggle: {
    minWidth: 112,
    alignItems: "center",
    backgroundColor: "#1d4ed8",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
  },
  diagnosticsToggle: {
    minWidth: 112,
    alignItems: "center",
    backgroundColor: "#7c3aed",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
  },
  copyToggle: {
    minWidth: 112,
    alignItems: "center",
    backgroundColor: "#7c3aed",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
  },
  rerunToggle: {
    minWidth: 112,
    alignItems: "center",
    backgroundColor: "#b45309",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
  },
  tuneToggle: {
    minWidth: 112,
    alignItems: "center",
    backgroundColor: "#0f766e",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
  },
  countsToggle: {
    minWidth: 112,
    alignItems: "center",
    backgroundColor: "#0369a1",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
  },
  freshUserToggle: {
    minWidth: 112,
    alignItems: "center",
    backgroundColor: "#dc2626",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
  },
  randomizeToggle: {
    minWidth: 112,
    alignItems: "center",
    backgroundColor: "#9333ea",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
  },
  debugToggle: {
    minWidth: 112,
    alignItems: "center",
    backgroundColor: "#2b6cff",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
  },
  copyRawPoolToggle: {
    minWidth: 112,
    alignItems: "center",
    backgroundColor: "#7e22ce",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
  },
  rawPoolToggle: {
    minWidth: 112,
    alignItems: "center",
    backgroundColor: "#5b21b6",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
  },
  copyPoolToggle: {
    minWidth: 112,
    alignItems: "center",
    backgroundColor: "#6d28d9",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
  },
  rungsToggle: {
    minWidth: 112,
    alignItems: "center",
    backgroundColor: "#1d4ed8",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
  },
  poolToggle: {
    minWidth: 112,
    alignItems: "center",
    backgroundColor: "#4f46e5",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
  },
  debugToggleText: { color: "#fff", fontWeight: "900" },
  countsPanel: { position: "absolute", right: 16, bottom: 104, width: 320, maxWidth: "90%", zIndex: 50 },
  rawPoolPanel: { position: "absolute", right: 16, bottom: 104, width: 380, maxWidth: "94%", zIndex: 50 },
  poolPanel: { position: "absolute", right: 16, bottom: 104, width: 360, maxWidth: "92%", zIndex: 50 },
  rungsPanel: { position: "absolute", right: 16, bottom: 104, width: 320, maxWidth: "90%", zIndex: 50 },
  debugPanel: { position: "absolute", right: 16, bottom: 104, width: 320, maxWidth: "90%", zIndex: 50 },
  debugCard: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
    backgroundColor: "rgba(10, 20, 35, 0.95)",
    overflow: "hidden",
  },
  debugHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.12)",
  },
  debugTitle: { color: "#fff", fontWeight: "900" },
  debugCloseBtn: { paddingHorizontal: 8, paddingVertical: 2 },
  debugCloseText: { color: "#fff", fontSize: 18, fontWeight: "900" },
  debugScroll: { maxHeight: 340 },
  debugScrollContent: { paddingHorizontal: 12, paddingVertical: 10 },
  debugLabel: { color: "rgba(255,255,255,0.70)", fontSize: 12, fontWeight: "800" },
  debugValue: { color: "#fff", fontSize: 13, fontWeight: "900", marginTop: 2 },
  genreSimWrap: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 8 },
  genreSimButton: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: "#1d4ed8",
    borderWidth: 1,
    borderColor: "#93c5fd",
  },
  genreSimButtonText: { color: "#fff", fontSize: 12, fontWeight: "800" },
  countsRow: { marginTop: 10 },
});
