import { useCallback } from "react";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { RootStackParamList } from "@/navigation/types";
import { useAuthStore } from "@/store/authStore";
import { useContentAccess } from "@/hooks/useContentAccess";

type AccessType = "free" | "subscription" | "pay_per_view" | "rental";

interface UsePlayGateOptions {
  contentId: string;
  accessType: AccessType;
  planId?: string;
  onAllowedPlay: () => void;
}

export function usePlayGate({ contentId, accessType, planId, onAllowedPlay }: UsePlayGateOptions) {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const token = useAuthStore((s) => s.token);
  const { data: accessData, isFetching } = useContentAccess(accessType !== "free" && token ? contentId : null);

  const handlePlay = useCallback(() => {
    if (accessType === "free") {
      onAllowedPlay();
      return;
    }

    if (!token) {
      navigation.navigate("Auth");
      return;
    }

    if (isFetching) {
      return;
    }

    if (accessData?.has_access) {
      onAllowedPlay();
      return;
    }

    if (accessType === "subscription") {
      navigation.navigate("Pricing");
      return;
    }

    if (!planId) {
      navigation.navigate("Pricing", { purchaseType: accessType === "rental" ? "rent" : "ppv", contentId });
      return;
    }

    navigation.navigate("Checkout", { planId, contentId, purchaseType: accessType === "rental" ? "rent" : "ppv" });
  }, [accessData?.has_access, accessType, contentId, isFetching, navigation, onAllowedPlay, planId, token]);

  return {
    handlePlay,
    isCheckingAccess: isFetching,
  };
}
