import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import MaterialCommunityIcons from "react-native-vector-icons/MaterialCommunityIcons";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { BackTitleHeader } from "@/components/common/BackTitleHeader";
import { Screen } from "@/components/common/Screen";
import { fetchSubscriptionPlans } from "@/services/subscriptionService";
import { fetchMySubscriptions } from "@/services/historyService";
import { RootStackParamList } from "@/navigation/types";
import { useAuthStore } from "@/store/authStore";
import { colors } from "@/theme/colors";

type Props = NativeStackScreenProps<RootStackParamList, "Pricing">;

const BILLING_LABELS: Record<string, string> = {
  monthly: " / mo",
  yearly: " / yr",
  daily: " / day",
};

function getLocalizedPrice(
  plan: { price: number; currency: string; country_pricing?: Array<{ country: string; price: number; currency: string }> },
  userCountry?: string | null,
): { price: number; currency: string } {
  if (userCountry && plan.country_pricing?.length) {
    const matched = plan.country_pricing.find((cp) => cp.country.toUpperCase() === userCountry.toUpperCase());
    if (matched) {
      return { price: matched.price, currency: matched.currency };
    }
  }

  return { price: plan.price, currency: plan.currency };
}

export function PricingScreen({ navigation, route }: Props) {
  const purchaseType = route.params?.purchaseType ?? "subscription";
  const contentId = route.params?.contentId;
  const userCountry = useAuthStore((s) => s.user?.country);
  const { data: plans = [] } = useQuery({
    queryKey: ["plans", purchaseType],
    queryFn: () => fetchSubscriptionPlans(purchaseType),
  });
  const { data: subscriptions = [] } = useQuery({
    queryKey: ["subscriptions-history", "subscription"],
    queryFn: () => fetchMySubscriptions("subscription"),
  });

  const currentSubscription = useMemo(() => {
    const now = new Date();
    const active = subscriptions.filter((sub) => {
      if (sub.status !== "active") return false;
      const startsAt = new Date(sub.started_at);
      if (Number.isNaN(startsAt.getTime())) return false;
      if (startsAt > now) return false;

      if (!sub.expires_at) return true;
      const expiresAt = new Date(sub.expires_at);
      if (Number.isNaN(expiresAt.getTime())) return false;
      return expiresAt > now;
    });

    return active.sort((a, b) => {
      const aTs = a.expires_at ? new Date(a.expires_at).getTime() : Number.MAX_SAFE_INTEGER;
      const bTs = b.expires_at ? new Date(b.expires_at).getTime() : Number.MAX_SAFE_INTEGER;
      return bTs - aTs;
    })[0] ?? null;
  }, [subscriptions]);

  const onBackPress = () => {
    if (navigation.canGoBack()) {
      navigation.goBack();
      return;
    }
    navigation.navigate("Main", { screen: "Account" } as never);
  };

  return (
    <Screen>
      <BackTitleHeader
        title={purchaseType === "subscription" ? "Manage Subscription" : purchaseType === "ppv" ? "PPV Access" : "Rental Access"}
        subtitle={purchaseType === "subscription" ? "Choose and manage your plan" : "Choose a plan to unlock this content"}
        onBack={onBackPress}
      />

      {purchaseType === "subscription" && currentSubscription ? (
        <View style={styles.activeCard}>
          <View style={styles.activeIconWrap}>
            <MaterialCommunityIcons name="check-decagram" size={20} color={colors.primaryStrong} />
          </View>
          <View style={styles.activeMeta}>
            <Text style={styles.activeTitle}>{currentSubscription.plan_name}</Text>
            {currentSubscription.expires_at ? (
              <Text style={styles.activeSub}>Renews / expires: {new Date(currentSubscription.expires_at).toLocaleDateString()}</Text>
            ) : null}
          </View>
          <Text style={styles.activeBadge}>ACTIVE</Text>
        </View>
      ) : purchaseType === "subscription" ? (
        <View style={styles.emptySubscriptionCard}>
          <View style={styles.emptyIconWrap}>
            <MaterialCommunityIcons name="credit-card-outline" size={22} color={colors.primaryStrong} />
          </View>
          <Text style={styles.emptySubscriptionTitle}>No active subscription</Text>
          <Text style={styles.emptySubscriptionSub}>
            Pick a plan below to unlock full access to movies, live TV and exclusive shows.
          </Text>
        </View>
      ) : null}

      <Text style={styles.sectionTitle}>Available Plans</Text>
      <View style={styles.wrap}>
        {plans.map((plan) => {
          const localized = getLocalizedPrice(plan, userCountry);
          const billingLabel = BILLING_LABELS[plan.billing_cycle] ?? ` / ${plan.billing_cycle}`;
          const priceLabel = localized.price === 0 ? "Free" : `${localized.currency} ${localized.price.toFixed(2)}`;

          return (
          <Pressable key={plan.id} style={styles.card} onPress={() => navigation.navigate("Checkout", { planId: plan.id, contentId, purchaseType: purchaseType === "subscription" ? undefined : purchaseType })}>
            <Text style={styles.name}>{plan.name}</Text>
            <Text style={styles.price}>{priceLabel}</Text>
            <Text style={styles.cycle}>{billingLabel.trim().toUpperCase()}</Text>
            {plan.description ? <Text style={styles.description}>{plan.description}</Text> : null}
          </Pressable>
          );
        })}

        {!plans.length ? <Text style={styles.emptyPlans}>No plans available.</Text> : null}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  activeCard: {
    marginTop: 16,
    borderWidth: 1,
    borderColor: "rgba(74, 144, 226, 0.35)",
    backgroundColor: "rgba(74, 144, 226, 0.10)",
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  activeIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(74, 144, 226, 0.16)",
  },
  activeMeta: {
    flex: 1,
  },
  activeTitle: {
    color: colors.textPrimary,
    fontSize: 16,
    fontWeight: "800",
  },
  activeSub: {
    marginTop: 2,
    color: colors.textSecondary,
    fontSize: 12,
  },
  activeBadge: {
    color: colors.primaryStrong,
    fontSize: 11,
    fontWeight: "800",
  },
  emptySubscriptionCard: {
    marginTop: 16,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: colors.border,
    backgroundColor: colors.surface,
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 20,
    alignItems: "center",
  },
  emptyIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(74, 144, 226, 0.14)",
    marginBottom: 10,
  },
  emptySubscriptionTitle: {
    color: colors.textPrimary,
    fontSize: 18,
    fontWeight: "800",
  },
  emptySubscriptionSub: {
    marginTop: 6,
    color: colors.textSecondary,
    fontSize: 13,
    textAlign: "center",
    lineHeight: 18,
  },
  sectionTitle: {
    marginTop: 18,
    color: colors.textPrimary,
    fontSize: 14,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  wrap: {
    marginTop: 12,
    gap: 12,
  },
  card: {
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 14,
    gap: 4,
  },
  name: { color: colors.textPrimary, fontSize: 18, fontWeight: "700" },
  price: { color: colors.primaryStrong, fontSize: 24, fontWeight: "800" },
  cycle: { color: colors.textSecondary, fontSize: 12, fontWeight: "700" },
  description: { color: colors.textSecondary, fontSize: 12, marginTop: 2 },
  emptyPlans: { color: colors.textSecondary, fontSize: 13, paddingVertical: 18, textAlign: "center" },
});
