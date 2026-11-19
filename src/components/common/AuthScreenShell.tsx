import { PropsWithChildren } from "react";
import { StyleSheet, Text, View } from "react-native";
import { BrandLogo } from "@/components/common/BrandLogo";
import { Screen } from "@/components/common/Screen";
import { colors } from "@/theme/colors";

interface AuthScreenShellProps extends PropsWithChildren {
  title?: string;
  subtitle?: string;
  compact?: boolean;
}

export function AuthScreenShell({ title, subtitle, compact = false, children }: AuthScreenShellProps) {
  return (
    <Screen scroll={false} contentStyle={styles.screenContent}>
      <View style={styles.backdropTop} />
      <View style={styles.backdropBottom} />
      <View style={[styles.topArea, compact && styles.topAreaCompact]}>
        <View style={styles.glowPrimary} />
        <BrandLogo size="auth" />
      </View>
      <View style={styles.contentArea}>
        <View style={styles.glowSecondary} />
        {title ? <Text style={styles.title}>{title}</Text> : null}
        {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
        <View style={styles.form}>{children}</View>
      </View>
      <View style={styles.versionWrap}>
        <Text style={styles.version}>Version 1.0</Text>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  screenContent: {
    flex: 1,
    paddingTop: 0,
    paddingBottom: 12,
    paddingHorizontal: 10,
    position: "relative",
  },
  backdropTop: {
    position: "absolute",
    top: -80,
    left: -40,
    width: 220,
    height: 220,
    borderRadius: 999,
    backgroundColor: `${colors.primary}16`,
  },
  backdropBottom: {
    position: "absolute",
    bottom: 20,
    right: -60,
    width: 200,
    height: 200,
    borderRadius: 999,
    backgroundColor: `${colors.primaryStrong}10`,
  },
  topArea: {
    paddingTop: 50,
    alignItems: "center",
    gap: 0,
  },
  topAreaCompact: {
    paddingTop: 16,
  },
  contentArea: {
    flex: 1,
    justifyContent: "flex-start",
    paddingTop: 0,
  },
  glowPrimary: {
    position: "absolute",
    top: -12,
    right: -20,
    width: 140,
    height: 140,
    borderRadius: 999,
    backgroundColor: `${colors.primary}20`,
  },
  glowSecondary: {
    position: "absolute",
    bottom: 28,
    left: 0,
    width: 120,
    height: 120,
    borderRadius: 999,
    backgroundColor: `${colors.primaryStrong}22`,
  },
  title: {
    // marginTop: 12,
    color: colors.textPrimary,
    fontSize: 30,
    fontWeight: "800",
    textAlign: "center",
  },
  subtitle: {
    marginTop: 8,
    color: colors.textSecondary,
    fontSize: 14,
    lineHeight: 20,
    textAlign: "center",
  },
  form: {
    marginTop: 24,
    gap: 18,
  },
  versionWrap: {
    alignItems: "center",
    paddingTop: 6,
  },
  version: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    color: colors.textSecondary,
    fontSize: 12,
    textAlign: "center",
    // borderRadius: 999,
    // backgroundColor: "rgba(255,255,255,0.04)",
  },
});