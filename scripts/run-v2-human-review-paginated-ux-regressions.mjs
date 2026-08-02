import { createRequire } from "node:module";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { stableStringify } from "./human-review/lib/human-review-core.mjs";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, "..");
const swipeScreenPath = resolve(repoRoot, "screens", "SwipeDeckScreen.tsx");
const appDir = resolve(repoRoot, "app", "recommender-v2");
const screenDir = resolve(repoRoot, "screens", "swipe");
const manifestPath = resolve(repoRoot, "scripts", "human-review", "frozen-profile-manifest.v1.json");
const baselineSnapshotsDir = resolve(
  repoRoot,
  "scripts",
  "output",
  "human-review",
  "phase1-infrastructure-certification",
  "snapshots"
);
const v1ExportPath = resolve(
  repoRoot,
  "scripts",
  "output",
  "human-review",
  "recommendation-quality-baseline-study-v1",
  "review-record-export.before.json"
);
const v1ReportPath = resolve(
  repoRoot,
  "scripts",
  "output",
  "human-review",
  "recommendation-quality-baseline-study-v1",
  "human-review-report.v1.json"
);

const require = createRequire(import.meta.url);
const ts = require("typescript");
require.extensions[".ts"] = (module, filename) => {
  const source = readFileSync(filename, "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: {
      esModuleInterop: true,
      module: ts.ModuleKind.CommonJS,
      moduleResolution: ts.ModuleResolutionKind.Node10,
      target: ts.ScriptTarget.ES2020,
    },
  }).outputText;
  module._compile(output, filename);
};
require.extensions[".tsx"] = require.extensions[".ts"];

const {
  createHumanReviewSnapshot,
  createDefaultHumanReviewForm,
  createHumanReviewRecordFromForm,
} = require(resolve(screenDir, "humanReviewContract.ts"));
const {
  allHumanReviewItemStepsComplete,
  buildHumanReviewDraft,
  computeSwipeVibeSummary,
  estimateRemainingReviewSeconds,
  formatRemainingReviewTime,
  getHumanReviewProgressLabel,
  humanReviewDraftStorageKey,
  restoreHumanReviewDraft,
} = require(resolve(screenDir, "humanReviewPaginatedUx.ts"));
const { runRecommenderV2 } = require(resolve(appDir, "engine.ts"));

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function normalizeRecommendationItems(items) {
  return (Array.isArray(items) ? items : []).map((item, index) => ({
    rank: index + 1,
    title: item.title,
    source: item.source,
    sourceId: item.sourceId || null,
    score: Number(item.score || 0),
    matchedSignals: Array.isArray(item.matchedSignals) ? item.matchedSignals : [],
    scoreBreakdown: item.scoreBreakdown || {},
  }));
}

function loadBaselineSnapshotForProfile(profileId) {
  const fileName = readdirSync(baselineSnapshotsDir).find((name) => name.startsWith(`${profileId}__`) && name.endsWith(".json"));
  if (!fileName) throw new Error(`baseline_snapshot_missing:${profileId}`);
  return JSON.parse(readFileSync(resolve(baselineSnapshotsDir, fileName), "utf8"));
}

