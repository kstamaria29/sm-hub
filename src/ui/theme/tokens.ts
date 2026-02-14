export const theme = {
  colors: {
    background: "#fbf4e8",
    surface: "#ffffff",
    primary: "#155e63",
    primaryMuted: "#4f8f93",
    text: "#1f2933",
    textMuted: "#52606d",
    border: "#d8dee4",
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
  typography: {
    heading: 24,
    title: 18,
    body: 16,
    caption: 13,
  },
} as const;

export type AppTheme = typeof theme;
