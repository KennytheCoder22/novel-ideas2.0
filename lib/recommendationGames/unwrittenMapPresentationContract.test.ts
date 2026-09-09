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
  CLOUD_SHEPHERD_CHOICE_ASSET_IDS,
  CLOUD_SHEPHERD_RESULT_ASSET_IDS,
  CLOCKWORK_BRIDGE_CHOICE_ASSET_IDS,
  CLOCKWORK_BRIDGE_RESULT_ASSET_IDS,
  FROG_PARLIAMENT_CHOICE_ASSET_IDS,
  FROG_PARLIAMENT_ENCOUNTER_ASSET_ID,
  FROG_PARLIAMENT_RESULT_ASSET_IDS,
  LANTERN_FAIR_RESULT_ASSET_IDS,
  MIRROR_MARSH_CHOICE_ASSET_IDS,
  MIRROR_MARSH_RESULT_ASSET_IDS,
  RAIN_CAMP_CHOICE_ASSET_IDS,
  LANTERN_FAIR_CHOICE_ASSET_IDS,
  UNWRITTEN_MAP_FOCAL_ASSET_PROVENANCE,
  WHISPER_ORCHARD_CHOICE_ASSET_IDS,
  WHISPER_ORCHARD_RESULT_ASSET_IDS,
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

test("Lantern Fair choice art maps one-to-one to authoritative choice ids without result reuse", () => {
  const lanternFair = buildUnwrittenMapPresentationMetadata().find((item) => item.scenarioId === "lantern-fair");
  assert.ok(lanternFair);
  const expected = {
    "take-stage": "lantern-fair-choice-take-stage",
    "balcony-view": "lantern-fair-choice-balcony-view",
    "hidden-melody": "lantern-fair-choice-hidden-melody",
    "help-lanterns": "lantern-fair-choice-help-lanterns",
  } as const;

  assert.deepEqual(lanternFair.choices.map((choice) => choice.choiceId), [
    "take-stage",
    "balcony-view",
    "hidden-melody",
    "help-lanterns",
  ]);
  for (const choice of lanternFair.choices) {
    const localAssetId = expected[choice.choiceId as keyof typeof expected];
    assert.equal(LANTERN_FAIR_CHOICE_ASSET_IDS[choice.choiceId], localAssetId);
    assert.equal(choice.focalArt.assetId, `choice:lantern-fair:${choice.choiceId}`);
    assert.equal(choice.focalArt.localAssetId, localAssetId);
    assert.equal(choice.focalArt.status, "approved");
    assert.equal(choice.result.focalArt.assetId, `result:lantern-fair:${choice.choiceId}`);
    assert.notEqual(choice.result.focalArt.localAssetId, localAssetId);
    assert.notEqual(choice.result.focalArt.assetPath, choice.focalArt.assetPath);
  }
});

test("Clockwork Bridge choice art maps one-to-one to authoritative choice ids", () => {
  const encounter = buildUnwrittenMapPresentationMetadata().find((item) => item.scenarioId === "clockwork-bridge");
  assert.ok(encounter);
  const expected = {
    "gear-puzzle": "clockwork-bridge-choice-gear-puzzle",
    "rope-crossing": "clockwork-bridge-choice-rope-crossing",
    "mediate-gears": "clockwork-bridge-choice-mediate-gears",
    "paint-blueprint": "clockwork-bridge-choice-paint-blueprint",
  } as const;

  assert.deepEqual(encounter.choices.map((choice) => choice.choiceId), [
    "gear-puzzle",
    "rope-crossing",
    "mediate-gears",
    "paint-blueprint",
  ]);
  for (const choice of encounter.choices) {
    const localAssetId = expected[choice.choiceId as keyof typeof expected];
    assert.equal(CLOCKWORK_BRIDGE_CHOICE_ASSET_IDS[choice.choiceId], localAssetId);
    assert.equal(choice.focalArt.assetId, `choice:clockwork-bridge:${choice.choiceId}`);
    assert.equal(choice.focalArt.localAssetId, localAssetId);
    assert.equal(choice.focalArt.status, "approved");
    assert.equal(choice.result.focalArt.assetId, `result:clockwork-bridge:${choice.choiceId}`);
    assert.equal(choice.result.focalArt.status, "approved");
    assert.notEqual(choice.result.focalArt.localAssetId, localAssetId);
    assert.notEqual(choice.result.focalArt.assetPath, choice.focalArt.assetPath);
  }
});

