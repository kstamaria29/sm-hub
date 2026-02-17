import { useCallback, useEffect, useRef, useState } from "react";
import {
  Image,
  LayoutChangeEvent,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
  useWindowDimensions,
} from "react-native";
import { useIsFocused } from "@react-navigation/native";
import LottieView from "lottie-react-native";
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming,
} from "react-native-reanimated";

import { avatarExpressionLabel } from "../features/avatar/avatarPack";
import { useGamesHub } from "../features/games/useGamesHub";
import { buildClassicBoardCells } from "../features/game/board";
import { BOARD_SKIN_IDS, BOARD_SKINS } from "../features/game/boardSkins";
import { GameEventView, useFamilyGame } from "../features/game/useFamilyGame";
import { Json } from "../lib/database.types";
import { AppText } from "../ui/primitives/AppText";
import { IconButton } from "../ui/primitives/IconButton";
import { InfoCard } from "../ui/primitives/InfoCard";
import { PrimaryButton } from "../ui/primitives/PrimaryButton";
import { Screen } from "../ui/primitives/Screen";
import { Tag } from "../ui/primitives/Tag";
import { useTheme } from "../ui/theme/ThemeProvider";
import { WordMasterScreen } from "./WordMasterScreen";
import { CueClashScreen } from "./CueClashScreen";

const BOARD_CELLS = buildClassicBoardCells();
const BOARD_ROWS = Array.from({ length: 10 }, (_, rowIndex) =>
  BOARD_CELLS.slice(rowIndex * 10, rowIndex * 10 + 10),
);
const TILE_COORDINATES_BY_TILE = new Map(BOARD_CELLS.map((cell) => [cell.tile, { row: cell.row, column: cell.column }]));

type LottieMoment = "dice" | "ladder" | "snake" | "big_snake";

const LOTTIE_SOURCE_BY_MOMENT: Record<LottieMoment, any> = {
  dice: require("../../assets/lottie/dice_roll.json"),
  ladder: require("../../assets/lottie/ladder.json"),
  snake: require("../../assets/lottie/snake.json"),
  big_snake: require("../../assets/lottie/big_snake.json"),
};

type RollMoveTransition = "none" | "ladder" | "snake" | "big_snake";

type RollMoveAnimation = {
  eventId: number;
  actorUserId: string;
  dice: number;
  fromTile: number;
  landingTile: number;
  toTile: number;
  transition: RollMoveTransition;
};

function asJsonObject(value: Json): Record<string, Json> | null {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, Json>;
  }

  return null;
}

function toStringValue(value: Json | undefined): string | null {
  if (typeof value === "string" && value.trim().length > 0) {
    return value;
  }

  return null;
}

function toNumberValue(value: Json | undefined): number | null {
  if (typeof value === "number") {
    return value;
  }

  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    if (!Number.isNaN(parsed)) {
      return parsed;
    }
  }

  return null;
}

function isValidTile(value: number): boolean {
  return Number.isInteger(value) && value >= 1 && value <= 100;
}

function resolveTileCenter(
  tile: number,
  boardSize: number,
  biasY = 0.72,
): { x: number; y: number } | null {
  const coordinates = TILE_COORDINATES_BY_TILE.get(tile);
  if (!coordinates || boardSize <= 0) {
    return null;
  }

  const cellSize = boardSize / 10;
  return {
    x: (coordinates.column + 0.5) * cellSize,
    y: (coordinates.row + biasY) * cellSize,
  };
}

function parseRollMoveAnimation(event: GameEventView): RollMoveAnimation | null {
  if (event.eventType !== "roll_move") {
    return null;
  }

  if (!event.createdBy) {
    return null;
  }

  const payload = asJsonObject(event.payload);
  if (!payload) {
    return null;
  }

  const dice = toNumberValue(payload.dice);
  const fromTile = toNumberValue(payload.from_tile);
  const landingTile = toNumberValue(payload.landing_tile);
  const toTile = toNumberValue(payload.to_tile);
  const transition = (toStringValue(payload.transition) ?? "none") as RollMoveTransition;

  if (dice === null || fromTile === null || landingTile === null || toTile === null) {
    return null;
  }

  if (!["none", "ladder", "snake", "big_snake"].includes(transition)) {
    return null;
  }

  if (!isValidTile(fromTile) || !isValidTile(landingTile) || !isValidTile(toTile) || dice < 1 || dice > 6) {
    return null;
  }

  return {
    eventId: event.id,
    actorUserId: event.createdBy,
    dice,
    fromTile,
    landingTile,
    toTile,
    transition,
  };
}

function formatEventSummary(event: GameEventView): string {
  const payload = asJsonObject(event.payload);
  if (!payload) {
    return event.eventType;
  }

  if (event.eventType === "game_started") {
    return "Game started";
  }

  if (event.eventType === "roll_move") {
    const dice = toNumberValue(payload.dice);
    const fromTile = toNumberValue(payload.from_tile);
    const toTile = toNumberValue(payload.to_tile);
    const transition = toStringValue(payload.transition) ?? "none";
    if (dice !== null && fromTile !== null && toTile !== null) {
      return `Rolled ${dice}: ${fromTile} -> ${toTile} (${transition})`;
    }
  }

  return event.eventType;
}

type BannerTone = "neutral" | "success" | "danger";

function resolveEventBanner(
  event: GameEventView | null,
  playerNameById: Map<string, string>,
): { id: number; text: string; tone: BannerTone } | null {
  if (!event) {
    return null;
  }

  const payload = asJsonObject(event.payload);
  if (!payload) {
    return null;
  }

  if (event.eventType === "game_started") {
    return {
      id: event.id,
      text: "Game started. Good luck!",
      tone: "neutral",
    };
  }

  if (event.eventType !== "roll_move") {
    return null;
  }

  const actorName = event.createdBy ? playerNameById.get(event.createdBy) ?? `User ${event.createdBy.slice(0, 8)}` : "Player";
  const dice = toNumberValue(payload.dice);
  const fromTile = toNumberValue(payload.from_tile);
  const toTile = toNumberValue(payload.to_tile);
  const transition = toStringValue(payload.transition) ?? "none";
  const status = toStringValue(payload.status);
  const winnerUserId = toStringValue(payload.winner_user_id);

  if (status === "finished" && winnerUserId) {
    const winnerName = playerNameById.get(winnerUserId) ?? `User ${winnerUserId.slice(0, 8)}`;
    return {
      id: event.id,
      text: `${winnerName} wins the game!`,
      tone: "success",
    };
  }

  if (dice !== null && fromTile !== null && toTile !== null) {
    if (transition === "ladder") {
      return {
        id: event.id,
        text: `${actorName} rolled ${dice} and climbed a ladder to ${toTile}.`,
        tone: "success",
      };
    }

    if (transition === "snake" || transition === "big_snake") {
      return {
        id: event.id,
        text: `${actorName} rolled ${dice} and slid to ${toTile}.`,
        tone: "danger",
      };
    }

    return {
      id: event.id,
      text: `${actorName} rolled ${dice}: ${fromTile} -> ${toTile}.`,
      tone: "neutral",
    };
  }

  return {
    id: event.id,
    text: formatEventSummary(event),
    tone: "neutral",
  };
}

