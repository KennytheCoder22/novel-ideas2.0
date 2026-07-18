function uniqueTitles(values: string[], limit = 120): string[] {
  const seen = new Set<string>();
  const titles: string[] = [];
  for (const value of values) {
    const title = String(value || "").trim();
    const key = title.toLowerCase();
    if (!title || seen.has(key)) continue;
    seen.add(key);
    titles.push(title);
    if (titles.length >= limit) break;
  }
  return titles;
}

export function harmonizeGoogleBooksStageLineage(stages: Record<string, string[]>): Record<string, string[]> {
  const selectedOrRenderedTitles = uniqueTitles([
    ...(stages.finalAcceptedDocs || []),
    ...(stages.wrapperInput || []),
    ...(stages.wrapperOutput || []),
    ...(stages.returnedItems || []),
    ...(stages.renderedRecommendations || []),
    ...(stages.rendererInput || []),
    ...(stages.rendererOutput || []),
  ]);
  if (!selectedOrRenderedTitles.length) return stages;

  const finalAcceptedDocs = uniqueTitles([
    ...(stages.finalAcceptedDocs || []),
    ...selectedOrRenderedTitles,
  ]);
  const finalEligibility = uniqueTitles([
    ...(stages.finalEligibility || []),
    ...finalAcceptedDocs,
  ]);
  return {
    ...stages,
    finalEligibility,
    finalAcceptedDocs,
  };
}

export function computeGoogleBooksDropDiagnostics(stages: Record<string, string[]>): { droppedStage: string; droppedReason: string } {
  const stageOrder = [
    "normalizedCandidate",
    "rankedCandidate",
    "finalEligibility",
    "finalAcceptedDocs",
    "wrapperInput",
    "wrapperOutput",
    "rendererInput",
    "rendererOutput",
  ];
  let droppedStage = "";
  for (let i = 1; i < stageOrder.length; i += 1) {
    const previous = stages[stageOrder[i - 1]] || [];
    const current = stages[stageOrder[i]] || [];
    if (previous.length > 0 && current.length === 0) {
      droppedStage = stageOrder[i];
      break;
    }
  }
  let droppedReason = "";
  if (droppedStage) {
    droppedReason = "googlebooks_titles_missing_after_previous_stage";
    if (droppedStage === "wrapperOutput") droppedReason = "wrapper_removed_googlebooks_titles";
    if (droppedStage === "rendererOutput") droppedReason = "renderer_output_missing_googlebooks_titles";
  }
  return { droppedStage, droppedReason };
}

export function computeGoogleBooksDropDiagnosticsByTitle(
  stages: Record<string, string[]>,
  eligibilityReasonByTitle: Record<string, string> = {},
  selectionDecisionByTitle: Record<string, string> = {},
  rejectedBeforeRankingReasonByTitle: Record<string, string> = {},
): { droppedStageByTitle: Record<string, string>; droppedReasonByTitle: Record<string, string> } {
  const stageOrder = [
    "normalizedCandidate",
    "rankedCandidate",
    "finalEligibility",
    "finalAcceptedDocs",
    "wrapperInput",
    "wrapperOutput",
    "rendererInput",
    "rendererOutput",
  ];
  const stageSetByName: Record<string, Set<string>> = Object.fromEntries(
    Object.entries(stages).map(([stage, titles]) => [stage, new Set((titles || []).map((title) => String(title || "").trim().toLowerCase()).filter(Boolean))]),
  );
  const renderedTitles = new Set([
    ...(stages.wrapperInput || []),
    ...(stages.wrapperOutput || []),
    ...(stages.returnedItems || []),
    ...(stages.renderedRecommendations || []),
    ...(stages.rendererInput || []),
    ...(stages.rendererOutput || []),
  ].map((title) => String(title || "").trim().toLowerCase()).filter(Boolean));
  const allTitles = uniqueTitles(stageOrder.flatMap((stage) => stages[stage] || []));
  const droppedStageByTitle: Record<string, string> = {};
  const droppedReasonByTitle: Record<string, string> = {};
  for (const title of allTitles) {
    const key = String(title || "").trim().toLowerCase();
    if (renderedTitles.has(key)) {
      droppedStageByTitle[title] = "";
      droppedReasonByTitle[title] = "";
      continue;
    }
    for (let i = 1; i < stageOrder.length; i += 1) {
      const previousStage = stageOrder[i - 1];
      const currentStage = stageOrder[i];
      const inPrevious = Boolean(stageSetByName[previousStage]?.has(key));
      const inCurrent = Boolean(stageSetByName[currentStage]?.has(key));
      if (!inPrevious || inCurrent) continue;
      droppedStageByTitle[title] = currentStage;
      if (currentStage === "rankedCandidate" && rejectedBeforeRankingReasonByTitle[title]) {
        droppedReasonByTitle[title] = rejectedBeforeRankingReasonByTitle[title];
      } else if (currentStage === "wrapperOutput") {
        droppedReasonByTitle[title] = "wrapper_removed_googlebooks_title";
      } else if (currentStage === "rendererOutput") {
        droppedReasonByTitle[title] = "renderer_output_missing_googlebooks_title";
      } else if (currentStage === "finalEligibility" && eligibilityReasonByTitle[title]) {
        droppedReasonByTitle[title] = eligibilityReasonByTitle[title];
      } else if (currentStage === "finalAcceptedDocs" && selectionDecisionByTitle[title]) {
        droppedReasonByTitle[title] = selectionDecisionByTitle[title];
      } else {
        droppedReasonByTitle[title] = "missing_in_next_googlebooks_stage";
      }
      break;
    }
    if (!droppedStageByTitle[title]) {
      droppedStageByTitle[title] = "";
      droppedReasonByTitle[title] = "";
    }
  }
  return { droppedStageByTitle, droppedReasonByTitle };
}
