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
  const { colors, typography } = useTheme();

  return (
    <Text
      style={[
        styles.base,
        {
          color: muted ? colors.textMuted : colors.text,
          fontSize: typography[variant],
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
    fontWeight: "500",
  },
});
