import assert from "node:assert/strict";
import test from "node:test";
import {
  MELANIES_CONCEPTS,
  adaptMelanieEvidenceToSignals,
  completeMelanieFinal,
  completeMelanieRanking,
  createInitialMelanieGame,
  melanieSemanticSimilarity,
  reorderMelanieRanking,
  scoreMelanieEvidence,
  selectSemanticallyDiverseConcepts,
  selectMelanieConcepts,
} from "./melaniesGame";
import { validateMelanieConceptLibrary } from "./melaniesGameContentValidation";

const context = { anonymousPlayerId: "player-1", libraryId: "library-1", ageBand: "teens" as const, gameSessionId: "melanie-test" };

test("concept bank is broad, authored, and distinct for every supported age route", () => {
  const all = new Set<string>();
  for (const band of ["kids", "preteens", "teens", "adult"] as const) {
    assert.equal(MELANIES_CONCEPTS[band].length, 64);
    assert(MELANIES_CONCEPTS[band].every((concept) => concept.ageBand === band && concept.synopsis.endsWith(".")));
    for (const concept of MELANIES_CONCEPTS[band]) {
      assert(!all.has(concept.id));
      all.add(concept.id);
    }
  }
  assert.deepEqual(validateMelanieConceptLibrary(), []);
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

test("opening and adaptive rounds remain diverse and non-repeating across age bands and seeds", () => {
  for (const ageBand of ["kids", "preteens", "teens", "adult"] as const) {
    const sampled = new Set<string>();
    for (let seed = 0; seed < 48; seed += 1) {
      const initial = createInitialMelanieGame({
        anonymousPlayerId: `player-${seed}`,
        libraryId: `library-${seed % 5}`,
        ageBand,
        gameSessionId: `session-${ageBand}-${seed}`,
      });
      const first = completeMelanieRanking(selectMelanieConcepts(initial, initial.currentConceptIds.slice(0, 3)));
      const second = completeMelanieRanking(selectMelanieConcepts(first, first.currentConceptIds.slice(0, 3)));
      assert.equal(new Set(second.seenConceptIds).size, 14);
      assert.equal(second.seenConceptIds.length, 14);
      for (const state of [initial, first, second]) {
        const concepts = state.currentConceptIds.map((id) => MELANIES_CONCEPTS[ageBand].find((concept) => concept.id === id)!);
        concepts.forEach((concept) => sampled.add(concept.id));
        const familyCounts = new Map<string, number>();
        const engineCounts = new Map<string, number>();
        for (const concept of concepts) {
          familyCounts.set(concept.semantic.premiseFamily, (familyCounts.get(concept.semantic.premiseFamily) || 0) + 1);
          engineCounts.set(concept.semantic.narrativeEngine, (engineCounts.get(concept.semantic.narrativeEngine) || 0) + 1);
        }
        assert(Math.max(...familyCounts.values()) <= 2);
        assert(Math.max(...engineCounts.values()) <= 2);
        const distances = concepts.flatMap((concept, index) => (
          concepts.slice(index + 1).map((other) => 1 - melanieSemanticSimilarity(concept, other))
        ));
        assert(Math.min(...distances) >= 0.2);
      }
    }
    assert(sampled.size >= 56, `${ageBand} sampling reached only ${sampled.size}/64 concepts`);
  }
});

test("semantic diversity constraint resists an adversarial high-relevance cluster", () => {
  const base = MELANIES_CONCEPTS.teens[0];
  const families = ["quest", "rescue", "competition", "creation", "political-struggle"] as const;
  const engines = ["journey-encounters", "deadline-mission", "rivalry-ladder", "creative-process", "political-maneuvering"] as const;
  const clustered = Array.from({ length: 6 }, (_, index) => ({
    concept: {
      ...base,
      id: `cluster-${index}`,
      semantic: { ...base.semantic, premiseFamily: "investigation" as const, narrativeEngine: "clue-chain" as const },
    },
    relevance: 100 - index,
    tie: index,
  }));
  const diverse = families.map((premiseFamily, index) => ({
    concept: {
      ...base,
      id: `diverse-${index}`,
      semantic: { ...base.semantic, premiseFamily, narrativeEngine: engines[index] },
    },
    relevance: 20 - index,
    tie: 100 + index,
  }));
  const selected = selectSemanticallyDiverseConcepts([...clustered, ...diverse], [], 6);
  assert(selected.some((concept) => concept.id === "cluster-0"), "information-gain leader should remain represented");
  assert(selected.filter((concept) => concept.semantic.premiseFamily === "investigation").length <= 2);
  assert(selected.filter((concept) => concept.semantic.narrativeEngine === "clue-chain").length <= 2);
  assert(new Set(selected.map((concept) => concept.semantic.premiseFamily)).size >= 5);
  assert(new Set(selected.map((concept) => concept.semantic.narrativeEngine)).size >= 5);
});
