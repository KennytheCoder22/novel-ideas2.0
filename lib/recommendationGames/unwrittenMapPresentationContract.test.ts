import assert from "node:assert/strict";
import test from "node:test";

import { UNWRITTEN_MAP_SCENARIOS } from "./unwrittenMap";
import { UNWRITTEN_MAP_REGION_IDS, UNWRITTEN_MAP_REGION_REGISTRY } from "./unwrittenMapRegions";
import {
  UNWRITTEN_MAP_ACTOR_ROLES,
  UNWRITTEN_MAP_SCENARIO_CHOICE_IDS,
  UNWRITTEN_MAP_SCENARIO_IDS,
  buildUnwrittenMapPresentationMetadata,
  unwrittenMapDeriveMoodId,
  unwrittenMapSceneRegistry,
} from "./unwrittenMapPresentationContract";
import {
  FROG_PARLIAMENT_CHOICE_ASSET_IDS,
  FROG_PARLIAMENT_ENCOUNTER_ASSET_ID,
  FROG_PARLIAMENT_RESULT_ASSET_IDS,
  unwrittenMapLocalAssetPath,
} from "./unwrittenMapArtAssets";
import { unwrittenMapViewportLayout } from "./unwrittenMapPresentation";

const MOSSMERE_REQUIRED_MOTIFS = ["reeds", "frogs", "lily-pads", "marsh-water", "mist", "wetland-flora"];

test("declared scenario/choice id lists exactly mirror gameplay data (no drift)", () => {
  assert.deepEqual([...UNWRITTEN_MAP_SCENARIO_IDS], UNWRITTEN_MAP_SCENARIOS.map((scenario) => scenario.id));
  for (const scenario of UNWRITTEN_MAP_SCENARIOS) {
    const declared = (UNWRITTEN_MAP_SCENARIO_CHOICE_IDS as Record<string, readonly string[]>)[scenario.id];
    assert.ok(declared, `missing declared choice ids for ${scenario.id}`);
    assert.deepEqual([...declared], scenario.choices.map((choice) => choice.id));
    assert.equal(declared.length, 4, `${scenario.id} must have exactly 4 choices`);
  }
});

test("every gameplay scenario has a scene registry entry with a region-consistent regionId", () => {
  const registry = unwrittenMapSceneRegistry();
  assert.equal(registry.length, UNWRITTEN_MAP_SCENARIOS.length);
  for (const scenario of UNWRITTEN_MAP_SCENARIOS) {
    const entry = registry.find((candidate) => candidate.scenarioId === scenario.id);
    assert.ok(entry, `no scene registry entry for ${scenario.id}`);
    assert.equal(entry?.regionId, scenario.regionId, `${scenario.id} region mismatch between registry and gameplay data`);
  }
});

test("region canonical motif vocabularies and fallback tokens are mutually exclusive across regions", () => {
  const seen = new Map<string, string>();
  for (const regionId of UNWRITTEN_MAP_REGION_IDS) {
    const region = UNWRITTEN_MAP_REGION_REGISTRY[regionId];
    for (const token of [...region.canonicalMotifTokens, region.fallbackMotifToken]) {
      assert.ok(!seen.has(token), `motif token "${token}" is shared between "${seen.get(token)}" and "${regionId}"`);
      seen.set(token, regionId);
    }
  }
});

test("mossmere's canonical vocabulary contains exactly the required wetland motifs", () => {
  const mossmere = UNWRITTEN_MAP_REGION_REGISTRY.mossmere;
  for (const motif of MOSSMERE_REQUIRED_MOTIFS) {
    assert.ok(mossmere.canonicalMotifTokens.includes(motif), `mossmere is missing required motif "${motif}"`);
  }
});

