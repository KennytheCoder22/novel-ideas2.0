import type { RecommenderInput } from "./types";

export type QuerySignalMap = Record<string, number>;
export type QuerySignals = {
  genre: QuerySignalMap;
  tone: QuerySignalMap;
  scenario: QuerySignalMap;
  pacing: QuerySignalMap;
};

const GENRE_RULES: Array<[RegExp, string]> = [
  [/(^|:|\b)fantasy(\b|:|$)/i, "fantasy"],
  [/(^|:|\b)thriller(\b|:|$)/i, "thriller"],
  [/(^|:|\b)mystery(\b|:|$)/i, "mystery"],
  [/(^|:|\b)horror(\b|:|$)/i, "horror"],
  [/(^|:|\b)science fiction(\b|:|$)|(^|:|\b)sci[-\s]?fi(\b|:|$)/i, "science fiction"],
  [/(^|:|\b)romance(\b|:|$)/i, "romance"],
  [/(^|:|\b)historical(\b|:|$)/i, "historical fiction"],
  [/(^|:|\b)crime(\b|:|$)/i, "crime"],
  [/(^|:|\b)detective(\b|:|$)/i, "mystery"],
];
const TONE_RULES: Array<[RegExp, string]> = [
  [/(^|:|\b)dark(\b|:|$)|(^|:|\b)bleak(\b|:|$)|(^|:|\b)grim(\b|:|$)|(^|:|\b)noir(\b|:|$)/i, "dark"],
  [/(^|:|\b)cozy(\b|:|$)|(^|:|\b)comfort(\b|:|$)/i, "cozy"],
  [/(^|:|\b)hopeful(\b|:|$)|(^|:|\b)uplifting(\b|:|$)/i, "hopeful"],
  [/(^|:|\b)funny(\b|:|$)|(^|:|\b)humor(\b|:|$)|(^|:|\b)comedy(\b|:|$)/i, "humorous"],
  [/(^|:|\b)spooky(\b|:|$)|(^|:|\b)gothic(\b|:|$)|(^|:|\b)haunting(\b|:|$)/i, "spooky"],
  [/(^|:|\b)epic(\b|:|$)/i, "epic"],
  [/(^|:|\b)atmospheric(\b|:|$)|(^|:|\b)moody(\b|:|$)/i, "atmospheric"],
  [/(^|:|\b)realistic(\b|:|$)|(^|:|\b)grounded(\b|:|$)|(^|:|\b)procedural(\b|:|$)/i, "realistic"],
  [/(^|:|\b)psychological(\b|:|$)/i, "psychological"],
];
const SCENARIO_RULES: Array<[RegExp, string]> = [
  [/(^|:|\b)authority(\b|:|$)|(^|:|\b)politic/i, "politics"],
  [/(^|:|\b)betrayal(\b|:|$)|(^|:|\b)family secrets(\b|:|$)/i, "betrayal"],
  [/(^|:|\b)adventure(\b|:|$)|(^|:|\b)quest(\b|:|$)|(^|:|\b)journey(\b|:|$)/i, "quest"],
  [/(^|:|\b)war(\b|:|$)|(^|:|\b)battle(\b|:|$)/i, "war"],
  [/(^|:|\b)murder(\b|:|$)|(^|:|\b)investigation(\b|:|$)|(^|:|\b)detective(\b|:|$)/i, "investigation"],
  [/(^|:|\b)survival(\b|:|$)/i, "survival"],
  [/(^|:|\b)family(\b|:|$)/i, "family"],
  [/(^|:|\b)mythology(\b|:|$)|(^|:|\b)prophecy(\b|:|$)/i, "mythic"],
  [/(^|:|\b)crime(\b|:|$)/i, "crime"],
];
const PACING_RULES: Array<[RegExp, string]> = [
  [/(^|:|\b)fast[- ]paced(\b|:|$)|(^|:|\b)gripping(\b|:|$)|(^|:|\b)intense(\b|:|$)|(^|:|\b)propulsive(\b|:|$)|(^|:|\b)action(\b|:|$)/i, "fast-paced"],
  [/(^|:|\b)slow burn(\b|:|$)|(^|:|\b)slow-burn(\b|:|$)|(^|:|\b)deliberate(\b|:|$)/i, "slow-burn"],
];

function addSignal(bucket: QuerySignalMap, key: string, value: number) {
  if (!Number.isFinite(value) || value === 0) return;
  bucket[key] = (bucket[key] || 0) + value;
}
function applyRules(tag: string, value: number, rules: Array<[RegExp, string]>, bucket: QuerySignalMap) {
  for (const [pattern, key] of rules) {
    if (pattern.test(tag)) addSignal(bucket, key, value);
  }
}
function addTasteAxes(input: RecommenderInput, tone: QuerySignalMap, pacing: QuerySignalMap) {
  const axes = input.tasteProfile?.axes;
  if (!axes) return;
  if ((axes.darkness || 0) > 0.15) addSignal(tone, "dark", axes.darkness);
  if ((axes.humor || 0) > 0.15) addSignal(tone, "humorous", axes.humor);
  if ((axes.warmth || 0) > 0.15) addSignal(tone, "hopeful", axes.warmth);
  if ((axes.realism || 0) > 0.15) addSignal(tone, "realistic", axes.realism);
  if ((axes.realism || 0) < -0.15) addSignal(tone, "epic", Math.abs(axes.realism));
  if ((axes.pacing || 0) > 0.15) addSignal(pacing, "fast-paced", axes.pacing);
  if ((axes.pacing || 0) < -0.15) addSignal(pacing, "slow-burn", Math.abs(axes.pacing));
}

export function extractQuerySignals(input: RecommenderInput): QuerySignals {
  const tagCounts = input.tagCounts || {};
  const genre: QuerySignalMap = {};
  const tone: QuerySignalMap = {};
  const scenario: QuerySignalMap = {};
  const pacing: QuerySignalMap = {};

  for (const [tag, raw] of Object.entries(tagCounts)) {
    const value = Number(raw || 0);
    if (!Number.isFinite(value) || value <= 0) continue;
    applyRules(tag, value, GENRE_RULES, genre);
    applyRules(tag, value, TONE_RULES, tone);
    applyRules(tag, value, SCENARIO_RULES, scenario);
    applyRules(tag, value, PACING_RULES, pacing);
  }

  addTasteAxes(input, tone, pacing);
  return { genre, tone, scenario, pacing };
}
