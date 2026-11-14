import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ActivityIndicator, Alert, Linking, Pressable, StyleSheet, Text, View } from "react-native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { Screen } from "@/components/common/Screen";
import { PrimaryButton } from "@/components/common/PrimaryButton";
import { beginCheckout, fetchSubscriptionPlans, CheckoutGateway } from "@/services/subscriptionService";
import { RootStackParamList } from "@/navigation/types";
import { useAuthStore } from "@/store/authStore";
import { colors } from "@/theme/colors";

type Props = NativeStackScreenProps<RootStackParamList, "Checkout">;

export function CheckoutScreen({ route }: Props) {
  const { planId: requestedPlanId, contentId, purchaseType } = route.params;
  const country = useAuthStore((state) => state.user?.country);
  const [gateway, setGateway] = useState<CheckoutGateway>("stripe");
  const [isStarting, setIsStarting] = useState(false);
  const planType = purchaseType === "ppv" ? "ppv" : purchaseType === "rent" ? "rent" : "subscription";
  const { data: plans = [], isLoading } = useQuery({
    queryKey: ["checkout-plans", planType],
    queryFn: () => fetchSubscriptionPlans(planType),
  });
  const selectedPlan = useMemo(
    () => plans.find((plan) => plan.id === requestedPlanId) ?? plans[0],
    [plans, requestedPlanId],
  );

  const onCheckout = async () => {
    if (!selectedPlan) {
      Alert.alert("Plan unavailable", "This purchase option is no longer available. Please choose another plan.");
      return;
    }
    setIsStarting(true);
    try {
      const result = await beginCheckout(selectedPlan.id, { contentId, purchaseType, gateway, country });
      if (result.gateway === "free" || result.subscription_id) {
        Alert.alert("Purchase complete", "Your access is active and ready to use.");
        return;
      }

      const checkoutUrl = result.checkout_url || result.paypal_approval_url;
      if (!checkoutUrl) {
        Alert.alert("Payment setup required", "This payment method is not available in the mobile app yet. Please choose another method.");
        return;
      }
      const supported = await Linking.canOpenURL(checkoutUrl);
      if (!supported) {
        Alert.alert("Unable to open payment", "Please try again or choose another payment method.");
        return;
      }
      await Linking.openURL(checkoutUrl);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to start payment for this plan.";
      Alert.alert("Checkout failed", message);
    } finally {
      setIsStarting(false);
    }
  };

  return (
    <Screen>
      <View style={styles.container}>
        <Text style={styles.eyebrow}>{planType === "subscription" ? "MEMBERSHIP" : planType === "ppv" ? "ONE-TIME EVENT" : "RENTAL"}</Text>
        <Text style={styles.title}>Secure checkout</Text>
        <Text style={styles.sub}>Review your access and continue with a secure payment provider.</Text>
        {isLoading ? <ActivityIndicator color={colors.primary} style={styles.loader} /> : null}
        {selectedPlan ? (
          <View style={styles.summary}>
            <Text style={styles.planName}>{selectedPlan.name}</Text>
            <Text style={styles.price}>{selectedPlan.price === 0 ? "Free" : `${selectedPlan.currency} ${selectedPlan.price.toFixed(2)}`}</Text>
            <Text style={styles.planDescription}>{selectedPlan.description || "Instant access with secure payment."}</Text>
          </View>
        ) : null}
        <Text style={styles.sectionTitle}>Payment method</Text>
        <View style={styles.gatewayRow}>
          {(["stripe", "paypal"] as CheckoutGateway[]).map((item) => (
            <Pressable key={item} onPress={() => setGateway(item)} style={[styles.gateway, gateway === item && styles.gatewaySelected]}>
              <Text style={[styles.gatewayText, gateway === item && styles.gatewayTextSelected]}>{item === "stripe" ? "Card" : "PayPal"}</Text>
              <Text style={styles.gatewayMeta}>{item === "stripe" ? "Visa, Mastercard" : "Secure wallet"}</Text>
            </Pressable>
          ))}
        </View>
        <Text style={styles.secureNote}>🔒 Payments are processed securely. Your card details are never stored on this device.</Text>
        <PrimaryButton label={isStarting ? "Preparing secure checkout..." : "Continue to Payment"} onPress={onCheckout} disabled={isStarting || isLoading || !selectedPlan} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: { gap: 12, marginTop: 24 },
  eyebrow: { color: colors.primaryStrong, fontSize: 11, fontWeight: "900", letterSpacing: 1.3 },
  title: { color: colors.textPrimary, fontSize: 28, fontWeight: "800" },
  sub: { color: colors.textSecondary, lineHeight: 20 },
  loader: { marginTop: 18 },
  summary: { marginTop: 10, borderWidth: 1, borderColor: colors.border, borderRadius: 18, backgroundColor: colors.surface, padding: 18, gap: 6 },
  planName: { color: colors.textPrimary, fontSize: 19, fontWeight: "800" },
  price: { color: colors.primaryStrong, fontSize: 26, fontWeight: "900" },
  planDescription: { color: colors.textSecondary, lineHeight: 18 },
  sectionTitle: { color: colors.textPrimary, fontSize: 14, fontWeight: "800", marginTop: 6 },
  gatewayRow: { flexDirection: "row", gap: 10 },
  gateway: { flex: 1, borderWidth: 1, borderColor: colors.border, borderRadius: 14, padding: 13, backgroundColor: colors.surface, gap: 4 },
  gatewaySelected: { borderColor: colors.primary, backgroundColor: "rgba(244,184,68,0.10)" },
  gatewayText: { color: colors.textPrimary, fontSize: 15, fontWeight: "800" },
  gatewayTextSelected: { color: colors.primaryStrong },
  gatewayMeta: { color: colors.textSecondary, fontSize: 11 },
  secureNote: { color: colors.textSecondary, fontSize: 12, lineHeight: 17, marginTop: 4 },
});
