// Local asset manifest for The Unwritten Map's presentation layer.
//
// Authorized focal art currently covers every encounter, all Mossmere/
// frog-parliament choices and results, Whisper Orchard choices/results, Lantern
// Fair choices/results, Clockwork Bridge choices/results, and Highwind Farm
// choices/results, plus Mirror Marsh and Rain Camp choices/results and Kite
// Hill choices,
// alongside shared cartographic framing chrome.
// Every other choice and result remains an explicitly missing raster
// commissioning slot (see unwrittenMapPresentationContract.ts). This module
// is pure data (a path manifest) plus a couple of pure lookup helpers; it
// does not touch the filesystem itself so it stays safe to import from any
// runtime. Filesystem existence checks live in the Node-only validator.

/**
 * Maps a bounded local-asset id to its path relative to the repository
 * root. Keys are grouped by purpose:
 *  - `frog-parliament-*`: exact per-choice/result/encounter art for the
 *    Mossmere "Reed Parliament" frog-parliament scenario, mapped by the
 *    game's authoritative choice ids (not by any baked/legacy numbering).
 *  - `shared-frame-*`: framing chrome shared across many screens (entry,
 *    journal, map, and Mossmere-specific backdrop panels). These are not
 *    per-encounter focal art, but are tracked here so the validator can
 *    confirm every local asset PR #305 shipped is accounted for and still
 *    present on disk.
 */
