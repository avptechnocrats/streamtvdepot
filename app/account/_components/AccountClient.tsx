"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import {
    User,
    Mail,
    Phone,
    Globe,
    Shield,
    CheckCircle2,
    Pencil,
    X,
    Loader2,
    Save,
    MapPin,
} from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";
import {
    getMyProfile,
    uploadMyAvatar,
    updateMyProfile,
    type UserProfile,
    type UpdateProfilePayload,
} from "@/lib/services/user-auth";

function getInitials(name: string): string {
    return name
        .split(" ")
        .filter(Boolean)
        .slice(0, 2)
        .map((w) => w[0].toUpperCase())
        .join("");
}

export default function AccountClient() {
    const { user, accessToken, isLoading: authLoading } = useAuth();
    const router = useRouter();
    const { toast } = useToast();

    const [profile, setProfile] = useState<UserProfile | null>(null);
    const [profileLoading, setProfileLoading] = useState(true);
    const [editing, setEditing] = useState(false);
    const [saving, setSaving] = useState(false);
    const [saveError, setSaveError] = useState<string | null>(null);
    const [form, setForm] = useState<UpdateProfilePayload>({});
    const [imagePreview, setImagePreview] = useState<string | null>(null);
    const [imageChanged, setImageChanged] = useState(false);
    const [avatarFile, setAvatarFile] = useState<File | null>(null);
    const [isAvatarPopupOpen, setIsAvatarPopupOpen] = useState(false);
    const [avatarImageLoaded, setAvatarImageLoaded] = useState(false);
    const [avatarPopupImageLoaded, setAvatarPopupImageLoaded] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const objectPreviewRef = useRef<string | null>(null);

    useEffect(() => {
        if (authLoading) return;
        if (!user || !accessToken) {
            router.replace("/login");
            return;
        }
        getMyProfile(accessToken)
            .then(setProfile)
            .catch(() => setProfile(null))
            .finally(() => setProfileLoading(false));
    }, [authLoading, user, accessToken, router]);

    function startEdit() {
        if (!profile) return;
        setForm({
            full_name: profile.full_name,
            phone: profile.phone ?? "",
            country: profile.country ?? "",
            billing_line1: profile.billing_line1 ?? "",
            billing_line2: profile.billing_line2 ?? "",
            billing_city: profile.billing_city ?? "",
            billing_state: profile.billing_state ?? "",
            billing_postal_code: profile.billing_postal_code ?? "",
            billing_country: profile.billing_country ?? "",
        });
        setImagePreview(profile.avatar_url);
        setImageChanged(false);
        setAvatarFile(null);
        setSaveError(null);
        setAvatarImageLoaded(false);
        setEditing(true);
    }

    function handleImageSelect(e: React.ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0];
        if (!file) return;

        setSaveError(null);

        // Validate file type
        if (!file.type.startsWith("image/")) {
            setSaveError("Please select a valid image file (JPG, PNG, GIF, WebP)");
            return;
        }

        // Validate file size (max 5MB)
        if (file.size > 5 * 1024 * 1024) {
            setSaveError("Image must be less than 5MB");
            return;
        }

        if (objectPreviewRef.current) {
            URL.revokeObjectURL(objectPreviewRef.current);
            objectPreviewRef.current = null;
        }

        const localPreview = URL.createObjectURL(file);
        objectPreviewRef.current = localPreview;
        setImagePreview(localPreview);
        setAvatarFile(file);
        setImageChanged(true);
        setSaveError(null);
    }

    useEffect(() => {
        return () => {
            if (objectPreviewRef.current) {
                URL.revokeObjectURL(objectPreviewRef.current);
                objectPreviewRef.current = null;
            }
        };
    }, []);

    useEffect(() => {
        if (!isAvatarPopupOpen) return;

        function onKeyDown(event: KeyboardEvent) {
            if (event.key === "Escape") {
                setIsAvatarPopupOpen(false);
            }
        }

        window.addEventListener("keydown", onKeyDown);
        return () => window.removeEventListener("keydown", onKeyDown);
    }, [isAvatarPopupOpen]);

    async function handleSave(e: React.FormEvent) {
        e.preventDefault();
        if (!accessToken) {
            setSaveError("No access token available");
            return;
        }

        setSaving(true);
        setSaveError(null);

        try {
            const updatePayload: UpdateProfilePayload = {
                full_name: form.full_name?.trim() || undefined,
                phone: form.phone?.trim() || undefined,
                country: form.country?.trim() || undefined,
                billing_line1: form.billing_line1?.trim() || null,
                billing_line2: form.billing_line2?.trim() || null,
                billing_city: form.billing_city?.trim() || null,
                billing_state: form.billing_state?.trim() || null,
                billing_postal_code: form.billing_postal_code?.trim() || null,
                billing_country: form.billing_country?.trim() || undefined,
            };

            if (imageChanged && avatarFile) {
                const uploaded = await uploadMyAvatar(avatarFile, accessToken);
                updatePayload.avatar_asset_id = uploaded.avatar_asset_id;
            }

            // Call API
            const updated = await updateMyProfile(updatePayload, accessToken);

            // Update local state with server response
            if (objectPreviewRef.current) {
                URL.revokeObjectURL(objectPreviewRef.current);
                objectPreviewRef.current = null;
            }
            setProfile(updated);
            setImagePreview(updated.avatar_url);
            setImageChanged(false);
            setAvatarFile(null);
            setEditing(false);

            // Show success toast
            toast({
                description: "Profile updated successfully.",
                variant: "default",
                duration: 3000,
            });

            // Trigger parent layout to refetch profile for sidebar update
            if (typeof window !== "undefined" && window.__profileRefetch) {
                window.__profileRefetch();
            }
        } catch (err) {
            const errorMsg = err instanceof Error ? err.message : "Failed to update profile. Please try again.";
            setSaveError(errorMsg);
            console.error("Profile update error:", err);
            
            // Show error toast
            toast({
                description: errorMsg,
                variant: "destructive",
                duration: 4000,
            });
        } finally {
            setSaving(false);
        }
    }

    if (authLoading || profileLoading) {
        return (
            <div className="space-y-4">
                <Skeleton className="h-8 w-48 rounded mb-6" />
                <div className="flex items-center gap-5 mb-6">
                    <Skeleton className="h-20 w-20 rounded-full shrink-0" />
                    <div className="space-y-2">
                        <Skeleton className="h-6 w-40 rounded" />
                        <Skeleton className="h-4 w-56 rounded" />
                    </div>
                </div>
                <div className="space-y-3">
                    {Array.from({ length: 4 }).map((_, i) => (
                        <Skeleton key={i} className="h-14 w-full rounded-xl" />
                    ))}
                </div>
            </div>
        );
    }

    if (!profile) return null;

    const initials = getInitials(profile.full_name || profile.email);

    return (
        <div>
            <div className="flex items-center justify-between mb-6">
                <h1 className="text-2xl font-black text-foreground tracking-tight">My Profile</h1>
                {!editing && (
                    <button
                        onClick={startEdit}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg border border-border bg-secondary hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors"
                    >
                        <Pencil size={13} />
                        Edit
                    </button>
                )}
            </div>

            {/* Avatar card */}
            <div className="rounded-2xl border border-border/60 bg-card p-6 mb-4 flex items-center gap-5">
                {editing ? (
                    <div className="flex flex-col items-center gap-1.5">
                        <input
                            ref={fileInputRef}
                            type="file"
                            accept="image/*"
                            onChange={handleImageSelect}
                            className="hidden"
                        />
                        <button
                            type="button"
                            onClick={() => fileInputRef.current?.click()}
                            className="w-16 h-16 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xl font-black uppercase shadow-md shrink-0 hover:opacity-80 transition-opacity overflow-hidden"
                        >
                            {imagePreview ? (
                                <img src={imagePreview} alt="Avatar preview" className="w-full h-full object-cover" />
                            ) : (
                                initials
                            )}
                        </button>
                        <button
                            type="button"
                            onClick={() => fileInputRef.current?.click()}
                            className="text-[10px] font-semibold tracking-wide text-muted-foreground hover:text-foreground transition-colors"
                        >
                            CHANGE
                        </button>
                    </div>
                ) : (
                    <button
                        type="button"
                        onClick={() => {
                            if (profile?.avatar_url) {
                                setIsAvatarPopupOpen(true);
                            }
                        }}
                        className="w-16 h-16 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xl font-black uppercase shadow-md shrink-0 overflow-hidden disabled:cursor-default relative"
                        disabled={!profile?.avatar_url}
                        aria-label="View avatar"
                    >
                        {profile?.avatar_url ? (
                            <>
                                {!avatarImageLoaded && (
                                    <Skeleton className="absolute inset-0 rounded-full" />
                                )}
                                <img 
                                    src={profile.avatar_url} 
                                    alt="Avatar" 
                                    className="w-full h-full object-cover" 
                                    onLoad={() => setAvatarImageLoaded(true)}
                                />
                            </>
                        ) : (
                            initials
                        )}
                    </button>
                )}
                <div className="min-w-0">
                    <p className="text-lg font-bold text-foreground truncate">{profile.full_name || "–"}</p>
                    <div className="flex items-center gap-1.5 mt-1 text-sm text-muted-foreground">
                        <Mail size={13} />
                        <span className="truncate">{profile.email}</span>
                    </div>
                    {!editing && profile?.avatar_url && (
                        <button
                            type="button"
                            onClick={() => setIsAvatarPopupOpen(true)}
                            className="mt-1.5 text-xs text-muted-foreground hover:text-foreground underline underline-offset-2 transition-colors"
                        >
                            View avatar
                        </button>
                    )}
                    <div className="flex items-center gap-2 mt-2 flex-wrap">
                        <span className="inline-flex items-center gap-1 text-xs text-primary bg-primary/10 border border-primary/20 rounded-full px-2.5 py-0.5">
                            <Shield size={10} />
                            {profile.is_active ? "Active" : "Inactive"}
                        </span>
                        {profile.is_email_verified && (
                            <span className="inline-flex items-center gap-1 text-xs text-emerald-600 bg-emerald-500/10 border border-emerald-500/20 rounded-full px-2.5 py-0.5">
                                <CheckCircle2 size={10} />
                                Email verified
                            </span>
                        )}
                    </div>
                </div>
            </div>

            {/* Edit form */}
            {editing ? (
                <form onSubmit={handleSave} className="rounded-2xl border border-primary/30 bg-card p-6 space-y-4">
                    <div className="flex items-center justify-between mb-1">
                        <p className="text-sm font-semibold text-foreground">Edit Profile</p>
                        <button
                            type="button"
                            onClick={() => setEditing(false)}
                            className="p-1.5 rounded-lg hover:bg-muted/60 text-muted-foreground transition-colors"
                        >
                            <X size={14} />
                        </button>
                    </div>
                    {saveError && (
                        <p className="text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-lg px-4 py-2">{saveError}</p>
                    )}
                    <div className="pb-3 border-b border-border/50">
                        <p className="text-xs font-medium text-muted-foreground mb-2">Profile Picture</p>
                        <p className="text-xs text-muted-foreground/70">Click on the avatar above to change your profile picture</p>
                    </div>
                    <div className="space-y-1.5">
                        <label className="text-xs font-medium text-muted-foreground">Full Name</label>
                        <input
                            type="text"
                            value={form.full_name ?? ""}
                            onChange={(e) => setForm((f) => ({ ...f, full_name: e.target.value }))}
                            className="w-full h-10 text-sm px-3 rounded-lg border border-border bg-background focus:outline-none focus:ring-1 focus:ring-primary/40"
                        />
                    </div>
                    <div className="space-y-1.5">
                        <label className="text-xs font-medium text-muted-foreground">Phone</label>
                        <input
                            type="tel"
                            value={form.phone ?? ""}
                            onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                            placeholder="e.g. +1 555 123 4567"
                            className="w-full h-10 text-sm px-3 rounded-lg border border-border bg-background focus:outline-none focus:ring-1 focus:ring-primary/40"
                        />
                    </div>
                    <div className="space-y-1.5">
                        <label className="text-xs font-medium text-muted-foreground">Country</label>
                        <select
                            value={form.country ?? ""}
                            onChange={(e) => setForm((f) => ({ ...f, country: e.target.value || undefined }))}
                            className="w-full h-10 text-sm px-3 rounded-lg border border-border bg-background focus:outline-none focus:ring-1 focus:ring-primary/40"
                        >
                            <option value="">— Select country —</option>
                            <option value="AF">Afghanistan</option>
                            <option value="AU">Australia</option>
                            <option value="BD">Bangladesh</option>
                            <option value="BR">Brazil</option>
                            <option value="CA">Canada</option>
                            <option value="CN">China</option>
                            <option value="EG">Egypt</option>
                            <option value="FR">France</option>
                            <option value="DE">Germany</option>
                            <option value="GH">Ghana</option>
                            <option value="IN">India</option>
                            <option value="ID">Indonesia</option>
                            <option value="IE">Ireland</option>
                            <option value="IL">Israel</option>
                            <option value="IT">Italy</option>
                            <option value="JP">Japan</option>
                            <option value="KE">Kenya</option>
                            <option value="MY">Malaysia</option>
                            <option value="MX">Mexico</option>
                            <option value="NL">Netherlands</option>
                            <option value="NZ">New Zealand</option>
                            <option value="NG">Nigeria</option>
                            <option value="PK">Pakistan</option>
                            <option value="PH">Philippines</option>
                            <option value="PL">Poland</option>
                            <option value="PT">Portugal</option>
                            <option value="RU">Russia</option>
                            <option value="SA">Saudi Arabia</option>
                            <option value="SG">Singapore</option>
                            <option value="ZA">South Africa</option>
                            <option value="KR">South Korea</option>
                            <option value="ES">Spain</option>
                            <option value="LK">Sri Lanka</option>
                            <option value="SE">Sweden</option>
                            <option value="CH">Switzerland</option>
                            <option value="TW">Taiwan</option>
                            <option value="TH">Thailand</option>
                            <option value="TR">Turkey</option>
                            <option value="UA">Ukraine</option>
                            <option value="AE">United Arab Emirates</option>
                            <option value="GB">United Kingdom</option>
                            <option value="US">United States</option>
                            <option value="VN">Vietnam</option>
                        </select>
                    </div>

                    {/* Billing Address */}
                    <div className="pt-2 pb-1">
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                            Billing Address
                        </p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                            Used for payment processing and receipts.
                        </p>
                    </div>
                    <div className="space-y-1.5">
                        <label className="text-xs font-medium text-muted-foreground">Address Line 1</label>
                        <input
                            type="text"
                            value={form.billing_line1 ?? ""}
                            onChange={(e) => setForm((f) => ({ ...f, billing_line1: e.target.value }))}
                            placeholder="Street address"
                            className="w-full h-10 text-sm px-3 rounded-lg border border-border bg-background focus:outline-none focus:ring-1 focus:ring-primary/40"
                        />
                    </div>
                    <div className="space-y-1.5">
                        <label className="text-xs font-medium text-muted-foreground">Address Line 2 <span className="text-muted-foreground/50">(optional)</span></label>
                        <input
                            type="text"
                            value={form.billing_line2 ?? ""}
                            onChange={(e) => setForm((f) => ({ ...f, billing_line2: e.target.value }))}
                            placeholder="Apartment, suite, unit, etc."
                            className="w-full h-10 text-sm px-3 rounded-lg border border-border bg-background focus:outline-none focus:ring-1 focus:ring-primary/40"
                        />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                            <label className="text-xs font-medium text-muted-foreground">City</label>
                            <input
                                type="text"
                                value={form.billing_city ?? ""}
                                onChange={(e) => setForm((f) => ({ ...f, billing_city: e.target.value }))}
                                placeholder="City"
                                className="w-full h-10 text-sm px-3 rounded-lg border border-border bg-background focus:outline-none focus:ring-1 focus:ring-primary/40"
                            />
                        </div>
                        <div className="space-y-1.5">
                            <label className="text-xs font-medium text-muted-foreground">State / Province</label>
                            <input
                                type="text"
                                value={form.billing_state ?? ""}
                                onChange={(e) => setForm((f) => ({ ...f, billing_state: e.target.value }))}
                                placeholder="State"
                                className="w-full h-10 text-sm px-3 rounded-lg border border-border bg-background focus:outline-none focus:ring-1 focus:ring-primary/40"
                            />
                        </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                            <label className="text-xs font-medium text-muted-foreground">Postal Code</label>
                            <input
                                type="text"
                                value={form.billing_postal_code ?? ""}
                                onChange={(e) => setForm((f) => ({ ...f, billing_postal_code: e.target.value }))}
                                placeholder="ZIP / Postal code"
                                className="w-full h-10 text-sm px-3 rounded-lg border border-border bg-background focus:outline-none focus:ring-1 focus:ring-primary/40"
                            />
                        </div>
                        <div className="space-y-1.5">
                            <label className="text-xs font-medium text-muted-foreground">Billing Country</label>
                            <select
                                value={form.billing_country ?? ""}
                                onChange={(e) => setForm((f) => ({ ...f, billing_country: e.target.value || undefined }))}
                                className="w-full h-10 text-sm px-3 rounded-lg border border-border bg-background focus:outline-none focus:ring-1 focus:ring-primary/40"
                            >
                                <option value="">— Select country —</option>
                                <option value="AF">Afghanistan</option>
                                <option value="AU">Australia</option>
                                <option value="BD">Bangladesh</option>
                                <option value="BR">Brazil</option>
                                <option value="CA">Canada</option>
                                <option value="CN">China</option>
                                <option value="EG">Egypt</option>
                                <option value="FR">France</option>
                                <option value="DE">Germany</option>
                                <option value="GH">Ghana</option>
                                <option value="IN">India</option>
                                <option value="ID">Indonesia</option>
                                <option value="IE">Ireland</option>
                                <option value="IL">Israel</option>
                                <option value="IT">Italy</option>
                                <option value="JP">Japan</option>
                                <option value="KE">Kenya</option>
                                <option value="MY">Malaysia</option>
                                <option value="MX">Mexico</option>
                                <option value="NL">Netherlands</option>
                                <option value="NZ">New Zealand</option>
                                <option value="NG">Nigeria</option>
                                <option value="PK">Pakistan</option>
                                <option value="PH">Philippines</option>
                                <option value="PL">Poland</option>
                                <option value="PT">Portugal</option>
                                <option value="RU">Russia</option>
                                <option value="SA">Saudi Arabia</option>
                                <option value="SG">Singapore</option>
                                <option value="ZA">South Africa</option>
                                <option value="KR">South Korea</option>
                                <option value="ES">Spain</option>
                                <option value="LK">Sri Lanka</option>
                                <option value="SE">Sweden</option>
                                <option value="CH">Switzerland</option>
                                <option value="TW">Taiwan</option>
                                <option value="TH">Thailand</option>
                                <option value="TR">Turkey</option>
                                <option value="UA">Ukraine</option>
                                <option value="AE">United Arab Emirates</option>
                                <option value="GB">United Kingdom</option>
                                <option value="US">United States</option>
                                <option value="VN">Vietnam</option>
                            </select>
                        </div>
                    </div>

                    <div className="flex gap-3 pt-1">
                        <button
                            type="submit"
                            disabled={saving}
                            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50"
                        >
                            {saving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
                            Save Changes
                        </button>
                        <button
                            type="button"
                            onClick={() => setEditing(false)}
                            className="px-4 py-2 rounded-lg border border-border text-sm font-medium hover:bg-muted/60 transition-colors"
                        >
                            Cancel
                        </button>
                    </div>
                </form>
            ) : (
                <>
                {/* Profile details */}
                <div className="rounded-2xl border border-border/60 bg-card divide-y divide-border/50">
                    <div className="px-5 py-4 flex items-center gap-3">
                        <User size={16} className="text-muted-foreground shrink-0" />
                        <div className="min-w-0">
                            <p className="text-xs text-muted-foreground">Full name</p>
                            <p className="text-sm font-medium text-foreground">{profile.full_name || "–"}</p>
                        </div>
                    </div>
                    <div className="px-5 py-4 flex items-center gap-3">
                        <Mail size={16} className="text-muted-foreground shrink-0" />
                        <div className="min-w-0">
                            <p className="text-xs text-muted-foreground">Email address</p>
                            <p className="text-sm font-medium text-foreground truncate">{profile.email}</p>
                        </div>
                    </div>
                    <div className="px-5 py-4 flex items-center gap-3">
                        <Phone size={16} className="text-muted-foreground shrink-0" />
                        <div className="min-w-0">
                            <p className="text-xs text-muted-foreground">Phone number</p>
                            <p className="text-sm font-medium text-foreground">{profile.phone || "–"}</p>
                        </div>
                    </div>
                    <div className="px-5 py-4 flex items-center gap-3">
                        <Globe size={16} className="text-muted-foreground shrink-0" />
                        <div className="min-w-0">
                            <p className="text-xs text-muted-foreground">Country</p>
                            <p className="text-sm font-medium text-foreground">
                                {profile.country ? (() => {
                                        try {
                                            return new Intl.DisplayNames(["en"], { type: "region" }).of(profile.country) ?? profile.country;
                                        } catch {
                                            return profile.country;
                                        }
                                    })()
                                    : "–"
                                }
                            </p>
                        </div>
                    </div>
                </div>

                {/* Billing Address */}
                <div className="rounded-2xl border border-border/60 bg-card overflow-hidden">
                    <div className="px-5 py-3 border-b border-border/50 flex items-center gap-2">
                        <MapPin size={14} className="text-muted-foreground" />
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Billing Address</p>
                    </div>
                    {profile.billing_line1 && profile.billing_country ? (
                        <div className="px-5 py-4 space-y-0.5">
                            <p className="text-sm font-medium text-foreground">{profile.billing_line1}</p>
                            {profile.billing_line2 && (
                                <p className="text-sm text-foreground">{profile.billing_line2}</p>
                            )}
                            <p className="text-sm text-foreground">
                                {[profile.billing_city, profile.billing_state, profile.billing_postal_code].filter(Boolean).join(", ")}
                            </p>
                            <p className="text-sm text-foreground">
                                {new Intl.DisplayNames(["en"], { type: "region" }).of(profile.billing_country) ?? profile.billing_country}
                            </p>
                        </div>
                    ) : (
                        <div className="px-5 py-4">
                            <p className="text-sm text-muted-foreground">No billing address saved.</p>
                            <p className="text-xs text-muted-foreground/70 mt-0.5">Add one to streamline payment processing.</p>
                        </div>
                    )}
                </div>
                </>
            )}

            {isAvatarPopupOpen && profile?.avatar_url && (
                <div
                    className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4"
                    role="dialog"
                    aria-modal="true"
                    onClick={() => {
                        setIsAvatarPopupOpen(false);
                        setAvatarPopupImageLoaded(false);
                    }}
                >
                    <div
                        className="relative max-w-xl w-full rounded-xl overflow-hidden bg-card border border-border/50"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <button
                            type="button"
                            onClick={() => {
                                setIsAvatarPopupOpen(false);
                                setAvatarPopupImageLoaded(false);
                            }}
                            className="absolute top-2 right-2 z-10 p-1.5 rounded-md bg-black/60 text-white hover:bg-black/80"
                            aria-label="Close avatar preview"
                        >
                            <X size={16} />
                        </button>
                        {!avatarPopupImageLoaded && (
                            <Skeleton className="w-full h-[80vh]" />
                        )}
                        <img
                            src={profile.avatar_url}
                            alt="Profile avatar preview"
                            className="w-full max-h-[80vh] object-contain bg-black"
                            onLoad={() => setAvatarPopupImageLoaded(true)}
                        />
                    </div>
                </div>
            )}
        </div>
    );
}

