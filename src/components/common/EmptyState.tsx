import { Pressable, StyleSheet, Text, View } from "react-native";
import MaterialCommunityIcons from "react-native-vector-icons/MaterialCommunityIcons";
import { colors } from "@/theme/colors";

interface EmptyStateProps {
  icon: string;
  title: string;
  message?: string;
  actionLabel?: string;
  actionIcon?: string;
  onAction?: () => void;
}

export function EmptyState({ icon, title, message, actionLabel, actionIcon, onAction }: EmptyStateProps) {
  return (
    <View style={styles.wrap}>
      <View style={styles.iconWrap}>
        <MaterialCommunityIcons name={icon} size={34} color={colors.primaryStrong} />
      </View>
      <Text style={styles.title}>{title}</Text>
      {message ? <Text style={styles.message}>{message}</Text> : null}
      {actionLabel && onAction ? (
        <Pressable style={styles.action} onPress={onAction} accessibilityRole="button">
          {actionIcon ? <MaterialCommunityIcons name={actionIcon} size={19} color="#f4f6f9" /> : null}
          <Text style={styles.actionText}>{actionLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 24, paddingBottom: 52 },
  iconWrap: { width: 72, height: 72, borderRadius: 36, alignItems: "center", justifyContent: "center", backgroundColor: colors.surfaceMuted, borderWidth: 1, borderColor: colors.border, marginBottom: 20 },
  title: { color: colors.textPrimary, fontSize: 21, fontWeight: "800", textAlign: "center" },
  message: { marginTop: 8, maxWidth: 300, color: colors.textSecondary, fontSize: 14, lineHeight: 21, textAlign: "center" },
  action: { marginTop: 22, minHeight: 48, minWidth: 148, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingHorizontal: 20, borderRadius: 6, backgroundColor: colors.primary },
  actionText: { color: "#f4f6f9", fontSize: 16, fontWeight: "900" },
});