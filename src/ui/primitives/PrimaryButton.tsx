import { PropsWithChildren } from "react";
import { Pressable, StyleSheet, ViewStyle } from "react-native";

import { AppText } from "./AppText";
import { useTheme } from "../theme/ThemeProvider";

type PrimaryButtonProps = PropsWithChildren<{
  onPress: () => void;
  disabled?: boolean;
  style?: ViewStyle;
}>;

export function PrimaryButton({ children, onPress, disabled = false, style }: PrimaryButtonProps) {
  const { colors, radius, spacing } = useTheme();

  return (
    <Pressable
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        {
          backgroundColor: disabled ? colors.primaryMuted : colors.primary,
          borderRadius: radius.sm,
          paddingHorizontal: spacing.md,
          paddingVertical: spacing.sm,
          opacity: pressed ? 0.85 : 1,
        },
        style,
      ]}
    >
      <AppText style={styles.label}>{children}</AppText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    alignItems: "center",
    justifyContent: "center",
    minHeight: 44,
  },
  label: {
    color: "#ffffff",
    fontWeight: "700",
  },
});
