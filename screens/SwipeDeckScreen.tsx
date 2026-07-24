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
import { runRecommenderV2 } from "../app/recommender-v2";
import { applyGoogleBooksRenderingStageLineage, computeGoogleBooksDropDiagnostics, computeGoogleBooksDropDiagnosticsByTitle, harmonizeGoogleBooksStageLineage } from "../app/recommender-v2/googleBooksLineageDiagnostics";
import type { AgeBandV2, RecommendationResultV2, SwipeSignalV2 } from "../app/recommender-v2";
const DEPLOYED_COMMIT_MARKER = "17c4615";
const ROUTER_INSTRUMENTATION_MARKER = "router-heartbeat-v2-17c4615";
const KITSU_API_BASE = String(
  (process as any)?.env?.EXPO_PUBLIC_KITSU_API_BASE_URL ||
  (process as any)?.env?.KITSU_API_BASE_URL ||
  "https://kitsu.app/api/edge"
).replace(/\/+$/, "");
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
  titles: Set<string>;
  titleRoots: Set<string>;
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

function deckKeyToAgeBandV2(deckKey: DeckKey): AgeBandV2 {
  if (deckKey === "k2") return "kids";
  if (deckKey === "36") return "preteens";
  if (deckKey === "adult") return "adult";
  return "teens";
}

const MIDDLE_GRADES_DEEP_DEBUG_FLAG_NAMES = [
  "debugMiddleGradesDeepTrace",
  "debugMiddleGradesNoTimeouts",
  "debugMiddleGradesDeepDebug",
  "middleGradesDeepDebug",
];

function isTruthyDebugFlag(value: unknown): boolean {
  return value === true || value === "1" || String(value || "").toLowerCase() === "true";
}

function readMiddleGradesDeepDebugRequest(): { active: boolean; source: "url" | "localStorage" | "none" } {
  const runtime = globalThis as any;
  try {
    const search = String(runtime?.location?.search || "");
    if (search) {
      const params = new URLSearchParams(search);
      if (MIDDLE_GRADES_DEEP_DEBUG_FLAG_NAMES.some((name) => isTruthyDebugFlag(params.get(name)))) {
        return { active: true, source: "url" };
      }
    }
  } catch {
    // Non-browser runtimes do not expose location; ignore.
  }
  try {
    if (MIDDLE_GRADES_DEEP_DEBUG_FLAG_NAMES.some((name) => isTruthyDebugFlag(runtime?.localStorage?.getItem?.(name)))) {
      return { active: true, source: "localStorage" };
    }
  } catch {
    // localStorage may be unavailable or blocked; ignore.
  }
  return { active: false, source: "none" };
}

function setMiddleGradesDeepDebugLocalStorage(active: boolean): void {
  const runtime = globalThis as any;
  try {
    if (!runtime?.localStorage?.setItem) return;
    for (const name of MIDDLE_GRADES_DEEP_DEBUG_FLAG_NAMES) {
      runtime.localStorage.setItem(name, active ? "true" : "false");
    }
  } catch {
    // localStorage may be unavailable or blocked; ignore.
  }
}

function middleGradesDeepDebugDiagnosticsForSession(ageBand: AgeBandV2, uiToggleActive: boolean): Record<string, unknown> | undefined {
  if (ageBand !== "preteens") return undefined;
  const browserRequest = readMiddleGradesDeepDebugRequest();
  const active = uiToggleActive || browserRequest.active;
  if (!active) return undefined;
  return {
    middleGradesDeepDebugExpected: true,
    debugMiddleGradesDeepTrace: true,
    debugMiddleGradesNoTimeouts: true,
    middleGradesDeepDebugActivationSource: uiToggleActive ? "localStorage" : browserRequest.source,
  };
}

function formatFromTagsForV2(tags: string[]): SwipeSignalV2["format"] {
  const joined = tags.join(" ").toLowerCase();
  if (/\b(manga|anime)\b/.test(joined)) return joined.includes("anime") ? "anime" : "manga";
  if (/\b(comic|superhero)\b/.test(joined)) return "comic";
  if (/graphicnovel|graphic novel/.test(joined)) return "graphicNovel";
  return "book";
}

function swipeHistoryToV2Signals(entries: SwipeHistoryEntry[]): SwipeSignalV2[] {
  return entries.map((entry) => {
    const card: any = entry.card || {};
    const tags = Array.isArray(card.tags) ? card.tags.map((tag: unknown) => String(tag || "").trim()).filter(Boolean) : [];
    const bareTags = tags.map((tag: string) => tag.replace(/^[a-zA-Z]+:/, "").replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase());
    const genres = [card.genre, ...tags.filter((tag: string) => /^genre:/i.test(tag)).map((tag: string) => tag.replace(/^genre:/i, ""))].map((value) => String(value || "").trim()).filter(Boolean);
    const tones = tags.filter((tag: string) => /^(tone|mood):/i.test(tag)).map((tag: string) => tag.replace(/^(tone|mood):/i, ""));
    const themes = tags.filter((tag: string) => /^(theme|setting|stakes|graphicNovel):/i.test(tag)).map((tag: string) => tag.replace(/^(theme|setting|stakes|graphicNovel):/i, ""));
    const characterDynamics = tags.filter((tag: string) => /^(character|relationship|dynamic):/i.test(tag)).map((tag: string) => tag.replace(/^(character|relationship|dynamic):/i, ""));
    return {
      id: String(card.id || card.key || cardIdentityKey(entry.card)),
      title: String(card.title || card.prompt || "").trim(),
      action: entry.direction === "like" ? "like" : entry.direction === "dislike" ? "dislike" : "skip",
      source: String(card.source || "mock"),
      format: formatFromTagsForV2(tags),
      tags: bareTags,
      genres,
      tones,
      themes,
      characterDynamics,
      weight: entry.direction === "skip" ? 0.25 : 1,
    };
  });
}

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

type RecommendationSourceToggleState = {
  googleBooks?: boolean;
  openLibrary?: boolean;
  localLibrary?: boolean;
  kitsu?: boolean;
  comicVine?: boolean;
  gcd?: boolean;
  nyt?: boolean;
};