test("every mossmere art definition includes all required wetland motifs", () => {
  const metadata = buildUnwrittenMapPresentationMetadata();
  const mossmereEncounters = metadata.filter((encounter) => encounter.regionId === "mossmere");
  assert.equal(mossmereEncounters.length, 2, "expected mirror-marsh and frog-parliament in mossmere");

  for (const encounter of mossmereEncounters) {
    if (encounter.focalArt.kind === "vector_composition") {
      for (const motif of MOSSMERE_REQUIRED_MOTIFS) {
        assert.ok(encounter.focalArt.motifTokens.includes(motif), `${encounter.scenarioId} encounter art missing motif "${motif}"`);
      }
    }
    for (const choice of encounter.choices) {
      if (choice.focalArt.kind === "vector_composition") {
        for (const motif of MOSSMERE_REQUIRED_MOTIFS) {
          assert.ok(choice.focalArt.motifTokens.includes(motif), `${choice.choiceId} choice art missing motif "${motif}"`);
        }
      }
      if (choice.result.focalArt.kind === "vector_composition") {
        for (const motif of MOSSMERE_REQUIRED_MOTIFS) {
          assert.ok(choice.result.focalArt.motifTokens.includes(motif), `${choice.choiceId} result art missing motif "${motif}"`);
        }
      }
    }
  }
});

test("non-mossmere regions never use another region's canonical motif tokens", () => {
  const metadata = buildUnwrittenMapPresentationMetadata();
  for (const encounter of metadata) {
    if (encounter.regionId === "mossmere") continue;
    const arts = [encounter.focalArt, ...encounter.choices.flatMap((choice) => [choice.focalArt, choice.result.focalArt])];
    for (const art of arts) {
      if (art.kind !== "vector_composition") continue;
      for (const token of art.motifTokens) {
        const owningRegionMotifs = UNWRITTEN_MAP_REGION_REGISTRY[encounter.regionId];
        const isOwnRegionToken = owningRegionMotifs.canonicalMotifTokens.includes(token) || owningRegionMotifs.fallbackMotifToken === token;
        assert.ok(isOwnRegionToken, `art "${art.id}" in region "${encounter.regionId}" uses foreign motif token "${token}"`);
      }
    }
  }
});

test("frog-parliament local assets are mapped by authoritative choice id, not baked numbering", () => {
  assert.equal(unwrittenMapLocalAssetPath(FROG_PARLIAMENT_ENCOUNTER_ASSET_ID), "assets/games/unwritten-map/frog-encounter.webp");

  assert.equal(FROG_PARLIAMENT_CHOICE_ASSET_IDS["hear-frogs"], "frog-parliament-choice-hear-frogs");
  assert.equal(FROG_PARLIAMENT_CHOICE_ASSET_IDS["night-pageant"], "frog-parliament-choice-night-pageant");
  assert.equal(FROG_PARLIAMENT_CHOICE_ASSET_IDS["moon-experiment"], "frog-parliament-choice-moon-experiment");
  assert.equal(FROG_PARLIAMENT_CHOICE_ASSET_IDS["grand-speech"], "frog-parliament-choice-grand-speech");

  assert.equal(unwrittenMapLocalAssetPath(FROG_PARLIAMENT_CHOICE_ASSET_IDS["hear-frogs"]), "assets/games/unwritten-map/frog-hear.webp");
  assert.equal(unwrittenMapLocalAssetPath(FROG_PARLIAMENT_CHOICE_ASSET_IDS["night-pageant"]), "assets/games/unwritten-map/frog-pageant.webp");
  assert.equal(unwrittenMapLocalAssetPath(FROG_PARLIAMENT_CHOICE_ASSET_IDS["moon-experiment"]), "assets/games/unwritten-map/frog-experiment.webp");
  assert.equal(unwrittenMapLocalAssetPath(FROG_PARLIAMENT_CHOICE_ASSET_IDS["grand-speech"]), "assets/games/unwritten-map/frog-speech.webp");

  assert.equal(unwrittenMapLocalAssetPath(FROG_PARLIAMENT_RESULT_ASSET_IDS["hear-frogs"]), "assets/games/unwritten-map/result-frog-hear.webp");
  assert.equal(unwrittenMapLocalAssetPath(FROG_PARLIAMENT_RESULT_ASSET_IDS["night-pageant"]), "assets/games/unwritten-map/result-frog-pageant.webp");
  assert.equal(unwrittenMapLocalAssetPath(FROG_PARLIAMENT_RESULT_ASSET_IDS["moon-experiment"]), "assets/games/unwritten-map/result-moon-frog.webp");
  assert.equal(unwrittenMapLocalAssetPath(FROG_PARLIAMENT_RESULT_ASSET_IDS["grand-speech"]), "assets/games/unwritten-map/result-frog-speech.webp");
});

