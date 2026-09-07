import assert from "node:assert/strict";
import test from "node:test";
import {
  MELANIES_CONCEPTS,
  adaptMelanieEvidenceToSignals,
  completeMelanieFinal,
  completeMelanieRanking,
  createInitialMelanieGame,
  reorderMelanieRanking,
  scoreMelanieEvidence,
  selectMelanieConcepts,
} from "./melaniesGame";

const context = { anonymousPlayerId: "player-1", libraryId: "library-1", ageBand: "teens" as const, gameSessionId: "melanie-test" };

test("concept bank is broad, authored, and distinct for every supported age route", () => {
  const all = new Set<string>();
  for (const band of ["kids", "preteens", "teens", "adult"] as const) {
    assert.equal(MELANIES_CONCEPTS[band].length, 16);
    assert(MELANIES_CONCEPTS[band].every((concept) => concept.ageBand === band && concept.synopsis.endsWith(".")));
    for (const concept of MELANIES_CONCEPTS[band]) {
      assert(!all.has(concept.id));
      all.add(concept.id);
    }
  }
});

test("deterministic choose, rank, adaptive challenger, rank, final flow carries survivors", () => {
  const initial = createInitialMelanieGame(context);
  assert.deepEqual(createInitialMelanieGame(context).currentConceptIds, initial.currentConceptIds);
  const chosen = selectMelanieConcepts(initial, initial.currentConceptIds.slice(0, 3));
  const reordered = reorderMelanieRanking(chosen, chosen.ranking[2], -1);
  const round2 = completeMelanieRanking(reordered);
  assert.equal(round2.stage, "choose-2");
  assert.equal(round2.currentConceptIds.length, 6);
  assert(round2.survivorIds.every((id) => round2.currentConceptIds.includes(id)));
  const round2Chosen = selectMelanieConcepts(round2, [round2.currentConceptIds[0], round2.currentConceptIds[2], round2.currentConceptIds[4]]);
  const final = completeMelanieRanking(round2Chosen);
  assert.equal(final.stage, "final");
  assert.equal(final.currentConceptIds.length, 6);
  const finalSelected = selectMelanieConcepts(final, final.currentConceptIds.slice(0, 3));
  const recommendationStage = completeMelanieFinal(finalSelected);
  assert.equal(recommendationStage.stage, "recommendations");
  assert.equal(recommendationStage.evidence.length, 3);
});

test("ranking and survival affect evidence while non-selection stays deliberately weak", () => {
  const initial = createInitialMelanieGame(context);
  const chosen = selectMelanieConcepts(initial, initial.currentConceptIds.slice(0, 3));
  const first = completeMelanieRanking(chosen);
  const rankedDifferently = completeMelanieRanking({ ...chosen, ranking: [...chosen.ranking].reverse() });
  const scoreA = scoreMelanieEvidence(first.evidence);
  const scoreB = scoreMelanieEvidence(rankedDifferently.evidence);
  assert.notDeepEqual(scoreA.dimensions, scoreB.dimensions);
  const signals = adaptMelanieEvidenceToSignals(first.evidence);
  const positives = signals.filter((signal) => signal.action === "like");
  const negatives = signals.filter((signal) => signal.action === "dislike");
  assert(positives.every((signal) => Number(signal.weight) >= 0.6));
  assert(negatives.every((signal) => signal.weight === 0.18));
  assert(Math.max(...Object.values(scoreA.dimensions).map(Math.abs)) < 6, "one round must not create an extreme conclusion");
});

test("adaptive challengers are deterministic discriminators, not a shuffled fixed deck", () => {
  const initial = createInitialMelanieGame(context);
  const firstPath = completeMelanieRanking(selectMelanieConcepts(initial, initial.currentConceptIds.slice(0, 3)));
  const alternatePath = completeMelanieRanking(selectMelanieConcepts(initial, initial.currentConceptIds.slice(3, 6)));
  assert.deepEqual(
    completeMelanieRanking(selectMelanieConcepts(initial, initial.currentConceptIds.slice(0, 3))).currentConceptIds,
    firstPath.currentConceptIds,
  );
  assert.notDeepEqual(firstPath.currentConceptIds.slice(2), alternatePath.currentConceptIds.slice(2));
});
