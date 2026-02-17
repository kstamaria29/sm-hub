import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  LayoutChangeEvent,
  PanResponder,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  useWindowDimensions,
} from "react-native";
import Animated, { type SharedValue, useAnimatedStyle, useSharedValue } from "react-native-reanimated";

import { parseCueClashBallsState, parseCueClashReplay } from "../features/cueClash/ballState";
import { useFamilyCueClash } from "../features/cueClash/useFamilyCueClash";
import { Json } from "../lib/database.types";
import { AppText } from "../ui/primitives/AppText";
import { IconButton } from "../ui/primitives/IconButton";
import { InfoCard } from "../ui/primitives/InfoCard";
import { PrimaryButton } from "../ui/primitives/PrimaryButton";
import { Screen } from "../ui/primitives/Screen";
import { Tag } from "../ui/primitives/Tag";
import { useTheme } from "../ui/theme/ThemeProvider";

type CueClashScreenProps = {
  onBack: () => void;
};

function asJsonObject(value: Json): Record<string, Json> | null {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, Json>;
  }

  return null;
}

function toNumberArray(value: Json | undefined): number[] | null {
  if (!Array.isArray(value)) {
    return null;
  }

  const parsed: number[] = [];
  for (const entry of value) {
    if (typeof entry !== "number" || !Number.isFinite(entry)) {
      return null;
    }
    parsed.push(entry);
  }

  return parsed;
}

function toBooleanValue(value: Json | undefined): boolean | null {
  return typeof value === "boolean" ? value : null;
}

function ballColor(ballId: number): { base: string; stripe?: string; text: string } {
  if (ballId === 0) {
    return { base: "#F8FAFC", text: "#0F172A" };
  }

  if (ballId === 8) {
    return { base: "#0F172A", text: "#F8FAFC" };
  }

  const solidColors: Record<number, string> = {
    1: "#FBBF24",
    2: "#2563EB",
    3: "#DC2626",
    4: "#7C3AED",
    5: "#F97316",
    6: "#16A34A",
    7: "#B91C1C",
  };

  const stripeColors: Record<number, string> = {
    9: solidColors[1],
    10: solidColors[2],
    11: solidColors[3],
    12: solidColors[4],
    13: solidColors[5],
    14: solidColors[6],
    15: solidColors[7],
  };

  if (ballId >= 1 && ballId <= 7) {
    return { base: solidColors[ballId] ?? "#64748B", text: "#0F172A" };
  }

  return { base: "#F8FAFC", stripe: stripeColors[ballId] ?? "#64748B", text: "#0F172A" };
}

