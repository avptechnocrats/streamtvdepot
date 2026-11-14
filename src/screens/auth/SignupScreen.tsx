import { useState } from "react";
import { Alert, Pressable, StyleSheet, Text, View } from "react-native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { AuthScreenShell } from "@/components/common/AuthScreenShell";
import { InputField } from "@/components/common/InputField";
import { PrimaryButton } from "@/components/common/PrimaryButton";
import { AuthStackParamList } from "@/navigation/types";
import { useAuth } from "@/hooks/useAuth";
import { colors } from "@/theme/colors";
import { validateEmail, validateFullName, validatePassword } from "@/utils/authValidation";

type Props = NativeStackScreenProps<AuthStackParamList, "Signup">;

export function SignupScreen({ navigation }: Props) {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<{ fullName?: string; email?: string; password?: string }>({});
  const { signupMutation } = useAuth();

  const updateField = (field: "fullName" | "email" | "password", value: string) => {
    if (field === "fullName") {
      setFullName(value);
    } else if (field === "email") {
      setEmail(value);
    } else {
      setPassword(value);
    }

    setErrors((current) => ({ ...current, [field]: undefined }));
  };

  const onSignup = async () => {
    const nextErrors = {
      fullName: validateFullName(fullName) ?? undefined,
      email: validateEmail(email) ?? undefined,
      password: validatePassword(password) ?? undefined,
    };

    if (nextErrors.fullName || nextErrors.email || nextErrors.password) {
      setErrors(nextErrors);
      return;
    }

    try {
      await signupMutation.mutateAsync({ fullName: fullName.trim(), email: email.trim(), password });
    } catch {
      Alert.alert("Signup failed", "Please try again in a moment.");
    }
  };

  return (
    <AuthScreenShell title="Create your account" subtitle="Set up your profile and start streaming in a few moments.">
      <View style={styles.container}>
        <InputField
          label="Full name"
          hideLabel
          leadingIcon="user"
          value={fullName}
          onChangeText={(value) => updateField("fullName", value)}
          placeholder="Your full name"
          error={errors.fullName}
        />
        <InputField
          label="Email address"
          hideLabel
          leadingIcon="email"
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="email-address"
          textContentType="emailAddress"
          value={email}
          onChangeText={(value) => updateField("email", value)}
          placeholder="name@example.com"
          error={errors.email}
        />
        <InputField
          label="Password"
          hideLabel
          leadingIcon="password"
          secureTextEntry
          allowPasswordToggle
          autoCapitalize="none"
          textContentType="newPassword"
          value={password}
          onChangeText={(value) => updateField("password", value)}
          placeholder="Create a strong password"
          error={errors.password}
        />
        <PrimaryButton label={signupMutation.isPending ? "Creating..." : "Create Account"} onPress={onSignup} disabled={signupMutation.isPending} />
        <Text style={styles.caption}>Create your account now and keep your billing, watchlist, and playback history synced across devices.</Text>
        <Pressable onPress={() => navigation.navigate("Login")}>
          <Text style={styles.link}>Already have an account? Sign in</Text>
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
    marginTop: 4,
    textAlign: "center",
  },
});
