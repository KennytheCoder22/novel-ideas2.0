#!/usr/bin/env node
import { resolve } from "node:path";
import { stableJson } from "./lib/harness.mjs";
import {
  googleBooksProductionHashes,
  loadGoogleBooksDefinitions,
  loadGoogleBooksPipeline,
  replayGoogleBooks,
} from "./lib/googleBooksCertification.mjs";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function equal(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

const repoRoot = resolve(import.meta.dirname, "../..");
const definitions = loadGoogleBooksDefinitions(repoRoot);
const pipeline = await loadGoogleBooksPipeline(repoRoot);
const hashesBefore = googleBooksProductionHashes(repoRoot);

async function execute() {
  const artifacts = [];
  for (const profile of definitions.profiles) {
    artifacts.push(await replayGoogleBooks(
      profile,
      definitions.fixtures[profile.profileId],
      pipeline,
      hashesBefore,
    ));
  }
  return artifacts;
}

const first = await execute();
const second = await execute();
equal(stableJson(first), stableJson(second), "frozen replay must be deterministic");
equal(stableJson(googleBooksProductionHashes(repoRoot)), stableJson(hashesBefore), "production hashes must remain unchanged");

const byId = Object.fromEntries(first.map((artifact) => [artifact.profile.profileId, artifact]));
const expectedStates = {
  "gb-teen-fantasy": "eligible_underfilled",
  "gb-adult-useful": "eligible_useful",
  "gb-preteen-filtering": "eligible_underfilled",
  "gb-kids-story-policy-boundary": "source_policy_rejected_all",
  "gb-honest-underfill": "eligible_underfilled",
  "gb-artifact-heavy": "source_policy_rejected_all",
  "gb-valid-empty": "valid_empty_response",
  "gb-invalid-response": "response_invalid",
  "gb-disabled-skip": "intentional_skip_disabled",
};
for (const [profileId, expected] of Object.entries(expectedStates)) {
  equal(byId[profileId].actualTerminalState, expected, `${profileId} terminal state`);
  equal(byId[profileId].humanReview.status, "not_reviewed", `${profileId} human review boundary`);
}

equal(byId["gb-adult-useful"].raw.acceptedAfterSourcePolicy, 6, "Adult fixture accepted count");
equal(byId["gb-adult-useful"].selected.length, 6, "Adult fixture selected count");
equal(byId["gb-adult-useful"].metadataQuality.overallRate, 1, "Adult fixture metadata coverage");
equal(byId["gb-adult-useful"].diversity.distinctCreatorCount, 6, "Adult fixture creator diversity");
assert(byId["gb-adult-useful"].routing.plannedQueries.every((query) => !query.startsWith("adult ")), "Adult queries should use narrative terms without an audience prefix");

equal(byId["gb-teen-fantasy"].raw.fixtureDocumentCount, 6, "Teen fixture raw count");
equal(byId["gb-teen-fantasy"].raw.acceptedAfterSourcePolicy, 1, "Teen fixture accepted count");
equal(byId["gb-teen-fantasy"].selected.length, 1, "Teen fixture selected count");
assert(byId["gb-teen-fantasy"].routing.plannedQueries.every((query) => query.startsWith("young adult ")), "Teen planned queries should retain age authority");
equal(byId["gb-teen-fantasy"].raw.dropCounts.publication_shape_unknown_insufficient_story_evidence, 3, "Teen dominant publication-shape loss");

equal(byId["gb-preteen-filtering"].raw.acceptedAfterSourcePolicy, 2, "Preteen accepted count");
equal(byId["gb-preteen-filtering"].selected.length, 2, "Preteen selected count");
equal(byId["gb-preteen-filtering"].raw.dropCounts.publication_shape_reference, 1, "Preteen reference rejection");
assert(byId["gb-preteen-filtering"].routing.plannedQueries.every((query) => query.startsWith("middle grade ")), "Preteen planned queries should retain age authority");

equal(byId["gb-kids-story-policy-boundary"].raw.fixtureDocumentCount, 5, "Kids fixture raw count");
equal(byId["gb-kids-story-policy-boundary"].raw.acceptedAfterSourcePolicy, 0, "Kids source-policy acceptance");
equal(byId["gb-kids-story-policy-boundary"].normalized.length, 0, "Kids source-policy boundary");
assert(byId["gb-kids-story-policy-boundary"].routing.plannedQueries.every((query) => query.startsWith("kids ")), "Kids planned queries should retain the current age-authority prefix");

equal(byId["gb-honest-underfill"].selected.length, 1, "Underfill must preserve one strong result");
equal(byId["gb-artifact-heavy"].raw.acceptedAfterSourcePolicy, 0, "Artifact-only fixture must not enter normalization");
equal(byId["gb-artifact-heavy"].raw.dropCounts.publication_shape_writing_guide, 1, "Writing-guide rejection");
equal(byId["gb-valid-empty"].raw.dropCounts.non_book_response_shape, undefined, "Valid empty must not be invalid");
equal(byId["gb-invalid-response"].raw.dropCounts.non_book_response_shape, 2, "Invalid response shape must remain explicit");
equal(byId["gb-disabled-skip"].requests.length, 0, "Disabled source must not dispatch");

for (const artifact of first.filter((row) => row.requests.length > 0)) {
  for (const request of artifact.requests) {
    equal(request.credentialMaterial, "excluded_from_artifact", "credential material marker");
    assert(!request.request.includes("key="), "serialized requests must not contain API keys");
    equal(request.orderBy, "relevance", "Google Books orderBy contract");
    equal(request.printType, "books", "Google Books printType contract");
    equal(request.filter, "partial", "Google Books filter contract");
    equal(request.projection, "full", "Google Books projection contract");
    equal(request.language, "en", "Google Books language contract");
  }
}

console.log(JSON.stringify({
  pass: true,
  certification: "Google Books Phase 1",
  caseCount: first.length,
  deterministic: true,
  productionHashesUnchanged: true,
  liveTransportCertified: false,
  humanUsefulnessCertified: false,
  assertions: [
    "all_four_age_bands_replayed",
    "terminal_states_distinguish_skip_empty_invalid_and_policy_rejection",
    "teen_and_kids_limitations_preserved",
    "adult_and_preteen_composition_preserved",
    "request_contract_and_credential_redaction",
    "production_files_unchanged",
  ],
}, null, 2));
