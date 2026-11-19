import { StyleSheet } from "react-native";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { BackTitleHeader } from "@/components/common/BackTitleHeader";
import { EmptyState } from "@/components/common/EmptyState";
import { PageTitleHeader } from "@/components/common/PageTitleHeader";
import { Screen } from "@/components/common/Screen";
import { RootStackParamList } from "@/navigation/types";
import { useAuthStore } from "@/store/authStore";

export function DownloadsScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const token = useAuthStore((state) => state.token);
  const showBackHeader = navigation.canGoBack();

  return (
    <Screen scroll={false} contentStyle={styles.screen}>
      {showBackHeader ? (
        <BackTitleHeader
          title="Downloads"
          onBack={() => {
            if (navigation.canGoBack()) {
              navigation.goBack();
              return;
            }
            navigation.navigate("Main", { screen: "Account" } as never);
          }}
        />
      ) : (
        <PageTitleHeader title="Downloads" />
      )}
      <EmptyState
        icon="download-outline"
        title="Downloads are not available yet"
        actionLabel={token ? "Browse titles" : "Sign In"}
        actionIcon={token ? "magnify" : "login"}
        onAction={() => token ? navigation.navigate("Main", { screen: "Search" } as never) : navigation.navigate("Auth")}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
});
