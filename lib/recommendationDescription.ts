const DESCRIPTION_FALLBACK = "No description is available for this title.";
const MAX_DESCRIPTION_SENTENCES = 5;
const MAX_DESCRIPTION_CHARACTERS = 1200;

const HTML_ENTITIES: Record<string, string> = {
  amp: "&",
  apos: "'",
  gt: ">",
  hellip: "...",
  ldquo: "\"",
  lsquo: "'",
  lt: "<",
  mdash: "—",
  nbsp: " ",
  ndash: "–",
  quot: "\"",
  rdquo: "\"",
  rsquo: "'",
};

function decodeHtmlEntity(entity: string): string {
  const body = entity.slice(1, -1);
  if (body.startsWith("#x") || body.startsWith("#X")) {
    const codePoint = Number.parseInt(body.slice(2), 16);
    return Number.isFinite(codePoint) && codePoint >= 0 && codePoint <= 0x10ffff
      ? String.fromCodePoint(codePoint)
      : entity;
  }
  if (body.startsWith("#")) {
    const codePoint = Number.parseInt(body.slice(1), 10);
    return Number.isFinite(codePoint) && codePoint >= 0 && codePoint <= 0x10ffff
      ? String.fromCodePoint(codePoint)
      : entity;
  }
  return HTML_ENTITIES[body.toLowerCase()] ?? entity;
}

export function cleanRecommendationDescription(value: unknown): string {
  return String(value || "")
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<\/(?:p|div|li|h[1-6])>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&(?:#\d+|#x[\da-f]+|[a-z]+);/gi, decodeHtmlEntity)
    .replace(/\s+/g, " ")
    .trim();
}

function truncateAtWord(text: string, limit: number): string {
  if (text.length <= limit) return text;
  const clipped = text.slice(0, limit + 1);
  const lastSpace = clipped.lastIndexOf(" ");
  return `${clipped.slice(0, lastSpace > limit * 0.7 ? lastSpace : limit).trimEnd()}…`;
}

export function recommendationDescriptionExcerpt(value: unknown): string {
  const cleaned = cleanRecommendationDescription(value);
  if (!cleaned) return DESCRIPTION_FALLBACK;

  const sentences = cleaned.match(/[^.!?]+(?:[.!?]+(?=\s|$)|$)/g) || [cleaned];
  const excerpt = sentences.slice(0, MAX_DESCRIPTION_SENTENCES).map((sentence) => sentence.trim()).join(" ");
  return truncateAtWord(excerpt, MAX_DESCRIPTION_CHARACTERS);
}

export { DESCRIPTION_FALLBACK };
