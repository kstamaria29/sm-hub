import { useEffect, useState } from "react";
import { Image, Pressable, RefreshControl, ScrollView, StyleSheet, View, useWindowDimensions } from "react-native";

import { avatarExpressionLabel } from "../features/avatar/avatarPack";
import { buildClassicBoardCells } from "../features/game/board";
import { GameEventView, useFamilyGame } from "../features/game/useFamilyGame";
import { Json } from "../lib/database.types";
import { AppText } from "../ui/primitives/AppText";
import { InfoCard } from "../ui/primitives/InfoCard";
import { PrimaryButton } from "../ui/primitives/PrimaryButton";
import { Screen } from "../ui/primitives/Screen";
import { useTheme } from "../ui/theme/ThemeProvider";

const BOARD_CELLS = buildClassicBoardCells();

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

export function GamesScreen() {
  const { colors, spacing } = useTheme();
  const { width, height } = useWindowDimensions();
  const gameState = useFamilyGame();
  const isLandscape = width > height;
  const [selectedPlayerIds, setSelectedPlayerIds] = useState<string[]>([]);

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
    <Screen>
      <ScrollView
        contentContainerStyle={[styles.content, { gap: spacing.md, paddingBottom: spacing.xl }]}
        refreshControl={<RefreshControl refreshing={gameState.loading} onRefresh={() => void gameState.refresh()} />}
      >
        <AppText variant="heading">Games</AppText>

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

              <View style={[styles.boardGrid, { borderColor: colors.border, backgroundColor: colors.surface }]}>
                {BOARD_CELLS.map((cell) => {
                  const tilePlayers = playersByTile.get(cell.tile) ?? [];

                  return (
                    <View
                      key={cell.tile}
                      style={[
                        styles.boardCell,
                        {
                          borderColor: colors.border,
                          backgroundColor: (cell.row + cell.column) % 2 === 0 ? "#f8f9fb" : "#eef2f6",
                        },
                      ]}
                    >
                      <View style={styles.cellHeader}>
                        <AppText variant="caption" muted>
                          {cell.tile}
                        </AppText>
                        {cell.jumpType ? (
                          <AppText
                            variant="caption"
                            style={{
                              color: cell.jumpType === "ladder" ? "#1b7f3b" : "#9b2c2c",
                            }}
                          >
                            {cell.jumpType === "ladder" ? `L${cell.jumpTo}` : `S${cell.jumpTo}`}
                          </AppText>
                        ) : null}
                      </View>

                      <View style={styles.tileTokenRow}>
                        {tilePlayers.slice(0, 3).map((player) => {
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
                                {
                                  borderColor: isCurrentTurn ? colors.primary : colors.border,
                                  backgroundColor: colors.surface,
                                },
                              ]}
                            >
                              {player.avatarUrl ? (
                                <Image source={{ uri: player.avatarUrl }} style={styles.tileTokenImage} />
                              ) : (
                                <AppText variant="caption" muted>
                                  {player.playerOrder}
                                </AppText>
                              )}
                            </View>
                          );
                        })}
                        {tilePlayers.length > 3 ? (
                          <AppText variant="caption" muted>
                            +{tilePlayers.length - 3}
                          </AppText>
                        ) : null}
                      </View>
                    </View>
                  );
                })}
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
  boardGrid: {
    width: "100%",
    aspectRatio: 1,
    flexDirection: "row",
    flexWrap: "wrap",
    borderWidth: 1,
    borderRadius: 14,
    overflow: "hidden",
  },
  boardCell: {
    width: "10%",
    borderWidth: 0.5,
    padding: 2,
    justifyContent: "space-between",
  },
  cellHeader: {
    alignItems: "flex-start",
    gap: 1,
  },
  tileTokenRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    flexWrap: "wrap",
  },
  tileToken: {
    width: 16,
    height: 16,
    borderRadius: 4,
    borderWidth: 1,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
  },
  tileTokenImage: {
    width: "100%",
    height: "100%",
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
});
