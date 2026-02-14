export type JumpType = "ladder" | "snake";

export type BoardCell = {
  tile: number;
  row: number;
  column: number;
  jumpType: JumpType | null;
  jumpTo: number | null;
};

export const BOARD_TILE_COUNT = 100;
export const BOARD_ROW_COUNT = 10;
export const BOARD_COLUMN_COUNT = 10;

export const CLASSIC_LADDERS: readonly [number, number][] = [
  [1, 38],
  [4, 14],
  [9, 31],
  [21, 42],
  [28, 84],
  [36, 44],
  [51, 67],
  [71, 91],
  [80, 100],
];

export const CLASSIC_SNAKES: readonly [number, number][] = [
  [16, 6],
  [47, 26],
  [49, 11],
  [56, 53],
  [62, 19],
  [64, 60],
  [87, 24],
  [93, 73],
  [95, 75],
  [98, 78],
];

const ladderMap = new Map(CLASSIC_LADDERS);
const snakeMap = new Map(CLASSIC_SNAKES);

export function tileToBoardCoordinates(tile: number): { row: number; column: number } {
  if (tile < 1 || tile > BOARD_TILE_COUNT) {
    throw new Error(`Tile out of range: ${tile}`);
  }

  const rowFromBottom = Math.floor((tile - 1) / BOARD_COLUMN_COUNT);
  const indexInRow = (tile - 1) % BOARD_COLUMN_COUNT;
  const row = BOARD_ROW_COUNT - 1 - rowFromBottom;
  const isLeftToRight = rowFromBottom % 2 === 0;
  const column = isLeftToRight ? indexInRow : BOARD_COLUMN_COUNT - 1 - indexInRow;

  return { row, column };
}

export function buildClassicBoardCells(): BoardCell[] {
  const cells: BoardCell[] = [];

  for (let tile = 1; tile <= BOARD_TILE_COUNT; tile += 1) {
    const { row, column } = tileToBoardCoordinates(tile);
    const ladderTo = ladderMap.get(tile) ?? null;
    const snakeTo = snakeMap.get(tile) ?? null;

    cells.push({
      tile,
      row,
      column,
      jumpType: ladderTo ? "ladder" : snakeTo ? "snake" : null,
      jumpTo: ladderTo ?? snakeTo ?? null,
    });
  }

  return cells.sort((left, right) => {
    if (left.row !== right.row) {
      return left.row - right.row;
    }

    return left.column - right.column;
  });
}