export const UNWRITTEN_MAP_LOCAL_ASSET_MANIFEST = {
  "lantern-fair-encounter": "assets/games/unwritten-map/illustrations/sunmeadow/lantern-fair/lantern-fair-encounter.webp",
  "lantern-fair-result-take-stage": "assets/games/unwritten-map/illustrations/sunmeadow/lantern-fair/lantern-fair-result-take-stage.webp",
  "lantern-fair-result-balcony-view": "assets/games/unwritten-map/illustrations/sunmeadow/lantern-fair/lantern-fair-result-balcony-view.webp",
  "lantern-fair-result-hidden-melody": "assets/games/unwritten-map/illustrations/sunmeadow/lantern-fair/lantern-fair-result-hidden-melody.webp",
  "lantern-fair-result-help-lanterns": "assets/games/unwritten-map/illustrations/sunmeadow/lantern-fair/lantern-fair-result-help-lanterns.webp",
  "lantern-fair-choice-take-stage": "assets/games/unwritten-map/illustrations/sunmeadow/lantern-fair/lantern-fair-choice-take-stage.webp",
  "lantern-fair-choice-balcony-view": "assets/games/unwritten-map/illustrations/sunmeadow/lantern-fair/lantern-fair-choice-balcony-view.webp",
  "lantern-fair-choice-hidden-melody": "assets/games/unwritten-map/illustrations/sunmeadow/lantern-fair/lantern-fair-choice-hidden-melody.webp",
  "lantern-fair-choice-help-lanterns": "assets/games/unwritten-map/illustrations/sunmeadow/lantern-fair/lantern-fair-choice-help-lanterns.webp",
  "whisper-orchard-encounter": "assets/games/unwritten-map/illustrations/sunmeadow/whisper-orchard/whisper-orchard-encounter.webp",
  "whisper-orchard-choice-call-light": "assets/games/unwritten-map/illustrations/sunmeadow/whisper-orchard/whisper-orchard-choice-call-light.webp",
  "whisper-orchard-choice-trail-light": "assets/games/unwritten-map/illustrations/sunmeadow/whisper-orchard/whisper-orchard-choice-trail-light.webp",
  "whisper-orchard-choice-decode-trees": "assets/games/unwritten-map/illustrations/sunmeadow/whisper-orchard/whisper-orchard-choice-decode-trees.webp",
  "whisper-orchard-choice-taste-fruit": "assets/games/unwritten-map/illustrations/sunmeadow/whisper-orchard/whisper-orchard-choice-taste-fruit.webp",
  "whisper-orchard-result-call-light": "assets/games/unwritten-map/illustrations/sunmeadow/whisper-orchard/whisper-orchard-result-call-light.webp",
  "whisper-orchard-result-trail-light": "assets/games/unwritten-map/illustrations/sunmeadow/whisper-orchard/whisper-orchard-result-trail-light.webp",
  "whisper-orchard-result-decode-trees": "assets/games/unwritten-map/illustrations/sunmeadow/whisper-orchard/whisper-orchard-result-decode-trees.webp",
  "whisper-orchard-result-taste-fruit": "assets/games/unwritten-map/illustrations/sunmeadow/whisper-orchard/whisper-orchard-result-taste-fruit.webp",
  "clockwork-bridge-encounter": "assets/games/unwritten-map/illustrations/ironwood/clockwork-bridge/clockwork-bridge-encounter.webp",
  "clockwork-bridge-choice-gear-puzzle": "assets/games/unwritten-map/illustrations/ironwood/clockwork-bridge/clockwork-bridge-choice-gear-puzzle.webp",
  "clockwork-bridge-choice-rope-crossing": "assets/games/unwritten-map/illustrations/ironwood/clockwork-bridge/clockwork-bridge-choice-rope-crossing.webp",
  "clockwork-bridge-choice-mediate-gears": "assets/games/unwritten-map/illustrations/ironwood/clockwork-bridge/clockwork-bridge-choice-mediate-gears.webp",
  "clockwork-bridge-choice-paint-blueprint": "assets/games/unwritten-map/illustrations/ironwood/clockwork-bridge/clockwork-bridge-choice-paint-blueprint.webp",
  "clockwork-bridge-result-gear-puzzle": "assets/games/unwritten-map/illustrations/ironwood/clockwork-bridge/clockwork-bridge-result-gear-puzzle.webp",
  "clockwork-bridge-result-rope-crossing": "assets/games/unwritten-map/illustrations/ironwood/clockwork-bridge/clockwork-bridge-result-rope-crossing.webp",
  "clockwork-bridge-result-mediate-gears": "assets/games/unwritten-map/illustrations/ironwood/clockwork-bridge/clockwork-bridge-result-mediate-gears.webp",
  "clockwork-bridge-result-paint-blueprint": "assets/games/unwritten-map/illustrations/ironwood/clockwork-bridge/clockwork-bridge-result-paint-blueprint.webp",
  "cloud-shepherd-encounter": "assets/games/unwritten-map/illustrations/ironwood/cloud-shepherd/cloud-shepherd-encounter.webp",
  "cloud-shepherd-choice-race-cloud": "assets/games/unwritten-map/illustrations/ironwood/cloud-shepherd/cloud-shepherd-choice-race-cloud.webp",
  "cloud-shepherd-choice-cloud-joke": "assets/games/unwritten-map/illustrations/ironwood/cloud-shepherd/cloud-shepherd-choice-cloud-joke.webp",
  "cloud-shepherd-choice-weather-song": "assets/games/unwritten-map/illustrations/ironwood/cloud-shepherd/cloud-shepherd-choice-weather-song.webp",
  "cloud-shepherd-choice-map-air-current": "assets/games/unwritten-map/illustrations/ironwood/cloud-shepherd/cloud-shepherd-choice-map-air-current.webp",
  "cloud-shepherd-result-race-cloud": "assets/games/unwritten-map/illustrations/ironwood/cloud-shepherd/cloud-shepherd-result-race-cloud.webp",
  "cloud-shepherd-result-cloud-joke": "assets/games/unwritten-map/illustrations/ironwood/cloud-shepherd/cloud-shepherd-result-cloud-joke.webp",
  "cloud-shepherd-result-weather-song": "assets/games/unwritten-map/illustrations/ironwood/cloud-shepherd/cloud-shepherd-result-weather-song.webp",
  "cloud-shepherd-result-map-air-current": "assets/games/unwritten-map/illustrations/ironwood/cloud-shepherd/cloud-shepherd-result-map-air-current.webp",
  "mirror-marsh-encounter": "assets/games/unwritten-map/illustrations/mossmere/mirror-marsh/mirror-marsh-encounter.webp",
  "mirror-marsh-choice-step-reflection": "assets/games/unwritten-map/illustrations/mossmere/mirror-marsh/mirror-marsh-choice-step-reflection.webp",
  "mirror-marsh-choice-sketch-stars": "assets/games/unwritten-map/illustrations/mossmere/mirror-marsh/mirror-marsh-choice-sketch-stars.webp",
  "mirror-marsh-choice-wave-back": "assets/games/unwritten-map/illustrations/mossmere/mirror-marsh/mirror-marsh-choice-wave-back.webp",
  "mirror-marsh-choice-reed-raft": "assets/games/unwritten-map/illustrations/mossmere/mirror-marsh/mirror-marsh-choice-reed-raft.webp",
  "mirror-marsh-result-step-reflection": "assets/games/unwritten-map/illustrations/mossmere/mirror-marsh/mirror-marsh-result-step-reflection.webp",
  "mirror-marsh-result-sketch-stars": "assets/games/unwritten-map/illustrations/mossmere/mirror-marsh/mirror-marsh-result-sketch-stars.webp",
  "mirror-marsh-result-wave-back": "assets/games/unwritten-map/illustrations/mossmere/mirror-marsh/mirror-marsh-result-wave-back.webp",
  "mirror-marsh-result-reed-raft": "assets/games/unwritten-map/illustrations/mossmere/mirror-marsh/mirror-marsh-result-reed-raft.webp",
  "rain-camp-encounter": "assets/games/unwritten-map/illustrations/westreach/rain-camp/rain-camp-encounter.webp",
  "rain-camp-choice-crowded-table": "assets/games/unwritten-map/illustrations/westreach/rain-camp/rain-camp-choice-crowded-table.webp",
  "rain-camp-choice-paint-storm": "assets/games/unwritten-map/illustrations/westreach/rain-camp/rain-camp-choice-paint-storm.webp",
  "rain-camp-choice-sort-supplies": "assets/games/unwritten-map/illustrations/westreach/rain-camp/rain-camp-choice-sort-supplies.webp",
  "rain-camp-choice-rain-walk": "assets/games/unwritten-map/illustrations/westreach/rain-camp/rain-camp-choice-rain-walk.webp",
  "rain-camp-result-crowded-table": "assets/games/unwritten-map/illustrations/westreach/rain-camp/rain-camp-result-crowded-table.webp",
  "rain-camp-result-paint-storm": "assets/games/unwritten-map/illustrations/westreach/rain-camp/rain-camp-result-paint-storm.webp",
  "rain-camp-result-sort-supplies": "assets/games/unwritten-map/illustrations/westreach/rain-camp/rain-camp-result-sort-supplies.webp",
  "rain-camp-result-rain-walk": "assets/games/unwritten-map/illustrations/westreach/rain-camp/rain-camp-result-rain-walk.webp",
  "paper-dragon-encounter": "assets/games/unwritten-map/illustrations/westreach/paper-dragon/paper-dragon-encounter.webp",
  "paper-dragon-choice-fly-with-dragon": "assets/games/unwritten-map/illustrations/westreach/paper-dragon/paper-dragon-choice-fly-with-dragon.webp",
  "paper-dragon-choice-dragon-riddle": "assets/games/unwritten-map/illustrations/westreach/paper-dragon/paper-dragon-choice-dragon-riddle.webp",
  "paper-dragon-choice-repair-tail": "assets/games/unwritten-map/illustrations/westreach/paper-dragon/paper-dragon-choice-repair-tail.webp",
  "paper-dragon-choice-festival-chase": "assets/games/unwritten-map/illustrations/westreach/paper-dragon/paper-dragon-choice-festival-chase.webp",
  "ember-library-encounter": "assets/games/unwritten-map/illustrations/ashpeak/ember-library/ember-library-encounter.webp",
  "giant-garden-encounter": "assets/games/unwritten-map/illustrations/ashpeak/giant-garden/giant-garden-encounter.webp",
  "old-lighthouse-encounter": "assets/games/unwritten-map/illustrations/tideglass/old-lighthouse/old-lighthouse-encounter.webp",
  "star-ferry-encounter": "assets/games/unwritten-map/illustrations/tideglass/star-ferry/star-ferry-encounter.webp",

  "frog-parliament-encounter": "assets/games/unwritten-map/frog-encounter.webp",

  "frog-parliament-choice-hear-frogs": "assets/games/unwritten-map/frog-hear.webp",
  "frog-parliament-choice-night-pageant": "assets/games/unwritten-map/frog-pageant.webp",
  "frog-parliament-choice-moon-experiment": "assets/games/unwritten-map/frog-experiment.webp",
  "frog-parliament-choice-grand-speech": "assets/games/unwritten-map/frog-speech.webp",

  "frog-parliament-result-hear-frogs": "assets/games/unwritten-map/result-frog-hear.webp",
  "frog-parliament-result-night-pageant": "assets/games/unwritten-map/result-frog-pageant.webp",
  "frog-parliament-result-moon-experiment": "assets/games/unwritten-map/result-moon-frog.webp",
  "frog-parliament-result-grand-speech": "assets/games/unwritten-map/result-frog-speech.webp",

  "shared-frame-entry-left": "assets/games/unwritten-map/entry-left.webp",
  "shared-frame-entry-right": "assets/games/unwritten-map/entry-right.webp",
  "shared-frame-entry-tabletop": "assets/games/unwritten-map/entry-tabletop.webp",
  "shared-frame-journal-left": "assets/games/unwritten-map/journal-left.webp",
  "shared-frame-journal-right": "assets/games/unwritten-map/journal-right.webp",
  "shared-frame-board-map": "assets/games/unwritten-map/board-map.webp",
  "shared-frame-board-map-mobile": "assets/games/unwritten-map/board-map-mobile.webp",
  "shared-frame-world-map": "assets/games/unwritten-map/world-map.webp",
  "shared-frame-mossmere-encounter-left": "assets/games/unwritten-map/encounter-mossmere-left.webp",
  "shared-frame-mossmere-encounter-right": "assets/games/unwritten-map/encounter-mossmere-right.webp",
  "shared-frame-mossmere-result-left": "assets/games/unwritten-map/result-mossmere-left.webp",
  "shared-frame-mossmere-result-right": "assets/games/unwritten-map/result-mossmere-right.webp",
  "shared-frame-mossmere-result-bottom": "assets/games/unwritten-map/result-mossmere-bottom.webp",
} as const;

export type UnwrittenMapLocalAssetId = keyof typeof UNWRITTEN_MAP_LOCAL_ASSET_MANIFEST;

export const UNWRITTEN_MAP_LOCAL_ASSET_IDS = Object.keys(
  UNWRITTEN_MAP_LOCAL_ASSET_MANIFEST,
) as readonly UnwrittenMapLocalAssetId[];

export function unwrittenMapLocalAssetPath(assetId: UnwrittenMapLocalAssetId): string {
  return UNWRITTEN_MAP_LOCAL_ASSET_MANIFEST[assetId];
}

/**
 * The exact, authoritative choice-id -> local-asset-id mapping for the
 * frog-parliament scenario's per-choice focal art. Keyed by the game's real
 * choice ids so remapping stays correct regardless of any historical baked
 * numbering (e.g. "choice 1/2/3/4") used while the art was produced.
 */