test("Highwind Farm choice art maps by authoritative IDs without gameplay or result reuse", () => {
  const scenario = UNWRITTEN_MAP_SCENARIOS.find((item) => item.id === "cloud-shepherd");
  const encounter = buildUnwrittenMapPresentationMetadata().find((item) => item.scenarioId === "cloud-shepherd");
  assert.ok(scenario);
  assert.ok(encounter);
  const expectedAssets = {
    "race-cloud": "cloud-shepherd-choice-race-cloud",
    "cloud-joke": "cloud-shepherd-choice-cloud-joke",
    "weather-song": "cloud-shepherd-choice-weather-song",
    "map-air-current": "cloud-shepherd-choice-map-air-current",
  } as const;

  assert.deepEqual(scenario.choices, [
    { id: "race-cloud", version: 1, label: "Race it along the ridge", description: "Match its wild speed until it turns home.", result: "It laughs thunder and leaves a rainbow ribbon in your pack.", tasteVector: { pace: 2, intensity: 2 }, tags: ["kinetic", "exhilarating"] },
    { id: "cloud-joke", version: 1, label: "Tell it a terrible joke", description: "Try to charm it down with cheerful nonsense.", result: "It rains from laughter and follows you back like a puppy.", tasteVector: { humor: 2, social_energy: 1 }, tags: ["comic", "friendly"] },
    { id: "weather-song", version: 1, label: "Learn the shepherd's song", description: "Practice the old melody one patient phrase at a time.", result: "The whole flock settles into a soft silver harmony.", tasteVector: { structure: 1, emotional_depth: 1 }, tags: ["musical", "tender"] },
    { id: "map-air-current", version: 1, label: "Map the invisible currents", description: "Find the hidden route the cloud already wants.", result: "Your ink swirls into a permanent map of the upper air.", tasteVector: { challenge: 1, novelty: 1 }, tags: ["discovery", "thoughtful"] },
  ]);
  assert.deepEqual(encounter.choices.map((choice) => choice.choiceId), Object.keys(expectedAssets));
  for (const choice of encounter.choices) {
    const localAssetId = expectedAssets[choice.choiceId as keyof typeof expectedAssets];
    assert.equal(CLOUD_SHEPHERD_CHOICE_ASSET_IDS[choice.choiceId], localAssetId);
    assert.equal(choice.focalArt.assetId, `choice:cloud-shepherd:${choice.choiceId}`);
    assert.equal(choice.focalArt.localAssetId, localAssetId);
    assert.equal(choice.focalArt.status, "approved");
    assert.equal(choice.focalArt.targetAspectRatio, "4:3");
    assert.equal(choice.result.focalArt.assetId, `result:cloud-shepherd:${choice.choiceId}`);
    assert.equal(choice.result.focalArt.status, "approved");
    assert.notEqual(choice.result.focalArt.assetPath, choice.focalArt.assetPath);
  }
});

test("Highwind Farm choice art retains unique authorized provenance and authored scenes", () => {
  const expected = {
    "cloud-shepherd-choice-race-cloud": ["07911bb5b328d24e856407e56508c174664a6eb1c79795c6caa49ba267df1d72", /wind-sail cart.*cloud remains contextual/],
    "cloud-shepherd-choice-cloud-joke": ["06a15ce5b566c59bbdca55534ea472fd5ac2974473b9969071267ff779e337a3", /laughing cow.*does not redefine the cloud choice/],
    "cloud-shepherd-choice-weather-song": ["5ce3ce4eff4f37d4995dd806f8b13a7459e0fe402b314a04f7364ef24b6b0641", /guitar weather song.*elder shepherd/],
    "cloud-shepherd-choice-map-air-current": ["f1ea8730b8a73e4357f44df84d8e25288d52ad1b09d2b3ec6c9942f3c9dbd282", /drawn wind patterns.*air-current ribbons/],
  } as const;
  const derivedHashes = new Set<string>();

  for (const localAssetId of Object.keys(expected) as (keyof typeof expected)[]) {
    const [sourceSha256, scenePattern] = expected[localAssetId];
    const provenance = UNWRITTEN_MAP_FOCAL_ASSET_PROVENANCE[localAssetId];
    assert.ok(provenance);
    assert.equal(provenance.sourceSha256, sourceSha256);
    assert.equal(provenance.derivedDimensions, "800x600");
    assert.match(provenance.authoredScene || "", scenePattern);
    const bytes = readFileSync(path.resolve(__dirname, "..", "..", unwrittenMapLocalAssetPath(localAssetId)));
    const derivedSha256 = createHash("sha256").update(bytes).digest("hex");
    assert.equal(derivedSha256, provenance.derivedSha256);
    assert.ok(!derivedHashes.has(derivedSha256), `${localAssetId} must have unique derived pixels`);
    derivedHashes.add(derivedSha256);
  }
});

