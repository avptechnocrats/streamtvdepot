import { useState } from "react";
import { Alert, Pressable, StyleSheet, Text, View } from "react-native";
import { isAxiosError } from "axios";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import MaterialCommunityIcons from "react-native-vector-icons/MaterialCommunityIcons";
import { AuthScreenShell } from "@/components/common/AuthScreenShell";
import { InputField } from "@/components/common/InputField";
import { PrimaryButton } from "@/components/common/PrimaryButton";
import { AuthStackParamList } from "@/navigation/types";
import { useAuth } from "@/hooks/useAuth";
import { colors } from "@/theme/colors";
import { normalizePhone, validateEmail, validatePassword, validatePhone } from "@/utils/authValidation";

type Props = NativeStackScreenProps<AuthStackParamList, "Login">;
type LoginMode = "email" | "phone";

const socialProviders = [
  { key: "google", label: "Google", icon: "google", iconColor: "#ea4335" },
  { key: "apple", label: "Apple", icon: "apple", iconColor: colors.textPrimary },
  { key: "facebook", label: "Facebook", icon: "facebook", iconColor: "#1877f2" },
] as const;

export function LoginScreen({ navigation }: Props) {
  const [mode, setMode] = useState<LoginMode>("email");
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<{ identifier?: string; password?: string }>({});
  const { loginMutation } = useAuth();

  const updateIdentifier = (value: string) => {
    setIdentifier(value);
    setErrors((current) => ({ ...current, identifier: undefined }));
  };

  const updatePassword = (value: string) => {
    setPassword(value);
    setErrors((current) => ({ ...current, password: undefined }));
  };

  const switchMode = (nextMode: LoginMode) => {
    setMode(nextMode);
    setIdentifier("");
    setPassword("");
    setErrors({});
  };

  const onLogin = async () => {
    const nextErrors = {
      identifier: mode === "email" ? validateEmail(identifier) ?? undefined : validatePhone(identifier) ?? undefined,
      password: validatePassword(password) ?? undefined,
    };

    if (nextErrors.identifier || nextErrors.password) {
      setErrors(nextErrors);
      return;
    }

    if (mode === "phone") {
      Alert.alert("Coming soon", "Phone number sign-in will be enabled in a future API update. Please sign in with email for now.");
      return;
    }

    try {
      await loginMutation.mutateAsync({
        identifier: identifier.trim(),
        password,
        mode,
      });
    } catch (error) {
      const fallback = "Please verify your credentials and try again.";
      let message = fallback;

      if (isAxiosError<Record<string, unknown>>(error)) {
        const data = error.response?.data;
        const detail = typeof data?.detail === "string" ? data.detail : undefined;
        const errorMessage = typeof data?.message === "string" ? data.message : undefined;
        const errorText = typeof data?.error === "string" ? data.error : undefined;
        message = detail || errorMessage || errorText || error.message || fallback;
      }

      Alert.alert("Sign in failed", message);
    }
  };

  return (
    <AuthScreenShell title="Sign In" subtitle="Sign in to continue streaming your favorites across every device.">
      <View style={styles.content}>
        <View style={styles.segmentedControl}>
          <Pressable onPress={() => switchMode("email")} style={[styles.segment, mode === "email" && styles.segmentActive]}>
            <Text style={[styles.segmentText, mode === "email" && styles.segmentTextActive]}>Email</Text>
          </Pressable>
          <Pressable onPress={() => switchMode("phone")} style={[styles.segment, mode === "phone" && styles.segmentActive]}>
            <Text style={[styles.segmentText, mode === "phone" && styles.segmentTextActive]}>Phone</Text>
          </Pressable>
        </View>

        {mode === "phone" ? <Text style={styles.modeHint}>Phone sign-in UI is ready. Backend support will be enabled in a future update.</Text> : null}

        <InputField
          label={mode === "email" ? "Email address" : "Phone number"}
          hideLabel
          leadingIcon={mode === "email" ? "email" : "phone"}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType={mode === "email" ? "email-address" : "phone-pad"}
          textContentType={mode === "email" ? "emailAddress" : "telephoneNumber"}
          value={identifier}
          onChangeText={updateIdentifier}
          placeholder={mode === "email" ? "name@example.com" : "+91 98765 43210"}
          error={errors.identifier}
        />
        <InputField
          label="Password"
          hideLabel
          leadingIcon="password"
          secureTextEntry
          allowPasswordToggle
          autoCapitalize="none"
          textContentType="password"
          value={password}
          onChangeText={updatePassword}
          placeholder="Enter your password"
          error={errors.password}
        />

        <PrimaryButton label={loginMutation.isPending ? "Signing in..." : "Sign In"} onPress={onLogin} disabled={loginMutation.isPending} />

        <View style={styles.socialSection}>
          <View style={styles.dividerRow}>
            <View style={styles.divider} />
            <Text style={styles.dividerText}>or continue with</Text>
            <View style={styles.divider} />
          </View>
          <View style={styles.socialGrid}>
            {socialProviders.map((provider) => (
              <Pressable
                key={provider.key}
                onPress={() => Alert.alert("Coming soon", `${provider.label} sign-in will be available in a future update.`)}
                style={styles.socialButton}
              >
                <MaterialCommunityIcons name={provider.icon} size={26} color={provider.iconColor} />
              </Pressable>
            ))}
          </View>
        </View>

        <Pressable onPress={() => navigation.navigate("ForgotPassword")}>
          <Text style={styles.link}>Forgot password?</Text>
        </Pressable>

        <Pressable onPress={() => navigation.navigate("Signup")}>
          <Text style={styles.link}>New user? Create account</Text>
        </Pressable>
      </View>
    </AuthScreenShell>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: 16,
  },
  segmentedControl: {
    flexDirection: "row",
    borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.05)",
    padding: 4,
    gap: 6,
  },
  segment: {
    flex: 1,
    minHeight: 42,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  segmentActive: {
    backgroundColor: "rgba(255,255,255,0.12)",
  },
  segmentText: {
    color: colors.textSecondary,
    fontWeight: "700",
  },
  segmentTextActive: {
    color: colors.textPrimary,
  },
  modeHint: {
    color: colors.textSecondary,
    fontSize: 12,
    lineHeight: 18,
    textAlign: "center",
  },
  socialSection: {
    gap: 14,
  },
  dividerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  divider: {
    flex: 1,
    height: 1,
    backgroundColor: "rgba(255,255,255,0.1)",
  },
  dividerText: {
    color: colors.textSecondary,
    fontSize: 12,
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  socialGrid: {
    flexDirection: "row",
    gap: 10,
  },
  socialButton: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    backgroundColor: "rgba(255,255,255,0.04)",
    borderRadius: 18,
    paddingVertical: 14,
  },
  link: {
    color: colors.primaryStrong,
    fontWeight: "600",
    marginTop: 2,
    textAlign: "center",
  },
});
