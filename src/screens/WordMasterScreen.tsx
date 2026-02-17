import { useEffect, useMemo, useRef, useState } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from "react-native-reanimated";

import { getWordMasterSquareBonus } from "../features/wordMaster/boardBonuses";
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
  const isEmpty = letter.trim().length === 0;

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
          styles.tileShadow,
          animatedStyle,
          {
            backgroundColor: isEmpty ? colors.surfaceMuted : selected ? colors.tileFacePressed : colors.tileFace,
            borderColor: selected ? colors.accent : isEmpty ? colors.border : colors.tileBorder,
            borderRadius: radius.sm,
          },
        ]}
      >
        {!isEmpty ? (
          <>
            <View
              pointerEvents="none"
              style={[
                styles.tileHighlight,
                {
                  borderRadius: Math.max(0, radius.sm - 4),
                },
              ]}
            />
            <View
              pointerEvents="none"
              style={[
                styles.tileShade,
                {
                  borderRadius: Math.max(0, radius.sm - 4),
                },
              ]}
            />
            <AppText style={[styles.tileLetter, { color: colors.text }]}>{letter}</AppText>
            <AppText style={[styles.tilePoints, { color: colors.textMuted }]}>{points}</AppText>
          </>
        ) : null}
      </Animated.View>
    </Pressable>
  );
}

function BoardTile({ letter, points }: { letter: string; points: number }) {
  const { colors, radius } = useTheme();

  return (
    <View
      style={[
        styles.boardTile,
        styles.tileShadow,
        {
          backgroundColor: colors.tileFace,
          borderColor: colors.tileBorder,
          borderRadius: radius.sm,
        },
      ]}
    >
      <View
        pointerEvents="none"
        style={[
          styles.tileHighlight,
          {
            borderRadius: Math.max(0, radius.sm - 4),
          },
        ]}
      />
      <View
        pointerEvents="none"
        style={[
          styles.tileShade,
          {
            borderRadius: Math.max(0, radius.sm - 4),
          },
        ]}
      />
      <AppText style={styles.boardTileLetter}>{letter}</AppText>
      <AppText style={styles.boardTilePoints}>{points}</AppText>
    </View>
  );
}

