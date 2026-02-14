import { Image, RefreshControl, ScrollView, StyleSheet, View } from "react-native";

import { avatarExpressionLabel } from "../features/avatar/avatarPack";
import { GameEventView, useFamilyGame } from "../features/game/useFamilyGame";
import { Json } from "../lib/database.types";
import { AppText } from "../ui/primitives/AppText";
import { InfoCard } from "../ui/primitives/InfoCard";
import { PrimaryButton } from "../ui/primitives/PrimaryButton";
import { Screen } from "../ui/primitives/Screen";
import { useTheme } from "../ui/theme/ThemeProvider";

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

export function GamesScreen() {
  const { colors, spacing } = useTheme();
  const gameState = useFamilyGame();

  const currentTurnLabel = (() => {
    if (!gameState.game?.current_turn_user_id) {
      return "No active turn";
    }

    const currentPlayer = gameState.players.find((player) => player.userId === gameState.game?.current_turn_user_id);
    return currentPlayer?.displayName ?? `User ${gameState.game.current_turn_user_id.slice(0, 8)}`;
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
          <AppText variant="title">Actions</AppText>
          <AppText muted>
            {gameState.role === "admin"
              ? "Admins can start a game. Only the active player can roll."
              : "Only admins can start a game. Roll is available on your turn."}
          </AppText>

          <PrimaryButton
            onPress={() => {
              void gameState.startGame();
            }}
            disabled={!gameState.canStartGame || gameState.startingGame || gameState.loading}
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
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    flex: 1,
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
