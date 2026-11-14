import { useQuery } from "@tanstack/react-query";
import { FlatList, StyleSheet, Text, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { BackTitleHeader } from "@/components/common/BackTitleHeader";
import { Screen } from "@/components/common/Screen";
import { fetchMySubscriptions } from "@/services/historyService";
import { RootStackParamList } from "@/navigation/types";
import { colors } from "@/theme/colors";

export function SubscriptionsScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { data = [] } = useQuery({ queryKey: ["subscriptions-history"], queryFn: () => fetchMySubscriptions("subscription") });

  return (
    <Screen>
      <BackTitleHeader
        title="Subscriptions"
        onBack={() => {
          if (navigation.canGoBack()) {
            navigation.goBack();
            return;
          }
          navigation.navigate("Main", { screen: "Account" } as never);
        }}
      />
      <FlatList
        data={data}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <View style={styles.card}>
            <Text style={styles.plan}>{item.plan_name}</Text>
            <Text style={styles.meta}>Status: {item.status}</Text>
            <Text style={styles.meta}>Start: {item.started_at}</Text>
            <Text style={styles.meta}>Expiry: {item.expires_at || "N/A"}</Text>
          </View>
        )}
        ListEmptyComponent={<Text style={styles.empty}>No subscription history available.</Text>}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  list: { gap: 10, paddingTop: 14, paddingBottom: 28 },
  card: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    backgroundColor: colors.surface,
    padding: 12,
    gap: 4,
  },
  plan: { color: colors.textPrimary, fontWeight: "800", fontSize: 16 },
  meta: { color: colors.textSecondary, fontSize: 12 },
  empty: { color: colors.textSecondary, marginTop: 18 },
});
