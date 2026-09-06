import {
  CASCADE_BOARD_SIZE,
  decodeBoard,
  encodeBoard,
  type Board,
  type CascadeStep,
  type Cell,
  type Coordinate,
} from "./alchemistsCascade";

export type CascadePresentationPhase = "settled" | "swapping" | "clearing" | "falling";

export type CascadePresentationTile = {
  id: string;
  cell: Cell;
  row: number;
  column: number;
  fromRow: number;
  fromColumn: number;
  refill: boolean;
};

export type CascadePresentationStep = {
  index: number;
  beforeTiles: CascadePresentationTile[];
  clearingTileIds: string[];
  afterTiles: CascadePresentationTile[];
};

export type CascadePresentationPlan = {
  swapTiles: CascadePresentationTile[];
  steps: CascadePresentationStep[];
  finalTiles: CascadePresentationTile[];
  reshuffled: boolean;
};

export const CASCADE_CLEAR_PULSE_COUNT = 2;
export const CASCADE_PRESENTATION_TIMINGS = {
  standard: { swapMs: 180, clearMs: 440, fallMs: 360 },
  reduced: { swapMs: 1, clearMs: 1, fallMs: 1 },
} as const;

function cloneCell(cell: Cell): Cell {
  return { kind: cell.kind, special: cell.special };
}

export function createCascadePresentationTiles(
  board: Board,
  generation: number,
): CascadePresentationTile[] {
  return board.flatMap((row, rowIndex) =>
    row.map((cell, columnIndex) => ({
      id: `cascade-tile-${generation}-seed-${rowIndex}-${columnIndex}`,
      cell: cloneCell(cell),
      row: rowIndex,
      column: columnIndex,
      fromRow: rowIndex,
      fromColumn: columnIndex,
      refill: false,
    })));
}

export function settleCascadePresentationTiles(
  tiles: CascadePresentationTile[],
): CascadePresentationTile[] {
  return tiles.map((tile) => ({
    ...tile,
    cell: cloneCell(tile.cell),
    fromRow: tile.row,
    fromColumn: tile.column,
    refill: false,
  }));
}

export function cascadePresentationBoard(tiles: CascadePresentationTile[]): Board {
  if (tiles.length !== CASCADE_BOARD_SIZE * CASCADE_BOARD_SIZE) {
    throw new Error("invalid_cascade_presentation_tile_count");
  }
  const board = Array.from({ length: CASCADE_BOARD_SIZE }, () =>
    Array<Cell | null>(CASCADE_BOARD_SIZE).fill(null));
  for (const tile of tiles) {
    if (
      tile.row < 0
      || tile.row >= CASCADE_BOARD_SIZE
      || tile.column < 0
      || tile.column >= CASCADE_BOARD_SIZE
      || board[tile.row][tile.column]
    ) {
      throw new Error("invalid_cascade_presentation_position");
    }
    board[tile.row][tile.column] = cloneCell(tile.cell);
  }
  if (board.some((row) => row.some((cell) => !cell))) {
    throw new Error("incomplete_cascade_presentation_board");
  }
  return board as Board;
}

function tileMatrix(tiles: CascadePresentationTile[]): CascadePresentationTile[][] {
  const matrix = Array.from({ length: CASCADE_BOARD_SIZE }, () =>
    Array<CascadePresentationTile | null>(CASCADE_BOARD_SIZE).fill(null));
  for (const tile of tiles) matrix[tile.row][tile.column] = tile;
  if (matrix.some((row) => row.some((tile) => !tile))) {
    throw new Error("incomplete_cascade_presentation_matrix");
  }
  return matrix as CascadePresentationTile[][];
}

function coordKey(coordinate: Coordinate): string {
  return `${coordinate.row},${coordinate.column}`;
}

