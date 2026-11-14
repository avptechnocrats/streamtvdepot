import { useState } from "react";
import { Pressable, StyleProp, StyleSheet, Text, TextInput, TextInputProps, View, ViewStyle } from "react-native";
import { colors } from "@/theme/colors";

interface InputFieldProps extends TextInputProps {
  label: string;
  error?: string;
  containerStyle?: StyleProp<ViewStyle>;
  allowPasswordToggle?: boolean;
  hideLabel?: boolean;
  leadingIcon?: "email" | "phone" | "password" | "user";
}

function EyeIcon({ visible }: { visible: boolean }) {
  return (
    <View style={[styles.eyeOuter, visible && styles.eyeOuterVisible]}>
      <View style={[styles.eyeInner, visible && styles.eyeInnerVisible]} />
    </View>
  );
}

function FieldIcon({ kind, active }: { kind: NonNullable<InputFieldProps["leadingIcon"]>; active: boolean }) {
  const tint = active ? colors.primaryStrong : colors.textSecondary;

  if (kind === "email") {
    return (
      <View style={[styles.iconEnvelope, { borderColor: tint }]}> 
        <View style={[styles.iconEnvelopeFlapLeft, { backgroundColor: tint }]} />
        <View style={[styles.iconEnvelopeFlapRight, { backgroundColor: tint }]} />
      </View>
    );
  }

  if (kind === "phone") {
    return (
      <View style={[styles.iconPhoneBody, { borderColor: tint }]}> 
        <View style={[styles.iconPhoneSpeaker, { backgroundColor: tint }]} />
        <View style={[styles.iconPhoneButton, { backgroundColor: tint }]} />
      </View>
    );
  }

  if (kind === "user") {
    return (
      <View style={styles.iconUserWrap}>
        <View style={[styles.iconUserHead, { borderColor: tint }]} />
        <View style={[styles.iconUserBody, { borderColor: tint }]} />
      </View>
    );
  }

  return (
    <View style={styles.iconLockWrap}>
      <View style={[styles.iconLockShackle, { borderColor: tint }]} />
      <View style={[styles.iconLockBody, { borderColor: tint }]} />
    </View>
  );
}

