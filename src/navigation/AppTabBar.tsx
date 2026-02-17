import { BottomTabBarProps } from "@react-navigation/bottom-tabs";
import { Platform, Pressable, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AppText } from "../ui/primitives/AppText";
import { useTheme } from "../ui/theme/ThemeProvider";

function resolveLabel(props: {
  routeName: string;
  options: { tabBarLabel?: string; title?: string };
}): string {
  return props.options.tabBarLabel ?? props.options.title ?? props.routeName;
}

export function AppTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const { colors, radius, shadows } = useTheme();
  const insets = useSafeAreaInsets();

  const focusedOptions = descriptors[state.routes[state.index]?.key ?? ""]?.options;
  const focusedTabBarStyle = focusedOptions?.tabBarStyle as unknown;
  if (
    focusedTabBarStyle &&
    typeof focusedTabBarStyle === "object" &&
    (focusedTabBarStyle as { display?: string }).display === "none"
  ) {
    return null;
  }

  return (
    <View
      style={[
        styles.container,
        shadows.card,
        {
          backgroundColor: colors.surface,
          borderTopColor: colors.border,
          paddingBottom: Math.max(insets.bottom, 10),
        },
      ]}
    >
      <View style={styles.row}>
        {state.routes.map((route, index) => {
          const descriptor = descriptors[route.key];
          const options = descriptor?.options ?? {};

          if (route.name === "Avatars") {
            return null;
          }

          const label = resolveLabel({
            routeName: route.name,
            options: {
              tabBarLabel: typeof options.tabBarLabel === "string" ? options.tabBarLabel : undefined,
              title: typeof options.title === "string" ? options.title : undefined,
            },
          });

          const isFocused = state.index === index;

          const onPress = () => {
            const event = navigation.emit({
              type: "tabPress",
              target: route.key,
              canPreventDefault: true,
            });

            if (!isFocused && !event.defaultPrevented) {
              navigation.navigate(route.name, route.params);
            }
          };

          const onLongPress = () => {
            navigation.emit({
              type: "tabLongPress",
              target: route.key,
            });
          };

          return (
            <Pressable
              key={route.key}
              accessibilityRole={Platform.select({ ios: "button", default: "button" })}
              accessibilityState={isFocused ? { selected: true } : {}}
              onPress={onPress}
              onLongPress={onLongPress}
              style={({ pressed }) => [
                styles.item,
                {
                  borderRadius: radius.lg,
                  backgroundColor: isFocused ? colors.primaryMuted : "transparent",
                  opacity: pressed ? 0.85 : 1,
                },
              ]}
            >
              <AppText style={{ color: isFocused ? colors.primary : colors.textMuted, fontWeight: "700" }}>
                {label}
              </AppText>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderTopWidth: 1,
    paddingTop: 10,
    paddingHorizontal: 12,
  },
  row: {
    flexDirection: "row",
    gap: 8,
  },
  item: {
    flex: 1,
    paddingVertical: 10,
    alignItems: "center",
    justifyContent: "center",
  },
});

