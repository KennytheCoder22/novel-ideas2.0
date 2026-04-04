import { TasteVector, TasteDimension } from "./personalityProfile";

export interface CandidateBook {
  id: string;
  title: string;
  vector: TasteVector;
  qualityScore?: number; // 0..1
  noveltyScore?: number; // 0..1
  explorationScore?: number; // 0..1
}

export interface RankedBook extends CandidateBook {
  tasteScore: number;
  finalScore: number;
}

const DIMENSIONS: TasteDimension[] = [
  "ideaDensity",
  "darkness",
  "warmth",
  "realism",
  "characterFocus",
  "pacing",
];

function dotProduct(a: TasteVector, b: TasteVector): number {
  let sum = 0;
  for (const key of DIMENSIONS) {
    sum += a[key] * b[key];
  }
  return sum;
}

function magnitude(vector: TasteVector): number {
  let sum = 0;
  for (const key of DIMENSIONS) {
    sum += vector[key] * vector[key];
  }
  return Math.sqrt(sum);
}

export function cosineSimilarity(a: TasteVector, b: TasteVector): number {
  const magA = magnitude(a);
  const magB = magnitude(b);

  if (magA === 0 || magB === 0) {
    return 0;
  }

  const similarity = dotProduct(a, b) / (magA * magB);
  return Math.max(-1, Math.min(1, similarity));
}

export function normalizeSimilarity(score: number): number {
  return (score + 1) / 2;
}

export function scoreBook(
  activeTaste: TasteVector,
  book: CandidateBook
): RankedBook {
  const tasteScore = normalizeSimilarity(cosineSimilarity(activeTaste, book.vector));
  const qualityScore = book.qualityScore ?? 0.5;
  const noveltyScore = book.noveltyScore ?? 0.5;
  const explorationScore = book.explorationScore ?? 0.5;

  const finalScore =
    0.65 * tasteScore +
    0.15 * qualityScore +
    0.1 * noveltyScore +
    0.1 * explorationScore;

  return {
    ...book,
    tasteScore,
    finalScore,
  };
}

export function rankBooks(
  activeTaste: TasteVector,
  candidateBooks: CandidateBook[]
): RankedBook[] {
  return candidateBooks
    .map((book) => scoreBook(activeTaste, book))
    .sort((a, b) => b.finalScore - a.finalScore);
}