test("Highwind Farm result art maps by authoritative choice id with provenance", () => {
  const encounter = buildUnwrittenMapPresentationMetadata().find((item) => item.scenarioId === "cloud-shepherd");
  assert.ok(encounter);
  const expected = {
    "race-cloud": ["cloud-shepherd-result-race-cloud", "df21f6182641326a28e519ec7199a41d442d1f67abf20651dd3df655be0c1e81", "1536x1024"],
    "cloud-joke": ["cloud-shepherd-result-cloud-joke", "e5295fafe70c750eab97d73321c9dcc3b5d5416006ff9e51030c691cb2a16a59", "1536x1024"],
    "weather-song": ["cloud-shepherd-result-weather-song", "6de291b8a3e29c40fe8f98f369ff794a33370a8e011cb910086e95c955a1b789", "1536x1024"],
    "map-air-current": ["cloud-shepherd-result-map-air-current", "b50e8b65f63cd1fa2109133939455a89dcf2be99c311e94aebc0e58ed64b1b5f", "1530x1020"],
  } as const;

  for (const choice of encounter.choices) {
    const [localAssetId, sourceSha256, dimensions] = expected[choice.choiceId as keyof typeof expected];
    assert.equal(CLOUD_SHEPHERD_RESULT_ASSET_IDS[choice.choiceId], localAssetId);
    assert.equal(choice.result.focalArt.localAssetId, localAssetId);
    assert.equal(choice.result.focalArt.status, "approved");
    assert.equal(choice.result.focalArt.targetAspectRatio, "3:2");
    const provenance = UNWRITTEN_MAP_FOCAL_ASSET_PROVENANCE[localAssetId];
    assert.ok(provenance);
    assert.equal(provenance.sourceSha256, sourceSha256);
    assert.equal(provenance.derivedDimensions, dimensions);
    const bytes = readFileSync(path.resolve(__dirname, "..", "..", choice.result.focalArt.assetPath));
    assert.equal(createHash("sha256").update(bytes).digest("hex"), provenance.derivedSha256);
  }
});

test("Mirror Marsh choice art maps by authoritative choice id with provenance", () => {
  const encounter = buildUnwrittenMapPresentationMetadata().find((item) => item.scenarioId === "mirror-marsh");
  assert.ok(encounter);
  const expected = {
    "step-reflection": ["mirror-marsh-choice-step-reflection", "6d19e35808c9d7ce6d481b3367c13ce3a22c972ec913db7942bf5ffaaa9f93a9"],
    "sketch-stars": ["mirror-marsh-choice-sketch-stars", "42ea837fb07f403ba4f4f69763d483babb5dfd37ab4697274277dd8806b21d46"],
    "wave-back": ["mirror-marsh-choice-wave-back", "a943667384a410ea718ecc074b9b5fac57564a8aa89da3d5074f17cbd3381cc8"],
    "reed-raft": ["mirror-marsh-choice-reed-raft", "f23c6b7603ac8891696aa3f7719b409109dacdfd8f4bbd0897a36ccf0e120528"],
  } as const;

  for (const choice of encounter.choices) {
    const [localAssetId, sourceSha256] = expected[choice.choiceId as keyof typeof expected];
    assert.equal(MIRROR_MARSH_CHOICE_ASSET_IDS[choice.choiceId], localAssetId);
    assert.equal(choice.focalArt.localAssetId, localAssetId);
    assert.equal(choice.focalArt.status, "approved");
    assert.equal(choice.focalArt.targetAspectRatio, "4:3");
    assert.equal(choice.result.focalArt.status, "approved");
    const provenance = UNWRITTEN_MAP_FOCAL_ASSET_PROVENANCE[localAssetId];
    assert.ok(provenance);
    assert.equal(provenance.sourceSha256, sourceSha256);
    assert.equal(provenance.derivedDimensions, "800x600");
    const bytes = readFileSync(path.resolve(__dirname, "..", "..", choice.focalArt.assetPath));
    assert.equal(createHash("sha256").update(bytes).digest("hex"), provenance.derivedSha256);
  }
});