type GamesView = "hub" | "snakes" | "word-master" | "cue-clash";

function GamesHubScreen({
  onOpenSnakes,
  onOpenWordMaster,
  onOpenCueClash,
}: {
  onOpenSnakes: () => void;
  onOpenWordMaster: () => void;
  onOpenCueClash: () => void;
}) {
  const { colors, radius, spacing } = useTheme();
  const hub = useGamesHub();

  const snakesTag = hub.snakes.status === "active" ? (hub.snakes.isMyTurn ? "Your turn" : "Active") : "No game";
  const snakesTone = hub.snakes.status === "active" ? (hub.snakes.isMyTurn ? "accent" : "success") : "neutral";

  const wordTag = hub.wordMaster.status === "active" ? (hub.wordMaster.isMyTurn ? "Your turn" : "Active") : "No game";
  const wordTone = hub.wordMaster.status === "active" ? (hub.wordMaster.isMyTurn ? "accent" : "success") : "neutral";

  const cueTag = hub.cueClash.status === "active" ? (hub.cueClash.isMyTurn ? "Your turn" : "Active") : "No game";
  const cueTone = hub.cueClash.status === "active" ? (hub.cueClash.isMyTurn ? "accent" : "success") : "neutral";

  return (
    <Screen padded={false}>
      <ScrollView
        contentContainerStyle={[
          styles.content,
          {
            gap: spacing.md,
            paddingHorizontal: spacing.lg,
            paddingTop: spacing.md,
            paddingBottom: spacing.xl,
          },
        ]}
        refreshControl={<RefreshControl refreshing={hub.loading} onRefresh={() => void hub.refresh()} />}
      >
        <AppText variant="heading">Games</AppText>

        {hub.error ? (
          <InfoCard>
            <AppText variant="title">Games Status</AppText>
            <AppText muted>{hub.error}</AppText>
          </InfoCard>
        ) : null}

        <InfoCard>
          <View style={[styles.hubCardHeader, { gap: spacing.sm }]}>
            <View style={styles.hubCardTitle}>
              <AppText variant="title">Snakes & Ladders</AppText>
              <AppText muted>Race to 100. Snakes pull you down, ladders lift you up.</AppText>
            </View>
            <Tag tone={snakesTone} label={snakesTag} />
          </View>

          {hub.snakes.status === "active" ? (
            <AppText muted>Turn: {hub.snakes.currentTurnName ?? "—"}</AppText>
          ) : (
            <AppText muted>No active game yet.</AppText>
          )}

          <PrimaryButton onPress={onOpenSnakes} disabled={!hub.configured || hub.loading}>
            {hub.snakes.status === "active" ? "Continue" : "Open"}
          </PrimaryButton>
        </InfoCard>

        <InfoCard>
          <View style={[styles.hubCardHeader, { gap: spacing.sm }]}>
            <View style={styles.hubCardTitle}>
              <AppText variant="title">Word Master</AppText>
              <AppText muted>Scrabble-style word battles. First move crosses the center star.</AppText>
            </View>
            <Tag tone={wordTone} label={wordTag} />
          </View>

          {hub.wordMaster.status === "active" ? (
            <AppText muted>Turn: {hub.wordMaster.currentTurnName ?? "—"}</AppText>
          ) : (
            <AppText muted>No active game yet.</AppText>
          )}

          <PrimaryButton tone="accent" onPress={onOpenWordMaster} disabled={!hub.configured || hub.loading}>
            {hub.wordMaster.status === "active" ? "Continue" : "Open"}
          </PrimaryButton>
        </InfoCard>

        <InfoCard>
          <View style={[styles.hubCardHeader, { gap: spacing.sm }]}>
            <View style={styles.hubCardTitle}>
              <AppText variant="title">Cue Clash</AppText>
              <AppText muted>8-ball pool with server-authoritative physics. 2 players max.</AppText>
            </View>
            <Tag tone={cueTone} label={cueTag} />
          </View>

          {hub.cueClash.status === "active" ? (
            <AppText muted>Turn: {hub.cueClash.currentTurnName ?? "â€”"}</AppText>
          ) : (
            <AppText muted>No active game yet.</AppText>
          )}

          <PrimaryButton tone="primary" onPress={onOpenCueClash} disabled={!hub.configured || hub.loading}>
            {hub.cueClash.status === "active" ? "Continue" : "Open"}
          </PrimaryButton>
        </InfoCard>

        <View style={[styles.hubFooter, { borderColor: colors.border, borderRadius: radius.md }]}>
          <AppText variant="caption" muted>
            Tip: Some games support 1-player admin testing while we polish multiplayer.
          </AppText>
        </View>
      </ScrollView>
    </Screen>
  );
}

