import type { DeckKey } from './types';

export type RecommenderLane = 'adult' | 'teen' | 'preTeen' | 'kids';

export type RecommenderProfile = {
  canonicalBoost: number;
  discoveryBoost: number;
  genreStrictness: number;
  moodStrictness: number;
  darknessTolerance: number;
  authorRepeatLimit: number;
  popularityWeight: number;
  obscurePenalty: number;
  seriesPenalty: number;
  compendiumPenalty: number;
  mediaTieInPenalty: number;
  titleSpamPenalty: number;
  coverPenalty: number;
  recencyWeight: number;
  driftPenalty: number;
  fictionStrictness: number;
  sourceWeightOpenLibrary: number;
  sourceWeightGoogleBooks: number;
  credibilityFloor: number;
  semanticDiversityBoost: number;
  authorPenaltyStrength: number;
  sessionWeight: number;
  anchorMatchBoost: number;
  formatMatchBoost: number;
  kitsuSourceBoost: number;
  minMangaResults: number;
  negativeSignalPenalty: number;
  minKeep: number;
};

export const recommenderProfiles: Record<RecommenderLane, RecommenderProfile> = {
  adult: {
    canonicalBoost: 1,
    discoveryBoost: 1,
    genreStrictness: 1,
    moodStrictness: 1,
    darknessTolerance: 1,
    authorRepeatLimit: 2,
    popularityWeight: 1,
    obscurePenalty: 1,
    seriesPenalty: 1,
    compendiumPenalty: 1,
    mediaTieInPenalty: 1,
    titleSpamPenalty: 1,
    coverPenalty: 1,
    recencyWeight: 1,
    driftPenalty: 1,
    fictionStrictness: 1,
    sourceWeightOpenLibrary: 0.35,
    sourceWeightGoogleBooks: -0.15,
    credibilityFloor: 0.25,
    semanticDiversityBoost: 0.3,
    authorPenaltyStrength: 1,
    sessionWeight: 1.75,
    anchorMatchBoost: 1,
    formatMatchBoost: 1,
    kitsuSourceBoost: 0.5,
    minMangaResults: 1,
    negativeSignalPenalty: 1,
    minKeep: 6,
  },
  teen: {
    canonicalBoost: 0.9,
    discoveryBoost: 1.05,
    genreStrictness: 0.9,
    moodStrictness: 0.9,
    darknessTolerance: 0.85,
    authorRepeatLimit: 2,
    popularityWeight: 0.9,
    obscurePenalty: 0.8,
    seriesPenalty: 0.8,
    compendiumPenalty: 0.9,
    mediaTieInPenalty: 0.7,
    titleSpamPenalty: 0.75,
    coverPenalty: 0.65,
    recencyWeight: 1,
    driftPenalty: 0.65,
    fictionStrictness: 1,
    sourceWeightOpenLibrary: 0.2,
    sourceWeightGoogleBooks: -0.05,
    credibilityFloor: 0.15,
    semanticDiversityBoost: 0.2,
    authorPenaltyStrength: 0.7,
    sessionWeight: 1.75,
    anchorMatchBoost: 1,
    formatMatchBoost: 1,
    kitsuSourceBoost: 2,
    minMangaResults: 2,
    negativeSignalPenalty: 1,
    minKeep: 6,
  },
  preTeen: {
    canonicalBoost: 0.8,
    discoveryBoost: 1.05,
    genreStrictness: 0.75,
    moodStrictness: 0.75,
    darknessTolerance: 0.45,
    authorRepeatLimit: 2,
    popularityWeight: 0.75,
    obscurePenalty: 0.55,
    seriesPenalty: 0.65,
    compendiumPenalty: 0.8,
    mediaTieInPenalty: 0.3,
    titleSpamPenalty: 0.35,
    coverPenalty: 0.25,
    recencyWeight: 0.7,
    driftPenalty: 0.2,
    fictionStrictness: 0.8,
    sourceWeightOpenLibrary: 0.2,
    sourceWeightGoogleBooks: -0.05,
    credibilityFloor: 0.15,
    semanticDiversityBoost: 0.2,
    authorPenaltyStrength: 0.7,
    sessionWeight: 1.75,
    anchorMatchBoost: 1,
    formatMatchBoost: 1,
    kitsuSourceBoost: 0.5,
    minMangaResults: 0,
    negativeSignalPenalty: 1,
    minKeep: 6,
  },
  kids: {
    canonicalBoost: 0.7,
    discoveryBoost: 1,
    genreStrictness: 0.65,
    moodStrictness: 0.65,
    darknessTolerance: 0.25,
    authorRepeatLimit: 2,
    popularityWeight: 0.65,
    obscurePenalty: 0.25,
    seriesPenalty: 0.4,
    compendiumPenalty: 0.6,
    mediaTieInPenalty: 0.15,
    titleSpamPenalty: 0.2,
    coverPenalty: 0,
    recencyWeight: 0.5,
    driftPenalty: 0,
    fictionStrictness: 0.6,
    sourceWeightOpenLibrary: 0.2,
    sourceWeightGoogleBooks: -0.05,
    credibilityFloor: 0.15,
    semanticDiversityBoost: 0.2,
    authorPenaltyStrength: 0.7,
    sessionWeight: 1.75,
    anchorMatchBoost: 1,
    formatMatchBoost: 1,
    kitsuSourceBoost: 0,
    minMangaResults: 0,
    negativeSignalPenalty: 1,
    minKeep: 6,
  },
};

export function laneFromDeckKey(deckKey: DeckKey): RecommenderLane {
  if (deckKey === 'adult') return 'adult';
  if (deckKey === 'ms_hs') return 'teen';
  if (deckKey === '36') return 'preTeen';
  return 'kids';
}