export const FROG_PARLIAMENT_CHOICE_ASSET_IDS: Record<string, UnwrittenMapLocalAssetId> = {
  "hear-frogs": "frog-parliament-choice-hear-frogs",
  "night-pageant": "frog-parliament-choice-night-pageant",
  "moon-experiment": "frog-parliament-choice-moon-experiment",
  "grand-speech": "frog-parliament-choice-grand-speech",
};

export const LANTERN_FAIR_CHOICE_ASSET_IDS: Record<string, UnwrittenMapLocalAssetId> = {
  "take-stage": "lantern-fair-choice-take-stage",
  "balcony-view": "lantern-fair-choice-balcony-view",
  "hidden-melody": "lantern-fair-choice-hidden-melody",
  "help-lanterns": "lantern-fair-choice-help-lanterns",
};

export const CLOCKWORK_BRIDGE_CHOICE_ASSET_IDS: Record<string, UnwrittenMapLocalAssetId> = {
  "gear-puzzle": "clockwork-bridge-choice-gear-puzzle",
  "rope-crossing": "clockwork-bridge-choice-rope-crossing",
  "mediate-gears": "clockwork-bridge-choice-mediate-gears",
  "paint-blueprint": "clockwork-bridge-choice-paint-blueprint",
};

/** Authoritative Highwind Farm choice-id -> commissioned choice-art mapping. */
export const CLOUD_SHEPHERD_CHOICE_ASSET_IDS: Record<string, UnwrittenMapLocalAssetId> = {
  "race-cloud": "cloud-shepherd-choice-race-cloud",
  "cloud-joke": "cloud-shepherd-choice-cloud-joke",
  "weather-song": "cloud-shepherd-choice-weather-song",
  "map-air-current": "cloud-shepherd-choice-map-air-current",
};

/** Authoritative Highwind Farm choice-id -> commissioned result-art mapping. */
export const CLOUD_SHEPHERD_RESULT_ASSET_IDS: Record<string, UnwrittenMapLocalAssetId> = {
  "race-cloud": "cloud-shepherd-result-race-cloud",
  "cloud-joke": "cloud-shepherd-result-cloud-joke",
  "weather-song": "cloud-shepherd-result-weather-song",
  "map-air-current": "cloud-shepherd-result-map-air-current",
};

/** Authoritative Mirror Marsh choice-id -> commissioned choice-art mapping. */
export const MIRROR_MARSH_CHOICE_ASSET_IDS: Record<string, UnwrittenMapLocalAssetId> = {
  "step-reflection": "mirror-marsh-choice-step-reflection",
  "sketch-stars": "mirror-marsh-choice-sketch-stars",
  "wave-back": "mirror-marsh-choice-wave-back",
  "reed-raft": "mirror-marsh-choice-reed-raft",
};

/** Authoritative Mirror Marsh choice-id -> commissioned result-art mapping. */
export const MIRROR_MARSH_RESULT_ASSET_IDS: Record<string, UnwrittenMapLocalAssetId> = {
  "step-reflection": "mirror-marsh-result-step-reflection",
  "sketch-stars": "mirror-marsh-result-sketch-stars",
  "wave-back": "mirror-marsh-result-wave-back",
  "reed-raft": "mirror-marsh-result-reed-raft",
};

/** Authoritative Rain Camp choice-id -> commissioned choice-art mapping. */
export const RAIN_CAMP_CHOICE_ASSET_IDS: Record<string, UnwrittenMapLocalAssetId> = {
  "crowded-table": "rain-camp-choice-crowded-table",
  "paint-storm": "rain-camp-choice-paint-storm",
  "sort-supplies": "rain-camp-choice-sort-supplies",
  "rain-walk": "rain-camp-choice-rain-walk",
};

/** Authoritative Rain Camp choice-id -> commissioned result-art mapping. */
export const RAIN_CAMP_RESULT_ASSET_IDS: Record<string, UnwrittenMapLocalAssetId> = {
  "crowded-table": "rain-camp-result-crowded-table",
  "paint-storm": "rain-camp-result-paint-storm",
  "sort-supplies": "rain-camp-result-sort-supplies",
  "rain-walk": "rain-camp-result-rain-walk",
};

/** Authoritative Kite Hill choice-id -> commissioned choice-art mapping. */
export const PAPER_DRAGON_CHOICE_ASSET_IDS: Record<string, UnwrittenMapLocalAssetId> = {
  "fly-with-dragon": "paper-dragon-choice-fly-with-dragon",
  "dragon-riddle": "paper-dragon-choice-dragon-riddle",
  "repair-tail": "paper-dragon-choice-repair-tail",
  "festival-chase": "paper-dragon-choice-festival-chase",
};

export const CLOCKWORK_BRIDGE_RESULT_ASSET_IDS: Record<string, UnwrittenMapLocalAssetId> = {
  "gear-puzzle": "clockwork-bridge-result-gear-puzzle",
  "rope-crossing": "clockwork-bridge-result-rope-crossing",
  "mediate-gears": "clockwork-bridge-result-mediate-gears",
  "paint-blueprint": "clockwork-bridge-result-paint-blueprint",
};

/** The exact, authoritative choice-id -> local-asset-id mapping for results. */
export const FROG_PARLIAMENT_RESULT_ASSET_IDS: Record<string, UnwrittenMapLocalAssetId> = {
  "hear-frogs": "frog-parliament-result-hear-frogs",
  "night-pageant": "frog-parliament-result-night-pageant",
  "moon-experiment": "frog-parliament-result-moon-experiment",
  "grand-speech": "frog-parliament-result-grand-speech",
};

/** Authoritative Lantern Fair choice-id -> commissioned result-art mapping. */
export const LANTERN_FAIR_RESULT_ASSET_IDS: Record<string, UnwrittenMapLocalAssetId> = {
  "take-stage": "lantern-fair-result-take-stage",
  "balcony-view": "lantern-fair-result-balcony-view",
  "hidden-melody": "lantern-fair-result-hidden-melody",
  "help-lanterns": "lantern-fair-result-help-lanterns",
};

/** Authoritative Whisper Orchard choice-id -> commissioned choice-art mapping. */
export const WHISPER_ORCHARD_CHOICE_ASSET_IDS: Record<string, UnwrittenMapLocalAssetId> = {
  "call-light": "whisper-orchard-choice-call-light",
  "trail-light": "whisper-orchard-choice-trail-light",
  "decode-trees": "whisper-orchard-choice-decode-trees",
  "taste-fruit": "whisper-orchard-choice-taste-fruit",
};

/** Authoritative Whisper Orchard choice-id -> commissioned result-art mapping. */
export const WHISPER_ORCHARD_RESULT_ASSET_IDS: Record<string, UnwrittenMapLocalAssetId> = {
  "call-light": "whisper-orchard-result-call-light",
  "trail-light": "whisper-orchard-result-trail-light",
  "decode-trees": "whisper-orchard-result-decode-trees",
  "taste-fruit": "whisper-orchard-result-taste-fruit",
};

export const FROG_PARLIAMENT_ENCOUNTER_ASSET_ID: UnwrittenMapLocalAssetId = "frog-parliament-encounter";

export const UNWRITTEN_MAP_ENCOUNTER_ASSET_IDS: Readonly<Partial<Record<string, UnwrittenMapLocalAssetId>>> = {
  "lantern-fair": "lantern-fair-encounter",
  "whisper-orchard": "whisper-orchard-encounter",
  "clockwork-bridge": "clockwork-bridge-encounter",
  "cloud-shepherd": "cloud-shepherd-encounter",
  "mirror-marsh": "mirror-marsh-encounter",
  "rain-camp": "rain-camp-encounter",
  "paper-dragon": "paper-dragon-encounter",
  "ember-library": "ember-library-encounter",
  "giant-garden": "giant-garden-encounter",
  "old-lighthouse": "old-lighthouse-encounter",
  "star-ferry": "star-ferry-encounter",
  "frog-parliament": FROG_PARLIAMENT_ENCOUNTER_ASSET_ID,
};

