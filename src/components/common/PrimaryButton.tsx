import { Pressable, StyleSheet, Text } from "react-native";
import { colors } from "@/theme/colors";

interface PrimaryButtonProps {
  label: string;
  onPress: () => void;
  disabled?: boolean;
}

export function PrimaryButton({ label, onPress, disabled = false }: PrimaryButtonProps) {
  return (
    <Pressable onPress={onPress} style={[styles.button, disabled && styles.disabled]} disabled={disabled}>
      <Text style={styles.label}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    backgroundColor: colors.primary,
    borderRadius: 12,
    minHeight: 48,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 18,
  },
  disabled: {
    opacity: 0.6,
  },
  label: {
    color: "#0f131b",
    fontSize: 15,
    fontWeight: "700",
  },
});
