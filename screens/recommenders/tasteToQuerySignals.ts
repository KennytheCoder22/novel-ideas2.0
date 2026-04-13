import type { RecommenderInput } from "./types";

export type QuerySignalMap = Record<string, number>;

export type QuerySignals = {
  genre: QuerySignalMap;
  tone: QuerySignalMap;
  scenario: QuerySignalMap;
  pacing: QuerySignalMap;
};

const GENRE_RULES: Array<[RegExp, string]> = [
  [/(fantasy)/i, "fantasy"],
  [/(thriller)/i, "thriller"],
  [/(mystery|detective)/i, "mystery"],
  [/(horror|spooky)/i, "horror"],
  [/(science fiction|sci[- ]?fi)/i, "science fiction"],
  [/(romance)/i, "romance"],
  [/(historical)/i, "historical"],
  [/(crime)/i, "crime"],
];

const TONE_RULES: Array<[RegExp, string]> = [
  [/(dark|bleak|grim|noir)/i, "dark"],
  [/(hopeful|uplifting)/i, "hopeful"],
  [/(funny|comedy)/i, "humorous"],
  [/(atmospheric|moody)/i, "atmospheric"],
  [/(realistic|grounded|procedural)/i, "realistic"],
  [/(psychological)/i, "psychological"],
];

// 🔥 FIXED — NO MORE "conflict"
const SCENARIO_RULES: Array<[RegExp, string]> = [
  [/(investigation|detective|mystery)/i, "investigation"],
  [/(crime)/i, "crime"],
  [/(authority|system|institution|politic)/i, "institutional"],
  [/(betrayal)/i, "betrayal"],
  [/(identity)/i, "identity"],
  [/(survival)/i, "survival"],
  [/(family)/i, "family"],
  [/(romance|relationship|love)/i, "relationship"],
  [/(dystopian)/i, "dystopian"],
  [/(rebellion)/i, "rebellion"],
  [/(technology|ai)/i, "technology"],
];

const PACING_RULES: Array<[RegExp, string]> = [
  [/(fast[- ]paced|intense|gripping|action)/i, "fast"],
  [/(slow burn|deliberate)/i, "slow"],
];

function add(bucket: QuerySignalMap, key: string, value: number) {
  if (!value) return;
  bucket[key] = (bucket[key] || 0) + value;
}

function apply(tag: string, value: number, rules: Array<[RegExp, string]>, bucket: QuerySignalMap) {
  for (const [pattern, key] of rules) {
    if (pattern.test(tag)) add(bucket, key, value);
  }
}

export function extractQuerySignals(input: RecommenderInput): QuerySignals {
  const tagCounts = input.tagCounts || {};

  const genre: QuerySignalMap = {};
  const tone: QuerySignalMap = {};
  const scenario: QuerySignalMap = {};
  const pacing: QuerySignalMap = {};

  for (const [tag, raw] of Object.entries(tagCounts)) {
    const value = Number(raw || 0);
    if (value <= 0) continue;

    apply(tag, value, GENRE_RULES, genre);
    apply(tag, value, TONE_RULES, tone);
    apply(tag, value, SCENARIO_RULES, scenario);
    apply(tag, value, PACING_RULES, pacing);
  }

  return { genre, tone, scenario, pacing };
}