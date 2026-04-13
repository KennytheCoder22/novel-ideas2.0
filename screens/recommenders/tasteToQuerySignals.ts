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
  [/(dark|bleak|grim|noir)/i, "dark"],
  [/(cozy|comfort)/i, "cozy"],
  [/(hopeful|uplifting)/i, "hopeful"],
  [/(funny|humor|comedy)/i, "humorous"],
  [/(spooky|gothic|haunting)/i, "spooky"],
  [/(epic)/i, "epic"],
  [/(atmospheric|moody)/i, "atmospheric"],
  [/(realistic|grounded|procedural)/i, "realistic"],
  [/(psychological)/i, "psychological"],
];

// 🔧 FIXED — softened investigation mapping
const SCENARIO_RULES: Array<[RegExp, string]> = [
  [/(authority|politic)/i, "politics"],
  [/(betrayal|family secrets)/i, "betrayal"],
  [/(adventure|quest|journey)/i, "quest"],
  [/(war|battle)/i, "war"],
  [/(murder|investigation|detective)/i, "conflict"], // changed from "investigation"
  [/(survival)/i, "survival"],
  [/(family)/i, "family"],
  [/(mythology|prophecy)/i, "mythic"],
  [/(crime)/i, "conflict"], // softened
];

const PACING_RULES: Array<[RegExp, string]> = [
  [/(fast[- ]paced|gripping|intense|propulsive|action)/i, "fast-paced"],
  [/(slow burn|slow-burn|deliberate)/i, "slow-burn"],
];

function addSignal(bucket: QuerySignalMap, key: string, value: number) {
  if (!Number.isFinite(value) || value === 0) return;

  // 🔧 slight dampening for genre-heavy signals
  const dampened =
    key === "crime" || key === "thriller" || key === "mystery"
      ? value * 0.6
      : value;

  bucket[key] = (bucket[key] || 0) + dampened;
}

function applyRules(
  tag: string,
  value: number,
  rules: Array<[RegExp, string]>,
  bucket: QuerySignalMap
) {
  for (const [pattern, key] of rules) {
    if (pattern.test(tag)) addSignal(bucket, key, value);
  }
}

function addTasteAxes(
  input: RecommenderInput,
  tone: QuerySignalMap,
  pacing: QuerySignalMap
) {
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