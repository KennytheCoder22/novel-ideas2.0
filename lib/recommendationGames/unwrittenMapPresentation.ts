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

export type UnwrittenMapViewportLayout = {
  columns: number;
  rows: number;
  tileSize: number;
  compact: boolean;
  viewportWidth: number;
  viewportHeight: number;
};

export function unwrittenMapViewportLayout(width: number, height: number): UnwrittenMapViewportLayout {
  const columns = width < 520 ? 9 : width < 900 ? 11 : width < 1500 ? 13 : 15;
  const rows = height < 700 ? 7 : height < 900 ? 9 : 11;
  const tileSize = Math.max(28, Math.min(54, Math.floor((Math.min(width, 920) - 40) / columns)));
  return {
    columns,
    rows,
    tileSize,
    compact: width < 700,
    viewportWidth: columns * tileSize + 8,
    viewportHeight: rows * tileSize + 8,
  };
}

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
