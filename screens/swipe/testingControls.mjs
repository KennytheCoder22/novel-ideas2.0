export function shouldShowTestingEvaluation({
  isTestingMode,
  platform,
  showRecommendationsView,
  recommendationCount,
}) {
  return Boolean(
    isTestingMode &&
      platform === "web" &&
      showRecommendationsView &&
      recommendationCount > 0
  );
}
