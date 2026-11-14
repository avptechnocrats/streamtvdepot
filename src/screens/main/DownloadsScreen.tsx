import { Pressable, StyleSheet, Text, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import MaterialCommunityIcons from "react-native-vector-icons/MaterialCommunityIcons";
import { BackTitleHeader } from "@/components/common/BackTitleHeader";
import { PageTitleHeader } from "@/components/common/PageTitleHeader";
import { Screen } from "@/components/common/Screen";
import { RootStackParamList } from "@/navigation/types";
import { colors } from "@/theme/colors";

export function DownloadsScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
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
      <View style={styles.wrap}>
        <Text style={styles.emptyTitle}>No videos downloaded</Text>
        <Pressable style={styles.ctaBtn} onPress={() => navigation.navigate("Main", { screen: "Search" } as never)}>
          <MaterialCommunityIcons name="download-outline" size={22} color={colors.textPrimary} style={styles.ctaIcon} />
          <Text style={styles.ctaText}>Find videos to download</Text>
        </Pressable>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  wrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingBottom: 110,
  },
  emptyTitle: {
    color: colors.textPrimary,
    fontSize: 24,
    fontWeight: "800",
    textAlign: "center",
  },
  ctaBtn: {
    marginTop: 14,
    minHeight: 54,
    borderRadius: 16,
    paddingHorizontal: 26,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  ctaIcon: {
    marginRight: 8,
  },
  ctaText: {
    color: colors.textPrimary,
    fontSize: 18,
    fontWeight: "700",
  },
});
