import { ImageSourcePropType } from "react-native";

export const BOARD_SKIN_IDS = ["family", "tropical", "space"] as const;

export type BoardSkinId = (typeof BOARD_SKIN_IDS)[number];

export type BoardSkinTheme = {
  id: BoardSkinId;
  label: string;
  subtitle: string;
  thumbnailImage?: ImageSourcePropType;
  boardBaseImage?: ImageSourcePropType;
  overlaySnakesLaddersImage?: ImageSourcePropType;
  overlayOpacity?: number;
  overlayInset?: number;
  boardBackground: string;
  boardBorder: string;
  tileLight: string;
  tileDark: string;
  tileBorder: string;
  tileNumber: string;
  ladderColor: string;
  snakeColor: string;
  tokenBackground: string;
  tokenBorder: string;
};

export const DEFAULT_BOARD_SKIN_ID: BoardSkinId = "family";

export const BOARD_SKINS: Record<BoardSkinId, BoardSkinTheme> = {
  family: {
    id: "family",
    label: "Family",
    subtitle: "Warm and clear",
    thumbnailImage: require("../../../assets/boards/family/thumbnail_v1.png"),
    boardBaseImage: require("../../../assets/boards/family/board_base_v1.png"),
    overlaySnakesLaddersImage: require("../../../assets/boards/family/overlay_snakes_ladders_v1.png"),
    overlayOpacity: 1,
    overlayInset: 0,
    boardBackground: "#fff7eb",
    boardBorder: "#f0cc9c",
    tileLight: "#fffdf8",
    tileDark: "#f7ead4",
    tileBorder: "#edd8b8",
    tileNumber: "#5f4b32",
    ladderColor: "#1d7a3a",
    snakeColor: "#9c2f2f",
    tokenBackground: "#ffffff",
    tokenBorder: "#d7b98f",
  },
  tropical: {
    id: "tropical",
    label: "Tropical",
    subtitle: "Fresh and bright",
    thumbnailImage: require("../../../assets/boards/tropical/thumbnail_v3.png"),
    boardBaseImage: require("../../../assets/boards/tropical/board_base_v3.png"),
    overlaySnakesLaddersImage: require("../../../assets/boards/tropical/overlay_snakes_ladders_v3.png"),
    overlayOpacity: 1,
    overlayInset: 0,
    boardBackground: "#e9fbf3",
    boardBorder: "#a3ddbe",
    tileLight: "#f7fff9",
    tileDark: "#dcf6e8",
    tileBorder: "#b6e7cc",
    tileNumber: "#1e5d45",
    ladderColor: "#177a4d",
    snakeColor: "#bf4a22",
    tokenBackground: "#ffffff",
    tokenBorder: "#94caa6",
  },
  space: {
    id: "space",
    label: "Space",
    subtitle: "Deep contrast",
    boardBackground: "#1d2242",
    boardBorder: "#4d588f",
    tileLight: "#2a3159",
    tileDark: "#23284b",
    tileBorder: "#4f5b93",
    tileNumber: "#e8efff",
    ladderColor: "#6de8a5",
    snakeColor: "#ff7f8f",
    tokenBackground: "#131833",
    tokenBorder: "#6472b5",
  },
};

export function isBoardSkinId(value: string | null | undefined): value is BoardSkinId {
  return Boolean(value && BOARD_SKIN_IDS.includes(value as BoardSkinId));
}
