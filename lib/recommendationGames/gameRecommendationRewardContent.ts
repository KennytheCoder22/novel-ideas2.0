import { gameRecommendationDescriptionExcerpt } from "./gameRecommendationDescription";
import { safeGameRecommendationReason } from "./gameRecommendationReason";

export type GameRecommendationRewardContent = {
  description: { label: "About this book"; text: string } | null;
  reason: { label: "Why it fits"; text: string };
};

export function gameRecommendationRewardContent(book: {
  description?: string | null;
  reason: string;
}): GameRecommendationRewardContent {
  const description = gameRecommendationDescriptionExcerpt(book.description);
  return {
    description: description ? { label: "About this book", text: description } : null,
    reason: { label: "Why it fits", text: safeGameRecommendationReason(book.reason) },
  };
}
