/**
 * cinema-red/Footer.tsx
 *
 * Minimalist centered footer — matches the centered Navbar aesthetic.
 * No multi-column grid, no app store badges.
 * Centered logo → thin horizontal rule → single row of links → copyright.
 * Very sparse; lots of whitespace — editorial feel.
 */
export default function Footer() {
    const links = [
        { label: "About", href: "#" },
        { label: "The Notebook", href: "#" },
        { label: "Film Index", href: "#" },
        { label: "Gift Membership", href: "#" },
        { label: "Help Center", href: "#" },
        { label: "Privacy", href: "#" },
        { label: "Terms", href: "#" },
    ];

    return (
        <footer className="mt-12 pb-10 px-6 text-center">
            <hr className="border-border/20 mb-8" />

            {/* Logo */}
            <div className="mb-6">
                <span className="text-sm font-black tracking-[0.35em] uppercase text-foreground/90">
                    Stream<span className="text-primary">Vault</span>
                </span>
            </div>

            {/* Links row */}
            <nav className="flex flex-wrap justify-center gap-x-5 gap-y-2 mb-6">
                {links.map((l) => (
                    <a
                        key={l.label}
                        href={l.href}
                        className="text-[11px] uppercase tracking-[0.1em] text-muted-foreground/40 hover:text-muted-foreground transition-colors"
                    >
                        {l.label}
                    </a>
                ))}
            </nav>

            {/* Copyright */}
            <p className="text-[10px] text-muted-foreground/25 tracking-wider">
                © {new Date().getFullYear()} SignalView. Films for those who care about film.
            </p>
        </footer>
    );
}