test("Mirror Marsh result art maps by authoritative choice id with provenance", () => {
  const encounter = buildUnwrittenMapPresentationMetadata().find((item) => item.scenarioId === "mirror-marsh");
  assert.ok(encounter);
  const expected = {
    "step-reflection": ["mirror-marsh-result-step-reflection", "8c04b1538eb6f1ee2f132b96ab4ee6f27d276eceeeb2b742168dc5bc0638baa1", "1536x1024"],
    "sketch-stars": ["mirror-marsh-result-sketch-stars", "1f70a997bf7e24ca854083d7eea63146b5ffed7f21f633c91a911197e04c2469", "1536x1024"],
    "wave-back": ["mirror-marsh-result-wave-back", "53f17580427ad13fb4a27a384bdea036792153d87e96beadcaa5c234b4b57eed", "1536x1024"],
    "reed-raft": ["mirror-marsh-result-reed-raft", "ddfdeeef04416f560c90e65171babed088c39f5fae5df7cac2d9adb39fe6ee02", "1526x1017"],
  } as const;

  for (const choice of encounter.choices) {
    const [localAssetId, sourceSha256, dimensions] = expected[choice.choiceId as keyof typeof expected];
    assert.equal(MIRROR_MARSH_RESULT_ASSET_IDS[choice.choiceId], localAssetId);
    assert.equal(choice.result.focalArt.localAssetId, localAssetId);
    assert.equal(choice.result.focalArt.status, "approved");
    assert.equal(choice.result.focalArt.targetAspectRatio, "3:2");
    const provenance = UNWRITTEN_MAP_FOCAL_ASSET_PROVENANCE[localAssetId];
    assert.ok(provenance);
    assert.equal(provenance.sourceSha256, sourceSha256);
    assert.equal(provenance.derivedDimensions, dimensions);
    const bytes = readFileSync(path.resolve(__dirname, "..", "..", choice.result.focalArt.assetPath));
    assert.equal(createHash("sha256").update(bytes).digest("hex"), provenance.derivedSha256);
  }
});

test("Rain Camp choice art maps by authoritative choice id with provenance", () => {
  const encounter = buildUnwrittenMapPresentationMetadata().find((item) => item.scenarioId === "rain-camp");
  assert.ok(encounter);
  const expected = {
    "crowded-table": ["rain-camp-choice-crowded-table", "e7d54af792d6fbe4e181a40f655aa097394023f410801f24b654cbedd3cfa635"],
    "paint-storm": ["rain-camp-choice-paint-storm", "4a292dd3a821c8a2c2de504ea5f0650feaede00a426c15608af2d0343a6e8036"],
    "sort-supplies": ["rain-camp-choice-sort-supplies", "0fe6ff3b0909b238999456c5d8e749c9444f7a48ef4c5bcdc77b7f2d772894f9"],
    "rain-walk": ["rain-camp-choice-rain-walk", "41f21debea2f5faded886478ab86e9f5848b5b39e6bd0f3caf3a73d927026e80"],
  } as const;

  for (const choice of encounter.choices) {
    const [localAssetId, sourceSha256] = expected[choice.choiceId as keyof typeof expected];
    assert.equal(RAIN_CAMP_CHOICE_ASSET_IDS[choice.choiceId], localAssetId);
    assert.equal(choice.focalArt.localAssetId, localAssetId);
    assert.equal(choice.focalArt.status, "approved");
    assert.equal(choice.focalArt.targetAspectRatio, "4:3");
    assert.equal(choice.result.focalArt.status, "missing");
    const provenance = UNWRITTEN_MAP_FOCAL_ASSET_PROVENANCE[localAssetId];
    assert.ok(provenance);
    assert.equal(provenance.sourceSha256, sourceSha256);
    assert.equal(provenance.derivedDimensions, "800x600");
    const bytes = readFileSync(path.resolve(__dirname, "..", "..", choice.focalArt.assetPath));
    assert.equal(createHash("sha256").update(bytes).digest("hex"), provenance.derivedSha256);
  }
});

