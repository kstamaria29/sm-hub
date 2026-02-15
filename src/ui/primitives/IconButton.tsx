import { PropsWithChildren } from "react";
import { Pressable, StyleSheet, ViewStyle } from "react-native";

import { useTheme } from "../theme/ThemeProvider";

type IconButtonTone = "primary" | "accent" | "neutral";
type IconButtonSize = "sm" | "md" | "lg";

type IconButtonProps = PropsWithChildren<{
  onPress: () => void;
  disabled?: boolean;
  tone?: IconButtonTone;
  size?: IconButtonSize;
  style?: ViewStyle;
  accessibilityLabel?: string;
}>;

function resolveDiameter(size: IconButtonSize) {
  if (size === "sm") return 36;
  if (size === "lg") return 52;
  return 44;
}

export function IconButton({
  children,
  onPress,
  disabled = false,
  tone = "neutral",
  size = "md",
  style,
  accessibilityLabel,
}: IconButtonProps) {
  const { colors, radius, shadows } = useTheme();
  const diameter = resolveDiameter(size);

  const backgroundColor =
    tone === "primary" ? colors.primary : tone === "accent" ? colors.accent : colors.surface;
  const borderColor = tone === "neutral" ? colors.border : "transparent";

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.base,
        shadows.card,
        {
          width: diameter,
          height: diameter,
          borderRadius: radius.lg,
          backgroundColor,
          borderColor,
          opacity: disabled ? 0.6 : pressed ? 0.85 : 1,
          transform: [{ scale: pressed ? 0.98 : 1 }],
        },
        style,
      ]}
    >
      {children}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
});

