import { useState } from "react";
import { Alert, Pressable, StyleSheet, Text, View } from "react-native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { AuthScreenShell } from "@/components/common/AuthScreenShell";
import { InputField } from "@/components/common/InputField";
import { PrimaryButton } from "@/components/common/PrimaryButton";
import { AuthStackParamList } from "@/navigation/types";
import { forgotPassword } from "@/services/authService";
import { colors } from "@/theme/colors";
import { validateEmail } from "@/utils/authValidation";

type Props = NativeStackScreenProps<AuthStackParamList, "ForgotPassword">;

export function ForgotPasswordScreen({ navigation }: Props) {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | undefined>();

  const updateEmail = (value: string) => {
    setEmail(value);
    setError(undefined);
  };

  const onSubmit = async () => {
    const nextError = validateEmail(email) ?? undefined;
    if (nextError) {
      setError(nextError);
      return;
    }

    try {
      setLoading(true);
      await forgotPassword(email.trim());
      Alert.alert("Check your inbox", "If your email exists, password reset instructions have been sent.");
    } catch {
      Alert.alert("Request failed", "Please try again in some time.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthScreenShell title="Forgot password" subtitle="Enter your email and we will send a secure reset link.">
      <View style={styles.container}>
        <InputField
          label="Email address"
          hideLabel
          leadingIcon="email"
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="email-address"
          textContentType="emailAddress"
          value={email}
          onChangeText={updateEmail}
          placeholder="name@example.com"
          error={error}
        />
        <PrimaryButton label={loading ? "Sending..." : "Send Reset Link"} onPress={onSubmit} disabled={loading} />
        <Text style={styles.caption}>We will email a secure reset link if an account exists for this address.</Text>
        <Pressable onPress={() => navigation.navigate("Login")}>
          <Text style={styles.link}>Back to sign in</Text>
        </Pressable>
      </View>
    </AuthScreenShell>
  );
}

const styles = StyleSheet.create({
  container: { gap: 14 },
  caption: {
    color: colors.textSecondary,
    fontSize: 12,
    lineHeight: 18,
    textAlign: "center",
  },
  link: {
    color: colors.primaryStrong,
    fontWeight: "600",
    textAlign: "center",
  },
});
