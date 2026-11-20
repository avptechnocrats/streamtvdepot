import { useState } from "react";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import MaterialCommunityIcons from "react-native-vector-icons/MaterialCommunityIcons";
import { MainTabParamList } from "@/navigation/types";
import { HomeScreen, HomeFilter } from "@/screens/main/HomeScreen";
import { WatchlistScreen } from "@/screens/main/WatchlistScreen";
import { DownloadsScreen } from "@/screens/main/DownloadsScreen";
import { SearchScreen } from "@/screens/main/SearchScreen";
import { AccountScreen } from "@/screens/main/AccountScreen";
import { colors } from "@/theme/colors";

const Tab = createBottomTabNavigator<MainTabParamList>();

export function MainTabs() {
  const [activeFilter, setActiveFilter] = useState<HomeFilter | null>(null);
  const insets = useSafeAreaInsets();

  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textSecondary,
        tabBarShowLabel: false,
        tabBarIcon: ({ color, size }) => {
          const iconMap: Record<keyof MainTabParamList, string> = {
            Home: "home-variant-outline",
            Watchlist: "heart-outline",
            Downloads: "download-circle-outline",
            Search: "magnify",
            Account: "account-circle-outline",
          };

          return <MaterialCommunityIcons name={iconMap[route.name]} color={color} size={size} />;
        },
        tabBarStyle: {
          backgroundColor: colors.backgroundElevated,
          borderTopColor: colors.border,
          height: 58 + insets.bottom,
          paddingBottom: 8 + insets.bottom,
          paddingTop: 6,
        },
      })}
    >
      <Tab.Screen
        name="Home"
        options={{ tabBarActiveTintColor: activeFilter ? colors.textSecondary : colors.primary }}
        listeners={{ tabPress: () => setActiveFilter(null) }}
      >
        {() => <HomeScreen activeFilter={activeFilter} setActiveFilter={setActiveFilter} />}
      </Tab.Screen>
      <Tab.Screen name="Watchlist" component={WatchlistScreen} />
      <Tab.Screen name="Downloads" component={DownloadsScreen} />
      <Tab.Screen name="Search" component={SearchScreen} />
      <Tab.Screen name="Account" component={AccountScreen} />
    </Tab.Navigator>
  );
}
