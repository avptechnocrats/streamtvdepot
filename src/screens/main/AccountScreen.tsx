import { Alert, Pressable, StyleSheet, Text, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import MaterialCommunityIcons from "react-native-vector-icons/MaterialCommunityIcons";
import { PageTitleHeader } from "@/components/common/PageTitleHeader";
import { PrimaryButton } from "@/components/common/PrimaryButton";
import { Screen } from "@/components/common/Screen";
import { useAuthStore } from "@/store/authStore";
import { RootStackParamList } from "@/navigation/types";
import { colors } from "@/theme/colors";

type AccountRow = {
  label: string;
  icon: string;
  onPress?: () => void;
  rightText?: string;
  destructive?: boolean;
};

function SectionCard({ title, rows }: { title: string; rows: AccountRow[] }) {
  return (
    <View style={styles.sectionWrap}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={styles.card}>
        {rows.map((row, idx) => {
          const isLast = idx === rows.length - 1;
          return (
            <Pressable
              key={`${title}-${row.label}`}
              style={[styles.row, !isLast && styles.rowDivider]}
              onPress={row.onPress}
              disabled={!row.onPress}
            >
              <View style={styles.rowLeft}>
                <MaterialCommunityIcons
                  name={row.icon}
                  size={24}
                  color={row.destructive ? "#ff6b6b" : colors.textSecondary}
                />
                <Text style={[styles.rowLabel, row.destructive && styles.destructiveText]}>{row.label}</Text>
              </View>
              {row.rightText ? <Text style={styles.rowRightText}>{row.rightText}</Text> : null}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

export function AccountScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const token = useAuthStore((s) => s.token);
  const clearSession = useAuthStore((s) => s.clearSession);

  const generalRows: AccountRow[] = [
    { label: "Account details", icon: "account-circle-outline", onPress: () => Alert.alert("Coming soon", "Account details screen will be available in a future update.") },
    { label: "Communication preferences", icon: "tune-vertical", onPress: () => Alert.alert("Coming soon", "Communication preferences will be available in a future update.") },
    { label: "Security settings", icon: "lock-outline", onPress: () => navigation.navigate("Security") },
    { label: "Help Center", icon: "headset", onPress: () => navigation.navigate("Help") },
  ];

  const subscriptionRows: AccountRow[] = [
    { label: "Manage subscription", icon: "credit-card-outline", onPress: () => navigation.navigate("Pricing") },
    { label: "PPV Events", icon: "ticket-outline", onPress: () => navigation.navigate("PpvEvents") },
    { label: "Rentals & PPV purchases", icon: "movie-open-outline", onPress: () => navigation.navigate("Rentals") },
    { label: "Transactions", icon: "monitor-cellphone", onPress: () => navigation.navigate("Transactions") },
    { label: "Subscription history", icon: "trophy-outline", onPress: () => navigation.navigate("Subscriptions") },
  ];

  const preferenceRows: AccountRow[] = [
    { label: "Display Language", icon: "translate", rightText: "English" },
    { label: "Download settings", icon: "download-outline", onPress: () => navigation.navigate("Downloads") },
    { label: "Video playback settings", icon: "play-circle-outline" },
  ];

  const resetRows: AccountRow[] = [
    { label: "Signout", icon: "logout", onPress: clearSession, destructive: true },
    {
      label: "Remove Account",
      icon: "account-remove-outline",
      onPress: () => Alert.alert("Remove Account", "Account removal is not available yet."),
      destructive: true,
    },
  ];

  return (
    <Screen contentStyle={styles.screen}>
      <View style={styles.container}>
        <PageTitleHeader title="Account" />
        {token ? (
          <>
            <SectionCard title="General" rows={generalRows} />
            <SectionCard title="Subscription" rows={subscriptionRows} />
            <SectionCard title="Preferences" rows={preferenceRows} />
            <SectionCard title="" rows={resetRows} />
          </>
        ) : (
          <View style={styles.guestWrap}>
            <Text style={styles.guestTitle}>Sign in to your account</Text>
            <Text style={styles.guestDescription}>Manage your subscriptions, watchlist, and viewing history.</Text>
            <PrimaryButton label="Sign In or Create Account" onPress={() => navigation.navigate("Auth")} />
          </View>
        )}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: {
    paddingBottom: 22,
  },
  container: {
    gap: 14,
  },
  guestWrap: {
    gap: 12,
    paddingTop: 16,
  },
  guestTitle: {
    color: colors.textPrimary,
    fontSize: 22,
    fontWeight: "800",
  },
  guestDescription: {
    color: colors.textSecondary,
    fontSize: 14,
    lineHeight: 20,
  },
  sectionWrap: {
    gap: 8,
  },
  sectionTitle: {
    color: colors.textPrimary,
    fontSize: 16,
    fontWeight: "800",
    opacity: 0.95,
  },
  card: {
    borderRadius: 16,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: "hidden",
  },
  row: {
    minHeight: 64,
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  rowDivider: {
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  rowLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    flex: 1,
  },
  rowLabel: {
    color: colors.textPrimary,
    fontSize: 18,
    fontWeight: "500",
  },
  rowRightText: {
    color: colors.textPrimary,
    fontSize: 15,
    fontWeight: "800",
  },
  destructiveText: {
    color: "#ff6b6b",
  },
});
