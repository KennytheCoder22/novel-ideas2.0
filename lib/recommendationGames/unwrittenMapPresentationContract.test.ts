import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

import { UNWRITTEN_MAP_SCENARIOS } from "./unwrittenMap";
import { UNWRITTEN_MAP_REGION_IDS, UNWRITTEN_MAP_REGION_REGISTRY } from "./unwrittenMapRegions";
import {
  UNWRITTEN_MAP_ACTOR_ROLES,
  UNWRITTEN_MAP_SCENARIO_CHOICE_IDS,
  UNWRITTEN_MAP_SCENARIO_IDS,
  buildUnwrittenMapPresentationMetadata,
  unwrittenMapHasCommissionedArt,
  unwrittenMapDeriveMoodId,
  unwrittenMapSceneRegistry,
} from "./unwrittenMapPresentationContract";
import {
  FROG_PARLIAMENT_CHOICE_ASSET_IDS,
  FROG_PARLIAMENT_ENCOUNTER_ASSET_ID,
  FROG_PARLIAMENT_RESULT_ASSET_IDS,
  LANTERN_FAIR_RESULT_ASSET_IDS,
  UNWRITTEN_MAP_FOCAL_ASSET_PROVENANCE,
  WHISPER_ORCHARD_CHOICE_ASSET_IDS,
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

test("every Mossmere commissioning entry inherits the Mossmere palette and local raster path", () => {
  const metadata = buildUnwrittenMapPresentationMetadata();
  const mossmereEncounters = metadata.filter((encounter) => encounter.regionId === "mossmere");
  assert.equal(mossmereEncounters.length, 2, "expected mirror-marsh and frog-parliament in mossmere");

  for (const encounter of mossmereEncounters) {
    const art = [encounter.focalArt, ...encounter.choices.flatMap((choice) => [choice.focalArt, choice.result.focalArt])];
    for (const focalArt of art) {
      assert.equal(focalArt.kind, "local_raster");
      assert.match(focalArt.paletteId, /^mossmere_/);
      if (focalArt.status === "missing") {
        assert.match(focalArt.assetPath, /^assets\/games\/unwritten-map\/illustrations\/mossmere\//);
      }
    }
  }
});

test("every focal slot references a repository-local raster path and never a generated provider", () => {
  const metadata = buildUnwrittenMapPresentationMetadata();
  for (const encounter of metadata) {
    const arts = [encounter.focalArt, ...encounter.choices.flatMap((choice) => [choice.focalArt, choice.result.focalArt])];
    for (const art of arts) {
      assert.equal(art.kind, "local_raster");
      assert.match(art.assetPath, /^assets\/games\/unwritten-map\/.+\.webp$/);
      assert.doesNotMatch(art.assetPath, /^(data:|https?:)|\.svg$/);
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

test("newly supplied encounter art retains authorized source and derived provenance", () => {
  const metadata = buildUnwrittenMapPresentationMetadata();
  const expected = {
    "lantern-fair": ["lantern-fair-encounter", "1cc48fed7691c3fdbf29cc1096d4df7bbe2992a868c5e1893a2876e80fe701a7"],
    "whisper-orchard": ["whisper-orchard-encounter", "d8a7e9bcd190a155012fa8487de34ed9f04374f8b8dc09ae8595f76b54ac0424"],
    "clockwork-bridge": ["clockwork-bridge-encounter", "d5db024902530a630b4b4915de00abf71dfb00994dd4eb6c781c7c8747cc77ff"],
    "cloud-shepherd": ["cloud-shepherd-encounter", "dee3eb79771fe639eb2e2bb4f0cd85007c3300ee6d55545ab62318bf1162fc89"],
    "mirror-marsh": ["mirror-marsh-encounter", "2bb05f58ad5eafe013c568c1bd9bf41565cb159f842c8caed99a5003f68dd6b1"],
    "rain-camp": ["rain-camp-encounter", "8972b46edee314463a21dab80b9f95f91487e1e99bc732cb5cc1f356bf18bc4e"],
    "paper-dragon": ["paper-dragon-encounter", "78b042b8c4c00051226c5d8716147eac38b6ae1cbff6dfd44baa6ce3125f0ed5"],
    "ember-library": ["ember-library-encounter", "393eeab390da6677bb066b6a0348802e98a0c0ce71e26ed98447c79adead8f99"],
    "giant-garden": ["giant-garden-encounter", "cbc25a399df56665c5ec14d3bdafc56d6b726bc480cb24ce4012ce8436293d62"],
    "old-lighthouse": ["old-lighthouse-encounter", "6987ff68be3bd618d4fee1564a7b95b1838b01fffac205fb2d6c41cb3884656d"],
    "star-ferry": ["star-ferry-encounter", "7b0ee456626ce512ac1f4dbbf4bf8f4011679d278cfd51806753a465090cd89d"],
  } as const;

  for (const [scenarioId, [localAssetId, sourceSha256]] of Object.entries(expected)) {
    const encounter = metadata.find((item) => item.scenarioId === scenarioId);
    assert.ok(encounter);
    assert.equal(encounter.focalArt.assetId, `encounter:${scenarioId}`);
    assert.equal(encounter.focalArt.localAssetId, localAssetId);
    assert.equal(encounter.focalArt.status, "approved");
    assert.ok(encounter.focalArt.depictsActorRoles.includes("explorer"));

    const provenance = UNWRITTEN_MAP_FOCAL_ASSET_PROVENANCE[localAssetId];
    assert.ok(provenance);
    const bytes = readFileSync(path.resolve(__dirname, "..", "..", encounter.focalArt.assetPath));
    assert.equal(createHash("sha256").update(bytes).digest("hex"), provenance.derivedSha256);
    assert.equal(provenance.sourceSha256, sourceSha256);
  }
});

test("Lantern Fair result art is mapped by authoritative choice id with provenance", () => {
  const metadata = buildUnwrittenMapPresentationMetadata();
  const encounter = metadata.find((item) => item.scenarioId === "lantern-fair");
  assert.ok(encounter);
  const expected = {
    "take-stage": ["lantern-fair-result-take-stage", "65aaa4416927fbc0a1f4fb8067dc10318841efdf35e9094198b5707ac6d99e03"],
    "balcony-view": ["lantern-fair-result-balcony-view", "e1bfd1c7ab8d154e93d5bf30709f8dfa201a0d2a334af899a4f570c2bb51a161"],
    "hidden-melody": ["lantern-fair-result-hidden-melody", "1d6016847f1e052199145343944730e8f5bd03f140cd64095725230df5eacc99"],
    "help-lanterns": ["lantern-fair-result-help-lanterns", "974e0b9ce0cbe5d348e049584f75ce0b9831fdb13331b40ddd3732d958f653df"],
  } as const;

  for (const choice of encounter.choices) {
    const [localAssetId, sourceSha256] = expected[choice.choiceId as keyof typeof expected];
    assert.equal(LANTERN_FAIR_RESULT_ASSET_IDS[choice.choiceId], localAssetId);
    assert.equal(choice.result.focalArt.localAssetId, localAssetId);
    assert.equal(choice.result.focalArt.status, "approved");
    const provenance = UNWRITTEN_MAP_FOCAL_ASSET_PROVENANCE[localAssetId];
    assert.ok(provenance);
    const bytes = readFileSync(path.resolve(__dirname, "..", "..", choice.result.focalArt.assetPath));
    assert.equal(createHash("sha256").update(bytes).digest("hex"), provenance.derivedSha256);
    assert.equal(provenance.sourceSha256, sourceSha256);
  }
});

test("Whisper Orchard choice art is mapped by authoritative choice id with provenance", () => {
  const metadata = buildUnwrittenMapPresentationMetadata();
  const encounter = metadata.find((item) => item.scenarioId === "whisper-orchard");
  assert.ok(encounter);
  const expected = {
    "call-light": ["whisper-orchard-choice-call-light", "08d7e426025efa8048fbec7841253c09661dcce2a137e9ffedf71b94b35c85ab"],
    "trail-light": ["whisper-orchard-choice-trail-light", "6bbcee66d1d01a07a6bd5b549ee626735816a57f72ceaf85f293988dc66cba64"],
    "decode-trees": ["whisper-orchard-choice-decode-trees", "6c4ae438db87e704fd648c2506517e4d2432298cf2ab9304fb9228e41eac0665"],
    "taste-fruit": ["whisper-orchard-choice-taste-fruit", "723e9596d70e4c78e336397d57cc4a24f2f26aa2781d723ec634e22e607173ea"],
  } as const;

  for (const choice of encounter.choices) {
    const [localAssetId, sourceSha256] = expected[choice.choiceId as keyof typeof expected];
    assert.equal(WHISPER_ORCHARD_CHOICE_ASSET_IDS[choice.choiceId], localAssetId);
    assert.equal(choice.focalArt.localAssetId, localAssetId);
    assert.equal(choice.focalArt.status, "approved");
    assert.equal(choice.focalArt.targetAspectRatio, "4:3");
    const provenance = UNWRITTEN_MAP_FOCAL_ASSET_PROVENANCE[localAssetId];
    assert.ok(provenance);
    assert.equal(provenance.derivedDimensions, "1200x900");
    const bytes = readFileSync(path.resolve(__dirname, "..", "..", choice.focalArt.assetPath));
    assert.equal(createHash("sha256").update(bytes).digest("hex"), provenance.derivedSha256);
    assert.equal(provenance.sourceSha256, sourceSha256);
  }
});

test("only supplied focal art is approved; every other slot stays explicitly missing", () => {
  const metadata = buildUnwrittenMapPresentationMetadata();
  const approvedEncounterIds = new Set([
    "lantern-fair",
    "whisper-orchard",
    "clockwork-bridge",
    "cloud-shepherd",
    "mirror-marsh",
    "rain-camp",
    "paper-dragon",
    "ember-library",
    "giant-garden",
    "old-lighthouse",
    "star-ferry",
    "frog-parliament",
  ]);
  for (const encounter of metadata) {
    const encounterStatus = approvedEncounterIds.has(encounter.scenarioId) ? "approved" : "missing";
    assert.equal(encounter.focalArt.status, encounterStatus, `${encounter.scenarioId} encounter art status mismatch`);
    for (const choice of encounter.choices) {
      const choiceStatus = encounter.scenarioId === "frog-parliament" || encounter.scenarioId === "whisper-orchard"
        ? "approved"
        : "missing";
      const resultStatus = encounter.scenarioId === "frog-parliament" || encounter.scenarioId === "lantern-fair"
        ? "approved"
        : "missing";
      assert.equal(choice.focalArt.status, choiceStatus, `${choice.choiceId} choice art status mismatch`);
      assert.equal(choice.result.focalArt.status, resultStatus, `${choice.choiceId} result art status mismatch`);
    }
  }
});

test("temporary commissioned-art state omits unavailable choice and result art", () => {
  const metadata = buildUnwrittenMapPresentationMetadata();
  assert.ok(metadata.every((encounter) => unwrittenMapHasCommissionedArt(encounter.focalArt)));

  const allChoices = metadata.flatMap((encounter) => encounter.choices);
  const unavailableChoices = allChoices.filter((choice) => !unwrittenMapHasCommissionedArt(choice.focalArt));
  assert.equal(unavailableChoices.length, 40);
  assert.ok(unavailableChoices.every((choice) => !unwrittenMapHasCommissionedArt(choice.focalArt)));
  assert.equal(allChoices.filter((choice) => !unwrittenMapHasCommissionedArt(choice.result.focalArt)).length, 40);
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
  const allArt = metadata.flatMap((encounter) => [
    encounter.focalArt,
    ...encounter.choices.flatMap((choice) => [choice.focalArt, choice.result.focalArt]),
  ]);
  assert.equal(new Set(allArt.map((art) => art.assetId)).size, 108, "every focal raster asset id must be unique");
  assert.equal(new Set(allArt.map((art) => art.assetPath)).size, 108, "every focal raster file path must be unique");
});

test("player-performed choices and their results are always attributed to the explorer actor", () => {
  const metadata = buildUnwrittenMapPresentationMetadata();
  for (const encounter of metadata) {
    for (const choice of encounter.choices) {
      assert.equal(choice.actorRole, "explorer", `${choice.choiceId} action must be explorer-attributed`);
      assert.equal(choice.result.actorRole, "explorer", `${choice.choiceId} result must be explorer-attributed`);
      assert.ok(choice.focalArt.depictsActorRoles.includes("explorer"), `${choice.choiceId} choice art must depict the explorer`);
      assert.ok(choice.result.focalArt.depictsActorRoles.includes("explorer"), `${choice.choiceId} result art must depict the explorer`);
    }
  }
});

test("The Other Sky commissioning briefs capture five distinct required scenes exactly", () => {
  const mirrorMarsh = buildUnwrittenMapPresentationMetadata().find((encounter) => encounter.scenarioId === "mirror-marsh");
  assert.ok(mirrorMarsh);
  assert.match(mirrorMarsh.focalArt.brief, /impossible second sky with unfamiliar stars/);
  assert.match(mirrorMarsh.focalArt.brief, /reflection waves upward at the explorer/);
  const briefs = Object.fromEntries(mirrorMarsh.choices.map((choice) => [choice.choiceId, choice.focalArt.brief]));
  assert.match(briefs["sketch-stars"], /Explorer kneeling beside the marsh, drawing reflected constellations in a field notebook/);
  assert.match(briefs["wave-back"], /Explorer at the water's edge, waving toward the mysterious reflected figure/);
  assert.match(briefs["reed-raft"], /Explorer tying marsh reeds into a small raft beside the reflective water/);
  assert.match(briefs["step-reflection"], /Explorer cautiously placing a boot onto the star-filled reflected surface as if it were solid/);
  assert.equal(new Set([mirrorMarsh.focalArt.assetPath, ...mirrorMarsh.choices.map((choice) => choice.focalArt.assetPath)]).size, 5);
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
