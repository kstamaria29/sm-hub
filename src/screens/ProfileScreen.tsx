import { StyleSheet, Switch, View } from "react-native";

import { AppText } from "../ui/primitives/AppText";
import { InfoCard } from "../ui/primitives/InfoCard";
import { Screen } from "../ui/primitives/Screen";
import { useTheme } from "../ui/theme/ThemeProvider";

export function ProfileScreen() {
  const { colors, spacing } = useTheme();

  return (
    <Screen>
      <View style={[styles.content, { gap: spacing.md }]}>
        <AppText variant="heading">Settings and Profile</AppText>
        <InfoCard>
          <AppText variant="title">Cinematics</AppText>
          <View style={styles.toggleRow}>
            <AppText muted>Board camera effects for dice, snake, and ladder moments.</AppText>
            <Switch value thumbColor={colors.surface} />
          </View>
        </InfoCard>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    flex: 1,
  },
  toggleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
});
