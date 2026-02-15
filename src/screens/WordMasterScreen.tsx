import { useEffect, useMemo, useState } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from "react-native-reanimated";

import { useFamilyWordMaster, WordMasterPlacement } from "../features/wordMaster/useFamilyWordMaster";
import { Json } from "../lib/database.types";
import { AppText } from "../ui/primitives/AppText";
import { IconButton } from "../ui/primitives/IconButton";
import { InfoCard } from "../ui/primitives/InfoCard";
import { PrimaryButton } from "../ui/primitives/PrimaryButton";
import { Screen } from "../ui/primitives/Screen";
import { Tag } from "../ui/primitives/Tag";
import { useTheme } from "../ui/theme/ThemeProvider";

type WordMasterScreenProps = {
  onBack: () => void;
};

type DraftPlacement = WordMasterPlacement & { rackIndex: number };

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

function resolveTilePoints(letter: string): number {
  switch (letter.toUpperCase()) {
    case "A":
    case "E":
    case "I":
    case "O":
    case "U":
    case "L":
    case "N":
    case "S":
    case "T":
    case "R":
      return 1;
    case "D":
    case "G":
      return 2;
    case "B":
    case "C":
    case "M":
    case "P":
      return 3;
    case "F":
    case "H":
    case "V":
    case "W":
    case "Y":
      return 4;
    case "K":
      return 5;
    case "J":
    case "X":
      return 8;
    case "Q":
    case "Z":
      return 10;
    default:
      return 0;
  }
}

function Tile({
  letter,
  points,
  selected,
  disabled,
  onPress,
}: {
  letter: string;
  points: number;
  selected: boolean;
  disabled: boolean;
  onPress: () => void;
}) {
  const { colors, radius } = useTheme();
  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <Pressable
      disabled={disabled}
      onPress={() => {
        scale.value = withSpring(0.96, { damping: 14, stiffness: 280 }, () => {
          scale.value = withSpring(1, { damping: 14, stiffness: 280 });
        });
        onPress();
      }}
      style={({ pressed }) => [
        styles.tileButton,
        {
          opacity: disabled ? 0.4 : pressed ? 0.9 : 1,
        },
      ]}
    >
      <Animated.View
        style={[
          styles.tile,
          animatedStyle,
          {
            backgroundColor: selected ? colors.accentMuted : colors.surface,
            borderColor: selected ? colors.accent : colors.border,
            borderRadius: radius.sm,
          },
        ]}
      >
        <AppText style={[styles.tileLetter, { color: colors.text }]}>{letter}</AppText>
        <AppText style={[styles.tilePoints, { color: colors.textMuted }]}>{points}</AppText>
      </Animated.View>
    </Pressable>
  );
}

function BoardCell({
  canInteract,
  isCenter,
  isDraft,
  backgroundColor,
  borderColor,
  tile,
  onPress,
}: {
  canInteract: boolean;
  isCenter: boolean;
  isDraft: boolean;
  backgroundColor: string;
  borderColor: string;
  tile: { letter: string; points: number } | null;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  const scale = useSharedValue(1);

  useEffect(() => {
    scale.value = withSpring(isDraft ? 1.03 : 1, { damping: 14, stiffness: 260 });
  }, [isDraft, scale]);

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.boardCell,
        {
          borderColor,
          backgroundColor,
          opacity: pressed && canInteract ? 0.9 : 1,
        },
      ]}
    >
      <Animated.View style={[styles.boardCellInner, animStyle]}>
        {tile ? (
          <>
            <AppText style={styles.boardLetter}>{tile.letter}</AppText>
            <AppText style={styles.boardPoints}>{tile.points}</AppText>
          </>
        ) : (
          <AppText style={[styles.boardDot, { color: colors.textMuted }]}>{isCenter ? "\u2605" : ""}</AppText>
        )}
      </Animated.View>
    </Pressable>
  );
}

