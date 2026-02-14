import { NavigationContainer, Theme as NavigationTheme } from "@react-navigation/native";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";

import { ChatScreen } from "../screens/ChatScreen";
import { GamesScreen } from "../screens/GamesScreen";
import { ProfileScreen } from "../screens/ProfileScreen";
import { useTheme } from "../ui/theme/ThemeProvider";

type RootTabParamList = {
  Chat: undefined;
  Games: undefined;
  Profile: undefined;
};

const Tab = createBottomTabNavigator<RootTabParamList>();

export function RootNavigator() {
  const { colors } = useTheme();

  const navigationTheme: NavigationTheme = {
    dark: false,
    colors: {
      primary: colors.primary,
      background: colors.background,
      card: colors.surface,
      text: colors.text,
      border: colors.border,
      notification: colors.primaryMuted,
    },
    fonts: {
      regular: {
        fontFamily: "System",
        fontWeight: "400",
      },
      medium: {
        fontFamily: "System",
        fontWeight: "500",
      },
      bold: {
        fontFamily: "System",
        fontWeight: "700",
      },
      heavy: {
        fontFamily: "System",
        fontWeight: "800",
      },
    },
  };

  return (
    <NavigationContainer theme={navigationTheme}>
      <Tab.Navigator
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor: colors.primary,
          tabBarInactiveTintColor: colors.textMuted,
          tabBarStyle: {
            borderTopColor: colors.border,
            backgroundColor: colors.surface,
          },
        }}
      >
        <Tab.Screen name="Chat" component={ChatScreen} />
        <Tab.Screen name="Games" component={GamesScreen} />
        <Tab.Screen
          name="Profile"
          component={ProfileScreen}
          options={{ title: "Settings/Profile" }}
        />
      </Tab.Navigator>
    </NavigationContainer>
  );
}
