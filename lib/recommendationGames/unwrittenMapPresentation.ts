import {
  UNWRITTEN_MAP_HEIGHT,
  UNWRITTEN_MAP_WIDTH,
  cameraOrigin,
  type MapPosition,
} from "./unwrittenMap";

export type UnwrittenMapArtworkFrame = {
  origin: MapPosition;
  left: number;
  top: number;
  width: number;
  height: number;
};

export function unwrittenMapArtworkFrame(
  position: MapPosition,
  columns: number,
  rows: number,
  tileSize: number,
): UnwrittenMapArtworkFrame {
  const origin = cameraOrigin(position, columns, rows);
  return {
    origin,
    left: -origin.x * tileSize,
    top: -origin.y * tileSize,
    width: UNWRITTEN_MAP_WIDTH * tileSize,
    height: UNWRITTEN_MAP_HEIGHT * tileSize,
  };
}