test("only frog-parliament focal art uses local assets; every other scenario uses vector composition", () => {
  const metadata = buildUnwrittenMapPresentationMetadata();
  for (const encounter of metadata) {
    const expectLocal = encounter.scenarioId === "frog-parliament";
    assert.equal(encounter.focalArt.kind, expectLocal ? "local_asset" : "vector_composition", `${encounter.scenarioId} encounter art kind mismatch`);
    for (const choice of encounter.choices) {
      assert.equal(choice.focalArt.kind, expectLocal ? "local_asset" : "vector_composition", `${choice.choiceId} choice art kind mismatch`);
      assert.equal(choice.result.focalArt.kind, expectLocal ? "local_asset" : "vector_composition", `${choice.choiceId} result art kind mismatch`);
    }
  }
});

test("every encounter, choice, and result focal art identity is unique", () => {
  const metadata = buildUnwrittenMapPresentationMetadata();
  const encounterIds = metadata.map((encounter) => encounter.focalArt.id);
  const choiceIds = metadata.flatMap((encounter) => encounter.choices.map((choice) => choice.focalArt.id));
  const resultIds = metadata.flatMap((encounter) => encounter.choices.map((choice) => choice.result.focalArt.id));

  assert.equal(encounterIds.length, 12);
  assert.equal(new Set(encounterIds).size, 12, "encounter focal art ids must be unique");
  assert.equal(choiceIds.length, 48);
  assert.equal(new Set(choiceIds).size, 48, "choice focal art ids must be unique");
  assert.equal(resultIds.length, 48);
  assert.equal(new Set(resultIds).size, 48, "result focal art ids must be unique");

  const allIds = [...encounterIds, ...choiceIds, ...resultIds];
  assert.equal(new Set(allIds).size, allIds.length, "no focal art id may be reused across encounter/choice/result kinds");
});

test("player-performed choices and their results are always attributed to the explorer actor", () => {
  const metadata = buildUnwrittenMapPresentationMetadata();
  for (const encounter of metadata) {
    for (const choice of encounter.choices) {
      assert.equal(choice.actorRole, "explorer", `${choice.choiceId} action must be explorer-attributed`);
      assert.equal(choice.result.actorRole, "explorer", `${choice.choiceId} result must be explorer-attributed`);
    }
  }
});

test("encounter actor roles distinguish community/creature/environment and are never explorer", () => {
  const metadata = buildUnwrittenMapPresentationMetadata();
  const rolesSeen = new Set<string>();
  for (const encounter of metadata) {
    assert.notEqual(encounter.actorRole, "explorer");
    assert.ok(UNWRITTEN_MAP_ACTOR_ROLES.includes(encounter.actorRole));
    rolesSeen.add(encounter.actorRole);
  }
  assert.ok(rolesSeen.has("community"));
  assert.ok(rolesSeen.has("creature"));
  assert.ok(rolesSeen.has("environment"));
});

test("mood derivation is deterministic and always returns a bounded value", () => {
  assert.equal(unwrittenMapDeriveMoodId(["performative", "playful"]), unwrittenMapDeriveMoodId(["performative", "playful"]));
  assert.equal(unwrittenMapDeriveMoodId(["totally-unknown-tag"]), "playful");
});

test("presentation metadata build is deterministic across repeated calls", () => {
  const first = buildUnwrittenMapPresentationMetadata();
  const second = buildUnwrittenMapPresentationMetadata();
  assert.deepEqual(first, second);
});

test("requested desktop, tablet, Chromebook, and phone breakpoints keep the map viewport contained", () => {
  for (const [width, height] of [
    [1920, 1080],
    [1366, 768],
    [1024, 768],
    [390, 844],
  ] as const) {
    const layout = unwrittenMapViewportLayout(width, height);
    assert.ok(layout.viewportWidth <= width, `${width}x${height} map viewport overflows horizontally`);
    assert.ok(layout.viewportHeight <= height, `${width}x${height} map viewport overflows vertically`);
    assert.ok(layout.tileSize >= 28 && layout.tileSize <= 54, `${width}x${height} tile size is outside supported bounds`);
  }
  assert.equal(unwrittenMapViewportLayout(390, 844).compact, true);
  assert.equal(unwrittenMapViewportLayout(1024, 768).compact, false);
});
