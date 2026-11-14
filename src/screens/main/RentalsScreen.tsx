import { useQuery } from "@tanstack/react-query";
import { FlatList, StyleSheet, Text, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { BackTitleHeader } from "@/components/common/BackTitleHeader";
import { Screen } from "@/components/common/Screen";
import { fetchMySubscriptions } from "@/services/historyService";
import { RootStackParamList } from "@/navigation/types";
import { colors } from "@/theme/colors";

function formatDate(value: string | null) {
  if (!value) return "No expiry";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString();
}

export function RentalsScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { data = [], isLoading, isError } = useQuery({
    queryKey: ["purchases-history"],
    queryFn: async () => {
      const [rentals, ppv] = await Promise.all([
        fetchMySubscriptions("rent"),
        fetchMySubscriptions("ppv"),
      ]);
      return [...rentals, ...ppv].sort((a, b) => new Date(b.started_at).getTime() - new Date(a.started_at).getTime());
    },
  });

  return (
    <Screen>
      <BackTitleHeader title="Rentals & PPV" subtitle="Your one-time access purchases" onBack={() => navigation.goBack()} />
      {isLoading ? <Text style={styles.status}>Loading purchases...</Text> : null}
      {isError ? <Text style={styles.error}>Could not load your purchases. Pull to refresh and try again.</Text> : null}
      {!isLoading && !isError ? (
        <FlatList
          data={data}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => {
            const active = item.status.toLowerCase() === "active" && (!item.expires_at || new Date(item.expires_at) > new Date());
            return (
              <View style={styles.card}>
                <View style={styles.cardTop}>
                  <View style={styles.icon}><Text style={styles.iconText}>{item.plan_type === "ppv" ? "PPV" : "R"}</Text></View>
                  <View style={styles.meta}>
                    <Text style={styles.title}>{item.plan_name}</Text>
                    <Text style={styles.subtitle}>{item.content_id ? `Content ID: ${item.content_id}` : "Content access"}</Text>
                  </View>
                  <Text style={[styles.badge, active ? styles.active : styles.expired]}>{active ? "ACTIVE" : item.status.toUpperCase()}</Text>
                </View>
                <Text style={styles.validity}>Purchased {formatDate(item.started_at)} · Valid until {formatDate(item.expires_at)}</Text>
              </View>
            );
          }}
          ListEmptyComponent={<Text style={styles.status}>No rentals or PPV purchases yet.</Text>}
        />
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  list: { paddingTop: 16, paddingBottom: 28, gap: 10 },
  card: { borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, borderRadius: 16, padding: 14, gap: 12 },
  cardTop: { flexDirection: "row", alignItems: "center", gap: 10 },
  icon: { width: 42, height: 42, borderRadius: 12, backgroundColor: "rgba(244,184,68,0.14)", alignItems: "center", justifyContent: "center" },
  iconText: { color: colors.primaryStrong, fontSize: 12, fontWeight: "900" },
  meta: { flex: 1 },
  title: { color: colors.textPrimary, fontSize: 16, fontWeight: "800" },
  subtitle: { color: colors.textSecondary, fontSize: 12, marginTop: 3 },
  badge: { fontSize: 10, fontWeight: "900" },
  active: { color: colors.success },
  expired: { color: colors.textSecondary },
  validity: { color: colors.textSecondary, fontSize: 12 },
  status: { color: colors.textSecondary, textAlign: "center", marginTop: 24 },
  error: { color: colors.danger, textAlign: "center", marginTop: 24 },
});
