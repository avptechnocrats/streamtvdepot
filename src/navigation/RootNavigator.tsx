import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { useEffect } from "react";
import { ActivityIndicator, View } from "react-native";
import { useAuthStore } from "@/store/authStore";
import { RootStackParamList } from "@/navigation/types";
import { AuthStack } from "@/navigation/AuthStack";
import { MainTabs } from "@/navigation/MainTabs";
import { SeriesDetailsScreen } from "@/screens/main/SeriesDetailsScreen";
import { ContentDetailsScreen } from "@/screens/main/ContentDetailsScreen";
import { PricingScreen } from "@/screens/main/PricingScreen";
import { CheckoutScreen } from "@/screens/main/CheckoutScreen";
import { WatchlistScreen } from "@/screens/main/WatchlistScreen";
import { DownloadsScreen } from "@/screens/main/DownloadsScreen";
import { TransactionsScreen } from "@/screens/main/TransactionsScreen";
import { SubscriptionsScreen } from "@/screens/main/SubscriptionsScreen";
import { SecurityScreen } from "@/screens/main/SecurityScreen";
import { HelpScreen } from "@/screens/main/HelpScreen";
import { PpvEventsScreen } from "@/screens/main/PpvEventsScreen";
import { PpvEventDetailsScreen } from "@/screens/main/PpvEventDetailsScreen";
import { RentalsScreen } from "@/screens/main/RentalsScreen";
import { LiveTvScreen } from "@/screens/main/LiveTvScreen";
import { LiveTvChannelScreen } from "@/screens/main/LiveTvChannelScreen";
import { CategoryDetailsScreen } from "@/screens/main/CategoryDetailsScreen";
import { colors } from "@/theme/colors";

const Stack = createNativeStackNavigator<RootStackParamList>();

export function RootNavigator() {
  const token = useAuthStore((s) => s.token);
  const isHydrating = useAuthStore((s) => s.isHydrating);
  const hydrateSession = useAuthStore((s) => s.hydrateSession);

  useEffect(() => {
    hydrateSession().catch(() => undefined);
  }, [hydrateSession]);

  if (isHydrating) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.background }}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Main" component={MainTabs} />
      <Stack.Screen name="SeriesDetails" component={SeriesDetailsScreen} />
      {!token ? <Stack.Screen name="Auth" component={AuthStack} /> : null}
      <Stack.Screen name="LiveTv" component={LiveTvScreen} />
      <Stack.Screen name="LiveTvChannel" component={LiveTvChannelScreen} />
      <Stack.Screen name="CategoryDetails" component={CategoryDetailsScreen} />
      <Stack.Screen name="ContentDetails" component={ContentDetailsScreen} />
      <Stack.Screen name="Pricing" component={PricingScreen} />
      <Stack.Screen name="Checkout" component={CheckoutScreen} />
      <Stack.Screen name="Watchlist" component={WatchlistScreen} />
      <Stack.Screen name="Downloads" component={DownloadsScreen} />
      <Stack.Screen name="Transactions" component={TransactionsScreen} />
      <Stack.Screen name="Subscriptions" component={SubscriptionsScreen} />
      <Stack.Screen name="Security" component={SecurityScreen} />
      <Stack.Screen name="Help" component={HelpScreen} />
      <Stack.Screen name="PpvEvents" component={PpvEventsScreen} />
      <Stack.Screen name="PpvEventDetails" component={PpvEventDetailsScreen} />
      <Stack.Screen name="Rentals" component={RentalsScreen} />
    </Stack.Navigator>
  );
}
