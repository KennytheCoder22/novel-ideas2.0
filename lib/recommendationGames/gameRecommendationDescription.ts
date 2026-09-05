import { cleanRecommendationDescription } from "../recommendationDescription";

const MAX_GAME_DESCRIPTION_SENTENCES = 3;
const MAX_GAME_DESCRIPTION_CHARACTERS = 420;

export type GameRecommendationDescriptionProvenance = {
  source: string;
  field:
    | "displayDescription"
    | "description"
    | "raw.description"
    | "raw.summary"
    | "raw.first_sentence"
    | "raw.volumeInfo.description"
    | "raw.attributes.synopsis"
    | "raw.deck"
    | "raw.raw.description"
    | "raw.raw.summary"
    | "raw.raw.first_sentence"
    | "raw.raw.volumeInfo.description"
    | "raw.raw.attributes.synopsis"
    | "raw.raw.deck";
};

const DESCRIPTION_PROVENANCE_FIELDS = new Set<GameRecommendationDescriptionProvenance["field"]>([
  "displayDescription",
  "description",
  "raw.description",
  "raw.summary",
  "raw.first_sentence",
  "raw.volumeInfo.description",
  "raw.attributes.synopsis",
  "raw.deck",
  "raw.raw.description",
  "raw.raw.summary",
  "raw.raw.first_sentence",
  "raw.raw.volumeInfo.description",
  "raw.raw.attributes.synopsis",
  "raw.raw.deck",
]);

export type GameRecommendationDescriptionCandidate = {
  source: string;
  description?: unknown;
  displayDescription?: unknown;
  raw?: unknown;
};

function objectField(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function descriptionValue(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (Array.isArray(value)) return value.map((entry) => String(entry || "").trim()).filter(Boolean).join(" ");
  return typeof objectField(value).value === "string" ? String(objectField(value).value).trim() : "";
}

function isGeneratedSourceFallback(source: string, value: string): boolean {
  if (source === "mock") return true;
  return source === "nyt" && /^New York Times bestseller from .+\.$/i.test(value);
}

function truncateAtWord(value: string, limit: number): string {
  if (value.length <= limit) return value;
  const clipped = value.slice(0, limit + 1);
  const lastSpace = clipped.lastIndexOf(" ");
  const boundary = lastSpace > limit * 0.7 ? lastSpace : limit;
  return `${clipped.slice(0, boundary).trimEnd()}…`;
}

export function gameRecommendationDescriptionExcerpt(value: unknown): string | null {
  const cleaned = cleanRecommendationDescription(value);
  if (!cleaned) return null;

  const sentences = cleaned.match(/[^.!?]+(?:[.!?]+(?=\s|$)|$)/g) || [cleaned];
  const selected: string[] = [];
  for (const sentence of sentences.slice(0, MAX_GAME_DESCRIPTION_SENTENCES)) {
    const next = [...selected, sentence.trim()].join(" ");
    if (next.length > MAX_GAME_DESCRIPTION_CHARACTERS) break;
    selected.push(sentence.trim());
  }
  if (selected.length) {
    return selected.join(" ");
  }
  return truncateAtWord(sentences[0].trim(), MAX_GAME_DESCRIPTION_CHARACTERS);
}

export function isGameRecommendationDescriptionProvenance(
  value: unknown,
): value is GameRecommendationDescriptionProvenance {
  const provenance = objectField(value);
  return typeof provenance.source === "string"
    && DESCRIPTION_PROVENANCE_FIELDS.has(provenance.field as GameRecommendationDescriptionProvenance["field"]);
}

export function gameRecommendationDescription(
  candidate: GameRecommendationDescriptionCandidate,
): { text: string; provenance: GameRecommendationDescriptionProvenance } | null {
  const raw = objectField(candidate.raw);
  const nestedRaw = objectField(raw.raw);
  const fields: [GameRecommendationDescriptionProvenance["field"], unknown][] = [
    ["displayDescription", candidate.displayDescription],
    ["description", candidate.description],
    ["raw.description", raw.description],
    ["raw.summary", raw.summary],
    ["raw.first_sentence", raw.first_sentence],
    ["raw.volumeInfo.description", objectField(raw.volumeInfo).description],
    ["raw.attributes.synopsis", objectField(raw.attributes).synopsis],
    ["raw.deck", raw.deck],
    ["raw.raw.description", nestedRaw.description],
    ["raw.raw.summary", nestedRaw.summary],
    ["raw.raw.first_sentence", nestedRaw.first_sentence],
    ["raw.raw.volumeInfo.description", objectField(nestedRaw.volumeInfo).description],
    ["raw.raw.attributes.synopsis", objectField(nestedRaw.attributes).synopsis],
    ["raw.raw.deck", nestedRaw.deck],
  ];

  for (const [field, value] of fields) {
    const sourceText = descriptionValue(value);
    if (!sourceText || isGeneratedSourceFallback(candidate.source, sourceText)) continue;
    const text = gameRecommendationDescriptionExcerpt(sourceText);
    if (text) return { text, provenance: { source: candidate.source, field } };
  }
  return null;
}
