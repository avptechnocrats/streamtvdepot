import { Pressable, StyleSheet, Text } from "react-native";
import LinearGradient from "react-native-linear-gradient";
import { colors } from "@/theme/colors";

interface PrimaryButtonProps {
  label: string;
  onPress: () => void;
  disabled?: boolean;
}

export function PrimaryButton({ label, onPress, disabled = false }: PrimaryButtonProps) {
  return (
    <Pressable onPress={onPress} style={disabled ? styles.disabled : undefined} disabled={disabled}>
      <LinearGradient colors={[colors.primaryStrong, colors.primary]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.button}>
        <Text style={styles.label}>{label}</Text>
      </LinearGradient>
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
    color: "#f8f9fa",
    fontSize: 16,
    fontWeight: "900",
  },
});
