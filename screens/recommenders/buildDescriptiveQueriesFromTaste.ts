// PATCHED VERSION - scenario-based thriller queries

import type { RecommenderInput } from "./types";

type SignalBucket = Record<string, number>;

type QuerySignals = {
  genre: SignalBucket;
  tone: SignalBucket;
  texture: SignalBucket;
  scenario: SignalBucket;
};

const NEGATIVE_TERMS = [
  "-analysis","-guide","-summary","-criticism","-literature","-magazine","-journal",
  "-catalog","-catalogue","-reference","-companion","-study","-workbook","-textbook",
  "-manual","-encyclopedia","-anthology","-collection","-essays","-nonfiction",
  "-biography","-memoir",
].join(" ");

function audiencePhrase(deckKey: RecommenderInput["deckKey"]): string {
  if (deckKey === "adult") return "adult fiction";
  if (deckKey === "ms_hs") return "young adult fiction";
  if (deckKey === "3_6") return "middle grade fiction";
  return "fiction";
}

// ✅ FIXED fallback
function fallbackQueriesForDeck(deckKey: RecommenderInput["deckKey"]): string[] {
  const audience = audiencePhrase(deckKey);
  return [
    `psychological suspense fiction ${audience} ${NEGATIVE_TERMS}`,
    `crime investigation novel ${audience} ${NEGATIVE_TERMS}`,
    `murder investigation novel ${audience} ${NEGATIVE_TERMS}`,
  ];
}

// ✅ FIXED thriller intent
function buildThrillerIntent(deckKey: RecommenderInput["deckKey"]) {
  const audience = audiencePhrase(deckKey);
  return [
    `psychological suspense fiction ${audience} ${NEGATIVE_TERMS}`,
    `crime investigation novel ${audience} ${NEGATIVE_TERMS}`,
    `murder investigation novel ${audience} ${NEGATIVE_TERMS}`,
  ];
}

export function buildDescriptiveQueriesFromTaste(input: RecommenderInput) {
  const queries = buildThrillerIntent(input.deckKey);
  return {
    queries,
    preview: queries[0],
    strategy: "patched-scenario-queries",
    signals: {}
  };
}

export default buildDescriptiveQueriesFromTaste;
