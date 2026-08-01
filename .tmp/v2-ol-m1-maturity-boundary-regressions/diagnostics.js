"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.stageDiagnostic = stageDiagnostic;
exports.buildDiagnosticReport = buildDiagnosticReport;
exports.buildRecommendationResultV2 = buildRecommendationResultV2;
function stageDiagnostic(stage, counts, details) {
    return { stage, status: "ok", counts, details };
}
function buildDiagnosticReport(input) {
    return {
        requestId: input.requestId,
        startedAt: input.startedAt,
        finishedAt: input.finishedAt,
        elapsedMs: Date.parse(input.finishedAt) - Date.parse(input.startedAt),
        stages: input.stages,
        tasteProfile: input.tasteProfile,
        searchPlan: input.searchPlan,
        sources: input.sources,
        rejectedReasons: input.rejectedReasons,
        finalSelectionTitles: input.finalItems.map((item) => item.title),
        finalItemsLength: input.finalItems.length,
        returnedItemsLength: input.finalItems.length,
        returnedItemsTitles: input.finalItems.map((item) => item.title),
        returnedItemsStageBoundary: "returned_items_match_final_selection",
        sessionReportHeader: input.tasteProfile.diagnostics.sessionReportHeader ? String(input.tasteProfile.diagnostics.sessionReportHeader) : undefined,
    };
}
function normalizedTitle(value) {
    return value.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}
function returnedCollectionRootKey(title) {
    const clean = normalizedTitle(title.split(/[:;(\[]/)[0] || title);
    const characterPairRoot = clean.match(/\b([a-z]{3,})\s+and\s+([a-z]{3,})\b/)?.[0] || "";
    if (characterPairRoot)
        return characterPairRoot;
    if (!/\b(complete|collected|collection|collections|treasury|storybook|stories|tales|adventures|books?|omnibus|anthology|library|set|boxed|box)\b/.test(clean))
        return "";
    const root = clean
        .replace(/\b(the|a|an)\b/g, " ")
        .replace(/\b(complete|collected|collection|collections|treasury|storybook|stories|tales|adventures|books?|chapter|chapters|volume|vol|omnibus|anthology|library|set|boxed|box)\b/g, " ")
        .replace(/\b\d+\b/g, " ")
        .replace(/\s+/g, " ")
        .trim();
    return root.split(" ").length >= 2 ? root : "";
}
function collapseMiddleGradesReturnedItems(items) {
    const seenRoots = new Set();
    const collapsedTitles = [];
    const returned = [];
    for (const item of items) {
        const root = returnedCollectionRootKey(item.title);
        if (root && seenRoots.has(root)) {
            collapsedTitles.push(item.title);
            continue;
        }
        if (root)
            seenRoots.add(root);
        returned.push(item);
    }
    return { items: returned, collapsedTitles };
}
function buildRecommendationResultV2(items, diagnostics) {
    const shouldCollapseReturnedRoots = diagnostics.tasteProfile.ageBand === "preteens";
    const collapsed = shouldCollapseReturnedRoots ? collapseMiddleGradesReturnedItems(items) : { items, collapsedTitles: [] };
    if (shouldCollapseReturnedRoots) {
        diagnostics.finalItemsLength = items.length;
        diagnostics.returnedItemsLength = collapsed.items.length;
        diagnostics.returnedItemsTitles = collapsed.items.map((item) => item.title);
        diagnostics.returnedItemsStageBoundary = collapsed.collapsedTitles.length
            ? "returned_items_after_middle_grades_collection_root_collapse"
            : "returned_items_match_final_selection";
        diagnostics.middleGradesReturnedLayerRootCollapseApplied = collapsed.collapsedTitles.length > 0;
        diagnostics.middleGradesReturnedLayerRootCollapsedTitles = collapsed.collapsedTitles;
        diagnostics.middleGradesReturnedLayerRootCollapseCausedUnderfill = collapsed.items.length < items.length && collapsed.items.length < 5;
        diagnostics.returnedItemPipelineObjectIds = collapsed.items.map((item) => String(item.diagnostics?.pipelineObjectId || "")).filter(Boolean);
        diagnostics.returnedItemPipelineScoredObjectIds = collapsed.items.map((item) => String(item.diagnostics?.pipelineScoredObjectId || "")).filter(Boolean);
    }
    return {
        engineVersion: "recommender-v2-openlibrary-baseline",
        items: collapsed.items,
        diagnostics,
    };
}
