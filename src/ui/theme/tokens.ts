export const theme = {
  colors: {
    background: "#FFF7EC",
    surface: "#FFFFFF",
    surfaceMuted: "#FFF1D6",
    primary: "#0F766E",
    primaryMuted: "#14B8A6",
    accent: "#F97316",
    accentMuted: "#FDBA74",
    success: "#16A34A",
    danger: "#DC2626",
    warning: "#F59E0B",
    text: "#0F172A",
    textMuted: "#475569",
    border: "#E2E8F0",
  },
  spacing: {
    xs: 6,
    sm: 10,
    md: 16,
    lg: 24,
    xl: 32,
  },
  radius: {
    sm: 8,
    md: 14,
    lg: 20,
  },
  shadows: {
    card: {
      shadowColor: "#0F172A",
      shadowOpacity: 0.10,
      shadowRadius: 12,
      shadowOffset: { width: 0, height: 6 },
      elevation: 3,
    },
  },
  fonts: {
    regular: "System",
    medium: "System",
    bold: "System",
  },
  typography: {
    heading: { size: 28, lineHeight: 34, weight: "800" },
    title: { size: 20, lineHeight: 26, weight: "700" },
    body: { size: 16, lineHeight: 22, weight: "500" },
    caption: { size: 13, lineHeight: 18, weight: "500" },
  },
} as const;

export type AppTheme = typeof theme;
