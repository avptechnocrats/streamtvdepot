import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { isAxiosError } from "axios";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { AuthScreenShell } from "@/components/common/AuthScreenShell";
import { InputField } from "@/components/common/InputField";
import { PrimaryButton } from "@/components/common/PrimaryButton";
import { AuthStackParamList } from "@/navigation/types";
import { useAuth } from "@/hooks/useAuth";
import { resendVerification } from "@/services/authService";
import { colors } from "@/theme/colors";
import { validateEmail, validateFullName, validatePassword } from "@/utils/authValidation";

type Props = NativeStackScreenProps<AuthStackParamList, "Signup">;

export function SignupScreen({ navigation }: Props) {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [otp, setOtp] = useState("");
  const [pendingVerification, setPendingVerification] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [resending, setResending] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [signupError, setSignupError] = useState<string | null>(null);
  const [otpError, setOtpError] = useState<string | undefined>();
  const [errors, setErrors] = useState<{ fullName?: string; email?: string; password?: string }>({});
  const { signupMutation, verifyEmailMutation, establishVerifiedSession } = useAuth();

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

    setSignupError(null);
    try {
      const response = await signupMutation.mutateAsync({ fullName: fullName.trim(), email: email.trim(), password });
      setNotice(response.message);
      setPendingVerification(true);
    } catch (error) {
      const detail = isAxiosError<{ detail?: string }>(error) ? error.response?.data?.detail : undefined;
      setSignupError(detail ?? "Please try again in a moment.");
    }
  };

  const onVerify = async () => {
    if (!/^\d{6}$/.test(otp)) {
      setOtpError("Enter the 6-digit code from your email.");
      return;
    }

    setVerifying(true);
    setOtpError(undefined);
    let emailVerified = false;
    try {
      const response = await verifyEmailMutation.mutateAsync({ email: email.trim(), otp });
      emailVerified = response.verified;
      if (!response.verified || !response.access_token || !response.user) {
        setOtpError(response.message);
        return;
      }
      navigation.getParent()?.navigate("Main", { screen: "Home" } as never);
      await establishVerifiedSession(response);
    } catch (error) {
      const detail = isAxiosError<{ detail?: string }>(error) ? error.response?.data?.detail : undefined;
      setOtpError(
        emailVerified
          ? "Email verified, but automatic sign-in failed. Please sign in."
          : typeof detail === "string" ? detail : "Unable to verify your email right now. Please try again.",
      );
    } finally {
      setVerifying(false);
    }
  };

  const onResend = async () => {
    setResending(true);
    setOtpError(undefined);
    try {
      const response = await resendVerification(email.trim());
      setNotice(response.message);
    } catch (error) {
      const detail = isAxiosError<{ detail?: string }>(error) ? error.response?.data?.detail : undefined;
      setOtpError(detail ?? "Could not resend the verification email.");
    } finally {
      setResending(false);
    }
  };

  return (
    <AuthScreenShell
      title={pendingVerification ? "Verify your email" : "Create your account"}
      subtitle={pendingVerification ? `Enter the 6-digit code sent to ${email.trim()}.` : "Set up your profile and start streaming in a few moments."}
    >
      {pendingVerification ? (
        <View style={styles.container}>
          {notice ? <Text style={styles.notice}>{notice}</Text> : null}
          <InputField
            label="Verification code"
            hideLabel
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="one-time-code"
            keyboardType="number-pad"
            textContentType="oneTimeCode"
            maxLength={6}
            value={otp}
            onChangeText={(value) => {
              setOtp(value.replace(/\D/g, "").slice(0, 6));
              setOtpError(undefined);
            }}
            placeholder="6-digit code"
            error={otpError}
          />
          <PrimaryButton label={verifying ? "Verifying..." : "Verify Email"} onPress={onVerify} disabled={verifying} />
          <Pressable disabled={resending} onPress={onResend}>
            <Text style={[styles.link, resending && styles.linkDisabled]}>{resending ? "Sending..." : "Resend verification code"}</Text>
          </Pressable>
          <Pressable onPress={() => navigation.replace("Login")}>
            <Text style={styles.link}>Back to sign in</Text>
          </Pressable>
        </View>
      ) : (
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
          {signupError ? <Text style={styles.error}>{signupError}</Text> : null}
          <Text style={styles.caption}>Create your account now and keep your billing, watchlist, and playback history synced across devices.</Text>
          <Pressable onPress={() => navigation.navigate("Login")}>
            <Text style={styles.link}>Already have an account? Sign in</Text>
          </Pressable>
        </View>
      )}
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
  notice: {
    color: colors.textSecondary,
    fontSize: 13,
    lineHeight: 20,
    textAlign: "center",
  },
  error: {
    color: colors.danger,
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
  linkDisabled: {
    opacity: 0.55,
  },
});
