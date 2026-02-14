import { PropsWithChildren } from "react";
import { StyleSheet, View } from "react-native";

import { useTheme } from "../theme/ThemeProvider";

export function InfoCard({ children }: PropsWithChildren) {
  const { colors, radius, spacing } = useTheme();

  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: colors.surface,
          borderColor: colors.border,
          borderRadius: radius.md,
          padding: spacing.md,
        },
      ]}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    gap: 8,
  },
});
