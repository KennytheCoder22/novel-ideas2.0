import type { ImageSourcePropType } from "react-native";

export const ALCHEMISTS_CASCADE_TITLE_ARTWORK: ImageSourcePropType = require(
  "../../assets/games/alchemists-cascade/title-screen.webp",
);

export const ALCHEMISTS_CASCADE_TITLE_ARTWORK_SIZE = {
  width: 1672,
  height: 941,
} as const;

export const ALCHEMISTS_CASCADE_TITLE_CONTROL_BOUNDS = {
  primary: { left: 619, top: 553, width: 433, height: 78 },
  help: { left: 638, top: 653, width: 123, height: 53 },
  memory: { left: 770, top: 653, width: 260, height: 53 },
} as const;

export const ALCHEMISTS_CASCADE_MOBILE_CROP_BOTTOM = 535;

type ControlLayout = {
  left: number;
  top: number;
  width: number;
  height: number;
};

export type AlchemistsCascadeTitleArtworkLayout = {
  mode: "cinematic" | "compact" | "mobile";
  stage: { width: number; height: number };
  imageHeight: number;
  controls: {
    primary: ControlLayout;
    help: ControlLayout;
    memory: ControlLayout;
  };
};

function scaleControl(
  control: ControlLayout,
  scale: number,
  stageWidth: number,
  minimumWidth: number,
): ControlLayout {
  const rawWidth = control.width * scale;
  const rawHeight = control.height * scale;
  const width = Math.min(stageWidth, Math.max(rawWidth, minimumWidth));
  const height = Math.max(rawHeight, 44);

  return {
    left: Math.max(0, Math.min(
      stageWidth - width,
      control.left * scale + rawWidth / 2 - width / 2,
    )),
    top: control.top * scale + rawHeight / 2 - height / 2,
    width,
    height,
  };
}

export function computeAlchemistsCascadeTitleArtworkLayout(
  viewportWidth: number,
  viewportHeight: number,
): AlchemistsCascadeTitleArtworkLayout {
  const safeWidth = Math.max(1, viewportWidth);
  const safeHeight = Math.max(1, viewportHeight);
  const aspectRatio = ALCHEMISTS_CASCADE_TITLE_ARTWORK_SIZE.width
    / ALCHEMISTS_CASCADE_TITLE_ARTWORK_SIZE.height;
  const containedWidth = Math.min(safeWidth, safeHeight * aspectRatio);
  const mode = safeWidth < 700 || safeWidth / safeHeight < 1.15
    ? "mobile"
    : containedWidth < 900
      ? "compact"
      : "cinematic";
  const stageWidth = mode === "cinematic" ? containedWidth : safeWidth;
  const imageHeight = stageWidth / aspectRatio;
  const stageHeight = mode === "mobile"
    ? imageHeight * (ALCHEMISTS_CASCADE_MOBILE_CROP_BOTTOM / ALCHEMISTS_CASCADE_TITLE_ARTWORK_SIZE.height)
    : imageHeight;
  const scale = stageWidth / ALCHEMISTS_CASCADE_TITLE_ARTWORK_SIZE.width;
  const primary = scaleControl(
    ALCHEMISTS_CASCADE_TITLE_CONTROL_BOUNDS.primary,
    scale,
    stageWidth,
    44,
  );
  const help = scaleControl(
    ALCHEMISTS_CASCADE_TITLE_CONTROL_BOUNDS.help,
    scale,
    stageWidth,
    44,
  );
  const memory = scaleControl(
    ALCHEMISTS_CASCADE_TITLE_CONTROL_BOUNDS.memory,
    scale,
    stageWidth,
    44,
  );
  const minimumLinkTop = primary.top + primary.height + 2;
  if (mode === "compact" && help.top < minimumLinkTop) {
    const offset = minimumLinkTop - help.top;
    help.top += offset;
    memory.top += offset;
  }

  return {
    mode,
    stage: { width: stageWidth, height: stageHeight },
    imageHeight,
    controls: { primary, help, memory },
  };
}