export const UNWRITTEN_MAP_FOCAL_ASSET_PROVENANCE: Readonly<Partial<Record<UnwrittenMapLocalAssetId, {
  sourceFile: string;
  sourceSha256: string;
  derivedSha256: string;
  derivedDimensions: string;
  authorization: string;
  authoredScene?: string;
}>>> = {
  "lantern-fair-result-take-stage": {
    sourceFile: "4f09c3b1-da6f-468d-bf8a-768339f60720-3d4033fe-7250-46b7-8347-ea980876126f-clipboard.png",
    sourceSha256: "65aaa4416927fbc0a1f4fb8067dc10318841efdf35e9094198b5707ac6d99e03",
    derivedSha256: "59b183d1005cb134564057018e34b32c22b9d92ff41fee2fc8e3d8d4ada9ab1f",
    derivedDimensions: "1536x1024",
    authorization: "User-supplied for Lantern Fair result integration",
  },
  "lantern-fair-result-balcony-view": {
    sourceFile: "ccb74a15-5b66-4b4a-8c71-1319b53569e2-c3bda329-21a9-403b-b6c9-dfb7f7087545-clipboard.png",
    sourceSha256: "e1bfd1c7ab8d154e93d5bf30709f8dfa201a0d2a334af899a4f570c2bb51a161",
    derivedSha256: "56db31e9a3cde453c9dbcb634f894d61b6a306213b74a428257db8e43e4e8442",
    derivedDimensions: "1536x1024",
    authorization: "User-supplied for Lantern Fair result integration",
  },
  "lantern-fair-result-hidden-melody": {
    sourceFile: "76c97622-4b97-4c37-8d54-f9619eb525ad-7776b0cf-a87a-46e7-80fa-9720d593170a-clipboard.png",
    sourceSha256: "1d6016847f1e052199145343944730e8f5bd03f140cd64095725230df5eacc99",
    derivedSha256: "8fce6819e9f1b44f2f9b19e5778223aaf772082ed75457814cc4d3a97a6d1924",
    derivedDimensions: "1536x1024",
    authorization: "User-supplied for Lantern Fair result integration",
  },
  "lantern-fair-result-help-lanterns": {
    sourceFile: "785f6217-7585-4b68-a820-c4540c4eff75-5bc84b8d-e271-458f-b854-ddf281b46c23-clipboard.png",
    sourceSha256: "974e0b9ce0cbe5d348e049584f75ce0b9831fdb13331b40ddd3732d958f653df",
    derivedSha256: "131cb45ef6a5775669935ce9ed16cf51cb0c9752669b565a7189f4260847357d",
    derivedDimensions: "1536x1024",
    authorization: "User-supplied for Lantern Fair result integration",
  },
  "lantern-fair-encounter": {
    sourceFile: "a38fedbc-84ee-4467-8b6a-6f23c6135066-0fca7dc5-313d-45ce-beea-f3c0ce118358-clipboard.png",
    sourceSha256: "1cc48fed7691c3fdbf29cc1096d4df7bbe2992a868c5e1893a2876e80fe701a7",
    derivedSha256: "78c0bbd53611f141fbf9118170e00010f902af52298ead3c8df2d736a1889830",
    derivedDimensions: "1418x945",
    authorization: "User-supplied for PR #306",
  },
  "lantern-fair-choice-take-stage": {
    sourceFile: "b0a32019-e55d-4ab8-ac7a-49b2ef3139a9-1cc8091e-4547-4f71-b077-afec765727ab-clipboard.png",
    sourceSha256: "ae0339a4bb2eb03f5b950a905e9e2b7b6b10dedf90de6ea8fa4723c910bec7aa",
    derivedSha256: "64607381a8dcdcd637f630923112727188484f70de9deb8ba799b53f62ed6386",
    derivedDimensions: "800x600",
    authorization: "User-supplied for this Lantern Fair choice-art phase",
  },
  "lantern-fair-choice-balcony-view": {
    sourceFile: "ca53938b-ddf0-462c-8a93-ca0a9472cd37-a923c3e0-51c2-41c5-88d0-7c176fd0dbf2-clipboard.png",
    sourceSha256: "cc5e3f5be63c4b9795da9129d12307636612f8d0c2ea00b528e517e392f72e86",
    derivedSha256: "fcf4a37324cc3da4b8e9a49127d0553dd159d4b1c686c835a91d63aebc3e0ac6",
    derivedDimensions: "800x600",
    authorization: "User-supplied for this Lantern Fair choice-art phase",
  },
  "lantern-fair-choice-hidden-melody": {
    sourceFile: "1e2e7391-3aae-451d-8292-1f6a52941b64-45e1b0b4-7c1a-4919-ba16-9ba6ce8425ee-clipboard.png",
    sourceSha256: "ba6edef51d9408217bfb8a60a13dd66bf23cdc693701f2580429f42800e0565b",
    derivedSha256: "c5294a8154949d9f46b98d4cb18ee6c3aa61653c03aa77681720d9ab0cd26475",
    derivedDimensions: "800x600",
    authorization: "User-supplied for this Lantern Fair choice-art phase",
  },
  "lantern-fair-choice-help-lanterns": {
    sourceFile: "1b6f2dad-2192-4686-b8d4-9e61d6b9ff5c-db2ba40c-635f-48c8-afae-8ceb25aeab03-clipboard.png",
    sourceSha256: "5080027b52021a6685fb30a161b59efb8f0e2599fec77a2fd81594592ec5a762",
    derivedSha256: "f6cfa181a31c803850fddf459b8a4f44e659ea357e663bed2da1cca57cb2cd7d",
    derivedDimensions: "800x600",
    authorization: "User-supplied for this Lantern Fair choice-art phase",
  },
  "whisper-orchard-encounter": {
    sourceFile: "a93fb7d1-cb43-487e-ae1e-e6e62c2eb72a-ca28c87f-d8d7-4e64-b9e6-4a0a862d12c9-clipboard.png",
    sourceSha256: "d8a7e9bcd190a155012fa8487de34ed9f04374f8b8dc09ae8595f76b54ac0424",
    derivedSha256: "158536501f8daba63b55782ef6725e6762da29045538290418bc5fbabad319a3",
    derivedDimensions: "1395x930",
    authorization: "User-supplied for PR #306",
  },
  "whisper-orchard-choice-call-light": {
    sourceFile: "736c738d-c658-4a40-a814-b3082af8886b-745be0cd-a0a7-4a42-97d5-868286b02324-clipboard.png",
    sourceSha256: "08d7e426025efa8048fbec7841253c09661dcce2a137e9ffedf71b94b35c85ab",
    derivedSha256: "23f74f6070b5cb7bd2106346fa02eab6ec8f730f4ce14892ace8aa5b8085c0c5",
    derivedDimensions: "1200x900",
    authorization: "User-supplied for Whisper Orchard choice integration",
  },
  "whisper-orchard-choice-trail-light": {
    sourceFile: "8c6e765d-a09d-434c-869f-651fbc62e17c-19ea12d1-959d-451e-9da5-666bc2a9bb37-clipboard.png",
    sourceSha256: "6bbcee66d1d01a07a6bd5b549ee626735816a57f72ceaf85f293988dc66cba64",
    derivedSha256: "c3f5861e983633b3c5ded814528511a9c8241e0372442d978eb48eb17a70a3f9",
    derivedDimensions: "1200x900",
    authorization: "User-supplied for Whisper Orchard choice integration",
  },
  "whisper-orchard-choice-decode-trees": {
    sourceFile: "a77b7a05-018b-450d-9413-82fb71cd6446-9d39468b-509c-46e4-aba8-de754a0cc9a8-clipboard.png",
    sourceSha256: "6c4ae438db87e704fd648c2506517e4d2432298cf2ab9304fb9228e41eac0665",
    derivedSha256: "17b71cbecf8843341a6d5cb7e3f3a687c6a17c138f5de9ab88a9ae8fd9bb6817",
    derivedDimensions: "1200x900",
    authorization: "User-supplied for Whisper Orchard choice integration",
  },
  "whisper-orchard-choice-taste-fruit": {
    sourceFile: "9d597ec4-5eca-47ca-8129-8de37ae96768-7ae4edb6-a642-4654-941d-cced0b6ceb63-clipboard.png",
    sourceSha256: "723e9596d70e4c78e336397d57cc4a24f2f26aa2781d723ec634e22e607173ea",
    derivedSha256: "e8a035ee144aa388b83c669a8e979296cea41591ca71575dc089da7f45cdb0fe",
    derivedDimensions: "1200x900",
    authorization: "User-supplied for Whisper Orchard choice integration",
  },
  "whisper-orchard-result-call-light": {
    sourceFile: "8e55b153-01ca-486d-9c8e-bd3191526200-e8d74e3a-e1ae-4d1b-9dd8-e0d29ecf66c0-clipboard.png",
    sourceSha256: "252f5d20fdf7802f7f1b4a74f50d8aa122de74581be5689267df41a97d7de2db",
    derivedSha256: "e2251dfb8cea6e36442af804b268f131f0d7d0ea71f43a1b5c270fe6bc183332",
    derivedDimensions: "1464x976",
    authorization: "User-supplied for Whisper Orchard result integration",
  },
  "whisper-orchard-result-trail-light": {
    sourceFile: "502cd676-16e1-418f-ba32-08a33874812e-f6c2f7da-07ea-417f-92cd-25a57bf8672f-clipboard.png",
    sourceSha256: "92de7af3c94e8fa9d061aa3f7439a66a49c393ddfe5a2e283124a8e99d06aef3",
    derivedSha256: "d93e28f69c1f6e14ea68d8f10f5aaa3a85b278ef5b170449774726f742f23e62",
    derivedDimensions: "1470x980",
    authorization: "User-supplied for Whisper Orchard result integration",
  },
  "whisper-orchard-result-decode-trees": {
    sourceFile: "776af5b6-66b2-4f75-a6e6-52dfd774d627-1ba5641e-8b22-4c44-ac76-9fa3c5df1854-clipboard.png",
    sourceSha256: "77b167e30fb07e4fe229a32f9c9c366ec609d427cb2c56941eb7197bfdbc53ab",
    derivedSha256: "eca54ef6903e2c5de0f8c72b8322a4ae37facadabdb8f31d509512c5c63068f4",
    derivedDimensions: "1467x978",
    authorization: "User-supplied for Whisper Orchard result integration",
  },
  "whisper-orchard-result-taste-fruit": {
    sourceFile: "6271ffff-beb0-4ac5-87de-cd0e924b3988-08f34f0e-1a48-405c-b894-3202e86551fc-clipboard.png",
    sourceSha256: "fa3ac36376b472c7fdc636812966c01192b7322480e3760a5c05366d25da75b2",
    derivedSha256: "a00a75715b03e383f8ca8a318b17df9112ac606d0f2d2e6667496186b50b00c8",
    derivedDimensions: "1494x996",
    authorization: "User-supplied for Whisper Orchard result integration",
  },
  "clockwork-bridge-encounter": {
    sourceFile: "14e6145f-c501-457e-b5c3-728a7fa8ae1d-e414d6fb-2c40-4268-998c-28658fc346cb-clipboard.png",
    sourceSha256: "d5db024902530a630b4b4915de00abf71dfb00994dd4eb6c781c7c8747cc77ff",
    derivedSha256: "017e95d59c74753fc74446e0316e38a4780ca12371c849c17eb654583c4b2de7",
    derivedDimensions: "1418x945",
    authorization: "User-supplied for PR #306",
  },
  "clockwork-bridge-choice-gear-puzzle": {
    sourceFile: "60a2a0d5-f950-464e-b3bb-93148caa5a37-a9943e72-1052-4220-b61a-3487b37087c9-clipboard.png",
    sourceSha256: "f79446e357f6d993f525fe8a803928fec4591db232a1e80695a2f27d4ef656d8",
    derivedSha256: "13f0a5b2879c7c5e6ba13028243bdaa26117d1902db8f3484fecb61433c84963",
    derivedDimensions: "800x600",
    authorization: "User-supplied for Clockwork Bridge choice integration",
  },
  "clockwork-bridge-choice-rope-crossing": {
    sourceFile: "255c9a32-1061-41fb-95fc-61f260f39a4a-d9affb6c-2987-4158-92c1-6fb31bd2ce2a-clipboard.png",
    sourceSha256: "1be7face075af0ec2576e41aea7b6fe483457579f9b0842c73c3c5f2d3f3915a",
    derivedSha256: "536debbe785553c45a6a896530a8df62049946e7f9178ccbbc18c734d67db55a",
    derivedDimensions: "800x600",
    authorization: "User-supplied for Clockwork Bridge choice integration",
  },
  "clockwork-bridge-choice-mediate-gears": {
    sourceFile: "d549fc41-32c3-4747-9e2d-d222ffce164c-f9163eab-98d4-41ce-8eb8-5294392b3813-clipboard.png",
    sourceSha256: "3d44bc5afd22f53a40e96252b0d82f65f3fc7f72957932bab3817d8608240fa5",
    derivedSha256: "ff7c51e15f8e95085eb7eaeeb07493e32dced685165fbf0d5c5644b668c911ca",
    derivedDimensions: "800x600",
    authorization: "User-supplied for Clockwork Bridge choice integration",
  },
  "clockwork-bridge-choice-paint-blueprint": {
    sourceFile: "ba8c4abd-c941-488c-8a08-231bb42cad4e-38ab5d42-c9bb-4e0b-98df-a83362167f5c-clipboard.png",
    sourceSha256: "3c718dc4cdb26e525e310535f61d242203e8bc55afa64a4e8a4e887f2ecddd18",
    derivedSha256: "b8879da8753fc5f10fd7e3ef38e853a7c43e8b1831da427d75f6f893e91ef337",
    derivedDimensions: "800x600",
    authorization: "User-supplied for Clockwork Bridge choice integration",
  },
  "clockwork-bridge-result-gear-puzzle": {
    sourceFile: "456e4913-9cef-4c1c-bcf4-3f0303360e47-1ec60e4a-8fae-4ec1-919b-4589de9bb031-clipboard.png",
    sourceSha256: "7545b5a712a517a9d0210612ecbd1693c67dbb5db95eb22da7a1bdce87986fc9",
    derivedSha256: "245aa71635b2a2d27ee7c1602e8e398f465ace6f3e4105cf7f28c64a71993e11",
    derivedDimensions: "1473x982",
    authorization: "User-supplied for Clockwork Bridge result integration",
  },
  "clockwork-bridge-result-rope-crossing": {
    sourceFile: "bdaad6ec-4b6c-4fde-b1e7-b5b959a0982d-7dec58fd-e568-4586-9a96-659ae3354495-clipboard.png",
    sourceSha256: "5de2b7ac1ceb8f92a7f75ca4e48b080aa56c3ee1485019e010e76adb4aebe931",
    derivedSha256: "d82b2266e8461e0cb7f020a650b8254c00191f8ce34c498b4d257a51e341bc1b",
    derivedDimensions: "1442x961",
    authorization: "User-supplied for Clockwork Bridge result integration",
  },
  "clockwork-bridge-result-mediate-gears": {
    sourceFile: "07fdc65e-156c-4876-82ce-b6c0ab31b104-1c7e0af5-c76f-48e6-92d6-a38f72ec18e3-clipboard.png",
    sourceSha256: "3cd20fd668151b32ef478fbc41497cbd9d73395d27213346620f6a5f7c3ff3b3",
    derivedSha256: "9be776e572c3e0684a593db550ff79fdbbc40d313beae1fc1f29f0e83aaf097a",
    derivedDimensions: "1461x974",
    authorization: "User-supplied for Clockwork Bridge result integration",
  },
  "clockwork-bridge-result-paint-blueprint": {
    sourceFile: "e92bc360-f5ce-494f-9899-efe5aa2edba2-d46dce09-575d-45ed-bca2-8746bf2cec49-clipboard.png",
    sourceSha256: "c69634d4ab182736263fc5e300693d7cb9fac600060b2f095a847afa6e0bf910",
    derivedSha256: "b35de9105a98e3ff4ddf1cf6ceef164d03e1537001a5e719cc6bd46de5ff73bf",
    derivedDimensions: "1471x981",
    authorization: "User-supplied for Clockwork Bridge result integration",
  },
  "cloud-shepherd-encounter": {
    sourceFile: "b3ea9f57-fbd8-4344-bd46-3fc24e3a79c0-eb5fbca4-1ec4-4e0d-9419-154633bfc2bf-clipboard.png",
    sourceSha256: "dee3eb79771fe639eb2e2bb4f0cd85007c3300ee6d55545ab62318bf1162fc89",
    derivedSha256: "853f75983848a79f04f72b7dade2ba89f72ce3cafa2c83752a5ed040742a0286",
    derivedDimensions: "1466x977",
    authorization: "User-supplied for PR #306",
  },
  "cloud-shepherd-choice-race-cloud": {
    sourceFile: "d98f5612-df7c-4652-bcac-34878a14869e-a23111bc-632f-4f17-ae2a-a4ef8ca1e1f4-clipboard.png",
    sourceSha256: "07911bb5b328d24e856407e56508c174664a6eb1c79795c6caa49ba267df1d72",
    derivedSha256: "1ac7a372ca163e5108a6b7d2cf9c09e462d381ce6b00ae1b59eee8b2cacec6ed",
    derivedDimensions: "800x600",
    authorization: "User-supplied for Highwind Farm choice integration",
    authoredScene: "Explorer and dog race a wind-sail cart along a highland ridge and farm road at sunset; the cloud remains contextual rather than central.",
  },
  "cloud-shepherd-choice-cloud-joke": {
    sourceFile: "0be35d24-ac17-460b-91d3-0ac5e57890cb-fb888bc1-ee3c-49ec-aab5-f33e51510618-clipboard.png",
    sourceSha256: "06a15ce5b566c59bbdca55534ea472fd5ac2974473b9969071267ff779e337a3",
    derivedSha256: "51c255069b6f7a0bde5dbb911db232f4796b58598d16bd1c496db97b3f52c2bb",
    derivedDimensions: "800x600",
    authorization: "User-supplied for Highwind Farm choice integration",
    authoredScene: "Explorer tells a joke to a laughing cow with the dog and farm visible at sunset; the cow is decorative context and does not redefine the cloud choice.",
  },
  "cloud-shepherd-choice-weather-song": {
    sourceFile: "5e5515fb-3f3c-4735-86ce-c854694c7134-9b837eee-c871-4ba1-a0ca-ff2d5fe645cf-clipboard.png",
    sourceSha256: "5ce3ce4eff4f37d4995dd806f8b13a7459e0fe402b314a04f7364ef24b6b0641",
    derivedSha256: "a2c33cc8d55dfb21f2bb9753ec350b5743f77e3fbd47d8f878172e24e48d1b22",
    derivedDimensions: "800x600",
    authorization: "User-supplied for Highwind Farm choice integration",
    authoredScene: "Explorer and dog learn a guitar weather song from an elder shepherd among sheep on the farm at sunset.",
  },
  "cloud-shepherd-choice-map-air-current": {
    sourceFile: "26a066b4-96e9-43b4-b2f4-642d4e0e2c5f-2614173d-2d20-4d58-afa7-b2f1f4895cfc-clipboard.png",
    sourceSha256: "f1ea8730b8a73e4357f44df84d8e25288d52ad1b09d2b3ec6c9942f3c9dbd282",
    derivedSha256: "e50fd9e50432e8b264c5c79a45316aac716af715831c7616df579abf57dafcfc",
    derivedDimensions: "800x600",
    authorization: "User-supplied for Highwind Farm choice integration",
    authoredScene: "Explorer and dog study drawn wind patterns beside a weather vane as visible air-current ribbons cross the valley.",
  },
  "cloud-shepherd-result-race-cloud": {
    sourceFile: "982fe171-9261-4560-b050-98f6db3c4867-31d5a204-ad6c-4ca1-a9bd-8ea34514c604-clipboard.png",
    sourceSha256: "df21f6182641326a28e519ec7199a41d442d1f67abf20651dd3df655be0c1e81",
    derivedSha256: "d3a8c5bbbc6b9bbcddbb138f064fd3623220e15a2f0d8aa12f5be150fbe8139a",
    derivedDimensions: "1536x1024",
    authorization: "User-supplied for Highwind Farm result integration",
  },
  "cloud-shepherd-result-cloud-joke": {
    sourceFile: "d4373905-e8a5-4c47-938e-c4d868c2e108-c2e9e549-8409-482f-a212-a12775464e12-clipboard.png",
    sourceSha256: "e5295fafe70c750eab97d73321c9dcc3b5d5416006ff9e51030c691cb2a16a59",
    derivedSha256: "9d9750b9a3d4728f2a1a43b98f679a52612fa1cebc489676f6274a61c623992f",
    derivedDimensions: "1536x1024",
    authorization: "User-supplied for Highwind Farm result integration",
  },
  "cloud-shepherd-result-weather-song": {
    sourceFile: "6d94ade5-87fa-40e1-a3b8-32c81deb9cc5-07c22ef1-a170-44d8-8402-f9efe9a0a72d-clipboard.png",
    sourceSha256: "6de291b8a3e29c40fe8f98f369ff794a33370a8e011cb910086e95c955a1b789",
    derivedSha256: "1b0261fa73bd3fd093fa1c6975859a21c752a7149b4f1dce1c1a2fa16dda4484",
    derivedDimensions: "1536x1024",
    authorization: "User-supplied for Highwind Farm result integration",
  },
  "cloud-shepherd-result-map-air-current": {
    sourceFile: "22ede1d6-5277-43f0-b147-cadb41826493-a3204a78-e1ce-4f14-b0f2-f10cb0831d37-clipboard.png",
    sourceSha256: "b50e8b65f63cd1fa2109133939455a89dcf2be99c311e94aebc0e58ed64b1b5f",
    derivedSha256: "0656f0e7b9ce74b75de432e52c66c3ee07d3a5fdf71a3d6682ad79a8fa4bd744",
    derivedDimensions: "1530x1020",
    authorization: "User-supplied for Highwind Farm result integration",
  },
  "mirror-marsh-choice-step-reflection": {
    sourceFile: "63ee9ba2-455f-457f-bd94-ef0dbf267d0a-f0e5d1a3-68d4-4d01-a0da-9f849490b7be-clipboard.png",
    sourceSha256: "6d19e35808c9d7ce6d481b3367c13ce3a22c972ec913db7942bf5ffaaa9f93a9",
    derivedSha256: "ea272da8893f45949806f9bad463d07ae810e1f68bf9452ce7fcdd0f849e1890",
    derivedDimensions: "800x600",
    authorization: "User-supplied for Mirror Marsh choice integration",
  },
  "mirror-marsh-choice-sketch-stars": {
    sourceFile: "a39da34b-30a2-49f7-a240-9e37e486e41a-e52d5d7f-c76f-4461-ae3d-896947869eb3-clipboard.png",
    sourceSha256: "42ea837fb07f403ba4f4f69763d483babb5dfd37ab4697274277dd8806b21d46",
    derivedSha256: "157a06e840d9010daaa2f2f702406f18b3d6c6c901ba3ca209e0e06df3ecafb0",
    derivedDimensions: "800x600",
    authorization: "User-supplied for Mirror Marsh choice integration",
  },
  "mirror-marsh-choice-wave-back": {
    sourceFile: "828ea167-3538-4b7f-869e-abc4bbeb6d80-c9bf7312-09ea-4bbf-966d-3510a353ec15-clipboard.png",
    sourceSha256: "a943667384a410ea718ecc074b9b5fac57564a8aa89da3d5074f17cbd3381cc8",
    derivedSha256: "9d65a756a37910fb0e933a5bbea57d68656bad9ab81785e07f3d34806e3f952d",
    derivedDimensions: "800x600",
    authorization: "User-supplied for Mirror Marsh choice integration",
  },
  "mirror-marsh-choice-reed-raft": {
    sourceFile: "b13dce52-baac-46e6-93b1-e7a366f3bf9e-f9aa1729-ef05-41fe-ba25-7728f27e4f37-clipboard.png",
    sourceSha256: "f23c6b7603ac8891696aa3f7719b409109dacdfd8f4bbd0897a36ccf0e120528",
    derivedSha256: "36cc71da1a086a1ba965f85135cbc86c456e032d74dee7cf02d503ec2a7beb8a",
    derivedDimensions: "800x600",
    authorization: "User-supplied for Mirror Marsh choice integration",
  },
  "mirror-marsh-result-step-reflection": {
    sourceFile: "c9d54953-b139-4e00-ad54-2295053de84e-78ce8c8f-4bdb-46a9-b9a4-ae5923fc964c-clipboard.png",
    sourceSha256: "8c04b1538eb6f1ee2f132b96ab4ee6f27d276eceeeb2b742168dc5bc0638baa1",
    derivedSha256: "cc29b74c1eefd009dde8c3cfb379d357c789c1721fe5e68206cb7cc3d6ef9590",
    derivedDimensions: "1536x1024",
    authorization: "User-supplied for Mirror Marsh result integration",
  },
  "mirror-marsh-result-sketch-stars": {
    sourceFile: "52f666df-1af1-4671-86c4-2aef2bc6a4c7-a707eda2-6c3d-42f5-9857-42c5b352d4ea-clipboard.png",
    sourceSha256: "1f70a997bf7e24ca854083d7eea63146b5ffed7f21f633c91a911197e04c2469",
    derivedSha256: "5c828f1eeb6ea824a7278dc48a74bc7568bbf3256eb2a8fac7bda5d661eb4d4c",
    derivedDimensions: "1536x1024",
    authorization: "User-supplied for Mirror Marsh result integration",
  },
  "mirror-marsh-result-wave-back": {
    sourceFile: "c251a539-88dc-40fc-9f40-650477728a1f-3469a028-d46d-418d-90b4-c6e04fbe2d71-clipboard.png",
    sourceSha256: "53f17580427ad13fb4a27a384bdea036792153d87e96beadcaa5c234b4b57eed",
    derivedSha256: "1a196438f099454c2c77011f581191f4430b4e6154c305b07977db89c8c73cdf",
    derivedDimensions: "1536x1024",
    authorization: "User-supplied for Mirror Marsh result integration",
  },
  "mirror-marsh-result-reed-raft": {
    sourceFile: "7fa0b133-5bf9-4e94-a131-7eef31ea5450-29fd5056-6fb6-405e-a297-d99d87719463-clipboard.png",
    sourceSha256: "ddfdeeef04416f560c90e65171babed088c39f5fae5df7cac2d9adb39fe6ee02",
    derivedSha256: "ed3fdeaa4e0b7a31e0c0b5ba674cbb5d81f46925eed34332e5e1ed991139eec3",
    derivedDimensions: "1526x1017",
    authorization: "User-supplied for Mirror Marsh result integration",
  },
  "rain-camp-choice-crowded-table": {
    sourceFile: "c6f63653-3aed-49da-8b52-1f2e24f7efe7-01cbe309-9e77-49e4-8114-8af747284ea7-clipboard.png",
    sourceSha256: "e7d54af792d6fbe4e181a40f655aa097394023f410801f24b654cbedd3cfa635",
    derivedSha256: "74989dd42a4c62d57bd772dbdff3568830a5fcb13a2e42ed4449c5c7d8eacf2a",
    derivedDimensions: "800x600",
    authorization: "User-supplied for Rain Camp choice integration",
  },
  "rain-camp-choice-paint-storm": {
    sourceFile: "2a599151-cf0a-401a-aaf8-bfc3173d0239-a708a265-4f36-4711-910f-1a155e5960f3-clipboard.png",
    sourceSha256: "4a292dd3a821c8a2c2de504ea5f0650feaede00a426c15608af2d0343a6e8036",
    derivedSha256: "ed5a709117995938ec0cf8d9250bf712b19d8750545cc1002aabf7b23f9725f8",
    derivedDimensions: "800x600",
    authorization: "User-supplied for Rain Camp choice integration",
  },
  "rain-camp-choice-sort-supplies": {
    sourceFile: "ec9c5625-4a2e-4ebd-b666-ca272590ed0c-ffcf5cc9-068b-489e-b73d-88c2bd7e94aa-clipboard.png",
    sourceSha256: "0fe6ff3b0909b238999456c5d8e749c9444f7a48ef4c5bcdc77b7f2d772894f9",
    derivedSha256: "8736b1b5ca4c214ae239b01acfb94ff250f633d8b192af79fdb2a54066ff9c7f",
    derivedDimensions: "800x600",
    authorization: "User-supplied for Rain Camp choice integration",
  },
  "rain-camp-choice-rain-walk": {
    sourceFile: "836d8936-4e56-47ac-932d-f0717d964430-85871674-21a1-4d58-b759-312d56cd90fb-clipboard.png",
    sourceSha256: "41f21debea2f5faded886478ab86e9f5848b5b39e6bd0f3caf3a73d927026e80",
    derivedSha256: "09f482eb8f9899c0365c6c1d258a10d82f11ae0ed3cfcea026865c6d4d3b007f",
    derivedDimensions: "800x600",
    authorization: "User-supplied for Rain Camp choice integration",
  },
  "rain-camp-result-crowded-table": {
    sourceFile: "0eadbc8a-a481-4efc-b929-18e8d020681f-0d15eab2-fa5f-4f02-b794-b0e7b0d8d88b-clipboard.png",
    sourceSha256: "b6940ec312d97d61ed167009f0302653d864d9269d631f4a0cf5ad1994d68b70",
    derivedSha256: "3f84256e88fdb0915232857dadaf7ec3fbafcdc5e5af960679fd05c65fcd5261",
    derivedDimensions: "1536x1024",
    authorization: "User-supplied for Rain Camp result integration",
  },
  "rain-camp-result-paint-storm": {
    sourceFile: "71c6cd83-9895-4000-a3bd-20cfab631778-e0a2b53f-4ac3-45d1-974f-fd29abff1791-clipboard.png",
    sourceSha256: "9389645ac74261ab007bbf98dd8e5dcda7851eb029ceed1a3d4e728a6ea42d38",
    derivedSha256: "bffd6a91a16d126f0ae532925295e139161a37fb9965b03549751a892c59b62d",
    derivedDimensions: "1536x1024",
    authorization: "User-supplied for Rain Camp result integration",
  },
  "rain-camp-result-sort-supplies": {
    sourceFile: "89bb95fe-070e-4b7e-838a-cd7f930392fb-c494ba21-cf48-4f52-a978-4cd58cb7e15d-clipboard.png",
    sourceSha256: "f5ab8947cc1697fe2c92837c0e45a3b8b7d5d9399c93346b9c0540b11732b228",
    derivedSha256: "9a6bdaab5f44d0cccb1a9c9841321b6d874bf3b331b38bd2a76e72ebb1e2a9d7",
    derivedDimensions: "1536x1024",
    authorization: "User-supplied for Rain Camp result integration",
  },
  "rain-camp-result-rain-walk": {
    sourceFile: "554df50a-a22d-49fc-83ea-d78dc0a72429-520e4541-6f23-4b9f-9b81-931a72a2c1d0-clipboard.png",
    sourceSha256: "4f0c676c09a12df20f10b35d9a58bb67e575f80cb5aa2e1680fb5e3a3962181e",
    derivedSha256: "245e236f0b629909a836f989f9cd7c0575bc9c239ae27f9aeb58a597ca1a4360",
    derivedDimensions: "1536x1024",
    authorization: "User-supplied for Rain Camp result integration",
  },
  "paper-dragon-choice-fly-with-dragon": {
    sourceFile: "046d28ff-b417-4f46-b5e4-941289c8edb3-548d51ef-5da1-4394-881c-9fccb7c4987a-clipboard.png",
    sourceSha256: "0e744561aeb5169a64391a321f05fc23f23d8ce7b00761d0364c778b508571e8",
    derivedSha256: "66fe467bbdae0ef2b7bc30a8e5ab1643b0535a813433ff04c274cdaadc0096c4",
    derivedDimensions: "800x600",
    authorization: "User-supplied for Kite Hill choice integration",
  },
  "paper-dragon-choice-dragon-riddle": {
    sourceFile: "1c314700-72f4-4c61-86c6-e159463afdd0-bb1da7a8-4862-4e45-8c34-ff1857ec029a-clipboard.png",
    sourceSha256: "6b5d48f1e4da06048358288542f39f29f7203d022214b3d8832f6d74a1dd33aa",
    derivedSha256: "41d640440a78b8edb636fccace6ddfc3f67bc33c7c7a1592a12c123f24aa97b3",
    derivedDimensions: "800x600",
    authorization: "User-supplied for Kite Hill choice integration",
  },
  "paper-dragon-choice-repair-tail": {
    sourceFile: "cbfe92fc-2b55-4c9f-97e2-2da4fdb94f99-7dffe431-3e07-437c-bc5b-6edeb24d77da-clipboard.png",
    sourceSha256: "18c49b0e9549ce2b4662efb1107e5f0533c018dbfd0439c964de98791f54a713",
    derivedSha256: "befc19e91d0cbfe5c699a3520a67f8b915acd529f7e233f0e75e0360b810f53d",
    derivedDimensions: "800x600",
    authorization: "User-supplied for Kite Hill choice integration",
  },
  "paper-dragon-choice-festival-chase": {
    sourceFile: "7510736e-5436-4f52-a99b-4d85b0a9e865-071be2fd-d520-4652-9a14-63cead9c145f-clipboard.png",
    sourceSha256: "8750bf114e853abb523518bccabc67745e7f5ec6c210198c897cef761ebec806",
    derivedSha256: "19e8e6cca1bec009dfe44f7b309a898017353449cce7a04543084aeafcb1dc75",
    derivedDimensions: "800x600",
    authorization: "User-supplied for Kite Hill choice integration",
  },
  "mirror-marsh-encounter": {
    sourceFile: "50be74da-47fa-49fe-a204-cf1076c80c9c-25a580be-9955-4d46-bcd1-978a2e7fad60-clipboard.png",
    sourceSha256: "2bb05f58ad5eafe013c568c1bd9bf41565cb159f842c8caed99a5003f68dd6b1",
    derivedSha256: "5be524e0902da7ec87b0561cacd6c8f1f73ba5b9f58e4d23ca154373c54115a2",
    derivedDimensions: "1437x958",
    authorization: "User-supplied for PR #306",
  },
  "rain-camp-encounter": {
    sourceFile: "9af4bcb0-68d8-4724-8736-faa412031456-02e1abbf-3f03-4f02-8c0b-b7019fb013c9-clipboard.png",
    sourceSha256: "8972b46edee314463a21dab80b9f95f91487e1e99bc732cb5cc1f356bf18bc4e",
    derivedSha256: "dc15e7d5ea431adb2e43c9a707e2893a3c1d2e8422e84f8d1fb2c36620ee366f",
    derivedDimensions: "1433x955",
    authorization: "User-supplied for PR #306",
  },
  "paper-dragon-encounter": {
    sourceFile: "46e2ab70-c86c-4262-8ea3-a4888b62c6d5-c5fc2e67-4901-4091-85a7-980d427650c1-clipboard.png",
    sourceSha256: "78b042b8c4c00051226c5d8716147eac38b6ae1cbff6dfd44baa6ce3125f0ed5",
    derivedSha256: "16f3a3afbd00bbdc89d415074f35207ba1ea43d9102307fbff46c209fdcb9878",
    derivedDimensions: "1415x943",
    authorization: "User-supplied for PR #306",
  },
  "ember-library-encounter": {
    sourceFile: "b0a8de70-ee09-4689-b17d-bdfc0761a57d-cb090572-9604-483f-bde6-7e6c67648898-clipboard.png",
    sourceSha256: "393eeab390da6677bb066b6a0348802e98a0c0ce71e26ed98447c79adead8f99",
    derivedSha256: "a37ecbed9816430d18a1a087cf45f37c2beb25b8b7e4716cfa4dcd6facd86aeb",
    derivedDimensions: "1462x975",
    authorization: "User-supplied for PR #306",
  },
  "giant-garden-encounter": {
    sourceFile: "d6294571-6ee0-46e2-81ee-e0524eefe120-37247589-303a-4b1e-a770-360b980522c1-clipboard.png",
    sourceSha256: "cbc25a399df56665c5ec14d3bdafc56d6b726bc480cb24ce4012ce8436293d62",
    derivedSha256: "8726c896b3247ffff1d404412e797a2ac85cba1acab9b0521e09da825fbe9764",
    derivedDimensions: "1423x949",
    authorization: "User-supplied for PR #306",
  },
  "old-lighthouse-encounter": {
    sourceFile: "fd93d49f-eb70-4549-b0e6-258e38d01765-0e9685d8-3fbe-4032-9d48-7e77e57e8169-clipboard.png",
    sourceSha256: "6987ff68be3bd618d4fee1564a7b95b1838b01fffac205fb2d6c41cb3884656d",
    derivedSha256: "445c48582f033eff5c3e4c0f1d1c96d4f721995d0ba6cb1434f280eeda2578f1",
    derivedDimensions: "1479x986",
    authorization: "User-supplied for PR #306",
  },
  "star-ferry-encounter": {
    sourceFile: "e5d4d34d-5d75-4328-84d3-06a0af2218a9-a6eb876a-74d1-49b0-a946-b3d69f786326-clipboard.png",
    sourceSha256: "7b0ee456626ce512ac1f4dbbf4bf8f4011679d278cfd51806753a465090cd89d",
    derivedSha256: "4de56d8cfbfeea737a481e0430b5d1d04e1aefa19db4cf19f6c7934443b06e93",
    derivedDimensions: "1464x976",
    authorization: "User-supplied for PR #306",
  },
};

export const UNWRITTEN_MAP_SHARED_FRAME_ASSET_IDS: readonly UnwrittenMapLocalAssetId[] =
  UNWRITTEN_MAP_LOCAL_ASSET_IDS.filter((id) => id.startsWith("shared-frame-"));