export function InputField({
  label,
  error,
  containerStyle,
  allowPasswordToggle = false,
  hideLabel = false,
  leadingIcon,
  secureTextEntry,
  onBlur,
  onFocus,
  onChangeText,
  ...props
}: InputFieldProps) {
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [focused, setFocused] = useState(false);
  const hasPasswordToggle = Boolean(secureTextEntry && allowPasswordToggle);

  const resolvedSecureTextEntry = hasPasswordToggle ? !passwordVisible : secureTextEntry;

  return (
    <View style={[styles.wrap, containerStyle]}>
      {hideLabel ? null : <Text style={[styles.label, focused && !error ? styles.labelFocused : null]}>{label}</Text>}
      <View style={[styles.inputShell, focused && !error ? styles.inputShellFocused : null, error ? styles.inputShellError : null]}>
        {leadingIcon ? (
          <View pointerEvents="none" style={styles.leadingIconWrap}>
            <FieldIcon kind={leadingIcon} active={focused && !error} />
          </View>
        ) : null}
        <TextInput
          placeholderTextColor={colors.textSecondary}
          style={[styles.input, leadingIcon ? styles.inputWithLeadingIcon : null, hasPasswordToggle ? styles.inputWithAccessory : null]}
          secureTextEntry={resolvedSecureTextEntry}
          onBlur={(event) => {
            setFocused(false);
            onBlur?.(event);
          }}
          onChangeText={onChangeText}
          onFocus={(event) => {
            setFocused(true);
            onFocus?.(event);
          }}
          {...props}
        />
        {hasPasswordToggle ? (
          <Pressable onPress={() => setPasswordVisible((current) => !current)} style={styles.eyeButton} hitSlop={10}>
            <EyeIcon visible={passwordVisible} />
          </Pressable>
        ) : null}
      </View>
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 8 },
  label: {
    color: colors.textPrimary,
    fontWeight: "600",
    fontSize: 13,
    letterSpacing: 0.2,
  },
  labelFocused: {
    color: colors.primaryStrong,
  },
  inputShell: {
    position: "relative",
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: "rgba(26, 33, 45, 0.92)",
    borderRadius: 16,
  },
  inputShellFocused: {
    borderColor: colors.primaryStrong,
    shadowColor: colors.primary,
    shadowOpacity: 0.22,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 10 },
    elevation: 3,
  },
  inputShellError: {
    borderColor: colors.danger,
  },
  input: {
    color: colors.textPrimary,
    paddingHorizontal: 16,
    height: 56,
  },
  inputWithLeadingIcon: {
    paddingLeft: 50,
  },
  inputWithAccessory: {
    paddingRight: 54,
  },
  leadingIconWrap: {
    position: "absolute",
    left: 16,
    top: 0,
    bottom: 0,
    justifyContent: "center",
  },
  eyeButton: {
    position: "absolute",
    right: 12,
    top: 0,
    bottom: 0,
    justifyContent: "center",
  },
  eyeOuter: {
    width: 22,
    height: 14,
    borderWidth: 1.5,
    borderColor: colors.textSecondary,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  eyeOuterVisible: {
    borderColor: colors.primaryStrong,
  },
  eyeInner: {
    width: 6,
    height: 6,
    borderRadius: 999,
    backgroundColor: colors.textSecondary,
  },
  eyeInnerVisible: {
    backgroundColor: colors.primaryStrong,
  },
  iconEnvelope: {
    width: 16,
    height: 12,
    borderWidth: 1.5,
    borderRadius: 3,
    overflow: "hidden",
  },
  iconEnvelopeFlapLeft: {
    position: "absolute",
    left: 0,
    right: 7,
    top: 5,
    height: 1.5,
    transform: [{ rotate: "28deg" }],
  },
  iconEnvelopeFlapRight: {
    position: "absolute",
    left: 7,
    right: 0,
    top: 5,
    height: 1.5,
    transform: [{ rotate: "-28deg" }],
  },
  iconPhoneBody: {
    width: 12,
    height: 18,
    borderWidth: 1.5,
    borderRadius: 3,
    alignItems: "center",
  },
  iconPhoneSpeaker: {
    width: 5,
    height: 1.5,
    borderRadius: 999,
    marginTop: 2,
  },
  iconPhoneButton: {
    width: 3,
    height: 3,
    borderRadius: 999,
    marginTop: 8,
  },
  iconUserWrap: {
    alignItems: "center",
    justifyContent: "center",
    width: 16,
    height: 16,
  },
  iconUserHead: {
    width: 7,
    height: 7,
    borderWidth: 1.5,
    borderRadius: 999,
  },
  iconUserBody: {
    width: 12,
    height: 6,
    borderWidth: 1.5,
    borderTopWidth: 1.5,
    borderBottomWidth: 0,
    borderLeftWidth: 1.5,
    borderRightWidth: 1.5,
    borderTopLeftRadius: 8,
    borderTopRightRadius: 8,
    marginTop: 1,
  },
  iconLockWrap: {
    width: 16,
    height: 16,
    alignItems: "center",
    justifyContent: "flex-end",
  },
  iconLockShackle: {
    width: 8,
    height: 7,
    borderWidth: 1.5,
    borderBottomWidth: 0,
    borderTopLeftRadius: 6,
    borderTopRightRadius: 6,
    marginBottom: -1,
  },
  iconLockBody: {
    width: 12,
    height: 9,
    borderWidth: 1.5,
    borderRadius: 3,
  },
  error: {
    color: colors.danger,
    fontSize: 12,
    lineHeight: 16,
    paddingLeft: 2,
  },
});
