import { StyleSheet, View, ViewStyle } from "react-native";

import { AppText } from "./AppText";
import { useTheme } from "../theme/ThemeProvider";

type TagTone = "neutral" | "primary" | "accent" | "success" | "danger" | "warning";

type TagProps = {
  label: string;
  tone?: TagTone;
  style?: ViewStyle;
};

function resolveToneStyles(
  colors: ReturnType<typeof useTheme>["colors"],
  tone: TagTone,
): { backgroundColor: string; borderColor: string; textColor: string } {
  if (tone === "primary") {
    return { backgroundColor: colors.primary, borderColor: colors.primary, textColor: "#FFFFFF" };
  }

  if (tone === "accent") {
    return { backgroundColor: colors.accent, borderColor: colors.accent, textColor: "#FFFFFF" };
  }

  if (tone === "success") {
    return { backgroundColor: colors.success, borderColor: colors.success, textColor: "#FFFFFF" };
  }

  if (tone === "danger") {
    return { backgroundColor: colors.danger, borderColor: colors.danger, textColor: "#FFFFFF" };
  }

  if (tone === "warning") {
    return { backgroundColor: colors.warning, borderColor: colors.warning, textColor: "#0F172A" };
  }

  return { backgroundColor: colors.surfaceMuted, borderColor: colors.border, textColor: colors.textMuted };
}

export function Tag({ label, tone = "neutral", style }: TagProps) {
  const { colors, radius, spacing } = useTheme();
  const toneStyles = resolveToneStyles(colors, tone);

  return (
    <View
      style={[
        styles.base,
        {
          backgroundColor: toneStyles.backgroundColor,
          borderColor: toneStyles.borderColor,
          borderRadius: radius.lg,
          paddingHorizontal: spacing.sm,
          paddingVertical: 4,
        },
        style,
      ]}
    >
      <AppText variant="caption" style={[styles.label, { color: toneStyles.textColor }]}>
        {label}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    borderWidth: 1,
    alignSelf: "flex-start",
  },
  label: {
    fontWeight: "800",
    letterSpacing: 0.2,
  },
});

