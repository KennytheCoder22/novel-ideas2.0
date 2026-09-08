// Region registry for The Unwritten Map's domain presentation metadata.
//
// This module is pure data + pure functions (no fs/network access, no React
// Native dependency) so it is safe to import from any runtime: the app
// bundle, Node scripts, or tests. It defines the bounded set of regions the
// game world is divided into, along with each region's palette and the
// canonical/fallback motif vocabulary used to brief focal illustrations and
// keep outer framing premise-appropriate and visually distinct by region.

export const UNWRITTEN_MAP_REGION_IDS = [
  "sunmeadow",
  "ironwood",
  "mossmere",
  "westreach",
  "ashpeak",
  "tideglass",
] as const;

export type UnwrittenMapRegionId = typeof UNWRITTEN_MAP_REGION_IDS[number];

export type UnwrittenMapPaletteSlot = "primary" | "accent" | "fallback";

export const UNWRITTEN_MAP_PALETTE_SLOTS: readonly UnwrittenMapPaletteSlot[] = [
  "primary",
  "accent",
  "fallback",
];

/** Bounded palette identity: one per region/slot combination (18 total). */
export type UnwrittenMapPaletteId = `${UnwrittenMapRegionId}_${UnwrittenMapPaletteSlot}`;

export type UnwrittenMapRegionDefinition = {
  id: UnwrittenMapRegionId;
  name: string;
  /** Hex colors keyed by palette slot; every region defines all three slots. */
  paletteHex: Record<UnwrittenMapPaletteSlot, string>;
  /**
   * The canonical, region-specific motif vocabulary used by art briefs and
   * shared outer framing. Tokens must never be shared between regions (enforced by
   * the validator) so each region reads as visually distinct.
   */
  canonicalMotifTokens: readonly string[];
  /**
   * A single always-safe token included whenever a more specific motif
   * cannot be determined. Also unique per region.
   */
  fallbackMotifToken: string;
};

export const UNWRITTEN_MAP_REGION_REGISTRY: Record<UnwrittenMapRegionId, UnwrittenMapRegionDefinition> = {
  sunmeadow: {
    id: "sunmeadow",
    name: "Sunmeadow Vale",
    paletteHex: { primary: "#dca84e", accent: "#7fb460", fallback: "#f0dda6" },
    canonicalMotifTokens: [
      "wildflowers",
      "lantern-glow",
      "orchard-blossom",
      "meadow-grass",
      "golden-light",
      "striped-pavilion",
    ],
    fallbackMotifToken: "meadow-vista",
  },
  ironwood: {
    id: "ironwood",
    name: "Ironwood Heights",
    paletteHex: { primary: "#bb7b50", accent: "#8ba8b1", fallback: "#e4d3b8" },
    canonicalMotifTokens: [
      "brass-gears",
      "timber-beams",
      "windmill-blades",
      "highland-pasture",
      "cloud-flock",
      "forge-glow",
    ],
    fallbackMotifToken: "ironwood-vista",
  },
  mossmere: {
    id: "mossmere",
    name: "Mossmere Wetlands",
    paletteHex: { primary: "#628e87", accent: "#76a558", fallback: "#3f5c52" },
    // Required canonical vocabulary for Mossmere per the domain contract.
    canonicalMotifTokens: [
      "reeds",
      "frogs",
      "lily-pads",
      "marsh-water",
      "mist",
      "wetland-flora",
    ],
    fallbackMotifToken: "wetland-vista",
  },
  westreach: {
    id: "westreach",
    name: "Westreach Hills",
    paletteHex: { primary: "#ad7ab2", accent: "#cb6651", fallback: "#e9d9e6" },
    canonicalMotifTokens: [
      "storm-clouds",
      "canvas-tents",
      "kite-string",
      "rolling-hills",
      "rain-sheets",
      "wagon-wheels",
    ],
    fallbackMotifToken: "westreach-vista",
  },
  ashpeak: {
    id: "ashpeak",
    name: "Ashpeak Rise",
    paletteHex: { primary: "#bd6544", accent: "#779150", fallback: "#e3c9a9" },
    canonicalMotifTokens: [
      "blue-embers",
      "ash-drift",
      "vine-stairway",
      "cinder-stone",
      "lantern-books",
      "peach-cloud-light",
    ],
    fallbackMotifToken: "ashpeak-vista",
  },
  tideglass: {
    id: "tideglass",
    name: "Tideglass Coast",
    paletteHex: { primary: "#5f9fb0", accent: "#7875b8", fallback: "#d8e6e6" },
    canonicalMotifTokens: [
      "sea-glass",
      "lighthouse-beam",
      "star-fall",
      "tide-foam",
      "ferry-lanterns",
      "night-tide",
    ],
    fallbackMotifToken: "tideglass-vista",
  },
};

export function unwrittenMapPaletteId(
  regionId: UnwrittenMapRegionId,
  slot: UnwrittenMapPaletteSlot,
): UnwrittenMapPaletteId {
  return `${regionId}_${slot}`;
}

export function unwrittenMapPaletteHex(paletteId: UnwrittenMapPaletteId): string | null {
  const [regionId, slot] = splitPaletteId(paletteId);
  if (!regionId || !slot) return null;
  return UNWRITTEN_MAP_REGION_REGISTRY[regionId].paletteHex[slot];
}

function splitPaletteId(
  paletteId: string,
): [UnwrittenMapRegionId | null, UnwrittenMapPaletteSlot | null] {
  for (const regionId of UNWRITTEN_MAP_REGION_IDS) {
    for (const slot of UNWRITTEN_MAP_PALETTE_SLOTS) {
      if (paletteId === `${regionId}_${slot}`) return [regionId, slot];
    }
  }
  return [null, null];
}

/** True when `token` is part of `regionId`'s canonical vocabulary or its fallback token. */
export function unwrittenMapIsCanonicalMotifToken(regionId: UnwrittenMapRegionId, token: string): boolean {
  const definition = UNWRITTEN_MAP_REGION_REGISTRY[regionId];
  return definition.canonicalMotifTokens.includes(token) || definition.fallbackMotifToken === token;
}

/** The single region (if any) that owns `token` in its canonical/fallback vocabulary. */
export function unwrittenMapRegionOwningMotifToken(token: string): UnwrittenMapRegionId | null {
  for (const regionId of UNWRITTEN_MAP_REGION_IDS) {
    if (unwrittenMapIsCanonicalMotifToken(regionId, token)) return regionId;
  }
  return null;
}
