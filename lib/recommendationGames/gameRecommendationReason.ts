const FALLBACK_REASON = "Your choices suggest this story could be a good fit.";

const INTERNAL_PREFIX = /^(?:positiveTasteMatch|genreFacetMatch):/i;
const AVOID_PREFIX = /^avoidSignalPenalty:/i;
const INTERNAL_WORDS = /\b(?:diagnostic|taxonomy|feature|signals?|matched|weight|score|bucket|penalty|facetmatch|tastematch|query|rank|source|enum|raw|genre|vibe|tone|theme|pace|format)\b/i;

const FRIENDLY_SIGNAL: Record<string, string> = {
  "emotional depth high": "emotionally rich",
  "emotional depth low": "lighthearted",
  "humor high": "playful",
  "humor low": "serious",
  "imagination high": "imaginative",
  "imagination low": "realistic",
  "intensity high": "adventurous",
  "intensity low": "gentle",
  "novelty high": "surprising",
  "novelty low": "familiar",
  "pace high": "fast-paced",
  "pace low": "unhurried",
  "pace slow": "slow-paced",
  "pace fast": "fast-paced",
  "social energy high": "community-centered",
  "social energy low": "solitary",
  "structure high": "thoughtfully structured",
  "structure low": "exploratory",
  "visual aesthetic high": "visually rich",
  "visual aesthetic low": "understated",
  humor: "humorous",
  imagination: "imaginative",
  world: "immersive",
};

function normalizeSignal(rawSignal: string): string {
  let value = String(rawSignal || "").trim();
  if (!value || AVOID_PREFIX.test(value)) return "";
  value = value.replace(INTERNAL_PREFIX, "");
  value = value.replace(/^(?:tone|mood|theme|genre|format|pitch|vibe|topic)(?::|\s)+/i, "");
  value = value
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[_:]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
  if (!value || /\d/.test(value) || INTERNAL_WORDS.test(value)) return "";
  return FRIENDLY_SIGNAL[value] || value;
}

export function gameRecommendationReasonFromMatchedSignals(matchedSignals: readonly string[]): string {
  const descriptors = [...new Set(matchedSignals.map(normalizeSignal).filter(Boolean))].slice(0, 2);
  if (!descriptors.length) return FALLBACK_REASON;
  if (descriptors.length === 1) return `Your choices suggest you enjoy ${descriptors[0]} stories.`;
  return `Your choices suggest you enjoy ${descriptors[0]}, ${descriptors[1]} stories.`;
}

export function safeGameRecommendationReason(value: unknown): string {
  const reason = typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
  if (
    !reason
    || reason.length > 180
    || /[_:]|[a-z][A-Z]|\d/.test(reason)
    || INTERNAL_WORDS.test(reason)
    || /\b(?:high|low)\b/i.test(reason)
  ) return FALLBACK_REASON;
  return reason;
}
