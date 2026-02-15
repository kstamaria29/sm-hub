import { PropsWithChildren } from "react";
import { Pressable, StyleSheet, ViewStyle } from "react-native";

import { AppText } from "./AppText";
import { useTheme } from "../theme/ThemeProvider";

type ButtonTone = "primary" | "accent" | "danger" | "neutral";
type ButtonSize = "sm" | "md" | "lg";

type PrimaryButtonProps = PropsWithChildren<{
  onPress: () => void;
  disabled?: boolean;
  style?: ViewStyle;
  tone?: ButtonTone;
  size?: ButtonSize;
}>;

function resolveToneColor(colors: ReturnType<typeof useTheme>["colors"], tone: ButtonTone) {
  if (tone === "accent") return colors.accent;
  if (tone === "danger") return colors.danger;
  if (tone === "neutral") return colors.surface;
  return colors.primary;
}

function resolveToneMutedColor(colors: ReturnType<typeof useTheme>["colors"], tone: ButtonTone) {
  if (tone === "accent") return colors.accentMuted;
  if (tone === "danger") return "#FCA5A5";
  if (tone === "neutral") return colors.surfaceMuted;
  return colors.primaryMuted;
}

function resolveSizePadding(spacing: ReturnType<typeof useTheme>["spacing"], size: ButtonSize) {
  if (size === "sm") return { horizontal: spacing.md, vertical: spacing.xs, minHeight: 42 };
  if (size === "lg") return { horizontal: spacing.lg, vertical: spacing.sm, minHeight: 54 };
  return { horizontal: spacing.lg, vertical: spacing.sm, minHeight: 48 };
}

export function PrimaryButton({
  children,
  onPress,
  disabled = false,
  tone = "primary",
  size = "md",
  style,
}: PrimaryButtonProps) {
  const { colors, radius, spacing, shadows } = useTheme();
  const baseColor = resolveToneColor(colors, tone);
  const mutedColor = resolveToneMutedColor(colors, tone);
  const padding = resolveSizePadding(spacing, size);
  const labelColor = tone === "neutral" ? colors.text : "#FFFFFF";

  return (
    <Pressable
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        shadows.card,
        {
          backgroundColor: disabled ? mutedColor : baseColor,
          borderRadius: radius.md,
          paddingHorizontal: padding.horizontal,
          paddingVertical: padding.vertical,
          minHeight: padding.minHeight,
          opacity: pressed ? 0.85 : 1,
          transform: [{ scale: pressed ? 0.99 : 1 }],
          borderWidth: tone === "neutral" ? 1 : 0,
          borderColor: tone === "neutral" ? colors.border : "transparent",
        },
        style,
      ]}
    >
      <AppText style={[styles.label, { color: labelColor }]}>{children}</AppText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    alignItems: "center",
    justifyContent: "center",
  },
  label: {
    fontWeight: "700",
  },
});
