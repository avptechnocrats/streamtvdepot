import { Pressable, StyleSheet, Text, View } from "react-native";
import MaterialCommunityIcons from "react-native-vector-icons/MaterialCommunityIcons";
import { colors } from "@/theme/colors";

interface BackTitleHeaderProps {
  title: string;
  subtitle?: string;
  onBack: () => void;
}

export function BackTitleHeader({ title, subtitle, onBack }: BackTitleHeaderProps) {
  return (
    <View style={styles.headerRow}>
      <Pressable onPress={onBack} style={styles.backButton}>
        <MaterialCommunityIcons name="chevron-left" size={22} color={colors.textPrimary} />
      </Pressable>
      <View style={styles.headerTextWrap}>
        <Text style={styles.title}>{title}</Text>
        {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  headerRow: {
    marginTop: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  backButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  headerTextWrap: {
    flex: 1,
  },
  title: {
    color: colors.textPrimary,
    fontSize: 20,
    fontWeight: "800",
  },
  subtitle: {
    marginTop: 1,
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: "600",
  },
});