function BoardCell({
  canInteract,
  isCenter,
  isDraft,
  bonusLabel,
  backgroundColor,
  borderColor,
  tile,
  onPress,
}: {
  canInteract: boolean;
  isCenter: boolean;
  isDraft: boolean;
  bonusLabel: string | null;
  backgroundColor: string;
  borderColor: string;
  tile: { letter: string; points: number } | null;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  const baseScale = useSharedValue(1);
  const popScale = useSharedValue(1);
  const lastLetterRef = useRef<string | null>(null);

  useEffect(() => {
    baseScale.value = withSpring(isDraft ? 1.03 : 1, { damping: 14, stiffness: 260 });
  }, [baseScale, isDraft]);

  useEffect(() => {
    const currentLetter = tile?.letter ?? null;
    if (currentLetter && lastLetterRef.current !== currentLetter) {
      popScale.value = 1.12;
      popScale.value = withSpring(1, { damping: 13, stiffness: 280 });
    }
    lastLetterRef.current = currentLetter;
  }, [popScale, tile?.letter]);

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: baseScale.value * popScale.value }],
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
          <BoardTile letter={tile.letter} points={tile.points} />
        ) : (
          <View style={styles.boardBonusWrap}>
            {isCenter ? <AppText style={styles.boardStar}>{"\u2605"}</AppText> : null}
            {bonusLabel ? (
              <AppText style={[styles.boardBonusLabel, { color: colors.textMuted }]}>{bonusLabel}</AppText>
            ) : null}
          </View>
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

  const lastTurnDetails = useMemo(() => {
    const event = gameState.events[0];
    if (!event || event.eventType !== "turn_played") {
      return null;
    }

    const payload = asJsonObject(event.payload);
    const totalPoints = toNumberValue(payload?.points) ?? null;
    const bingoBonus = toNumberValue(payload?.bingo_bonus) ?? 0;

    const wordsValue = payload?.words;
    const words: {
      direction: string;
      word: string;
      points: number;
      basePoints: number | null;
      wordMultiplier: number | null;
      bonuses: string[];
    }[] = [];

    if (Array.isArray(wordsValue)) {
      for (const entry of wordsValue) {
        const wordPayload = asJsonObject(entry as Json);
        const word = toStringValue(wordPayload?.word) ?? null;
        const direction = toStringValue(wordPayload?.direction) ?? null;
        const points = toNumberValue(wordPayload?.points) ?? null;
        const basePoints = toNumberValue(wordPayload?.base_points) ?? null;
        const wordMultiplier = toNumberValue(wordPayload?.word_multiplier) ?? null;

        const bonusesRaw = wordPayload?.bonuses;
        const bonuses = Array.isArray(bonusesRaw)
          ? bonusesRaw
              .map((bonus) => toStringValue(bonus as Json))
              .filter((bonus): bonus is string => Boolean(bonus))
          : [];

        if (word && direction && points !== null) {
          words.push({
            direction,
            word,
            points,
            basePoints,
            wordMultiplier,
            bonuses,
          });
        }
      }
    }

    return {
      totalPoints,
      bingoBonus,
      words,
    };
  }, [gameState.events]);

  const errorCard = useMemo(() => {
    const message = gameState.error?.trim();
    if (!message) {
      return null;
    }

    const invalidMatch = message.match(/^invalid word\(s\):\s*(.+)$/i);
    if (invalidMatch) {
      const words = invalidMatch[1]
        .split(",")
        .map((word) => word.trim())
        .filter((word) => word.length > 0)
        .slice(0, 10);

      return {
        title: "Not in the dictionary",
        message: "Try a different word or adjust your tiles.",
        items: words,
      };
    }

    if (message.toLowerCase().includes("dictionary is not configured")) {
      return {
        title: "Dictionary not configured",
        message:
          "This Supabase Postgres instance is missing the offline ispell dictionary files required for strict validation.",
        items: [],
      };
    }

    return { title: "Word Master Status", message, items: [] as string[] };
  }, [gameState.error]);

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
        {errorCard ? (
          <InfoCard>
            <AppText variant="title">{errorCard.title}</AppText>
            {errorCard.items.length > 0 ? (
              <View style={[styles.errorItems, { gap: spacing.xs, marginTop: spacing.sm }]}>
                {errorCard.items.map((word) => (
                  <Tag key={word} tone="danger" label={word} />
                ))}
              </View>
            ) : null}
            <AppText muted style={errorCard.items.length > 0 ? { marginTop: spacing.sm } : undefined}>
              {errorCard.message}
            </AppText>
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
                styles.boardFrame,
                {
                  borderRadius: radius.lg,
                  backgroundColor: colors.boardFrame,
                  padding: spacing.sm,
                },
              ]}
            >
              <View
                style={[
                  styles.board,
                  {
                    borderRadius: radius.md,
                    borderColor: colors.border,
                    backgroundColor: colors.boardCell,
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
                        const bonus = getWordMasterSquareBonus(boardSize, row, col);
                        const tile = serverTile ?? (draftTile ? { letter: draftTile.letter, points: resolveTilePoints(draftTile.letter) } : null);
                        let backgroundColor = colors.boardCell;
                        if (bonus.label === "TW") {
                          backgroundColor = colors.bonusTW;
                        } else if (bonus.label === "DW") {
                          backgroundColor = colors.bonusDW;
                        } else if (bonus.label === "TL") {
                          backgroundColor = colors.bonusTL;
                        } else if (bonus.label === "DL") {
                          backgroundColor = colors.bonusDL;
                        }
                        if (isDraft) {
                          backgroundColor = colors.accentMuted;
                        }
                        return (
                          <BoardCell
                            key={key}
                            canInteract={canInteract}
                            isCenter={isCenter}
                            isDraft={isDraft}
                            bonusLabel={bonus.label}
                            backgroundColor={backgroundColor}
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
            </View>

            {lastTurnDetails ? (
              <InfoCard>
                <View style={[styles.lastTurnHeader, { gap: spacing.sm }]}>
                  <AppText variant="title">Last Turn</AppText>
                  {typeof lastTurnDetails.totalPoints === "number" ? (
                    <Tag tone="accent" label={`+${lastTurnDetails.totalPoints}`} />
                  ) : null}
                </View>

                {lastTurnDetails.words.length > 0 ? (
                  <View style={[styles.lastTurnList, { gap: spacing.xs, marginTop: spacing.sm }]}>
                    {lastTurnDetails.words.map((wordEntry, index) => {
                      const bonusText = wordEntry.bonuses.length > 0 ? ` (${wordEntry.bonuses.join(" · ")})` : "";
                      const formula =
                        wordEntry.basePoints !== null
                          ? `${wordEntry.basePoints}${
                              wordEntry.wordMultiplier && wordEntry.wordMultiplier > 1 ? ` ×${wordEntry.wordMultiplier}` : ""
                            }${bonusText}`
                          : null;
                      return (
                        <View key={`${wordEntry.direction}:${wordEntry.word}:${index}`} style={[styles.lastTurnRow, { gap: spacing.sm }]}>
                          <View style={styles.lastTurnWord}>
                            <AppText style={{ fontWeight: "900" }}>{wordEntry.word}</AppText>
                            {formula ? (
                              <AppText variant="caption" muted>
                                {formula}
                              </AppText>
                            ) : null}
                          </View>
                          <Tag tone="neutral" label={`+${wordEntry.points}`} />
                        </View>
                      );
                    })}
                  </View>
                ) : (
                  <AppText muted>No scored words.</AppText>
                )}

                {lastTurnDetails.bingoBonus > 0 ? (
                  <View style={{ marginTop: spacing.sm }}>
                    <Tag tone="success" label={`Bingo +${lastTurnDetails.bingoBonus}`} />
                  </View>
                ) : null}
              </InfoCard>
            ) : null}

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
              Place letter tiles to build words on the board. First word must cross the center star. Words must be valid.
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
  errorItems: {
    flexDirection: "row",
    flexWrap: "wrap",
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
  lastTurnHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  lastTurnList: {},
  lastTurnRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  lastTurnWord: {
    flex: 1,
    minWidth: 0,
  },
  boardFrame: {
    width: "100%",
    aspectRatio: 1,
  },
  board: {
    flex: 1,
    borderWidth: 2,
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
    padding: 1,
  },
  boardCellInner: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  boardBonusWrap: {
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
  },
  boardStar: {
    fontSize: 12,
    fontWeight: "900",
  },
  boardBonusLabel: {
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 0.4,
  },
  boardTile: {
    width: "92%",
    height: "92%",
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
  },
  boardTileLetter: {
    fontSize: 16,
    fontWeight: "900",
  },
  boardTilePoints: {
    position: "absolute",
    bottom: 2,
    right: 3,
    fontSize: 9,
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
  tileShadow: {
    shadowColor: "#0F172A",
    shadowOpacity: 0.12,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
  tileHighlight: {
    position: "absolute",
    top: 4,
    left: 4,
    right: 10,
    height: "45%",
    backgroundColor: "#FFFFFF",
    opacity: 0.22,
  },
  tileShade: {
    position: "absolute",
    bottom: 4,
    left: 10,
    right: 4,
    height: "35%",
    backgroundColor: "#0F172A",
    opacity: 0.05,
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
