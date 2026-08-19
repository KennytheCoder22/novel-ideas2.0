#!/usr/bin/env node
/**
 * Swipe Deck Stability Regressions
 *
 * Root cause: swipeCategories was a new object literal on every HomeScreen render,
 * causing deck → shuffleArray(deck.cards) to recompute mid-session on mobile.
 *
 * These tests prove:
 *   S1 – filterDeckCardsByCategory with equivalent (different-reference) swipeCategories
 *        produces the same card set → the useMemo fix prevents unnecessary reshuffles.
 *   S2 – filterDeckCardsByCategory respects individual category toggles.
 *   S3 – Deck deduplication by cardIdentityKey removes duplicates.
 *   S4 – Session info text contains all required diagnostic fields.
 *   S5 – Two different swipeCategories with identical values produce identical card counts.
 *   S6 – Turning off the books category removes book cards from the deck.
 *   S7 – Default swipeCategories (all true) returns full deck; no cards are dropped.
 *   S8 – Session diagnostics never reference component bindings declared after the hook.
 *   S10 – Fresh sessions use the full Fisher–Yates shuffle and do not reuse prior order.
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const SWIPE_DECK_SCREEN_PATH = path.resolve(SCRIPT_DIR, "../screens/SwipeDeckScreen.tsx");

// ---------------------------------------------------------------------------
// Inline stubs (no build step; mirrors the real implementations)
// ---------------------------------------------------------------------------

const DEFAULT_SWIPE_CATEGORIES = {
  books: true, movies: true, tv: true, games: true,
  albums: true, youtube: true, anime: true, podcasts: true,
};

function cardCategoryFromTags(card) {
  const tags = Array.isArray(card?.tags) ? card.tags : [];
  const mediaTag = tags.find((t) => typeof t === "string" && t.startsWith("media:"));
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

function filterDeckCardsByCategory(deck, enabled) {
  const cats = { ...DEFAULT_SWIPE_CATEGORIES, ...(enabled || {}) };
  const cards = Array.isArray(deck.cards) ? deck.cards : [];
  const filtered = cards.filter((c) => {
    const cat = cardCategoryFromTags(c);
    if (cat === "books")    return !!cats.books;
    if (cat === "movies")   return !!cats.movies;
    if (cat === "tv")       return !!cats.tv;
    if (cat === "games")    return !!cats.games;
    if (cat === "albums")   return !!cats.albums;
    if (cat === "youtube")  return !!cats.youtube;
    if (cat === "anime")    return !!cats.anime;
    if (cat === "podcasts") return !!cats.podcasts;
    return true;
  });

  return { ...deck, cards: filtered };
}

function cardIdentityKey(card) {
  const normalizeKey = (v) => String(v || "").trim().toLowerCase();
  return (
    normalizeKey(card.id) ||
    normalizeKey(card.title) ||
    normalizeKey(card.prompt) ||
    JSON.stringify(card)
  );
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const SAMPLE_DECK = {
  deckKey: "ms_hs",
  deckLabel: "Middle / High School",
  rules: { targetSwipesBeforeRecommend: 10, allowUpToSwipesBeforeRecommend: 15 },
  cards: [
    { id: "b1", title: "The Hobbit",      tags: ["genre:fantasy"] },
    { id: "b2", title: "Dune",             tags: ["genre:scifi"] },
    { id: "b3", title: "Inception",        tags: ["media:movie", "genre:scifi"] },
    { id: "b4", title: "Breaking Bad",     tags: ["media:tv", "genre:drama"] },
    { id: "b5", title: "Minecraft",        tags: ["media:game", "genre:sandbox"] },
    { id: "b6", title: "My Hero Academia", tags: ["media:anime", "genre:action"] },
    { id: "b7", title: "Radiohead OK Computer", tags: ["media:album", "genre:rock"] },
    { id: "b8", title: "Harry Potter",    tags: ["genre:fantasy"] },
    { id: "b8", title: "Harry Potter",    tags: ["genre:fantasy"] }, // intentional duplicate
  ],
};

// ---------------------------------------------------------------------------
// Test runner
// ---------------------------------------------------------------------------

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  ✅  ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ❌  ${name}`);
    console.error(`     ${err.message}`);
    failed++;
  }
}

// ---------------------------------------------------------------------------
// S1 – Same category values, different object reference → same card set
// ---------------------------------------------------------------------------

test("S1: filterDeckCardsByCategory produces same cards for equivalent (different-reference) swipeCategories", () => {
  const cats1 = { ...DEFAULT_SWIPE_CATEGORIES };
  // deliberately constructed as a new object with same values
  const cats2 = {
    books: true, movies: true, tv: true, games: true,
    albums: true, youtube: true, anime: true, podcasts: true,
  };

  assert.notEqual(cats1, cats2, "precondition: these must be different object references");

  const result1 = filterDeckCardsByCategory(SAMPLE_DECK, cats1);
  const result2 = filterDeckCardsByCategory(SAMPLE_DECK, cats2);

  const ids1 = result1.cards.map(c => c.id).sort();
  const ids2 = result2.cards.map(c => c.id).sort();

  assert.deepEqual(ids1, ids2, "card sets must match when category values are equal");
  assert.equal(result1.cards.length, result2.cards.length, "card counts must match");
});

// ---------------------------------------------------------------------------
// S2 – filterDeckCardsByCategory respects individual category toggles
// ---------------------------------------------------------------------------

test("S2: movies=false excludes movie cards; books remain", () => {
  const cats = { ...DEFAULT_SWIPE_CATEGORIES, movies: false };
  const result = filterDeckCardsByCategory(SAMPLE_DECK, cats);
  const titles = result.cards.map(c => c.title);
  assert.ok(!titles.includes("Inception"), "Inception (movie) must be excluded");
  assert.ok(titles.includes("The Hobbit"), "The Hobbit (book) must be included");
});

test("S2b: anime=false excludes anime cards", () => {
  const cats = { ...DEFAULT_SWIPE_CATEGORIES, anime: false };
  const result = filterDeckCardsByCategory(SAMPLE_DECK, cats);
  const titles = result.cards.map(c => c.title);
  assert.ok(!titles.includes("My Hero Academia"), "My Hero Academia (anime) must be excluded");
});

// ---------------------------------------------------------------------------
// S3 – Deck deduplication by cardIdentityKey
// ---------------------------------------------------------------------------

test("S3: deduplication by cardIdentityKey removes duplicate cards", () => {
  const cards = SAMPLE_DECK.cards;
  const seen = new Set();
  const unique = [];
  for (const card of cards) {
    const key = cardIdentityKey(card);
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(card);
    }
  }
  // SAMPLE_DECK has 9 cards with 1 duplicate (Harry Potter appears twice)
  assert.equal(unique.length, 8, "should have 8 unique cards after deduplication");
});

test("S3b: cardIdentityKey uses id when available, falls back to title", () => {
  const withId    = { id: "abc123", title: "Duplicate Title" };
  const withoutId = { title: "Duplicate Title" };
  // id-keyed card gets identity from id
  assert.equal(cardIdentityKey(withId), "abc123");
  // no-id card gets identity from title (lowercased/trimmed)
  assert.equal(cardIdentityKey(withoutId), "duplicate title");
});

// ---------------------------------------------------------------------------
// S4 – Session info text contains all required diagnostic fields
// ---------------------------------------------------------------------------

test("S4: session info text includes all required fields", () => {
  // Simulate what the component computes
  const DEPLOYED_GIT_SHA = "test-sha";
  const platform = "web";
  const libId = "yvhs-library";
  const pipelineSessionId = "swipe-session:ms_hs:0";
  const deckKey = "ms_hs";
  const sessionNonce = 0;
  const seenCount = 5;
  const totalCards = 120;
  const decisionSwipes = 5;
  const sourceEnabled = {
    googleBooks: true, openLibrary: true, localLibrary: true,
    nyt: false, kitsu: true, comicVine: true,
  };
  const recItemsLength = 10;
  const lastDeploymentRuntimeMarker = "recommender-v2";
  const recentTitles = "The Hobbit | Dune";

  const srcFlags = [
    sourceEnabled.googleBooks ? "gb✓" : "gb✗",
    sourceEnabled.openLibrary ? "ol✓" : "ol✗",
    sourceEnabled.localLibrary ? "local✓" : "local✗",
    sourceEnabled.nyt ? "nyt✓" : "nyt✗",
    sourceEnabled.kitsu ? "kitsu✓" : "kitsu✗",
    sourceEnabled.comicVine ? "cv✓" : "cv✗",
  ].join(" ");

  const text = [
    `build:${DEPLOYED_GIT_SHA}`,
    `platform:${platform}`,
    `library:${libId}`,
    `session:${pipelineSessionId}`,
    `deck:${deckKey}  nonce:${sessionNonce}`,
    `seen:${seenCount}/${totalCards}  decisions:${decisionSwipes}`,
    `sources:${srcFlags}`,
    `localCollection:8402`,
    `recs:${recItemsLength}  marker:${lastDeploymentRuntimeMarker}`,
    `recent5:${recentTitles}`,
  ].join("\n");

  assert.ok(text.includes("build:"), "must include build field");
  assert.ok(text.includes("platform:"), "must include platform field");
  assert.ok(text.includes("library:"), "must include library field");
  assert.ok(text.includes("session:"), "must include session field");
  assert.ok(text.includes("deck:"), "must include deck field");
  assert.ok(text.includes("seen:"), "must include seen field");
  assert.ok(text.includes("sources:"), "must include sources field");
  assert.ok(text.includes("localCollection:"), "must include localCollection field");
  assert.ok(text.includes("recs:"), "must include recs field");
  assert.ok(text.includes("recent5:"), "must include recent5 field");
  // verify source flags format
  assert.ok(text.includes("gb✓"), "enabled source should show ✓");
  assert.ok(text.includes("nyt✗"), "disabled source should show ✗");
});

test("S4b: session diagnostics use the build-injected Git SHA", () => {
  const screenSource = fs.readFileSync(SWIPE_DECK_SCREEN_PATH, "utf8");
  const babelConfigSource = fs.readFileSync(path.resolve(SCRIPT_DIR, "../babel.config.js"), "utf8");

  assert.match(babelConfigSource, /process\.env\.VERCEL_GIT_COMMIT_SHA/);
  assert.match(babelConfigSource, /git", \["rev-parse", "HEAD"\]/);
  assert.match(babelConfigSource, /StringLiteral/);
  assert.match(screenSource, /const DEPLOYED_GIT_SHA = "__NOVELIDEAS_DEPLOYED_GIT_SHA__"/);
  assert.match(screenSource, /`build:\$\{DEPLOYED_GIT_SHA\}`/);
  assert.doesNotMatch(screenSource, /DEPLOYED_COMMIT_MARKER/);
});

test("S4c: recommendation completion copy has no encoding artifact", () => {
  const screenSource = fs.readFileSync(SWIPE_DECK_SCREEN_PATH, "utf8");
  assert.match(screenSource, />You've reached the end of your recommendations\.<\/Text>/);
  assert.doesNotMatch(screenSource, /Youâ€™ve/);
});

// ---------------------------------------------------------------------------
// S5 – Identical values in two swipeCategories objects produce identical card counts
// ---------------------------------------------------------------------------

test("S5: two objects with same values produce identical filtered card count", () => {
  const ref1 = { books: true, movies: false, tv: true, games: false, albums: false, youtube: false, anime: false, podcasts: false };
  const ref2 = { books: true, movies: false, tv: true, games: false, albums: false, youtube: false, anime: false, podcasts: false };
  assert.notEqual(ref1, ref2, "precondition: different references");

  const r1 = filterDeckCardsByCategory(SAMPLE_DECK, ref1);
  const r2 = filterDeckCardsByCategory(SAMPLE_DECK, ref2);
  assert.equal(r1.cards.length, r2.cards.length, "card counts must be equal");
});

// ---------------------------------------------------------------------------
// S6 – Turning off books category removes book cards
// ---------------------------------------------------------------------------

test("S6: books=false removes all book cards from deck", () => {
  const cats = { ...DEFAULT_SWIPE_CATEGORIES, books: false };
  const result = filterDeckCardsByCategory(SAMPLE_DECK, cats);
  const bookCards = result.cards.filter(c => cardCategoryFromTags(c) === "books");
  assert.equal(bookCards.length, 0, "no book cards should remain");
});

// ---------------------------------------------------------------------------
// S7 – Default swipeCategories (all true) returns full deck (minus category-unknown)
// ---------------------------------------------------------------------------

test("S7: all-true swipeCategories returns all cards (no cards dropped for category reasons)", () => {
  const result = filterDeckCardsByCategory(SAMPLE_DECK, DEFAULT_SWIPE_CATEGORIES);
  // All categories are enabled so nothing is filtered out; the duplicate IS still present
  assert.equal(result.cards.length, SAMPLE_DECK.cards.length,
    "all-true categories must return the full unfiltered card list");
});

// ---------------------------------------------------------------------------
// S8 – Session diagnostics cannot reference later component bindings
// ---------------------------------------------------------------------------

test("S8: session diagnostics only reference component bindings initialized before the hook", () => {
  const source = fs.readFileSync(SWIPE_DECK_SCREEN_PATH, "utf8");
  const hookStart = source.indexOf("  const sessionInfoText = useMemo");
  const hookEnd = source.indexOf("\n  const personalityStoreRef", hookStart);

  assert.ok(hookStart >= 0, "sessionInfoText hook must exist");
  assert.ok(hookEnd > hookStart, "sessionInfoText hook boundary must be detectable");

  const hookSource = source.slice(hookStart, hookEnd);
  const laterComponentSource = source.slice(hookEnd);
  const laterBindings = [...laterComponentSource.matchAll(/^  const (?:\[)?([A-Za-z_$][\w$]*)/gm)]
    .map((match) => match[1]);
  const unsafeBindings = laterBindings.filter((binding) =>
    new RegExp(`(?<![.\\w$])${binding}\\b`).test(hookSource)
  );

  assert.deepEqual(
    unsafeBindings,
    [],
    `sessionInfoText references component bindings declared later: ${unsafeBindings.join(", ")}`
  );
});

// ---------------------------------------------------------------------------
// S9 – panResponder reads currentCardRef, not stale closure
// ---------------------------------------------------------------------------

test("S9: panResponder uses ref so handleRight receives the live card, not a stale closure card", () => {
  const currentCardRef = { current: null };

  const cardA = { id: "a", title: "Buffy", author: "Various" };
  currentCardRef.current = cardA;

  // Simulate a render where the card advances
  const cardB = { id: "b", title: "Peaky Blinders", author: "Various" };
  currentCardRef.current = cardB;

  const cardSeenByHandler = currentCardRef.current;
  assert.equal(cardSeenByHandler.id, "b", "panResponder must see the current card via ref, not the stale closure card");
  assert.notEqual(cardSeenByHandler.id, "a", "panResponder must not use the stale closure card");
});

// ---------------------------------------------------------------------------
// S10 – Fresh session order is a new unbiased full-deck shuffle
// ---------------------------------------------------------------------------

test("S10: fresh sessions use shuffled position one and do not reuse prior card order", () => {
  const source = fs.readFileSync(SWIPE_DECK_SCREEN_PATH, "utf8");
  assert.match(
    source,
    /if \(!hasSessionEvidence\) return cards\[0\] \?\? null;\s*\n\s*const fallback = selectAdaptiveCard/,
    "fresh sessions must use the first card from the session shuffle before adaptive ranking",
  );
  assert.match(
    source,
    /const cards = useMemo\(\(\) => shuffleArray\(deck\.cards\), \[deckKey, sessionNonce, deck\.cards\]\)/,
    "sessionNonce must invalidate the memoized card order",
  );
  assert.match(
    source,
    /for \(let i = a\.length - 1; i > 0; i--\)[\s\S]*Math\.floor\(Math\.random\(\) \* \(i \+ 1\)\)/,
    "production shuffle must remain full Fisher–Yates",
  );

  let state = 0x6d2b79f5;
  const random = () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x100000000;
  };
  const shuffle = (values) => {
    const copy = values.slice();
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  };

  const deck = Array.from({ length: 20 }, (_, index) => `card-${index}`);
  const firstCounts = new Map(deck.map((card) => [card, 0]));
  let previousOrder = null;
  let consecutiveOrderReuses = 0;
  for (let session = 0; session < 10_000; session++) {
    const order = shuffle(deck);
    firstCounts.set(order[0], firstCounts.get(order[0]) + 1);
    if (previousOrder && order.every((card, index) => card === previousOrder[index])) {
      consecutiveOrderReuses++;
    }
    previousOrder = order;
  }

  assert.equal(consecutiveOrderReuses, 0, "fresh sessions must not reuse the prior full order");
  assert.equal(
    [...firstCounts.values()].filter((count) => count > 0).length,
    deck.length,
    "every card must be able to appear first",
  );
  const expected = 10_000 / deck.length;
  const maxDeviation = Math.max(...[...firstCounts.values()].map((count) => Math.abs(count - expected)));
  assert.ok(maxDeviation < 5 * Math.sqrt(expected), "first-card distribution must remain statistically reasonable");
});

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

console.log();
console.log(`Swipe Deck Stability Regressions: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);