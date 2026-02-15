import { NavigationContainer, Theme as NavigationTheme } from "@react-navigation/native";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";

import { useOnboardingGate } from "../features/onboarding/useOnboardingGate";
import { RootTabParamList } from "./types";
import { AvatarsScreen } from "../screens/AvatarsScreen";
import { ChatScreen } from "../screens/ChatScreen";
import { GamesScreen } from "../screens/GamesScreen";
import { OnboardingScreen } from "../screens/OnboardingScreen";
import { ProfileScreen } from "../screens/ProfileScreen";
import { useTheme } from "../ui/theme/ThemeProvider";

const Tab = createBottomTabNavigator<RootTabParamList>();

function AppTabs() {
  const { colors } = useTheme();

  return (
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
      <Tab.Screen
        name="Avatars"
        component={AvatarsScreen}
        options={{
          title: "Avatars",
          tabBarButton: () => null,
          tabBarStyle: { display: "none" },
        }}
      />
    </Tab.Navigator>
  );
}

export function RootNavigator() {
  const { colors, fonts } = useTheme();
  const onboardingGate = useOnboardingGate();

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
        fontFamily: fonts.regular,
        fontWeight: "400",
      },
      medium: {
        fontFamily: fonts.medium,
        fontWeight: "500",
      },
      bold: {
        fontFamily: fonts.bold,
        fontWeight: "700",
      },
      heavy: {
        fontFamily: fonts.bold,
        fontWeight: "800",
      },
    },
  };

  if (onboardingGate.stage !== "ready") {
    return <OnboardingScreen gate={onboardingGate} />;
  }

  return (
    <NavigationContainer theme={navigationTheme}>
      <AppTabs />
    </NavigationContainer>
  );
}