async function run() {
  const checks = [];
  const swipeScreenSource = readFileSync(swipeScreenPath, "utf8");

  // 1) only one recommendation renders at a time.
  assert(
    swipeScreenSource.includes("const visibleHumanReviewItem = humanReviewForm?.itemReviews.find"),
    "single_visible_item_selector_missing"
  );
  assert(
    !swipeScreenSource.includes("humanReviewForm.itemReviews.map((item) => ("),
    "multi_recommendation_render_loop_detected"
  );
  checks.push({ id: 1, name: "single_recommendation_per_step", pass: true });

  // 2) progress is correct for first, middle, and final items.
  assert(getHumanReviewProgressLabel(0, 5) === "Recommendation 1 of 5", "progress_first_incorrect");
  assert(getHumanReviewProgressLabel(2, 5) === "Recommendation 3 of 5", "progress_middle_incorrect");
  assert(getHumanReviewProgressLabel(4, 5) === "Recommendation 5 of 5", "progress_final_incorrect");
  checks.push({ id: 2, name: "recommendation_progress_label", pass: true });

  // Shared fixture for draft/evidence checks.
  const snapshot = createHumanReviewSnapshot({
    ageBand: "teens",
    deckKey: "ms_hs",
    engineVersion: "v2",
    swipeSignals: [
      { id: "s1", title: "Skyward", action: "like", source: "mock", format: "book" },
      { id: "s2", title: "Scythe", action: "like", source: "mock", format: "book" },
    ],
    recommendationItems: [
      { rank: 1, title: "The Lantern Archive", author: "NovelIdeas V2 Mock", source: "mock" },
      { rank: 2, title: "Signal in the Stacks", author: "NovelIdeas V2 Mock", source: "mock" },
      { rank: 3, title: "A Library of Echoes", author: "NovelIdeas V2 Mock", source: "mock" },
    ],
  });
  const form = createDefaultHumanReviewForm(snapshot);
  form.reviewerId = "ux-reviewer";

  // 3) all item fields are visible immediately on step open (no expected-enjoyment reveal gate).
  assert(
    !swipeScreenSource.includes("visibleHumanReviewDetailsUnlocked ? ("),
    "details_visibility_is_still_gated"
  );
  assert(
    !swipeScreenSource.includes("Select expected enjoyment to reveal synopsis and recommendation rationale for this step."),
    "gate_hint_copy_still_present"
  );
  checks.push({ id: 3, name: "all_fields_visible_without_reveal_gate", pass: true });

  // 4) Previous/Next preserves entered values.
  form.itemReviews[0].notes = "first-step-notes";
  form.itemReviews[1].decision = "not_recommended";
  form.itemReviews[1].tasteAlignment = 2;
  const navDraft = buildHumanReviewDraft({
    snapshotId: snapshot.snapshotId,
    form,
    stepIndex: 1,
    stepStartedAtByRank: { "1": "2026-08-01T00:00:00.000Z", "2": "2026-08-01T00:01:00.000Z" },
    stepCompletedAtByRank: { "1": "2026-08-01T00:01:00.000Z" },
    updatedAt: "2026-08-01T00:01:10.000Z",
  });
  const navRestored = restoreHumanReviewDraft({
    rawDraft: JSON.stringify(navDraft),
    snapshotId: snapshot.snapshotId,
    defaultForm: createDefaultHumanReviewForm(snapshot),
  });
  assert(Boolean(navRestored), "navigation_draft_restore_failed");
  assert(navRestored.stepIndex === 1, "navigation_step_index_not_preserved");
  assert(navRestored.form.itemReviews[0].notes === "first-step-notes", "previous_next_item1_value_lost");
  assert(navRestored.form.itemReviews[1].decision === "not_recommended", "previous_next_item2_value_lost");
  checks.push({ id: 4, name: "previous_next_preserves_values", pass: true });

  // 5) autosave and refresh recovery restore the exact draft.
  assert(
    swipeScreenSource.includes("safeStorageSet(humanReviewDraftStorageKey"),
    "draft_autosave_write_missing"
  );
  assert(
    swipeScreenSource.includes("restoreHumanReviewDraft("),
    "draft_restore_read_missing"
  );
  assert(
    humanReviewDraftStorageKey(snapshot.snapshotId).includes(snapshot.snapshotId),
    "draft_storage_key_missing_snapshot"
  );
  const exactDraft = buildHumanReviewDraft({
    snapshotId: snapshot.snapshotId,
    form: navRestored.form,
    stepIndex: navRestored.stepIndex,
    stepStartedAtByRank: navRestored.stepStartedAtByRank,
    stepCompletedAtByRank: navRestored.stepCompletedAtByRank,
    updatedAt: "2026-08-01T00:01:11.000Z",
  });
  const exactRestored = restoreHumanReviewDraft({
    rawDraft: JSON.stringify(exactDraft),
    snapshotId: snapshot.snapshotId,
    defaultForm: createDefaultHumanReviewForm(snapshot),
  });
  assert(stableStringify(exactRestored) === stableStringify(exactDraft), "exact_draft_restore_mismatch");
  checks.push({ id: 5, name: "autosave_refresh_recovery", pass: true });

  // 6) time estimates update without affecting stored evidence.
  const remainingBefore = estimateRemainingReviewSeconds({
    totalRecommendations: 3,
    stepStartedAtByRank: { "1": "2026-08-01T00:00:00.000Z" },
    stepCompletedAtByRank: { "1": "2026-08-01T00:00:40.000Z" },
  });
  const remainingAfter = estimateRemainingReviewSeconds({
    totalRecommendations: 3,
    stepStartedAtByRank: {
      "1": "2026-08-01T00:00:00.000Z",
      "2": "2026-08-01T00:00:40.000Z",
    },
    stepCompletedAtByRank: {
      "1": "2026-08-01T00:00:40.000Z",
      "2": "2026-08-01T00:01:40.000Z",
    },
  });
  assert(Number(remainingAfter) !== Number(remainingBefore), "rolling_time_estimate_not_updating");
  assert(formatRemainingReviewTime(remainingAfter).startsWith("About "), "time_remaining_format_invalid");
  const evidenceBefore = createHumanReviewRecordFromForm({ snapshot, form: navRestored.form });
  const evidenceAfter = createHumanReviewRecordFromForm({ snapshot, form: navRestored.form });
  assert(stableStringify(evidenceBefore.itemReviews) === stableStringify(evidenceAfter.itemReviews), "evidence_changed_by_time_estimate");
  checks.push({ id: 6, name: "rolling_time_estimate_without_evidence_drift", pass: true });

  // 7) slate-level questions are inaccessible until all item steps are complete.
  const slateForm = createDefaultHumanReviewForm(snapshot);
  assert(allHumanReviewItemStepsComplete(slateForm) === false, "slate_unlocked_before_any_completion");
  slateForm.itemReviews[0].expectedEnjoyment = 5;
  assert(allHumanReviewItemStepsComplete(slateForm) === false, "slate_unlocked_too_early");
  slateForm.itemReviews[1].expectedEnjoyment = 4;
  slateForm.itemReviews[2].expectedEnjoyment = 3;
  assert(allHumanReviewItemStepsComplete(slateForm) === true, "slate_not_unlocked_after_all_complete");
  assert(
    swipeScreenSource.includes("{humanReviewSlateStepVisible ? ("),
    "slate_step_gate_render_missing"
  );
  checks.push({ id: 7, name: "slate_questions_gated_until_all_steps_complete", pass: true });

  // 8) existing v1 review records and reports remain compatible.
  const exportPayload = JSON.parse(readFileSync(v1ExportPath, "utf8"));
  const reportPayload = JSON.parse(readFileSync(v1ReportPath, "utf8"));
  assert(Array.isArray(exportPayload.records) && exportPayload.records.length > 0, "v1_export_records_missing");
  assert(exportPayload.records.every((record) => record.schemaVersion === "human_review_record_v1"), "v1_record_schema_changed");
  assert(reportPayload.schemaVersion === "human_review_report_v1", "v1_report_schema_changed");
  assert(reportPayload.summary && typeof reportPayload.summary.records === "number", "v1_report_summary_missing");
  checks.push({ id: 8, name: "v1_records_and_reports_compatible", pass: true });

  // 9) recommendation outputs are byte-identical before and after the UX change.
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  for (const profile of manifest.profiles || []) {
    const baseline = loadBaselineSnapshotForProfile(profile.id);
    const sessionInput = {
      ...profile.session,
      requestId: `regression-${profile.id}`,
    };
    const actualResult = await runRecommenderV2(sessionInput);
    const actualItems = normalizeRecommendationItems(actualResult.items || []);
    const expectedItems = Array.isArray(baseline.recommendationItems) ? baseline.recommendationItems : [];
    if (stableStringify(actualItems) !== stableStringify(expectedItems)) {
      throw new Error(`recommendation_output_drift:${profile.id}`);
    }
  }
  checks.push({ id: 9, name: "recommendation_output_byte_identity", pass: true, profiles: manifest.profiles.length });

  // --- Check 10: vibe summary function presence, correctness, and fallback ---
  const screenSrcForVibe = readFileSync(swipeScreenPath, "utf8");
  assert(
    screenSrcForVibe.includes("computeSwipeVibeSummary"),
    "vibe_summary_not_referenced_in_screen_source"
  );
  assert(
    screenSrcForVibe.includes("humanReviewContextVibeSummary"),
    "vibe_summary_style_missing_from_screen_source"
  );

  // liked with engine signals → uses the top two signals
  const likedWithSignals = computeSwipeVibeSummary(
    [{ title: "Book A" }, { title: "Book B" }],
    ["Fantasy", "Adventure"],
    "liked"
  );
  assert(
    typeof likedWithSignals === "string" && likedWithSignals.length > 0,
    `vibe_summary_liked_with_signals_empty: "${likedWithSignals}"`
  );
  assert(
    likedWithSignals.toLowerCase().includes("fantasy") || likedWithSignals.toLowerCase().includes("adventure"),
    `vibe_summary_liked_must_reference_engine_signals: "${likedWithSignals}"`
  );

  // liked with no signals → non-empty fallback
  const likedNoSignals = computeSwipeVibeSummary(
    [{ title: "Book A" }, { title: "Book B" }],
    [],
    "liked"
  );
  assert(
    typeof likedNoSignals === "string" && likedNoSignals.length > 0,
    `vibe_summary_liked_fallback_empty: "${likedNoSignals}"`
  );

  // disliked with 3+ items → non-empty avoidance statement
  const dislikedVibe = computeSwipeVibeSummary(
    [{ title: "Book X" }, { title: "Book Y" }, { title: "Book Z" }],
    ["Fantasy"],
    "disliked"
  );
  assert(
    typeof dislikedVibe === "string" && dislikedVibe.length > 0,
    `vibe_summary_disliked_non_empty: "${dislikedVibe}"`
  );

  // empty items → returns empty string (not rendered)
  const emptyVibe = computeSwipeVibeSummary([], ["Fantasy"], "liked");
  assert(emptyVibe === "", `vibe_summary_empty_items_must_return_empty_string: "${emptyVibe}"`);

  checks.push({ id: 10, name: "vibe_summary_rendering_and_fallback", pass: true });

  console.log(
    JSON.stringify(
      {
        name: "human-review-paginated-ux-regressions",
        status: "pass",
        regressionCount: checks.length,
        checks,
      },
      null,
      2
    )
  );
}

run().catch((error) => {
  console.error(`human_review_paginated_ux_regressions_failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
