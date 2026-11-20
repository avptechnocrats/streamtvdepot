import { useEffect, useState } from "react";
import { Alert, Image, Pressable, StyleSheet, Text, View } from "react-native";
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
      {title ? <Text style={styles.sectionTitle}>{title}</Text> : null}
      <View style={styles.card}>
        {rows.map((row, idx) => {
          const isLast = idx === rows.length - 1;
          return (
            <Pressable
              key={`${title}-${row.label}`}
              style={[styles.row, !isLast && styles.rowDivider]}
              onPress={row.onPress}
              disabled={!row.onPress}
              accessibilityRole={row.onPress ? "button" : undefined}
              accessibilityState={{ disabled: !row.onPress }}
            >
              <View style={styles.rowLeft}>
                <View style={styles.rowIcon}>
                  <MaterialCommunityIcons name={row.icon} size={20} color={row.destructive ? colors.danger : colors.textSecondary} />
                </View>
                <Text style={[styles.rowLabel, row.destructive && styles.destructiveText]}>{row.label}</Text>
              </View>
              {row.rightText ? <Text style={styles.rowRightText}>{row.rightText}</Text> : null}
              {row.onPress && !row.destructive ? <MaterialCommunityIcons name="chevron-right" size={21} color={colors.textSecondary} /> : null}
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
  const user = useAuthStore((s) => s.user);
  const clearSession = useAuthStore((s) => s.clearSession);
  const [avatarFailed, setAvatarFailed] = useState(false);

  useEffect(() => {
    setAvatarFailed(false);
  }, [user?.avatar_url]);

  const avatarUrl = typeof user?.avatar_url === "string" && !/^(null|undefined)$/i.test(user.avatar_url.trim())
    ? user.avatar_url.trim() : "";
  const displayName = user?.full_name?.trim() || "Your account";

  const generalRows: AccountRow[] = [
    { label: "Account details", icon: "account-circle-outline", rightText: "Coming soon" },
    { label: "Communication preferences", icon: "tune-vertical", rightText: "Coming soon" },
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
    { label: "Downloads", icon: "download-outline", onPress: () => navigation.getParent<NativeStackNavigationProp<RootStackParamList>>()?.navigate("Downloads") },
    { label: "Video playback settings", icon: "play-circle-outline", rightText: "Coming soon" },
  ];

  const resetRows: AccountRow[] = [
    { label: "Sign Out", icon: "logout", onPress: () => Alert.alert("Sign out?", "You can sign in again at any time.", [
      { text: "Cancel", style: "cancel" },
      { text: "Sign Out", style: "destructive", onPress: clearSession },
    ]), destructive: true },
    {
      label: "Remove Account",
      icon: "account-remove-outline",
      rightText: "Coming soon",
      destructive: true,
    },
  ];

  return (
    <Screen contentStyle={styles.screen}>
      <View style={styles.container}>
        <PageTitleHeader title="Account" />
        {token ? (
          <>
            <View style={styles.profile}>
              <View style={styles.avatar}>
                {avatarUrl && !avatarFailed ? <Image source={{ uri: avatarUrl }} style={styles.avatarImage} onError={() => setAvatarFailed(true)} /> : <MaterialCommunityIcons name="account" size={32} color={colors.primaryStrong} />}
              </View>
              <View style={styles.profileText}>
                <Text style={styles.profileName} numberOfLines={1}>{displayName}</Text>
                {user?.email ? <Text style={styles.profileEmail} numberOfLines={1}>{user.email}</Text> : null}
              </View>
            </View>
            <SectionCard title="General" rows={generalRows} />
            <SectionCard title="Subscription" rows={subscriptionRows} />
            <SectionCard title="Preferences" rows={preferenceRows} />
            <SectionCard title="" rows={resetRows} />
          </>
        ) : (
          <>
            <View style={styles.guestWrap}>
              <View style={styles.avatar}><MaterialCommunityIcons name="account-outline" size={32} color={colors.primaryStrong} /></View>
              <Text style={styles.guestTitle}>Your account</Text>
              <Text style={styles.guestDescription}>Sign in to continue.</Text>
              <View style={styles.guestAction}>
                <PrimaryButton label="Sign In or Create Account" onPress={() => navigation.navigate("Auth")} />
              </View>
            </View>
            <SectionCard title="Explore" rows={[
              { label: "Watchlist", icon: "heart-outline", onPress: () => navigation.getParent<NativeStackNavigationProp<RootStackParamList>>()?.navigate("Watchlist") },
              { label: "Downloads", icon: "download-outline", onPress: () => navigation.getParent<NativeStackNavigationProp<RootStackParamList>>()?.navigate("Downloads") },
              { label: "PPV Events", icon: "ticket-outline", onPress: () => navigation.navigate("PpvEvents") },
            ]} />
          </>
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
    gap: 18,
  },
  guestWrap: {
    alignItems: "center",
    gap: 8,
    paddingVertical: 20,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  guestTitle: {
    color: colors.textPrimary,
    fontSize: 20,
    fontWeight: "800",
  },
  guestDescription: {
    color: colors.textSecondary,
    fontSize: 14,
    lineHeight: 20,
    textAlign: "center",
  },
  guestAction: { marginTop: 10, width: "100%", maxWidth: 300 },
  profile: { flexDirection: "row", alignItems: "center", gap: 14, paddingVertical: 18, borderBottomWidth: 1, borderBottomColor: colors.border },
  avatar: { width: 64, height: 64, borderRadius: 32, overflow: "hidden", alignItems: "center", justifyContent: "center", backgroundColor: colors.surfaceMuted, borderWidth: 1, borderColor: colors.border },
  avatarImage: { width: "100%", height: "100%" },
  profileText: { flex: 1, minWidth: 0, gap: 4 },
  profileName: { color: colors.textPrimary, fontSize: 19, fontWeight: "800" },
  profileEmail: { color: colors.textSecondary, fontSize: 13 },
  sectionWrap: {
    gap: 8,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: colors.textSecondary,
  },
  card: {
    borderRadius: 6,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: "hidden",
  },
  row: {
    minHeight: 58,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  rowDivider: {
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  rowLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    flex: 1,
    minWidth: 0,
  },
  rowIcon: { width: 36, height: 36, borderRadius: 6, alignItems: "center", justifyContent: "center", backgroundColor: colors.surfaceMuted },
  rowLabel: {
    color: colors.textPrimary,
    fontSize: 14,
    fontWeight: "600",
    flexShrink: 1,
  },
  rowRightText: {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: "600",
  },
  destructiveText: {
    color: colors.danger,
  },
});
