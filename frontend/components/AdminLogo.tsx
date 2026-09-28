"use client";

import Link from "next/link";
import { useTheme } from "@/hooks/use-theme";

interface AdminLogoProps {
    href?: string;
    className?: string;
    showText?: boolean;
    logoSize?: string;
    style?: React.CSSProperties;
}

export default function AdminLogo({
    href = "/",
    className = "flex items-center gap-2",
    showText = false,
    logoSize = "45px",
    style
}: AdminLogoProps) {
    const { activeThemeId } = useTheme();
    const isLight = activeThemeId === "gold-light";
    const logoSrc = isLight ? "/logo_light.png" : "/logo.png";

    const content = (
        <>
            <img
                src={logoSrc}
                alt="StreamTVDepot"
                className="w-auto"
                style={{ height: logoSize, width: "auto" }}
            />
            {showText && (
                <span className="text-gradient-gold font-display tracking-tight" style={style}>
                    <span className="font-black">STREAMTV</span><span className="font-light">DEPOT</span>
                </span>
            )}
        </>
    );

    if (href) {
        return (
            <Link href={href} className={className}>
                {content}
            </Link>
        );
    }

    return <div className={className}>{content}</div>;
}