function swapPresentationTiles(
  tiles: CascadePresentationTile[],
  from: Coordinate,
  to: Coordinate,
): CascadePresentationTile[] {
  const matrix = tileMatrix(tiles);
  const fromTile = matrix[from.row][from.column];
  const toTile = matrix[to.row][to.column];
  matrix[from.row][from.column] = {
    ...toTile,
    row: from.row,
    column: from.column,
    fromRow: to.row,
    fromColumn: to.column,
  };
  matrix[to.row][to.column] = {
    ...fromTile,
    row: to.row,
    column: to.column,
    fromRow: from.row,
    fromColumn: from.column,
  };
  return matrix.flat();
}

export function buildCascadePresentationPlan(args: {
  initialTiles: CascadePresentationTile[];
  from: Coordinate;
  to: Coordinate;
  steps: CascadeStep[];
  finalBoard: Board;
  generation: number;
}): CascadePresentationPlan {
  const swapTiles = swapPresentationTiles(
    settleCascadePresentationTiles(args.initialTiles),
    args.from,
    args.to,
  );
  if (args.steps[0] && encodeBoard(cascadePresentationBoard(swapTiles)) !== args.steps[0].boardBefore) {
    throw new Error("cascade_presentation_swap_mismatch");
  }

  let currentTiles = settleCascadePresentationTiles(swapTiles);
  const presentationSteps: CascadePresentationStep[] = [];

  for (const step of args.steps) {
    if (encodeBoard(cascadePresentationBoard(currentTiles)) !== step.boardBefore) {
      throw new Error("cascade_presentation_step_mismatch");
    }
    const nextBoard = decodeBoard(step.boardAfter);
    if (!nextBoard) throw new Error("invalid_cascade_presentation_step_board");
    const matrix = tileMatrix(currentTiles);
    const cleared = new Set(step.cleared.map(coordKey));
    const clearingTileIds = step.cleared.map((coordinate) => matrix[coordinate.row][coordinate.column].id);
    const nextTiles: CascadePresentationTile[] = [];

    for (let column = 0; column < CASCADE_BOARD_SIZE; column += 1) {
      const survivors: CascadePresentationTile[] = [];
      for (let row = CASCADE_BOARD_SIZE - 1; row >= 0; row -= 1) {
        if (!cleared.has(`${row},${column}`)) survivors.push(matrix[row][column]);
      }
      const refillCount = CASCADE_BOARD_SIZE - survivors.length;
      for (let row = CASCADE_BOARD_SIZE - 1; row >= 0; row -= 1) {
        const survivor = survivors[CASCADE_BOARD_SIZE - 1 - row];
        if (survivor) {
          nextTiles.push({
            ...survivor,
            cell: cloneCell(nextBoard[row][column]),
            row,
            column,
            fromRow: survivor.row,
            fromColumn: survivor.column,
            refill: false,
          });
        } else {
          nextTiles.push({
            id: `cascade-tile-${args.generation}-step-${step.index}-refill-${row}-${column}`,
            cell: cloneCell(nextBoard[row][column]),
            row,
            column,
            fromRow: row - refillCount,
            fromColumn: column,
            refill: true,
          });
        }
      }
    }

    if (encodeBoard(cascadePresentationBoard(nextTiles)) !== step.boardAfter) {
      throw new Error("cascade_presentation_refill_mismatch");
    }
    presentationSteps.push({
      index: step.index,
      beforeTiles: settleCascadePresentationTiles(currentTiles),
      clearingTileIds,
      afterTiles: nextTiles,
    });
    currentTiles = settleCascadePresentationTiles(nextTiles);
  }

  const finalEncoded = encodeBoard(args.finalBoard);
  const settledEncoded = encodeBoard(cascadePresentationBoard(currentTiles));
  const reshuffled = settledEncoded !== finalEncoded;
  const finalTiles = reshuffled
    ? createCascadePresentationTiles(args.finalBoard, args.generation + 1)
    : currentTiles;

  return {
    swapTiles,
    steps: presentationSteps,
    finalTiles,
    reshuffled,
  };
}
