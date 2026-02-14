import { StatusBar } from "expo-status-bar";

import { RootNavigator } from "./src/navigation/RootNavigator";
import { ThemeProvider } from "./src/ui/theme/ThemeProvider";

function AppFrame() {
  return (
    <>
      <StatusBar style="dark" />
      <RootNavigator />
    </>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <AppFrame />
    </ThemeProvider>
  );
}