export function WordMasterScreen({ onBack }: WordMasterScreenProps) {
  const { colors, radius, spacing } = useTheme();
  const gameState = useFamilyWordMaster();

  const [selectedPlayers, setSelectedPlayers] = useState<string[]>([]);
  const [selectedRackIndex, setSelectedRackIndex] = useState<number | null>(null);
  const [draftPlacements, setDraftPlacements] = useState<DraftPlacement[]>([]);

  useEffect(() => {
    if (gameState.currentUserId && selectedPlayers.length === 0) {
      setSelectedPlayers([gameState.currentUserId]);
    }
  }, [gameState.currentUserId, selectedPlayers.length]);

  const boardSize = gameState.game?.board_size ?? 11;
  const center = Math.floor((boardSize + 1) / 2);

  const myRack = useMemo(() => {
    if (!gameState.currentUserId) {
      return [];
    }

    return gameState.players.find((player) => player.userId === gameState.currentUserId)?.rack ?? [];
  }, [gameState.currentUserId, gameState.players]);

  const usedRackIndices = useMemo(() => new Set(draftPlacements.map((entry) => entry.rackIndex)), [draftPlacements]);

  const tileByKey = useMemo(() => {
    const map = new Map<string, { letter: string; points: number }>();
    for (const tile of gameState.boardTiles) {
      map.set(`${tile.row},${tile.col}`, { letter: tile.letter, points: tile.points });
    }
    return map;
  }, [gameState.boardTiles]);

  const draftByKey = useMemo(() => {
    const map = new Map<string, DraftPlacement>();
    for (const placement of draftPlacements) {
      map.set(`${placement.row},${placement.col}`, placement);
    }
    return map;
  }, [draftPlacements]);

  const currentTurnName = useMemo(() => {
    const currentTurnUserId = gameState.game?.current_turn_user_id;
    if (!currentTurnUserId) {
      return null;
    }

    return gameState.players.find((player) => player.userId === currentTurnUserId)?.displayName ?? null;
  }, [gameState.game?.current_turn_user_id, gameState.players]);

  const recentSummary = useMemo(() => {
    const event = gameState.events[0];
    if (!event) {
      return null;
    }

    if (event.eventType === "turn_played") {
      const payload = asJsonObject(event.payload);
      const points = toNumberValue(payload?.points) ?? null;
      const words = payload?.words;
      if (Array.isArray(words)) {
        const firstWord = asJsonObject(words[0] as Json);
        const word = toStringValue(firstWord?.word) ?? null;
        if (word && points !== null) {
          return `${word} (+${points})`;
        }
      }

      if (points !== null) {
        return `Turn played (+${points})`;
      }
    }

    if (event.eventType === "turn_passed") {
      return "Turn passed";
    }

    return null;
  }, [gameState.events]);

  const canInteract = gameState.canPlayTurn && !gameState.playingTurn;

  const clearDraft = () => {
    setDraftPlacements([]);
    setSelectedRackIndex(null);
  };

  const togglePlayer = (userId: string) => {
    setSelectedPlayers((current) => {
      if (current.includes(userId)) {
        return current.filter((entry) => entry !== userId);
      }
      return [...current, userId];
    });
  };

  const onBoardPress = (row: number, col: number) => {
    if (!canInteract) {
      return;
    }

    const key = `${row},${col}`;
    if (tileByKey.has(key)) {
      return;
    }

    const existingDraft = draftByKey.get(key);
    if (existingDraft) {
      setDraftPlacements((current) => current.filter((entry) => !(entry.row === row && entry.col === col)));
      return;
    }

    if (selectedRackIndex === null) {
      return;
    }

    if (usedRackIndices.has(selectedRackIndex)) {
      setSelectedRackIndex(null);
      return;
    }

    const letter = myRack[selectedRackIndex] ?? "";
    if (!letter) {
      setSelectedRackIndex(null);
      return;
    }

    setDraftPlacements((current) => [...current, { row, col, letter, rackIndex: selectedRackIndex }]);
    setSelectedRackIndex(null);
  };

  const submitTurn = async () => {
    if (!gameState.canPlayTurn || draftPlacements.length === 0) {
      return;
    }

    const placements: WordMasterPlacement[] = draftPlacements.map((entry) => ({
      row: entry.row,
      col: entry.col,
      letter: entry.letter,
    }));

    const ok = await gameState.playTurn(placements);
    if (ok) {
      clearDraft();
    }
  };

  return (
    <Screen padded={false}>
      <View style={[styles.header, { paddingHorizontal: spacing.lg, paddingTop: spacing.md }]}>
        <View style={[styles.headerRow, { gap: spacing.sm }]}>
          <IconButton onPress={onBack} accessibilityLabel="Back">
            <AppText style={{ fontWeight: "900" }}>{"\u2039"}</AppText>
          </IconButton>
          <View style={styles.headerTitle}>
            <AppText variant="heading">Word Master</AppText>
            <View style={[styles.headerMeta, { gap: spacing.sm }]}>
              {gameState.game?.status === "active" ? <Tag tone="success" label={gameState.isMyTurn ? "Your turn" : "Active"} /> : null}
              {currentTurnName ? <Tag tone="neutral" label={`Turn: ${currentTurnName}`} /> : null}
            </View>
          </View>
        </View>
        {recentSummary ? (
          <View style={{ marginTop: spacing.sm }}>
            <Tag tone="accent" label={recentSummary} />
          </View>
        ) : null}
      </View>

      <ScrollView
        contentContainerStyle={[
          styles.content,
          {
            padding: spacing.lg,
            gap: spacing.md,
            paddingBottom: spacing.xl,
          },
        ]}
      >
        {gameState.error ? (
          <InfoCard>
            <AppText variant="title">Word Master Status</AppText>
            <AppText muted>{gameState.error}</AppText>
          </InfoCard>
        ) : null}

        {gameState.game ? (
          <>
            <View style={[styles.scoreRow, { gap: spacing.sm }]}>
              {gameState.players.map((player) => {
                const isCurrent = gameState.game?.current_turn_user_id === player.userId;
                return (
                  <View
                    key={player.userId}
                    style={[
                      styles.scoreChip,
                      {
                        borderColor: isCurrent ? colors.accent : colors.border,
                        backgroundColor: isCurrent ? colors.surfaceMuted : colors.surface,
                        borderRadius: radius.lg,
                      },
                    ]}
                  >
                    <AppText variant="caption" muted={!isCurrent}>
                      {player.displayName}
                    </AppText>
                    <AppText style={{ fontWeight: "900" }}>{player.score}</AppText>
                  </View>
                );
              })}
            </View>

            <View
              style={[
                styles.board,
                {
                  borderRadius: radius.md,
                  borderColor: colors.border,
                  backgroundColor: colors.surface,
                },
              ]}
            >
              {Array.from({ length: boardSize }, (_, rowIndex) => {
                const row = rowIndex + 1;
                return (
                  <View key={row} style={styles.boardRow}>
                    {Array.from({ length: boardSize }, (_, colIndex) => {
                      const col = colIndex + 1;
                      const key = `${row},${col}`;
                      const serverTile = tileByKey.get(key) ?? null;
                      const draftTile = draftByKey.get(key) ?? null;
                      const isCenter = row === center && col === center;
                      const isDraft = Boolean(draftTile);
                      const tile = serverTile ?? (draftTile ? { letter: draftTile.letter, points: resolveTilePoints(draftTile.letter) } : null);
                      return (
                        <BoardCell
                          key={key}
                          canInteract={canInteract}
                          isCenter={isCenter}
                          isDraft={isDraft}
                          backgroundColor={isDraft ? colors.accentMuted : isCenter ? colors.surfaceMuted : colors.background}
                          borderColor={colors.border}
                          tile={tile}
                          onPress={() => onBoardPress(row, col)}
                        />
                      );
                    })}
                  </View>
                );
              })}
            </View>

            <InfoCard>
              <View style={[styles.rackHeader, { gap: spacing.sm }]}>
                <AppText variant="title">Your Tiles</AppText>
                <Tag tone="neutral" label={`Bag: ${gameState.game.bag.length}`} />
              </View>

              <View style={[styles.rackRow, { gap: spacing.xs }]}>
                {myRack.map((letter, index) => {
                  const used = usedRackIndices.has(index);
                  return (
                    <Tile
                      key={`${index}:${letter}`}
                      letter={used ? "" : letter}
                      points={used ? 0 : resolveTilePoints(letter)}
                      selected={selectedRackIndex === index}
                      disabled={!canInteract || used}
                      onPress={() => {
                        setSelectedRackIndex((current) => (current === index ? null : index));
                      }}
                    />
                  );
                })}
              </View>

              <View style={[styles.actionsRow, { gap: spacing.sm }]}>
                <PrimaryButton tone="neutral" size="sm" onPress={clearDraft} disabled={!canInteract || draftPlacements.length === 0}>
                  Clear
                </PrimaryButton>
                <PrimaryButton tone="neutral" size="sm" onPress={() => void gameState.passTurn()} disabled={!gameState.canPassTurn || gameState.passingTurn}>
                  {gameState.passingTurn ? "Passing..." : "Pass"}
                </PrimaryButton>
                <PrimaryButton onPress={() => void submitTurn()} disabled={!gameState.canPlayTurn || draftPlacements.length === 0 || gameState.playingTurn}>
                  {gameState.playingTurn ? "Submitting..." : "Submit"}
                </PrimaryButton>
              </View>

              {gameState.role === "admin" ? (
                <PrimaryButton tone="danger" onPress={() => void gameState.endGame()} disabled={!gameState.canEndGame || gameState.endingGame}>
                  {gameState.endingGame ? "Ending..." : "End Game"}
                </PrimaryButton>
              ) : null}
            </InfoCard>
          </>
        ) : (
          <InfoCard>
            <AppText variant="title">Start a Game</AppText>
            <AppText muted>
              Place letter tiles to build words on the board. First word must cross the center star.
            </AppText>

            {gameState.role === "admin" ? (
              <>
                <AppText variant="caption" muted>
                  Select players (1-player test mode allowed):
                </AppText>
                <View style={[styles.selectionGrid, { gap: spacing.sm }]}>
                  {gameState.familyMembers.map((member) => {
                    const selected = selectedPlayers.includes(member.userId);
                    return (
                      <Pressable
                        key={member.userId}
                        onPress={() => togglePlayer(member.userId)}
                        style={({ pressed }) => [
                          styles.selectionChip,
                          {
                            backgroundColor: selected ? colors.primary : colors.background,
                            borderColor: selected ? colors.primary : colors.border,
                            borderRadius: radius.lg,
                            opacity: pressed ? 0.85 : 1,
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
                  disabled={!gameState.canStartGame || gameState.startingGame}
                >
                  {gameState.startingGame ? "Starting..." : "Start Word Master"}
                </PrimaryButton>
              </>
            ) : (
              <AppText muted>Ask the admin to start a Word Master game.</AppText>
            )}
          </InfoCard>
        )}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingBottom: 12,
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
  content: {
    flexGrow: 1,
  },
  scoreRow: {
    flexDirection: "row",
    flexWrap: "wrap",
  },
  scoreChip: {
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
    minWidth: 110,
    gap: 2,
  },
  board: {
    width: "100%",
    aspectRatio: 1,
    borderWidth: 1,
    overflow: "hidden",
  },
  boardRow: {
    flex: 1,
    flexDirection: "row",
  },
  boardCell: {
    flex: 1,
    borderRightWidth: 1,
    borderBottomWidth: 1,
  },
  boardCellInner: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  boardLetter: {
    fontSize: 16,
    fontWeight: "900",
  },
  boardPoints: {
    position: "absolute",
    bottom: 3,
    right: 4,
    fontSize: 9,
    fontWeight: "800",
  },
  boardDot: {
    fontSize: 12,
    fontWeight: "900",
  },
  rackHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  rackRow: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  tileButton: {
    flex: 1,
    minWidth: 0,
  },
  tile: {
    aspectRatio: 1,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
  },
  tileLetter: {
    fontSize: 18,
    fontWeight: "900",
  },
  tilePoints: {
    position: "absolute",
    bottom: 3,
    right: 4,
    fontSize: 10,
    fontWeight: "800",
  },
  actionsRow: {
    flexDirection: "row",
    alignItems: "center",
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
});
