import type { ImageSourcePropType } from "react-native";

export const ALCHEMISTS_CASCADE_WHISPER_ARTWORK: ImageSourcePropType = require(
  "../../assets/games/alchemists-cascade/first-whisper.webp",
);

export const ALCHEMISTS_CASCADE_WHISPER_OPTION_ARTWORK: Record<string, ImageSourcePropType> = {
  "hearth-song": require("../../assets/games/alchemists-cascade/first-whisper-hearth-song.webp"),
  "lunar-proof": require("../../assets/games/alchemists-cascade/first-whisper-lunar-proof.webp"),
  "wild-distillation": require("../../assets/games/alchemists-cascade/first-whisper-wild-distillation.webp"),
};

export const ALCHEMISTS_CASCADE_WHISPER_OPTION_ICONS: Record<
  string,
  "star-four-points" | "moon-waning-crescent" | "rhombus-outline"
> = {
  "hearth-song": "star-four-points",
  "lunar-proof": "moon-waning-crescent",
  "wild-distillation": "rhombus-outline",
};

export const ALCHEMISTS_CASCADE_WHISPER_ARTWORK_SIZE = {
  width: 1672,
  height: 941,
} as const;

export const ALCHEMISTS_CASCADE_WHISPER_BOUNDS = {
  back: { left: 29, top: 22, width: 126, height: 48 },
  cards: [
    { left: 396, top: 248, width: 278, height: 489 },
    { left: 699, top: 248, width: 276, height: 489 },
    { left: 1002, top: 248, width: 276, height: 489 },
  ],
  fate: { left: 565, top: 769, width: 543, height: 58 },
} as const;

type Bounds = { left: number; top: number; width: number; height: number };

export type AlchemistsCascadeWhisperLayout = {
  mode: "cinematic" | "stacked";
  stage: { width: number; height: number };
  compact: boolean;
  header: { width: number; height: number; imageHeight: number; imageLeft: number };
  back: Bounds;
  cards: Bounds[];
  fate: Bounds;
};

function scaleBounds(bounds: Bounds, scale: number): Bounds {
  return {
    left: bounds.left * scale,
    top: bounds.top * scale,
    width: bounds.width * scale,
    height: bounds.height * scale,
  };
}

export function computeAlchemistsCascadeWhisperLayout(
  viewportWidth: number,
  viewportHeight: number,
): AlchemistsCascadeWhisperLayout {
  const safeWidth = Math.max(1, viewportWidth);
  const safeHeight = Math.max(1, viewportHeight);
  const aspectRatio = ALCHEMISTS_CASCADE_WHISPER_ARTWORK_SIZE.width
    / ALCHEMISTS_CASCADE_WHISPER_ARTWORK_SIZE.height;
  const containedWidth = Math.min(safeWidth, safeHeight * aspectRatio);
  const mode = safeWidth >= 1000 && safeWidth / safeHeight >= 1.35
    ? "cinematic"
    : "stacked";
  const stageWidth = mode === "cinematic" ? containedWidth : safeWidth;
  const stageHeight = stageWidth / aspectRatio;
  const scale = stageWidth / ALCHEMISTS_CASCADE_WHISPER_ARTWORK_SIZE.width;
  const headerImageWidth = Math.max(safeWidth, 760);
  const headerImageHeight = headerImageWidth / aspectRatio;

  return {
    mode,
    stage: { width: stageWidth, height: stageHeight },
    compact: stageWidth < 1500,
    header: {
      width: safeWidth,
      height: headerImageHeight * (118 / ALCHEMISTS_CASCADE_WHISPER_ARTWORK_SIZE.height),
      imageHeight: headerImageHeight,
      imageLeft: (safeWidth - headerImageWidth) / 2,
    },
    back: scaleBounds(ALCHEMISTS_CASCADE_WHISPER_BOUNDS.back, scale),
    cards: ALCHEMISTS_CASCADE_WHISPER_BOUNDS.cards.map((bounds) => scaleBounds(bounds, scale)),
    fate: scaleBounds(ALCHEMISTS_CASCADE_WHISPER_BOUNDS.fate, scale),
  };
}
