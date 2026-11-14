import { useState } from "react";
import { Alert, StyleSheet, Text, View } from "react-native";
import { Screen } from "@/components/common/Screen";
import { InputField } from "@/components/common/InputField";
import { PrimaryButton } from "@/components/common/PrimaryButton";
import { resetPassword } from "@/services/authService";
import { colors } from "@/theme/colors";

export function ResetPasswordScreen() {
  const [token, setToken] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const onSubmit = async () => {
    try {
      setLoading(true);
      await resetPassword(token, password);
      Alert.alert("Success", "Password reset complete. Please sign in.");
    } catch {
      Alert.alert("Failed", "Unable to reset password with the provided token.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Screen>
      <View style={styles.container}>
        <Text style={styles.title}>Reset password</Text>
        <InputField label="Reset token" value={token} onChangeText={setToken} />
        <InputField label="New password" secureTextEntry value={password} onChangeText={setPassword} />
        <PrimaryButton label={loading ? "Updating..." : "Update Password"} onPress={onSubmit} disabled={loading} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: { gap: 12, paddingTop: 34 },
  title: { color: colors.textPrimary, fontSize: 30, fontWeight: "800" },
});
