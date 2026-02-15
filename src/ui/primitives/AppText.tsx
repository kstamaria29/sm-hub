import { PropsWithChildren } from "react";
import { StyleSheet, Text, TextProps } from "react-native";

import { useTheme } from "../theme/ThemeProvider";

type Variant = "heading" | "title" | "body" | "caption";

type AppTextProps = PropsWithChildren<
  TextProps & {
    variant?: Variant;
    muted?: boolean;
  }
>;

export function AppText({ children, variant = "body", muted = false, style, ...props }: AppTextProps) {
  const { colors, typography, fonts } = useTheme();
  const type = typography[variant];
  const fontFamily =
    variant === "heading" || variant === "title"
      ? fonts.bold
      : variant === "body"
        ? fonts.medium
        : fonts.regular;

  return (
    <Text
      style={[
        styles.base,
        {
          color: muted ? colors.textMuted : colors.text,
          fontSize: type.size,
          lineHeight: type.lineHeight,
          fontWeight: type.weight,
          fontFamily,
        },
        style,
      ]}
      {...props}
    >
      {children}
    </Text>
  );
}

const styles = StyleSheet.create({
  base: {
    includeFontPadding: false,
  },
});
