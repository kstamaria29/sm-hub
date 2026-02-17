export type WordMasterBonusLabel = "TW" | "DW" | "TL" | "DL" | null;

export type WordMasterSquareBonus = {
  label: WordMasterBonusLabel;
  letterMultiplier: number;
  wordMultiplier: number;
};

export function getWordMasterSquareBonus(
  boardSize: number,
  row: number,
  col: number,
): WordMasterSquareBonus {
  if (boardSize !== 11) {
    return { label: null, letterMultiplier: 1, wordMultiplier: 1 };
  }

  const r = Math.min(row, boardSize + 1 - row);
  const c = Math.min(col, boardSize + 1 - col);

  const isTW = (r === 1 && c === 1) || (r === 1 && c === 6) || (r === 6 && c === 1);
  if (isTW) {
    return { label: "TW", letterMultiplier: 1, wordMultiplier: 3 };
  }

  const isDW = r === c && r >= 2 && r <= 6;
  if (isDW) {
    return { label: "DW", letterMultiplier: 1, wordMultiplier: 2 };
  }

  const isTL =
    (r === 2 && c === 6) ||
    (r === 6 && c === 2) ||
    (r === 3 && c === 5) ||
    (r === 5 && c === 3);
  if (isTL) {
    return { label: "TL", letterMultiplier: 3, wordMultiplier: 1 };
  }

  const isDL =
    (r === 1 && c === 4) ||
    (r === 4 && c === 1) ||
    (r === 2 && c === 3) ||
    (r === 3 && c === 2) ||
    (r === 2 && c === 5) ||
    (r === 5 && c === 2) ||
    (r === 4 && c === 6) ||
    (r === 6 && c === 4);

  if (isDL) {
    return { label: "DL", letterMultiplier: 2, wordMultiplier: 1 };
  }

  return { label: null, letterMultiplier: 1, wordMultiplier: 1 };
}

