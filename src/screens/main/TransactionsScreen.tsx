import { useQuery } from "@tanstack/react-query";
import { FlatList, StyleSheet, Text, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { BackTitleHeader } from "@/components/common/BackTitleHeader";
import { Screen } from "@/components/common/Screen";
import { fetchMyTransactions } from "@/services/historyService";
import { RootStackParamList } from "@/navigation/types";
import { colors } from "@/theme/colors";

export function TransactionsScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { data = [] } = useQuery({ queryKey: ["transactions"], queryFn: () => fetchMyTransactions({ page: 1, page_size: 30 }) });

  return (
    <Screen>
      <BackTitleHeader
        title="Transactions"
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
          <View style={styles.item}>
            <Text style={styles.amount}>{item.currency} {item.amount}</Text>
            <Text style={styles.meta}>{item.status} • {item.payment_method}</Text>
            <Text style={styles.meta}>{item.paid_at || item.created_at}</Text>
          </View>
        )}
        ListEmptyComponent={<Text style={styles.empty}>No transactions found.</Text>}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  list: { gap: 10, paddingTop: 14, paddingBottom: 28 },
  item: {
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: 12,
    gap: 4,
  },
  amount: { color: colors.textPrimary, fontWeight: "800", fontSize: 16 },
  meta: { color: colors.textSecondary, fontSize: 12 },
  empty: { color: colors.textSecondary, marginTop: 18 },
});
