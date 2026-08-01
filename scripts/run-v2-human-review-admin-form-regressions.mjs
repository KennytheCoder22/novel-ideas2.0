import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, "..");
const screenDir = resolve(repoRoot, "screens", "swipe");

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

const {
  createHumanReviewSnapshot,
  createDefaultHumanReviewForm,
  createHumanReviewRecordFromForm,
} = require(resolve(screenDir, "humanReviewContract.ts"));

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function run() {
  const base = {
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
    ],
  };

  const snapshotA = createHumanReviewSnapshot(base);
  const snapshotB = createHumanReviewSnapshot(base);
  assert(snapshotA.snapshotId === snapshotB.snapshotId, "snapshot_id_not_deterministic");
  assert(snapshotA.profileId === snapshotB.profileId, "profile_id_not_deterministic");
  assert(snapshotA.recommendationItems.length === 2, "snapshot_item_count_mismatch");

  const form = createDefaultHumanReviewForm(snapshotA);
  assert(form.itemReviews.length === snapshotA.recommendationItems.length, "default_form_item_count_mismatch");
  form.reviewerId = "reviewer-alpha";
  form.wouldUseSlate = "unsure";
  form.itemReviews[0].decision = "recommend";
  form.itemReviews[0].concerns = ["insufficient_information", "wrong_format_or_non_narrative"];
  form.itemReviews[1].decision = "not_recommended";
  form.itemReviews[1].concerns = ["wrong_genre_or_tone"];

  const recordA = createHumanReviewRecordFromForm({ snapshot: snapshotA, form });
  const recordB = createHumanReviewRecordFromForm({ snapshot: snapshotA, form });
  assert(recordA.reviewId === recordB.reviewId, "review_id_not_deterministic_for_same_content");
  assert(recordA.snapshotId === snapshotA.snapshotId, "record_snapshot_link_missing");
  assert(recordA.profileId === snapshotA.profileId, "record_profile_link_missing");
  assert(recordA.rubricVersion === "v1", "rubric_version_mismatch");
  assert(recordA.summary.wouldUseSlate === null, "unsure_not_preserved_as_null");
  assert(recordA.itemReviews[0].concernTags.includes("insufficient_information"), "concern_tag_missing");
  assert(recordA.itemReviews[0].concernTags.includes("wrong_format_or_non_narrative"), "wrong_format_concern_tag_missing");

  // Verify panel open precondition: when recItems is non-empty, openHumanReviewForCurrentSlate
  // will call createHumanReviewSnapshot + createDefaultHumanReviewForm and then setShowHumanReviewPanel(true).
  // We verify the pre-conditions succeed (non-null snapshot + form) so the state transition is reached.
  const panelBase = {
    ageBand: "kids",
    deckKey: "k2",
    engineVersion: "recommender-v2",
    swipeSignals: [
      { id: "p1", title: "Charlotte's Web", action: "like", source: "mock", format: "book" },
    ],
    recommendationItems: [
      { rank: 1, title: "Stuart Little", author: "E.B. White", source: "mock" },
      { rank: 2, title: "The Mouse and the Motorcycle", author: "Beverly Cleary", source: "mock" },
      { rank: 3, title: "Fantastic Mr Fox", author: "Roald Dahl", source: "mock" },
    ],
  };
  const panelSnapshot = createHumanReviewSnapshot(panelBase);
  const panelForm = createDefaultHumanReviewForm(panelSnapshot);
  assert(panelSnapshot != null, "panel_snapshot_null");
  assert(panelForm != null, "panel_form_null");
  assert(typeof panelSnapshot.snapshotId === "string" && panelSnapshot.snapshotId.length > 0, "panel_snapshot_id_empty");
  assert(Array.isArray(panelForm.itemReviews) && panelForm.itemReviews.length === 3, "panel_form_item_count_wrong");
  // The state transition: snapshot+form non-null => setShowHumanReviewPanel(true) would be called
  const wouldOpenPanel = panelSnapshot != null && panelForm != null;
  assert(wouldOpenPanel, "panel_open_precondition_not_met");

  console.log(JSON.stringify({
    name: "human-review-admin-form-regressions",
    status: "pass",
    checks: [
      "deterministic_snapshot_id",
      "deterministic_profile_id",
      "default_form_shape",
      "deterministic_review_id",
      "snapshot_profile_linkage",
      "rubric_v1_enforced",
      "unsure_preserved",
      "structured_concern_tags_preserved",
      "wrong_format_concern_tag_preserved",
      "panel_open_precondition",
    ],
  }, null, 2));
}

try {
  run();
} catch (error) {
  console.error(`human_review_admin_form_regressions_failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}
