import { useState } from "react";
import { Image, StyleProp, StyleSheet, Text, View, ViewStyle } from "react-native";
import { useSiteBranding } from "@/hooks/useSiteBranding";
import { clientConfig } from "@/config/clientConfig";
import { colors } from "@/theme/colors";

interface BrandLogoProps {
  showTitle?: boolean;
  size?: "default" | "auth" | "small";
  containerStyle?: StyleProp<ViewStyle>;
}

function sanitizeImageUrl(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (!trimmed || trimmed.toLowerCase() === "null" || trimmed.toLowerCase() === "undefined") return undefined;
  return trimmed;
}

function LogoArtwork({ logoUri, size }: { logoUri?: string; size: "default" | "auth" | "small" }) {
  const [loadedLogoUri, setLoadedLogoUri] = useState<string | undefined>();
  const [failedLogoUri, setFailedLogoUri] = useState<string | undefined>();
  const remoteLoaded = Boolean(logoUri && loadedLogoUri === logoUri);

  return (
    <View style={[styles.logoWide, size === "auth" && styles.logoAuth, size === "small" && styles.logoSmall]}>
      <Image
        source={require("../../../assets/logo.png")}
        style={[styles.logoImage, remoteLoaded && styles.hiddenLogo]}
        resizeMode="contain"
        fadeDuration={0}
      />
      {logoUri && failedLogoUri !== logoUri ? (
        <Image
          key={logoUri}
          source={{ uri: logoUri }}
          style={[styles.logoImage, !remoteLoaded && styles.hiddenLogo]}
          resizeMode="contain"
          fadeDuration={0}
          onLoad={() => setLoadedLogoUri(logoUri)}
          onError={() => {
            setLoadedLogoUri((current) => current === logoUri ? undefined : current);
            setFailedLogoUri(logoUri);
          }}
        />
      ) : null}
    </View>
  );
}

export function BrandLogo({ showTitle = true, size = "default", containerStyle }: BrandLogoProps) {
  const { data } = useSiteBranding();

  // API logo overrides the locally bundled one when available (server-driven white-label support).
  // The bundled logo is set per-client at build time via scripts/switch-client.sh.
  const logoUri = sanitizeImageUrl(data?.logo_url);

  // Title: API site title → clientConfig.appName (injected from .env at build) → hardcoded fallback
  const title = data?.site_title || clientConfig.appName;

  return (
    <View style={[styles.wrap, size === "small" && styles.wrapSmall, containerStyle]}>
      <LogoArtwork logoUri={logoUri} size={size} />
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
  logoImage: {
    ...StyleSheet.absoluteFillObject,
    width: "100%",
    height: "100%",
  },
  hiddenLogo: {
    opacity: 0,
  },
  title: {
    color: colors.primary,
    fontSize: 18,
    fontWeight: "800",
    letterSpacing: 0.2,
  },
});
