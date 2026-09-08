// Local asset manifest for The Unwritten Map's presentation layer.
//
// Authorized focal art currently covers all encounters, Mossmere/frog-parliament,
// Whisper Orchard choices, and Lantern Fair results, alongside shared cartographic
// framing chrome. Every other choice and result remains an explicitly
// missing raster commissioning slot (see unwrittenMapPresentationContract.ts). This module
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
  "whisper-orchard-encounter": "assets/games/unwritten-map/illustrations/sunmeadow/whisper-orchard/whisper-orchard-encounter.webp",
  "whisper-orchard-choice-call-light": "assets/games/unwritten-map/illustrations/sunmeadow/whisper-orchard/whisper-orchard-choice-call-light.webp",
  "whisper-orchard-choice-trail-light": "assets/games/unwritten-map/illustrations/sunmeadow/whisper-orchard/whisper-orchard-choice-trail-light.webp",
  "whisper-orchard-choice-decode-trees": "assets/games/unwritten-map/illustrations/sunmeadow/whisper-orchard/whisper-orchard-choice-decode-trees.webp",
  "whisper-orchard-choice-taste-fruit": "assets/games/unwritten-map/illustrations/sunmeadow/whisper-orchard/whisper-orchard-choice-taste-fruit.webp",
  "clockwork-bridge-encounter": "assets/games/unwritten-map/illustrations/ironwood/clockwork-bridge/clockwork-bridge-encounter.webp",
  "cloud-shepherd-encounter": "assets/games/unwritten-map/illustrations/ironwood/cloud-shepherd/cloud-shepherd-encounter.webp",
  "mirror-marsh-encounter": "assets/games/unwritten-map/illustrations/mossmere/mirror-marsh/mirror-marsh-encounter.webp",
  "rain-camp-encounter": "assets/games/unwritten-map/illustrations/westreach/rain-camp/rain-camp-encounter.webp",
  "paper-dragon-encounter": "assets/games/unwritten-map/illustrations/westreach/paper-dragon/paper-dragon-encounter.webp",
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
  "clockwork-bridge-encounter": {
    sourceFile: "14e6145f-c501-457e-b5c3-728a7fa8ae1d-e414d6fb-2c40-4268-998c-28658fc346cb-clipboard.png",
    sourceSha256: "d5db024902530a630b4b4915de00abf71dfb00994dd4eb6c781c7c8747cc77ff",
    derivedSha256: "017e95d59c74753fc74446e0316e38a4780ca12371c849c17eb654583c4b2de7",
    derivedDimensions: "1418x945",
    authorization: "User-supplied for PR #306",
  },
  "cloud-shepherd-encounter": {
    sourceFile: "b3ea9f57-fbd8-4344-bd46-3fc24e3a79c0-eb5fbca4-1ec4-4e0d-9419-154633bfc2bf-clipboard.png",
    sourceSha256: "dee3eb79771fe639eb2e2bb4f0cd85007c3300ee6d55545ab62318bf1162fc89",
    derivedSha256: "853f75983848a79f04f72b7dade2ba89f72ce3cafa2c83752a5ed040742a0286",
    derivedDimensions: "1466x977",
    authorization: "User-supplied for PR #306",
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
