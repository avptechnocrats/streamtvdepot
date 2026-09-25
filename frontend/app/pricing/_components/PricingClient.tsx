"use client";

import Link from "next/link";
import { useState } from "react";
import type { PublicPlanOut } from "../page";
import {
    CheckCircle2,
    X,
    ArrowRight,
    ChevronDown,
    ChevronRight,
    Phone,
    Zap,
    Shield,
    Users,
    HardDrive,
    MonitorPlay,
    Smartphone,
    BarChart3,
    Star,
} from "lucide-react";

// ── Constants ──────────────────────────────────────────────────────────────────
const GOLD = "hsl(215 100% 50%)";
const DIM = "hsl(220 10% 55%)";  // unchanged - works well with blue

// ── Data ───────────────────────────────────────────────────────────────────────


const comparisonRows: { label: string; values: (string | boolean | null)[] }[] = [
    { label: "Streaming platforms", values: ["1", "3", "10"] },
    { label: "Subscribers", values: ["5,000", "25,000", "Unlimited"] },
    { label: "Storage", values: ["100 GB", "500 GB", "2 TB"] },
    { label: "Admin users", values: ["3", "10", "Unlimited"] },
    { label: "Web app", values: [true, true, true] },
    { label: "Android & iOS apps", values: [false, true, true] },
    { label: "Smart TV & connected TV apps", values: [false, false, true] },
    { label: "SVOD monetization", values: [true, true, true] },
    { label: "TVOD / PPV", values: [true, true, true] },
    { label: "Live streaming", values: [false, true, true] },
    { label: "Linear TV & FAST channels", values: [false, false, true] },
    { label: "Multi-DRM protection", values: [false, true, true] },
    { label: "Watermarking", values: [false, false, true] },
    { label: "Geo-blocking", values: [false, true, true] },
    { label: "Analytics dashboard", values: ["Basic", "Advanced", "Advanced + Export"] },
    { label: "API access", values: [false, false, true] },
    { label: "Custom domain", values: [true, true, true] },
    { label: "Uptime SLA", values: ["99%", "99.5%", "99.9%"] },
    { label: "Support", values: ["Email", "Email & Chat", "Dedicated manager"] },
];

const faqs = [
    {
        q: "Is there a free trial?",
        a: "Yes — every plan includes a 14-day free trial with no credit card required. You'll have full access to all features included in your chosen plan.",
    },
    {
        q: "Can I switch plans later?",
        a: "Absolutely. You can upgrade or downgrade at any time. Upgrades take effect immediately; downgrades apply at the end of your current billing period.",
    },
    {
        q: "What does 'streaming platform' mean?",
        a: "Each streaming platform is a separate, fully branded OTT service with its own domain, theme, subscriber base and content library. The Starter plan includes one; Scale includes ten.",
    },
    {
        q: "Are the native apps really included?",
        a: "Yes. Android, iOS, Apple TV, Android TV, Samsung TV, LG TV, Fire TV, Roku, Chromecast and more are pre-built and submitted to stores on your behalf. No per-platform fee.",
    },
    {
        q: "What payment methods do you accept?",
        a: "We accept all major credit/debit cards (Visa, Mastercard, Amex), as well as wire transfer for annual enterprise plans. Invoicing is available on request.",
    },
    {
        q: "Do you offer custom enterprise pricing?",
        a: "Yes. For large-scale deployments, white-label reseller programmes, or custom SLA requirements, contact our sales team for a tailored quote.",
    },
];

const footerLinks = [
    {
        heading: "Products",
        links: ["Streaming Platform", "Live Streaming", "Media Management", "Linear TV & FAST", "eLearning", "Short Videos"],
    },
    {
        heading: "Features",
        links: ["Themed Storefronts", "DRM & Security", "Analytics", "Monetization", "Multi-Tenant", "API & SDKs"],
    },
    {
        heading: "Resources",
        links: ["Documentation", "Blogs", "Case Studies", "Changelog", "Community", "Status Page"],
    },
    {
        heading: "Company",
        links: ["About Us", "Careers", "Partners", "Contact", "Legal Policies", "Privacy"],
    },
];

// ── Sub-components ─────────────────────────────────────────────────────────────
function CellValue({ value }: { value: string | boolean | null }) {
    if (value === true) return <CheckCircle2 size={16} style={{ color: GOLD }} className="mx-auto" />;
    if (value === false || value === null) return <X size={16} className="mx-auto text-white/20" />;
    return <span className="text-sm text-white/80">{value}</span>;
}