type Props = {
  onOpenSearch?: () => void;
  enabledDecks?: Partial<Record<DeckKey, boolean>>;
  recommendationSourceEnabled?: RecommendationSourceToggleState;
  recommendationSourceEnabledByDeck?: Partial<Record<DeckKey, RecommendationSourceToggleState>>;
  localLibrarySupported?: boolean;
  adultKitsuOnlyForceQueryForValidation?: string;
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

const k2DeckResolved: SwipeDeck = resolveDeckFromModule(k2DeckMod as any, "k2", "Kâ€“2");
const k2Deck: SwipeDeck =
  k2DeckResolved && Array.isArray((k2DeckResolved as any).cards) && (k2DeckResolved as any).cards.length > 0
    ? k2DeckResolved
    : ({
        deckKey: "k2",
        deckLabel: "Kâ€“2",
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
  const deckLabel = candidate?.deckLabel ?? "Grades 3â€“6";
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
    titles: new Set<string>(),
    titleRoots: new Set<string>(),
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

function historyIdentityFromDoc(doc: OLDoc | undefined): { id?: string; key?: string; title?: string; authors: string[]; seriesKey?: string } {
  if (!doc) return { authors: [] };

  const normalizedKey = normalizeMemoryToken(doc.key);
  const normalizedId = normalizeMemoryToken(docId(doc));
  const title = normalizeMemoryToken(doc.title);
  const authors = Array.isArray(doc.author_name)
    ? doc.author_name.map((name) => normalizeMemoryToken(name)).filter(Boolean)
    : [];
  const seriesKey = deriveSeriesKeyFromTitle(doc.title);

  return {
    id: normalizedId || undefined,
    key: normalizedKey || undefined,
    title: title || undefined,
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
  const sourceSettingsForDeck = props.recommendationSourceEnabledByDeck?.[deckKey] || props.recommendationSourceEnabled || {};
  const sourceEnabled = {
    googleBooks: sourceSettingsForDeck.googleBooks !== false,
    openLibrary: sourceSettingsForDeck.openLibrary !== false,
    localLibrary: props.localLibrarySupported ? sourceSettingsForDeck.localLibrary !== false : false,
    kitsu: sourceSettingsForDeck.kitsu !== false,
    comicVine: (sourceSettingsForDeck.comicVine ?? sourceSettingsForDeck.gcd) !== false,
    nyt: sourceSettingsForDeck.nyt === true,
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
  const [lastEngineActuallyUsed, setLastEngineActuallyUsed] = useState<"v2" | "">("");
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
  const [v2DebugResult, setV2DebugResult] = useState<RecommendationResultV2 | null>(null);
  const [v2DebugLoading, setV2DebugLoading] = useState(false);
  const [v2DebugError, setV2DebugError] = useState<string>("");
  const [middleGradesDeepDebugUiEnabled, setMiddleGradesDeepDebugUiEnabled] = useState(() => readMiddleGradesDeepDebugRequest().active);
  const v2UrlTriggeredRef = useRef(false);
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
  const [recommendationStartedAt, setRecommendationStartedAt] = useState<string>("");
  const [recommendationTimedOutAt, setRecommendationTimedOutAt] = useState<string>("");
  const [lastKnownBuiltQuery, setLastKnownBuiltQuery] = useState<string>("");
  const [lastKnownFetchPhase, setLastKnownFetchPhase] = useState<string>("");
  const [queryBuildStatus, setQueryBuildStatus] = useState<string>("not_started");
  const [phaseHistory, setPhaseHistory] = useState<Array<{ phase: string; timestamp: string }>>([]);
  const [activeRecommendationRunId, setActiveRecommendationRunId] = useState<string>("");
  const [currentRecommendationRunId, setCurrentRecommendationRunId] = useState<string>("");
  const [pendingRecommendationPromisePresent, setPendingRecommendationPromisePresent] = useState<boolean>(false);
  const [recommendationLockState, setRecommendationLockState] = useState<string>("idle");
  const pendingRecommendationPromiseRef = useRef<Promise<any> | null>(null);
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
    const sourceSwipeHistory: SwipeHistoryEntry[] = Array.isArray((baseInput as any)?.swipeHistory)
      ? ((baseInput as any).swipeHistory as SwipeHistoryEntry[])
      : swipeHistory;

    const likedTagCounts: Record<string, number> = {};
    const dislikedTagCounts: Record<string, number> = {};
    const leftTagCounts: Record<string, number> = {};
    const skippedTagCounts: Record<string, number> = {};
    for (const entry of sourceSwipeHistory) {
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
      ...(Array.isArray((baseInput as any)?.swipeHistory) ? { swipeHistory: (baseInput as any).swipeHistory } : {}),
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
        if (identity.title) history.titles.add(identity.title);
        for (const author of identity.authors) history.authors.add(author);
        if (identity.seriesKey) {
          history.seriesKeys.add(identity.seriesKey);
          history.titleRoots.add(identity.seriesKey);
        }
        continue;
      }

      const itemId = normalizeMemoryToken(fallbackId(item.book));
      if (itemId) history.recommendedIds.add(itemId);
      const title = normalizeMemoryToken(item.book?.title);
      if (title) history.titles.add(title);
      const author = normalizeMemoryToken(item.book?.author);
      if (author) history.authors.add(author);
      const seriesKey = deriveSeriesKeyFromTitle(item.book?.title);
      if (seriesKey) {
        history.seriesKeys.add(seriesKey);
        history.titleRoots.add(seriesKey);
      }
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
    setLastEngineActuallyUsed("");
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
    setV2DebugResult(null);
    setV2DebugError("");
    setV2DebugLoading(false);
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
  }, [deckKey, sessionNonce, pipelineSessionId, pipelineUserId]);

  function tryAgain() {
    setSessionNonce((n) => n + 1);
  }

  function normalizeRecommenderV2Items(rawItems: RecommendationResultV2["items"]): RecItem[] {
    return rawItems.map((candidate) => ({
      kind: "open_library",
      doc: {
        key: `/recommender-v2/${candidate.source}/${candidate.sourceId || candidate.id}`,
        title: candidate.title,
        author_name: candidate.creators.length ? candidate.creators : ["Recommender V2"],
        source: candidate.source,
        description: candidate.description,
        first_publish_year: (candidate.publicationYear as number | undefined) ?? ((candidate.raw as any)?.first_publish_year as number | undefined),
        cover_i:
          (candidate.raw as any)?.cover_i ??
          (candidate.raw as any)?.coverId ??
          (candidate.raw as any)?.rawOpenLibraryDoc?.cover_i,
        coverId:
          (candidate.raw as any)?.coverId ??
          (candidate.raw as any)?.cover_i ??
          (candidate.raw as any)?.rawOpenLibraryDoc?.cover_i,
        imageUrl:
          (candidate.raw as any)?.imageUrl ??
          (candidate.raw as any)?.coverImageUrl ??
          (candidate.raw as any)?.thumbnail ??
          (candidate.raw as any)?.imageLinks?.thumbnail ??
          (candidate.raw as any)?.imageLinks?.smallThumbnail ??
          (candidate.raw as any)?.volumeInfo?.imageLinks?.thumbnail ??
          (candidate.raw as any)?.volumeInfo?.imageLinks?.smallThumbnail,
        coverImageUrl:
          (candidate.raw as any)?.coverImageUrl ??
          (candidate.raw as any)?.imageUrl ??
          (candidate.raw as any)?.thumbnail ??
          (candidate.raw as any)?.imageLinks?.thumbnail ??
          (candidate.raw as any)?.volumeInfo?.imageLinks?.thumbnail,
        imageLinks:
          (candidate.raw as any)?.imageLinks ??
          (candidate.raw as any)?.volumeInfo?.imageLinks,
        diagnostics: {
          engine: "v2",
          source: candidate.source,
          sourceId: candidate.sourceId,
          score: candidate.score,
          matchedSignals: candidate.matchedSignals,
          scoreBreakdown: candidate.scoreBreakdown,
          genreFacetMatch: candidate.scoreBreakdown?.genreFacetMatch ?? 0,
          positiveTasteMatch: candidate.scoreBreakdown?.positiveTasteMatch ?? 0,
          avoidSignalPenalty: (candidate.scoreBreakdown?.avoidSignalPenalty ?? 0) + (candidate.scoreBreakdown?.broadAvoidSignalPenalty ?? 0),
          preciseAvoidSignalPenalty: candidate.scoreBreakdown?.avoidSignalPenalty ?? 0,
          broadAvoidSignalPenalty: candidate.scoreBreakdown?.broadAvoidSignalPenalty ?? 0,
          ageTeenSuitability: candidate.scoreBreakdown?.ageTeenSuitability ?? 0,
          ageBandSuitability: candidate.scoreBreakdown?.ageBandSuitability ?? candidate.scoreBreakdown?.ageTeenSuitability ?? 0,
          sourceQualityRelevance: candidate.scoreBreakdown?.sourceQualityRelevance ?? 0,
          queryRungBonus: candidate.scoreBreakdown?.queryRungBonus ?? 0,
          formats: candidate.formats,
          genres: candidate.genres,
          themes: candidate.themes,
          tones: candidate.tones,
          characterDynamics: candidate.characterDynamics,
          queryText: candidate.diagnostics?.queryText,
          originalPlannedQuery: candidate.diagnostics?.originalPlannedQuery,
          simplifiedOpenLibraryQuery: candidate.diagnostics?.simplifiedOpenLibraryQuery,
          queryCascadeIndex: candidate.diagnostics?.queryCascadeIndex,
          queryFamily: candidate.diagnostics?.queryFamily,
          facets: candidate.diagnostics?.facets,
          authors: candidate.creators,
        },
        queryText: candidate.diagnostics?.queryText,
        originalPlannedQuery: candidate.diagnostics?.originalPlannedQuery,
        simplifiedOpenLibraryQuery: candidate.diagnostics?.simplifiedOpenLibraryQuery,
        queryCascadeIndex: candidate.diagnostics?.queryCascadeIndex,
        queryRung: candidate.diagnostics?.queryCascadeIndex,
        queryFamily: candidate.diagnostics?.queryFamily,
        facets: candidate.diagnostics?.facets,
      } as any,
    }));
  }

  function uniqueTitles(titles: Array<string | undefined | null>): string[] {
    const seen = new Set<string>();
    const result: string[] = [];
    for (const title of titles) {
      const value = String(title || "").trim();
      if (!value) continue;
      const key = value.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      result.push(value);
    }
    return result;
  }

  function googleBooksTitlesFromV2Candidates(candidates: RecommendationResultV2["items"]): string[] {
    return uniqueTitles(
      (Array.isArray(candidates) ? candidates : [])
        .filter((candidate) => String(candidate?.source || "") === "googleBooks")
        .map((candidate) => String(candidate?.title || "")),
    );
  }

  function googleBooksTitlesFromRecItems(items: RecItem[]): string[] {
    return uniqueTitles(
      (Array.isArray(items) ? items : [])
        .map((item) => {
          if (!item || item.kind !== "open_library") return "";
          const source = String((item.doc as any)?.source || "");
          if (source !== "googleBooks") return "";
          return String(item.doc?.title || "");
        }),
    );
  }

  function googleBooksTitlesFromDiagnosticItems(items: any[]): string[] {
    return uniqueTitles(
      (Array.isArray(items) ? items : [])
        .map((item) => {
          const source = String(item?.doc?.source || item?.source || "");
          if (source !== "googleBooks") return "";
          return String(item?.doc?.title || item?.title || "");
        }),
    );
  }

  function buildV2RecommendationResultForDiagnostics(v2Result: RecommendationResultV2, normalizedItems: RecItem[], inputWithHistory: RecommenderInput) {
    const diagnostics = v2Result.diagnostics;
    const openLibrarySourceDiagnostics = diagnostics.sources.find((source) => source.source === "openLibrary") as any;
    const googleBooksSourceDiagnostics = diagnostics.sources.find((source) => source.source === "googleBooks") as any;
    const openLibrarySourceFetchDiagnostics = Array.isArray(openLibrarySourceDiagnostics?.fetches)
      ? openLibrarySourceDiagnostics.fetches.map((fetch: any) => ({
          query: String(fetch?.query || ""),
          diagnosticOnly: Boolean(fetch?.diagnosticOnly),
          probe: Boolean(fetch?.diagnosticOnly),
          fetchStartedAt: fetch?.fetchStartedAt,
          fetchFinishedAt: fetch?.fetchFinishedAt,
          elapsedMs: typeof fetch?.elapsedMs === "number" ? fetch.elapsedMs : undefined,
          timedOut: Boolean(fetch?.timedOut),
          httpStatus: typeof fetch?.httpStatus === "number" ? fetch.httpStatus : undefined,
          fetchPath: fetch?.fetchPath,
          returnedDocCount: typeof fetch?.docsReturned === "number" ? fetch.docsReturned : 0,
          docsReturned: typeof fetch?.docsReturned === "number" ? fetch.docsReturned : 0,
          firstReturnedTitles: Array.isArray(fetch?.firstReturnedTitles) ? fetch.firstReturnedTitles : [],
          responseShape: fetch?.responseShape,
          responseBodyPrefix: fetch?.responseBodyPrefix,
          failedReason: fetch?.failedReason,
          originalPlannedQuery: fetch?.originalPlannedQuery,
          queryCascadeIndex: fetch?.queryCascadeIndex,
          queryFamily: fetch?.queryFamily,
          facets: fetch?.facets,
        }))
      : [];
    const history = getRecommendationHistoryBucket(inputWithHistory.deckKey || deckKey);
    const crossSessionRepeatedTitles = normalizedItems.map((item) => normalizeMemoryToken(item.kind === "open_library" ? item.doc.title : item.book.title)).filter((title) => title && history.titles.has(title));
    const crossSessionRepeatedRoots = normalizedItems.map((item) => deriveSeriesKeyFromTitle(item.kind === "open_library" ? item.doc.title : item.book.title)).filter((root) => root && history.titleRoots.has(root));
    const sourceStats = Object.fromEntries(diagnostics.sources.map((source) => [
      source.source,
      {
        rawFetched: source.rawCount,
        postFilterCandidates: Number(source.normalizedCount || 0),
        finalSelected: v2Result.items.filter((item) => item.source === source.source).length,
      },
    ]));
    const normalizedCount = diagnostics.stages.find((stage) => stage.stage === "normalized")?.counts?.normalized ?? 0;
    const scoredCount = diagnostics.stages.find((stage) => stage.stage === "scored")?.counts?.scored ?? 0;
    const middleGradesPipelineAudit = diagnostics.stages.find((stage) => stage.stage === "middle_grades_candidate_pool_audit")?.details as any;
    const selectionDiagnostics = (diagnostics.stages.find((stage) => stage.stage === "selected")?.details as any)?.rejectedReasons || {};
    const tasteProfileDiagnostics = (diagnostics.tasteProfile?.diagnostics || {}) as Record<string, any>;
    const normalizedDocsCountForReport = Number(middleGradesPipelineAudit?.normalizedDocsCount ?? normalizedCount);
    const rankedDocsLengthForReport = Number(middleGradesPipelineAudit?.rankedDocsLength ?? scoredCount);
    const convertedDocsAvailableForScoringCountForReport = Number(middleGradesPipelineAudit?.convertedDocsAvailableForScoringCount ?? normalizedCount);
    const scoredCandidateUniverseCountForReport = Number(middleGradesPipelineAudit?.scoredCandidateUniverseCount ?? scoredCount);
    const middleGradesExpandedPoolHandoffFailedForReport = Boolean(middleGradesPipelineAudit?.middleGradesExpandedPoolHandoffFailed || openLibrarySourceDiagnostics?.middleGradesExpandedPoolHandoffFailed);
    const middleGradesExpandedPoolFailureReasonForReport = String(middleGradesPipelineAudit?.middleGradesExpandedPoolFailureReason || openLibrarySourceDiagnostics?.middleGradesExpandedPoolFailureReason || "");
    const finalEligibilityCleanCandidateCountForReport = Number(selectionDiagnostics?.finalEligibilityCleanCandidateCount ?? v2Result.items.length ?? 0);
    const viableCandidateCountBeforeFinalSelectionForReport = Number(scoredCount || 0);
    const finalAcceptedDocsLengthForReport = Number(v2Result.items.length || 0);
    const queries = diagnostics.searchPlan.intents.map((intent) => intent.query);
    const returnedItemsBeforeV2FailClosed = normalizedItems.map((item) => item.kind === "open_library" ? { doc: item.doc } : { doc: item.book });
    const returnedItemsTitlesBeforeV2FailClosed = normalizedItems.map((item) => item.kind === "open_library" ? item.doc.title : item.book.title).filter(Boolean);
    const middleGradesV2OpenLibraryReturn =
      inputWithHistory.deckKey === "36" &&
      normalizedItems.some((item) => item.kind === "open_library");
    const v2ReturnedItemsFailClosed =
      middleGradesV2OpenLibraryReturn &&
      returnedItemsTitlesBeforeV2FailClosed.length > 0 &&
      scoredCount === 0;
    const diagnosticReturnedItems = v2ReturnedItemsFailClosed ? [] : returnedItemsBeforeV2FailClosed;
    const diagnosticReturnedItemsTitles = v2ReturnedItemsFailClosed ? [] : returnedItemsTitlesBeforeV2FailClosed;
    const v2ReturnedItemsLineage = returnedItemsTitlesBeforeV2FailClosed.map((title, index) => ({
      title,
      returnedIndex: index,
      sourceArrayName: "recommender-v2:normalizedItems",
      sourceCandidateId: title,
      normalizedId: v2ReturnedItemsFailClosed ? "" : title,
      scoredId: scoredCount > 0 ? title : "",
      finalSelectionId: v2ReturnedItemsFailClosed ? "" : title,
      bypassedScoring: scoredCount === 0,
    }));
    const googleBooksStageDecisionByTitle = (selectionDiagnostics?.googleBooksStageDecisionByTitle || {}) as Record<string, Record<string, string>>;
    const googleBooksStageReasonByTitle = (selectionDiagnostics?.googleBooksStageReasonByTitle || {}) as Record<string, Record<string, string>>;
    const googleBooksStageGateByTitle = (selectionDiagnostics?.googleBooksStageGateByTitle || {}) as Record<string, Record<string, string>>;
    const titlesAtDetailedStage = (stage: string, accepted: string[]) => uniqueTitles(
      Object.entries(googleBooksStageDecisionByTitle)
        .filter(([, decisions]) => accepted.includes(String(decisions?.[stage] || "")))
        .map(([title]) => title),
    );
    const normalizedCandidateTitles = uniqueTitles([
      ...titlesAtDetailedStage("normalization", ["admitted"]),
      ...Object.keys((selectionDiagnostics?.googleBooksNormalizationEligibilityByTitle || {}) as Record<string, unknown>),
    ]);
    const rankedCandidateTitles = uniqueTitles(Array.isArray(selectionDiagnostics?.googleBooksRankedCandidateTitles) ? selectionDiagnostics.googleBooksRankedCandidateTitles : []);
    const genericFinalEligibilityTitles = uniqueTitles(
      Object.entries((selectionDiagnostics?.googleBooksFinalEligibilityDecisionByTitle || {}) as Record<string, unknown>)
        .filter(([, decision]) => String(decision || "") === "accepted")
        .map(([title]) => title),
    );
    const finalEligibilityTitles = uniqueTitles([
      ...genericFinalEligibilityTitles,
      ...Object.entries((selectionDiagnostics?.adultGoogleBooksEligibilityReasonByTitle || {}) as Record<string, unknown>)
        .filter(([, reason]) => String(reason || "").startsWith("adult_googlebooks_minimal_final_gate_passed"))
        .map(([title]) => title),
    ]);
    const genericFinalAcceptedTitles = uniqueTitles(
      Object.entries((selectionDiagnostics?.googleBooksFinalSelectionDecisionByTitle || {}) as Record<string, unknown>)
        .filter(([, decision]) => String(decision || "") === "selected")
        .map(([title]) => title),
    );
    const finalAcceptedTitles = uniqueTitles([
      ...genericFinalAcceptedTitles,
      ...(Array.isArray(selectionDiagnostics?.adultGoogleBooksAcceptedTitles) ? selectionDiagnostics.adultGoogleBooksAcceptedTitles : []),
    ]);
    const googleBooksWrapperInputTitles = googleBooksTitlesFromV2Candidates(v2Result.items);
    const googleBooksWrapperOutputTitles = googleBooksTitlesFromDiagnosticItems(diagnosticReturnedItems as any[]);
    const googleBooksRendererInputTitles = [...googleBooksWrapperOutputTitles];
    const googleBooksRendererOutputTitles = [...googleBooksWrapperOutputTitles];
    const googleBooksAgeBandRenderedTitlesByDeck = {
      ...((selectionDiagnostics?.googleBooksAgeBandRenderedTitlesByDeck || {}) as Record<string, string[]>),
    };
    const currentGoogleBooksAgeBand = String(diagnostics.tasteProfile?.ageBand || "");
    if (["kids", "preteens", "teens"].includes(currentGoogleBooksAgeBand)) {
      googleBooksAgeBandRenderedTitlesByDeck[currentGoogleBooksAgeBand] = googleBooksRendererOutputTitles;
    }
    const googleBooksAcceptedTitlesByStage = harmonizeGoogleBooksStageLineage({
      sourceAdmission: titlesAtDetailedStage("source_admission", ["admitted"]),
      normalization: titlesAtDetailedStage("normalization", ["admitted"]),
      publicationIdentityOrShapePolicy: titlesAtDetailedStage("publication_identity_or_shape_policy", ["passed", "rescued"]),
      audienceMaturityPolicy: titlesAtDetailedStage("audience_maturity_policy", ["passed", "tracked"]),
      preScoringAdmission: titlesAtDetailedStage("pre_scoring", ["entered"]),
      scoringAdmission: titlesAtDetailedStage("scoring_admission", ["entered"]),
      ranking: titlesAtDetailedStage("ranking", ["entered"]),
      selection: titlesAtDetailedStage("selection", ["selected"]),
      rendering: googleBooksRendererOutputTitles,
      normalizedCandidate: normalizedCandidateTitles,
      rankedCandidate: rankedCandidateTitles,
      googleBooksRankedCandidateTitles: rankedCandidateTitles,
      finalEligibility: finalEligibilityTitles,
      finalAcceptedDocs: finalAcceptedTitles,
      wrapperInput: googleBooksWrapperInputTitles,
      wrapperOutput: googleBooksWrapperOutputTitles,
      returnedItems: googleBooksWrapperOutputTitles,
      renderedRecommendations: googleBooksRendererOutputTitles,
      rendererInput: googleBooksRendererInputTitles,
      rendererOutput: googleBooksRendererOutputTitles,
    });
    const gbEligibilityReasonByTitle = (selectionDiagnostics?.googleBooksFinalEligibilityReasonByTitle || selectionDiagnostics?.adultGoogleBooksEligibilityReasonByTitle || {}) as Record<string, string>;
    const gbSelectionDecisionByTitle = (selectionDiagnostics?.googleBooksFinalSelectionDecisionByTitle || {}) as Record<string, string>;
    const gbRejectedBeforeRankingReason = (selectionDiagnostics?.googleBooksRejectedBeforeRankingReason || googleBooksSourceDiagnostics?.googleBooksRejectedBeforeRankingReason || {}) as Record<string, string>;
    const dropped = computeGoogleBooksDropDiagnostics(googleBooksAcceptedTitlesByStage as Record<string, string[]>);
    const droppedByTitle = computeGoogleBooksDropDiagnosticsByTitle(googleBooksAcceptedTitlesByStage as Record<string, string[]>, gbEligibilityReasonByTitle, gbSelectionDecisionByTitle, gbRejectedBeforeRankingReason);
    const renderedStageLineage = applyGoogleBooksRenderingStageLineage(
      googleBooksStageDecisionByTitle,
      googleBooksStageReasonByTitle,
      googleBooksStageGateByTitle,
      googleBooksRendererOutputTitles,
    );
    const placeholderReplacementReason = finalAcceptedTitles.length > 0
      && googleBooksWrapperOutputTitles.length === 0
      && returnedItemsTitlesBeforeV2FailClosed.length > 0
      ? "googlebooks_titles_missing_from_wrapper_output_while_non_googlebooks_items_present"
      : "";
    return {
      engineSelected: "v2",
      engineActuallyUsed: "v2",
      engineId: "recommender-v2",
      engineLabel: "Recommender V2",
      builtFromQuery: queries.join(" | "),
      returnedItemsBuiltFrom: v2ReturnedItemsFailClosed ? "open_library_source_emergency_bypass" : "recommender-v2",
      items: diagnosticReturnedItems,
      returnedItemsTitles: diagnosticReturnedItemsTitles,
      returnedItemsLineage: v2ReturnedItemsLineage,
      returnedItemsAuditConsistencyFailure: v2ReturnedItemsFailClosed,
      returnedItemsBypassPath: v2ReturnedItemsFailClosed ? "recommender-v2 normalizedItems -> returnedItemsTitles blocked_fail_closed" : "none",
      openLibrarySourceEmergencyBypassFailure: v2ReturnedItemsFailClosed,
      openLibrarySourceFinalBypassRemovedTitles: v2ReturnedItemsFailClosed ? returnedItemsTitlesBeforeV2FailClosed : [],
      emergencyBypassReason: v2ReturnedItemsFailClosed ? "middle_grades_openlibrary_returned_items_without_scored_lineage" : "",
      countContractSatisfied: v2ReturnedItemsFailClosed ? false : undefined,
      lockQualityPass: v2ReturnedItemsFailClosed ? false : undefined,
      debugSourceStats: sourceStats,
      debugRawPool: diagnostics.sources.flatMap((source: any) => Array.isArray(source.rawItemPreview) && source.rawItemPreview.length
        ? source.rawItemPreview.map((item: any) => ({
            title: item?.title || `${source.source} raw`,
            author_name: Array.isArray(item?.authors) ? item.authors : [],
            authors: Array.isArray(item?.authors) ? item.authors : [],
            source: item?.source || source.source,
            queryText: item?.queryText,
            originalPlannedQuery: item?.originalPlannedQuery,
            simplifiedOpenLibraryQuery: item?.simplifiedOpenLibraryQuery,
            queryCascadeIndex: item?.queryCascadeIndex,
            queryRung: item?.queryCascadeIndex,
            queryFamily: item?.queryFamily,
            facets: item?.facets,
            first_publish_year: item?.first_publish_year,
            diagnostics: { engine: "v2", queryText: item?.queryText, queryFamily: item?.queryFamily, queryCascadeIndex: item?.queryCascadeIndex, authors: item?.authors },
          }))
        : Array.from({ length: source.rawCount }, (_unused, index) => ({ title: `${source.source} raw ${index + 1}`, source: source.source, diagnostics: { engine: "v2", placeholder: true } }))),
      debugCandidatePool: v2Result.items.map((candidate: any) => ({
        ...candidate,
        author: Array.isArray(candidate.creators) && candidate.creators.length ? candidate.creators[0] : undefined,
        author_name: Array.isArray(candidate.creators) ? candidate.creators : [],
        queryText: candidate.diagnostics?.queryText,
        originalPlannedQuery: candidate.diagnostics?.originalPlannedQuery,
        simplifiedOpenLibraryQuery: candidate.diagnostics?.simplifiedOpenLibraryQuery,
        queryCascadeIndex: candidate.diagnostics?.queryCascadeIndex,
        queryRung: candidate.diagnostics?.queryCascadeIndex,
        queryFamily: candidate.diagnostics?.queryFamily,
        facets: candidate.diagnostics?.facets,
        genreFacetMatch: candidate.scoreBreakdown?.genreFacetMatch ?? 0,
        positiveTasteMatch: candidate.scoreBreakdown?.positiveTasteMatch ?? 0,
        avoidSignalPenalty: (candidate.scoreBreakdown?.avoidSignalPenalty ?? 0) + (candidate.scoreBreakdown?.broadAvoidSignalPenalty ?? 0),
        preciseAvoidSignalPenalty: candidate.scoreBreakdown?.avoidSignalPenalty ?? 0,
        broadAvoidSignalPenalty: candidate.scoreBreakdown?.broadAvoidSignalPenalty ?? 0,
        ageTeenSuitability: candidate.scoreBreakdown?.ageTeenSuitability ?? 0,
        ageBandSuitability: candidate.scoreBreakdown?.ageBandSuitability ?? candidate.scoreBreakdown?.ageTeenSuitability ?? 0,
        sourceQualityRelevance: candidate.scoreBreakdown?.sourceQualityRelevance ?? 0,
        queryRungBonus: candidate.scoreBreakdown?.queryRungBonus ?? 0,
      })),
      sourceEnabled,
      sourceFetchAttemptedBySource: Object.fromEntries(diagnostics.sources.map((source) => [source.source, Boolean(source.attempted)])),
      sourceFetchTimeoutBySource: Object.fromEntries(diagnostics.sources.map((source) => [source.source, Boolean(source.timedOut)])),
      sourceRawCountBySource: Object.fromEntries(diagnostics.sources.map((source) => [source.source, Number(source.rawCount || 0)])),
      mockSourceEnabled: diagnostics.sources.some((s: any) => s.source === "mock" && s.status !== "skipped"),
      mockSourceActivationReason: diagnostics.sources.find((s: any) => s.source === "mock" && s.status !== "skipped") ? "mock_source_planned_and_active" : "mock_source_disabled_or_skipped",
      mockSourceRawCount: Number(diagnostics.sources.find((s: any) => s.source === "mock")?.rawCount || 0),
      mockSourceReturnedTitles: (v2Result.items as any[]).filter((c) => c.source === "mock").map((c) => c.title).filter(Boolean),
      mockSourceSuppressedInNormalRun: !diagnostics.sources.some((s: any) => s.source === "mock" && s.status !== "skipped"),
      openLibrarySourceFetchDiagnostics,
      openLibraryProbeRan: Boolean(openLibrarySourceDiagnostics?.openLibraryProbeRan || openLibrarySourceFetchDiagnostics.some((fetch: any) => fetch.diagnosticOnly)),
      openLibrarySourceEmptyReason: openLibrarySourceDiagnostics?.emptyReason || "",
      openLibrarySourceRawApiResultCount: Number(openLibrarySourceDiagnostics?.rawApiResultCount || 0),
      openLibrarySourceDroppedBeforeDocCount: Number(openLibrarySourceDiagnostics?.droppedBeforeDocCount || 0),
      openLibrarySourceDropReasons: openLibrarySourceDiagnostics?.dropReasons || {},
      openLibraryTopUpRan: Boolean(openLibrarySourceDiagnostics?.openLibraryTopUpRan),
      openLibraryTopUpTarget: Number(openLibrarySourceDiagnostics?.openLibraryTopUpTarget || 0),
      openLibraryFallbackQueriesExhausted: Boolean(openLibrarySourceDiagnostics?.openLibraryFallbackQueriesExhausted),
      openLibraryUsableRowsAfterFiltering: Number(openLibrarySourceDiagnostics?.usableRowsAfterFiltering || 0),
      openLibraryDocsFetchedAcrossAllQueriesCount: Number(openLibrarySourceDiagnostics?.openLibraryDocsFetchedAcrossAllQueriesCount || 0),
      openLibraryDocsEligibleForScoringCount: Number(openLibrarySourceDiagnostics?.openLibraryDocsEligibleForScoringCount || 0),
      openLibraryDocsActuallyHandedToScoringCount: Number(openLibrarySourceDiagnostics?.openLibraryDocsActuallyHandedToScoringCount || 0),
      openLibraryScoringHandoffLimitedToSourceFinal: Boolean(openLibrarySourceDiagnostics?.openLibraryScoringHandoffLimitedToSourceFinal),
      openLibraryScoringHandoffSuppressedTitles: openLibrarySourceDiagnostics?.openLibraryScoringHandoffSuppressedTitles || [],
      openLibraryScoringHandoffSource: openLibrarySourceDiagnostics?.openLibraryScoringHandoffSource || "",
      meaningfulTasteRecoveryTriggered: Boolean(openLibrarySourceDiagnostics?.meaningfulTasteRecoveryTriggered),
      meaningfulTasteRecoveryTriggerStage: openLibrarySourceDiagnostics?.meaningfulTasteRecoveryTriggerStage || "",
      meaningfulTasteRecoverySkippedReason: openLibrarySourceDiagnostics?.meaningfulTasteRecoverySkippedReason || "",
      postFinalEligibilityUnderfillRecoveryTriggered: Boolean(openLibrarySourceDiagnostics?.postFinalEligibilityUnderfillRecoveryTriggered),
      postFinalEligibilityRecoveryAcceptedTitles: Array.isArray(openLibrarySourceDiagnostics?.postFinalEligibilityRecoveryAcceptedTitles) ? openLibrarySourceDiagnostics.postFinalEligibilityRecoveryAcceptedTitles : [],
      postFinalEligibilityRecoveryRejectedByReason: openLibrarySourceDiagnostics?.postFinalEligibilityRecoveryRejectedByReason || {},
      meaningfulTasteRecoverySurvivingFinalCount: Number(openLibrarySourceDiagnostics?.meaningfulTasteRecoverySurvivingFinalCount || 0),
      meaningfulTasteRecoveryContinuedAfterRejectedMerge: Boolean(openLibrarySourceDiagnostics?.meaningfulTasteRecoveryContinuedAfterRejectedMerge),
      meaningfulTasteRecoveryExhaustedQueries: Array.isArray(openLibrarySourceDiagnostics?.meaningfulTasteRecoveryExhaustedQueries) ? openLibrarySourceDiagnostics.meaningfulTasteRecoveryExhaustedQueries : [],
      meaningfulTasteRecoveryRejectedQueryFamilies: Array.isArray(openLibrarySourceDiagnostics?.meaningfulTasteRecoveryRejectedQueryFamilies) ? openLibrarySourceDiagnostics.meaningfulTasteRecoveryRejectedQueryFamilies : [],
      recoverySuccessRequiresFinalEligibility: Boolean(openLibrarySourceDiagnostics?.recoverySuccessRequiresFinalEligibility),
      middleGradesRecoveryFinalShortfallReason: openLibrarySourceDiagnostics?.middleGradesRecoveryFinalShortfallReason || "",
      middleGradesRecoveryRejectedReasonCounts: openLibrarySourceDiagnostics?.middleGradesRecoveryRejectedReasonCounts || {},
      middleGradesRecoveryBestRejectedTitlesByReason: openLibrarySourceDiagnostics?.middleGradesRecoveryBestRejectedTitlesByReason || {},
      middleGradesRecoveryNextBestSelectableTitles: Array.isArray(openLibrarySourceDiagnostics?.middleGradesRecoveryNextBestSelectableTitles) ? openLibrarySourceDiagnostics.middleGradesRecoveryNextBestSelectableTitles : [],
      middleGradesRecoveryCouldHaveReachedFiveIfRelaxedGate: Boolean(openLibrarySourceDiagnostics?.middleGradesRecoveryCouldHaveReachedFiveIfRelaxedGate),
      middleGradesRecoveryRelaxedGateNeeded: openLibrarySourceDiagnostics?.middleGradesRecoveryRelaxedGateNeeded || "",
      recoveryQueryAnchorByQuery: openLibrarySourceDiagnostics?.recoveryQueryAnchorByQuery || {},
      recoveryHumorUsedAsAnchorBlocked: Boolean(openLibrarySourceDiagnostics?.recoveryHumorUsedAsAnchorBlocked),
      recoveryConcreteFictionQueryUsed: Boolean(openLibrarySourceDiagnostics?.recoveryConcreteFictionQueryUsed),
      recoveryQueryFamilyAcceptedFinalCount: openLibrarySourceDiagnostics?.recoveryQueryFamilyAcceptedFinalCount || {},
      recoveryQueryFamilyRejectedForLeakageCount: openLibrarySourceDiagnostics?.recoveryQueryFamilyRejectedForLeakageCount || {},
      meaningfulTasteRecoveryQueriesAttempted: Array.isArray(openLibrarySourceDiagnostics?.meaningfulTasteRecoveryQueriesAttempted) ? openLibrarySourceDiagnostics.meaningfulTasteRecoveryQueriesAttempted : [],
      meaningfulTasteRecoveryAcceptedTitles: Array.isArray(openLibrarySourceDiagnostics?.meaningfulTasteRecoveryAcceptedTitles) ? openLibrarySourceDiagnostics.meaningfulTasteRecoveryAcceptedTitles : [],
      meaningfulTasteRecoveryRejectedTitlesByReason: openLibrarySourceDiagnostics?.meaningfulTasteRecoveryRejectedTitlesByReason || {},
      meaningfulTasteRecoveryFinalCount: Number(openLibrarySourceDiagnostics?.meaningfulTasteRecoveryFinalCount || 0),
      underfilledAfterMeaningfulTasteRecovery: Boolean(openLibrarySourceDiagnostics?.underfilledAfterMeaningfulTasteRecovery),
      cleanCandidateShortfallExpansionTriggered: Boolean(openLibrarySourceDiagnostics?.cleanCandidateShortfallExpansionTriggered),
      expansionNotTriggeredReason: openLibrarySourceDiagnostics?.expansionNotTriggeredReason || "",
      expansionFetchAttempted: Boolean(openLibrarySourceDiagnostics?.expansionFetchAttempted),
      expansionAttemptedQueries: Array.isArray(openLibrarySourceDiagnostics?.expansionAttemptedQueries) ? openLibrarySourceDiagnostics.expansionAttemptedQueries : [],
      expansionFetchResultsByQuery: Array.isArray(openLibrarySourceDiagnostics?.expansionFetchResultsByQuery) ? openLibrarySourceDiagnostics.expansionFetchResultsByQuery : [],
      expansionRawCount: Number(openLibrarySourceDiagnostics?.expansionRawCount || 0),
      expansionConvertedCount: Number(openLibrarySourceDiagnostics?.expansionConvertedCount || 0),
      expansionMergedCandidateCount: Number(openLibrarySourceDiagnostics?.expansionMergedCandidateCount || 0),
      expansionMergedTitles: Array.isArray(openLibrarySourceDiagnostics?.expansionMergedTitles) ? openLibrarySourceDiagnostics.expansionMergedTitles : [],
      expansionFetchFailureReason: openLibrarySourceDiagnostics?.expansionFetchFailureReason || "",
      expansionMergeSkippedReason: openLibrarySourceDiagnostics?.expansionMergeSkippedReason || "",
      expansionCandidatesEnteredScoringCount: Number(openLibrarySourceDiagnostics?.expansionCandidatesEnteredScoringCount || 0),
      expansionCleanEligibleCount: Number(openLibrarySourceDiagnostics?.expansionCleanEligibleCount || 0),
      finalEligibilityGateApplied: Boolean(openLibrarySourceDiagnostics?.finalEligibilityGateApplied),
      expansionCandidatesAcceptedFinal: Array.isArray(openLibrarySourceDiagnostics?.expansionCandidatesAcceptedFinal) ? openLibrarySourceDiagnostics.expansionCandidatesAcceptedFinal : [],
      expansionSelectedTitles: Array.isArray(openLibrarySourceDiagnostics?.expansionSelectedTitles) ? openLibrarySourceDiagnostics.expansionSelectedTitles : [],
      expansionCandidatesRejectedByReason: openLibrarySourceDiagnostics?.expansionCandidatesRejectedByReason || {},
      expansionSelectedRejectedByReason: openLibrarySourceDiagnostics?.expansionSelectedRejectedByReason || {},
      expansionLockQualityPass: Boolean(openLibrarySourceDiagnostics?.expansionLockQualityPass),
      expansionLockQualityFailReasons: Array.isArray(openLibrarySourceDiagnostics?.expansionLockQualityFailReasons) ? openLibrarySourceDiagnostics.expansionLockQualityFailReasons : [],
      expansionSelectedEvidenceAnchorsByTitle: openLibrarySourceDiagnostics?.expansionSelectedEvidenceAnchorsByTitle || {},
      expansionDistinctEvidenceAnchorCount: Number(openLibrarySourceDiagnostics?.expansionDistinctEvidenceAnchorCount || 0),
      expansionWeakClusterSelectedTitles: Array.isArray(openLibrarySourceDiagnostics?.expansionWeakClusterSelectedTitles) ? openLibrarySourceDiagnostics.expansionWeakClusterSelectedTitles : [],
      expansionContinuedAfterWeakCluster: Boolean(openLibrarySourceDiagnostics?.expansionContinuedAfterWeakCluster),
      meaningfulTasteRecoveryMergedIntoScoring: Boolean(selectionDiagnostics?.meaningfulTasteRecoveryMergedIntoScoring),
      meaningfulTasteRecoveryMergedCandidateCount: Number(selectionDiagnostics?.meaningfulTasteRecoveryMergedCandidateCount || 0),
      meaningfulTasteRecoveryDroppedAfterMergeByReason: selectionDiagnostics?.meaningfulTasteRecoveryDroppedAfterMergeByReason || {},
      meaningfulTasteRecoveryAcceptedButNotReturnedTitles: Array.isArray(selectionDiagnostics?.meaningfulTasteRecoveryAcceptedButNotReturnedTitles) ? selectionDiagnostics.meaningfulTasteRecoveryAcceptedButNotReturnedTitles : [],
      meaningfulTasteRecoveryFinalSelectionCount: Number(selectionDiagnostics?.meaningfulTasteRecoveryFinalSelectionCount || 0),
      candidateTasteMatchScoreByTitle: selectionDiagnostics?.candidateTasteMatchScoreByTitle || {},
      candidateTastePenaltyByTitle: selectionDiagnostics?.candidateTastePenaltyByTitle || {},
      candidateMatchedLikedSignalsByTitle: selectionDiagnostics?.candidateMatchedLikedSignalsByTitle || {},
      candidateMatchedDislikedSignalsByTitle: selectionDiagnostics?.candidateMatchedDislikedSignalsByTitle || {},
      finalScoreComponentsByTitle: selectionDiagnostics?.finalScoreComponentsByTitle || {},
      finalRankingReasonByTitle: selectionDiagnostics?.finalRankingReasonByTitle || {},
      rankedDocsTitles: Array.isArray(selectionDiagnostics?.rankedDocsTitles) ? selectionDiagnostics.rankedDocsTitles : [],
      finalEligibilityAcceptedTitles: Array.isArray(selectionDiagnostics?.finalEligibilityAcceptedTitles) ? selectionDiagnostics.finalEligibilityAcceptedTitles : [],
      middleGradesScoredCandidateAttribution: Array.isArray(selectionDiagnostics?.middleGradesScoredCandidateAttribution) ? selectionDiagnostics.middleGradesScoredCandidateAttribution : [],
      genericTasteSignalsRemovedByTitle: selectionDiagnostics?.genericTasteSignalsRemovedByTitle || {},
      genericOnlyTasteMatchTitles: Array.isArray(selectionDiagnostics?.genericOnlyTasteMatchTitles) ? selectionDiagnostics.genericOnlyTasteMatchTitles : [],
      documentBackedTasteSignalsByTitle: selectionDiagnostics?.documentBackedTasteSignalsByTitle || {},
      teenGoogleBooksMeaningfulTasteClassificationByTitle: (selectionDiagnostics?.teenGoogleBooksMeaningfulTasteClassificationByTitle || {}) as Record<string, string>,
      teenGoogleBooksMeaningfulTasteClassificationHistogram: (selectionDiagnostics?.teenGoogleBooksMeaningfulTasteClassificationHistogram || {}) as Record<string, number>,
      teenGoogleBooksNetMeaningfulAlignmentScoreByTitle: (selectionDiagnostics?.teenGoogleBooksNetMeaningfulAlignmentScoreByTitle || {}) as Record<string, number>,
      teenGoogleBooksDocumentNativeSpecificSignalsByTitle: (selectionDiagnostics?.teenGoogleBooksDocumentNativeSpecificSignalsByTitle || {}) as Record<string, string[]>,
      teenGoogleBooksQueryFamilyOnlySignalsByTitle: (selectionDiagnostics?.teenGoogleBooksQueryFamilyOnlySignalsByTitle || {}) as Record<string, string[]>,
      teenGoogleBooksCategoryOnlySignalsByTitle: (selectionDiagnostics?.teenGoogleBooksCategoryOnlySignalsByTitle || {}) as Record<string, string[]>,
      teenGoogleBooksGenreSignalsByTitle: (selectionDiagnostics?.teenGoogleBooksGenreSignalsByTitle || {}) as Record<string, string[]>,
      teenGoogleBooksWouldPassWithoutQueryDerivedEvidenceByTitle: (selectionDiagnostics?.teenGoogleBooksWouldPassWithoutQueryDerivedEvidenceByTitle || {}) as Record<string, boolean>,
      teenGoogleBooksTasteTierSelectionDecisionByTitle: (selectionDiagnostics?.teenGoogleBooksTasteTierSelectionDecisionByTitle || {}) as Record<string, string>,
      teenGoogleBooksTasteTierSelectionReasonByTitle: (selectionDiagnostics?.teenGoogleBooksTasteTierSelectionReasonByTitle || {}) as Record<string, string>,
      teenGoogleBooksWeakCandidateUsedForUnderfillByTitle: (selectionDiagnostics?.teenGoogleBooksWeakCandidateUsedForUnderfillByTitle || {}) as Record<string, boolean>,
      teenGoogleBooksStrongOrSecondaryAvailableCount: Number(selectionDiagnostics?.teenGoogleBooksStrongOrSecondaryAvailableCount || 0),
      teenGoogleBooksCounterfactualFinalTitles: Array.isArray(selectionDiagnostics?.teenGoogleBooksCounterfactualFinalTitles) ? selectionDiagnostics.teenGoogleBooksCounterfactualFinalTitles : [],
      teenGoogleBooksCounterfactualFinalCount: Number(selectionDiagnostics?.teenGoogleBooksCounterfactualFinalCount || 0),
      teenGoogleBooksCounterfactualUnderfill: Boolean(selectionDiagnostics?.teenGoogleBooksCounterfactualUnderfill),
      selectedGenericOnlyTasteMatchCount: Number(selectionDiagnostics?.selectedGenericOnlyTasteMatchCount || 0),
      zeroTasteCandidateRejectedTitles: Array.isArray(selectionDiagnostics?.zeroTasteCandidateRejectedTitles) ? selectionDiagnostics.zeroTasteCandidateRejectedTitles : [],
      broadAdventureOnlyRejectedTitles: Array.isArray(selectionDiagnostics?.broadAdventureOnlyRejectedTitles) ? selectionDiagnostics.broadAdventureOnlyRejectedTitles : [],
      meaningfulTasteEligibleTitles: Array.isArray(selectionDiagnostics?.meaningfulTasteEligibleTitles) ? selectionDiagnostics.meaningfulTasteEligibleTitles : [],
      underfilledBecauseOnlyWeakOrZeroTaste: Boolean(selectionDiagnostics?.underfilledBecauseOnlyWeakOrZeroTaste),
      emergencyFallbackUsedForZeroTasteFill: Boolean(selectionDiagnostics?.emergencyFallbackUsedForZeroTasteFill),
      middleGradesExpandedPoolHandoffFailed: middleGradesExpandedPoolHandoffFailedForReport,
      middleGradesExpandedPoolFailureReason: middleGradesExpandedPoolFailureReasonForReport,
      openLibraryArtifactSuppressedTitles: openLibrarySourceDiagnostics?.artifactSuppressedTitles || [],
      openLibrarySeriesSuppressedTitles: openLibrarySourceDiagnostics?.seriesSuppressedTitles || [],
      openLibrarySourceStatus: openLibrarySourceDiagnostics?.status || "",
      openLibrarySourceQueries: openLibrarySourceDiagnostics?.queries || [],
      openLibraryQueryRouting: openLibrarySourceDiagnostics?.openLibraryQueryRouting || {},
      openLibraryCrossSessionRepeatedTitles: Array.from(new Set(crossSessionRepeatedTitles)),
      openLibraryCrossSessionRepeatedRoots: Array.from(new Set(crossSessionRepeatedRoots)),
      openLibraryRecentHistoryTitleCount: history.titles.size,
      openLibraryRecentHistoryRootCount: history.titleRoots.size,
      sourceSkippedReason: diagnostics.sources.map((source) => source.skippedReason || source.failedReason || "").filter(Boolean),
      routerResultTracePresent: true,
      debugRouterVersion: "recommender-v2",
      engineVersion: v2Result.engineVersion,
      v2Diagnostics: diagnostics,
      v2TasteProfile: diagnostics.tasteProfile,
      v2SearchPlan: diagnostics.searchPlan,
      normalizedCount,
      normalizedDocsCount: normalizedDocsCountForReport,
      rankedDocsLength: rankedDocsLengthForReport,
      convertedDocsAvailableForScoringCount: convertedDocsAvailableForScoringCountForReport,
      scoredCandidateUniverseCount: scoredCandidateUniverseCountForReport,
      finalEligibilityCleanCandidateCount: finalEligibilityCleanCandidateCountForReport,
      viableCandidateCountBeforeFinalSelection: viableCandidateCountBeforeFinalSelectionForReport,
      finalAcceptedDocsLength: finalAcceptedDocsLengthForReport,
      candidateCount: normalizedCount,
      filteredCount: scoredCount,
      rankedCount: scoredCount,
      scoredCount,
      finalItemsLength: diagnosticReturnedItems.length,
      returnedItemsLength: diagnosticReturnedItems.length,
      renderedTopRecommendationsLength: normalizedItems.length,
      renderedTopRecommendationsTitles: normalizedItems.map((item) => item.kind === "open_library" ? item.doc.title : item.book.title).filter(Boolean),
      deckKey: inputWithHistory.deckKey,
      googleBooksAcceptedTitlesByStage,
      googleBooksRankedCandidateTitles: rankedCandidateTitles,
      googleBooksDroppedStage: dropped.droppedStage,
      googleBooksDroppedReason: dropped.droppedReason,
      googleBooksDroppedStageByTitle: droppedByTitle.droppedStageByTitle,
      googleBooksDroppedReasonByTitle: droppedByTitle.droppedReasonByTitle,
      googleBooksStageDecisionByTitle: renderedStageLineage.decisionByTitle,
      googleBooksStageReasonByTitle: renderedStageLineage.reasonByTitle,
      googleBooksStageGateByTitle: renderedStageLineage.gateByTitle,
      googleBooksStageOrder: selectionDiagnostics?.googleBooksStageOrder || [],
      googleBooksFinalEligibilityGateByTitle: selectionDiagnostics?.googleBooksFinalEligibilityGateByTitle || {},
      googleBooksWrapperInputTitles,
      googleBooksWrapperOutputTitles,
      googleBooksRendererInputTitles,
      googleBooksRendererOutputTitles,
      googleBooksPlaceholderReplacementReason: placeholderReplacementReason,
      googleBooksRejectedBeforeRankingReason: selectionDiagnostics?.googleBooksRejectedBeforeRankingReason || {},
      googleBooksPublicationShapeByTitle: { ...(googleBooksSourceDiagnostics?.googleBooksPublicationShapeByTitle || {}), ...(selectionDiagnostics?.googleBooksPublicationShapeByTitle || {}) },
      googleBooksNarrativeConfidenceByTitle: { ...(googleBooksSourceDiagnostics?.googleBooksNarrativeConfidenceByTitle || {}), ...(selectionDiagnostics?.googleBooksNarrativeConfidenceByTitle || {}) },
      googleBooksPublicationShapeEvidenceByTitle: { ...(googleBooksSourceDiagnostics?.googleBooksPublicationShapeEvidenceByTitle || {}), ...(selectionDiagnostics?.googleBooksPublicationShapeEvidenceByTitle || {}) },
      googleBooksNarrativePriorityAdjustmentByTitle: { ...(googleBooksSourceDiagnostics?.googleBooksNarrativePriorityAdjustmentByTitle || {}), ...(selectionDiagnostics?.googleBooksNarrativePriorityAdjustmentByTitle || {}) },
      googleBooksPublicationShapeRejectedBeforeRankingByTitle: { ...(googleBooksSourceDiagnostics?.googleBooksPublicationShapeRejectedBeforeRankingByTitle || {}), ...(selectionDiagnostics?.googleBooksPublicationShapeRejectedBeforeRankingByTitle || {}) },
      googleBooksDominantPublicationShapeEvidenceByTitle: { ...(googleBooksSourceDiagnostics?.googleBooksDominantPublicationShapeEvidenceByTitle || {}), ...(selectionDiagnostics?.googleBooksDominantPublicationShapeEvidenceByTitle || {}) },
      googleBooksOverriddenNarrativeEvidenceByTitle: { ...(googleBooksSourceDiagnostics?.googleBooksOverriddenNarrativeEvidenceByTitle || {}), ...(selectionDiagnostics?.googleBooksOverriddenNarrativeEvidenceByTitle || {}) },
      googleBooksPublicationShapePrecedenceDecisionByTitle: { ...(googleBooksSourceDiagnostics?.googleBooksPublicationShapePrecedenceDecisionByTitle || {}), ...(selectionDiagnostics?.googleBooksPublicationShapePrecedenceDecisionByTitle || {}) },
      googleBooksExplicitNonNarrativeIdentityByTitle: { ...(googleBooksSourceDiagnostics?.googleBooksExplicitNonNarrativeIdentityByTitle || {}), ...(selectionDiagnostics?.googleBooksExplicitNonNarrativeIdentityByTitle || {}) },
      googleBooksStoryLevelNarrativeEvidenceByTitle: { ...(googleBooksSourceDiagnostics?.googleBooksStoryLevelNarrativeEvidenceByTitle || {}), ...(selectionDiagnostics?.googleBooksStoryLevelNarrativeEvidenceByTitle || {}) },
      googleBooksGenericCategoryTitleByTitle: { ...(googleBooksSourceDiagnostics?.googleBooksGenericCategoryTitleByTitle || {}), ...(selectionDiagnostics?.googleBooksGenericCategoryTitleByTitle || {}) },
      googleBooksGenericCategoryEvidenceByTitle: { ...(googleBooksSourceDiagnostics?.googleBooksGenericCategoryEvidenceByTitle || {}), ...(selectionDiagnostics?.googleBooksGenericCategoryEvidenceByTitle || {}) },
      googleBooksGenericCategoryRejectedBeforeRankingByTitle: { ...(googleBooksSourceDiagnostics?.googleBooksGenericCategoryRejectedBeforeRankingByTitle || {}), ...(selectionDiagnostics?.googleBooksGenericCategoryRejectedBeforeRankingByTitle || {}) },
      googleBooksUnknownShapeEligibilityByTitle: { ...(googleBooksSourceDiagnostics?.googleBooksUnknownShapeEligibilityByTitle || {}), ...(selectionDiagnostics?.googleBooksUnknownShapeEligibilityByTitle || {}) },
      googleBooksUnknownShapeEvidenceByTitle: { ...(googleBooksSourceDiagnostics?.googleBooksUnknownShapeEvidenceByTitle || {}), ...(selectionDiagnostics?.googleBooksUnknownShapeEvidenceByTitle || {}) },
      googleBooksUnknownShapeRejectedReasonByTitle: { ...(googleBooksSourceDiagnostics?.googleBooksUnknownShapeRejectedReasonByTitle || {}), ...(selectionDiagnostics?.googleBooksUnknownShapeRejectedReasonByTitle || {}) },
      googleBooksUnknownStoryEvidenceCountByTitle: { ...(googleBooksSourceDiagnostics?.googleBooksUnknownStoryEvidenceCountByTitle || {}), ...(selectionDiagnostics?.googleBooksUnknownStoryEvidenceCountByTitle || {}) },
      googleBooksUnknownStoryEvidenceFamiliesByTitle: { ...(googleBooksSourceDiagnostics?.googleBooksUnknownStoryEvidenceFamiliesByTitle || {}), ...(selectionDiagnostics?.googleBooksUnknownStoryEvidenceFamiliesByTitle || {}) },
      googleBooksUnknownNarrativeCorroborationByTitle: { ...(googleBooksSourceDiagnostics?.googleBooksUnknownNarrativeCorroborationByTitle || {}), ...(selectionDiagnostics?.googleBooksUnknownNarrativeCorroborationByTitle || {}) },
      googleBooksUnknownEligibilityThresholdDecisionByTitle: { ...(googleBooksSourceDiagnostics?.googleBooksUnknownEligibilityThresholdDecisionByTitle || {}), ...(selectionDiagnostics?.googleBooksUnknownEligibilityThresholdDecisionByTitle || {}) },
      googleBooksSubjectOfStudyTitleByTitle: { ...(googleBooksSourceDiagnostics?.googleBooksSubjectOfStudyTitleByTitle || {}), ...(selectionDiagnostics?.googleBooksSubjectOfStudyTitleByTitle || {}) },
      googleBooksSubjectOfStudyEvidenceByTitle: { ...(googleBooksSourceDiagnostics?.googleBooksSubjectOfStudyEvidenceByTitle || {}), ...(selectionDiagnostics?.googleBooksSubjectOfStudyEvidenceByTitle || {}) },
      googleBooksSubjectOfStudyRejectedBeforeRankingByTitle: { ...(googleBooksSourceDiagnostics?.googleBooksSubjectOfStudyRejectedBeforeRankingByTitle || {}), ...(selectionDiagnostics?.googleBooksSubjectOfStudyRejectedBeforeRankingByTitle || {}) },
      googleBooksCuratedBookGuideIdentityByTitle: { ...(googleBooksSourceDiagnostics?.googleBooksCuratedBookGuideIdentityByTitle || {}), ...(selectionDiagnostics?.googleBooksCuratedBookGuideIdentityByTitle || {}) },
      googleBooksCuratedBookGuideEvidenceByTitle: { ...(googleBooksSourceDiagnostics?.googleBooksCuratedBookGuideEvidenceByTitle || {}), ...(selectionDiagnostics?.googleBooksCuratedBookGuideEvidenceByTitle || {}) },
      googleBooksPeriodicalIdentityEvidenceByTitle: { ...(googleBooksSourceDiagnostics?.googleBooksPeriodicalIdentityEvidenceByTitle || {}), ...(selectionDiagnostics?.googleBooksPeriodicalIdentityEvidenceByTitle || {}) },
      googleBooksPeriodicalIdentityDecisionByTitle: { ...(googleBooksSourceDiagnostics?.googleBooksPeriodicalIdentityDecisionByTitle || {}), ...(selectionDiagnostics?.googleBooksPeriodicalIdentityDecisionByTitle || {}) },
      googleBooksPublicationYearByTitle: googleBooksSourceDiagnostics?.googleBooksPublicationYearByTitle || {},
      googleBooksDescriptionPresentByTitle: googleBooksSourceDiagnostics?.googleBooksDescriptionPresentByTitle || {},
      googleBooksIsbnPresentByTitle: googleBooksSourceDiagnostics?.googleBooksIsbnPresentByTitle || {},
      googleBooksRatingsCountByTitle: googleBooksSourceDiagnostics?.googleBooksRatingsCountByTitle || {},
      googleBooksAudienceBandByTitle: { ...(googleBooksSourceDiagnostics?.googleBooksAudienceBandByTitle || {}), ...(selectionDiagnostics?.googleBooksAudienceBandByTitle || {}) },
      googleBooksContentMaturityByTitle: { ...(googleBooksSourceDiagnostics?.googleBooksContentMaturityByTitle || {}), ...(selectionDiagnostics?.googleBooksContentMaturityByTitle || {}) },
      googleBooksSourceMaturityRatingByTitle: { ...(googleBooksSourceDiagnostics?.googleBooksSourceMaturityRatingByTitle || {}), ...(selectionDiagnostics?.googleBooksSourceMaturityRatingByTitle || {}) },
      googleBooksRequestedDeckByTitle: (selectionDiagnostics?.googleBooksRequestedDeckByTitle || {}) as Record<string, string>,
      googleBooksAgeSuitabilityDecisionByTitle: (selectionDiagnostics?.googleBooksAgeSuitabilityDecisionByTitle || {}) as Record<string, string>,
      googleBooksMaturityDecisionByTitle: (selectionDiagnostics?.googleBooksMaturityDecisionByTitle || {}) as Record<string, string>,
      googleBooksAudienceMaturityComparisonByTitle: (selectionDiagnostics?.googleBooksAudienceMaturityComparisonByTitle || {}) as Record<string, unknown>,
      googleBooksAudienceMaturityMismatchTitles: (selectionDiagnostics?.googleBooksAudienceMaturityMismatchTitles || []) as string[],
      googleBooksAudienceMaturitySemanticChanges: (selectionDiagnostics?.googleBooksAudienceMaturitySemanticChanges || []) as string[],
      googleBooksQueryResultQualityByQuery: googleBooksSourceDiagnostics?.googleBooksQueryResultQualityByQuery || {},
      adultGoogleBooksQueryQualityByQuery: googleBooksSourceDiagnostics?.adultGoogleBooksQueryQualityByQuery || {},
      adultGoogleBooksPublicationShapeHistogramByQuery: googleBooksSourceDiagnostics?.adultGoogleBooksPublicationShapeHistogramByQuery || {},
      adultGoogleBooksRejectedShapeHistogramByQuery: googleBooksSourceDiagnostics?.adultGoogleBooksRejectedShapeHistogramByQuery || {},
      adultGoogleBooksNarrativeYieldByQuery: googleBooksSourceDiagnostics?.adultGoogleBooksNarrativeYieldByQuery || {},
      adultGoogleBooksNarrativeEfficiencyByQuery: googleBooksSourceDiagnostics?.adultGoogleBooksNarrativeEfficiencyByQuery || {},
      googleBooksModernNarrativeCountByQuery: googleBooksSourceDiagnostics?.googleBooksModernNarrativeCountByQuery || {},
      googleBooksPublicDomainCatalogShapeCountByQuery: googleBooksSourceDiagnostics?.googleBooksPublicDomainCatalogShapeCountByQuery || {},
      googleBooksFinalEligibilityDecisionByTitle: (selectionDiagnostics?.googleBooksFinalEligibilityDecisionByTitle || {}) as Record<string, string>,
      googleBooksFinalEligibilityReasonByTitle: gbEligibilityReasonByTitle,
      googleBooksFinalEligibilityEvidenceByTitle: (selectionDiagnostics?.googleBooksFinalEligibilityEvidenceByTitle || {}) as Record<string, string[]>,
      googleBooksPostRankingGateByTitle: (selectionDiagnostics?.googleBooksPostRankingGateByTitle || {}) as Record<string, string>,
      googleBooksPostRankingGateReasonByTitle: (selectionDiagnostics?.googleBooksPostRankingGateReasonByTitle || {}) as Record<string, string>,
      googleBooksFinalSelectionDecisionByTitle: gbSelectionDecisionByTitle,
      googleBooksFinalSelectionExclusionReasonByTitle: (selectionDiagnostics?.googleBooksFinalSelectionExclusionReasonByTitle || {}) as Record<string, string>,
      googleBooksCapDroppedTitles: (selectionDiagnostics?.googleBooksCapDroppedTitles || []) as string[],
      googleBooksAgeBandInfrastructureByDeck: (selectionDiagnostics?.googleBooksAgeBandInfrastructureByDeck || {}) as Record<string, unknown>,
      googleBooksAgeBandQueryPlanningByDeck: (selectionDiagnostics?.googleBooksAgeBandQueryPlanningByDeck || {}) as Record<string, unknown>,
      googleBooksAgeBandDispatchByDeck: (selectionDiagnostics?.googleBooksAgeBandDispatchByDeck || {}) as Record<string, unknown>,
      googleBooksAgeBandNormalizationByDeck: (selectionDiagnostics?.googleBooksAgeBandNormalizationByDeck || {}) as Record<string, unknown>,
      googleBooksAgeBandScoringHandoffByDeck: (selectionDiagnostics?.googleBooksAgeBandScoringHandoffByDeck || {}) as Record<string, unknown>,
      googleBooksAgeBandEligibilityHandoffByDeck: (selectionDiagnostics?.googleBooksAgeBandEligibilityHandoffByDeck || {}) as Record<string, unknown>,
      googleBooksAgeBandFinalSelectionHandoffByDeck: (selectionDiagnostics?.googleBooksAgeBandFinalSelectionHandoffByDeck || {}) as Record<string, unknown>,
      googleBooksAgeBandRenderedTitlesByDeck,
      googleBooksAgeBandDropStageByTitle: (selectionDiagnostics?.googleBooksAgeBandDropStageByTitle || {}) as Record<string, string>,
      googleBooksAgeBandDropReasonByTitle: (selectionDiagnostics?.googleBooksAgeBandDropReasonByTitle || {}) as Record<string, string>,
      googleBooksAgeBandInfrastructureGaps: (selectionDiagnostics?.googleBooksAgeBandInfrastructureGaps || {}) as Record<string, string[]>,
      googleBooksAgeBandInfrastructureSummary: (selectionDiagnostics?.googleBooksAgeBandInfrastructureSummary || {}) as Record<string, unknown>,
      preteenGoogleBooksPublicationIdentityByTitle: (selectionDiagnostics?.preteenGoogleBooksPublicationIdentityByTitle || {}) as Record<string, string>,
      preteenGoogleBooksPublicationIdentityConfidenceByTitle: (selectionDiagnostics?.preteenGoogleBooksPublicationIdentityConfidenceByTitle || {}) as Record<string, number>,
      preteenGoogleBooksPublicationIdentityEvidenceByTitle: (selectionDiagnostics?.preteenGoogleBooksPublicationIdentityEvidenceByTitle || {}) as Record<string, string[]>,
      preteenGoogleBooksPublicationNarrativeEvidenceByTitle: (selectionDiagnostics?.preteenGoogleBooksPublicationNarrativeEvidenceByTitle || {}) as Record<string, string[]>,
      preteenGoogleBooksPublicationArtifactEvidenceByTitle: (selectionDiagnostics?.preteenGoogleBooksPublicationArtifactEvidenceByTitle || {}) as Record<string, string[]>,
      preteenGoogleBooksPublicationNarrativeConfidenceSourceByTitle: (selectionDiagnostics?.preteenGoogleBooksPublicationNarrativeConfidenceSourceByTitle || {}) as Record<string, string[]>,
      preteenGoogleBooksPublicationTrustedFieldEvidenceByTitle: (selectionDiagnostics?.preteenGoogleBooksPublicationTrustedFieldEvidenceByTitle || {}) as Record<string, string[]>,
      preteenGoogleBooksPublicationOverriddenNarrativeEvidenceByTitle: (selectionDiagnostics?.preteenGoogleBooksPublicationOverriddenNarrativeEvidenceByTitle || {}) as Record<string, string[]>,
      preteenGoogleBooksPublicationDecisionByTitle: (selectionDiagnostics?.preteenGoogleBooksPublicationDecisionByTitle || {}) as Record<string, string>,
      preteenGoogleBooksPublicationReasonByTitle: (selectionDiagnostics?.preteenGoogleBooksPublicationReasonByTitle || {}) as Record<string, string>,
      preteenGoogleBooksPublicationRecommendedFuturePolicyByTitle: (selectionDiagnostics?.preteenGoogleBooksPublicationRecommendedFuturePolicyByTitle || {}) as Record<string, string>,
      preteenGoogleBooksPublicationRejectedTitles: (selectionDiagnostics?.preteenGoogleBooksPublicationRejectedTitles || []) as string[],
      preteenGoogleBooksPublicationAcceptedTitles: (selectionDiagnostics?.preteenGoogleBooksPublicationAcceptedTitles || []) as string[],
      preteenGoogleBooksPublicationShapeAuditByTitle: (googleBooksSourceDiagnostics?.preteenGoogleBooksPublicationShapeAuditByTitle || {}) as Record<string, unknown>,
      preteenGoogleBooksPublicationShapeRejectedTitles: (googleBooksSourceDiagnostics?.preteenGoogleBooksPublicationShapeRejectedTitles || []) as string[],
      preteenGoogleBooksPublicationShapeRejectedReasonByTitle: (googleBooksSourceDiagnostics?.preteenGoogleBooksPublicationShapeRejectedReasonByTitle || {}) as Record<string, string>,
      preteenGoogleBooksPublicationShapeNarrativeEvidenceByTitle: (googleBooksSourceDiagnostics?.preteenGoogleBooksPublicationShapeNarrativeEvidenceByTitle || {}) as Record<string, string[]>,
      preteenGoogleBooksPublicationShapeArtifactEvidenceByTitle: (googleBooksSourceDiagnostics?.preteenGoogleBooksPublicationShapeArtifactEvidenceByTitle || {}) as Record<string, string[]>,
      preteenGoogleBooksPublicationShapeCounterfactualDecisionByTitle: (googleBooksSourceDiagnostics?.preteenGoogleBooksPublicationShapeCounterfactualDecisionByTitle || {}) as Record<string, string>,
      preteenGoogleBooksPublicationShapeLikelyFalseRejectTitles: (googleBooksSourceDiagnostics?.preteenGoogleBooksPublicationShapeLikelyFalseRejectTitles || []) as string[],
      preteenGoogleBooksPublicationShapeLikelyCorrectRejectTitles: (googleBooksSourceDiagnostics?.preteenGoogleBooksPublicationShapeLikelyCorrectRejectTitles || []) as string[],
      preteenGoogleBooksPublicationShapeAmbiguousRejectTitles: (googleBooksSourceDiagnostics?.preteenGoogleBooksPublicationShapeAmbiguousRejectTitles || []) as string[],
      preteenGoogleBooksPublicationShapeFalseRejectHistogram: (googleBooksSourceDiagnostics?.preteenGoogleBooksPublicationShapeFalseRejectHistogram || {}) as Record<string, number>,
      preteenGoogleBooksPublicationShapeAuditSummary: (googleBooksSourceDiagnostics?.preteenGoogleBooksPublicationShapeAuditSummary || {}) as Record<string, unknown>,
      preteenGoogleBooksPublicationShapeRescueAppliedByTitle: (googleBooksSourceDiagnostics?.preteenGoogleBooksPublicationShapeRescueAppliedByTitle || {}) as Record<string, boolean>,
      preteenGoogleBooksPublicationShapeRescueReasonByTitle: (googleBooksSourceDiagnostics?.preteenGoogleBooksPublicationShapeRescueReasonByTitle || {}) as Record<string, string>,
      preteenGoogleBooksPublicationShapeRescueEvidenceByTitle: (googleBooksSourceDiagnostics?.preteenGoogleBooksPublicationShapeRescueEvidenceByTitle || {}) as Record<string, string[]>,
      preteenGoogleBooksPublicationShapeRescuedTitles: (googleBooksSourceDiagnostics?.preteenGoogleBooksPublicationShapeRescuedTitles || []) as string[],
      preteenGoogleBooksPublicationShapeRescueRejectedTitles: (googleBooksSourceDiagnostics?.preteenGoogleBooksPublicationShapeRescueRejectedTitles || []) as string[],
      preteenGoogleBooksPublicationShapeRescueRejectedReasonByTitle: (googleBooksSourceDiagnostics?.preteenGoogleBooksPublicationShapeRescueRejectedReasonByTitle || {}) as Record<string, string>,
      preteenGoogleBooksPublicationShapeRescueEnteredScoringTitles: (googleBooksSourceDiagnostics?.preteenGoogleBooksPublicationShapeRescueEnteredScoringTitles || []) as string[],
      preteenGoogleBooksPublicationShapeRescueSelectedTitles: (googleBooksSourceDiagnostics?.preteenGoogleBooksPublicationShapeRescueSelectedTitles || []) as string[],
      preteenGoogleBooksPublicationShapeRescueNotSelectedReasonByTitle: (googleBooksSourceDiagnostics?.preteenGoogleBooksPublicationShapeRescueNotSelectedReasonByTitle || {}) as Record<string, string>,
      preteenGoogleBooksPublicationShapeRescueSummary: (googleBooksSourceDiagnostics?.preteenGoogleBooksPublicationShapeRescueSummary || {}) as Record<string, unknown>,
      adultGoogleBooksCandidateTasteFamiliesByTitle: (selectionDiagnostics?.adultGoogleBooksCandidateTasteFamiliesByTitle || {}) as Record<string, string[]>,
      adultGoogleBooksProfileLikedFamilies: (selectionDiagnostics?.adultGoogleBooksProfileLikedFamilies || []) as string[],
      adultGoogleBooksProfileAvoidFamilies: (selectionDiagnostics?.adultGoogleBooksProfileAvoidFamilies || []) as string[],
      adultGoogleBooksNegativeNetTasteFamiliesByTitle: (selectionDiagnostics?.adultGoogleBooksNegativeNetTasteFamiliesByTitle || {}) as Record<string, string[]>,
      adultGoogleBooksTasteEvidenceSourceByTitle: (selectionDiagnostics?.adultGoogleBooksTasteEvidenceSourceByTitle || {}) as Record<string, string>,
      adultGoogleBooksMeaningfulAlignmentScoreByTitle: (selectionDiagnostics?.adultGoogleBooksMeaningfulAlignmentScoreByTitle || {}) as Record<string, number>,
      adultGoogleBooksMeaningfulAlignmentThresholdByTitle: (selectionDiagnostics?.adultGoogleBooksMeaningfulAlignmentThresholdByTitle || {}) as Record<string, string>,
      adultGoogleBooksCandidateDocumentSignalsByTitle: (selectionDiagnostics?.adultGoogleBooksCandidateDocumentSignalsByTitle || {}) as Record<string, { liked: string[]; disliked: string[] }>,
      adultGoogleBooksSpecificTasteEvidenceByTitle: (selectionDiagnostics?.adultGoogleBooksSpecificTasteEvidenceByTitle || {}) as Record<string, string[]>,
      adultGoogleBooksBroadToneEvidenceByTitle: (selectionDiagnostics?.adultGoogleBooksBroadToneEvidenceByTitle || {}) as Record<string, string[]>,
      adultGoogleBooksContextOnlyEvidenceByTitle: (selectionDiagnostics?.adultGoogleBooksContextOnlyEvidenceByTitle || {}) as Record<string, string[]>,
      adultGoogleBooksMeaningfulAlignmentRuleByTitle: (selectionDiagnostics?.adultGoogleBooksMeaningfulAlignmentRuleByTitle || {}) as Record<string, string>,
      adultGoogleBooksMeaningfulAlignmentDecisionByTitle: (selectionDiagnostics?.adultGoogleBooksMeaningfulAlignmentDecisionByTitle || {}) as Record<string, string>,
      adultGoogleBooksMeaningfulAlignmentOverrideByTitle: (selectionDiagnostics?.adultGoogleBooksMeaningfulAlignmentOverrideByTitle || {}) as Record<string, string>,
      adultGoogleBooksAvoidFamilyOverlapByTitle: (selectionDiagnostics?.adultGoogleBooksAvoidFamilyOverlapByTitle || {}) as Record<string, string[]>,
      adultGoogleBooksSignalMatchTraceByTitle: (selectionDiagnostics?.adultGoogleBooksSignalMatchTraceByTitle || {}) as Record<string, unknown[]>,
      adultGoogleBooksSignalMatchedFieldByTitle: (selectionDiagnostics?.adultGoogleBooksSignalMatchedFieldByTitle || {}) as Record<string, Record<string, string[]>>,
      adultGoogleBooksSignalMatchedTextByTitle: (selectionDiagnostics?.adultGoogleBooksSignalMatchedTextByTitle || {}) as Record<string, Record<string, string[]>>,
      adultGoogleBooksSignalMatchMethodByTitle: (selectionDiagnostics?.adultGoogleBooksSignalMatchMethodByTitle || {}) as Record<string, Record<string, string[]>>,
      adultGoogleBooksShortSignalSubstringMatchesByTitle: (selectionDiagnostics?.adultGoogleBooksShortSignalSubstringMatchesByTitle || {}) as Record<string, unknown[]>,
      adultGoogleBooksRejectedShortSignalMatchesByTitle: (selectionDiagnostics?.adultGoogleBooksRejectedShortSignalMatchesByTitle || {}) as Record<string, unknown[]>,
      adultGoogleBooksMeaningfulAlignmentFailureHistogram: (selectionDiagnostics?.adultGoogleBooksMeaningfulAlignmentFailureHistogram || {}) as Record<string, number>,
      adultGoogleBooksMeaningfulAlignmentFailurePercentages: (selectionDiagnostics?.adultGoogleBooksMeaningfulAlignmentFailurePercentages || {}) as Record<string, number>,
      adultGoogleBooksMeaningfulAlignmentFailureExamples: (selectionDiagnostics?.adultGoogleBooksMeaningfulAlignmentFailureExamples || {}) as Record<string, string[]>,
      adultGoogleBooksMeaningfulAlignmentFailureReasonByTitle: (selectionDiagnostics?.adultGoogleBooksMeaningfulAlignmentFailureReasonByTitle || {}) as Record<string, string>,
      adultGoogleBooksMeaningfulAlignmentFailureDetailsByTitle: (selectionDiagnostics?.adultGoogleBooksMeaningfulAlignmentFailureDetailsByTitle || {}) as Record<string, Record<string, unknown>>,
      adultGoogleBooksMeaningfulAlignmentRootCauseSummary: String(selectionDiagnostics?.adultGoogleBooksMeaningfulAlignmentRootCauseSummary || ""),
      adultGoogleBooksNarrativeDescriptionByTitle: (selectionDiagnostics?.adultGoogleBooksNarrativeDescriptionByTitle || {}) as Record<string, string>,
      adultGoogleBooksNarrativeSemanticPhrasesByTitle: (selectionDiagnostics?.adultGoogleBooksNarrativeSemanticPhrasesByTitle || {}) as Record<string, Record<string, unknown>>,
      adultGoogleBooksNarrativeFamilyMappingsByTitle: (selectionDiagnostics?.adultGoogleBooksNarrativeFamilyMappingsByTitle || {}) as Record<string, Record<string, unknown>>,
      adultGoogleBooksIgnoredNarrativePhrasesByTitle: (selectionDiagnostics?.adultGoogleBooksIgnoredNarrativePhrasesByTitle || {}) as Record<string, unknown[]>,
      adultGoogleBooksUnmappedNarrativeCuesByTitle: (selectionDiagnostics?.adultGoogleBooksUnmappedNarrativeCuesByTitle || {}) as Record<string, unknown[]>,
      adultGoogleBooksFutureAliasCandidatesByTitle: (selectionDiagnostics?.adultGoogleBooksFutureAliasCandidatesByTitle || {}) as Record<string, unknown[]>,
      adultGoogleBooksNarrativeParserConfidenceByTitle: (selectionDiagnostics?.adultGoogleBooksNarrativeParserConfidenceByTitle || {}) as Record<string, number>,
      adultGoogleBooksExpectedVsExtractedFamilyEvidenceByTitle: (selectionDiagnostics?.adultGoogleBooksExpectedVsExtractedFamilyEvidenceByTitle || {}) as Record<string, Record<string, unknown>>,
      adultGoogleBooksUnmappedNarrativePhraseHistogram: (selectionDiagnostics?.adultGoogleBooksUnmappedNarrativePhraseHistogram || {}) as Record<string, number>,
      adultGoogleBooksUnmappedNarrativeCueHistogramByFamily: (selectionDiagnostics?.adultGoogleBooksUnmappedNarrativeCueHistogramByFamily || {}) as Record<string, Record<string, number>>,
      adultGoogleBooksFutureAliasCandidateHistogram: (selectionDiagnostics?.adultGoogleBooksFutureAliasCandidateHistogram || {}) as Record<string, number>,
      adultGoogleBooksNarrativeFamilyExtractionExamplesByFamily: (selectionDiagnostics?.adultGoogleBooksNarrativeFamilyExtractionExamplesByFamily || {}) as Record<string, unknown[]>,
      adultGoogleBooksNarrativeFamilyExtractionRootCauseSummary: String(selectionDiagnostics?.adultGoogleBooksNarrativeFamilyExtractionRootCauseSummary || ""),
      adultGoogleBooksNarrativeCueClassificationByTitle: (selectionDiagnostics?.adultGoogleBooksNarrativeCueClassificationByTitle || {}) as Record<string, unknown[]>,
      adultGoogleBooksNarrativeCueClassificationHistogram: (selectionDiagnostics?.adultGoogleBooksNarrativeCueClassificationHistogram || {}) as Record<string, number>,
      adultGoogleBooksCanonicalCueMissingFamilyByTitle: (selectionDiagnostics?.adultGoogleBooksCanonicalCueMissingFamilyByTitle || {}) as Record<string, unknown[]>,
      adultGoogleBooksCanonicalCueMissingFamilyHistogram: (selectionDiagnostics?.adultGoogleBooksCanonicalCueMissingFamilyHistogram || {}) as Record<string, number>,
      adultGoogleBooksGenuineAliasCandidatesByTitle: (selectionDiagnostics?.adultGoogleBooksGenuineAliasCandidatesByTitle || {}) as Record<string, unknown[]>,
      adultGoogleBooksGenuineAliasCandidateHistogram: (selectionDiagnostics?.adultGoogleBooksGenuineAliasCandidateHistogram || {}) as Record<string, number>,
      adultGoogleBooksNarrativeCuePolarityOutcomeByTitle: (selectionDiagnostics?.adultGoogleBooksNarrativeCuePolarityOutcomeByTitle || {}) as Record<string, unknown[]>,
      adultGoogleBooksNarrativeCueFalseUnmappedSuppressedByTitle: (selectionDiagnostics?.adultGoogleBooksNarrativeCueFalseUnmappedSuppressedByTitle || {}) as Record<string, unknown[]>,
      adultGoogleBooksNarrativeExtractionDiagnosticSummary: String(selectionDiagnostics?.adultGoogleBooksNarrativeExtractionDiagnosticSummary || ""),
      adultGoogleBooksCanonicalNarrativeFamilyPromotionsByTitle: (selectionDiagnostics?.adultGoogleBooksCanonicalNarrativeFamilyPromotionsByTitle || {}) as Record<string, string[]>,
      adultGoogleBooksCanonicalNarrativeFamilyPromotionEvidenceByTitle: (selectionDiagnostics?.adultGoogleBooksCanonicalNarrativeFamilyPromotionEvidenceByTitle || {}) as Record<string, unknown[]>,
      adultGoogleBooksCanonicalNarrativeFamilyPromotionFieldByTitle: (selectionDiagnostics?.adultGoogleBooksCanonicalNarrativeFamilyPromotionFieldByTitle || {}) as Record<string, string[]>,
      adultGoogleBooksCanonicalNarrativeFamilyPromotionPhraseByTitle: (selectionDiagnostics?.adultGoogleBooksCanonicalNarrativeFamilyPromotionPhraseByTitle || {}) as Record<string, string[]>,
      adultGoogleBooksCanonicalNarrativeFamilyPromotionDecisionByTitle: (selectionDiagnostics?.adultGoogleBooksCanonicalNarrativeFamilyPromotionDecisionByTitle || {}) as Record<string, unknown[]>,
      adultGoogleBooksCanonicalMissingFamilyBeforeByTitle: (selectionDiagnostics?.adultGoogleBooksCanonicalMissingFamilyBeforeByTitle || {}) as Record<string, unknown[]>,
      adultGoogleBooksCanonicalMissingFamilyAfterByTitle: (selectionDiagnostics?.adultGoogleBooksCanonicalMissingFamilyAfterByTitle || {}) as Record<string, unknown[]>,
      adultGoogleBooksCanonicalMissingFamilyResolvedTitles: (selectionDiagnostics?.adultGoogleBooksCanonicalMissingFamilyResolvedTitles || []) as string[],
      adultGoogleBooksCanonicalMissingFamilyUnresolvedTitles: (selectionDiagnostics?.adultGoogleBooksCanonicalMissingFamilyUnresolvedTitles || []) as string[],
      adultGoogleBooksCanonicalNarrativeFamilyPromotionHistogram: (selectionDiagnostics?.adultGoogleBooksCanonicalNarrativeFamilyPromotionHistogram || {}) as Record<string, number>,
      adultGoogleBooksCanonicalNarrativeFamilyPromotionEligibilityChanges: (selectionDiagnostics?.adultGoogleBooksCanonicalNarrativeFamilyPromotionEligibilityChanges || {}) as Record<string, unknown>,
      adultGoogleBooksFinalSlateIdentityByTitle: (selectionDiagnostics?.adultGoogleBooksFinalSlateIdentityByTitle || {}) as Record<string, string>,
      adultGoogleBooksFinalSlateIdentityEvidenceByTitle: (selectionDiagnostics?.adultGoogleBooksFinalSlateIdentityEvidenceByTitle || {}) as Record<string, Record<string, string[]>>,
      adultGoogleBooksFinalSlateIdentityConfidenceByTitle: (selectionDiagnostics?.adultGoogleBooksFinalSlateIdentityConfidenceByTitle || {}) as Record<string, number>,
      adultGoogleBooksFinalSlateIdentityAgreementByTitle: (selectionDiagnostics?.adultGoogleBooksFinalSlateIdentityAgreementByTitle || {}) as Record<string, string>,
      adultGoogleBooksFinalSlateIdentityHistogram: (selectionDiagnostics?.adultGoogleBooksFinalSlateIdentityHistogram || {}) as Record<string, number>,
      adultGoogleBooksLikelyNonNarrativeFalseAcceptedTitles: (selectionDiagnostics?.adultGoogleBooksLikelyNonNarrativeFalseAcceptedTitles || []) as string[],
      adultGoogleBooksLikelyCollectionFalseAcceptedTitles: (selectionDiagnostics?.adultGoogleBooksLikelyCollectionFalseAcceptedTitles || []) as string[],
      adultGoogleBooksLikelyNarrativeFalseRejectedTitles: (selectionDiagnostics?.adultGoogleBooksLikelyNarrativeFalseRejectedTitles || []) as string[],
      adultGoogleBooksRenderedIdentityAudit: (selectionDiagnostics?.adultGoogleBooksRenderedIdentityAudit || {}) as Record<string, unknown>,
      adultGoogleBooksFinalSlateIdentityRootCauseHistogram: (selectionDiagnostics?.adultGoogleBooksFinalSlateIdentityRootCauseHistogram || {}) as Record<string, number>,
      adultGoogleBooksFinalSlateIdentityAuditSummary: String(selectionDiagnostics?.adultGoogleBooksFinalSlateIdentityAuditSummary || ""),
      adultGoogleBooksFinalSlateIdentityFlaggedDetailsByTitle: (selectionDiagnostics?.adultGoogleBooksFinalSlateIdentityFlaggedDetailsByTitle || {}) as Record<string, unknown>,
      adultGoogleBooksIdentityEnforcementDecisionByTitle: (selectionDiagnostics?.adultGoogleBooksIdentityEnforcementDecisionByTitle || {}) as Record<string, string>,
      adultGoogleBooksIdentityEnforcementReasonByTitle: (selectionDiagnostics?.adultGoogleBooksIdentityEnforcementReasonByTitle || {}) as Record<string, string>,
      adultGoogleBooksIdentityRejectedTitles: (selectionDiagnostics?.adultGoogleBooksIdentityRejectedTitles || []) as string[],
      adultGoogleBooksIdentityAcceptedTitles: (selectionDiagnostics?.adultGoogleBooksIdentityAcceptedTitles || []) as string[],
      adultGoogleBooksIdentityEnforcementHistogram: (selectionDiagnostics?.adultGoogleBooksIdentityEnforcementHistogram || {}) as Record<string, number>,
      adultGoogleBooksIdentityBehaviorChanges: (selectionDiagnostics?.adultGoogleBooksIdentityBehaviorChanges || {}) as Record<string, unknown>,
      adultGoogleBooksNarrativeStrengthScoreByTitle: (selectionDiagnostics?.adultGoogleBooksNarrativeStrengthScoreByTitle || {}) as Record<string, number>,
      adultGoogleBooksNarrativeStrengthComponentsByTitle: (selectionDiagnostics?.adultGoogleBooksNarrativeStrengthComponentsByTitle || {}) as Record<string, Record<string, number>>,
      adultGoogleBooksNarrativeStrengthEvidenceByTitle: (selectionDiagnostics?.adultGoogleBooksNarrativeStrengthEvidenceByTitle || {}) as Record<string, Record<string, string[]>>,
      adultGoogleBooksNarrativeStrengthSelectionScoreByTitle: (selectionDiagnostics?.adultGoogleBooksNarrativeStrengthSelectionScoreByTitle || {}) as Record<string, number>,
      adultGoogleBooksNarrativeStrengthRankBeforeByTitle: (selectionDiagnostics?.adultGoogleBooksNarrativeStrengthRankBeforeByTitle || {}) as Record<string, number>,
      adultGoogleBooksNarrativeStrengthRankAfterByTitle: (selectionDiagnostics?.adultGoogleBooksNarrativeStrengthRankAfterByTitle || {}) as Record<string, number>,
      adultGoogleBooksNarrativeStrengthRankDeltaByTitle: (selectionDiagnostics?.adultGoogleBooksNarrativeStrengthRankDeltaByTitle || {}) as Record<string, number>,
      adultGoogleBooksNarrativeStrengthAppliedTitles: (selectionDiagnostics?.adultGoogleBooksNarrativeStrengthAppliedTitles || []) as string[],
      adultGoogleBooksNarrativeStrengthRankingChanges: (selectionDiagnostics?.adultGoogleBooksNarrativeStrengthRankingChanges || {}) as Record<string, unknown>,
      adultTasteFamilyEvidenceBySwipe: tasteProfileDiagnostics.adultTasteFamilyEvidenceBySwipe || {},
      adultTastePositiveContributionBySwipe: tasteProfileDiagnostics.adultTastePositiveContributionBySwipe || {},
      adultTasteNegativeContributionBySwipe: tasteProfileDiagnostics.adultTasteNegativeContributionBySwipe || {},
      adultTasteFamilyContributionReasonBySwipe: tasteProfileDiagnostics.adultTasteFamilyContributionReasonBySwipe || {},
      adultTasteFamilySourceTagsBySwipe: tasteProfileDiagnostics.adultTasteFamilySourceTagsBySwipe || {},
      adultTasteFamilyPositiveWeight: tasteProfileDiagnostics.adultTasteFamilyPositiveWeight || {},
      adultTasteFamilyNegativeWeight: tasteProfileDiagnostics.adultTasteFamilyNegativeWeight || {},
      adultTasteFamilyNetWeight: tasteProfileDiagnostics.adultTasteFamilyNetWeight || {},
      adultTasteFamilyPositiveCount: tasteProfileDiagnostics.adultTasteFamilyPositiveCount || {},
      adultTasteFamilyNegativeCount: tasteProfileDiagnostics.adultTasteFamilyNegativeCount || {},
      adultTasteFamilyLikedTitles: tasteProfileDiagnostics.adultTasteFamilyLikedTitles || {},
      adultTasteFamilyDislikedTitles: tasteProfileDiagnostics.adultTasteFamilyDislikedTitles || {},
      adultTasteFamilySkippedTitles: tasteProfileDiagnostics.adultTasteFamilySkippedTitles || {},
      adultTasteSkippedTitlesExcludedFromPolarity: tasteProfileDiagnostics.adultTasteSkippedTitlesExcludedFromPolarity || [],
      adultTasteFamilyPolarityDecision: tasteProfileDiagnostics.adultTasteFamilyPolarityDecision || {},
      adultTasteFamilyPolarityReason: tasteProfileDiagnostics.adultTasteFamilyPolarityReason || {},
      adultTasteOverlappingFamilies: tasteProfileDiagnostics.adultTasteOverlappingFamilies || [],
      adultTasteOverlapEvidenceByFamily: tasteProfileDiagnostics.adultTasteOverlapEvidenceByFamily || {},
      adultTasteOverlapCurrentResolutionByFamily: tasteProfileDiagnostics.adultTasteOverlapCurrentResolutionByFamily || {},
      adultTasteOverlapAffectedCandidateTitlesByFamily: (selectionDiagnostics?.adultTasteOverlapAffectedCandidateTitlesByFamily || {}) as Record<string, string[]>,
      adultTasteWeightedLikedFamilies: tasteProfileDiagnostics.adultTasteWeightedLikedFamilies || [],
      adultTasteWeightedAvoidFamilies: tasteProfileDiagnostics.adultTasteWeightedAvoidFamilies || [],
      adultTasteWeightedMixedFamilies: tasteProfileDiagnostics.adultTasteWeightedMixedFamilies || [],
      adultTasteWeightedPolarityByFamily: tasteProfileDiagnostics.adultTasteWeightedPolarityByFamily || {},
      adultTasteWeightedChangedFamilies: tasteProfileDiagnostics.adultTasteWeightedChangedFamilies || [],
      adultTasteProductionPolarityByFamily: tasteProfileDiagnostics.adultTasteProductionPolarityByFamily || {},
      adultTasteProductionPolarityResolutionReasonByFamily: tasteProfileDiagnostics.adultTasteProductionPolarityResolutionReasonByFamily || {},
      adultTasteProductionPolarityExplanationByFamily: tasteProfileDiagnostics.adultTasteProductionPolarityExplanationByFamily || {},
      adultTasteMixedFamilyProductionExplanationByFamily: tasteProfileDiagnostics.adultTasteMixedFamilyProductionExplanationByFamily || {},
      adultTasteProductionPolarityRuleHistogram: tasteProfileDiagnostics.adultTasteProductionPolarityRuleHistogram || {},
      adultTasteMixedFamilyProductionRuleHistogram: tasteProfileDiagnostics.adultTasteMixedFamilyProductionRuleHistogram || {},
      adultTasteProductionLikedFamilies: tasteProfileDiagnostics.adultTasteProductionLikedFamilies || [],
      adultTasteProductionAvoidFamilies: tasteProfileDiagnostics.adultTasteProductionAvoidFamilies || [],
      adultTasteProductionMixedPositiveFamilies: tasteProfileDiagnostics.adultTasteProductionMixedPositiveFamilies || [],
      adultTasteProductionMixedNeutralFamilies: tasteProfileDiagnostics.adultTasteProductionMixedNeutralFamilies || [],
      adultTasteProductionMixedNegativeFamilies: tasteProfileDiagnostics.adultTasteProductionMixedNegativeFamilies || [],
      adultTasteSkippedSignalsRemovedFromProductionProfile: tasteProfileDiagnostics.adultTasteSkippedSignalsRemovedFromProductionProfile || [],
      adultTasteWeightedModelConstants: tasteProfileDiagnostics.adultTasteWeightedModelConstants || {},
      adultTasteWeightedModelEnabledForSelection: Boolean(tasteProfileDiagnostics.adultTasteWeightedModelEnabledForSelection),
      adultTasteWeightedCounterfactualCandidateDecisionByTitle: (selectionDiagnostics?.adultTasteWeightedCounterfactualCandidateDecisionByTitle || {}) as Record<string, Record<string, unknown>>,
      adultTasteWeightedCounterfactualNewPassTitles: (selectionDiagnostics?.adultTasteWeightedCounterfactualNewPassTitles || []) as string[],
      adultTasteWeightedCounterfactualNewFailTitles: (selectionDiagnostics?.adultTasteWeightedCounterfactualNewFailTitles || []) as string[],
      adultTasteWeightedProductionDecisionReasonByTitle: (selectionDiagnostics?.adultTasteWeightedProductionDecisionReasonByTitle || {}) as Record<string, string>,
      adultTasteWeightedProductionNewPassTitles: (selectionDiagnostics?.adultTasteWeightedProductionNewPassTitles || []) as string[],
      adultTasteWeightedProductionNewFailTitles: (selectionDiagnostics?.adultTasteWeightedProductionNewFailTitles || []) as string[],
      adultGoogleBooksProductionNonPositiveFamilyPresenceRuleHistogram: (selectionDiagnostics?.adultGoogleBooksProductionNonPositiveFamilyPresenceRuleHistogram || {}) as Record<string, number>,
      adultGoogleBooksProductionNonPositiveFamilyPresenceCandidatesByRule: (selectionDiagnostics?.adultGoogleBooksProductionNonPositiveFamilyPresenceCandidatesByRule || {}) as Record<string, string[]>,
      adultGoogleBooksProductionNonPositiveFamilyPresenceFamiliesByTitle: (selectionDiagnostics?.adultGoogleBooksProductionNonPositiveFamilyPresenceFamiliesByTitle || {}) as Record<string, string[]>,
      adultGoogleBooksProductionNonPositiveFamilyPresenceDetailsByTitle: (selectionDiagnostics?.adultGoogleBooksProductionNonPositiveFamilyPresenceDetailsByTitle || {}) as Record<string, unknown[]>,
      adultGoogleBooksProductionSuppressionDiagnosticsDeprecated: String(selectionDiagnostics?.adultGoogleBooksProductionSuppressionDiagnosticsDeprecated || ""),
      adultGoogleBooksFamilyPolarityEffectByTitle: (selectionDiagnostics?.adultGoogleBooksFamilyPolarityEffectByTitle || {}) as Record<string, unknown[]>,
      adultGoogleBooksFamilyPolarityEffectHistogram: (selectionDiagnostics?.adultGoogleBooksFamilyPolarityEffectHistogram || {}) as Record<string, number>,
      adultGoogleBooksFamilyPositiveSupportSuppressedByTitle: (selectionDiagnostics?.adultGoogleBooksFamilyPositiveSupportSuppressedByTitle || {}) as Record<string, unknown[]>,
      adultGoogleBooksPolarityNondecisiveEffectsByTitle: (selectionDiagnostics?.adultGoogleBooksPolarityNondecisiveEffectsByTitle || {}) as Record<string, unknown[]>,
      adultGoogleBooksPolarityDecisiveRejectionByTitle: (selectionDiagnostics?.adultGoogleBooksPolarityDecisiveRejectionByTitle || {}) as Record<string, unknown>,
      adultGoogleBooksPolarityMultiFactorRejectionByTitle: (selectionDiagnostics?.adultGoogleBooksPolarityMultiFactorRejectionByTitle || {}) as Record<string, unknown>,
      adultGoogleBooksPolarityUnrelatedRejectionByTitle: (selectionDiagnostics?.adultGoogleBooksPolarityUnrelatedRejectionByTitle || {}) as Record<string, unknown>,
      adultGoogleBooksPolarityCausalityStateByTitle: (selectionDiagnostics?.adultGoogleBooksPolarityCausalityStateByTitle || {}) as Record<string, string>,
      adultGoogleBooksPolarityCausalityHistogram: (selectionDiagnostics?.adultGoogleBooksPolarityCausalityHistogram || {}) as Record<string, number>,
      adultGoogleBooksPolarityCounterfactualsByTitle: (selectionDiagnostics?.adultGoogleBooksPolarityCounterfactualsByTitle || {}) as Record<string, unknown[]>,
      adultGoogleBooksPolarityCounterfactualPassTitles: (selectionDiagnostics?.adultGoogleBooksPolarityCounterfactualPassTitles || []) as string[],
      adultGoogleBooksPolarityCounterfactualStillFailTitles: (selectionDiagnostics?.adultGoogleBooksPolarityCounterfactualStillFailTitles || []) as string[],
      adultGoogleBooksPolarityDecisiveRuleHistogram: (selectionDiagnostics?.adultGoogleBooksPolarityDecisiveRuleHistogram || {}) as Record<string, number>,
    };
  }

  function applyMiddleGradesFinalPayloadGuard(payload: any, inputForGuard: RecommenderInput) {
    const inputTitles = Array.isArray(payload?.returnedItemsTitles)
      ? payload.returnedItemsTitles.map((title: any) => String(title || "").trim()).filter(Boolean)
      : Array.isArray(payload?.items)
      ? payload.items.map((item: any) => String(item?.doc?.title || item?.title || "").trim()).filter(Boolean)
      : [];
    const returnedLength = Number(payload?.returnedItemsLength ?? inputTitles.length ?? 0);
    const sourceLooksOpenLibrary =
      Boolean(sourceEnabled?.openLibrary) ||
      Boolean(payload?.sourceFetchAttemptedBySource?.openLibrary) ||
      Number(payload?.debugSourceStats?.openLibrary?.rawFetched || 0) > 0 ||
      Number(payload?.debugSourceStats?.openLibrary?.finalSelected || 0) > 0 ||
      Number(payload?.sourceRawCountBySource?.openLibrary || 0) > 0 ||
      (Array.isArray(payload?.items) && payload.items.some((item: any) => String(item?.doc?.source || item?.source || "").toLowerCase().includes("openlibrary")));
    const scoredUniverseCount = Number(payload?.scoredCandidateUniverseCount ?? payload?.mainScoringPipelineScoredCandidateUniverseCount ?? 0);
    const convertedForScoringCount = Number(payload?.convertedDocsAvailableForScoringCount ?? payload?.mainScoringPipelineConvertedDocsAvailableForScoringCount ?? 0);
    const finalAcceptedCount = Number(payload?.finalAcceptedDocsLength ?? payload?.finalRecommenderAcceptedDocsLength ?? 0);
    const finalEligibilityCleanCount = Number(payload?.finalEligibilityCleanCandidateCount ?? 0);
    const viableCandidateCount = Number(payload?.viableCandidateCountBeforeFinalSelection ?? 0);
    const shouldBlock =
      inputForGuard.deckKey === "36" &&
      sourceLooksOpenLibrary &&
      returnedLength > 0 &&
      scoredUniverseCount === 0 &&
      convertedForScoringCount === 0 &&
      finalAcceptedCount === 0 &&
      finalEligibilityCleanCount === 0 &&
      viableCandidateCount === 0;
    if (!shouldBlock) {
      return {
        ...(payload || {}),
        finalPayloadGuardRan: true,
        finalPayloadGuardBlockedUnscoredOpenLibrary: false,
        finalPayloadGuardInputReturnedTitles: inputTitles,
        finalPayloadGuardOutputReturnedTitles: inputTitles,
        finalPayloadGuardAppliedAfterWrapper: true,
      };
    }
    return {
      ...(payload || {}),
      items: [],
      returnedItemsBuiltFrom: "open_library_source_emergency_bypass",
      returnedItemsLength: 0,
      returnedItemsTitles: "",
      finalItemsLength: 0,
      countContractSatisfied: false,
      lockQualityPass: false,
      openLibrarySourceEmergencyBypassFailure: true,
      openLibrarySourceFinalBypassRemovedTitles: inputTitles,
      emergencyBypassReason: "final_payload_unscored_openlibrary_items_blocked",
      finalPayloadGuardRan: true,
      finalPayloadGuardBlockedUnscoredOpenLibrary: true,
      finalPayloadGuardInputReturnedTitles: inputTitles,
      finalPayloadGuardOutputReturnedTitles: [],
      finalPayloadGuardAppliedAfterWrapper: true,
    };
  }

  async function performRecommendationRun(input: RecommenderInput) {
    const markPhase = (phase: string, extra?: Record<string, any>) => {
      const timestamp = new Date().toISOString();
      const entry = { phase, timestamp, ...(extra || {}) };
      setRecommendFunctionErrorPhase(phase);
      setLastKnownFetchPhase(phase);
      setPhaseHistory((prev) => [...prev, entry].slice(-80));
      try {
        const globalHistory = Array.isArray((globalThis as any).__novelIdeasRouterPhaseHistory)
          ? (globalThis as any).__novelIdeasRouterPhaseHistory
          : [];
        globalHistory.push(entry);
        (globalThis as any).__novelIdeasRouterPhaseHistory = globalHistory.slice(-200);
      } catch {
        // diagnostics only
      }
    };
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
    setRecommendationStartedAt(new Date().toISOString());
    setRecommendationTimedOutAt("");
    setLastKnownBuiltQuery("");
    setLastKnownFetchPhase("starting");
    setQueryBuildStatus("not_started");
    setPhaseHistory([]);
    const runId = `rec-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    setCurrentRecommendationRunId(runId);
    setActiveRecommendationRunId(runId);
    setRecommendationLockState(recLoading ? "already_loading" : "acquired");

    try {
        (globalThis as any).__novelIdeasRouterPhaseHistory = [];
      } catch {
        // diagnostics only
      }
      try {
        markPhase("v2_before_engine_call");
        const v2Signals = swipeHistoryToV2Signals(Array.isArray((inputWithHistory as any)?.swipeHistory) ? ((inputWithHistory as any).swipeHistory as SwipeHistoryEntry[]) : swipeHistory);
        const ageBand = deckKeyToAgeBandV2(deckKey);
        const middleGradesDeepDebugDiagnostics = middleGradesDeepDebugDiagnosticsForSession(ageBand, middleGradesDeepDebugUiEnabled);
        const result = await runRecommenderV2({
          requestId: `normal-ui-v2-${Date.now()}`,
          ageBand,
          limit: inputWithHistory.limit || 10,
          enabledSources: {
            mock: false,
            googleBooks: sourceEnabled.googleBooks,
            openLibrary: sourceEnabled.openLibrary,
            localLibrary: sourceEnabled.localLibrary,
            kitsu: sourceEnabled.kitsu,
            comicVine: sourceEnabled.comicVine,
            nyt: sourceEnabled.nyt,
          },
          signals: v2Signals,
          deckKey,
          diagnostics: middleGradesDeepDebugDiagnostics,
        });
        markPhase("v2_after_engine_call", { selected: result.items.length });
        setV2DebugResult(result);
        setV2DebugError("");
        const normalizedItems = normalizeRecommenderV2Items(result.items);
        const diagnosticResult = applyMiddleGradesFinalPayloadGuard(
          buildV2RecommendationResultForDiagnostics(result, normalizedItems, inputWithHistory),
          inputWithHistory
        );
        const builtQuery = String(diagnosticResult.builtFromQuery || "");
        setRecQuery(builtQuery);
        setLastKnownBuiltQuery(builtQuery);
        setQueryBuildStatus(builtQuery ? "query_available" : "query_unavailable");
        setRecEngineLabel("Recommender V2");
        setLastEngineActuallyUsed("v2");
        setLastSourceCounts((diagnosticResult as any).debugSourceStats || null);
        setLastCandidatePool(Array.isArray((diagnosticResult as any).debugCandidatePool) ? (diagnosticResult as any).debugCandidatePool : []);
        setLastRawPool(Array.isArray((diagnosticResult as any).debugRawPool) ? (diagnosticResult as any).debugRawPool : []);
        setLastRungStats(null);
        setLastFilterAudit([]);
        setLastFilterAuditSummary(null);
        setLastFinalRecommenderDebug({ engine: "v2", rejectedReasons: result.diagnostics.rejectedReasons, finalSelectionTitles: result.diagnostics.finalSelectionTitles });
        setLastSourceEnabled(sourceEnabled);
        setLastSourceSkippedReason(Array.isArray((diagnosticResult as any).sourceSkippedReason) ? (diagnosticResult as any).sourceSkippedReason : []);
        setLastDebugRouterVersion("recommender-v2");
        setLastRouterResultTracePresent(true);
        setLastRouterResultKeys(Object.keys(diagnosticResult));
        setLastDeploymentRuntimeMarker("recommender-v2");
        const v2ComicVineSourceDiagnostics = result.diagnostics.sources.find((source) => source.source === "comicVine") as any;
        const v2ComicVineFetchDiagnostics = Array.isArray(v2ComicVineSourceDiagnostics?.fetches) ? v2ComicVineSourceDiagnostics.fetches : [];
        const v2ComicVineQueriesAttempted = v2ComicVineFetchDiagnostics.map((fetch: any) => String(fetch?.query || "")).filter(Boolean);
        setLastDebugGcdDispatchTrace({
          traceSource: "v2_source_diagnostics_authoritative",
          sourceEnabledComicVine: Boolean(sourceEnabled?.comicVine),
          comicVineEnabledAtRequestStart: Boolean(sourceEnabled?.comicVine),
          comicVineShouldUseResult: Boolean(sourceEnabled?.comicVine),
          comicVineDispatchPlanned: Boolean(v2ComicVineSourceDiagnostics?.planned),
          comicVineDispatchAttempted: Boolean(v2ComicVineSourceDiagnostics?.attempted),
          comicVineDispatchSkippedReason: String(v2ComicVineSourceDiagnostics?.skippedReason || ""),
          comicVineQueriesPlanned: Array.isArray(result?.diagnostics?.searchPlan?.sourcePlans)
            ? (result.diagnostics.searchPlan.sourcePlans.find((sourcePlan: any) => sourcePlan?.source === "comicVine")?.intents || []).map((intent: any) => String(intent?.query || "")).filter(Boolean)
            : [],
          comicVineQueriesAttempted: v2ComicVineQueriesAttempted,
          comicVineFetchStartedAt: String(v2ComicVineSourceDiagnostics?.startedAt || "") || null,
          comicVineFetchFinishedAt: String(v2ComicVineSourceDiagnostics?.finishedAt || "") || null,
          comicVineFetchTimedOut: Boolean(v2ComicVineSourceDiagnostics?.timedOut),
          comicVineRawCountByQuery: Object.fromEntries(v2ComicVineFetchDiagnostics.map((fetch: any) => [String(fetch?.query || ""), Number(fetch?.rawRetrieved || fetch?.docsReturned || 0)])),
          comicVineDocCountByQuery: Object.fromEntries(v2ComicVineFetchDiagnostics.map((fetch: any) => [String(fetch?.query || ""), Number(fetch?.docsReturned || 0)])),
          comicVineCandidateCountByQuery: Object.fromEntries(v2ComicVineFetchDiagnostics.map((fetch: any) => [String(fetch?.query || ""), Number(fetch?.rawRetrieved || 0)])),
          comicVineDispatchStageDiagnostics: v2ComicVineFetchDiagnostics.map((fetch: any, laneIndex: number) => ({
            laneIndex,
            query: String(fetch?.query || ""),
            stage: "v2_source_fetch",
            planned: true,
            attempted: true,
            startedAt: String(fetch?.fetchStartedAt || "") || null,
            finishedAt: String(fetch?.fetchFinishedAt || "") || null,
            timedOut: Boolean(fetch?.timedOut),
            status: String(fetch?.status || "unknown"),
            rawCount: Number(fetch?.rawRetrieved || 0),
            docCount: Number(fetch?.docsReturned || 0),
            candidateCount: Number(fetch?.rawRetrieved || 0),
            error: String(fetch?.failedReason || "") || null,
            skippedReason: "",
            finalRequestUrl: String(fetch?.finalRequestUrl || "") || null,
            responseContentType: String(fetch?.responseContentType || "") || null,
            proxyResponseShape: String(fetch?.proxyResponseShape || "") || null,
            thrownErrorName: String(fetch?.thrownErrorName || "") || null,
            thrownErrorMessage: String(fetch?.thrownErrorMessage || "") || null,
          })),
          comicVineFinalRequestUrlByQuery: Object.fromEntries(v2ComicVineFetchDiagnostics.map((fetch: any) => [String(fetch?.query || ""), String(fetch?.finalRequestUrl || "")])),
          comicVineThrownErrorNameByQuery: Object.fromEntries(v2ComicVineFetchDiagnostics.map((fetch: any) => [String(fetch?.query || ""), String(fetch?.thrownErrorName || "")])),
          comicVineThrownErrorMessageByQuery: Object.fromEntries(v2ComicVineFetchDiagnostics.map((fetch: any) => [String(fetch?.query || ""), String(fetch?.thrownErrorMessage || "")])),
          comicVineResponseContentTypeByQuery: Object.fromEntries(v2ComicVineFetchDiagnostics.map((fetch: any) => [String(fetch?.query || ""), String(fetch?.responseContentType || "")])),
          comicVineResponseShapeByQuery: Object.fromEntries(v2ComicVineFetchDiagnostics.map((fetch: any) => [String(fetch?.query || ""), String(fetch?.proxyResponseShape || "")])),
          comicVineProxyUrl: String(v2ComicVineFetchDiagnostics[0]?.configuredProxyUrl || ""),
          normalizedComicVineProxyUrl: String(v2ComicVineFetchDiagnostics[0]?.normalizedProxyUrl || ""),
          comicVineProxyConfigured: Boolean(v2ComicVineFetchDiagnostics[0]?.normalizedProxyUrl),
          comicVineProxyHealthStatus: v2ComicVineSourceDiagnostics?.status === "succeeded" ? "ok" : v2ComicVineSourceDiagnostics?.status === "failed" ? "failed" : "unknown",
          comicVineProxyErrorBody: String(v2ComicVineFetchDiagnostics.find((fetch: any) => String(fetch?.failedReason || "").length > 0)?.responseBodyPrefix || ""),
          v1ComicVineDispatchTraceDeprecatedInV2: true,
          sourceDiagnostics: result.diagnostics.sources,
        } as any);
        setLastRecommendationInput(inputWithHistory);
        setLastRecommendationResult(diagnosticResult as any);
        setLastRecommendationTimestamp(new Date().toISOString());
        setLastRecommendationSwipeSummary(`Right:${rightSwipes} â€¢ Left:${leftSwipes} â€¢ Skip:${downSwipes} â€¢ Decisions:${decisionSwipes} â€¢ 20Q:${resolvedTwentyQCount}/${twentyQObjectives.length}`);
        setRecommendFunctionReturned(true);
        const guardedNormalizedItems = Array.isArray((diagnosticResult as any).items) && (diagnosticResult as any).items.length === 0
          ? []
          : normalizedItems;
        const rendererTitles = googleBooksTitlesFromRecItems(guardedNormalizedItems);
        const stageTitles = harmonizeGoogleBooksStageLineage({
          ...(((diagnosticResult as any).googleBooksAcceptedTitlesByStage || {}) as Record<string, string[]>),
          rendererInput: rendererTitles,
          rendererOutput: rendererTitles,
          renderedRecommendations: rendererTitles,
        });
        const dropped = computeGoogleBooksDropDiagnostics(stageTitles);
        const gbEligibilityReasonMap = ((diagnosticResult as any).googleBooksFinalEligibilityReasonByTitle || {}) as Record<string, string>;
        const gbSelectionDecisionMap = ((diagnosticResult as any).googleBooksFinalSelectionDecisionByTitle || {}) as Record<string, string>;
        const gbRejectedBeforeRankingMap = ((diagnosticResult as any).googleBooksRejectedBeforeRankingReason || {}) as Record<string, string>;
        const droppedByTitle = computeGoogleBooksDropDiagnosticsByTitle(stageTitles, gbEligibilityReasonMap, gbSelectionDecisionMap, gbRejectedBeforeRankingMap);
        (diagnosticResult as any).googleBooksAcceptedTitlesByStage = stageTitles;
        (diagnosticResult as any).googleBooksRendererInputTitles = rendererTitles;
        (diagnosticResult as any).googleBooksRendererOutputTitles = rendererTitles;
        (diagnosticResult as any).googleBooksDroppedStage = dropped.droppedStage;
        (diagnosticResult as any).googleBooksDroppedReason = dropped.droppedReason;
        (diagnosticResult as any).googleBooksDroppedStageByTitle = droppedByTitle.droppedStageByTitle;
        (diagnosticResult as any).googleBooksDroppedReasonByTitle = droppedByTitle.droppedReasonByTitle;
        const renderedStageLineage = applyGoogleBooksRenderingStageLineage(
          ((diagnosticResult as any).googleBooksStageDecisionByTitle || {}) as Record<string, Record<string, string>>,
          ((diagnosticResult as any).googleBooksStageReasonByTitle || {}) as Record<string, Record<string, string>>,
          ((diagnosticResult as any).googleBooksStageGateByTitle || {}) as Record<string, Record<string, string>>,
          rendererTitles,
        );
        (diagnosticResult as any).googleBooksStageDecisionByTitle = renderedStageLineage.decisionByTitle;
        (diagnosticResult as any).googleBooksStageReasonByTitle = renderedStageLineage.reasonByTitle;
        (diagnosticResult as any).googleBooksStageGateByTitle = renderedStageLineage.gateByTitle;
        (diagnosticResult as any).renderedTopRecommendationsLength = guardedNormalizedItems.length;
        (diagnosticResult as any).renderedTopRecommendationsTitles = guardedNormalizedItems.map((item) => item.kind === "open_library" ? item.doc.title : item.book.title).filter(Boolean);
        if (guardedNormalizedItems.length > 0) {
          rememberRecommendations(input.deckKey, guardedNormalizedItems);
          setRecommendationResultWasPersisted(true);
          setRecItems(guardedNormalizedItems);
          setRecError(null);
        } else {
          setRecItems([]);
          setRecError("No V2 matches found for this swipe session. Diagnostics are available for comparison.");
        }
      } catch (err: any) {
        markPhase("v2_engine_rejected", { error: String(err?.message || err || "unknown") });
        setLastEngineActuallyUsed("v2");
        setV2DebugError(String(err?.message || err || "recommender_v2_failed"));
        setRecommendFunctionReturned(false);
        setRecommendFunctionError(String(err?.message || err || "recommender_v2_failed"));
        setRecommendFunctionErrorStack(String(err?.stack || ""));
        setRecItems([]);
        setRecError(err?.message || "Recommender V2 could not be reached.");
      } finally {
        setRecommendationLockState("released");
        setRecLoading(false);
      }
  }


  async function runRecommenderV2DebugFromCurrentSession(trigger: "button" | "url" = "button") {
    setV2DebugLoading(true);
    setV2DebugError("");
    try {
      const ageBand = deckKeyToAgeBandV2(deckKey);
      const middleGradesDeepDebugDiagnostics = middleGradesDeepDebugDiagnosticsForSession(ageBand, middleGradesDeepDebugUiEnabled);
      const result = await runRecommenderV2({
        requestId: `live-ui-${trigger}-${Date.now()}`,
        ageBand,
        limit: 5,
        enabledSources: {
          mock: false,
          googleBooks: sourceEnabled.googleBooks,
          openLibrary: sourceEnabled.openLibrary,
          localLibrary: sourceEnabled.localLibrary,
          kitsu: sourceEnabled.kitsu,
          comicVine: sourceEnabled.comicVine,
          nyt: sourceEnabled.nyt,
        },
        signals: swipeHistoryToV2Signals(swipeHistory),
        deckKey,
        diagnostics: middleGradesDeepDebugDiagnostics,
      });
      setV2DebugResult(result);
      console.log("[NovelIdeas][V2] debug result", {
        trigger,
        items: result.items.map((item) => item.title),
        stages: result.diagnostics.stages.map((stage) => stage.stage),
        sources: result.diagnostics.sources.map((source) => ({ source: source.source, status: source.status, rawCount: source.rawCount, normalizedCount: source.normalizedCount })),
      });
    } catch (err: any) {
      const message = String(err?.message || err || "recommender_v2_debug_failed");
      setV2DebugError(message);
      console.log("[NovelIdeas][V2] debug error", { trigger, message });
    } finally {
      setV2DebugLoading(false);
    }
  }

  React.useEffect(() => {
    if (v2UrlTriggeredRef.current) return;
    if (typeof window === "undefined") return;
    const engineParam = new URLSearchParams(window.location.search || "").get("engine");
    if (String(engineParam || "").toLowerCase() !== "v2") return;
    v2UrlTriggeredRef.current = true;
    void runRecommenderV2DebugFromCurrentSession("url");
  }, [deckKey, swipeHistory, sourceEnabled.googleBooks, sourceEnabled.openLibrary, sourceEnabled.localLibrary, sourceEnabled.kitsu, sourceEnabled.comicVine, sourceEnabled.nyt]);

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

  function toggleMiddleGradesDeepDebug() {
    setMiddleGradesDeepDebugUiEnabled((prev) => {
      const next = !prev;
      setMiddleGradesDeepDebugLocalStorage(next);
      return next;
    });
  }

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
    setLastRecommendationSwipeSummary(`Right:${likeCount} â€¢ Left:${dislikeCount} â€¢ Skip:${skipCount} â€¢ Decisions:${decisions} â€¢ 20Q:${resolvedTwentyQCount}/${twentyQObjectives.length}`);

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
      swipeHistory: entries as any,
      dislikedTagCounts: Object.fromEntries(
        Object.entries(nextTagCounts).filter(([, v]) => Number(v || 0) < 0).map(([k, v]) => [k, Math.abs(Number(v || 0))])
      ) as any,
      leftTagCounts: Object.fromEntries(
        Object.entries(nextTagCounts).filter(([, v]) => Number(v || 0) < 0).map(([k, v]) => [k, Math.abs(Number(v || 0))])
      ) as any,
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
    setLastEngineActuallyUsed("");
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
    return summarizeCounts(rows.map((row) => row?.queryFamily || inferQueryFamily(row?.queryText)));
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
        compactFieldBlock("queryFamily", candidate?.queryFamily || diagnostics?.queryFamily || (item.kind === "open_library" ? (item.doc as any)?.queryFamily : "") || inferQueryFamily(candidate?.queryText ?? diagnostics?.queryText ?? (item.kind === "open_library" ? (item.doc as any)?.queryText : ""))),
        compactFieldBlock("candidateLane", candidate?.laneKind),
        compactFieldBlock("candidateRung", candidate?.queryRung),
        compactFieldBlock("candidateScore", typeof candidate?.score === "number" ? candidate.score.toFixed(3) : ""),
        compactFieldBlock("rawMatches", matchingRawRows.length),
        ...formatDiagnosticObject(diagnostics, ["source", "score", "genreFacetMatch", "positiveTasteMatch", "avoidSignalPenalty", "ageTeenSuitability", "ageBandSuitability", "sourceQualityRelevance", "queryRungBonus", "scoreBreakdown", "preFilterScore", "postFilterScore", "finalScore", "comicVineRelevanceScore", "titleMatchScore", "descriptionMatchScore", "tasteMatchScore", "reasonAccepted", "queryText", "queryRung", "filterTrace", "queryFamily", "baseIntent", "baseIntentLocked", "matchedQueryTokens", "rejectedBy"]),
        ...formatDiagnosticObject(candidate, ["queryText", "queryRung", "laneKind", "score", "genreFacetMatch", "positiveTasteMatch", "avoidSignalPenalty", "ageTeenSuitability", "ageBandSuitability", "sourceQualityRelevance", "queryRungBonus", "baseIntent", "queryFamily", "matchedQueryTokens", "filterTrace", "filterType", "rejectedBy"]),
      ].filter(Boolean);

      return [`${index + 1}. ${title || "Untitled"} â€” ${author || "Unknown author"}`, ...traceBits.map((line) => `   ${line}`)].join("\n");
    }).join("\n");
  }


  function formatPoolDetailRows(rows: any[], label: string) {
    if (!Array.isArray(rows) || rows.length === 0) return "(none)";

    return rows.slice(0, 120).map((row, index) => {
      const title = row?.title || "Untitled";
      const author = row?.author || (Array.isArray(row?.author_name) && row.author_name.length ? row.author_name[0] : "Unknown author");
      const bits = [
        compactFieldBlock("source", row?.source),
        compactFieldBlock("queryFamily", row?.queryFamily || inferQueryFamily(row?.queryText)),
        compactFieldBlock("queryText", row?.queryText),
        compactFieldBlock("queryRung", row?.queryRung),
        compactFieldBlock("laneKind", row?.laneKind),
        compactFieldBlock("score", typeof row?.score === "number" ? row.score.toFixed(3) : row?.score),
        compactFieldBlock("genreFacetMatch", row?.genreFacetMatch),
        compactFieldBlock("positiveTasteMatch", row?.positiveTasteMatch),
        compactFieldBlock("avoidSignalPenalty", row?.avoidSignalPenalty),
        compactFieldBlock("ageTeenSuitability", row?.ageTeenSuitability),
        compactFieldBlock("ageBandSuitability", row?.ageBandSuitability),
        compactFieldBlock("sourceQualityRelevance", row?.sourceQualityRelevance),
        compactFieldBlock("queryRungBonus", row?.queryRungBonus),
        compactFieldBlock("filterKept", row?.filterKept),
        compactFieldBlock("filterFamily", row?.filterFamily),
        compactFieldBlock("rejectReasons", Array.isArray(row?.filterRejectReasons) && row.filterRejectReasons.length ? row.filterRejectReasons.join(", ") : (Array.isArray(row?.rejectReasons) && row.rejectReasons.length ? row.rejectReasons.join(", ") : "")),
        compactFieldBlock("passedChecks", Array.isArray(row?.filterPassedChecks) && row.filterPassedChecks.length ? row.filterPassedChecks.join(", ") : (Array.isArray(row?.passedChecks) && row.passedChecks.length ? row.passedChecks.join(", ") : "")),
      ].filter(Boolean);

      return [`${index + 1}. ${title} â€” ${author}`, ...bits.map((bit) => `   ${bit}`)].join("\n");
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

      return [`${index + 1}. ${row?.title || "Untitled"} â€” ${row?.author || "Unknown author"}`, ...bits.map((bit) => `   ${bit}`)].join("\n");
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

      return [`${index + 1}. ${row?.title || "Untitled"} â€” ${row?.author || "Unknown author"}`, ...bits.map((bit) => `   ${bit}`)].join("\n");
    }).join("\n");
  }

  function limitArray<T>(value: T[] | undefined, limit: number): T[] {
    return Array.isArray(value) ? value.slice(0, limit) : [];
  }

  function compactCodexString(value: unknown, maxLength: number): string {
    if (value == null) return "";
    const text = Array.isArray(value) ? value.filter(Boolean).join(" | ") : String(value);
    return text.length > maxLength ? `${text.slice(0, maxLength)}â€¦` : text;
  }

  function buildCodexDiagnosticsUploadText(result: RecommendationResultV2 | null, errorMessage = "") {
    const diagnostics = result?.diagnostics || null;
    const openLibraryDiagnostics = (diagnostics?.sources || []).find((source: any) => source.source === "openLibrary") as any;
    const selectedStage = (diagnostics?.stages || []).find((stage: any) => stage.stage === "selected") as any;
    const selection = selectedStage?.details?.rejectedReasons || {};
    const expansionEvidenceAudit = openLibraryDiagnostics?.expansionFinalEligibilityEvidenceAuditByTitle || {};
    const signals = swipeHistoryToV2Signals(swipeHistory);
    const reasonCounts = new Map<string, number>();
    Object.values(openLibraryDiagnostics?.expansionCandidatesRejectedByReason || {}).forEach((reason: any) => {
      const key = String(Array.isArray(reason) ? reason[0] : reason || "unknown");
      reasonCounts.set(key, (reasonCounts.get(key) || 0) + 1);
    });
    Object.values(expansionEvidenceAudit).forEach((row: any) => {
      limitArray(row?.rejectedReasons, 6).forEach((reason) => {
        const key = String(reason || "unknown");
        reasonCounts.set(key, (reasonCounts.get(key) || 0) + 1);
      });
    });
    const topReasons = [...reasonCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
    const evidenceRows = Object.entries(expansionEvidenceAudit).slice(0, 8).map(([title, row]: [string, any]) => [
      `- ${title}`,
      `  score=${row?.score ?? "?"}; query=${row?.sourceQuery || "?"}; family=${row?.matchedRouteFamily || "?"}`,
      `  reasons=${limitArray(row?.rejectedReasons, 4).join(",") || row?.missingEvidenceFieldOrFailedPredicate || "?"}`,
      `  subjects=${limitArray(row?.rawSubjects, 5).join(" | ") || "(none)"}`,
      `  docSignals=${limitArray(row?.documentBackedTasteSignals, 5).join(",") || "(none)"}`,
      `  support=${limitArray(row?.routeEvidenceFields, 5).join(",") || "(none)"}; fictionAge=${String(row?.hasFictionAgeEvidence)}`,
      row?.queryOnlyCapExplanation ? `  queryOnly=${compactCodexString(row.queryOnlyCapExplanation, 180)}` : "",
      row?.rawFirstSentence ? `  first=${compactCodexString(row.rawFirstSentence, 180)}` : "",
      row?.rawDescription ? `  desc=${compactCodexString(row.rawDescription, 220)}` : "",
    ].filter(Boolean).join("\n"));
    const topRejectedRows = limitArray(selection?.middleGradesTopRejectedQualityAudit, 5).map((row: any) => [
      `- ${row?.title || "Untitled"}`,
      `  reason=${row?.finalEligibilityRejectedReason || row?.rejectionReason || "?"}; score=${row?.score ?? "?"}; query=${row?.sourceQuery || "?"}`,
      `  tier=${row?.routeEvidenceTier || "?"}; fields=${limitArray(row?.documentEvidenceFields, 5).join(",") || "(none)"}`,
      `  taste=${limitArray(row?.tasteSignalsMatched, 5).join(",") || "(none)"}`,
    ].join("\n"));
    const lines = [
      "CODEX_MG_OL_BRIEF_V3",
      `generatedAt: ${new Date().toISOString()}`,
      `deck: ${deckKey} / ${deck.deckLabel} / ${deckKeyToAgeBandV2(deckKey)}`,
      `status: ${errorMessage ? `error ${errorMessage}` : result ? "ok" : "not_run"}`,
      `requestId: ${diagnostics?.requestId || "(none)"}`,
      `swipes: right=${rightSwipes} left=${leftSwipes} down=${downSwipes} total=${swipeHistory.length}`,
      `signals: ${compactCodexString(JSON.stringify(signals), 900)}`,
      `returned: ${limitArray(result?.items, 8).map((item: any) => item?.title).filter(Boolean).join(" | ") || "(none)"}`,
      "",
      "OPEN_LIBRARY_COUNTS",
      `raw=${openLibraryDiagnostics?.rawCount ?? "?"}; normalized=${openLibraryDiagnostics?.normalizedCount ?? "?"}; fetched=${openLibraryDiagnostics?.openLibraryDocsFetchedAcrossAllQueriesCount ?? "?"}; handedToScoring=${openLibraryDiagnostics?.openLibraryDocsActuallyHandedToScoringCount ?? "?"}; handoffSource=${openLibraryDiagnostics?.openLibraryScoringHandoffSource || "?"}`,
      `queries=${limitArray(openLibraryDiagnostics?.queries, 10).join(" | ") || "(none)"}`,
      "",
      "EXPANSION_SUMMARY",
      `triggered=${String(openLibraryDiagnostics?.cleanCandidateShortfallExpansionTriggered)}; fetchAttempted=${String(openLibraryDiagnostics?.expansionFetchAttempted)}; raw=${openLibraryDiagnostics?.expansionRawCount ?? "?"}; converted=${openLibraryDiagnostics?.expansionConvertedCount ?? "?"}; merged=${openLibraryDiagnostics?.expansionMergedCandidateCount ?? "?"}; enteredScoring=${openLibraryDiagnostics?.expansionCandidatesEnteredScoringCount ?? "?"}; cleanEligible=${openLibraryDiagnostics?.expansionCleanEligibleCount ?? "?"}`,
      `acceptedFinal=${limitArray(openLibraryDiagnostics?.expansionCandidatesAcceptedFinal, 8).join(" | ") || "(none)"}`,
      `selected=${limitArray(openLibraryDiagnostics?.expansionSelectedTitles, 8).join(" | ") || "(none)"}`,
      `attemptedQueries=${limitArray(openLibraryDiagnostics?.expansionAttemptedQueries, 8).join(" | ") || "(none)"}`,
      `topRejectReasons=${topReasons.map(([reason, count]) => `${reason}:${count}`).join(" | ") || "(none)"}`,
      `lockQuality=${String(openLibraryDiagnostics?.expansionLockQualityPass)} ${limitArray(openLibraryDiagnostics?.expansionLockQualityFailReasons, 5).join(",")}`,
      "",
      "SELECTION_SUMMARY",
      `finalClean=${selection?.finalEligibilityCleanCandidateCount ?? "?"}; finalAccepted=${limitArray(selection?.finalEligibilityAcceptedTitles, 8).join(" | ") || "(none)"}`,
      `meaningfulTaste=${limitArray(selection?.meaningfulTasteEligibleTitles, 8).join(" | ") || "(none)"}`,
      `zeroTasteRejected=${limitArray(selection?.zeroTasteCandidateRejectedTitles, 8).join(" | ") || "(none)"}`,
      `broadAdventureRejected=${limitArray(selection?.broadAdventureOnlyRejectedTitles, 8).join(" | ") || "(none)"}`,
      `lockQuality=${String(selection?.lockQualityPass)} ${limitArray(selection?.lockQualityFailReasons, 5).join(",")}`,
      "",
      "EXPANSION_EVIDENCE_ROWS",
      evidenceRows.join("\n") || "(none)",
      "",
      "TOP_SELECTION_REJECTS",
      topRejectedRows.join("\n") || "(none)",
    ];
    const report = lines.join("\n");
    return report.length > 12_000
      ? `${report.slice(0, 12_000)}\n\n[TRUNCATED_TO_12KB: enough summary retained for Codex next-step debugging]`
      : report;
  }

  async function handleCopyCodexDiagnostics() {
    setV2DebugLoading(true);
    setV2DebugError("");
    try {
      const ageBand = deckKeyToAgeBandV2(deckKey);
      const middleGradesDeepDebugDiagnostics = middleGradesDeepDebugDiagnosticsForSession(ageBand, middleGradesDeepDebugUiEnabled);
      const result = await runRecommenderV2({
        requestId: `codex-diagnostics-${Date.now()}`,
        ageBand,
        limit: 5,
        enabledSources: {
          mock: false,
          googleBooks: sourceEnabled.googleBooks,
          openLibrary: sourceEnabled.openLibrary,
          localLibrary: sourceEnabled.localLibrary,
          kitsu: sourceEnabled.kitsu,
          comicVine: sourceEnabled.comicVine,
          nyt: sourceEnabled.nyt,
        },
        signals: swipeHistoryToV2Signals(swipeHistory),
        deckKey,
        diagnostics: middleGradesDeepDebugDiagnostics,
      });
      setV2DebugResult(result);
      const report = buildCodexDiagnosticsUploadText(result);
      await Clipboard.setStringAsync(report);
      Alert.alert("Copied", `Compact Codex diagnostics copied (${Math.round(report.length / 1024)} KB). Paste this directly into Codex.`);
    } catch (err: any) {
      const message = String(err?.message || err || "codex_diagnostics_failed");
      setV2DebugError(message);
      const report = buildCodexDiagnosticsUploadText(null, message);
      await Clipboard.setStringAsync(report);
      Alert.alert("Copied with error", "Codex diagnostics copied with the run error included.");
    } finally {
      setV2DebugLoading(false);
    }
  }

  async function handleCopyDiagnostics() {
    const runtimeFingerprint = lastDebugRouterVersion || "";
    const engineActuallyUsedForReport = String((lastRecommendationResult as any)?.engineActuallyUsed || lastEngineActuallyUsed || "");
    const lastRunWasV2 = engineActuallyUsedForReport === "v2";
    const timeoutRun = String(recommendFunctionError || "").startsWith("recommendation_timeout:");
    const routerRunTimeoutRun = String(recommendFunctionError || "").startsWith("router_run_timeout:");
    const routerEntryTimeoutRun = String(recommendFunctionError || "").startsWith("router_entry_timeout:");
    const routerPostEntryTimeoutRun = String(recommendFunctionError || "").startsWith("router_post_entry_timeout:");
    const routerInvocationSkippedBeforeAwaitRun = String(recommendFunctionError || "").startsWith("router_invocation_skipped_before_await:");
    const routerNotInvokedEmptyResultRun = String(recommendFunctionError || "").startsWith("router_not_invoked_empty_result:");
    const getRecommendationsReturnedUndefinedRun = String(recommendFunctionError || "").startsWith("getRecommendations_returned_undefined:");
    const getRecommendationsReturnedEmptyObjectRun = String(recommendFunctionError || "").startsWith("getRecommendations_returned_empty_object:");
    const preflightTimeoutRun = String(recommendFunctionError || "").startsWith("source_health_preflight_timeout:");
    const globalRouterPhases = Array.isArray((globalThis as any).__novelIdeasRouterPhaseHistory)
      ? ((globalThis as any).__novelIdeasRouterPhaseHistory as any[])
      : [];
    const legacyAfterRouterCallEvents = globalRouterPhases.filter((row: any) => String(row?.phase || "") === "getRecommendations_after_router_call");
    const latestLegacyAfterRouterCallPhase = legacyAfterRouterCallEvents.length ? legacyAfterRouterCallEvents[legacyAfterRouterCallEvents.length - 1] : null;
    const afterRouterCallWithShapeV2Payload = [...globalRouterPhases].reverse().find((row: any) => String(row?.phase || "") === "getRecommendations_after_router_call_with_shape_v2") || null;
    const directAfterRouterCallPayload = (globalThis as any).__novelIdeasAfterRouterCallEventPayload || null;
    const resultShape = (globalThis as any).__novelIdeasLastGetRecommendationsResultShape || null;
    const effectiveIsUndefined = Boolean((resultShape as any)?.isUndefined ?? (afterRouterCallWithShapeV2Payload as any)?.isUndefined ?? (latestLegacyAfterRouterCallPhase as any)?.isUndefined);
    const effectiveIsEmptyObject = Boolean((resultShape as any)?.isEmptyObject ?? (afterRouterCallWithShapeV2Payload as any)?.isEmptyObject ?? (latestLegacyAfterRouterCallPhase as any)?.isEmptyObject);
    const hasAfterRouterCallEvent = Boolean(afterRouterCallWithShapeV2Payload || latestLegacyAfterRouterCallPhase);
    const returnedItemsLength = Number((resultShape as any)?.itemsLength ?? (afterRouterCallWithShapeV2Payload as any)?.itemsLength ?? -1);
    const hasValidReturnedItems = returnedItemsLength > 0 || (Array.isArray((lastRecommendationResult as any)?.items) && (lastRecommendationResult as any).items.length > 0);
    const zeroItemsReturnedRun = Boolean(recommendFunctionReturned) && !recommendFunctionError && returnedItemsLength === 0;
    const debugRawPoolLengthTop = Array.isArray((lastRecommendationResult as any)?.debugRawPool) ? (lastRecommendationResult as any).debugRawPool.length : 0;
    const debugCandidatePoolLengthTop = Array.isArray((lastRecommendationResult as any)?.debugCandidatePool) ? (lastRecommendationResult as any).debugCandidatePool.length : 0;
    const fetchedRawCountTop = Number((lastRecommendationResult as any)?.fetchedRawCount ?? ((lastRecommendationResult as any)?.debugSourceStats ? Object.values((lastRecommendationResult as any).debugSourceStats).reduce((acc: number, row: any) => acc + Number(row?.rawFetched || 0), 0) : 0));
    const sourceStarvationByZeroPools = fetchedRawCountTop === 0 && debugCandidatePoolLengthTop === 0;
    const skippedReasons = Array.isArray((lastRecommendationResult as any)?.sourceSkippedReason) ? (lastRecommendationResult as any).sourceSkippedReason : [];
    const preFatalDispatchState = (lastDebugGcdDispatchTrace as any)?.preFatalDispatchState || {};
    const v2OpenLibrarySourceDiagnosticsForReport = Array.isArray(v2DebugResult?.diagnostics?.sources)
      ? v2DebugResult?.diagnostics?.sources.find((source: any) => source.source === "openLibrary")
      : null;
    const v2GoogleBooksSourceDiagnosticsForReport = Array.isArray(v2DebugResult?.diagnostics?.sources)
      ? v2DebugResult?.diagnostics?.sources.find((source: any) => source.source === "googleBooks")
      : Array.isArray((lastRecommendationResult as any)?.diagnostics?.sources)
        ? (lastRecommendationResult as any).diagnostics.sources.find((source: any) => source.source === "googleBooks")
        : null;
    const sourceStarvationAuditForReport = (lastRecommendationResult as any)?.sourceStarvationAudit || preFatalDispatchState?.sourceStarvationAudit || null;
    const googleBooksSourceFetchDiagnosticsForReport = Array.isArray((lastRecommendationResult as any)?.googleBooksSourceFetchDiagnostics)
      ? (lastRecommendationResult as any).googleBooksSourceFetchDiagnostics
      : Array.isArray(preFatalDispatchState?.googleBooksSourceFetchDiagnostics)
        ? preFatalDispatchState.googleBooksSourceFetchDiagnostics
        : Array.isArray((v2GoogleBooksSourceDiagnosticsForReport as any)?.googleBooksSourceFetchDiagnostics)
          ? (v2GoogleBooksSourceDiagnosticsForReport as any).googleBooksSourceFetchDiagnostics
          : Array.isArray((v2GoogleBooksSourceDiagnosticsForReport as any)?.fetches)
            ? (v2GoogleBooksSourceDiagnosticsForReport as any).fetches
        : [];
    const openLibrarySourceFetchDiagnosticsForReport = Array.isArray((lastRecommendationResult as any)?.openLibrarySourceFetchDiagnostics)
      ? (lastRecommendationResult as any).openLibrarySourceFetchDiagnostics
      : Array.isArray(preFatalDispatchState?.openLibrarySourceFetchDiagnostics)
        ? preFatalDispatchState.openLibrarySourceFetchDiagnostics
        : Array.isArray((v2OpenLibrarySourceDiagnosticsForReport as any)?.fetches)
          ? (v2OpenLibrarySourceDiagnosticsForReport as any).fetches
          : [];
    const openLibraryProbeRanForReport = Boolean(
      (lastRecommendationResult as any)?.openLibraryProbeRan ||
      preFatalDispatchState?.openLibraryProbeRan ||
      (v2OpenLibrarySourceDiagnosticsForReport as any)?.openLibraryProbeRan ||
      openLibrarySourceFetchDiagnosticsForReport.some((fetch: any) => Boolean(fetch?.diagnosticOnly || fetch?.probe))
    );
    const openLibraryEmptyReasonForReport = String(
      (lastRecommendationResult as any)?.openLibrarySourceEmptyReason ||
      preFatalDispatchState?.openLibrarySourceEmptyReason ||
      (v2OpenLibrarySourceDiagnosticsForReport as any)?.emptyReason ||
      ""
    );
    const sourceStarvationFetchDiagnosticsForReport = {
      googleBooks: Array.isArray(sourceStarvationAuditForReport?.googleBooks?.fetchDiagnostics) ? sourceStarvationAuditForReport.googleBooks.fetchDiagnostics : [],
      openLibrary: Array.isArray(sourceStarvationAuditForReport?.openLibrary?.fetchDiagnostics) ? sourceStarvationAuditForReport.openLibrary.fetchDiagnostics : [],
    };
    const pickTeenKitsuFinalGuardDiagnostic = (key: string) => {
      const latestResult = lastRecommendationResult as any;
      return latestResult?.[key] ?? preFatalDispatchState?.[key];
    };
    const teenKitsuFinalGuardReportLines = [
      `kitsuTeenAlternateQueriesPlanned: ${JSON.stringify(pickTeenKitsuFinalGuardDiagnostic("kitsuTeenAlternateQueriesPlanned") || [])}`,
      `kitsuTeenAlternateQueriesAttempted: ${JSON.stringify(pickTeenKitsuFinalGuardDiagnostic("kitsuTeenAlternateQueriesAttempted") || [])}`,
      `kitsuTeenAlternateQueryPromotionDecisions: ${JSON.stringify(pickTeenKitsuFinalGuardDiagnostic("kitsuTeenAlternateQueryPromotionDecisions") || [])}`,
      `kitsuTeenAlternateQueryExpansionReasons: ${JSON.stringify(pickTeenKitsuFinalGuardDiagnostic("kitsuTeenAlternateQueryExpansionReasons") || [])}`,
      `kitsuTeenAlternateFamilyInferenceDiagnostics: ${JSON.stringify(pickTeenKitsuFinalGuardDiagnostic("kitsuTeenAlternateFamilyInferenceDiagnostics") || [])}`,
      `kitsuTeenDominantFamilyUsageDiagnostics: ${JSON.stringify(pickTeenKitsuFinalGuardDiagnostic("kitsuTeenDominantFamilyUsageDiagnostics") || [])}`,
      `kitsuTeenGcdEnrichmentAttempted: ${String(Boolean(pickTeenKitsuFinalGuardDiagnostic("kitsuTeenGcdEnrichmentAttempted")))}`,
      `kitsuTeenGcdEnrichmentEnabled: ${String(Boolean(pickTeenKitsuFinalGuardDiagnostic("kitsuTeenGcdEnrichmentEnabled")))}`,
      `kitsuTeenGcdEnrichmentReturnableGcdDisabled: ${String(Boolean(pickTeenKitsuFinalGuardDiagnostic("kitsuTeenGcdEnrichmentReturnableGcdDisabled")))}`,
      `kitsuTeenGcdEnrichmentSkippedReason: ${String(pickTeenKitsuFinalGuardDiagnostic("kitsuTeenGcdEnrichmentSkippedReason") || "")}`,
      `kitsuTeenGcdEnrichmentQueries: ${JSON.stringify(pickTeenKitsuFinalGuardDiagnostic("kitsuTeenGcdEnrichmentQueries") || [])}`,
      `kitsuTeenGcdEnrichmentQueryDiagnostics: ${JSON.stringify(pickTeenKitsuFinalGuardDiagnostic("kitsuTeenGcdEnrichmentQueryDiagnostics") || [])}`,
      `kitsuTeenGcdEnrichmentExactTitleLookupDiagnostics: ${JSON.stringify(pickTeenKitsuFinalGuardDiagnostic("kitsuTeenGcdEnrichmentExactTitleLookupDiagnostics") || [])}`,
      `kitsuTeenGcdEnrichmentDocsReturnedButNoMatch: ${JSON.stringify(pickTeenKitsuFinalGuardDiagnostic("kitsuTeenGcdEnrichmentDocsReturnedButNoMatch") || [])}`,
      `kitsuTeenGcdEnrichmentUnhelpfulMatchByTitle: ${JSON.stringify(pickTeenKitsuFinalGuardDiagnostic("kitsuTeenGcdEnrichmentUnhelpfulMatchByTitle") || {})}`,
      `kitsuTeenGcdEnrichmentMatchedTitles: ${JSON.stringify(pickTeenKitsuFinalGuardDiagnostic("kitsuTeenGcdEnrichmentMatchedTitles") || [])}`,
      `kitsuTeenGcdEnrichmentNoMatchTitles: ${JSON.stringify(pickTeenKitsuFinalGuardDiagnostic("kitsuTeenGcdEnrichmentNoMatchTitles") || [])}`,
      `kitsuTeenGcdEnrichmentByTitle: ${JSON.stringify(pickTeenKitsuFinalGuardDiagnostic("kitsuTeenGcdEnrichmentByTitle") || {})}`,
      `teenKitsuMultiQueryRecoveryAllowed: ${String(Boolean(pickTeenKitsuFinalGuardDiagnostic("teenKitsuMultiQueryRecoveryAllowed")))}`,
      `teenKitsuFetchesArePlannedRecoveryQueries: ${String(Boolean(pickTeenKitsuFinalGuardDiagnostic("teenKitsuFetchesArePlannedRecoveryQueries")))}`,
      `teenKitsuAllowedRecoveryCanonicalQueries: ${JSON.stringify(pickTeenKitsuFinalGuardDiagnostic("teenKitsuAllowedRecoveryCanonicalQueries") || [])}`,
      `kitsuTeenRescueFinalGuardInputTitles: ${JSON.stringify(pickTeenKitsuFinalGuardDiagnostic("kitsuTeenRescueFinalGuardInputTitles") || [])}`,
      `kitsuTeenRescueFinalGuardAcceptedTitles: ${JSON.stringify(pickTeenKitsuFinalGuardDiagnostic("kitsuTeenRescueFinalGuardAcceptedTitles") || [])}`,
      `kitsuTeenRescueFinalGuardSuppressedTitles: ${JSON.stringify(pickTeenKitsuFinalGuardDiagnostic("kitsuTeenRescueFinalGuardSuppressedTitles") || [])}`,
      `kitsuTeenRescueFinalGuardSuppressedReasonByTitle: ${JSON.stringify(pickTeenKitsuFinalGuardDiagnostic("kitsuTeenRescueFinalGuardSuppressedReasonByTitle") || {})}`,
      `kitsuTeenTopRejectedCandidatesByQuery: ${JSON.stringify(pickTeenKitsuFinalGuardDiagnostic("kitsuTeenTopRejectedCandidatesByQuery") || {})}`,
      `kitsuTeenRescueTierByTitle: ${JSON.stringify(pickTeenKitsuFinalGuardDiagnostic("kitsuTeenRescueTierByTitle") || {})}`,
      `kitsuTeenRescueSemanticEvidenceByTitle: ${JSON.stringify(pickTeenKitsuFinalGuardDiagnostic("kitsuTeenRescueSemanticEvidenceByTitle") || {})}`,
      `kitsuTeenRescueTasteEvidenceByTitle: ${JSON.stringify(pickTeenKitsuFinalGuardDiagnostic("kitsuTeenRescueTasteEvidenceByTitle") || {})}`,
      `kitsuTeenEvidenceTextFieldsByTitle: ${JSON.stringify(pickTeenKitsuFinalGuardDiagnostic("kitsuTeenEvidenceTextFieldsByTitle") || {})}`,
      `kitsuTeenKnownTitleFacetEvidenceByTitle: ${JSON.stringify(pickTeenKitsuFinalGuardDiagnostic("kitsuTeenKnownTitleFacetEvidenceByTitle") || {})}`,
      `kitsuTeenRescueLaneAlignmentByTitle: ${JSON.stringify(pickTeenKitsuFinalGuardDiagnostic("kitsuTeenRescueLaneAlignmentByTitle") || {})}`,
      `kitsuTeenRescueFamilyAlignmentByTitle: ${JSON.stringify(pickTeenKitsuFinalGuardDiagnostic("kitsuTeenRescueFamilyAlignmentByTitle") || {})}`,
      `kitsuTeenTasteEvidenceSignalsByTitle: ${JSON.stringify(pickTeenKitsuFinalGuardDiagnostic("kitsuTeenTasteEvidenceSignalsByTitle") || {})}`,
      `kitsuTeenMeaningfulTasteEvidenceByTitle: ${JSON.stringify(pickTeenKitsuFinalGuardDiagnostic("kitsuTeenMeaningfulTasteEvidenceByTitle") || {})}`,
      `kitsuTeenGenericTasteEvidenceByTitle: ${JSON.stringify(pickTeenKitsuFinalGuardDiagnostic("kitsuTeenGenericTasteEvidenceByTitle") || {})}`,
      `kitsuTeenTitleKeywordOnlyPenaltyByTitle: ${JSON.stringify(pickTeenKitsuFinalGuardDiagnostic("kitsuTeenTitleKeywordOnlyPenaltyByTitle") || {})}`,
      `kitsuTeenPositiveFitPenaltyTypeByTitle: ${JSON.stringify(pickTeenKitsuFinalGuardDiagnostic("kitsuTeenPositiveFitPenaltyTypeByTitle") || {})}`,
      `kitsuTeenPositiveFitOverriddenByEvidenceTitles: ${JSON.stringify(pickTeenKitsuFinalGuardDiagnostic("kitsuTeenPositiveFitOverriddenByEvidenceTitles") || [])}`,
      `kitsuTeenHardDislikeRejectedTitles: ${JSON.stringify(pickTeenKitsuFinalGuardDiagnostic("kitsuTeenHardDislikeRejectedTitles") || [])}`,
      `kitsuTeenSoftNegativeFitAcceptedTitles: ${JSON.stringify(pickTeenKitsuFinalGuardDiagnostic("kitsuTeenSoftNegativeFitAcceptedTitles") || [])}`,
      `kitsuTeenSourceIdAtFinalGuardByTitle: ${JSON.stringify(pickTeenKitsuFinalGuardDiagnostic("kitsuTeenSourceIdAtFinalGuardByTitle") || {})}`,
      `kitsuTeenSourceIdAfterFinalGuardByTitle: ${JSON.stringify(pickTeenKitsuFinalGuardDiagnostic("kitsuTeenSourceIdAfterFinalGuardByTitle") || {})}`,
      `kitsuTeenSourceIdAtFinalEligibilityByTitle: ${JSON.stringify(pickTeenKitsuFinalGuardDiagnostic("kitsuTeenSourceIdAtFinalEligibilityByTitle") || {})}`,
      `kitsuTeenSourceIdAtReturnedItemByTitle: ${JSON.stringify(pickTeenKitsuFinalGuardDiagnostic("kitsuTeenSourceIdAtReturnedItemByTitle") || {})}`,
      `kitsuTeenSourceIdAtRawDocByTitle: ${JSON.stringify(pickTeenKitsuFinalGuardDiagnostic("kitsuTeenSourceIdAtRawDocByTitle") || {})}`,
      `kitsuTeenSourceIdAtNormalizedCandidateByTitle: ${JSON.stringify(pickTeenKitsuFinalGuardDiagnostic("kitsuTeenSourceIdAtNormalizedCandidateByTitle") || {})}`,
      `kitsuTeenSourceIdAtRankedCandidateByTitle: ${JSON.stringify(pickTeenKitsuFinalGuardDiagnostic("kitsuTeenSourceIdAtRankedCandidateByTitle") || {})}`,
      `kitsuTeenSourceIdAtFinalEligibilityInputByTitle: ${JSON.stringify(pickTeenKitsuFinalGuardDiagnostic("kitsuTeenSourceIdAtFinalEligibilityInputByTitle") || {})}`,
      `kitsuTeenSourceIdAtFinalGuardInputByTitle: ${JSON.stringify(pickTeenKitsuFinalGuardDiagnostic("kitsuTeenSourceIdAtFinalGuardInputByTitle") || {})}`,
      `kitsuTeenSourceIdAtSuppressionDecisionByTitle: ${JSON.stringify(pickTeenKitsuFinalGuardDiagnostic("kitsuTeenSourceIdAtSuppressionDecisionByTitle") || {})}`,
      `kitsuTeenFinalEligibilityMissingSourceIdDespiteFinalGuardId: ${JSON.stringify(pickTeenKitsuFinalGuardDiagnostic("kitsuTeenFinalEligibilityMissingSourceIdDespiteFinalGuardId") || [])}`,
      `kitsuTeenReturnedItemMissingSourceIdDespiteFinalGuardId: ${JSON.stringify(pickTeenKitsuFinalGuardDiagnostic("kitsuTeenReturnedItemMissingSourceIdDespiteFinalGuardId") || [])}`,
      `kitsuTeenSourceIdPropagationBreakStageByTitle: ${JSON.stringify(pickTeenKitsuFinalGuardDiagnostic("kitsuTeenSourceIdPropagationBreakStageByTitle") || {})}`,
      `kitsuTeenSourceIdLostBeforeFinalGuardByTitle: ${JSON.stringify(pickTeenKitsuFinalGuardDiagnostic("kitsuTeenSourceIdLostBeforeFinalGuardByTitle") || {})}`,
      `kitsuTeenMissingSourceIdButKnownKitsuIdByTitle: ${JSON.stringify(pickTeenKitsuFinalGuardDiagnostic("kitsuTeenMissingSourceIdButKnownKitsuIdByTitle") || {})}`,
      `kitsuTeenLastSuppressedCandidate: ${String(pickTeenKitsuFinalGuardDiagnostic("kitsuTeenLastSuppressedCandidate") || "")}`,
      `kitsuTeenLastSuppressedReason: ${String(pickTeenKitsuFinalGuardDiagnostic("kitsuTeenLastSuppressedReason") || "")}`,
      `kitsuTeenWouldQualifyAsAcceptableUnderfill: ${String(Boolean(pickTeenKitsuFinalGuardDiagnostic("kitsuTeenWouldQualifyAsAcceptableUnderfill")))}`,
    ];
    const pickAdultKitsuFallbackDiagnostic = (primaryKey: string, aliasKey?: string) => {
      const latestResult = lastRecommendationResult as any;
      const primaryValue = latestResult?.[primaryKey] ?? preFatalDispatchState?.[primaryKey];
      if (primaryValue !== undefined) return primaryValue;
      if (!aliasKey) return undefined;
      return latestResult?.[aliasKey] ?? preFatalDispatchState?.[aliasKey];
    };
    const adultKitsuOnlyFallbackReportLines = [
      `adultKitsuOnlyFallbackLivePathVersion: ${String(pickAdultKitsuFallbackDiagnostic("adultKitsuOnlyFallbackLivePathVersion") ?? "(missing)")}`,
      `adultKitsuOnlyFallbackPlannedCount: ${String(pickAdultKitsuFallbackDiagnostic("adultKitsuOnlyFallbackPlannedCount", "adultKitsuOnlyFallbackRouterPlannedCount") ?? "(missing)")}`,
      `adultKitsuOnlyFallbackRouterPlannedCount: ${String(pickAdultKitsuFallbackDiagnostic("adultKitsuOnlyFallbackRouterPlannedCount", "adultKitsuOnlyFallbackPlannedCount") ?? "(missing)")}`,
      `adultKitsuOnlyFallbackAdapterAttemptCount: ${String(pickAdultKitsuFallbackDiagnostic("adultKitsuOnlyFallbackAdapterAttemptCount") ?? "(missing)")}`,
      `adultKitsuOnlyFallbackPublicFetchRowCount: ${String(pickAdultKitsuFallbackDiagnostic("adultKitsuOnlyFallbackPublicFetchRowCount") ?? "(missing)")}`,
      `adultKitsuOnlyFallbackPublicArraysExpanded: ${String(pickAdultKitsuFallbackDiagnostic("adultKitsuOnlyFallbackPublicArraysExpanded", "adultKitsuOnlyFallbackPublicQueriesExpanded") ?? "(missing)")}`,
      `adultKitsuOnlyFallbackPublicQueriesExpanded: ${String(pickAdultKitsuFallbackDiagnostic("adultKitsuOnlyFallbackPublicQueriesExpanded", "adultKitsuOnlyFallbackPublicArraysExpanded") ?? "(missing)")}`,
      `adultKitsuOnlyFallbackDiagnosticsMismatchReason: ${String(pickAdultKitsuFallbackDiagnostic("adultKitsuOnlyFallbackDiagnosticsMismatchReason") ?? "(missing)")}`,
      `adultKitsuOnlyForceQueryForValidation: ${String(pickAdultKitsuFallbackDiagnostic("adultKitsuOnlyForceQueryForValidation") ?? "(missing)")}`,
      `debugUrlAdultKitsuForceQuery: ${String(pickAdultKitsuFallbackDiagnostic("debugUrlAdultKitsuForceQuery") ?? "(missing)")}`,
      `debugLocalStorageAdultKitsuForceQuery: ${String(pickAdultKitsuFallbackDiagnostic("debugLocalStorageAdultKitsuForceQuery") ?? "(missing)")}`,
      `debugAdminConfigAdultKitsuForceQuery: ${String(pickAdultKitsuFallbackDiagnostic("debugAdminConfigAdultKitsuForceQuery") ?? "(missing)")}`,
      `debugRouterReceivedAdultKitsuForceQuery: ${String(pickAdultKitsuFallbackDiagnostic("debugRouterReceivedAdultKitsuForceQuery") ?? "(missing)")}`,
      `debugAdultKitsuForceQueryApplied: ${String(pickAdultKitsuFallbackDiagnostic("debugAdultKitsuForceQueryApplied") ?? "(missing)")}`,
      `adultKitsuOnlyWeakRescueGateApplied: ${String(pickAdultKitsuFallbackDiagnostic("adultKitsuOnlyWeakRescueGateApplied") ?? "(missing)")}`,
      `adultKitsuOnlyWeakRescueGateReason: ${String(pickAdultKitsuFallbackDiagnostic("adultKitsuOnlyWeakRescueGateReason") ?? "(missing)")}`,
      `adultKitsuOnlyWeakRescueCandidateCount: ${String(pickAdultKitsuFallbackDiagnostic("adultKitsuOnlyWeakRescueCandidateCount") ?? "(missing)")}`,
      `adultKitsuOnlyWeakRescueSuppressedCount: ${String(pickAdultKitsuFallbackDiagnostic("adultKitsuOnlyWeakRescueSuppressedCount") ?? "(missing)")}`,
      `adultKitsuOnlyWeakRescueDiagnostics: ${JSON.stringify(pickAdultKitsuFallbackDiagnostic("adultKitsuOnlyWeakRescueDiagnostics") || [])}`,
      `adultKitsuOnlyDystopianCandidateOrder: ${JSON.stringify(pickAdultKitsuFallbackDiagnostic("adultKitsuOnlyDystopianCandidateOrder") || [])}`,
      `adultKitsuOnlyDystopianAcceptedButNotReturned: ${JSON.stringify(pickAdultKitsuFallbackDiagnostic("adultKitsuOnlyDystopianAcceptedButNotReturned") || [])}`,
      `adultKitsuOnlyDystopianReturnLimitReason: ${String(pickAdultKitsuFallbackDiagnostic("adultKitsuOnlyDystopianReturnLimitReason") ?? "(missing)")}`,
      `adultKitsuOnlyDystopianRescueSelectionReasonByTitle: ${JSON.stringify(pickAdultKitsuFallbackDiagnostic("adultKitsuOnlyDystopianRescueSelectionReasonByTitle") || {})}`,
      `adultKitsuOnlySemanticEvidenceHistogram: ${JSON.stringify(pickAdultKitsuFallbackDiagnostic("adultKitsuOnlySemanticEvidenceHistogram") || {})}`,
      `adultKitsuOnlyFacetMatchHistogram: ${JSON.stringify(pickAdultKitsuFallbackDiagnostic("adultKitsuOnlyFacetMatchHistogram") || {})}`,
      `adultKitsuOnlyPositiveFitHistogram: ${JSON.stringify(pickAdultKitsuFallbackDiagnostic("adultKitsuOnlyPositiveFitHistogram") || {})}`,
      `adultKitsuOnlyLaneAlignmentHistogram: ${JSON.stringify(pickAdultKitsuFallbackDiagnostic("adultKitsuOnlyLaneAlignmentHistogram") || {})}`,
      `adultKitsuMissingSourceIdCount: ${String(pickAdultKitsuFallbackDiagnostic("adultKitsuMissingSourceIdCount") ?? "(missing)")}`,
      `adultKitsuMissingSourceIdTitles: ${JSON.stringify(pickAdultKitsuFallbackDiagnostic("adultKitsuMissingSourceIdTitles") || [])}`,
      `adultKitsuMissingSourceIdStage: ${JSON.stringify(pickAdultKitsuFallbackDiagnostic("adultKitsuMissingSourceIdStage") || {})}`,
      `adultKitsuOnlyCandidateFamilyQueries: ${JSON.stringify(pickAdultKitsuFallbackDiagnostic("adultKitsuOnlyCandidateFamilyQueries") || [])}`,
      `adultKitsuOnlySelectedQueryReason: ${String(pickAdultKitsuFallbackDiagnostic("adultKitsuOnlySelectedQueryReason") ?? "(missing)")}`,
      `adultKitsuOnlyReplacementReason: ${String(pickAdultKitsuFallbackDiagnostic("adultKitsuOnlyReplacementReason") ?? "(missing)")}`,
      `adultKitsuOnlyQueryComparisonQueries: ${JSON.stringify(pickAdultKitsuFallbackDiagnostic("adultKitsuOnlyQueryComparisonQueries") || [])}`,
      `adultKitsuOnlyQueryQualityComparison: ${JSON.stringify(pickAdultKitsuFallbackDiagnostic("adultKitsuOnlyQueryQualityComparison") || [])}`,
      `adultKitsuOnlyComparisonAcceptedCountsByQuery: ${JSON.stringify(pickAdultKitsuFallbackDiagnostic("adultKitsuOnlyComparisonAcceptedCountsByQuery") || {})}`,
      `adultKitsuOnlyComparisonPromotedQuery: ${String(pickAdultKitsuFallbackDiagnostic("adultKitsuOnlyComparisonPromotedQuery") ?? "(missing)")}`,
      `adultKitsuOnlyComparisonPromotionReason: ${String(pickAdultKitsuFallbackDiagnostic("adultKitsuOnlyComparisonPromotionReason") ?? "(missing)")}`,
      `adultKitsuOnlyComparisonPromotionAcceptedCount: ${String(pickAdultKitsuFallbackDiagnostic("adultKitsuOnlyComparisonPromotionAcceptedCount") ?? "(missing)")}`,
      `adultKitsuOnlyComparisonPromotionReturnedTitles: ${JSON.stringify(pickAdultKitsuFallbackDiagnostic("adultKitsuOnlyComparisonPromotionReturnedTitles") || [])}`,
      `adultKitsuOnlyComparisonQueryTierByQuery: ${JSON.stringify(pickAdultKitsuFallbackDiagnostic("adultKitsuOnlyComparisonQueryTierByQuery") || {})}`,
      `adultKitsuOnlyPromotionTier: ${String(pickAdultKitsuFallbackDiagnostic("adultKitsuOnlyPromotionTier") ?? "(missing)")}`,
      `adultKitsuOnlyPromotionScope: ${String(pickAdultKitsuFallbackDiagnostic("adultKitsuOnlyPromotionScope") ?? "(missing)")}`,
      `adultKitsuOnlyPromotionRejectedReasonByQuery: ${JSON.stringify(pickAdultKitsuFallbackDiagnostic("adultKitsuOnlyPromotionRejectedReasonByQuery") || {})}`,
      `adultKitsuOnlyFamilyScopedBestQuery: ${String(pickAdultKitsuFallbackDiagnostic("adultKitsuOnlyFamilyScopedBestQuery") ?? "(missing)")}`,
      `adultKitsuOnlyBroadBestQuery: ${String(pickAdultKitsuFallbackDiagnostic("adultKitsuOnlyBroadBestQuery") ?? "(missing)")}`,
      `adultKitsuOnlySelectedFamilyAcceptedCount: ${String(pickAdultKitsuFallbackDiagnostic("adultKitsuOnlySelectedFamilyAcceptedCount") ?? "(missing)")}`,
      `adultKitsuOnlySelectedFamilyReturnedCount: ${String(pickAdultKitsuFallbackDiagnostic("adultKitsuOnlySelectedFamilyReturnedCount") ?? "(missing)")}`,
      `adultKitsuOnlySelectedFamilyReturnedFrom: ${String(pickAdultKitsuFallbackDiagnostic("adultKitsuOnlySelectedFamilyReturnedFrom") ?? "(missing)")}`,
      `adultKitsuOnlySelectedFamilyWeakRescueOnly: ${String(pickAdultKitsuFallbackDiagnostic("adultKitsuOnlySelectedFamilyWeakRescueOnly") ?? "(missing)")}`,
      `adultKitsuOnlySelectedFamilyStrongEnoughForFinal: ${String(pickAdultKitsuFallbackDiagnostic("adultKitsuOnlySelectedFamilyStrongEnoughForFinal") ?? "(missing)")}`,
      `adultKitsuOnlyPromotionBlockedBecauseSelectedStrongEnough: ${String(pickAdultKitsuFallbackDiagnostic("adultKitsuOnlyPromotionBlockedBecauseSelectedStrongEnough") ?? "(missing)")}`,
      `adultKitsuOnlyPromotionBlockedBecauseThresholdOnly: ${String(pickAdultKitsuFallbackDiagnostic("adultKitsuOnlyPromotionBlockedBecauseThresholdOnly") ?? "(missing)")}`,
      `adultKitsuOnlyPromotionAllowedBecauseSelectedOnlyWeakRescue: ${String(pickAdultKitsuFallbackDiagnostic("adultKitsuOnlyPromotionAllowedBecauseSelectedOnlyWeakRescue") ?? "(missing)")}`,
      `adultKitsuOnlyFamilyComparisonExhausted: ${String(pickAdultKitsuFallbackDiagnostic("adultKitsuOnlyFamilyComparisonExhausted") ?? "(missing)")}`,
      `adultKitsuOnlyEmergencyFallbackQueriesTried: ${JSON.stringify(pickAdultKitsuFallbackDiagnostic("adultKitsuOnlyEmergencyFallbackQueriesTried") || [])}`,
      `adultKitsuOnlyEmergencyFallbackAcceptedCountsByQuery: ${JSON.stringify(pickAdultKitsuFallbackDiagnostic("adultKitsuOnlyEmergencyFallbackAcceptedCountsByQuery") || {})}`,
      `adultKitsuOnlyEmergencyFallbackSelectedQuery: ${String(pickAdultKitsuFallbackDiagnostic("adultKitsuOnlyEmergencyFallbackSelectedQuery") ?? "(missing)")}`,
      `adultKitsuOnlyEmergencyFallbackReason: ${String(pickAdultKitsuFallbackDiagnostic("adultKitsuOnlyEmergencyFallbackReason") ?? "(missing)")}`,
      `adultKitsuOnlyEmergencyFallbackRejectedReasonByQuery: ${JSON.stringify(pickAdultKitsuFallbackDiagnostic("adultKitsuOnlyEmergencyFallbackRejectedReasonByQuery") || {})}`,
      `adultKitsuOnlyFormatOnlyLaneDetected: ${String(pickAdultKitsuFallbackDiagnostic("adultKitsuOnlyFormatOnlyLaneDetected") ?? "(missing)")}`,
      `adultKitsuOnlyGenericLaneFallbackSuppressedByRouterFamily: ${String(pickAdultKitsuFallbackDiagnostic("adultKitsuOnlyGenericLaneFallbackSuppressedByRouterFamily") ?? "(missing)")}`,
      `adultKitsuOnlyRouterFamilyPrimarySelectedBeforeAdapterFallback: ${String(pickAdultKitsuFallbackDiagnostic("adultKitsuOnlyRouterFamilyPrimarySelectedBeforeAdapterFallback") ?? "(missing)")}`,
      `adultKitsuOnlySelectedQueryWouldHaveBeenGeneric: ${String(pickAdultKitsuFallbackDiagnostic("adultKitsuOnlySelectedQueryWouldHaveBeenGeneric") ?? "(missing)")}`,
      `adultKitsuOnlySelectedQueryAfterRouterFamilyOverride: ${String(pickAdultKitsuFallbackDiagnostic("adultKitsuOnlySelectedQueryAfterRouterFamilyOverride") ?? "(missing)")}`,
      `adultKitsuOnlyFamilyPlanningBypassReason: ${String(pickAdultKitsuFallbackDiagnostic("adultKitsuOnlyFamilyPlanningBypassReason") ?? "(missing)")}`,
      `adultKitsuOnlyFamilyPropagationTrace: ${JSON.stringify(pickAdultKitsuFallbackDiagnostic("adultKitsuOnlyFamilyPropagationTrace") || [])}`,
      `adultKitsuOnlyComparisonFamilyAnchor: ${String(pickAdultKitsuFallbackDiagnostic("adultKitsuOnlyComparisonFamilyAnchor") ?? "(missing)")}`,
      `adultKitsuOnlyFinalKitsuFetchQuery: ${String(pickAdultKitsuFallbackDiagnostic("adultKitsuOnlyFinalKitsuFetchQuery") ?? "(missing)")}`,
      `adultKitsuOnlyFallbackQueriesPlanned: ${JSON.stringify(pickAdultKitsuFallbackDiagnostic("adultKitsuOnlyFallbackQueriesPlanned") || [])}`,
      `adultKitsuOnlyFallbackQueriesAttempted: ${JSON.stringify(pickAdultKitsuFallbackDiagnostic("adultKitsuOnlyFallbackQueriesAttempted") || [])}`,
      `adultKitsuOnlyFallbackStoppedReason: ${String(pickAdultKitsuFallbackDiagnostic("adultKitsuOnlyFallbackStoppedReason") ?? "(missing)")}`,
      `adultKitsuOnlyFallbackTimeline: ${JSON.stringify(pickAdultKitsuFallbackDiagnostic("adultKitsuOnlyFallbackTimeline") || [])}`,
    ];
    const hasBeforeRouterCall = globalRouterPhases.some((row: any) => String(row?.phase || "") === "getRecommendations_before_router_call");
    const hasInvocationAboutToAwait = globalRouterPhases.some((row: any) => String(row?.phase || "") === "actual_router_invocation_about_to_await");
    const hasRouterEntered = globalRouterPhases.some((row: any) => String(row?.phase || "") === "router_entered");
    const latestEarlyReturnPhase = [...globalRouterPhases]
      .reverse()
      .find((row: any) => String(row?.phase || "") === "getRecommendations_early_return");
    const latestTimeoutPhase = [...globalRouterPhases]
      .reverse()
      .find((row: any) => String(row?.phase || "") === "actual_router_invocation_rejected" || String(row?.phase || "") === "after_getRecommendations_call");
    const parseTs = (v: any) => {
      const n = Date.parse(String(v || ""));
      return Number.isFinite(n) ? n : NaN;
    };
    const earlyReturnMs = parseTs((latestEarlyReturnPhase as any)?.timestamp);
    const timeoutMsTs = parseTs((latestTimeoutPhase as any)?.timestamp);
    const earlyReturnCloseToTimeout = Number.isFinite(earlyReturnMs) && Number.isFinite(timeoutMsTs) && (earlyReturnMs - timeoutMsTs) >= 0 && (earlyReturnMs - timeoutMsTs) <= 1000;
    const earlyReturnReason = String((latestEarlyReturnPhase as any)?.getRecommendationsEarlyReturnReason || "");
    if (presetRecommendationCompleted) setPresetExportedAfterRecommendation(true);
    const recomputedRight = swipeHistory.filter((entry) => entry.direction === "like").length;
    const recomputedLeft = swipeHistory.filter((entry) => entry.direction === "dislike").length;
    const recomputedSkip = swipeHistory.filter((entry) => entry.direction === "skip").length;
    const recomputedDecisions = recomputedRight + recomputedLeft;
    const recomputedSummary = `Right:${recomputedRight} â€¢ Left:${recomputedLeft} â€¢ Skip:${recomputedSkip} â€¢ Decisions:${recomputedDecisions} â€¢ 20Q:${resolvedTwentyQCount}/${twentyQObjectives.length}`;
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
              `${i + 1}. ${title} â€” ${author}${year}`,
              `   source: ${diagnostics.source ?? doc?.source ?? "(unknown)"}`,
              `   queryFamily: ${diagnostics.queryFamily ?? doc?.queryFamily ?? inferQueryFamily(queryText)}`,
              `   preFilterScore: ${diagnostics.preFilterScore ?? "(missing)"}`,
              `   postFilterScore: ${diagnostics.postFilterScore ?? "(missing)"}`,
              `   genreFacetMatch: ${diagnostics.genreFacetMatch ?? diagnostics.scoreBreakdown?.genreFacetMatch ?? "(missing)"}`,
              `   positiveTasteMatch: ${diagnostics.positiveTasteMatch ?? diagnostics.scoreBreakdown?.positiveTasteMatch ?? "(missing)"}`,
              `   avoidSignalPenalty: ${diagnostics.avoidSignalPenalty ?? (((diagnostics.scoreBreakdown?.avoidSignalPenalty ?? 0) + (diagnostics.scoreBreakdown?.broadAvoidSignalPenalty ?? 0)) || "(missing)")}`,
              `   preciseAvoidSignalPenalty: ${diagnostics.preciseAvoidSignalPenalty ?? diagnostics.scoreBreakdown?.avoidSignalPenalty ?? "(missing)"}`,
              `   broadAvoidSignalPenalty: ${diagnostics.broadAvoidSignalPenalty ?? diagnostics.scoreBreakdown?.broadAvoidSignalPenalty ?? "(missing)"}`,
              `   ageTeenSuitability: ${diagnostics.ageTeenSuitability ?? diagnostics.scoreBreakdown?.ageTeenSuitability ?? "(missing)"}`,
              `   ageBandSuitability: ${diagnostics.ageBandSuitability ?? diagnostics.scoreBreakdown?.ageBandSuitability ?? diagnostics.scoreBreakdown?.ageTeenSuitability ?? "(missing)"}`,
              `   sourceQualityRelevance: ${diagnostics.sourceQualityRelevance ?? diagnostics.scoreBreakdown?.sourceQualityRelevance ?? "(missing)"}`,
              `   queryRungBonus: ${diagnostics.queryRungBonus ?? diagnostics.scoreBreakdown?.queryRungBonus ?? "(missing)"}`,
              `   queryText: ${queryText}`,
              `   queryRung: ${diagnostics.queryRung ?? doc?.queryRung ?? "(missing)"}`,
              ...formatDiagnosticObject(diagnostics, ["baseIntent", "baseIntentLocked", "matchedQueryTokens", "filterTrace", "filterType", "rejectedBy"]).map((line) => `   ${line}`),
            ].join("\n");
          }
          const title = item.book?.title ?? "Untitled";
          const author = item.book?.author ?? "Unknown author";
          const year = item.book?.year ? ` (${item.book.year})` : "";
          return `${i + 1}. ${title} â€” ${author}${year}`;
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
          const details = [author, genre, tags].filter(Boolean).join(" â€” ");
          return `${index + 1}. ${entry.direction.toUpperCase()} â€” ${title}${details ? ` â€” ${details}` : ""}`;
        }).join("\n")
      : "(none)";

    const v2DiagnosticsForReport = (lastRecommendationResult as any)?.v2Diagnostics || v2DebugResult?.diagnostics || null;
    const openLibraryDiagnosticsForExport = (v2DiagnosticsForReport?.sources || []).find((source: any) => source.source === "openLibrary") || {};
    const lastResultForExport = lastRecommendationResult as any;
    const openLibraryEmptyReasonExport = String(lastResultForExport?.openLibrarySourceEmptyReason || openLibraryDiagnosticsForExport.emptyReason || "");
    const openLibraryTopUpTargetExport = lastResultForExport?.openLibraryTopUpTarget !== undefined ? lastResultForExport.openLibraryTopUpTarget : openLibraryDiagnosticsForExport.openLibraryTopUpTarget;
    const openLibraryUsableRowsExport = lastResultForExport?.openLibraryUsableRowsAfterFiltering !== undefined ? lastResultForExport.openLibraryUsableRowsAfterFiltering : openLibraryDiagnosticsForExport.usableRowsAfterFiltering;
    const openLibraryTopUpExport = {
      ran: Boolean(lastResultForExport?.openLibraryTopUpRan || openLibraryDiagnosticsForExport.openLibraryTopUpRan),
      target: openLibraryTopUpTargetExport,
      exhausted: Boolean(lastResultForExport?.openLibraryFallbackQueriesExhausted || openLibraryDiagnosticsForExport.openLibraryFallbackQueriesExhausted),
      usableRowsAfterFiltering: openLibraryUsableRowsExport,
    };
    const rejectedReasonsForReport = (v2DiagnosticsForReport?.rejectedReasons || {}) as Record<string, unknown>;
    const v2DiagnosticLines = v2DiagnosticsForReport
      ? [
          `engineVersion:${String(lastResultForExport?.engineVersion || v2DebugResult?.engineVersion || "recommender-v2-openlibrary-baseline")}`,
          `requestId:${v2DiagnosticsForReport.requestId}`,
          `items:${(Array.isArray(v2DebugResult?.items) ? v2DebugResult?.items : []).map((item) => item.title).join(" | ") || (Array.isArray(v2DiagnosticsForReport.finalSelectionTitles) ? v2DiagnosticsForReport.finalSelectionTitles.join(" | ") : "(none)")}`,
          `tasteProfile:${JSON.stringify(v2DiagnosticsForReport.tasteProfile || {})}`,
          `searchPlan:${JSON.stringify(v2DiagnosticsForReport.searchPlan || {})}`,
          `stages:${(v2DiagnosticsForReport.stages || []).map((stage: any) => `${stage.stage}:${JSON.stringify(stage.counts || {})}`).join(" -> ")}`,
          `sources:${JSON.stringify((v2DiagnosticsForReport.sources || []).map((source: any) => ({ source: source.source, status: source.status, rawCount: source.rawCount, normalizedCount: source.normalizedCount, queries: source.queries, rawTitles: source.rawTitles, firstReturnedTitles: source.firstReturnedTitles, rawApiResultCount: source.rawApiResultCount, droppedBeforeDocCount: source.droppedBeforeDocCount, dropReasons: source.dropReasons, openLibraryTopUpRan: source.openLibraryTopUpRan, openLibraryTopUpTarget: source.openLibraryTopUpTarget, openLibraryFallbackQueriesExhausted: source.openLibraryFallbackQueriesExhausted, usableRowsAfterFiltering: source.usableRowsAfterFiltering, openLibraryQueryRouting: source.openLibraryQueryRouting, artifactSuppressedTitles: source.artifactSuppressedTitles, seriesSuppressedTitles: source.seriesSuppressedTitles, emptyReason: source.emptyReason, openLibraryProbeRan: source.openLibraryProbeRan, skippedReason: source.skippedReason, failedReason: source.failedReason, nytAdapterVersion: source.nytAdapterVersion, nytRequestedLists: source.nytRequestedLists, nytReturnedLists: source.nytReturnedLists, nytBooksPerList: source.nytBooksPerList, nytEndpointCalledByList: source.nytEndpointCalledByList, nytHttpStatusByList: source.nytHttpStatusByList, nytRawBookCount: source.nytRawBookCount, nytConvertedCount: source.nytConvertedCount, nytDroppedCount: source.nytDroppedCount, nytDropReasons: source.nytDropReasons, nytTitlePresentCount: source.nytTitlePresentCount, nytAuthorPresentCount: source.nytAuthorPresentCount, nytIsbnPresentCount: source.nytIsbnPresentCount, nytNormalizedTitles: source.nytNormalizedTitles, nytQuotaBlocked: source.nytQuotaBlocked, nytRetryAfterMs: source.nytRetryAfterMs, nytCacheHitByList: source.nytCacheHitByList, nytUsedOverview: source.nytUsedOverview })))}`,
          `openLibrarySourceFetchDiagnostics:${JSON.stringify(lastResultForExport?.openLibrarySourceFetchDiagnostics || openLibraryDiagnosticsForExport.fetches || [])}`,
          `openLibraryProbeRan:${String(Boolean(lastResultForExport?.openLibraryProbeRan || openLibraryDiagnosticsForExport.openLibraryProbeRan))}`,
          `openLibraryEmptyReason:${openLibraryEmptyReasonExport}`,
          `openLibraryTopUp:${JSON.stringify(openLibraryTopUpExport)}`,
          `openLibraryQueryRouting:${JSON.stringify(lastResultForExport?.openLibraryQueryRouting || openLibraryDiagnosticsForExport.openLibraryQueryRouting || {})}`,
          `openLibraryCrossSessionRepeatedTitles:${JSON.stringify(lastResultForExport?.openLibraryCrossSessionRepeatedTitles || [])}`,
          `openLibraryCrossSessionRepeatedRoots:${JSON.stringify(lastResultForExport?.openLibraryCrossSessionRepeatedRoots || [])}`,
          `normalizedCount:${String((lastRecommendationResult as any)?.normalizedCount ?? ((v2DiagnosticsForReport.stages || []).find((stage: any) => stage.stage === "normalized")?.counts?.normalized ?? 0))}`,
          `scoredCount:${String((lastRecommendationResult as any)?.scoredCount ?? ((v2DiagnosticsForReport.stages || []).find((stage: any) => stage.stage === "scored")?.counts?.scored ?? 0))}`,
          `rejectedReasons:${JSON.stringify(rejectedReasonsForReport)}`,
          `adultOpenLibrarySparseExceptionFailedConditionsByTitle:${JSON.stringify(rejectedReasonsForReport.adultOpenLibrarySparseExceptionFailedConditionsByTitle || {})}`,
          `adultOpenLibrarySparseExceptionSupportEvidenceGroupsByTitle:${JSON.stringify(rejectedReasonsForReport.adultOpenLibrarySparseExceptionSupportEvidenceGroupsByTitle || {})}`,
          `adultOpenLibrarySparseExceptionLikedItemCountByTitle:${JSON.stringify(rejectedReasonsForReport.adultOpenLibrarySparseExceptionLikedItemCountByTitle || {})}`,
          `adultOpenLibrarySparseExceptionDislikedItemCountByTitle:${JSON.stringify(rejectedReasonsForReport.adultOpenLibrarySparseExceptionDislikedItemCountByTitle || {})}`,
          `adultOpenLibrarySparseExceptionLikedWeightByTitle:${JSON.stringify(rejectedReasonsForReport.adultOpenLibrarySparseExceptionLikedWeightByTitle || {})}`,
          `adultOpenLibrarySparseExceptionDislikedWeightByTitle:${JSON.stringify(rejectedReasonsForReport.adultOpenLibrarySparseExceptionDislikedWeightByTitle || {})}`,
          `adultOpenLibrarySparseExceptionNetWeightByTitle:${JSON.stringify(rejectedReasonsForReport.adultOpenLibrarySparseExceptionNetWeightByTitle || {})}`,
          `adultOpenLibrarySparseExceptionProfileSupportPassedByTitle:${JSON.stringify(rejectedReasonsForReport.adultOpenLibrarySparseExceptionProfileSupportPassedByTitle || {})}`,
          `adultOpenLibrarySparseExceptionCredibleSubjectPassedByTitle:${JSON.stringify(rejectedReasonsForReport.adultOpenLibrarySparseExceptionCredibleSubjectPassedByTitle || {})}`,
          `adultOpenLibrarySparseExceptionBibliographicIdentityPassedByTitle:${JSON.stringify(rejectedReasonsForReport.adultOpenLibrarySparseExceptionBibliographicIdentityPassedByTitle || {})}`,
          `adultOpenLibrarySparseExceptionSourceQualityPassedByTitle:${JSON.stringify(rejectedReasonsForReport.adultOpenLibrarySparseExceptionSourceQualityPassedByTitle || {})}`,
          `adultOpenLibrarySparseExceptionAgeSuitabilityPassedByTitle:${JSON.stringify(rejectedReasonsForReport.adultOpenLibrarySparseExceptionAgeSuitabilityPassedByTitle || {})}`,
          `adultOpenLibrarySparseExceptionYouthAudiencePassedByTitle:${JSON.stringify(rejectedReasonsForReport.adultOpenLibrarySparseExceptionYouthAudiencePassedByTitle || {})}`,
          `adultOpenLibrarySparseExceptionNarrativeShapePassedByTitle:${JSON.stringify(rejectedReasonsForReport.adultOpenLibrarySparseExceptionNarrativeShapePassedByTitle || {})}`,
          `adultOpenLibrarySparseExceptionArtifactPassedByTitle:${JSON.stringify(rejectedReasonsForReport.adultOpenLibrarySparseExceptionArtifactPassedByTitle || {})}`,
          `finalSelectedTitles:${JSON.stringify(v2DiagnosticsForReport.finalSelectionTitles || [])}`,
        ]
      : [`status:${v2DebugLoading ? "running" : v2DebugError ? "error" : "not_run"}`, `error:${v2DebugError || "(none)"}`];

    const adultRoutePolarityExportLines = [
      `adultRoutePolarityDiagnosticsExportVersion:v1`,
      `adultRouteLikedWeightByFamily:${JSON.stringify(lastResultForExport?.adultRouteLikedWeightByFamily || {})}`,
      `adultRouteDislikedWeightByFamily:${JSON.stringify(lastResultForExport?.adultRouteDislikedWeightByFamily || {})}`,
      `adultRouteNetWeightByFamily:${JSON.stringify(lastResultForExport?.adultRouteNetWeightByFamily || {})}`,
      `adultRoutePositiveFamilies:${JSON.stringify(lastResultForExport?.adultRoutePositiveFamilies || [])}`,
      `adultRouteSuppressedConflictedFamilies:${JSON.stringify(lastResultForExport?.adultRouteSuppressedConflictedFamilies || [])}`,
      `adultRouteSelectedFamily:${String(lastResultForExport?.adultRouteSelectedFamily || "")}`,
      `adultRouteSelectionReason:${String(lastResultForExport?.adultRouteSelectionReason || "")}`,
    ];

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
      `sourceEnabled.nyt:${Boolean((lastSourceEnabled as any)?.nyt)}`,
      `mockSourceEnabled:${Boolean((lastRecommendationResult as any)?.mockSourceEnabled)}`,
      `mockSourceActivationReason:${String((lastRecommendationResult as any)?.mockSourceActivationReason || "mock_source_disabled_or_skipped")}`,
      `mockSourceRawCount:${Number((lastRecommendationResult as any)?.mockSourceRawCount || 0)}`,
      `mockSourceReturnedTitles:${JSON.stringify((lastRecommendationResult as any)?.mockSourceReturnedTitles || [])}`,
      `mockSourceSuppressedInNormalRun:${Boolean((lastRecommendationResult as any)?.mockSourceSuppressedInNormalRun ?? true)}`,
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
      `routerResultType:${typeof (lastRecommendationResult as any)}`,
      `routerResult.debugRouterVersion:${(lastRecommendationResult as any)?.debugRouterVersion || "(missing)"}`,
      `routerResult.trace.debugRouterVersion:${((lastRecommendationResult as any)?.debugComicVineDispatchTrace || (lastRecommendationResult as any)?.debugGcdDispatchTrace || {})?.debugRouterVersion || "(missing)"}`,
      `routerResultTracePresent:${Boolean(lastRouterResultTracePresent)}`,
      `routerResultKeys:${lastRouterResultKeys.length ? lastRouterResultKeys.join(", ") : "(none)"}`,
      `finalAcceptedDocsLength:${Number((lastRecommendationResult as any)?.finalAcceptedDocsLength || 0)}`,
      `renderedTopRecommendationsLength:${Number((lastRecommendationResult as any)?.renderedTopRecommendationsLength || 0)}`,
      `googleBooksAcceptedTitlesByStage:${JSON.stringify((lastRecommendationResult as any)?.googleBooksAcceptedTitlesByStage || {})}`,
      `googleBooksRankedCandidateTitles:${Array.isArray((lastRecommendationResult as any)?.googleBooksAcceptedTitlesByStage?.googleBooksRankedCandidateTitles) && (lastRecommendationResult as any).googleBooksAcceptedTitlesByStage.googleBooksRankedCandidateTitles.length ? (lastRecommendationResult as any).googleBooksAcceptedTitlesByStage.googleBooksRankedCandidateTitles.join(" | ") : "(none)"}`,
      `googleBooksDroppedStage:${String((lastRecommendationResult as any)?.googleBooksDroppedStage || "")}`,
      `googleBooksDroppedReason:${String((lastRecommendationResult as any)?.googleBooksDroppedReason || "")}`,
      `googleBooksDroppedStageByTitle:${JSON.stringify((lastRecommendationResult as any)?.googleBooksDroppedStageByTitle || {})}`,
      `googleBooksDroppedReasonByTitle:${JSON.stringify((lastRecommendationResult as any)?.googleBooksDroppedReasonByTitle || {})}`,
      `googleBooksFinalEligibilityDecisionByTitle:${JSON.stringify((lastRecommendationResult as any)?.googleBooksFinalEligibilityDecisionByTitle || {})}`,
      `googleBooksFinalEligibilityReasonByTitle:${JSON.stringify((lastRecommendationResult as any)?.googleBooksFinalEligibilityReasonByTitle || {})}`,
      `googleBooksFinalEligibilityEvidenceByTitle:${JSON.stringify((lastRecommendationResult as any)?.googleBooksFinalEligibilityEvidenceByTitle || {})}`,
      `googleBooksPostRankingGateByTitle:${JSON.stringify((lastRecommendationResult as any)?.googleBooksPostRankingGateByTitle || {})}`,
      `googleBooksPostRankingGateReasonByTitle:${JSON.stringify((lastRecommendationResult as any)?.googleBooksPostRankingGateReasonByTitle || {})}`,
      `googleBooksFinalSelectionDecisionByTitle:${JSON.stringify((lastRecommendationResult as any)?.googleBooksFinalSelectionDecisionByTitle || {})}`,
      `googleBooksFinalSelectionExclusionReasonByTitle:${JSON.stringify((lastRecommendationResult as any)?.googleBooksFinalSelectionExclusionReasonByTitle || {})}`,
      `googleBooksCapDroppedTitles:${JSON.stringify((lastRecommendationResult as any)?.googleBooksCapDroppedTitles || [])}`,
      `googleBooksAgeBandInfrastructureByDeck:${JSON.stringify((lastRecommendationResult as any)?.googleBooksAgeBandInfrastructureByDeck || {})}`,
      `googleBooksAgeBandQueryPlanningByDeck:${JSON.stringify((lastRecommendationResult as any)?.googleBooksAgeBandQueryPlanningByDeck || {})}`,
      `googleBooksAgeBandDispatchByDeck:${JSON.stringify((lastRecommendationResult as any)?.googleBooksAgeBandDispatchByDeck || {})}`,
      `googleBooksAgeBandNormalizationByDeck:${JSON.stringify((lastRecommendationResult as any)?.googleBooksAgeBandNormalizationByDeck || {})}`,
      `googleBooksAgeBandScoringHandoffByDeck:${JSON.stringify((lastRecommendationResult as any)?.googleBooksAgeBandScoringHandoffByDeck || {})}`,
      `googleBooksAgeBandEligibilityHandoffByDeck:${JSON.stringify((lastRecommendationResult as any)?.googleBooksAgeBandEligibilityHandoffByDeck || {})}`,
      `googleBooksAgeBandFinalSelectionHandoffByDeck:${JSON.stringify((lastRecommendationResult as any)?.googleBooksAgeBandFinalSelectionHandoffByDeck || {})}`,
      `googleBooksAgeBandRenderedTitlesByDeck:${JSON.stringify((lastRecommendationResult as any)?.googleBooksAgeBandRenderedTitlesByDeck || {})}`,
      `googleBooksAgeBandDropStageByTitle:${JSON.stringify((lastRecommendationResult as any)?.googleBooksAgeBandDropStageByTitle || {})}`,
      `googleBooksAgeBandDropReasonByTitle:${JSON.stringify((lastRecommendationResult as any)?.googleBooksAgeBandDropReasonByTitle || {})}`,
      `googleBooksStageOrder:${JSON.stringify((lastRecommendationResult as any)?.googleBooksStageOrder || [])}`,
      `googleBooksStageDecisionByTitle:${JSON.stringify((lastRecommendationResult as any)?.googleBooksStageDecisionByTitle || {})}`,
      `googleBooksStageReasonByTitle:${JSON.stringify((lastRecommendationResult as any)?.googleBooksStageReasonByTitle || {})}`,
      `googleBooksStageGateByTitle:${JSON.stringify((lastRecommendationResult as any)?.googleBooksStageGateByTitle || {})}`,
      `googleBooksFinalEligibilityGateByTitle:${JSON.stringify((lastRecommendationResult as any)?.googleBooksFinalEligibilityGateByTitle || {})}`,
      `googleBooksAgeBandInfrastructureGaps:${JSON.stringify((lastRecommendationResult as any)?.googleBooksAgeBandInfrastructureGaps || {})}`,
      `googleBooksAgeBandInfrastructureSummary:${JSON.stringify((lastRecommendationResult as any)?.googleBooksAgeBandInfrastructureSummary || {})}`,
      `googleBooksAudienceBandByTitle:${JSON.stringify((lastRecommendationResult as any)?.googleBooksAudienceBandByTitle || {})}`,
      `googleBooksContentMaturityByTitle:${JSON.stringify((lastRecommendationResult as any)?.googleBooksContentMaturityByTitle || {})}`,
      `googleBooksSourceMaturityRatingByTitle:${JSON.stringify((lastRecommendationResult as any)?.googleBooksSourceMaturityRatingByTitle || {})}`,
      `googleBooksRequestedDeckByTitle:${JSON.stringify((lastRecommendationResult as any)?.googleBooksRequestedDeckByTitle || {})}`,
      `googleBooksAgeSuitabilityDecisionByTitle:${JSON.stringify((lastRecommendationResult as any)?.googleBooksAgeSuitabilityDecisionByTitle || {})}`,
      `googleBooksMaturityDecisionByTitle:${JSON.stringify((lastRecommendationResult as any)?.googleBooksMaturityDecisionByTitle || {})}`,
      `googleBooksAudienceMaturityComparisonByTitle:${JSON.stringify((lastRecommendationResult as any)?.googleBooksAudienceMaturityComparisonByTitle || {})}`,
      `googleBooksAudienceMaturityMismatchTitles:${JSON.stringify((lastRecommendationResult as any)?.googleBooksAudienceMaturityMismatchTitles || [])}`,
      `googleBooksAudienceMaturitySemanticChanges:${JSON.stringify((lastRecommendationResult as any)?.googleBooksAudienceMaturitySemanticChanges || [])}`,
      `adultGoogleBooksProfileLikedFamilies:${JSON.stringify((lastRecommendationResult as any)?.adultGoogleBooksProfileLikedFamilies || [])}`,
      `adultGoogleBooksProfileAvoidFamilies:${JSON.stringify((lastRecommendationResult as any)?.adultGoogleBooksProfileAvoidFamilies || [])}`,
      `adultGoogleBooksCandidateTasteFamiliesByTitle:${JSON.stringify((lastRecommendationResult as any)?.adultGoogleBooksCandidateTasteFamiliesByTitle || {})}`,
      `adultGoogleBooksNegativeNetTasteFamiliesByTitle:${JSON.stringify((lastRecommendationResult as any)?.adultGoogleBooksNegativeNetTasteFamiliesByTitle || {})}`,
      `adultGoogleBooksTasteEvidenceSourceByTitle:${JSON.stringify((lastRecommendationResult as any)?.adultGoogleBooksTasteEvidenceSourceByTitle || {})}`,
      `adultGoogleBooksMeaningfulAlignmentScoreByTitle:${JSON.stringify((lastRecommendationResult as any)?.adultGoogleBooksMeaningfulAlignmentScoreByTitle || {})}`,
      `adultGoogleBooksMeaningfulAlignmentThresholdByTitle:${JSON.stringify((lastRecommendationResult as any)?.adultGoogleBooksMeaningfulAlignmentThresholdByTitle || {})}`,
      `adultGoogleBooksCandidateDocumentSignalsByTitle:${JSON.stringify((lastRecommendationResult as any)?.adultGoogleBooksCandidateDocumentSignalsByTitle || {})}`,
      `adultGoogleBooksSpecificTasteEvidenceByTitle:${JSON.stringify((lastRecommendationResult as any)?.adultGoogleBooksSpecificTasteEvidenceByTitle || {})}`,
      `adultGoogleBooksBroadToneEvidenceByTitle:${JSON.stringify((lastRecommendationResult as any)?.adultGoogleBooksBroadToneEvidenceByTitle || {})}`,
      `adultGoogleBooksContextOnlyEvidenceByTitle:${JSON.stringify((lastRecommendationResult as any)?.adultGoogleBooksContextOnlyEvidenceByTitle || {})}`,
      `adultGoogleBooksMeaningfulAlignmentRuleByTitle:${JSON.stringify((lastRecommendationResult as any)?.adultGoogleBooksMeaningfulAlignmentRuleByTitle || {})}`,
      `adultGoogleBooksMeaningfulAlignmentDecisionByTitle:${JSON.stringify((lastRecommendationResult as any)?.adultGoogleBooksMeaningfulAlignmentDecisionByTitle || {})}`,
      `adultGoogleBooksMeaningfulAlignmentOverrideByTitle:${JSON.stringify((lastRecommendationResult as any)?.adultGoogleBooksMeaningfulAlignmentOverrideByTitle || {})}`,
      `adultGoogleBooksAvoidFamilyOverlapByTitle:${JSON.stringify((lastRecommendationResult as any)?.adultGoogleBooksAvoidFamilyOverlapByTitle || {})}`,
      `adultGoogleBooksMeaningfulAlignmentFailureHistogram:${JSON.stringify((lastRecommendationResult as any)?.adultGoogleBooksMeaningfulAlignmentFailureHistogram || {})}`,
      `adultGoogleBooksMeaningfulAlignmentFailurePercentages:${JSON.stringify((lastRecommendationResult as any)?.adultGoogleBooksMeaningfulAlignmentFailurePercentages || {})}`,
      `adultGoogleBooksMeaningfulAlignmentFailureExamples:${JSON.stringify((lastRecommendationResult as any)?.adultGoogleBooksMeaningfulAlignmentFailureExamples || {})}`,
      `adultGoogleBooksMeaningfulAlignmentFailureReasonByTitle:${JSON.stringify((lastRecommendationResult as any)?.adultGoogleBooksMeaningfulAlignmentFailureReasonByTitle || {})}`,
      `adultGoogleBooksMeaningfulAlignmentFailureDetailsByTitle:${JSON.stringify((lastRecommendationResult as any)?.adultGoogleBooksMeaningfulAlignmentFailureDetailsByTitle || {})}`,
      `adultGoogleBooksMeaningfulAlignmentRootCauseSummary:${String((lastRecommendationResult as any)?.adultGoogleBooksMeaningfulAlignmentRootCauseSummary || "")}`,
      `adultGoogleBooksNarrativeDescriptionByTitle:${JSON.stringify((lastRecommendationResult as any)?.adultGoogleBooksNarrativeDescriptionByTitle || {})}`,
      `adultGoogleBooksNarrativeSemanticPhrasesByTitle:${JSON.stringify((lastRecommendationResult as any)?.adultGoogleBooksNarrativeSemanticPhrasesByTitle || {})}`,
      `adultGoogleBooksNarrativeFamilyMappingsByTitle:${JSON.stringify((lastRecommendationResult as any)?.adultGoogleBooksNarrativeFamilyMappingsByTitle || {})}`,
      `adultGoogleBooksIgnoredNarrativePhrasesByTitle:${JSON.stringify((lastRecommendationResult as any)?.adultGoogleBooksIgnoredNarrativePhrasesByTitle || {})}`,
      `adultGoogleBooksUnmappedNarrativeCuesByTitle:${JSON.stringify((lastRecommendationResult as any)?.adultGoogleBooksUnmappedNarrativeCuesByTitle || {})}`,
      `adultGoogleBooksFutureAliasCandidatesByTitle:${JSON.stringify((lastRecommendationResult as any)?.adultGoogleBooksFutureAliasCandidatesByTitle || {})}`,
      `adultGoogleBooksNarrativeParserConfidenceByTitle:${JSON.stringify((lastRecommendationResult as any)?.adultGoogleBooksNarrativeParserConfidenceByTitle || {})}`,
      `adultGoogleBooksExpectedVsExtractedFamilyEvidenceByTitle:${JSON.stringify((lastRecommendationResult as any)?.adultGoogleBooksExpectedVsExtractedFamilyEvidenceByTitle || {})}`,
      `adultGoogleBooksUnmappedNarrativePhraseHistogram:${JSON.stringify((lastRecommendationResult as any)?.adultGoogleBooksUnmappedNarrativePhraseHistogram || {})}`,
      `adultGoogleBooksUnmappedNarrativeCueHistogramByFamily:${JSON.stringify((lastRecommendationResult as any)?.adultGoogleBooksUnmappedNarrativeCueHistogramByFamily || {})}`,
      `adultGoogleBooksFutureAliasCandidateHistogram:${JSON.stringify((lastRecommendationResult as any)?.adultGoogleBooksFutureAliasCandidateHistogram || {})}`,
      `adultGoogleBooksNarrativeFamilyExtractionExamplesByFamily:${JSON.stringify((lastRecommendationResult as any)?.adultGoogleBooksNarrativeFamilyExtractionExamplesByFamily || {})}`,
      `adultGoogleBooksNarrativeFamilyExtractionRootCauseSummary:${String((lastRecommendationResult as any)?.adultGoogleBooksNarrativeFamilyExtractionRootCauseSummary || "")}`,
      `adultGoogleBooksNarrativeCueClassificationByTitle:${JSON.stringify((lastRecommendationResult as any)?.adultGoogleBooksNarrativeCueClassificationByTitle || {})}`,
      `adultGoogleBooksNarrativeCueClassificationHistogram:${JSON.stringify((lastRecommendationResult as any)?.adultGoogleBooksNarrativeCueClassificationHistogram || {})}`,
      `adultGoogleBooksCanonicalCueMissingFamilyByTitle:${JSON.stringify((lastRecommendationResult as any)?.adultGoogleBooksCanonicalCueMissingFamilyByTitle || {})}`,
      `adultGoogleBooksCanonicalCueMissingFamilyHistogram:${JSON.stringify((lastRecommendationResult as any)?.adultGoogleBooksCanonicalCueMissingFamilyHistogram || {})}`,
      `adultGoogleBooksGenuineAliasCandidatesByTitle:${JSON.stringify((lastRecommendationResult as any)?.adultGoogleBooksGenuineAliasCandidatesByTitle || {})}`,
      `adultGoogleBooksGenuineAliasCandidateHistogram:${JSON.stringify((lastRecommendationResult as any)?.adultGoogleBooksGenuineAliasCandidateHistogram || {})}`,
      `adultGoogleBooksNarrativeCuePolarityOutcomeByTitle:${JSON.stringify((lastRecommendationResult as any)?.adultGoogleBooksNarrativeCuePolarityOutcomeByTitle || {})}`,
      `adultGoogleBooksNarrativeCueFalseUnmappedSuppressedByTitle:${JSON.stringify((lastRecommendationResult as any)?.adultGoogleBooksNarrativeCueFalseUnmappedSuppressedByTitle || {})}`,
      `adultGoogleBooksNarrativeExtractionDiagnosticSummary:${String((lastRecommendationResult as any)?.adultGoogleBooksNarrativeExtractionDiagnosticSummary || "")}`,
      `adultGoogleBooksCanonicalNarrativeFamilyPromotionsByTitle:${JSON.stringify((lastRecommendationResult as any)?.adultGoogleBooksCanonicalNarrativeFamilyPromotionsByTitle || {})}`,
      `adultGoogleBooksCanonicalNarrativeFamilyPromotionEvidenceByTitle:${JSON.stringify((lastRecommendationResult as any)?.adultGoogleBooksCanonicalNarrativeFamilyPromotionEvidenceByTitle || {})}`,
      `adultGoogleBooksCanonicalNarrativeFamilyPromotionFieldByTitle:${JSON.stringify((lastRecommendationResult as any)?.adultGoogleBooksCanonicalNarrativeFamilyPromotionFieldByTitle || {})}`,
      `adultGoogleBooksCanonicalNarrativeFamilyPromotionPhraseByTitle:${JSON.stringify((lastRecommendationResult as any)?.adultGoogleBooksCanonicalNarrativeFamilyPromotionPhraseByTitle || {})}`,
      `adultGoogleBooksCanonicalNarrativeFamilyPromotionDecisionByTitle:${JSON.stringify((lastRecommendationResult as any)?.adultGoogleBooksCanonicalNarrativeFamilyPromotionDecisionByTitle || {})}`,
      `adultGoogleBooksCanonicalMissingFamilyBeforeByTitle:${JSON.stringify((lastRecommendationResult as any)?.adultGoogleBooksCanonicalMissingFamilyBeforeByTitle || {})}`,
      `adultGoogleBooksCanonicalMissingFamilyAfterByTitle:${JSON.stringify((lastRecommendationResult as any)?.adultGoogleBooksCanonicalMissingFamilyAfterByTitle || {})}`,
      `adultGoogleBooksCanonicalMissingFamilyResolvedTitles:${JSON.stringify((lastRecommendationResult as any)?.adultGoogleBooksCanonicalMissingFamilyResolvedTitles || [])}`,
      `adultGoogleBooksCanonicalMissingFamilyUnresolvedTitles:${JSON.stringify((lastRecommendationResult as any)?.adultGoogleBooksCanonicalMissingFamilyUnresolvedTitles || [])}`,
      `adultGoogleBooksCanonicalNarrativeFamilyPromotionHistogram:${JSON.stringify((lastRecommendationResult as any)?.adultGoogleBooksCanonicalNarrativeFamilyPromotionHistogram || {})}`,
      `adultGoogleBooksCanonicalNarrativeFamilyPromotionEligibilityChanges:${JSON.stringify((lastRecommendationResult as any)?.adultGoogleBooksCanonicalNarrativeFamilyPromotionEligibilityChanges || {})}`,
      `adultGoogleBooksFinalSlateIdentityByTitle:${JSON.stringify((lastRecommendationResult as any)?.adultGoogleBooksFinalSlateIdentityByTitle || {})}`,
      `adultGoogleBooksFinalSlateIdentityEvidenceByTitle:${JSON.stringify((lastRecommendationResult as any)?.adultGoogleBooksFinalSlateIdentityEvidenceByTitle || {})}`,
      `adultGoogleBooksFinalSlateIdentityConfidenceByTitle:${JSON.stringify((lastRecommendationResult as any)?.adultGoogleBooksFinalSlateIdentityConfidenceByTitle || {})}`,
      `adultGoogleBooksFinalSlateIdentityAgreementByTitle:${JSON.stringify((lastRecommendationResult as any)?.adultGoogleBooksFinalSlateIdentityAgreementByTitle || {})}`,
      `adultGoogleBooksFinalSlateIdentityHistogram:${JSON.stringify((lastRecommendationResult as any)?.adultGoogleBooksFinalSlateIdentityHistogram || {})}`,
      `adultGoogleBooksLikelyNonNarrativeFalseAcceptedTitles:${JSON.stringify((lastRecommendationResult as any)?.adultGoogleBooksLikelyNonNarrativeFalseAcceptedTitles || [])}`,
      `adultGoogleBooksLikelyCollectionFalseAcceptedTitles:${JSON.stringify((lastRecommendationResult as any)?.adultGoogleBooksLikelyCollectionFalseAcceptedTitles || [])}`,
      `adultGoogleBooksLikelyNarrativeFalseRejectedTitles:${JSON.stringify((lastRecommendationResult as any)?.adultGoogleBooksLikelyNarrativeFalseRejectedTitles || [])}`,
      `adultGoogleBooksRenderedIdentityAudit:${JSON.stringify((lastRecommendationResult as any)?.adultGoogleBooksRenderedIdentityAudit || {})}`,
      `adultGoogleBooksFinalSlateIdentityRootCauseHistogram:${JSON.stringify((lastRecommendationResult as any)?.adultGoogleBooksFinalSlateIdentityRootCauseHistogram || {})}`,
      `adultGoogleBooksFinalSlateIdentityAuditSummary:${String((lastRecommendationResult as any)?.adultGoogleBooksFinalSlateIdentityAuditSummary || "")}`,
      `adultGoogleBooksFinalSlateIdentityFlaggedDetailsByTitle:${JSON.stringify((lastRecommendationResult as any)?.adultGoogleBooksFinalSlateIdentityFlaggedDetailsByTitle || {})}`,
      `adultGoogleBooksIdentityEnforcementDecisionByTitle:${JSON.stringify((lastRecommendationResult as any)?.adultGoogleBooksIdentityEnforcementDecisionByTitle || {})}`,
      `adultGoogleBooksIdentityEnforcementReasonByTitle:${JSON.stringify((lastRecommendationResult as any)?.adultGoogleBooksIdentityEnforcementReasonByTitle || {})}`,
      `adultGoogleBooksIdentityRejectedTitles:${JSON.stringify((lastRecommendationResult as any)?.adultGoogleBooksIdentityRejectedTitles || [])}`,
      `adultGoogleBooksIdentityAcceptedTitles:${JSON.stringify((lastRecommendationResult as any)?.adultGoogleBooksIdentityAcceptedTitles || [])}`,
      `adultGoogleBooksIdentityEnforcementHistogram:${JSON.stringify((lastRecommendationResult as any)?.adultGoogleBooksIdentityEnforcementHistogram || {})}`,
      `adultGoogleBooksIdentityBehaviorChanges:${JSON.stringify((lastRecommendationResult as any)?.adultGoogleBooksIdentityBehaviorChanges || {})}`,
      `adultGoogleBooksNarrativeStrengthScoreByTitle:${JSON.stringify((lastRecommendationResult as any)?.adultGoogleBooksNarrativeStrengthScoreByTitle || {})}`,
      `adultGoogleBooksNarrativeStrengthComponentsByTitle:${JSON.stringify((lastRecommendationResult as any)?.adultGoogleBooksNarrativeStrengthComponentsByTitle || {})}`,
      `adultGoogleBooksNarrativeStrengthEvidenceByTitle:${JSON.stringify((lastRecommendationResult as any)?.adultGoogleBooksNarrativeStrengthEvidenceByTitle || {})}`,
      `adultGoogleBooksNarrativeStrengthSelectionScoreByTitle:${JSON.stringify((lastRecommendationResult as any)?.adultGoogleBooksNarrativeStrengthSelectionScoreByTitle || {})}`,
      `adultGoogleBooksNarrativeStrengthRankBeforeByTitle:${JSON.stringify((lastRecommendationResult as any)?.adultGoogleBooksNarrativeStrengthRankBeforeByTitle || {})}`,
      `adultGoogleBooksNarrativeStrengthRankAfterByTitle:${JSON.stringify((lastRecommendationResult as any)?.adultGoogleBooksNarrativeStrengthRankAfterByTitle || {})}`,
      `adultGoogleBooksNarrativeStrengthRankDeltaByTitle:${JSON.stringify((lastRecommendationResult as any)?.adultGoogleBooksNarrativeStrengthRankDeltaByTitle || {})}`,
      `adultGoogleBooksNarrativeStrengthAppliedTitles:${JSON.stringify((lastRecommendationResult as any)?.adultGoogleBooksNarrativeStrengthAppliedTitles || [])}`,
      `adultGoogleBooksNarrativeStrengthRankingChanges:${JSON.stringify((lastRecommendationResult as any)?.adultGoogleBooksNarrativeStrengthRankingChanges || {})}`,
      `adultGoogleBooksSignalMatchTraceByTitle:${JSON.stringify((lastRecommendationResult as any)?.adultGoogleBooksSignalMatchTraceByTitle || {})}`,
      `adultGoogleBooksSignalMatchedFieldByTitle:${JSON.stringify((lastRecommendationResult as any)?.adultGoogleBooksSignalMatchedFieldByTitle || {})}`,
      `adultGoogleBooksSignalMatchedTextByTitle:${JSON.stringify((lastRecommendationResult as any)?.adultGoogleBooksSignalMatchedTextByTitle || {})}`,
      `adultGoogleBooksSignalMatchMethodByTitle:${JSON.stringify((lastRecommendationResult as any)?.adultGoogleBooksSignalMatchMethodByTitle || {})}`,
      `adultGoogleBooksShortSignalSubstringMatchesByTitle:${JSON.stringify((lastRecommendationResult as any)?.adultGoogleBooksShortSignalSubstringMatchesByTitle || {})}`,
      `adultGoogleBooksRejectedShortSignalMatchesByTitle:${JSON.stringify((lastRecommendationResult as any)?.adultGoogleBooksRejectedShortSignalMatchesByTitle || {})}`,
      `adultTasteProductionPolarityByFamily:${JSON.stringify((lastRecommendationResult as any)?.adultTasteProductionPolarityByFamily || {})}`,
      `adultTasteProductionPolarityResolutionReasonByFamily:${JSON.stringify((lastRecommendationResult as any)?.adultTasteProductionPolarityResolutionReasonByFamily || {})}`,
      `adultTasteProductionPolarityExplanationByFamily:${JSON.stringify((lastRecommendationResult as any)?.adultTasteProductionPolarityExplanationByFamily || {})}`,
      `adultTasteMixedFamilyProductionExplanationByFamily:${JSON.stringify((lastRecommendationResult as any)?.adultTasteMixedFamilyProductionExplanationByFamily || {})}`,
      `adultTasteProductionPolarityRuleHistogram:${JSON.stringify((lastRecommendationResult as any)?.adultTasteProductionPolarityRuleHistogram || {})}`,
      `adultTasteMixedFamilyProductionRuleHistogram:${JSON.stringify((lastRecommendationResult as any)?.adultTasteMixedFamilyProductionRuleHistogram || {})}`,
      `adultTasteProductionLikedFamilies:${JSON.stringify((lastRecommendationResult as any)?.adultTasteProductionLikedFamilies || [])}`,
      `adultTasteProductionAvoidFamilies:${JSON.stringify((lastRecommendationResult as any)?.adultTasteProductionAvoidFamilies || [])}`,
      `adultTasteProductionMixedPositiveFamilies:${JSON.stringify((lastRecommendationResult as any)?.adultTasteProductionMixedPositiveFamilies || [])}`,
      `adultTasteProductionMixedNeutralFamilies:${JSON.stringify((lastRecommendationResult as any)?.adultTasteProductionMixedNeutralFamilies || [])}`,
      `adultTasteProductionMixedNegativeFamilies:${JSON.stringify((lastRecommendationResult as any)?.adultTasteProductionMixedNegativeFamilies || [])}`,
      `adultTasteSkippedSignalsRemovedFromProductionProfile:${JSON.stringify((lastRecommendationResult as any)?.adultTasteSkippedSignalsRemovedFromProductionProfile || [])}`,
      `adultTasteWeightedProductionNewPassTitles:${JSON.stringify((lastRecommendationResult as any)?.adultTasteWeightedProductionNewPassTitles || [])}`,
      `adultTasteWeightedProductionNewFailTitles:${JSON.stringify((lastRecommendationResult as any)?.adultTasteWeightedProductionNewFailTitles || [])}`,
      `adultTasteWeightedProductionDecisionReasonByTitle:${JSON.stringify((lastRecommendationResult as any)?.adultTasteWeightedProductionDecisionReasonByTitle || {})}`,
      `adultGoogleBooksProductionNonPositiveFamilyPresenceRuleHistogram:${JSON.stringify((lastRecommendationResult as any)?.adultGoogleBooksProductionNonPositiveFamilyPresenceRuleHistogram || {})}`,
      `adultGoogleBooksProductionNonPositiveFamilyPresenceCandidatesByRule:${JSON.stringify((lastRecommendationResult as any)?.adultGoogleBooksProductionNonPositiveFamilyPresenceCandidatesByRule || {})}`,
      `adultGoogleBooksProductionNonPositiveFamilyPresenceFamiliesByTitle:${JSON.stringify((lastRecommendationResult as any)?.adultGoogleBooksProductionNonPositiveFamilyPresenceFamiliesByTitle || {})}`,
      `adultGoogleBooksProductionNonPositiveFamilyPresenceDetailsByTitle:${JSON.stringify((lastRecommendationResult as any)?.adultGoogleBooksProductionNonPositiveFamilyPresenceDetailsByTitle || {})}`,
      `adultGoogleBooksProductionSuppressionDiagnosticsDeprecated:${String((lastRecommendationResult as any)?.adultGoogleBooksProductionSuppressionDiagnosticsDeprecated || "")}`,
      `adultGoogleBooksFamilyPolarityEffectByTitle:${JSON.stringify((lastRecommendationResult as any)?.adultGoogleBooksFamilyPolarityEffectByTitle || {})}`,
      `adultGoogleBooksFamilyPolarityEffectHistogram:${JSON.stringify((lastRecommendationResult as any)?.adultGoogleBooksFamilyPolarityEffectHistogram || {})}`,
      `adultGoogleBooksFamilyPositiveSupportSuppressedByTitle:${JSON.stringify((lastRecommendationResult as any)?.adultGoogleBooksFamilyPositiveSupportSuppressedByTitle || {})}`,
      `adultGoogleBooksPolarityNondecisiveEffectsByTitle:${JSON.stringify((lastRecommendationResult as any)?.adultGoogleBooksPolarityNondecisiveEffectsByTitle || {})}`,
      `adultGoogleBooksPolarityDecisiveRejectionByTitle:${JSON.stringify((lastRecommendationResult as any)?.adultGoogleBooksPolarityDecisiveRejectionByTitle || {})}`,
      `adultGoogleBooksPolarityMultiFactorRejectionByTitle:${JSON.stringify((lastRecommendationResult as any)?.adultGoogleBooksPolarityMultiFactorRejectionByTitle || {})}`,
      `adultGoogleBooksPolarityUnrelatedRejectionByTitle:${JSON.stringify((lastRecommendationResult as any)?.adultGoogleBooksPolarityUnrelatedRejectionByTitle || {})}`,
      `adultGoogleBooksPolarityCausalityStateByTitle:${JSON.stringify((lastRecommendationResult as any)?.adultGoogleBooksPolarityCausalityStateByTitle || {})}`,
      `adultGoogleBooksPolarityCausalityHistogram:${JSON.stringify((lastRecommendationResult as any)?.adultGoogleBooksPolarityCausalityHistogram || {})}`,
      `adultGoogleBooksPolarityCounterfactualsByTitle:${JSON.stringify((lastRecommendationResult as any)?.adultGoogleBooksPolarityCounterfactualsByTitle || {})}`,
      `adultGoogleBooksPolarityCounterfactualPassTitles:${JSON.stringify((lastRecommendationResult as any)?.adultGoogleBooksPolarityCounterfactualPassTitles || [])}`,
      `adultGoogleBooksPolarityCounterfactualStillFailTitles:${JSON.stringify((lastRecommendationResult as any)?.adultGoogleBooksPolarityCounterfactualStillFailTitles || [])}`,
      `adultGoogleBooksPolarityDecisiveRuleHistogram:${JSON.stringify((lastRecommendationResult as any)?.adultGoogleBooksPolarityDecisiveRuleHistogram || {})}`,
      `googleBooksWrapperInputTitles:${Array.isArray((lastRecommendationResult as any)?.googleBooksWrapperInputTitles) && (lastRecommendationResult as any).googleBooksWrapperInputTitles.length ? (lastRecommendationResult as any).googleBooksWrapperInputTitles.join(" | ") : "(none)"}`,
      `googleBooksWrapperOutputTitles:${Array.isArray((lastRecommendationResult as any)?.googleBooksWrapperOutputTitles) && (lastRecommendationResult as any).googleBooksWrapperOutputTitles.length ? (lastRecommendationResult as any).googleBooksWrapperOutputTitles.join(" | ") : "(none)"}`,
      `googleBooksRendererInputTitles:${Array.isArray((lastRecommendationResult as any)?.googleBooksRendererInputTitles) && (lastRecommendationResult as any).googleBooksRendererInputTitles.length ? (lastRecommendationResult as any).googleBooksRendererInputTitles.join(" | ") : "(none)"}`,
      `googleBooksRendererOutputTitles:${Array.isArray((lastRecommendationResult as any)?.googleBooksRendererOutputTitles) && (lastRecommendationResult as any).googleBooksRendererOutputTitles.length ? (lastRecommendationResult as any).googleBooksRendererOutputTitles.join(" | ") : "(none)"}`,
      `googleBooksPlaceholderReplacementReason:${String((lastRecommendationResult as any)?.googleBooksPlaceholderReplacementReason || "")}`,
      `googleBooksRejectedBeforeRankingReason:${JSON.stringify((lastRecommendationResult as any)?.googleBooksRejectedBeforeRankingReason || {})}`,
      `googleBooksPublicationShapeByTitle:${JSON.stringify((lastRecommendationResult as any)?.googleBooksPublicationShapeByTitle || {})}`,
      `googleBooksNarrativeConfidenceByTitle:${JSON.stringify((lastRecommendationResult as any)?.googleBooksNarrativeConfidenceByTitle || {})}`,
      `googleBooksPublicationShapeEvidenceByTitle:${JSON.stringify((lastRecommendationResult as any)?.googleBooksPublicationShapeEvidenceByTitle || {})}`,
      `googleBooksNarrativePriorityAdjustmentByTitle:${JSON.stringify((lastRecommendationResult as any)?.googleBooksNarrativePriorityAdjustmentByTitle || {})}`,
      `googleBooksPublicationShapeRejectedBeforeRankingByTitle:${JSON.stringify((lastRecommendationResult as any)?.googleBooksPublicationShapeRejectedBeforeRankingByTitle || {})}`,
      `googleBooksDominantPublicationShapeEvidenceByTitle:${JSON.stringify((lastRecommendationResult as any)?.googleBooksDominantPublicationShapeEvidenceByTitle || {})}`,
      `googleBooksOverriddenNarrativeEvidenceByTitle:${JSON.stringify((lastRecommendationResult as any)?.googleBooksOverriddenNarrativeEvidenceByTitle || {})}`,
      `googleBooksPublicationShapePrecedenceDecisionByTitle:${JSON.stringify((lastRecommendationResult as any)?.googleBooksPublicationShapePrecedenceDecisionByTitle || {})}`,
      `googleBooksExplicitNonNarrativeIdentityByTitle:${JSON.stringify((lastRecommendationResult as any)?.googleBooksExplicitNonNarrativeIdentityByTitle || {})}`,
      `googleBooksStoryLevelNarrativeEvidenceByTitle:${JSON.stringify((lastRecommendationResult as any)?.googleBooksStoryLevelNarrativeEvidenceByTitle || {})}`,
      `googleBooksGenericCategoryTitleByTitle:${JSON.stringify((lastRecommendationResult as any)?.googleBooksGenericCategoryTitleByTitle || {})}`,
      `googleBooksGenericCategoryEvidenceByTitle:${JSON.stringify((lastRecommendationResult as any)?.googleBooksGenericCategoryEvidenceByTitle || {})}`,
      `googleBooksGenericCategoryRejectedBeforeRankingByTitle:${JSON.stringify((lastRecommendationResult as any)?.googleBooksGenericCategoryRejectedBeforeRankingByTitle || {})}`,
      `googleBooksUnknownShapeEligibilityByTitle:${JSON.stringify((lastRecommendationResult as any)?.googleBooksUnknownShapeEligibilityByTitle || {})}`,
      `googleBooksUnknownShapeEvidenceByTitle:${JSON.stringify((lastRecommendationResult as any)?.googleBooksUnknownShapeEvidenceByTitle || {})}`,
      `googleBooksUnknownShapeRejectedReasonByTitle:${JSON.stringify((lastRecommendationResult as any)?.googleBooksUnknownShapeRejectedReasonByTitle || {})}`,
      `googleBooksUnknownStoryEvidenceCountByTitle:${JSON.stringify((lastRecommendationResult as any)?.googleBooksUnknownStoryEvidenceCountByTitle || {})}`,
      `googleBooksUnknownStoryEvidenceFamiliesByTitle:${JSON.stringify((lastRecommendationResult as any)?.googleBooksUnknownStoryEvidenceFamiliesByTitle || {})}`,
      `googleBooksUnknownNarrativeCorroborationByTitle:${JSON.stringify((lastRecommendationResult as any)?.googleBooksUnknownNarrativeCorroborationByTitle || {})}`,
      `googleBooksUnknownEligibilityThresholdDecisionByTitle:${JSON.stringify((lastRecommendationResult as any)?.googleBooksUnknownEligibilityThresholdDecisionByTitle || {})}`,
      `googleBooksSubjectOfStudyTitleByTitle:${JSON.stringify((lastRecommendationResult as any)?.googleBooksSubjectOfStudyTitleByTitle || {})}`,
      `googleBooksSubjectOfStudyEvidenceByTitle:${JSON.stringify((lastRecommendationResult as any)?.googleBooksSubjectOfStudyEvidenceByTitle || {})}`,
      `googleBooksSubjectOfStudyRejectedBeforeRankingByTitle:${JSON.stringify((lastRecommendationResult as any)?.googleBooksSubjectOfStudyRejectedBeforeRankingByTitle || {})}`,
      `googleBooksCuratedBookGuideIdentityByTitle:${JSON.stringify((lastRecommendationResult as any)?.googleBooksCuratedBookGuideIdentityByTitle || {})}`,
      `googleBooksCuratedBookGuideEvidenceByTitle:${JSON.stringify((lastRecommendationResult as any)?.googleBooksCuratedBookGuideEvidenceByTitle || {})}`,
      `googleBooksPeriodicalIdentityEvidenceByTitle:${JSON.stringify((lastRecommendationResult as any)?.googleBooksPeriodicalIdentityEvidenceByTitle || {})}`,
      `googleBooksPeriodicalIdentityDecisionByTitle:${JSON.stringify((lastRecommendationResult as any)?.googleBooksPeriodicalIdentityDecisionByTitle || {})}`,
      `googleBooksPublicationYearByTitle:${JSON.stringify((lastRecommendationResult as any)?.googleBooksPublicationYearByTitle || {})}`,
      `googleBooksDescriptionPresentByTitle:${JSON.stringify((lastRecommendationResult as any)?.googleBooksDescriptionPresentByTitle || {})}`,
      `googleBooksIsbnPresentByTitle:${JSON.stringify((lastRecommendationResult as any)?.googleBooksIsbnPresentByTitle || {})}`,
      `googleBooksRatingsCountByTitle:${JSON.stringify((lastRecommendationResult as any)?.googleBooksRatingsCountByTitle || {})}`,
      `googleBooksQueryResultQualityByQuery:${JSON.stringify((lastRecommendationResult as any)?.googleBooksQueryResultQualityByQuery || {})}`,
      `adultGoogleBooksQueryQualityByQuery:${JSON.stringify((lastRecommendationResult as any)?.adultGoogleBooksQueryQualityByQuery || {})}`,
      `adultGoogleBooksPublicationShapeHistogramByQuery:${JSON.stringify((lastRecommendationResult as any)?.adultGoogleBooksPublicationShapeHistogramByQuery || {})}`,
      `adultGoogleBooksRejectedShapeHistogramByQuery:${JSON.stringify((lastRecommendationResult as any)?.adultGoogleBooksRejectedShapeHistogramByQuery || {})}`,
      `adultGoogleBooksNarrativeYieldByQuery:${JSON.stringify((lastRecommendationResult as any)?.adultGoogleBooksNarrativeYieldByQuery || {})}`,
      `adultGoogleBooksNarrativeEfficiencyByQuery:${JSON.stringify((lastRecommendationResult as any)?.adultGoogleBooksNarrativeEfficiencyByQuery || {})}`,
      `googleBooksModernNarrativeCountByQuery:${JSON.stringify((lastRecommendationResult as any)?.googleBooksModernNarrativeCountByQuery || {})}`,
      `googleBooksPublicDomainCatalogShapeCountByQuery:${JSON.stringify((lastRecommendationResult as any)?.googleBooksPublicDomainCatalogShapeCountByQuery || {})}`,
      `preteenGoogleBooksPublicationIdentityByTitle:${JSON.stringify((lastRecommendationResult as any)?.preteenGoogleBooksPublicationIdentityByTitle || {})}`,
      `preteenGoogleBooksPublicationIdentityConfidenceByTitle:${JSON.stringify((lastRecommendationResult as any)?.preteenGoogleBooksPublicationIdentityConfidenceByTitle || {})}`,
      `preteenGoogleBooksPublicationIdentityEvidenceByTitle:${JSON.stringify((lastRecommendationResult as any)?.preteenGoogleBooksPublicationIdentityEvidenceByTitle || {})}`,
      `preteenGoogleBooksPublicationNarrativeEvidenceByTitle:${JSON.stringify((lastRecommendationResult as any)?.preteenGoogleBooksPublicationNarrativeEvidenceByTitle || {})}`,
      `preteenGoogleBooksPublicationArtifactEvidenceByTitle:${JSON.stringify((lastRecommendationResult as any)?.preteenGoogleBooksPublicationArtifactEvidenceByTitle || {})}`,
      `preteenGoogleBooksPublicationNarrativeConfidenceSourceByTitle:${JSON.stringify((lastRecommendationResult as any)?.preteenGoogleBooksPublicationNarrativeConfidenceSourceByTitle || {})}`,
      `preteenGoogleBooksPublicationTrustedFieldEvidenceByTitle:${JSON.stringify((lastRecommendationResult as any)?.preteenGoogleBooksPublicationTrustedFieldEvidenceByTitle || {})}`,
      `preteenGoogleBooksPublicationOverriddenNarrativeEvidenceByTitle:${JSON.stringify((lastRecommendationResult as any)?.preteenGoogleBooksPublicationOverriddenNarrativeEvidenceByTitle || {})}`,
      `preteenGoogleBooksPublicationDecisionByTitle:${JSON.stringify((lastRecommendationResult as any)?.preteenGoogleBooksPublicationDecisionByTitle || {})}`,
      `preteenGoogleBooksPublicationReasonByTitle:${JSON.stringify((lastRecommendationResult as any)?.preteenGoogleBooksPublicationReasonByTitle || {})}`,
      `preteenGoogleBooksPublicationRecommendedFuturePolicyByTitle:${JSON.stringify((lastRecommendationResult as any)?.preteenGoogleBooksPublicationRecommendedFuturePolicyByTitle || {})}`,
      `preteenGoogleBooksPublicationRejectedTitles:${JSON.stringify((lastRecommendationResult as any)?.preteenGoogleBooksPublicationRejectedTitles || [])}`,
      `preteenGoogleBooksPublicationAcceptedTitles:${JSON.stringify((lastRecommendationResult as any)?.preteenGoogleBooksPublicationAcceptedTitles || [])}`,
      `preteenGoogleBooksPublicationShapeAuditByTitle:${JSON.stringify((lastRecommendationResult as any)?.preteenGoogleBooksPublicationShapeAuditByTitle || {})}`,
      `preteenGoogleBooksPublicationShapeRejectedTitles:${JSON.stringify((lastRecommendationResult as any)?.preteenGoogleBooksPublicationShapeRejectedTitles || [])}`,
      `preteenGoogleBooksPublicationShapeRejectedReasonByTitle:${JSON.stringify((lastRecommendationResult as any)?.preteenGoogleBooksPublicationShapeRejectedReasonByTitle || {})}`,
      `preteenGoogleBooksPublicationShapeNarrativeEvidenceByTitle:${JSON.stringify((lastRecommendationResult as any)?.preteenGoogleBooksPublicationShapeNarrativeEvidenceByTitle || {})}`,
      `preteenGoogleBooksPublicationShapeArtifactEvidenceByTitle:${JSON.stringify((lastRecommendationResult as any)?.preteenGoogleBooksPublicationShapeArtifactEvidenceByTitle || {})}`,
      `preteenGoogleBooksPublicationShapeCounterfactualDecisionByTitle:${JSON.stringify((lastRecommendationResult as any)?.preteenGoogleBooksPublicationShapeCounterfactualDecisionByTitle || {})}`,
      `preteenGoogleBooksPublicationShapeLikelyFalseRejectTitles:${JSON.stringify((lastRecommendationResult as any)?.preteenGoogleBooksPublicationShapeLikelyFalseRejectTitles || [])}`,
      `preteenGoogleBooksPublicationShapeLikelyCorrectRejectTitles:${JSON.stringify((lastRecommendationResult as any)?.preteenGoogleBooksPublicationShapeLikelyCorrectRejectTitles || [])}`,
      `preteenGoogleBooksPublicationShapeAmbiguousRejectTitles:${JSON.stringify((lastRecommendationResult as any)?.preteenGoogleBooksPublicationShapeAmbiguousRejectTitles || [])}`,
      `preteenGoogleBooksPublicationShapeFalseRejectHistogram:${JSON.stringify((lastRecommendationResult as any)?.preteenGoogleBooksPublicationShapeFalseRejectHistogram || {})}`,
      `preteenGoogleBooksPublicationShapeAuditSummary:${JSON.stringify((lastRecommendationResult as any)?.preteenGoogleBooksPublicationShapeAuditSummary || {})}`,
      `preteenGoogleBooksPublicationShapeRescueAppliedByTitle:${JSON.stringify((lastRecommendationResult as any)?.preteenGoogleBooksPublicationShapeRescueAppliedByTitle || {})}`,
      `preteenGoogleBooksPublicationShapeRescueReasonByTitle:${JSON.stringify((lastRecommendationResult as any)?.preteenGoogleBooksPublicationShapeRescueReasonByTitle || {})}`,
      `preteenGoogleBooksPublicationShapeRescueEvidenceByTitle:${JSON.stringify((lastRecommendationResult as any)?.preteenGoogleBooksPublicationShapeRescueEvidenceByTitle || {})}`,
      `preteenGoogleBooksPublicationShapeRescuedTitles:${JSON.stringify((lastRecommendationResult as any)?.preteenGoogleBooksPublicationShapeRescuedTitles || [])}`,
      `preteenGoogleBooksPublicationShapeRescueRejectedTitles:${JSON.stringify((lastRecommendationResult as any)?.preteenGoogleBooksPublicationShapeRescueRejectedTitles || [])}`,
      `preteenGoogleBooksPublicationShapeRescueRejectedReasonByTitle:${JSON.stringify((lastRecommendationResult as any)?.preteenGoogleBooksPublicationShapeRescueRejectedReasonByTitle || {})}`,
      `preteenGoogleBooksPublicationShapeRescueEnteredScoringTitles:${JSON.stringify((lastRecommendationResult as any)?.preteenGoogleBooksPublicationShapeRescueEnteredScoringTitles || [])}`,
      `preteenGoogleBooksPublicationShapeRescueSelectedTitles:${JSON.stringify((lastRecommendationResult as any)?.preteenGoogleBooksPublicationShapeRescueSelectedTitles || [])}`,
      `preteenGoogleBooksPublicationShapeRescueNotSelectedReasonByTitle:${JSON.stringify((lastRecommendationResult as any)?.preteenGoogleBooksPublicationShapeRescueNotSelectedReasonByTitle || {})}`,
      `preteenGoogleBooksPublicationShapeRescueSummary:${JSON.stringify((lastRecommendationResult as any)?.preteenGoogleBooksPublicationShapeRescueSummary || {})}`,
      `teenPostPassInputLength:${Number((lastRecommendationResult as any)?.teenPostPassInputLength || 0)}`,
      `teenPostPassOutputLength:${Number((lastRecommendationResult as any)?.teenPostPassOutputLength || 0)}`,
      `teenPostPassOutputTitles:${Array.isArray((lastRecommendationResult as any)?.teenPostPassOutputTitles) && (lastRecommendationResult as any).teenPostPassOutputTitles.length ? (lastRecommendationResult as any).teenPostPassOutputTitles.join(" | ") : "(none)"}`,
      `teenPostPassGlobalHandoffConsidered:${Boolean((lastRecommendationResult as any)?.teenPostPassGlobalHandoffConsidered)}`,
      `teenPostPassGlobalHandoffAcceptedTitles:${Array.isArray((lastRecommendationResult as any)?.teenPostPassGlobalHandoffAcceptedTitles) && (lastRecommendationResult as any).teenPostPassGlobalHandoffAcceptedTitles.length ? (lastRecommendationResult as any).teenPostPassGlobalHandoffAcceptedTitles.join(" | ") : "(none)"}`,
      `teenPostPassGlobalHandoffRejectedByTitle:${JSON.stringify((lastRecommendationResult as any)?.teenPostPassGlobalHandoffRejectedByTitle || {})}`,
      `normalFinalGateRecoveryConsidered:${Boolean((lastRecommendationResult as any)?.normalFinalGateRecoveryConsidered)}`,
      `normalFinalGateRecoveryAcceptedTitles:${Array.isArray((lastRecommendationResult as any)?.normalFinalGateRecoveryAcceptedTitles) && (lastRecommendationResult as any).normalFinalGateRecoveryAcceptedTitles.length ? (lastRecommendationResult as any).normalFinalGateRecoveryAcceptedTitles.join(" | ") : "(none)"}`,
      `normalFinalGateRecoveryRejectedByTitle:${JSON.stringify((lastRecommendationResult as any)?.normalFinalGateRecoveryRejectedByTitle || {})}`,
      `kitsuNormalRecoveryConsidered:${Boolean((lastRecommendationResult as any)?.kitsuNormalRecoveryConsidered)}`,
      `kitsuNormalRecoveryAcceptedTitles:${Array.isArray((lastRecommendationResult as any)?.kitsuNormalRecoveryAcceptedTitles) && (lastRecommendationResult as any).kitsuNormalRecoveryAcceptedTitles.length ? (lastRecommendationResult as any).kitsuNormalRecoveryAcceptedTitles.join(" | ") : "(none)"}`,
      `kitsuNormalRecoveryRejectedByTitle:${JSON.stringify((lastRecommendationResult as any)?.kitsuNormalRecoveryRejectedByTitle || {})}`,
      ...teenKitsuFinalGuardReportLines,
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
      `positiveFitRescuePoolLength:${Number((lastRecommendationResult as any)?.positiveFitRescuePoolLength || 0)}`,
      `positiveFitRescuePoolSourceCounts:${JSON.stringify((lastRecommendationResult as any)?.positiveFitRescuePoolSourceCounts || {})}`,
      `positiveFitRescueCandidateTitlesBeforeSafety:${Array.isArray((lastRecommendationResult as any)?.positiveFitRescueCandidateTitlesBeforeSafety) && (lastRecommendationResult as any).positiveFitRescueCandidateTitlesBeforeSafety.length ? (lastRecommendationResult as any).positiveFitRescueCandidateTitlesBeforeSafety.join(" | ") : "(none)"}`,
      `positiveFitRescueCandidateTitlesAfterSafety:${Array.isArray((lastRecommendationResult as any)?.positiveFitRescueCandidateTitlesAfterSafety) && (lastRecommendationResult as any).positiveFitRescueCandidateTitlesAfterSafety.length ? (lastRecommendationResult as any).positiveFitRescueCandidateTitlesAfterSafety.join(" | ") : "(none)"}`,
      `positiveFitRescueExcludedByReason:${JSON.stringify((lastRecommendationResult as any)?.positiveFitRescueExcludedByReason || {})}`,
      `positiveFitRescueEligibleTitles:${Array.isArray((lastRecommendationResult as any)?.positiveFitRescueEligibleTitles) && (lastRecommendationResult as any).positiveFitRescueEligibleTitles.length ? (lastRecommendationResult as any).positiveFitRescueEligibleTitles.join(" | ") : "(none)"}`,
      `positiveFitRescueRejectedReasons:${JSON.stringify((lastRecommendationResult as any)?.positiveFitRescueRejectedReasons || {})}`,
      `positiveFitRescueTopUpApplied:${Boolean((lastRecommendationResult as any)?.positiveFitRescueTopUpApplied)}`,
      `positiveFitRescueReturnedTitles:${Array.isArray((lastRecommendationResult as any)?.positiveFitRescueReturnedTitles) && (lastRecommendationResult as any).positiveFitRescueReturnedTitles.length ? (lastRecommendationResult as any).positiveFitRescueReturnedTitles.join(" | ") : "(none)"}`,
      `emergencySafeRescueReturnedTitles:${Array.isArray((lastRecommendationResult as any)?.emergencySafeRescueReturnedTitles) && (lastRecommendationResult as any).emergencySafeRescueReturnedTitles.length ? (lastRecommendationResult as any).emergencySafeRescueReturnedTitles.join(" | ") : "(none)"}`,
      `teenPostPassInputSource:${String((lastRecommendationResult as any)?.teenPostPassInputSource || "unknown")}`,
      `scoredCandidateUniverseCount:${Number((lastRecommendationResult as any)?.scoredCandidateUniverseCount || 0)}`,
      `convertedDocsAvailableForScoringCount:${Number((lastRecommendationResult as any)?.convertedDocsAvailableForScoringCount || 0)}`,
      `openLibraryDocsFetchedAcrossAllQueriesCount:${Number((lastRecommendationResult as any)?.openLibraryDocsFetchedAcrossAllQueriesCount || 0)}`,
      `openLibraryDocsEligibleForScoringCount:${Number((lastRecommendationResult as any)?.openLibraryDocsEligibleForScoringCount || 0)}`,
      `openLibraryDocsActuallyHandedToScoringCount:${Number((lastRecommendationResult as any)?.openLibraryDocsActuallyHandedToScoringCount || 0)}`,
      `openLibraryScoringHandoffLimitedToSourceFinal:${Boolean((lastRecommendationResult as any)?.openLibraryScoringHandoffLimitedToSourceFinal)}`,
      `openLibraryScoringHandoffSource:${String((lastRecommendationResult as any)?.openLibraryScoringHandoffSource || "")}`,
      `meaningfulTasteRecoveryTriggered:${Boolean((lastRecommendationResult as any)?.meaningfulTasteRecoveryTriggered)}`,
      `meaningfulTasteRecoveryTriggerStage:${String((lastRecommendationResult as any)?.meaningfulTasteRecoveryTriggerStage || "")}`,
      `meaningfulTasteRecoverySkippedReason:${String((lastRecommendationResult as any)?.meaningfulTasteRecoverySkippedReason || "")}`,
      `postFinalEligibilityUnderfillRecoveryTriggered:${Boolean((lastRecommendationResult as any)?.postFinalEligibilityUnderfillRecoveryTriggered)}`,
      `postFinalEligibilityRecoveryAcceptedTitles:${Array.isArray((lastRecommendationResult as any)?.postFinalEligibilityRecoveryAcceptedTitles) && (lastRecommendationResult as any).postFinalEligibilityRecoveryAcceptedTitles.length ? (lastRecommendationResult as any).postFinalEligibilityRecoveryAcceptedTitles.join(" | ") : "(none)"}`,
      `postFinalEligibilityRecoveryRejectedByReason:${JSON.stringify((lastRecommendationResult as any)?.postFinalEligibilityRecoveryRejectedByReason || {})}`,
      `meaningfulTasteRecoverySurvivingFinalCount:${Number((lastRecommendationResult as any)?.meaningfulTasteRecoverySurvivingFinalCount || 0)}`,
      `meaningfulTasteRecoveryContinuedAfterRejectedMerge:${Boolean((lastRecommendationResult as any)?.meaningfulTasteRecoveryContinuedAfterRejectedMerge)}`,
      `meaningfulTasteRecoveryExhaustedQueries:${Array.isArray((lastRecommendationResult as any)?.meaningfulTasteRecoveryExhaustedQueries) && (lastRecommendationResult as any).meaningfulTasteRecoveryExhaustedQueries.length ? (lastRecommendationResult as any).meaningfulTasteRecoveryExhaustedQueries.join(" | ") : "(none)"}`,
      `meaningfulTasteRecoveryRejectedQueryFamilies:${Array.isArray((lastRecommendationResult as any)?.meaningfulTasteRecoveryRejectedQueryFamilies) && (lastRecommendationResult as any).meaningfulTasteRecoveryRejectedQueryFamilies.length ? (lastRecommendationResult as any).meaningfulTasteRecoveryRejectedQueryFamilies.join(" | ") : "(none)"}`,
      `recoverySuccessRequiresFinalEligibility:${Boolean((lastRecommendationResult as any)?.recoverySuccessRequiresFinalEligibility)}`,
      `middleGradesRecoveryFinalShortfallReason:${String((lastRecommendationResult as any)?.middleGradesRecoveryFinalShortfallReason || "")}`,
      `middleGradesRecoveryRejectedReasonCounts:${JSON.stringify((lastRecommendationResult as any)?.middleGradesRecoveryRejectedReasonCounts || {})}`,
      `middleGradesRecoveryBestRejectedTitlesByReason:${JSON.stringify((lastRecommendationResult as any)?.middleGradesRecoveryBestRejectedTitlesByReason || {})}`,
      `middleGradesRecoveryNextBestSelectableTitles:${Array.isArray((lastRecommendationResult as any)?.middleGradesRecoveryNextBestSelectableTitles) && (lastRecommendationResult as any).middleGradesRecoveryNextBestSelectableTitles.length ? (lastRecommendationResult as any).middleGradesRecoveryNextBestSelectableTitles.join(" | ") : "(none)"}`,
      `middleGradesRecoveryCouldHaveReachedFiveIfRelaxedGate:${Boolean((lastRecommendationResult as any)?.middleGradesRecoveryCouldHaveReachedFiveIfRelaxedGate)}`,
      `middleGradesRecoveryRelaxedGateNeeded:${String((lastRecommendationResult as any)?.middleGradesRecoveryRelaxedGateNeeded || "")}`,
      `recoveryQueryAnchorByQuery:${JSON.stringify((lastRecommendationResult as any)?.recoveryQueryAnchorByQuery || {})}`,
      `recoveryHumorUsedAsAnchorBlocked:${Boolean((lastRecommendationResult as any)?.recoveryHumorUsedAsAnchorBlocked)}`,
      `recoveryConcreteFictionQueryUsed:${Boolean((lastRecommendationResult as any)?.recoveryConcreteFictionQueryUsed)}`,
      `recoveryQueryFamilyAcceptedFinalCount:${JSON.stringify((lastRecommendationResult as any)?.recoveryQueryFamilyAcceptedFinalCount || {})}`,
      `recoveryQueryFamilyRejectedForLeakageCount:${JSON.stringify((lastRecommendationResult as any)?.recoveryQueryFamilyRejectedForLeakageCount || {})}`,
      `meaningfulTasteRecoveryQueriesAttempted:${Array.isArray((lastRecommendationResult as any)?.meaningfulTasteRecoveryQueriesAttempted) && (lastRecommendationResult as any).meaningfulTasteRecoveryQueriesAttempted.length ? (lastRecommendationResult as any).meaningfulTasteRecoveryQueriesAttempted.join(" | ") : "(none)"}`,
      `meaningfulTasteRecoveryAcceptedTitles:${Array.isArray((lastRecommendationResult as any)?.meaningfulTasteRecoveryAcceptedTitles) && (lastRecommendationResult as any).meaningfulTasteRecoveryAcceptedTitles.length ? (lastRecommendationResult as any).meaningfulTasteRecoveryAcceptedTitles.join(" | ") : "(none)"}`,
      `meaningfulTasteRecoveryRejectedTitlesByReason:${JSON.stringify((lastRecommendationResult as any)?.meaningfulTasteRecoveryRejectedTitlesByReason || {})}`,
      `meaningfulTasteRecoveryFinalCount:${Number((lastRecommendationResult as any)?.meaningfulTasteRecoveryFinalCount || 0)}`,
      `underfilledAfterMeaningfulTasteRecovery:${Boolean((lastRecommendationResult as any)?.underfilledAfterMeaningfulTasteRecovery)}`,
      `meaningfulTasteRecoveryMergedIntoScoring:${Boolean((lastRecommendationResult as any)?.meaningfulTasteRecoveryMergedIntoScoring)}`,
      `meaningfulTasteRecoveryMergedCandidateCount:${Number((lastRecommendationResult as any)?.meaningfulTasteRecoveryMergedCandidateCount || 0)}`,
      `meaningfulTasteRecoveryDroppedAfterMergeByReason:${JSON.stringify((lastRecommendationResult as any)?.meaningfulTasteRecoveryDroppedAfterMergeByReason || {})}`,
      `meaningfulTasteRecoveryAcceptedButNotReturnedTitles:${Array.isArray((lastRecommendationResult as any)?.meaningfulTasteRecoveryAcceptedButNotReturnedTitles) && (lastRecommendationResult as any).meaningfulTasteRecoveryAcceptedButNotReturnedTitles.length ? (lastRecommendationResult as any).meaningfulTasteRecoveryAcceptedButNotReturnedTitles.join(" | ") : "(none)"}`,
      `meaningfulTasteRecoveryFinalSelectionCount:${Number((lastRecommendationResult as any)?.meaningfulTasteRecoveryFinalSelectionCount || 0)}`,
      `middleGradesExpandedPoolHandoffFailed:${Boolean((lastRecommendationResult as any)?.middleGradesExpandedPoolHandoffFailed)}`,
      `middleGradesExpandedPoolFailureReason:${String((lastRecommendationResult as any)?.middleGradesExpandedPoolFailureReason || "")}`,
      `gcdStructuralEnrichmentCount:${Number((lastRecommendationResult as any)?.gcdStructuralEnrichmentCount || 0)}`,
      `gcdEnrichmentApplied:${Number((lastRecommendationResult as any)?.gcdStructuralEnrichmentCount || 0) > 0}`,
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
      `genericTasteSignalsRemovedByTitle:${JSON.stringify((lastRecommendationResult as any)?.genericTasteSignalsRemovedByTitle || {})}`,
      `genericOnlyTasteMatchTitles:${Array.isArray((lastRecommendationResult as any)?.genericOnlyTasteMatchTitles) && (lastRecommendationResult as any).genericOnlyTasteMatchTitles.length ? (lastRecommendationResult as any).genericOnlyTasteMatchTitles.join(" | ") : "(none)"}`,
      `documentBackedTasteSignalsByTitle:${JSON.stringify((lastRecommendationResult as any)?.documentBackedTasteSignalsByTitle || {})}`,
      `teenGoogleBooksMeaningfulTasteClassificationHistogram:${JSON.stringify((lastRecommendationResult as any)?.teenGoogleBooksMeaningfulTasteClassificationHistogram || {})}`,
      `teenGoogleBooksMeaningfulTasteClassificationByTitle:${JSON.stringify((lastRecommendationResult as any)?.teenGoogleBooksMeaningfulTasteClassificationByTitle || {})}`,
      `teenGoogleBooksNetMeaningfulAlignmentScoreByTitle:${JSON.stringify((lastRecommendationResult as any)?.teenGoogleBooksNetMeaningfulAlignmentScoreByTitle || {})}`,
      `teenGoogleBooksDocumentNativeSpecificSignalsByTitle:${JSON.stringify((lastRecommendationResult as any)?.teenGoogleBooksDocumentNativeSpecificSignalsByTitle || {})}`,
      `teenGoogleBooksQueryFamilyOnlySignalsByTitle:${JSON.stringify((lastRecommendationResult as any)?.teenGoogleBooksQueryFamilyOnlySignalsByTitle || {})}`,
      `teenGoogleBooksCategoryOnlySignalsByTitle:${JSON.stringify((lastRecommendationResult as any)?.teenGoogleBooksCategoryOnlySignalsByTitle || {})}`,
      `teenGoogleBooksGenreSignalsByTitle:${JSON.stringify((lastRecommendationResult as any)?.teenGoogleBooksGenreSignalsByTitle || {})}`,
      `teenGoogleBooksWouldPassWithoutQueryDerivedEvidenceByTitle:${JSON.stringify((lastRecommendationResult as any)?.teenGoogleBooksWouldPassWithoutQueryDerivedEvidenceByTitle || {})}`,
      `teenGoogleBooksTasteTierSelectionDecisionByTitle:${JSON.stringify((lastRecommendationResult as any)?.teenGoogleBooksTasteTierSelectionDecisionByTitle || {})}`,
      `teenGoogleBooksTasteTierSelectionReasonByTitle:${JSON.stringify((lastRecommendationResult as any)?.teenGoogleBooksTasteTierSelectionReasonByTitle || {})}`,
      `teenGoogleBooksWeakCandidateUsedForUnderfillByTitle:${JSON.stringify((lastRecommendationResult as any)?.teenGoogleBooksWeakCandidateUsedForUnderfillByTitle || {})}`,
      `teenGoogleBooksStrongOrSecondaryAvailableCount:${Number((lastRecommendationResult as any)?.teenGoogleBooksStrongOrSecondaryAvailableCount || 0)}`,
      `teenGoogleBooksCounterfactualFinalTitles:${Array.isArray((lastRecommendationResult as any)?.teenGoogleBooksCounterfactualFinalTitles) && (lastRecommendationResult as any).teenGoogleBooksCounterfactualFinalTitles.length ? (lastRecommendationResult as any).teenGoogleBooksCounterfactualFinalTitles.join(" | ") : "(none)"}`,
      `teenGoogleBooksCounterfactualFinalCount:${Number((lastRecommendationResult as any)?.teenGoogleBooksCounterfactualFinalCount || 0)}`,
      `teenGoogleBooksCounterfactualUnderfill:${Boolean((lastRecommendationResult as any)?.teenGoogleBooksCounterfactualUnderfill)}`,
      `selectedGenericOnlyTasteMatchCount:${Number((lastRecommendationResult as any)?.selectedGenericOnlyTasteMatchCount || 0)}`,
      `zeroTasteCandidateRejectedTitles:${Array.isArray((lastRecommendationResult as any)?.zeroTasteCandidateRejectedTitles) && (lastRecommendationResult as any).zeroTasteCandidateRejectedTitles.length ? (lastRecommendationResult as any).zeroTasteCandidateRejectedTitles.join(" | ") : "(none)"}`,
      `broadAdventureOnlyRejectedTitles:${Array.isArray((lastRecommendationResult as any)?.broadAdventureOnlyRejectedTitles) && (lastRecommendationResult as any).broadAdventureOnlyRejectedTitles.length ? (lastRecommendationResult as any).broadAdventureOnlyRejectedTitles.join(" | ") : "(none)"}`,
      `meaningfulTasteEligibleTitles:${Array.isArray((lastRecommendationResult as any)?.meaningfulTasteEligibleTitles) && (lastRecommendationResult as any).meaningfulTasteEligibleTitles.length ? (lastRecommendationResult as any).meaningfulTasteEligibleTitles.join(" | ") : "(none)"}`,
      `underfilledBecauseOnlyWeakOrZeroTaste:${Boolean((lastRecommendationResult as any)?.underfilledBecauseOnlyWeakOrZeroTaste)}`,
      `emergencyFallbackUsedForZeroTasteFill:${Boolean((lastRecommendationResult as any)?.emergencyFallbackUsedForZeroTasteFill)}`,
      `candidateWeightedTasteScoreByTitle:${JSON.stringify((lastRecommendationResult as any)?.candidateWeightedTasteScoreByTitle || {})}`,
      `candidateDislikePenaltyByTitle:${JSON.stringify((lastRecommendationResult as any)?.candidateDislikePenaltyByTitle || {})}`,
      `candidateSkipPenaltyByTitle:${JSON.stringify((lastRecommendationResult as any)?.candidateSkipPenaltyByTitle || {})}`,
      `singleTokenQueryHijackPenaltyByTitle:${JSON.stringify((lastRecommendationResult as any)?.singleTokenQueryHijackPenaltyByTitle || {})}`,
      `queryTermOnlyEvidenceByTitle:${JSON.stringify((lastRecommendationResult as any)?.queryTermOnlyEvidenceByTitle || {})}`,
      `titleOnlyTasteSignalByTitle:${JSON.stringify((lastRecommendationResult as any)?.titleOnlyTasteSignalByTitle || {})}`,
      `semanticSupportFoundByTitle:${JSON.stringify((lastRecommendationResult as any)?.semanticSupportFoundByTitle || {})}`,
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
      `finalRenderSourceList:${Array.isArray((lastRecommendationResult as any)?.finalRenderSourceList) ? (lastRecommendationResult as any).finalRenderSourceList.join(" | ") : "(none)"}`,
      `finalRenderCandidateTitlesBeforeGate:${Array.isArray((lastRecommendationResult as any)?.finalRenderCandidateTitlesBeforeGate) ? (lastRecommendationResult as any).finalRenderCandidateTitlesBeforeGate.join(" | ") : "(none)"}`,
      `finalRenderCandidateTitlesAfterGate:${Array.isArray((lastRecommendationResult as any)?.finalRenderCandidateTitlesAfterGate) ? (lastRecommendationResult as any).finalRenderCandidateTitlesAfterGate.join(" | ") : "(none)"}`,
      `finalRenderBypassBlockedTitles:${Array.isArray((lastRecommendationResult as any)?.finalRenderBypassBlockedTitles) ? (lastRecommendationResult as any).finalRenderBypassBlockedTitles.join(" | ") : "(none)"}`,
      `topUpFinalGateRejectedTitles:${Array.isArray((lastRecommendationResult as any)?.topUpFinalGateRejectedTitles) ? (lastRecommendationResult as any).topUpFinalGateRejectedTitles.join(" | ") : "(none)"}`,
      `returnedItemPassedFinalGateByTitle:${JSON.stringify((lastRecommendationResult as any)?.returnedItemPassedFinalGateByTitle || {})}`,
      `sourceSpecificGateAppliedByTitle:${JSON.stringify((lastRecommendationResult as any)?.sourceSpecificGateAppliedByTitle || {})}`,
      `superheroUnderfillRelaxationBranchEntered:${Boolean(Array.isArray((lastRecommendationResult as any)?.sourceSpecificGateAppliedByTitle?.__router__) && (lastRecommendationResult as any).sourceSpecificGateAppliedByTitle.__router__.includes("superhero_underfill_relaxation_branch:entered"))}`,
      `superheroUnderfillRescueAcceptedTitles:${Object.entries((lastRecommendationResult as any)?.sourceSpecificGateAppliedByTitle || {}).filter(([title, gates]) => title !== "__router__" && Array.isArray(gates) && gates.includes("superhero_underfill_rescue_relaxation")).map(([title]) => title).join(" | ") || "(none)"}`,
      `superheroUnderfillRescueCandidateTrueTitles:${Object.entries((lastRecommendationResult as any)?.sourceSpecificGateAppliedByTitle || {}).filter(([title, gates]) => title !== "__router__" && Array.isArray(gates) && gates.includes("superhero_underfill_rescue_candidate:true")).map(([title]) => title).join(" | ") || "(none)"}`,
      `superheroUnderfillRescueCandidateFalseTitles:${Object.entries((lastRecommendationResult as any)?.sourceSpecificGateAppliedByTitle || {}).filter(([title, gates]) => title !== "__router__" && Array.isArray(gates) && gates.includes("superhero_underfill_rescue_candidate:false")).map(([title]) => title).join(" | ") || "(none)"}`,
      `superheroUnderfillRescueAllowedTitlesCountGate:${(Array.isArray((lastRecommendationResult as any)?.sourceSpecificGateAppliedByTitle?.__router__) ? (lastRecommendationResult as any).sourceSpecificGateAppliedByTitle.__router__.find((g: string) => g.startsWith("superhero_underfill_rescue_allowed_titles_count:")) : "") || "(none)"}`,
      `superheroUnderfillRescueAllowedTitlesGate:${(Array.isArray((lastRecommendationResult as any)?.sourceSpecificGateAppliedByTitle?.__router__) ? (lastRecommendationResult as any).sourceSpecificGateAppliedByTitle.__router__.find((g: string) => g.startsWith("superhero_underfill_rescue_allowed_titles:")) : "") || "(none)"}`,
      `superheroUnderfillRescuePredicateFailureBreakdownGate:${(Array.isArray((lastRecommendationResult as any)?.sourceSpecificGateAppliedByTitle?.__router__) ? (lastRecommendationResult as any).sourceSpecificGateAppliedByTitle.__router__.find((g: string) => g.startsWith("superhero_underfill_rescue_predicate_failure_breakdown:")) : "") || "(none)"}`,
      `superheroNegativeScoreRenderBypassTitles:${(Array.isArray((lastRecommendationResult as any)?.sourceSpecificGateAppliedByTitle?.__router__) ? (lastRecommendationResult as any).sourceSpecificGateAppliedByTitle.__router__.find((g: string) => g.startsWith("superhero_negative_score_render_bypass_titles:")) : "") || "(none)"}`,
      `superheroNegativeScoreRenderBypassTitleList:${Object.entries((lastRecommendationResult as any)?.sourceSpecificGateAppliedByTitle || {}).filter(([title, gates]) => title !== "__router__" && Array.isArray(gates) && gates.includes("superhero_negative_score_render_bypass")).map(([title]) => title).join(" | ") || "(none)"}`,
      `superheroNegativeScoreRenderBypassRescueAcceptedTitleList:${Object.entries((lastRecommendationResult as any)?.sourceSpecificGateAppliedByTitle || {}).filter(([title, gates]) => title !== "__router__" && Array.isArray(gates) && gates.includes("superhero_negative_score_render_bypass:rescue_accepted")).map(([title]) => title).join(" | ") || "(none)"}`,
      `superheroNegativeScoreRenderBypassFinalGateTitleList:${Object.entries((lastRecommendationResult as any)?.sourceSpecificGateAppliedByTitle || {}).filter(([title, gates]) => title !== "__router__" && Array.isArray(gates) && gates.includes("superhero_negative_score_render_bypass:final_gate")).map(([title]) => title).join(" | ") || "(none)"}`,
      `scoredUniverseContractTopUpCandidateCountGate:${(Array.isArray((lastRecommendationResult as any)?.sourceSpecificGateAppliedByTitle?.__router__) ? (lastRecommendationResult as any).sourceSpecificGateAppliedByTitle.__router__.find((g: string) => g.startsWith("scored_universe_contract_topup_candidate_count:")) : "") || "(none)"}`,
      `scoredUniverseContractTopUpCandidatesGate:${(Array.isArray((lastRecommendationResult as any)?.sourceSpecificGateAppliedByTitle?.__router__) ? (lastRecommendationResult as any).sourceSpecificGateAppliedByTitle.__router__.find((g: string) => g.startsWith("scored_universe_contract_topup_candidates:")) : "") || "(none)"}`,
      `scoredUniverseContractTopUpAcceptsGate:${(Array.isArray((lastRecommendationResult as any)?.sourceSpecificGateAppliedByTitle?.__router__) ? (lastRecommendationResult as any).sourceSpecificGateAppliedByTitle.__router__.find((g: string) => g.startsWith("scored_universe_contract_topup_accepts:")) : "") || "(none)"}`,
      `superheroUnderfillRescueCarriedIntoRelaxedAddTitles:${Object.entries((lastRecommendationResult as any)?.sourceSpecificGateAppliedByTitle || {}).filter(([title, gates]) => title !== "__router__" && Array.isArray(gates) && gates.includes("superhero_underfill_rescue_allowed_titles:carried_into_relaxed_add")).map(([title]) => title).join(" | ") || "(none)"}`,
      `superheroUnderfillRelaxationBranchEnteredRaw:${Boolean((lastRecommendationResult as any)?.superheroUnderfillRelaxationBranchEntered)}`,
      `superheroUnderfillRelaxationEligibility:${Boolean((lastRecommendationResult as any)?.superheroUnderfillRelaxationEligibility)}`,
      `superheroUnderfillRelaxationPredicateState:${JSON.stringify((lastRecommendationResult as any)?.superheroUnderfillRelaxationPredicateState || {})}`,
      `finalEligibilityAcceptedTitlesCount:${Array.isArray((lastRecommendationResult as any)?.finalEligibilityAcceptedTitles) ? (lastRecommendationResult as any).finalEligibilityAcceptedTitles.length : 0}`,
      `viableCandidateCountBeforeFinalSelection:${Number((lastRecommendationResult as any)?.viableCandidateCountBeforeFinalSelection || 0)}`,
      `rejectedButReturnedTitles:${Array.isArray((lastRecommendationResult as any)?.rejectedButReturnedTitles) ? (lastRecommendationResult as any).rejectedButReturnedTitles.join(" | ") : "(none)"}`,
      `rejectedButAcceptedTitles:${Array.isArray((lastRecommendationResult as any)?.rejectedButAcceptedTitles) ? (lastRecommendationResult as any).rejectedButAcceptedTitles.join(" | ") : "(none)"}`,
      `terminalRejectReasonByTitle:${JSON.stringify((lastRecommendationResult as any)?.terminalRejectReasonByTitle || {})}`,
      `finalGateConsistencyPassed:${Boolean((lastRecommendationResult as any)?.finalGateConsistencyPassed)}`,
      `finalRejectAssertionChecked:${Boolean((lastRecommendationResult as any)?.finalRejectAssertionChecked)}`,
      `finalRejectAssertionThrowReason:${String((lastRecommendationResult as any)?.finalRejectAssertionThrowReason || "none")}`,
      `dislikedSignalsFromSwipeHistory:${Array.isArray((lastRecommendationResult as any)?.dislikedSignalsFromSwipeHistory) ? (lastRecommendationResult as any).dislikedSignalsFromSwipeHistory.join(" | ") : "(none)"}`,
      `finalReturnedWithoutTasteEvidenceTitles:${Array.isArray((lastRecommendationResult as any)?.finalReturnedWithoutTasteEvidenceTitles) ? (lastRecommendationResult as any).finalReturnedWithoutTasteEvidenceTitles.join(" | ") : "(none)"}`,
      `finalUnderfillBecauseNoTasteEvidence:${Boolean((lastRecommendationResult as any)?.finalUnderfillBecauseNoTasteEvidence)}`,
      `underfillReason:${String((lastRecommendationResult as any)?.underfillReason || "none")}`,
      `expansionMergedButNotScoredReason:${String((lastRecommendationResult as any)?.expansionMergedButNotScoredReason || "none")}`,
      `semanticEligibilityRejectedReason:${JSON.stringify((lastRecommendationResult as any)?.semanticEligibilityRejectedReason || {})}`,
      `genericRootSuppressed:${Array.isArray((lastRecommendationResult as any)?.genericRootSuppressed) ? (lastRecommendationResult as any).genericRootSuppressed.join(" | ") : "(none)"}`,
      `rootBoostSuppressed:${Array.isArray((lastRecommendationResult as any)?.rootBoostSuppressed) ? (lastRecommendationResult as any).rootBoostSuppressed.join(" | ") : "(none)"}`,
      `narrativeEvidenceScore:${JSON.stringify((lastRecommendationResult as any)?.narrativeEvidenceScore || {})}`,
      `structuralOnlyMatch:${Array.isArray((lastRecommendationResult as any)?.structuralOnlyMatch) ? (lastRecommendationResult as any).structuralOnlyMatch.join(" | ") : "(none)"}`,
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
      `debugComicVineDispatchTrace.note:${String(lastDebugGcdDispatchTrace?.traceSource || "").startsWith("v2_") ? "v2_source_diagnostics_authoritative__legacy_v1_dispatch_fields_deprecated" : "legacy_or_router_trace"}`,
      `debugComicVineDispatchTrace.sourceEnabledComicVine:${Boolean(lastDebugGcdDispatchTrace?.sourceEnabledComicVine)}`,
      `debugComicVineDispatchTrace.comicVineEnabledAtRequestStart:${Boolean((lastDebugGcdDispatchTrace as any)?.comicVineEnabledAtRequestStart)}`,
      `debugComicVineDispatchTrace.comicVineShouldUseResult:${Boolean((lastDebugGcdDispatchTrace as any)?.comicVineShouldUseResult)}`,
      `debugComicVineDispatchTrace.comicVineDispatchPlanned:${Boolean((lastDebugGcdDispatchTrace as any)?.comicVineDispatchPlanned)}`,
      `debugComicVineDispatchTrace.comicVineDispatchAttempted:${Boolean((lastDebugGcdDispatchTrace as any)?.comicVineDispatchAttempted)}`,
      `debugComicVineDispatchTrace.comicVineDispatchSkippedReason:${String((lastDebugGcdDispatchTrace as any)?.comicVineDispatchSkippedReason || "(none)")}`,
      `debugComicVineDispatchTrace.comicVineQueriesPlanned:${Array.isArray((lastDebugGcdDispatchTrace as any)?.comicVineQueriesPlanned) && (lastDebugGcdDispatchTrace as any).comicVineQueriesPlanned.length ? (lastDebugGcdDispatchTrace as any).comicVineQueriesPlanned.join(" | ") : "(none)"}`,
      `debugComicVineDispatchTrace.comicVineQueriesAttempted:${Array.isArray((lastDebugGcdDispatchTrace as any)?.comicVineQueriesAttempted) && (lastDebugGcdDispatchTrace as any).comicVineQueriesAttempted.length ? (lastDebugGcdDispatchTrace as any).comicVineQueriesAttempted.join(" | ") : "(none)"}`,
      `debugComicVineDispatchTrace.comicVineFetchStartedAt:${String((lastDebugGcdDispatchTrace as any)?.comicVineFetchStartedAt || "(none)")}`,
      `debugComicVineDispatchTrace.comicVineFetchFinishedAt:${String((lastDebugGcdDispatchTrace as any)?.comicVineFetchFinishedAt || "(none)")}`,
      `debugComicVineDispatchTrace.comicVineFetchTimedOut:${Boolean((lastDebugGcdDispatchTrace as any)?.comicVineFetchTimedOut)}`,
      `debugComicVineDispatchTrace.comicVineFetchFailureError:${String((lastDebugGcdDispatchTrace as any)?.comicVineFetchFailureError || "(none)")}`,
      `debugComicVineDispatchTrace.comicVineDirectProbeDiagnostics:${JSON.stringify((lastDebugGcdDispatchTrace as any)?.comicVineDirectProbeDiagnostics || [])}`,
      `debugComicVineDispatchTrace.comicVineRawCountByQuery:${JSON.stringify((lastDebugGcdDispatchTrace as any)?.comicVineRawCountByQuery || (lastRecommendationResult as any)?.comicVineRawCountByQuery || {})}`,
      `debugComicVineDispatchTrace.comicVineDocCountByQuery:${JSON.stringify((lastDebugGcdDispatchTrace as any)?.comicVineDocCountByQuery || (lastRecommendationResult as any)?.comicVineDocCountByQuery || {})}`,
      `debugComicVineDispatchTrace.comicVineCandidateCountByQuery:${JSON.stringify((lastDebugGcdDispatchTrace as any)?.comicVineCandidateCountByQuery || (lastRecommendationResult as any)?.comicVineCandidateCountByQuery || {})}`,
      `debugComicVineDispatchTrace.comicVineResultShapeByQuery:${JSON.stringify((lastDebugGcdDispatchTrace as any)?.comicVineResultShapeByQuery || {})}`,
      `debugComicVineDispatchTrace.comicVineFirstTitlesByQuery:${JSON.stringify((lastDebugGcdDispatchTrace as any)?.comicVineFirstTitlesByQuery || {})}`,
      `debugComicVineDispatchTrace.comicVineAdapterConversionDiagnostics:${JSON.stringify((lastDebugGcdDispatchTrace as any)?.comicVineAdapterConversionDiagnostics || {})}`,
      `debugComicVineDispatchTrace.comicVineDispatchStageDiagnostics:${Array.isArray((lastDebugGcdDispatchTrace as any)?.comicVineDispatchStageDiagnostics) && (lastDebugGcdDispatchTrace as any).comicVineDispatchStageDiagnostics.length ? JSON.stringify((lastDebugGcdDispatchTrace as any).comicVineDispatchStageDiagnostics) : "[]"}`,
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
      `debugComicVineDispatchTrace.comicVineFinalRequestUrlByQuery:${JSON.stringify((lastDebugGcdDispatchTrace as any)?.comicVineFinalRequestUrlByQuery || {})}`,
      `debugComicVineDispatchTrace.comicVineThrownErrorNameByQuery:${JSON.stringify((lastDebugGcdDispatchTrace as any)?.comicVineThrownErrorNameByQuery || {})}`,
      `debugComicVineDispatchTrace.comicVineThrownErrorMessageByQuery:${JSON.stringify((lastDebugGcdDispatchTrace as any)?.comicVineThrownErrorMessageByQuery || {})}`,
      `debugComicVineDispatchTrace.comicVineResponseContentTypeByQuery:${JSON.stringify((lastDebugGcdDispatchTrace as any)?.comicVineResponseContentTypeByQuery || {})}`,
      `debugComicVineDispatchTrace.comicVineResponseShapeByQuery:${JSON.stringify((lastDebugGcdDispatchTrace as any)?.comicVineResponseShapeByQuery || {})}`,
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
      `comicVinePreflightQuery:${String(lastDebugGcdDispatchTrace?.comicVinePreflightQuery || "(none)")}`,
      `comicVinePreflightUsesTasteQuery:${Boolean(lastDebugGcdDispatchTrace?.comicVinePreflightUsesTasteQuery)}`,
      `comicVinePerQueryFailureDoesNotAbort:${Boolean(lastDebugGcdDispatchTrace?.comicVinePerQueryFailureDoesNotAbort)}`,
      `comicVineTasteQueriesAttempted:${Array.isArray(lastDebugGcdDispatchTrace?.comicVineTasteQueriesAttempted) && lastDebugGcdDispatchTrace.comicVineTasteQueriesAttempted.length ? lastDebugGcdDispatchTrace.comicVineTasteQueriesAttempted.join(" | ") : "(none)"}`,
      `comicVineFetchResults:${Array.isArray(lastDebugGcdDispatchTrace?.comicVineFetchResults) && lastDebugGcdDispatchTrace.comicVineFetchResults.length ? lastDebugGcdDispatchTrace.comicVineFetchResults.map((row: any) => `${row?.query || "(query)"}=>${row?.status || "unknown"} raw=${Number(row?.rawCount || 0)}${row?.error ? ` err=${row.error}` : ""}`).join(" || ") : "(none)"}`,
      `comicVineIssueLikeRejectedAtConversionCountByQuery:${JSON.stringify((lastDebugGcdDispatchTrace as any)?.comicVineIssueLikeRejectedAtConversionCountByQuery || {})}`,
      `comicVineIssueLikeRejectedTitlesByQuery:${JSON.stringify((lastDebugGcdDispatchTrace as any)?.comicVineIssueLikeRejectedTitlesByQuery || {})}`,
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
      `engineSelected: v2`,
      `engineActuallyUsed: ${engineActuallyUsedForReport || "(none)"}`,
      `Engine: ${recEngineLabel || "â€”"}`,
      `Saved Query Time: ${lastRecommendationTimestamp || "â€”"}`,
      `Swipe Summary: ${recomputedSummary}`,
      `Swipe Summary (state): ${lastRecommendationSwipeSummary || `Right:${rightSwipes} â€¢ Left:${leftSwipes} â€¢ Skip:${downSwipes}`}`,
      `20Q Progress: ${resolvedTwentyQCount}/${twentyQObjectives.length}`,
      `Current 20Q Objective: ${activeTwentyQObjective ? `Rung ${activeTwentyQObjective.rung} â€¢ ${activeTwentyQObjective.label}` : "complete"}`,
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
      "SOURCE STARVATION AUDIT",
      `sourceStarvationAudit: ${JSON.stringify(sourceStarvationAuditForReport || null)}`,
      `googleBooksSourceFetchDiagnostics: ${JSON.stringify(googleBooksSourceFetchDiagnosticsForReport)}`,
      `openLibrarySourceFetchDiagnostics: ${JSON.stringify(openLibrarySourceFetchDiagnosticsForReport)}`,
      `openLibraryProbeRan: ${String(openLibraryProbeRanForReport)}`,
      `openLibraryEmptyReason: ${openLibraryEmptyReasonForReport || "(none)"}`,
      `openLibraryArtifactSuppressedTitles: ${JSON.stringify((lastRecommendationResult as any)?.openLibraryArtifactSuppressedTitles || [])}`,
      `openLibrarySeriesSuppressedTitles: ${JSON.stringify((lastRecommendationResult as any)?.openLibrarySeriesSuppressedTitles || [])}`,
      `sourceStarvationAudit.fetchDiagnostics: ${JSON.stringify(sourceStarvationFetchDiagnosticsForReport)}`,
      "",
      "ADULT KITSU FALLBACK DIAGNOSTICS",
      ...adultKitsuOnlyFallbackReportLines,
      "",
      "SOURCE SETTINGS",
      sourceEnabledSummary,
      "",
      "RECOMMENDER V2 DEBUG",
      ...v2DiagnosticLines,
      ...adultRoutePolarityExportLines,
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
      `confidence:${tasteProfileWithMood.confidence.toFixed(2)} â€¢ swipes:${tasteProfileWithMood.evidence.swipes} â€¢ feedback:${tasteProfileWithMood.evidence.feedbackEvents}`,
      "",
      "SESSION MOOD",
      formatTasteVectorPreview(sessionMoodProfile?.vector),
      `confidence:${sessionMoodProfile?.confidence?.toFixed(2) ?? "0.00"} â€¢ swipes:${sessionMoodProfile?.swipeCount ?? 0}`,
      "",
      "PERSONALITY PROFILE",
      formatTasteVectorPreview(personalityProfileState?.vector),
      `confidence:${personalityProfileState?.confidence?.toFixed(2) ?? "0.00"} â€¢ sessions:${personalityProfileState?.sessionCount ?? 0}`,
      "",
      "ACTIVE TASTE",
      formatTasteVectorPreview(activeTasteVector),
      `personality:${activeTasteWeights?.personalityWeight?.toFixed(2) ?? "0.00"} â€¢ mood:${activeTasteWeights?.moodWeight?.toFixed(2) ?? "0.00"}`,
      "",
      "RUNG STATS",
      lastRungStats ? JSON.stringify(lastRungStats, null, 2) : "(none)",
      "",
      "RECOMMENDATION MEMORY",
      (() => {
        const history = getRecommendationHistoryBucket(deckKey);
        return `shownIds:${history.recommendedIds.size} â€¢ shownKeys:${history.recommendedKeys.size} â€¢ titles:${history.titles.size} â€¢ roots:${history.titleRoots.size} â€¢ authors:${history.authors.size} â€¢ series:${history.seriesKeys.size} â€¢ rejected:${history.rejectedIds.size}`;
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
            Engine: V2 • Last used: {(lastEngineActuallyUsed || "—").toUpperCase()}
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
                  Deck: {deck.deckLabel} • Engine: V2 • Used: {(lastEngineActuallyUsed || "—").toUpperCase()} • Engine label: {recEngineLabel || "—"} • 20Q resolved {resolvedTwentyQCount}/{twentyQObjectives.length}
                </Text>

                {recQuery ? (
                  <Text style={styles.smallNote}>
                    Search query: <Text style={{ fontWeight: "900" }}>{recQuery}</Text>
                  </Text>
                ) : (
                  <Text style={styles.smallNote}>Building your recommendationsâ€¦</Text>
                )}

                {lastRecommendationTimestamp ? (
                  <Text style={styles.smallNote}>Saved query time: {lastRecommendationTimestamp}</Text>
                ) : null}

                {recLoading ? (
                  <View style={{ marginTop: 14, alignItems: "center" }}>
                    <ActivityIndicator />
                    <Text style={styles.smallNote}>Finding a good matchâ€¦</Text>
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
                                <Text style={styles.ratingStar}>{filled ? "â˜…" : "â˜†"}</Text>
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
                      <Text style={styles.recBookTitle}>Youâ€™ve reached the end of your recommendations.</Text>
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
                      <Text style={styles.clueText}>â† Dislike</Text>
                      <Text style={styles.clueText}>â†“ Skip</Text>
                      <Text style={styles.clueText}>Like â†’</Text>
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

          <TouchableOpacity style={styles.codexDiagnosticsToggle} onPress={() => void handleCopyCodexDiagnostics()}>
            <Text style={styles.debugToggleText}>{v2DebugLoading ? "Codex Runningâ€¦" : "Codex Diagnostics"}</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.v2DebugToggle} onPress={() => void runRecommenderV2DebugFromCurrentSession("button")}>
            <Text style={styles.debugToggleText}>{v2DebugLoading ? "V2 Runningâ€¦" : "Run V2"}</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.v2DebugToggle, middleGradesDeepDebugUiEnabled && styles.middleGradesDeepDebugToggleActive]}
            onPress={toggleMiddleGradesDeepDebug}
          >
            <Text style={styles.debugToggleText}>
              {middleGradesDeepDebugUiEnabled ? "MG Deep Debug: ON" : "MG Deep Debug: OFF"}
            </Text>
          </TouchableOpacity>
          <Text style={styles.v2DebugText}>MG deep debug can also be enabled with ?middleGradesDeepDebug=true or localStorage middleGradesDeepDebug=true.</Text>

          {(v2DebugResult || v2DebugError) ? (
            <View style={styles.v2DebugPanel}>
              <Text style={styles.v2DebugTitle}>Recommender V2 Debug</Text>
              <Text style={styles.v2DebugText}>status:{v2DebugError ? "error" : "ok"}</Text>
              {v2DebugResult?.diagnostics.sessionReportHeader ? <Text style={styles.v2DebugText}>{v2DebugResult.diagnostics.sessionReportHeader}</Text> : null}
              <Text style={styles.v2DebugText}>items:{v2DebugResult?.items.map((item) => item.title).join(" | ") || "(none)"}</Text>
              <Text style={styles.v2DebugText}>stages:{v2DebugResult?.diagnostics.stages.map((stage) => stage.stage).join(" â†’ ") || "(none)"}</Text>
              <Text style={styles.v2DebugText}>sources:{v2DebugResult?.diagnostics.sources.map((source) => `${source.source}:${source.status}:${source.rawCount}`).join(" | ") || "(none)"}</Text>
              {v2DebugError ? <Text style={styles.v2DebugText}>error:{v2DebugError}</Text> : null}
            </View>
          ) : null}

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
  codexDiagnosticsToggle: {
    minWidth: 148,
    alignItems: "center",
    backgroundColor: "#4338ca",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#c7d2fe",
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
  v2DebugToggle: {
    minWidth: 112,
    alignItems: "center",
    backgroundColor: "#0f766e",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
  },
  middleGradesDeepDebugToggleActive: {
    backgroundColor: "#b45309",
    borderColor: "#fde68a",
    borderWidth: 1,
  },
  v2DebugPanel: {
    width: 320,
    maxWidth: "90%",
    alignSelf: "flex-end",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
    backgroundColor: "rgba(10, 20, 35, 0.95)",
    padding: 10,
    gap: 4,
  },
  v2DebugTitle: { color: "#e5efff", fontWeight: "900", fontSize: 12 },
  v2DebugText: { color: "#cbd5f5", fontWeight: "700", fontSize: 10 },
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