function Ball({
  ballId,
  diameterPx,
  tableScale,
  rotateTable,
  positions,
  pocketedMask,
  positionScale,
}: {
  ballId: number;
  diameterPx: number;
  tableScale: number;
  rotateTable: boolean;
  positions: SharedValue<number[]>;
  pocketedMask: SharedValue<number>;
  positionScale: number;
}) {
  const { colors } = useTheme();
  const palette = ballColor(ballId);
  const radiusPx = diameterPx / 2;

  const animStyle = useAnimatedStyle(() => {
    const p = positions.value;
    const mask = pocketedMask.value;
    const isPocketed = (mask & (1 << ballId)) !== 0;

    const physicalX = (p[ballId * 2] ?? 0) / positionScale;
    const physicalY = (p[ballId * 2 + 1] ?? 0) / positionScale;
    const viewX = rotateTable ? physicalY : physicalX;
    const viewY = rotateTable ? physicalX : physicalY;
    const left = viewX * tableScale - radiusPx;
    const top = viewY * tableScale - radiusPx;

    return {
      opacity: isPocketed ? 0 : 1,
      transform: [{ translateX: left }, { translateY: top }],
    };
  }, [ballId, positionScale, radiusPx, rotateTable, tableScale]);

  return (
    <Animated.View
      style={[
        styles.ball,
        {
          width: diameterPx,
          height: diameterPx,
          borderRadius: radiusPx,
          backgroundColor: palette.base,
          borderColor: colors.border,
        },
        animStyle,
      ]}
    >
      {palette.stripe ? (
        <View
          style={[
            styles.ballStripe,
            {
              backgroundColor: palette.stripe,
              borderRadius: radiusPx,
            },
          ]}
        />
      ) : null}

      <View style={[styles.ballNumber, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <AppText style={{ color: palette.text, fontSize: 10, fontWeight: "900" }}>
          {ballId === 0 ? "" : String(ballId)}
        </AppText>
      </View>
    </Animated.View>
  );
}

function formatEventSummary(eventType: string, payload: Json): { text: string; tone: "neutral" | "success" | "danger" } {
  if (eventType === "game_started") {
    return { text: "Game started.", tone: "success" };
  }

  if (eventType === "game_ended") {
    return { text: "Game ended.", tone: "neutral" };
  }

  if (eventType === "shot_taken") {
    const obj = asJsonObject(payload);
    const result = obj ? asJsonObject(obj.result ?? null) : null;
    const pocketedIds = result ? toNumberArray(result.pocketed_ball_ids) : null;
    const foul = result ? toBooleanValue(result.foul) : null;
    const scratch = result ? toBooleanValue(result.scratch) : null;

    const pocketedText = pocketedIds && pocketedIds.length > 0 ? `Pocketed ${pocketedIds.join(", ")}.` : "No pockets.";
    const foulText = foul ? (scratch ? " Foul (scratch)." : " Foul.") : "";

    return { text: `${pocketedText}${foulText}`, tone: foul ? "danger" : pocketedIds && pocketedIds.length > 0 ? "success" : "neutral" };
  }

  return { text: eventType, tone: "neutral" };
}

export function CueClashScreen({ onBack }: CueClashScreenProps) {
  const { colors, radius, spacing } = useTheme();
  const { width, height } = useWindowDimensions();
  const isLandscape = width > height;
  const rotateTable = !isLandscape;

  const gameState = useFamilyCueClash();
  const canShoot = gameState.canShoot;
  const shooting = gameState.shooting;
  const shoot = gameState.shoot;
  const [selectedPlayers, setSelectedPlayers] = useState<string[]>([]);

  const [tableLayout, setTableLayout] = useState<{ width: number; height: number } | null>(null);
  const [aimVectorPx, setAimVectorPx] = useState<{ x: number; y: number } | null>(null);
  const [aimPower, setAimPower] = useState(0);
  const [aimError, setAimError] = useState<string | null>(null);
  const [isAnimating, setIsAnimating] = useState(false);
  const [lastAnimatedEventId, setLastAnimatedEventId] = useState<number | null>(null);
  const aimVectorRef = useRef<{ x: number; y: number } | null>(null);
  const aimPowerRef = useRef(0);

  const ballsState = useMemo(() => {
    if (!gameState.game) {
      return null;
    }

    return parseCueClashBallsState(gameState.game.balls as Json);
  }, [gameState.game]);

  const positionScale = ballsState?.positionScale ?? 10;
  const tableConfig = ballsState?.table ?? { width: 1000, height: 500, ballRadius: 18, pocketRadius: 30 };

  const positionsSv = useSharedValue<number[]>(ballsState?.positions ?? new Array(32).fill(0));
  const pocketedMaskSv = useSharedValue<number>(ballsState?.pocketedMask ?? 0);
  const animationTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const tableAspectRatio = rotateTable ? tableConfig.height / tableConfig.width : tableConfig.width / tableConfig.height;
  const tableScale = tableLayout ? tableLayout.width / (rotateTable ? tableConfig.height : tableConfig.width) : 0;
  const ballDiameterPx = tableScale > 0 ? tableConfig.ballRadius * 2 * tableScale : 0;
  const railWidthPx = tableScale > 0 ? Math.max(8, Math.min(14, Math.round(ballDiameterPx * 0.52))) : 10;
  const pocketDiameterPx =
    tableScale > 0 ? Math.max(20, Math.min(38, Math.round(tableConfig.pocketRadius * 2 * tableScale))) : 26;
  const pocketInsetPx = Math.max(4, Math.round(railWidthPx - 4));
  const centerPocketOffsetPx = Math.max(2, pocketInsetPx - 4);

  useEffect(() => {
    if (!ballsState || isAnimating) {
      return;
    }

    positionsSv.value = ballsState.positions;
    pocketedMaskSv.value = ballsState.pocketedMask;
  }, [ballsState, isAnimating, pocketedMaskSv, positionsSv]);

  useEffect(() => {
    const latestShot = gameState.events.find((event) => event.eventType === "shot_taken") ?? null;
    if (!latestShot || latestShot.id === lastAnimatedEventId || isAnimating) {
      return;
    }

    const payloadObj = asJsonObject(latestShot.payload);
    const replayRaw = payloadObj?.replay ?? null;
    const replay = replayRaw ? parseCueClashReplay(replayRaw) : null;
    if (!replay || !tableLayout) {
      setLastAnimatedEventId(latestShot.id);
      return;
    }

    if (animationTimerRef.current) {
      clearInterval(animationTimerRef.current);
    }

    setIsAnimating(true);
    let frameIndex = 0;
    positionsSv.value = replay.frames[0].positions;
    pocketedMaskSv.value = replay.frames[0].pocketedMask;

    animationTimerRef.current = setInterval(() => {
      frameIndex += 1;
      if (frameIndex >= replay.frames.length) {
        if (animationTimerRef.current) {
          clearInterval(animationTimerRef.current);
          animationTimerRef.current = null;
        }

        if (ballsState) {
          positionsSv.value = ballsState.positions;
          pocketedMaskSv.value = ballsState.pocketedMask;
        }

        setLastAnimatedEventId(latestShot.id);
        setIsAnimating(false);
        return;
      }

      const frame = replay.frames[frameIndex];
      positionsSv.value = frame.positions;
      pocketedMaskSv.value = frame.pocketedMask;
    }, Math.max(16, Math.round(1000 / replay.frameRate)));

    return () => {
      if (animationTimerRef.current) {
        clearInterval(animationTimerRef.current);
        animationTimerRef.current = null;
      }
    };
  }, [ballsState, gameState.events, isAnimating, lastAnimatedEventId, pocketedMaskSv, positionsSv, tableLayout]);

  useEffect(() => {
    return () => {
      if (animationTimerRef.current) {
        clearInterval(animationTimerRef.current);
      }
    };
  }, []);

  const togglePlayer = useCallback((userId: string) => {
    setSelectedPlayers((prev) => {
      if (prev.includes(userId)) {
        return prev.filter((entry) => entry !== userId);
      }

      if (prev.length >= 2) {
        return prev;
      }

      return [...prev, userId];
    });
  }, []);

  const cueBallCenterPx = useMemo(() => {
    if (!ballsState || !tableLayout || tableScale <= 0) {
      return null;
    }

    const physicalCueX = ballsState.positions[0] / positionScale;
    const physicalCueY = ballsState.positions[1] / positionScale;
    const viewCueX = (rotateTable ? physicalCueY : physicalCueX) * tableScale;
    const viewCueY = (rotateTable ? physicalCueX : physicalCueY) * tableScale;
    return { x: viewCueX, y: viewCueY };
  }, [ballsState, positionScale, rotateTable, tableLayout, tableScale]);

  const panResponder = useMemo(() => {
    const maxDrag = 180;
    const canAim = canShoot && !isAnimating && !shooting;

    return PanResponder.create({
      onStartShouldSetPanResponder: () => canAim,
      onStartShouldSetPanResponderCapture: () => canAim,
      onMoveShouldSetPanResponder: () => canAim,
      onMoveShouldSetPanResponderCapture: () => canAim,
      onPanResponderGrant: (evt) => {
        setAimError(null);
        aimVectorRef.current = null;
        aimPowerRef.current = 0;
        if (!cueBallCenterPx) {
          setAimError("Cue ball not ready yet.");
          return;
        }

        const { locationX, locationY } = evt.nativeEvent;
        const dx = locationX - cueBallCenterPx.x;
        const dy = locationY - cueBallCenterPx.y;
        const dist = Math.hypot(dx, dy);
        if (dist > ballDiameterPx * 1.2) {
          setAimError("Start your drag near the cue ball.");
          setAimVectorPx(null);
          setAimPower(0);
          return;
        }

        const initialVector = { x: 0.001, y: 0.001 };
        aimVectorRef.current = initialVector;
        aimPowerRef.current = 0;
        setAimVectorPx({ x: 0.001, y: 0.001 });
        setAimPower(0);
      },
      onPanResponderMove: (evt) => {
        if (!cueBallCenterPx) {
          return;
        }

        const { locationX, locationY } = evt.nativeEvent;
        const dx = locationX - cueBallCenterPx.x;
        const dy = locationY - cueBallCenterPx.y;
        const dist = Math.hypot(dx, dy);
        const clampedDist = Math.min(maxDrag, dist);
        const scale = dist > 0 ? clampedDist / dist : 0;
        const nextVector = { x: dx * scale, y: dy * scale };
        const nextPower = clampedDist / maxDrag;
        aimVectorRef.current = nextVector;
        aimPowerRef.current = nextPower;
        setAimVectorPx(nextVector);
        setAimPower(nextPower);
      },
      onPanResponderRelease: async () => {
        const vector = aimVectorRef.current;
        if (!vector || !cueBallCenterPx || !tableScale || tableScale <= 0) {
          aimVectorRef.current = null;
          aimPowerRef.current = 0;
          setAimVectorPx(null);
          setAimPower(0);
          return;
        }

        const direction = rotateTable
          ? { x: vector.y / tableScale, y: vector.x / tableScale }
          : { x: vector.x / tableScale, y: vector.y / tableScale };
        const power = Math.max(0.05, Math.min(1, aimPowerRef.current));

        aimVectorRef.current = null;
        aimPowerRef.current = 0;
        setAimVectorPx(null);
        setAimPower(0);
        await shoot(direction, power);
      },
      onPanResponderTerminate: () => {
        aimVectorRef.current = null;
        aimPowerRef.current = 0;
        setAimVectorPx(null);
        setAimPower(0);
      },
      onPanResponderTerminationRequest: () => false,
    });
  }, [ballDiameterPx, canShoot, cueBallCenterPx, isAnimating, rotateTable, shoot, shooting, tableScale]);

  const handleTableLayout = useCallback((event: LayoutChangeEvent) => {
    const next = {
      width: event.nativeEvent.layout.width,
      height: event.nativeEvent.layout.height,
    };
    setTableLayout(next);
  }, []);

  const aimLine = useMemo(() => {
    if (!aimVectorPx || !cueBallCenterPx) {
      return null;
    }

    const dx = aimVectorPx.x;
    const dy = aimVectorPx.y;
    const angle = Math.atan2(dy, dx);
    const len = Math.hypot(dx, dy);

    return (
      <View
        pointerEvents="none"
        style={[
          styles.aimLine,
          {
            left: cueBallCenterPx.x - len / 2,
            top: cueBallCenterPx.y - 1,
            width: len,
            backgroundColor: colors.accent,
            transform: [{ rotate: `${angle}rad` }],
          },
        ]}
      />
    );
  }, [aimVectorPx, colors.accent, cueBallCenterPx]);

  const headerTag = gameState.game?.status === "active"
    ? gameState.isMyTurn
      ? { tone: "accent" as const, label: "Your turn" }
      : { tone: "success" as const, label: "Active" }
    : { tone: "neutral" as const, label: "No game" };

  if (gameState.loading) {
    return (
      <Screen>
        <InfoCard>
          <AppText variant="title">Cue Clash</AppText>
          <AppText muted>Loading...</AppText>
        </InfoCard>
      </Screen>
    );
  }

  return (
    <Screen padded={false}>
      <ScrollView
        scrollEnabled={aimVectorPx === null}
        contentContainerStyle={[
          styles.content,
          {
            gap: spacing.md,
            paddingHorizontal: spacing.lg,
            paddingTop: spacing.md,
            paddingBottom: spacing.xl,
          },
        ]}
      >
        <View style={[styles.headerRow, { gap: spacing.sm }]}>
          <IconButton onPress={onBack} accessibilityLabel="Back" size="sm">
            <AppText>{"\u2190"}</AppText>
          </IconButton>
          <View style={styles.headerTitle}>
            <AppText variant="heading">{gameState.roomTitle}</AppText>
            <View style={[styles.headerMeta, { gap: spacing.xs }]}>
              <Tag tone={headerTag.tone} label={headerTag.label} />
              {isAnimating ? <Tag tone="neutral" label="Animating" /> : null}
              {gameState.shooting ? <Tag tone="neutral" label="Shooting..." /> : null}
            </View>
          </View>
        </View>

        {gameState.error ? (
          <InfoCard>
            <AppText muted>{gameState.error}</AppText>
          </InfoCard>
        ) : null}

        {gameState.game ? (
          <View style={[styles.layout, isLandscape ? styles.layoutLandscape : null, { gap: spacing.md }]}>
            <View style={[styles.boardColumn, isLandscape ? styles.boardColumnLandscape : null]}>
              <InfoCard>
                <AppText variant="title">Table</AppText>
                <AppText muted>
                  Drag from the cue ball to aim. Bigger drag = more power.
                </AppText>
                {aimError ? <AppText muted>{aimError}</AppText> : null}

                <View
                  onLayout={handleTableLayout}
                  style={[
                    styles.table,
                    {
                      aspectRatio: tableAspectRatio,
                      borderColor: colors.border,
                      borderRadius: radius.lg,
                      backgroundColor: "#0B3D2E",
                    },
                  ]}
                  {...panResponder.panHandlers}
                >
                  <View style={[styles.rail, { borderRadius: radius.lg, borderColor: "#0F2A1F", borderWidth: railWidthPx }]} />
                  <View style={[styles.pocket, { left: pocketInsetPx, top: pocketInsetPx, width: pocketDiameterPx, height: pocketDiameterPx, borderRadius: pocketDiameterPx / 2 }]} />
                  <View
                    style={[
                      styles.pocket,
                      { left: "50%", top: centerPocketOffsetPx, marginLeft: -pocketDiameterPx / 2, width: pocketDiameterPx, height: pocketDiameterPx, borderRadius: pocketDiameterPx / 2 },
                    ]}
                  />
                  <View style={[styles.pocket, { right: pocketInsetPx, top: pocketInsetPx, width: pocketDiameterPx, height: pocketDiameterPx, borderRadius: pocketDiameterPx / 2 }]} />
                  <View style={[styles.pocket, { left: pocketInsetPx, bottom: pocketInsetPx, width: pocketDiameterPx, height: pocketDiameterPx, borderRadius: pocketDiameterPx / 2 }]} />
                  <View
                    style={[
                      styles.pocket,
                      { left: "50%", bottom: centerPocketOffsetPx, marginLeft: -pocketDiameterPx / 2, width: pocketDiameterPx, height: pocketDiameterPx, borderRadius: pocketDiameterPx / 2 },
                    ]}
                  />
                  <View style={[styles.pocket, { right: pocketInsetPx, bottom: pocketInsetPx, width: pocketDiameterPx, height: pocketDiameterPx, borderRadius: pocketDiameterPx / 2 }]} />

                  {aimLine}

                  {tableLayout && ballsState ? (
                    <>
                      {Array.from({ length: 16 }, (_, ballId) => (
                        <Ball
                          key={ballId}
                          ballId={ballId}
                          diameterPx={ballDiameterPx}
                          tableScale={tableScale}
                          rotateTable={rotateTable}
                          positions={positionsSv}
                          pocketedMask={pocketedMaskSv}
                          positionScale={positionScale}
                        />
                      ))}
                    </>
                  ) : null}

                  {aimVectorPx ? (
                    <View style={[styles.powerPill, { borderColor: colors.border, backgroundColor: colors.surface }]}>
                      <AppText variant="caption" muted>
                        Power {Math.round(aimPower * 100)}%
                      </AppText>
                    </View>
                  ) : null}
                </View>

                {!gameState.canShoot ? (
                  <AppText muted>Wait for your turn to shoot.</AppText>
                ) : null}
              </InfoCard>
            </View>

            <View style={[styles.sideColumn, isLandscape ? styles.sideColumnLandscape : null]}>
              <InfoCard>
                <AppText variant="title">Players</AppText>
                <View style={{ gap: 8 }}>
                  {gameState.players.map((player) => {
                    const isTurn = gameState.game?.current_turn_user_id === player.userId;
                    const suitLabel = player.suit ? (player.suit === "solids" ? "Solids" : "Stripes") : "Open";
                    return (
                      <View
                        key={player.userId}
                        style={[
                          styles.playerRow,
                          {
                            borderColor: isTurn ? colors.accent : colors.border,
                            backgroundColor: colors.background,
                            borderRadius: radius.md,
                          },
                        ]}
                      >
                        <View style={{ flex: 1, minWidth: 0 }}>
                          <AppText>{player.displayName}</AppText>
                          <AppText variant="caption" muted>
                            {suitLabel} • Fouls: {player.fouls}
                          </AppText>
                        </View>
                        {isTurn ? <Tag tone="accent" label="Turn" /> : null}
                      </View>
                    );
                  })}
                </View>

                {gameState.role === "admin" ? (
                  <PrimaryButton
                    tone="danger"
                    onPress={() => void gameState.endGame()}
                    disabled={!gameState.canEndGame || gameState.endingGame}
                  >
                    {gameState.endingGame ? "Ending..." : "End Game"}
                  </PrimaryButton>
                ) : null}
              </InfoCard>

              <InfoCard>
                <AppText variant="title">Game Log</AppText>
                {gameState.events.length === 0 ? (
                  <AppText muted>No events yet.</AppText>
                ) : (
                  <View style={{ gap: 8 }}>
                    {gameState.events.slice(0, 6).map((event) => {
                      const summary = formatEventSummary(event.eventType, event.payload);
                      return (
                        <View
                          key={event.id}
                          style={[
                            styles.logRow,
                            {
                              borderColor: colors.border,
                              backgroundColor: colors.background,
                              borderRadius: radius.md,
                            },
                          ]}
                        >
                          <AppText muted>{summary.text}</AppText>
                        </View>
                      );
                    })}
                  </View>
                )}
              </InfoCard>
            </View>
          </View>
        ) : (
          <InfoCard>
            <AppText variant="title">Start a Game</AppText>
            <AppText muted>8-ball rules with server-authoritative physics. 2 players max (1-player admin testing allowed).</AppText>

            {gameState.role === "admin" ? (
              <>
                <AppText variant="caption" muted>
                  Select players (max 2):
                </AppText>
                <View style={[styles.selectionGrid, { gap: spacing.sm }]}>
                  {gameState.familyMembers.map((member) => {
                    const selected = selectedPlayers.includes(member.userId);
                    const disabled = !selected && selectedPlayers.length >= 2;
                    return (
                      <Pressable
                        key={member.userId}
                        onPress={() => togglePlayer(member.userId)}
                        disabled={disabled}
                        style={({ pressed }) => [
                          styles.selectionChip,
                          {
                            backgroundColor: selected ? colors.primary : colors.background,
                            borderColor: selected ? colors.primary : colors.border,
                            borderRadius: radius.lg,
                            opacity: disabled ? 0.45 : pressed ? 0.85 : 1,
                          },
                        ]}
                      >
                        <AppText style={{ color: selected ? "#FFFFFF" : colors.text }}>{member.displayName}</AppText>
                        <AppText variant="caption" muted style={{ color: selected ? "#E2E8F0" : colors.textMuted }}>
                          {member.role === "admin" ? "Admin" : "Member"}
                        </AppText>
                      </Pressable>
                    );
                  })}
                </View>
                <PrimaryButton
                  onPress={() => void gameState.startGame(selectedPlayers.length > 0 ? selectedPlayers : undefined)}
                  disabled={!gameState.canStartGame || gameState.startingGame || selectedPlayers.length === 0}
                >
                  {gameState.startingGame ? "Starting..." : "Start Cue Clash"}
                </PrimaryButton>
              </>
            ) : (
              <AppText muted>Ask the admin to start a Cue Clash game.</AppText>
            )}
          </InfoCard>
        )}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    flexGrow: 1,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  headerTitle: {
    flex: 1,
    minWidth: 0,
    gap: 4,
  },
  headerMeta: {
    flexDirection: "row",
    flexWrap: "wrap",
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
    flex: 1.4,
  },
  sideColumn: {
    width: "100%",
  },
  sideColumnLandscape: {
    flex: 1,
  },
  table: {
    width: "100%",
    borderWidth: 1,
    overflow: "hidden",
    position: "relative",
    marginTop: 10,
  },
  rail: {
    ...StyleSheet.absoluteFillObject,
    borderColor: "#0F2A1F",
    opacity: 0.7,
  },
  pocket: {
    position: "absolute",
    backgroundColor: "#020617",
    opacity: 0.9,
  },
  ball: {
    position: "absolute",
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000000",
    shadowOpacity: 0.24,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  ballStripe: {
    position: "absolute",
    left: 0,
    right: 0,
    top: "32%",
    height: "36%",
    opacity: 0.95,
  },
  ballNumber: {
    width: 16,
    height: 16,
    borderRadius: 999,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  aimLine: {
    position: "absolute",
    height: 2,
    borderRadius: 999,
  },
  powerPill: {
    position: "absolute",
    right: 10,
    top: 10,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  selectionGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
  },
  selectionChip: {
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
    minWidth: 140,
    gap: 2,
  },
  playerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderWidth: 1,
    padding: 10,
  },
  logRow: {
    borderWidth: 1,
    padding: 10,
  },
});
