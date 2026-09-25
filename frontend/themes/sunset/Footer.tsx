/**
 * sunset/Footer.tsx
 *
 * Peacock/Sunset warm footer — gradient top accent, warm tones.
 * Features: App download badges row + links + copyright.
 */
"use client";

const links = [
    { heading: "Watch", items: ["Home", "Shows", "Movies", "Sports", "News", "Kids"] },
    { heading: "Account", items: ["Sign In", "My Profile", "Subscription", "Settings"] },
    { heading: "More", items: ["Help Center", "Privacy", "Terms", "About Us"] },
];

export default function Footer() {
    return (
        <footer className="mt-8 border-t-4 border-primary/60">
            <div className="px-6 lg:px-14 pt-10 pb-8 bg-gradient-to-b from-secondary/20 to-background">

                {/* Brand + tagline */}
                <div className="mb-8">
                    <p className="text-xl font-black tracking-tight text-gradient-gold mb-1.5">SignalView</p>
                    <p className="text-[12px] text-muted-foreground">Stream what you love, when you want it.</p>
                </div>

                {/* Links grid */}
                <div className="grid grid-cols-2 md:grid-cols-3 gap-6 mb-8">
                    {links.map((col) => (
                        <div key={col.heading}>
                            <p className="text-[10px] font-black text-primary uppercase tracking-[0.2em] mb-3">{col.heading}</p>
                            <div className="space-y-2">
                                {col.items.map((l) => (
                                    <a key={l} href="#" className="block text-[12px] text-muted-foreground hover:text-foreground transition-colors">{l}</a>
                                ))}
                            </div>
                        </div>
                    ))}
                </div>

                {/* App store badges */}
                <div className="flex flex-wrap gap-3 mb-7">
                    {["App Store", "Google Play", "Smart TV"].map((b) => (
                        <div key={b} className="flex items-center gap-2 px-4 py-2 rounded-lg border border-border/60 bg-secondary/50 hover:bg-secondary transition-colors cursor-pointer">
                            <span className="text-[11px] font-semibold text-muted-foreground">↓ {b}</span>
                        </div>
                    ))}
                </div>

                <p className="text-[11px] text-muted-foreground/40">© {new Date().getFullYear()} SignalView. All rights reserved.</p>
            </div>
        </footer>
    );
}
