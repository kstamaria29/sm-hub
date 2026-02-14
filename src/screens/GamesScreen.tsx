import { StyleSheet, View } from "react-native";

import { AppText } from "../ui/primitives/AppText";
import { InfoCard } from "../ui/primitives/InfoCard";
import { Screen } from "../ui/primitives/Screen";
import { useTheme } from "../ui/theme/ThemeProvider";

export function GamesScreen() {
  const { spacing } = useTheme();

  return (
    <Screen>
      <View style={[styles.content, { gap: spacing.md }]}>
        <AppText variant="heading">Games</AppText>
        <InfoCard>
          <AppText variant="title">Snakes and Ladders</AppText>
          <AppText muted>
            This tab will render server-authoritative game state with deterministic animations.
          </AppText>
        </InfoCard>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    flex: 1,
  },
});
