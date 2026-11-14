import { useState } from "react";
import { Alert, StyleSheet, Text, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { BackTitleHeader } from "@/components/common/BackTitleHeader";
import { Screen } from "@/components/common/Screen";
import { InputField } from "@/components/common/InputField";
import { PrimaryButton } from "@/components/common/PrimaryButton";
import { RootStackParamList } from "@/navigation/types";
import { changeMyPassword } from "@/services/accountService";
import { colors } from "@/theme/colors";

export function SecurityScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    try {
      setSubmitting(true);
      await changeMyPassword(currentPassword, newPassword);
      Alert.alert("Password updated", "Your account security settings have been updated.");
      setCurrentPassword("");
      setNewPassword("");
    } catch {
      Alert.alert("Update failed", "Could not change password. Check your current password and try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Screen>
      <BackTitleHeader
        title="Security"
        onBack={() => {
          if (navigation.canGoBack()) {
            navigation.goBack();
            return;
          }
          navigation.navigate("Main", { screen: "Account" } as never);
        }}
      />
      <View style={styles.wrap}>
        <Text style={styles.sub}>Update your password regularly for better account protection.</Text>
        <InputField label="Current password" secureTextEntry value={currentPassword} onChangeText={setCurrentPassword} />
        <InputField label="New password" secureTextEntry value={newPassword} onChangeText={setNewPassword} />
        <PrimaryButton label={submitting ? "Updating..." : "Update Password"} onPress={submit} disabled={submitting} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingTop: 14, gap: 12 },
  sub: { color: colors.textSecondary },
});