function FaqItem({ q, a }: { q: string; a: string }) {
    const [open, setOpen] = useState(false);
    return (
        <div className="border border-white/5 rounded-2xl overflow-hidden bg-[#111520]">
            <button
                onClick={() => setOpen((o) => !o)}
                className="w-full flex items-center justify-between gap-4 px-6 py-5 text-left hover:bg-white/[0.02] transition-colors"
            >
                <span className="font-semibold text-white/90 text-sm">{q}</span>
                {open
                    ? <ChevronDown size={17} style={{ color: GOLD }} className="shrink-0" />
                    : <ChevronRight size={17} className="text-white/30 shrink-0" />}
            </button>
            {open && (
                <div className="px-6 pb-5 text-sm leading-relaxed" style={{ color: DIM }}>
                    {a}
                </div>
            )}
        </div>
    );
}

// ── Main component ─────────────────────────────────────────────────────────────
export default function PricingClient({ plans }: { plans: PublicPlanOut[] }) {
    const [billing, setBilling] = useState<"monthly" | "yearly">("monthly");
    // Highlight the middle plan (index 1) when there are exactly 3, otherwise none
    const highlightIndex = plans.length === 3 ? 1 : -1;

    return (
        <div className="min-h-screen bg-[#0b0e17] text-[hsl(40_10%_92%)] font-sans antialiased">

            {/* ══ NAV ══════════════════════════════════════════════════ */}
            <header className="fixed top-0 inset-x-0 z-50 border-b border-white/5 bg-[#0b0e17cc] backdrop-blur-md">
                <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
                    <Link href="/" className="flex items-center hover:opacity-80 transition-opacity">
                        <img src="/logo-new.png" alt="StreamTVDepot" className="h-8 w-auto" />
                    </Link>
                    <nav className="hidden md:flex items-center gap-7 text-sm" style={{ color: DIM }}>
                        <Link href="/#solutions" className="hover:text-white transition-colors">Solutions</Link>
                        <Link href="/#platforms" className="hover:text-white transition-colors">Platforms</Link>
                        <Link href="/#security" className="hover:text-white transition-colors">Security</Link>
                        <Link href="/#themes" className="hover:text-white transition-colors">Themes</Link>
                        <Link href="/pricing" className="text-white font-semibold">Pricing</Link>
                    </nav>
                    <div className="flex items-center gap-3">
                        <Link href="/admin" className="hidden sm:inline-flex px-4 py-2 text-sm rounded-lg border border-white/10 hover:border-white/25 hover:text-white transition-colors" style={{ color: DIM }}>
                            Sign In
                        </Link>
                        <a href="mailto:sales@streamtvdepot.com" className="px-4 py-2 text-sm rounded-lg font-semibold hover:brightness-110 transition-all" style={{ backgroundColor: GOLD, color: "#0b0e17" }}>
                            Free Trial
                        </a>
                    </div>
                </div>
            </header>

            {/* ══ HERO ═════════════════════════════════════════════════ */}
            <section className="relative pt-40 pb-20 px-6 text-center overflow-hidden">
                <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                    <div className="w-[600px] h-[300px] rounded-full opacity-10 blur-3xl" style={{ background: `radial-gradient(ellipse, ${GOLD}, transparent 70%)` }} />
                </div>
                <div className="relative max-w-3xl mx-auto space-y-5">
                    <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold border" style={{ borderColor: `${GOLD}44`, backgroundColor: `${GOLD}11`, color: GOLD }}>
                        <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ backgroundColor: GOLD }} />
                        Simple, transparent pricing
                    </span>
                    <h1 className="text-5xl md:text-6xl font-extrabold leading-[1.08] tracking-tight">
                        Pricing built for{" "}
                        <span style={{ color: GOLD }}>every stage</span>
                    </h1>
                    <p className="text-lg leading-relaxed max-w-xl mx-auto" style={{ color: DIM }}>
                        Start free, no credit card required. Upgrade only when you need more — every plan
                        includes all apps, DRM, and unlimited content uploads.
                    </p>

                    {/* Billing toggle */}
                    <div className="inline-flex items-center gap-1 p-1 rounded-xl border border-white/10 bg-[#0d111c]">
                        <button
                            onClick={() => setBilling("monthly")}
                            className="px-5 py-2 rounded-lg text-sm font-semibold transition-all"
                            style={billing === "monthly"
                                ? { backgroundColor: GOLD, color: "#0b0e17" }
                                : { color: DIM }}
                        >
                            Monthly
                        </button>
                        <button
                            onClick={() => setBilling("yearly")}
                            className="relative px-5 py-2 rounded-lg text-sm font-semibold transition-all"
                            style={billing === "yearly"
                                ? { backgroundColor: GOLD, color: "#0b0e17" }
                                : { color: DIM }}
                        >
                            Yearly
                            <span
                                className="absolute -top-2.5 -right-2 text-[9px] font-bold px-1.5 py-0.5 rounded-full"
                                style={{ backgroundColor: "#10b981", color: "#fff" }}
                            >
                                −20%
                            </span>
                        </button>
                    </div>
                </div>
            </section>

            {/* ══ PRICING CARDS ════════════════════════════════════════ */}
            <section className="px-6 pb-28">
                <div className="max-w-6xl mx-auto grid md:grid-cols-3 gap-6 items-start">
                    {plans.map((plan, idx) => {
                        const isHighlight = idx === highlightIndex;
                        const price = billing === "monthly"
                            ? plan.price_monthly
                            : (plan.price_yearly ?? plan.price_monthly);
                        const features = plan.key_features ?? [];
                        return (
                            <div
                                key={plan.id}
                                className="relative rounded-2xl border flex flex-col"
                                style={{
                                    borderColor: isHighlight ? GOLD + "60" : "rgba(255,255,255,0.06)",
                                    backgroundColor: isHighlight ? "#131825" : "#111520",
                                    boxShadow: isHighlight ? `0 0 40px ${GOLD}18` : "none",
                                }}
                            >
                                {isHighlight && (
                                    <div className="absolute -top-3.5 inset-x-0 flex justify-center">
                                        <span
                                            className="px-3 py-1 rounded-full text-xs font-bold tracking-wide"
                                            style={{ backgroundColor: GOLD, color: "#0b0e17" }}
                                        >
                                            Most Popular
                                        </span>
                                    </div>
                                )}

                                <div className="p-7 flex flex-col gap-6 flex-1">
                                    {/* Header */}
                                    <div>
                                        <h2 className="text-xl font-extrabold text-white">{plan.name}</h2>
                                        {plan.sub_text && (
                                            <p className="text-sm mt-1" style={{ color: DIM }}>{plan.sub_text}</p>
                                        )}
                                    </div>

                                    {/* Price */}
                                    <div>
                                        <div className="flex items-end gap-1">
                                            <span className="text-4xl font-extrabold text-white">
                                                {plan.currency} {price.toFixed(0)}
                                            </span>
                                            <span className="text-sm mb-1.5" style={{ color: DIM }}>/mo</span>
                                        </div>
                                        {billing === "yearly" && plan.price_yearly && (
                                            <p className="text-xs mt-1" style={{ color: DIM }}>
                                                Billed annually ({plan.currency} {(plan.price_yearly * 12).toFixed(0)}/yr)
                                            </p>
                                        )}
                                    </div>

                                    {/* CTA */}
                                    <a
                                        href="mailto:sales@streamtvdepot.com"
                                        className="flex items-center justify-center gap-2 w-full py-3 rounded-xl font-semibold text-sm transition-all hover:brightness-110"
                                        style={isHighlight
                                            ? { backgroundColor: GOLD, color: "#0b0e17" }
                                            : { border: `1px solid ${GOLD}40`, color: GOLD }}
                                    >
                                        Start Free Trial <ArrowRight size={15} />
                                    </a>

                                    {/* Divider */}
                                    <hr style={{ borderColor: "rgba(255,255,255,0.05)" }} />

                                    {/* Key features from API */}
                                    {features.length > 0 && (
                                        <div className="space-y-3">
                                            {features.map((f) => (
                                                <div key={f} className="flex items-start gap-2.5 text-sm text-white/80">
                                                    <CheckCircle2 size={15} className="shrink-0 mt-0.5" style={{ color: GOLD }} />
                                                    {f}
                                                </div>
                                            ))}
                                        </div>
                                    )}

                                    {/* Limits */}
                                    {(plan.max_users || plan.max_storage_gb || plan.max_streams) && (
                                        <div className="space-y-2 pt-1 border-t border-white/5">
                                            {plan.max_users && (
                                                <div className="flex items-center gap-2 text-xs" style={{ color: DIM }}>
                                                    <Users size={12} style={{ color: GOLD }} />
                                                    Up to {plan.max_users.toLocaleString()} subscribers
                                                </div>
                                            )}
                                            {plan.max_storage_gb && (
                                                <div className="flex items-center gap-2 text-xs" style={{ color: DIM }}>
                                                    <HardDrive size={12} style={{ color: GOLD }} />
                                                    {plan.max_storage_gb} GB storage
                                                </div>
                                            )}
                                            {plan.max_streams && (
                                                <div className="flex items-center gap-2 text-xs" style={{ color: DIM }}>
                                                    <MonitorPlay size={12} style={{ color: GOLD }} />
                                                    Up to {plan.max_streams} concurrent streams
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>

                {/* Enterprise CTA */}
                <div className="max-w-6xl mx-auto mt-6">
                    <div className="rounded-2xl border border-white/5 bg-[#0d111c] px-8 py-7 flex flex-col md:flex-row items-center justify-between gap-5">
                        <div>
                            <h3 className="text-xl font-bold text-white">Enterprise</h3>
                            <p className="text-sm mt-1" style={{ color: DIM }}>
                                Custom platforms, SLAs, reseller programmes, and white-label licensing. Let&apos;s talk.
                            </p>
                        </div>
                        <a
                            href="mailto:sales@streamtvdepot.com"
                            className="shrink-0 flex items-center gap-2 px-6 py-3 rounded-xl font-semibold text-sm hover:brightness-110 transition-all"
                            style={{ backgroundColor: GOLD, color: "#0b0e17" }}
                        >
                            Contact Sales <ArrowRight size={15} />
                        </a>
                    </div>
                </div>
            </section>

            {/* ══ WHAT'S INCLUDED ══════════════════════════════════════ */}
            <section className="py-20 px-6 border-t border-white/5 bg-[#0d111c]">
                <div className="max-w-5xl mx-auto text-center mb-12 space-y-3">
                    <p className="text-xs uppercase tracking-widest font-semibold" style={{ color: GOLD }}>Every Plan</p>
                    <h2 className="text-3xl md:text-4xl font-extrabold">What&apos;s always included</h2>
                    <p className="text-base" style={{ color: DIM }}>
                        No hidden fees. Every StreamTVDepot plan ships with the fundamentals.
                    </p>
                </div>
                <div className="max-w-5xl mx-auto grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
                    {[
                        { icon: MonitorPlay, label: "Unlimited content uploads", desc: "No caps on videos, audio or live events" },
                        { icon: Shield, label: "SSL & HTTPS", desc: "End-to-end encryption on every platform" },
                        { icon: Smartphone, label: "Custom domain", desc: "Your brand, your URL" },
                        { icon: Zap, label: "99%+ uptime", desc: "Global CDN with automatic failover" },
                        { icon: Users, label: "Subscriber management", desc: "Sign-up, login, profiles & access control" },
                        { icon: HardDrive, label: "Automated backups", desc: "Daily snapshots, 30-day retention" },
                        { icon: BarChart3, label: "Basic analytics", desc: "Views, sessions, devices & geography" },
                        { icon: Star, label: "14-day free trial", desc: "No credit card required to start" },
                    ].map(({ icon: Icon, label, desc }) => (
                        <div key={label} className="p-5 rounded-2xl border border-white/5 bg-[#111520]">
                            <div className="w-10 h-10 rounded-xl flex items-center justify-center mb-4" style={{ backgroundColor: `${GOLD}15` }}>
                                <Icon size={19} style={{ color: GOLD }} />
                            </div>
                            <p className="font-semibold text-sm text-white">{label}</p>
                            <p className="text-xs mt-1 leading-relaxed" style={{ color: DIM }}>{desc}</p>
                        </div>
                    ))}
                </div>
            </section>

            {/* ══ COMPARISON TABLE ═════════════════════════════════════ */}
            <section className="py-28 px-6 border-t border-white/5">
                <div className="max-w-5xl mx-auto">
                    <div className="text-center mb-12 space-y-3">
                        <p className="text-xs uppercase tracking-widest font-semibold" style={{ color: GOLD }}>Compare Plans</p>
                        <h2 className="text-3xl md:text-4xl font-extrabold">Full feature comparison</h2>
                    </div>
                    <div className="overflow-x-auto rounded-2xl border border-white/5">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="border-b border-white/5">
                                    <th className="text-left px-6 py-4 font-semibold text-white/50 w-1/2">Feature</th>
                                    {plans.map((p, idx) => (
                                        <th key={p.id} className="px-4 py-4 text-center font-bold" style={{ color: idx === highlightIndex ? GOLD : "white" }}>
                                            {p.name}
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {comparisonRows.map((row, i) => (
                                    <tr key={row.label} className={`border-b border-white/[0.04] ${i % 2 === 0 ? "bg-white/[0.01]" : ""}`}>
                                        <td className="px-6 py-3.5 text-white/70">{row.label}</td>
                                        {row.values.map((v, vi) => (
                                            <td key={vi} className="px-4 py-3.5 text-center">
                                                <CellValue value={v} />
                                            </td>
                                        ))}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            </section>

            {/* ══ FAQ ══════════════════════════════════════════════════ */}
            <section className="py-28 px-6 border-t border-white/5 bg-[#0d111c]">
                <div className="max-w-3xl mx-auto">
                    <div className="text-center mb-12 space-y-3">
                        <p className="text-xs uppercase tracking-widest font-semibold" style={{ color: GOLD }}>FAQ</p>
                        <h2 className="text-3xl md:text-4xl font-extrabold">Common questions</h2>
                    </div>
                    <div className="space-y-3">
                        {faqs.map((item) => (
                            <FaqItem key={item.q} q={item.q} a={item.a} />
                        ))}
                    </div>
                </div>
            </section>

            {/* ══ CTA ══════════════════════════════════════════════════ */}
            <section className="py-28 px-6 border-t border-white/5">
                <div className="max-w-3xl mx-auto text-center space-y-7">
                    <p className="text-xs uppercase tracking-widest font-semibold" style={{ color: GOLD }}>Get Started Today</p>
                    <h2 className="text-4xl md:text-5xl font-extrabold leading-tight">
                        Start streaming in{" "}
                        <span style={{ color: GOLD }}>under 48 hours.</span>
                    </h2>
                    <p className="text-lg leading-relaxed" style={{ color: DIM }}>
                        No infrastructure knowledge needed. Talk to our team and we&apos;ll have your
                        platform live and ready for subscribers.
                    </p>
                    <ul className="flex flex-col sm:flex-row items-center justify-center gap-5 text-sm" style={{ color: DIM }}>
                        {["No credit card required", "Custom domain included", "Cancel any time"].map((item) => (
                            <li key={item} className="flex items-center gap-2">
                                <CheckCircle2 size={14} style={{ color: GOLD }} />
                                {item}
                            </li>
                        ))}
                    </ul>
                    <div className="flex flex-col sm:flex-row gap-4 justify-center pt-2">
                        <a
                            href="mailto:sales@streamtvdepot.com"
                            className="flex items-center justify-center gap-2 px-8 py-4 rounded-xl font-bold text-base hover:brightness-110 transition-all"
                            style={{ backgroundColor: GOLD, color: "#0b0e17" }}
                        >
                            Talk to Sales <ArrowRight size={17} />
                        </a>

                    </div>
                </div>
            </section>

            {/* ══ FOOTER ═══════════════════════════════════════════════ */}
            <footer className="border-t border-white/5 py-16 px-6">
                <div className="max-w-7xl mx-auto">
                    <div className="grid sm:grid-cols-2 lg:grid-cols-5 gap-10 mb-14">
                        <div className="lg:col-span-1 space-y-4">
                            <span className="text-base font-extrabold tracking-widest" style={{ color: GOLD }}>STREAMTVDEPOT</span>
                            <p className="text-sm leading-relaxed" style={{ color: DIM }}>
                                Leading the streaming revolution. Build, launch and grow your own OTT service.
                            </p>
                            <div className="flex items-center gap-2 text-xs" style={{ color: DIM }}>
                                <Phone size={12} /> +1-800-SIGNAL-1
                            </div>
                        </div>
                        {footerLinks.map(({ heading, links }) => (
                            <div key={heading} className="space-y-3">
                                <p className="text-xs font-bold uppercase tracking-widest text-white/60">{heading}</p>
                                <ul className="space-y-2">
                                    {links.map((l) => (
                                        <li key={l}>
                                            <a href="#" className="text-sm hover:text-white transition-colors" style={{ color: DIM }}>{l}</a>
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        ))}
                    </div>
                    <div className="border-t border-white/5 pt-8 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs" style={{ color: "hsl(220 10% 35%)" }}>
                        <span>© {new Date().getFullYear()} StreamTVDepot. All rights reserved.</span>
                        <div className="flex gap-5">
                            <a href="#" className="hover:text-white transition-colors">Privacy Policy</a>
                            <a href="#" className="hover:text-white transition-colors">Terms of Service</a>
                            <a href="#" className="hover:text-white transition-colors">Cookie Policy</a>
                        </div>
                    </div>
                </div>
            </footer>
        </div>
    );
}
