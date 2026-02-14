import { createContext, PropsWithChildren, useContext } from "react";

import { AppTheme, theme } from "./tokens";

const ThemeContext = createContext<AppTheme>(theme);

export function ThemeProvider({ children }: PropsWithChildren) {
  return <ThemeContext.Provider value={theme}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  return useContext(ThemeContext);
}
