import { evaluateGeneralShadowAdmission } from "./lib/googlebooks-general-shadow-counterfactual.mjs";

function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(`${message}\nExpected: ${JSON.stringify(expected)}\nActual: ${JSON.stringify(actual)}`);
  }
}

const admitted = evaluateGeneralShadowAdmission({
  title: "Example Novel",
  authors: ["Author Name"],
  categories: ["Young Adult Fiction"],
  publisher: "Penguin Random House",
  isbnPresent: true,
  pageCount: 320,
  publicationShape: "unknown",
  publicationShapeDropReason: "publication_shape_unknown_insufficient_narrative_identity",
  storyLevelNarrativeEvidence: ["story_arc", "character_goal"],
  unknownShapeEvidence: ["plot_progression"],
  unknownStoryEvidenceFamilies: ["description_story", "title_story"],
  publicationShapeEvidence: [],
  explicitNonNarrativeIdentity: [],
});
assertEqual(admitted.admit, true, "strict corroboration bundle should admit high-confidence narrative");
assertEqual(admitted.confidence, "high", "admitted rows should be high confidence");

const rejected = evaluateGeneralShadowAdmission({
  title: "How To Write Better Fiction",
  authors: ["Expert Author"],
  categories: ["Fiction", "Writing guide"],
  publisher: "Academic Press",
  isbnPresent: true,
  pageCount: 180,
  publicationShape: "unknown",
  publicationShapeDropReason: "publication_shape_unknown_insufficient_narrative_identity",
  storyLevelNarrativeEvidence: ["story_arc"],
  unknownShapeEvidence: [],
  unknownStoryEvidenceFamilies: ["description_story"],
  publicationShapeEvidence: ["writing_guide_signal"],
  explicitNonNarrativeIdentity: ["explicit_writing_guide_identity"],
});
assertEqual(rejected.admit, false, "contradictory guide signals should prevent admission");
assertEqual(rejected.confidence, "low", "contradictory rows should be low confidence");

console.log("PASS run-v2-googlebooks-general-shadow-counterfactual-regressions");

