import { StyleSheet, Text } from "react-native";
import { colors } from "@/theme/colors";

interface PageTitleHeaderProps {
  title: string;
}

export function PageTitleHeader({ title }: PageTitleHeaderProps) {
  return <Text style={styles.title}>{title}</Text>;
}

const styles = StyleSheet.create({
  title: {
    marginTop: 16,
    color: colors.textPrimary,
    fontSize: 25,
    fontWeight: "800",
    lineHeight: 34,
  },
});
