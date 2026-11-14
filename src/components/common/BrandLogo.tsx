import { Image, StyleProp, StyleSheet, Text, View, ViewStyle } from "react-native";
import { useSiteBranding } from "@/hooks/useSiteBranding";
import { clientConfig } from "@/config/clientConfig";
import { colors } from "@/theme/colors";

interface BrandLogoProps {
  showTitle?: boolean;
  size?: "default" | "auth" | "small";
  containerStyle?: StyleProp<ViewStyle>;
}

export function BrandLogo({ showTitle = true, size = "default", containerStyle }: BrandLogoProps) {
  const { data } = useSiteBranding();

  // API logo overrides the locally bundled one when available (server-driven white-label support).
  // The bundled logo is set per-client at build time via scripts/switch-client.sh.
  const logoUri = data?.logo_url ?? null;

  // Title: API site title → clientConfig.appName (injected from .env at build) → hardcoded fallback
  const title = data?.site_title || clientConfig.appName;

  return (
    <View style={[styles.wrap, size === "small" && styles.wrapSmall, containerStyle]}>
      {logoUri ? (
        <Image source={{ uri: logoUri }} style={[styles.logoWide, size === "auth" && styles.logoAuth, size === "small" && styles.logoSmall]} resizeMode="contain" />
      ) : (
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        <Image source={require("../../../assets/logo.png")} style={[styles.logoWide, size === "auth" && styles.logoAuth, size === "small" && styles.logoSmall]} resizeMode="contain" />
      )}
      {/* {showTitle && <Text style={styles.title}>{title}</Text>} */}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: "row",
    justifyContent: "center",
    paddingVertical: 10,
    gap: 10,
  },
  wrapSmall: {
    justifyContent: "flex-start",
    paddingVertical: 0,
  },
  logoWide: {
    width: 108,
    height: 45,
  },
  logoSmall: {
    width: 88,
    height: 34,
  },
  logoAuth: {
    width: 180,
    height: 96,
  },
  title: {
    color: colors.primary,
    fontSize: 18,
    fontWeight: "800",
    letterSpacing: 0.2,
  },
});