test("Clockwork Bridge result art maps by authoritative choice id without changing live outcomes", () => {
  const metadata = buildUnwrittenMapPresentationMetadata();
  const scenario = UNWRITTEN_MAP_SCENARIOS.find((item) => item.id === "clockwork-bridge");
  const encounter = metadata.find((item) => item.scenarioId === "clockwork-bridge");
  assert.ok(scenario);
  assert.ok(encounter);
  const expected = {
    "gear-puzzle": [
      "clockwork-bridge-result-gear-puzzle",
      "7545b5a712a517a9d0210612ecbd1693c67dbb5db95eb22da7a1bdce87986fc9",
      "1473x982",
      "The bridge remembers every crossing and clicks gratefully into place.",
    ],
    "rope-crossing": [
      "clockwork-bridge-result-rope-crossing",
      "5de2b7ac1ceb8f92a7f75ca4e48b080aa56c3ee1485019e010e76adb4aebe931",
      "1442x961",
      "Your rope becomes a shining handrail when the bridge finally wakes.",
    ],
    "mediate-gears": [
      "clockwork-bridge-result-mediate-gears",
      "3cd20fd668151b32ef478fbc41497cbd9d73395d27213346620f6a5f7c3ff3b3",
      "1461x974",
      "The gears agree to turn together, though one insists on singing.",
    ],
    "paint-blueprint": [
      "clockwork-bridge-result-paint-blueprint",
      "c69634d4ab182736263fc5e300693d7cb9fac600060b2f095a847afa6e0bf910",
      "1471x981",
      "The painted bridge climbs off the page and completes the span.",
    ],
  } as const;

  for (const choice of encounter.choices) {
    const [localAssetId, sourceSha256, dimensions, outcome] = expected[choice.choiceId as keyof typeof expected];
    assert.equal(CLOCKWORK_BRIDGE_RESULT_ASSET_IDS[choice.choiceId], localAssetId);
    assert.equal(choice.result.focalArt.localAssetId, localAssetId);
    assert.equal(choice.result.focalArt.status, "approved");
    assert.equal(choice.result.focalArt.targetAspectRatio, "3:2");
    assert.equal(scenario.choices.find((item) => item.id === choice.choiceId)?.result, outcome);
    assert.match(choice.result.focalArt.brief, new RegExp(outcome.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    const provenance = UNWRITTEN_MAP_FOCAL_ASSET_PROVENANCE[localAssetId];
    assert.ok(provenance);
    assert.equal(provenance.sourceSha256, sourceSha256);
    assert.equal(provenance.derivedDimensions, dimensions);
    const bytes = readFileSync(path.resolve(__dirname, "..", "..", choice.result.focalArt.assetPath));
    assert.equal(createHash("sha256").update(bytes).digest("hex"), provenance.derivedSha256);
  }
});

test("Clockwork Bridge choice art retains authorized source and derived provenance", () => {
  const expected = {
    "clockwork-bridge-choice-gear-puzzle": "f79446e357f6d993f525fe8a803928fec4591db232a1e80695a2f27d4ef656d8",
    "clockwork-bridge-choice-rope-crossing": "1be7face075af0ec2576e41aea7b6fe483457579f9b0842c73c3c5f2d3f3915a",
    "clockwork-bridge-choice-mediate-gears": "3d44bc5afd22f53a40e96252b0d82f65f3fc7f72957932bab3817d8608240fa5",
    "clockwork-bridge-choice-paint-blueprint": "3c718dc4cdb26e525e310535f61d242203e8bc55afa64a4e8a4e887f2ecddd18",
  } as const;

  for (const localAssetId of Object.keys(expected) as (keyof typeof expected)[]) {
    const provenance = UNWRITTEN_MAP_FOCAL_ASSET_PROVENANCE[localAssetId];
    assert.ok(provenance);
    assert.equal(provenance.sourceSha256, expected[localAssetId]);
    assert.equal(provenance.derivedDimensions, "800x600");
    const bytes = readFileSync(path.resolve(__dirname, "..", "..", unwrittenMapLocalAssetPath(localAssetId)));
    assert.equal(createHash("sha256").update(bytes).digest("hex"), provenance.derivedSha256);
  }
});

test("Lantern Fair choice art retains authorized source and derived provenance", () => {
  const expected = {
    "lantern-fair-choice-take-stage": "ae0339a4bb2eb03f5b950a905e9e2b7b6b10dedf90de6ea8fa4723c910bec7aa",
    "lantern-fair-choice-balcony-view": "cc5e3f5be63c4b9795da9129d12307636612f8d0c2ea00b528e517e392f72e86",
    "lantern-fair-choice-hidden-melody": "ba6edef51d9408217bfb8a60a13dd66bf23cdc693701f2580429f42800e0565b",
    "lantern-fair-choice-help-lanterns": "5080027b52021a6685fb30a161b59efb8f0e2599fec77a2fd81594592ec5a762",
  } as const;

  for (const localAssetId of Object.keys(expected) as (keyof typeof expected)[]) {
    const sourceSha256 = expected[localAssetId];
    const provenance = UNWRITTEN_MAP_FOCAL_ASSET_PROVENANCE[localAssetId];
    assert.ok(provenance);
    assert.equal(provenance.sourceSha256, sourceSha256);
    assert.equal(provenance.derivedDimensions, "800x600");
    const bytes = readFileSync(path.resolve(__dirname, "..", "..", unwrittenMapLocalAssetPath(localAssetId)));
    assert.equal(createHash("sha256").update(bytes).digest("hex"), provenance.derivedSha256);
  }
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

test("Whisper Orchard result art is mapped by authoritative choice id without changing live outcomes", () => {
  const metadata = buildUnwrittenMapPresentationMetadata();
  const scenario = UNWRITTEN_MAP_SCENARIOS.find((item) => item.id === "whisper-orchard");
  const encounter = metadata.find((item) => item.scenarioId === "whisper-orchard");
  assert.ok(scenario);
  assert.ok(encounter);
  const expected = {
    "call-light": [
      "whisper-orchard-result-call-light",
      "252f5d20fdf7802f7f1b4a74f50d8aa122de74581be5689267df41a97d7de2db",
      "It answers in your voice, then becomes a companionable lantern moth.",
    ],
    "trail-light": [
      "whisper-orchard-result-trail-light",
      "92de7af3c94e8fa9d061aa3f7439a66a49c393ddfe5a2e283124a8e99d06aef3",
      "It leads to a tree bearing moon-silver fruit.",
    ],
    "decode-trees": [
      "whisper-orchard-result-decode-trees",
      "77b167e30fb07e4fe229a32f9c9c366ec609d427cb2c56941eb7197bfdbc53ab",
      "The fragments become directions left by a traveler a century ago.",
    ],
    "taste-fruit": [
      "whisper-orchard-result-taste-fruit",
      "fa3ac36376b472c7fdc636812966c01192b7322480e3760a5c05366d25da75b2",
      "The apple hums whenever you face north.",
    ],
  } as const;

  for (const choice of encounter.choices) {
    const [localAssetId, sourceSha256, outcome] = expected[choice.choiceId as keyof typeof expected];
    assert.equal(WHISPER_ORCHARD_RESULT_ASSET_IDS[choice.choiceId], localAssetId);
    assert.equal(choice.result.focalArt.localAssetId, localAssetId);
    assert.equal(choice.result.focalArt.status, "approved");
    assert.equal(choice.result.focalArt.targetAspectRatio, "3:2");
    assert.equal(scenario.choices.find((item) => item.id === choice.choiceId)?.result, outcome);
    assert.match(choice.result.focalArt.brief, new RegExp(outcome.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    const provenance = UNWRITTEN_MAP_FOCAL_ASSET_PROVENANCE[localAssetId];
    assert.ok(provenance);
    const bytes = readFileSync(path.resolve(__dirname, "..", "..", choice.result.focalArt.assetPath));
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
      const choiceStatus = encounter.scenarioId === "frog-parliament"
        || encounter.scenarioId === "whisper-orchard"
        || encounter.scenarioId === "lantern-fair"
        || encounter.scenarioId === "clockwork-bridge"
        || encounter.scenarioId === "mirror-marsh"
        || encounter.scenarioId === "cloud-shepherd"
        || encounter.scenarioId === "rain-camp"
        ? "approved"
        : "missing";
      const resultStatus = encounter.scenarioId === "frog-parliament"
        || encounter.scenarioId === "lantern-fair"
        || encounter.scenarioId === "whisper-orchard"
        || encounter.scenarioId === "clockwork-bridge"
        || encounter.scenarioId === "cloud-shepherd"
        || encounter.scenarioId === "mirror-marsh"
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
  assert.equal(unavailableChoices.length, 20);
  assert.ok(unavailableChoices.every((choice) => !unwrittenMapHasCommissionedArt(choice.focalArt)));
  assert.equal(allChoices.filter((choice) => !unwrittenMapHasCommissionedArt(choice.result.focalArt)).length, 24);
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