function SnakesAndLaddersScreen({ onBack }: { onBack: () => void }) {
  const { colors, spacing } = useTheme();
  const { width, height } = useWindowDimensions();
  const isFocused = useIsFocused();
  const gameState = useFamilyGame();
  const boardSkin = BOARD_SKINS[gameState.boardSkinId];
  const isLandscape = width > height;
  const isNarrowPhone = !isLandscape && width < 390;
  const boardScreenHorizontalPadding = isNarrowPhone ? spacing.sm : spacing.md;
  const showJumpTextOnTiles = !isNarrowPhone;
  const showOverflowTileCount = !isNarrowPhone;
  const maxVisibleTileTokens = isNarrowPhone ? 2 : 3;
  const hasBoardBaseArt = Boolean(boardSkin.boardBaseImage);
  const boardOverlayOpacity = boardSkin.overlayOpacity ?? 0.72;
  const boardOverlayInset = boardSkin.overlayInset ?? 0;
  const [selectedPlayerIds, setSelectedPlayerIds] = useState<string[]>([]);
  const [boardSize, setBoardSize] = useState(0);
  const [overlayTokenSize, setOverlayTokenSize] = useState(18);
  const [activeMoment, setActiveMoment] = useState<{ kind: LottieMoment; key: string; label?: string } | null>(null);
  const [animatingActor, setAnimatingActor] = useState<{
    userId: string;
    playerOrder: number;
    avatarUrl: string | null;
  } | null>(null);

  const boardSizeShared = useSharedValue(0);
  const cameraScale = useSharedValue(1);
  const cameraFocusX = useSharedValue(0);
  const cameraFocusY = useSharedValue(0);
  const tokenCenterX = useSharedValue(0);
  const tokenCenterY = useSharedValue(0);
  const tokenScale = useSharedValue(1);
  const tokenOpacity = useSharedValue(0);

  const isFocusedRef = useRef(isFocused);
  const cancelledRef = useRef(false);
  const mountedRef = useRef(true);
  const ignoreExistingRollMovesRef = useRef(true);
  const lastEnqueuedRollMoveIdRef = useRef(0);
  const rollMoveQueueRef = useRef<RollMoveAnimation[]>([]);
  const isAnimatingRef = useRef(false);
  const activeAwaitCancelRef = useRef<(() => void) | null>(null);
  const momentResolveRef = useRef<(() => void) | null>(null);
  const momentTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    isFocusedRef.current = isFocused;
  }, [isFocused]);

  useEffect(() => {
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const resolveMoment = useCallback(() => {
    const finalize = momentResolveRef.current;
    if (finalize) {
      finalize();
      return;
    }

    if (momentTimeoutRef.current) {
      clearTimeout(momentTimeoutRef.current);
      momentTimeoutRef.current = null;
    }

    if (mountedRef.current) {
      setActiveMoment(null);
    }
  }, []);

  const playMoment = useCallback(
    (moment: LottieMoment, label: string | undefined, maxWaitMs: number) =>
      new Promise<void>((resolve) => {
        if (cancelledRef.current || !isFocusedRef.current) {
          resolve();
          return;
        }

        let settled = false;
        const finalize = () => {
          if (settled) {
            return;
          }

          settled = true;

          if (momentTimeoutRef.current) {
            clearTimeout(momentTimeoutRef.current);
            momentTimeoutRef.current = null;
          }

          momentResolveRef.current = null;
          activeAwaitCancelRef.current = null;

          if (mountedRef.current) {
            setActiveMoment(null);
          }

          resolve();
        };

        momentResolveRef.current = finalize;
        if (mountedRef.current) {
          setActiveMoment({ kind: moment, key: `${moment}-${Date.now()}`, ...(label ? { label } : {}) });
        }

        momentTimeoutRef.current = setTimeout(finalize, maxWaitMs);
        activeAwaitCancelRef.current = finalize;
      }),
    [],
  );

  const resetCamera = useCallback(
    (durationMs: number) => {
      if (boardSize <= 0) {
        return;
      }

      const center = boardSize / 2;
      if (durationMs <= 0 || !gameState.cinematicsEnabled) {
        cameraScale.value = 1;
        cameraFocusX.value = center;
        cameraFocusY.value = center;
        return;
      }

      const easing = Easing.out(Easing.cubic);
      cameraScale.value = withTiming(1, { duration: durationMs, easing });
      cameraFocusX.value = withTiming(center, { duration: durationMs, easing });
      cameraFocusY.value = withTiming(center, { duration: durationMs, easing });
    },
    [boardSize, cameraFocusX, cameraFocusY, cameraScale, gameState.cinematicsEnabled],
  );

  const focusCameraAt = useCallback(
    (point: { x: number; y: number }, scale: number, durationMs: number) => {
      if (boardSize <= 0 || !gameState.cinematicsEnabled) {
        return;
      }

      const easing = Easing.out(Easing.cubic);
      cameraScale.value = withTiming(scale, { duration: durationMs, easing });
      cameraFocusX.value = withTiming(point.x, { duration: durationMs, easing });
      cameraFocusY.value = withTiming(point.y, { duration: durationMs, easing });
    },
    [boardSize, cameraFocusX, cameraFocusY, cameraScale, gameState.cinematicsEnabled],
  );

  const cancelActiveAwait = useCallback(() => {
    const cancel = activeAwaitCancelRef.current;
    activeAwaitCancelRef.current = null;
    if (cancel) {
      cancel();
    }
  }, []);

  const stopAnimations = useCallback(() => {
    cancelledRef.current = true;
    ignoreExistingRollMovesRef.current = true;
    rollMoveQueueRef.current = [];
    isAnimatingRef.current = false;

    cancelActiveAwait();
    resolveMoment();

    cancelAnimation(cameraScale);
    cancelAnimation(cameraFocusX);
    cancelAnimation(cameraFocusY);
    cancelAnimation(tokenCenterX);
    cancelAnimation(tokenCenterY);
    cancelAnimation(tokenScale);
    cancelAnimation(tokenOpacity);

    if (boardSize > 0) {
      const center = boardSize / 2;
      cameraScale.value = 1;
      cameraFocusX.value = center;
      cameraFocusY.value = center;
    } else {
      cameraScale.value = 1;
      cameraFocusX.value = 0;
      cameraFocusY.value = 0;
    }

    tokenOpacity.value = 0;
    tokenScale.value = 1;

    if (mountedRef.current) {
      setAnimatingActor(null);
      setActiveMoment(null);
    }
  }, [
    boardSize,
    cameraFocusX,
    cameraFocusY,
    cameraScale,
    cancelActiveAwait,
    resolveMoment,
    tokenCenterX,
    tokenCenterY,
    tokenOpacity,
    tokenScale,
  ]);

  const prepareAnimations = useCallback(() => {
    cancelledRef.current = false;
    ignoreExistingRollMovesRef.current = true;
    rollMoveQueueRef.current = [];
    isAnimatingRef.current = false;
    cancelActiveAwait();
    resolveMoment();
    resetCamera(0);
    tokenOpacity.value = 0;
    tokenScale.value = 1;
    if (mountedRef.current) {
      setAnimatingActor(null);
      setActiveMoment(null);
    }
  }, [cancelActiveAwait, resetCamera, resolveMoment, tokenOpacity, tokenScale]);

  const onBoardLayout = useCallback(
    (event: LayoutChangeEvent) => {
      const nextSize = Math.round(event.nativeEvent.layout.width);
      if (!nextSize || nextSize === boardSize) {
        return;
      }

      setBoardSize(nextSize);
      const cellSize = nextSize / 10;
      const nextTokenSize = Math.round(
        Math.min(isNarrowPhone ? 18 : 22, Math.max(isNarrowPhone ? 12 : 14, cellSize * (isNarrowPhone ? 0.6 : 0.65))),
      );
      setOverlayTokenSize(nextTokenSize);

      boardSizeShared.value = nextSize;
      cameraScale.value = 1;
      cameraFocusX.value = nextSize / 2;
      cameraFocusY.value = nextSize / 2;
      tokenOpacity.value = 0;
      tokenScale.value = 1;
    },
    [boardSize, boardSizeShared, cameraFocusX, cameraFocusY, cameraScale, isNarrowPhone, tokenOpacity, tokenScale],
  );

  const cameraAnimatedStyle = useAnimatedStyle(() => {
    const size = boardSizeShared.value;
    if (size <= 0) {
      return {};
    }

    const center = size / 2;
    return {
      transform: [
        { translateX: -cameraFocusX.value },
        { translateY: -cameraFocusY.value },
        { scale: cameraScale.value },
        { translateX: center },
        { translateY: center },
      ],
    };
  });

  const movingTokenAnimatedStyle = useAnimatedStyle(
    () => ({
      opacity: tokenOpacity.value,
      transform: [
        { translateX: tokenCenterX.value - overlayTokenSize / 2 },
        { translateY: tokenCenterY.value - overlayTokenSize / 2 },
        { scale: tokenScale.value },
      ],
    }),
    [overlayTokenSize],
  );

  const waitForMs = useCallback(
    (durationMs: number) =>
      new Promise<void>((resolve) => {
        if (cancelledRef.current || !isFocusedRef.current || durationMs <= 0) {
          resolve();
          return;
        }

        const timeout = setTimeout(() => {
          activeAwaitCancelRef.current = null;
          resolve();
        }, durationMs);

        activeAwaitCancelRef.current = () => {
          clearTimeout(timeout);
          activeAwaitCancelRef.current = null;
          resolve();
        };
      }),
    [],
  );

  const animateTokenToPoint = useCallback(
    (point: { x: number; y: number }, durationMs: number, easing: (value: number) => number, withHop: boolean) =>
      new Promise<void>((resolve) => {
        if (cancelledRef.current || !isFocusedRef.current || durationMs <= 0) {
          resolve();
          return;
        }

        let settled = false;
        const finalize = () => {
          if (settled) {
            return;
          }

          settled = true;
          activeAwaitCancelRef.current = null;
          resolve();
        };

        const timeout = setTimeout(finalize, durationMs + 60);
        activeAwaitCancelRef.current = () => {
          clearTimeout(timeout);
          cancelAnimation(tokenCenterX);
          cancelAnimation(tokenCenterY);
          cancelAnimation(tokenScale);
          finalize();
        };

        tokenCenterX.value = withTiming(point.x, { duration: durationMs, easing });
        tokenCenterY.value = withTiming(point.y, { duration: durationMs, easing });

        if (withHop) {
          const hopUp = Math.max(1, Math.round(durationMs * 0.44));
          const hopDown = Math.max(1, durationMs - hopUp);
          tokenScale.value = withSequence(
            withTiming(1.14, { duration: hopUp, easing: Easing.out(Easing.quad) }),
            withTiming(1, { duration: hopDown, easing: Easing.in(Easing.quad) }),
          );
        }
      }),
    [tokenCenterX, tokenCenterY, tokenScale],
  );

  const playRollMoveAnimation = useCallback(
    async (animation: RollMoveAnimation) => {
      if (cancelledRef.current || !isFocusedRef.current || boardSize <= 0) {
        return;
      }

      const actor = gameState.players.find((player) => player.userId === animation.actorUserId) ?? null;
      if (mountedRef.current) {
        setAnimatingActor({
          userId: animation.actorUserId,
          playerOrder: actor?.playerOrder ?? 0,
          avatarUrl: actor?.avatarUrl ?? null,
        });
      }

      const fromPoint = resolveTileCenter(animation.fromTile, boardSize, 0.72);
      if (!fromPoint) {
        if (mountedRef.current) {
          setAnimatingActor(null);
        }
        return;
      }

      tokenCenterX.value = fromPoint.x;
      tokenCenterY.value = fromPoint.y;
      tokenScale.value = 1;
      tokenOpacity.value = 1;

      resetCamera(0);

      if (gameState.cinematicsEnabled) {
        focusCameraAt(resolveTileCenter(animation.fromTile, boardSize, 0.5) ?? fromPoint, 1.25, 220);
      }

      await playMoment("dice", `Rolled ${animation.dice}`, 1400);
      if (cancelledRef.current || !isFocusedRef.current) {
        return;
      }

      resetCamera(220);

      const hopDuration = isNarrowPhone ? 90 : 105;
      for (let tile = animation.fromTile + 1; tile <= animation.landingTile; tile += 1) {
        const point = resolveTileCenter(tile, boardSize, 0.72);
        if (!point) {
          continue;
        }

        await animateTokenToPoint(point, hopDuration, Easing.inOut(Easing.quad), true);
        if (cancelledRef.current || !isFocusedRef.current) {
          return;
        }
      }

      const hasJump = animation.transition !== "none" && animation.toTile !== animation.landingTile;
      if (hasJump) {
        const landingPoint = resolveTileCenter(animation.landingTile, boardSize, 0.5);
        const toPoint = resolveTileCenter(animation.toTile, boardSize, 0.5);

        if (gameState.cinematicsEnabled && landingPoint && toPoint) {
          focusCameraAt(
            { x: (landingPoint.x + toPoint.x) / 2, y: (landingPoint.y + toPoint.y) / 2 },
            1.65,
            240,
          );
        }

        const moment: LottieMoment =
          animation.transition === "none"
            ? "dice"
            : animation.transition === "ladder"
              ? "ladder"
              : animation.transition;
        await playMoment(moment, undefined, 1200);
        if (cancelledRef.current || !isFocusedRef.current) {
          return;
        }

        const finalPoint = resolveTileCenter(animation.toTile, boardSize, 0.72);
        if (finalPoint) {
          const duration = animation.transition === "ladder" ? 450 : animation.transition === "big_snake" ? 560 : 400;
          const easing =
            animation.transition === "ladder" ? Easing.out(Easing.cubic) : Easing.inOut(Easing.quad);
          await animateTokenToPoint(finalPoint, duration, easing, false);
          if (cancelledRef.current || !isFocusedRef.current) {
            return;
          }
        }

        resetCamera(260);
      }

      tokenOpacity.value = withTiming(0, { duration: 180, easing: Easing.out(Easing.quad) });
      await waitForMs(200);

      if (mountedRef.current) {
        setAnimatingActor(null);
      }

      tokenScale.value = 1;
    },
    [
      animateTokenToPoint,
      boardSize,
      focusCameraAt,
      gameState.cinematicsEnabled,
      gameState.players,
      isNarrowPhone,
      playMoment,
      resetCamera,
      tokenCenterX,
      tokenCenterY,
      tokenOpacity,
      tokenScale,
      waitForMs,
    ],
  );

  const processRollMoveQueue = useCallback(async () => {
    if (isAnimatingRef.current || cancelledRef.current || !isFocusedRef.current) {
      return;
    }

    const next = rollMoveQueueRef.current.shift() ?? null;
    if (!next) {
      return;
    }

    isAnimatingRef.current = true;
    try {
      await playRollMoveAnimation(next);
    } finally {
      isAnimatingRef.current = false;
    }

    if (!cancelledRef.current && isFocusedRef.current) {
      const remaining = rollMoveQueueRef.current.length;
      if (remaining > 0) {
        void processRollMoveQueue();
      }
    }
  }, [playRollMoveAnimation]);

  useEffect(() => {
    if (!isFocused) {
      stopAnimations();
      return;
    }

    prepareAnimations();
    return () => {
      stopAnimations();
    };
  }, [isFocused, prepareAnimations, stopAnimations]);

  useEffect(() => {
    if (!isFocused || cancelledRef.current) {
      return;
    }

    if (ignoreExistingRollMovesRef.current) {
      if (gameState.loading) {
        return;
      }

      const rollMoveIds = gameState.events
        .filter((event) => event.eventType === "roll_move")
        .map((event) => event.id);
      lastEnqueuedRollMoveIdRef.current = rollMoveIds.length > 0 ? Math.max(...rollMoveIds) : 0;
      ignoreExistingRollMovesRef.current = false;
      return;
    }

    const lastEnqueuedId = lastEnqueuedRollMoveIdRef.current;
    const newRollMoveEvents = gameState.events
      .filter((event) => event.eventType === "roll_move" && event.id > lastEnqueuedId)
      .sort((left, right) => left.id - right.id);

    if (newRollMoveEvents.length === 0) {
      return;
    }

    const maxNewEventId = newRollMoveEvents[newRollMoveEvents.length - 1]?.id ?? lastEnqueuedId;
    lastEnqueuedRollMoveIdRef.current = Math.max(lastEnqueuedId, maxNewEventId);

    const parsedAnimations = newRollMoveEvents
      .map(parseRollMoveAnimation)
      .filter((entry): entry is RollMoveAnimation => entry !== null);

    if (parsedAnimations.length === 0) {
      return;
    }

    rollMoveQueueRef.current.push(...parsedAnimations);
    void processRollMoveQueue();
  }, [gameState.events, gameState.loading, isFocused, processRollMoveQueue]);

  const currentTurnLabel = (() => {
    if (gameState.game?.status === "finished") {
      return "Game finished";
    }

    if (!gameState.game?.current_turn_user_id) {
      return "No active turn";
    }

    const currentPlayer = gameState.players.find((player) => player.userId === gameState.game?.current_turn_user_id);
    return currentPlayer?.displayName ?? `User ${gameState.game.current_turn_user_id.slice(0, 8)}`;
  })();
  const playerNameById = new Map(gameState.players.map((player) => [player.userId, player.displayName]));
  const playersByTile = new Map<number, typeof gameState.players>();
  for (const player of gameState.players) {
    const current = playersByTile.get(player.tilePosition);
    if (current) {
      current.push(player);
    } else {
      playersByTile.set(player.tilePosition, [player]);
    }
  }
  const latestEvent = gameState.events[0] ?? null;
  const eventBanner = resolveEventBanner(latestEvent, playerNameById);
  const hasSelectablePlayers = gameState.familyMembers.length > 0;

  useEffect(() => {
    if (gameState.game) {
      setSelectedPlayerIds([]);
      return;
    }

    const availableIds = gameState.familyMembers.map((member) => member.userId);
    if (availableIds.length === 0) {
      setSelectedPlayerIds([]);
      return;
    }

    setSelectedPlayerIds((current) => {
      const availableSet = new Set(availableIds);
      const filtered = current.filter((id) => availableSet.has(id));
      if (filtered.length > 0) {
        return filtered;
      }

      return availableIds;
    });
  }, [gameState.familyMembers, gameState.game]);

  const toggleSelectedPlayer = (userId: string) => {
    setSelectedPlayerIds((current) => {
      if (current.includes(userId)) {
        return current.filter((id) => id !== userId);
      }

      return [...current, userId];
    });
  };

  const eventBannerColors = (() => {
    if (!eventBanner) {
      return {
        background: colors.background,
        border: colors.border,
        text: colors.text,
      };
    }

    if (eventBanner.tone === "success") {
      return {
        background: "#e9f9ee",
        border: "#7bcf97",
        text: "#165b2f",
      };
    }

    if (eventBanner.tone === "danger") {
      return {
        background: "#fdeeee",
        border: "#f4b7b7",
        text: "#7c1f1f",
      };
    }

    return {
      background: colors.background,
      border: colors.border,
      text: colors.text,
    };
  })();

  return (
    <Screen padded={false}>
      <ScrollView
        contentContainerStyle={[
          styles.content,
          {
            gap: spacing.md,
            paddingHorizontal: boardScreenHorizontalPadding,
            paddingTop: spacing.md,
            paddingBottom: spacing.xl,
          },
        ]}
        refreshControl={<RefreshControl refreshing={gameState.loading} onRefresh={() => void gameState.refresh()} />}
      >
        <View style={[styles.gameHeader, { gap: spacing.sm }]}>
          <IconButton onPress={onBack} accessibilityLabel="Back">
            <AppText style={{ fontWeight: "900" }}>{"\u2039"}</AppText>
          </IconButton>
          <View style={{ flex: 1, minWidth: 0 }}>
            <AppText variant="heading">Snakes & Ladders</AppText>
            <AppText muted>{gameState.roomTitle}</AppText>
          </View>
        </View>

        {gameState.error ? (
          <InfoCard>
            <AppText variant="title">Games Error</AppText>
            <AppText muted>{gameState.error}</AppText>
          </InfoCard>
        ) : null}

        <View style={[styles.layout, isLandscape && styles.layoutLandscape, { gap: spacing.md }]}>
          <View style={[styles.boardColumn, isLandscape && styles.boardColumnLandscape, { gap: spacing.md }]}>
            <InfoCard>
              <AppText variant="title">{gameState.roomTitle}</AppText>
              {gameState.game ? (
                <View style={{ gap: spacing.xs }}>
                  <AppText muted>Status: {gameState.game.status}</AppText>
                  <AppText muted>Current Turn: {currentTurnLabel}</AppText>
                  <AppText muted>Game ID: {gameState.game.id.slice(0, 8)}</AppText>
                </View>
              ) : (
                <AppText muted>No active game. Start a game to begin turns.</AppText>
              )}
            </InfoCard>

            <InfoCard>
              <AppText variant="title">Board</AppText>
              <AppText muted>Classic v1 mapping with fixed snakes and ladders.</AppText>
              <View style={[styles.skinSelectionGrid, { gap: spacing.sm }]}>
                {BOARD_SKIN_IDS.map((skinId) => {
                  const skin = BOARD_SKINS[skinId];
                  const selected = gameState.boardSkinId === skinId;

                  return (
                    <Pressable
                      key={skinId}
                      accessibilityLabel={`Board skin ${skin.label}`}
                      accessibilityRole="button"
                      disabled={gameState.savingBoardSkin}
                      onPress={() => {
                        void gameState.setBoardSkin(skinId);
                      }}
                      style={({ pressed }) => [
                        styles.skinSelectionChip,
                        {
                          borderColor: selected ? colors.primary : colors.border,
                          backgroundColor: selected ? colors.surface : colors.background,
                          opacity: gameState.savingBoardSkin ? 0.75 : pressed ? 0.85 : 1,
                        },
                      ]}
                    >
                      <View style={[styles.skinPreview, { borderColor: skin.boardBorder, backgroundColor: skin.boardBackground }]}>
                        {skin.thumbnailImage ? (
                          <Image source={skin.thumbnailImage} style={styles.skinPreviewImage} resizeMode="cover" />
                        ) : (
                          <>
                            <View style={[styles.skinPreviewTile, { backgroundColor: skin.tileLight }]} />
                            <View style={[styles.skinPreviewTile, { backgroundColor: skin.tileDark }]} />
                            <View style={[styles.skinPreviewTile, { backgroundColor: skin.tileDark }]} />
                            <View style={[styles.skinPreviewTile, { backgroundColor: skin.tileLight }]} />
                          </>
                        )}
                      </View>
                      <View style={styles.skinMeta}>
                        <AppText variant="caption">{skin.label}</AppText>
                        <AppText variant="caption" muted>
                          {skin.subtitle}
                        </AppText>
                      </View>
                    </Pressable>
                  );
                })}
              </View>
              {gameState.savingBoardSkin ? <AppText variant="caption" muted>Saving board skin...</AppText> : null}

              {eventBanner ? (
                <View
                  style={[
                    styles.eventBanner,
                    {
                      backgroundColor: eventBannerColors.background,
                      borderColor: eventBannerColors.border,
                    },
                  ]}
                >
                  <AppText style={{ color: eventBannerColors.text }}>{eventBanner.text}</AppText>
                </View>
              ) : null}

              <View
                onLayout={onBoardLayout}
                style={[
                  styles.boardGrid,
                  {
                    borderColor: boardSkin.boardBorder,
                    backgroundColor: boardSkin.boardBackground,
                    borderWidth: hasBoardBaseArt ? 0 : 1,
                  },
                ]}
              >
                <Animated.View style={[styles.boardCameraLayer, cameraAnimatedStyle]}>
                  {boardSkin.boardBaseImage ? (
                    <View pointerEvents="none" style={styles.boardArtLayer}>
                      <Image source={boardSkin.boardBaseImage} style={styles.boardArtLayerImage} resizeMode="stretch" />
                    </View>
                  ) : null}
                  {boardSkin.overlaySnakesLaddersImage ? (
                    <View
                      pointerEvents="none"
                      style={[
                        styles.boardArtLayer,
                        {
                          opacity: boardOverlayOpacity,
                          top: boardOverlayInset,
                          right: boardOverlayInset,
                          bottom: boardOverlayInset,
                          left: boardOverlayInset,
                        },
                      ]}
                    >
                      <Image
                        source={boardSkin.overlaySnakesLaddersImage}
                        style={styles.boardArtLayerImage}
                        resizeMode="stretch"
                      />
                    </View>
                  ) : null}

                  <View style={styles.boardContentLayer}>
                    {BOARD_ROWS.map((rowCells, rowIndex) => (
                      <View key={`row-${rowIndex}`} style={styles.boardRow}>
                        {rowCells.map((cell) => {
                          const allTilePlayers = playersByTile.get(cell.tile) ?? [];
                          const tilePlayers = animatingActor
                            ? allTilePlayers.filter((player) => player.userId !== animatingActor.userId)
                            : allTilePlayers;

                          return (
                            <View
                              key={cell.tile}
                              style={[
                                styles.boardCell,
                                isNarrowPhone ? styles.boardCellNarrow : null,
                                {
                                  borderColor: hasBoardBaseArt ? "transparent" : boardSkin.tileBorder,
                                  borderWidth: hasBoardBaseArt ? 0 : StyleSheet.hairlineWidth,
                                  backgroundColor: hasBoardBaseArt
                                    ? "transparent"
                                    : (cell.row + cell.column) % 2 === 0
                                      ? boardSkin.tileLight
                                      : boardSkin.tileDark,
                                },
                              ]}
                            >
                              <View style={styles.cellHeader}>
                                <AppText
                                  variant="caption"
                                  allowFontScaling={false}
                                  maxFontSizeMultiplier={1}
                                  numberOfLines={1}
                                  style={[
                                    styles.boardTileNumber,
                                    isNarrowPhone ? styles.boardTileNumberNarrow : null,
                                    { color: boardSkin.tileNumber },
                                  ]}
                                >
                                  {cell.tile}
                                </AppText>
                                {cell.jumpType ? (
                                  showJumpTextOnTiles ? (
                                    <AppText
                                      variant="caption"
                                      allowFontScaling={false}
                                      maxFontSizeMultiplier={1}
                                      numberOfLines={1}
                                      style={[
                                        styles.boardJumpLabel,
                                        isNarrowPhone ? styles.boardJumpLabelNarrow : null,
                                        {
                                          color:
                                            cell.jumpType === "ladder" ? boardSkin.ladderColor : boardSkin.snakeColor,
                                        },
                                      ]}
                                    >
                                      {cell.jumpType === "ladder" ? `L${cell.jumpTo}` : `S${cell.jumpTo}`}
                                    </AppText>
                                  ) : (
                                    <View
                                      style={[
                                        styles.boardJumpDot,
                                        {
                                          backgroundColor:
                                            cell.jumpType === "ladder" ? boardSkin.ladderColor : boardSkin.snakeColor,
                                        },
                                      ]}
                                    />
                                  )
                                ) : null}
                              </View>

                              <View style={styles.tileTokenRow}>
                                {tilePlayers.slice(0, maxVisibleTileTokens).map((player) => {
                                  const isCurrentTurn = Boolean(
                                    gameState.game?.status === "active" &&
                                      gameState.game.current_turn_user_id &&
                                      player.userId === gameState.game.current_turn_user_id,
                                  );

                                  return (
                                    <View
                                      key={player.userId}
                                      style={[
                                        styles.tileToken,
                                        isNarrowPhone ? styles.tileTokenNarrow : null,
                                        {
                                          borderColor: isCurrentTurn ? colors.primary : boardSkin.tokenBorder,
                                          backgroundColor: boardSkin.tokenBackground,
                                        },
                                      ]}
                                    >
                                      {player.avatarUrl ? (
                                        <Image source={{ uri: player.avatarUrl }} style={styles.tileTokenImage} />
                                      ) : (
                                        <AppText
                                          variant="caption"
                                          allowFontScaling={false}
                                          maxFontSizeMultiplier={1}
                                          numberOfLines={1}
                                          style={[
                                            styles.boardTokenText,
                                            isNarrowPhone ? styles.boardTokenTextNarrow : null,
                                            { color: boardSkin.tileNumber },
                                          ]}
                                        >
                                          {player.playerOrder}
                                        </AppText>
                                      )}
                                    </View>
                                  );
                                })}
                                {showOverflowTileCount && tilePlayers.length > maxVisibleTileTokens ? (
                                  <AppText
                                    variant="caption"
                                    allowFontScaling={false}
                                    maxFontSizeMultiplier={1}
                                    muted
                                  >
                                    +{tilePlayers.length - maxVisibleTileTokens}
                                  </AppText>
                                ) : null}
                              </View>
                            </View>
                          );
                        })}
                      </View>
                    ))}
                  </View>

                  <Animated.View
                    pointerEvents="none"
                    style={[
                      styles.movingToken,
                      {
                        width: overlayTokenSize,
                        height: overlayTokenSize,
                        borderColor: colors.primary,
                        backgroundColor: boardSkin.tokenBackground,
                      },
                      movingTokenAnimatedStyle,
                    ]}
                  >
                    {animatingActor?.avatarUrl ? (
                      <Image source={{ uri: animatingActor.avatarUrl }} style={styles.movingTokenImage} />
                    ) : animatingActor ? (
                      <AppText
                        variant="caption"
                        allowFontScaling={false}
                        maxFontSizeMultiplier={1}
                        numberOfLines={1}
                        style={[styles.boardTokenText, { color: boardSkin.tileNumber }]}
                      >
                        {animatingActor.playerOrder}
                      </AppText>
                    ) : null}
                  </Animated.View>
                </Animated.View>

                {activeMoment ? (
                  <View pointerEvents="none" style={styles.cinematicOverlay}>
                    <View
                      style={[
                        styles.cinematicOverlayCard,
                        { borderColor: colors.border, backgroundColor: colors.surface },
                      ]}
                    >
                      <LottieView
                        key={activeMoment.key}
                        source={LOTTIE_SOURCE_BY_MOMENT[activeMoment.kind]}
                        autoPlay
                        loop={false}
                        onAnimationFinish={() => {
                          resolveMoment();
                        }}
                        style={[
                          styles.cinematicLottie,
                          {
                            width: Math.min(280, Math.round((boardSize || 320) * 0.58)),
                            height: Math.min(280, Math.round((boardSize || 320) * 0.58)),
                          },
                        ]}
                      />
                      {activeMoment.label ? (
                        <AppText variant="caption" style={styles.cinematicLabel}>
                          {activeMoment.label}
                        </AppText>
                      ) : null}
                    </View>
                  </View>
                ) : null}
              </View>

              <AppText variant="caption" muted>
                L = ladder, S = snake
              </AppText>
            </InfoCard>
          </View>

          <View style={[styles.sideColumn, isLandscape && styles.sideColumnLandscape, { gap: spacing.md }]}>
            {!gameState.game && gameState.role === "admin" ? (
              <InfoCard>
                <AppText variant="title">Player Selection</AppText>
                <AppText muted>Select players to include in this game.</AppText>
                {hasSelectablePlayers ? (
                  <View style={[styles.selectionGrid, { gap: spacing.sm }]}>
                    {gameState.familyMembers.map((member) => {
                      const selected = selectedPlayerIds.includes(member.userId);

                      return (
                        <Pressable
                          key={member.userId}
                          onPress={() => {
                            toggleSelectedPlayer(member.userId);
                          }}
                          style={[
                            styles.selectionChip,
                            {
                              borderColor: colors.border,
                              backgroundColor: selected ? colors.primary : colors.background,
                            },
                          ]}
                        >
                          <AppText style={{ color: selected ? "#ffffff" : colors.text }}>{member.displayName}</AppText>
                          <AppText variant="caption" style={{ color: selected ? "#ffffff" : colors.textMuted }}>
                            {member.role}
                          </AppText>
                        </Pressable>
                      );
                    })}
                  </View>
                ) : (
                  <AppText muted>No active family members available for selection.</AppText>
                )}
                <AppText muted>Selected: {selectedPlayerIds.length}</AppText>
              </InfoCard>
            ) : null}

            <InfoCard>
              <AppText variant="title">Actions</AppText>
              <AppText muted>
                {gameState.role === "admin"
                  ? "Admins can start or end a game. Only the active player can roll."
                  : "Only admins can start a game. Roll is available on your turn."}
              </AppText>

              <PrimaryButton
                onPress={() => {
                  void gameState.startGame(selectedPlayerIds);
                }}
                disabled={
                  !gameState.canStartGame ||
                  gameState.startingGame ||
                  gameState.loading ||
                  (gameState.role === "admin" && selectedPlayerIds.length === 0)
                }
              >
                {gameState.startingGame ? "Starting Game..." : "Start New Game"}
              </PrimaryButton>

              <PrimaryButton
                onPress={() => {
                  void gameState.rollMove();
                }}
                disabled={!gameState.canRoll || gameState.rolling || gameState.loading}
              >
                {gameState.rolling ? "Rolling..." : "Roll Dice"}
              </PrimaryButton>

              <PrimaryButton
                onPress={() => {
                  void gameState.endGame();
                }}
                disabled={!gameState.canEndGame || gameState.endingGame || gameState.loading}
              >
                {gameState.endingGame ? "Ending Game..." : "End Game"}
              </PrimaryButton>
            </InfoCard>

            <InfoCard>
              <AppText variant="title">Players</AppText>
              {gameState.players.length === 0 ? (
                <AppText muted>No players in active game.</AppText>
              ) : (
                <View style={{ gap: spacing.xs }}>
                  {gameState.players.map((player) => (
                    <View
                      key={player.userId}
                      style={[styles.playerRow, { borderColor: colors.border, backgroundColor: colors.background }]}
                    >
                      {player.avatarUrl ? (
                        <Image source={{ uri: player.avatarUrl }} style={styles.playerAvatar} />
                      ) : (
                        <View
                          style={[
                            styles.playerAvatar,
                            styles.playerAvatarFallback,
                            { borderColor: colors.border, backgroundColor: colors.surface },
                          ]}
                        >
                          <AppText muted>?</AppText>
                        </View>
                      )}
                      <View style={styles.playerMeta}>
                        <AppText muted>
                          {player.playerOrder}. {player.displayName} - tile {player.tilePosition}
                        </AppText>
                        <AppText variant="caption" muted>
                          Expression: {avatarExpressionLabel(player.expression)}
                        </AppText>
                      </View>
                    </View>
                  ))}
                </View>
              )}
            </InfoCard>

            <InfoCard>
              <AppText variant="title">Recent Events</AppText>
              {gameState.events.length === 0 ? (
                <AppText muted>No game events yet.</AppText>
              ) : (
                <View style={{ gap: spacing.xs }}>
                  {gameState.events.slice(0, 8).map((event) => (
                    <AppText key={event.id} muted>
                      {new Date(event.createdAt).toLocaleTimeString()} - {formatEventSummary(event)}
                    </AppText>
                  ))}
                </View>
              )}
            </InfoCard>
          </View>
        </View>
      </ScrollView>
    </Screen>
  );
}

export function GamesScreen() {
  const [view, setView] = useState<GamesView>("hub");

  if (view === "snakes") {
    return <SnakesAndLaddersScreen onBack={() => setView("hub")} />;
  }

  if (view === "word-master") {
    return <WordMasterScreen onBack={() => setView("hub")} />;
  }

  if (view === "cue-clash") {
    return <CueClashScreen onBack={() => setView("hub")} />;
  }

  return (
    <GamesHubScreen
      onOpenSnakes={() => setView("snakes")}
      onOpenWordMaster={() => setView("word-master")}
      onOpenCueClash={() => setView("cue-clash")}
    />
  );
}

const styles = StyleSheet.create({
  content: {
    flexGrow: 1,
  },
  layout: {
    flexDirection: "column",
  },
  layoutLandscape: {
    flexDirection: "row",
    alignItems: "flex-start",
  },
  boardColumn: {
    width: "100%",
  },
  boardColumnLandscape: {
    flex: 1.2,
  },
  sideColumn: {
    width: "100%",
  },
  sideColumnLandscape: {
    flex: 1,
  },
  selectionGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
  },
  selectionChip: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    minWidth: 110,
    gap: 2,
  },
  eventBanner: {
    borderWidth: 1,
    borderRadius: 10,
    padding: 10,
  },
  skinSelectionGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
  },
  skinSelectionChip: {
    borderWidth: 1,
    borderRadius: 10,
    padding: 8,
    minWidth: 134,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  skinPreview: {
    width: 32,
    height: 32,
    borderWidth: 1,
    borderRadius: 8,
    flexDirection: "row",
    flexWrap: "wrap",
    overflow: "hidden",
  },
  skinPreviewImage: {
    width: "100%",
    height: "100%",
  },
  skinPreviewTile: {
    width: "50%",
    height: "50%",
  },
  skinMeta: {
    gap: 1,
  },
  boardGrid: {
    width: "100%",
    aspectRatio: 1,
    flexDirection: "column",
    borderWidth: 0,
    borderRadius: 0,
    overflow: "hidden",
    position: "relative",
  },
  boardCameraLayer: {
    ...StyleSheet.absoluteFillObject,
  },
  boardArtLayer: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    width: "100%",
    height: "100%",
  },
  boardArtLayerImage: {
    width: "100%",
    height: "100%",
  },
  boardContentLayer: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    width: "100%",
    height: "100%",
    zIndex: 1,
  },
  boardRow: {
    flex: 1,
    flexDirection: "row",
  },
  boardCell: {
    flex: 1,
    padding: 2,
    justifyContent: "space-between",
    overflow: "hidden",
  },
  boardCellNarrow: {
    padding: 1,
  },
  cellHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    minHeight: 10,
  },
  tileTokenRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    flexWrap: "nowrap",
    minHeight: 14,
  },
  boardTileNumber: {
    fontSize: 10,
    lineHeight: 10,
    fontWeight: "600",
  },
  boardTileNumberNarrow: {
    fontSize: 9,
    lineHeight: 9,
  },
  boardJumpLabel: {
    fontSize: 9,
    lineHeight: 10,
    fontWeight: "700",
    flexShrink: 1,
    textAlign: "right",
  },
  boardJumpLabelNarrow: {
    fontSize: 8,
    lineHeight: 9,
  },
  boardJumpDot: {
    width: 5,
    height: 5,
    borderRadius: 999,
    marginRight: 1,
  },
  boardTokenText: {
    fontSize: 9,
    lineHeight: 10,
    fontWeight: "700",
  },
  boardTokenTextNarrow: {
    fontSize: 8,
    lineHeight: 8,
  },
  tileToken: {
    width: 14,
    height: 14,
    borderRadius: 3,
    borderWidth: 1,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
  },
  tileTokenNarrow: {
    width: 12,
    height: 12,
    borderRadius: 2,
  },
  tileTokenImage: {
    width: "100%",
    height: "100%",
  },
  movingToken: {
    position: "absolute",
    top: 0,
    left: 0,
    borderRadius: 6,
    borderWidth: 2,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 4,
  },
  movingTokenImage: {
    width: "100%",
    height: "100%",
  },
  cinematicOverlay: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    alignItems: "center",
    justifyContent: "center",
    padding: 10,
    zIndex: 10,
  },
  cinematicOverlayCard: {
    borderWidth: 1,
    borderRadius: 16,
    paddingVertical: 10,
    paddingHorizontal: 12,
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  cinematicLottie: {
    alignSelf: "center",
  },
  cinematicLabel: {
    textAlign: "center",
  },
  playerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderWidth: 1,
    borderRadius: 10,
    padding: 8,
  },
  playerAvatar: {
    width: 44,
    height: 44,
    borderRadius: 8,
  },
  playerAvatarFallback: {
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
  },
  playerMeta: {
    flex: 1,
    gap: 2,
  },
  gameHeader: {
    flexDirection: "row",
    alignItems: "center",
  },
  hubCardHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
  },
  hubCardTitle: {
    flex: 1,
    minWidth: 0,
    gap: 4,
  },
  hubFooter: {
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
});
