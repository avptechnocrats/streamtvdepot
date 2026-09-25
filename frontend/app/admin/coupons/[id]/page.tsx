"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Save } from "lucide-react";
import { useParams } from "next/navigation";
import {
    createCoupon,
    updateCoupon,
    getCoupon,
    listClientPlans,
    getApiErrorMessage,
    type CouponCreate,
    type CouponOut,
    type ClientPricingPlanOut,
    type DiscountType,
} from "@/lib/api";
import { useToast } from "@/hooks/use-toast";

const CURRENCIES = ["USD", "EUR", "GBP", "INR", "AED", "SGD", "CAD", "AUD"] as const;

export default function CouponFormPage() {
    const router = useRouter();
    const params = useParams();
    const { toast } = useToast();
    const couponId = params?.id as string | undefined;
    const isEdit = couponId && couponId !== "new";

    const [loading, setLoading] = useState(isEdit);
    const [saving, setSaving] = useState(false);
    const [plans, setPlans] = useState<ClientPricingPlanOut[]>([]);

    const [formData, setFormData] = useState<CouponCreate>({
        code: "",
        description: "",
        discount_type: "percentage",
        discount_value: 10,
        min_amount: null,
        max_discount_amount: null,
        max_uses: null,
        max_uses_per_user: null,
        currency: "USD",
        valid_from: null,
        valid_until: null,
        applies_to_plan_ids: null,
        is_active: true,
    });

    useEffect(() => {
        const fetchData = async () => {
            try {
                const plansData = await listClientPlans();
                setPlans(plansData);

                if (isEdit) {
                    const couponData = await getCoupon(couponId);
                    setFormData({
                        code: couponData.code,
                        description: couponData.description,
                        discount_type: couponData.discount_type,
                        discount_value: couponData.discount_value,
                        min_amount: couponData.min_amount,
                        max_discount_amount: couponData.max_discount_amount,
                        max_uses: couponData.max_uses,
                        max_uses_per_user: couponData.max_uses_per_user,
                        currency: couponData.currency ?? "USD",
                        valid_from: couponData.valid_from,
                        valid_until: couponData.valid_until,
                        applies_to_plan_ids: couponData.applies_to_plan_ids,
                        is_active: couponData.is_active,
                    });
                }
            } catch (err: unknown) {
                toast({
                    description: getApiErrorMessage(err, "Failed to load data"),
                    variant: "destructive",
                });
            } finally {
                setLoading(false);
            }
        };

        fetchData();
    }, [isEdit, couponId, toast]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setSaving(true);

        try {
            if (isEdit) {
                await updateCoupon(couponId, formData);
                toast({
                    description: "Coupon updated successfully",
                    variant: "success",
                });
            } else {
                await createCoupon(formData);
                toast({
                    description: "Coupon created successfully",
                    variant: "success",
                });
            }
            router.push("/admin/coupons");
        } catch (err: unknown) {
            toast({
                description: getApiErrorMessage(err, `Failed to ${isEdit ? "update" : "create"} coupon`),
                variant: "destructive",
            });
        } finally {
            setSaving(false);
        }
    };

    const handleChange = (field: keyof CouponCreate, value: any) => {
        setFormData(prev => ({ ...prev, [field]: value }));
    };

    if (loading) {
        return (
            <div className="p-6">
                <div className="text-sm text-muted-foreground">Loading...</div>
            </div>
        );
    }

    return (
        <div className="p-6 space-y-6">
            {/* Header */}
            <div className="flex items-center gap-4">
                <Link
                    href="/admin/coupons"
                    className="p-2 rounded-lg border border-border text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors"
                >
                    <ArrowLeft size={16} />
                </Link>
                <div>
                    <h1 className="text-xl font-bold text-foreground">
                        {isEdit ? "Edit Coupon" : "Create New Coupon"}
                    </h1>
                    <p className="text-sm text-muted-foreground mt-0.5">
                        {isEdit ? "Update coupon details" : "Create a new discount coupon"}
                    </p>
                </div>
            </div>

            {/* Form */}
            <form onSubmit={handleSubmit} className="max-w-3xl">
                <div className="rounded-xl border border-border bg-card p-6 space-y-6">
                    {/* Code */}
                    <div>
                        <label className="block text-sm font-medium text-foreground mb-2">
                            Coupon Code <span className="text-red-500">*</span>
                        </label>
                        <input
                            type="text"
                            required
                            disabled={isEdit}
                            value={formData.code}
                            onChange={(e) => handleChange("code", e.target.value.toUpperCase())}
                            placeholder="e.g., SAVE20"
                            className="w-full px-3 py-2 rounded-lg border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-50"
                        />
                        <p className="text-xs text-muted-foreground mt-1">
                            Will be automatically converted to uppercase
                        </p>
                    </div>

                    {/* Description */}
                    <div>
                        <label className="block text-sm font-medium text-foreground mb-2">
                            Description
                        </label>
                        <textarea
                            value={formData.description || ""}
                            onChange={(e) => handleChange("description", e.target.value)}
                            placeholder="Brief description of this coupon"
                            rows={3}
                            className="w-full px-3 py-2 rounded-lg border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary resize-none"
                        />
                    </div>

                    {/* Discount Type & Value */}
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-foreground mb-2">
                                Discount Type <span className="text-red-500">*</span>
                            </label>
                            <select
                                required
                                value={formData.discount_type}
                                onChange={(e) => handleChange("discount_type", e.target.value as DiscountType)}
                                className="w-full px-3 py-2 rounded-lg border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                            >
                                <option value="percentage">Percentage (%)</option>
                                <option value="fixed_amount">Fixed Amount ($)</option>
                            </select>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-foreground mb-2">
                                Discount Value <span className="text-red-500">*</span>
                            </label>
                            <input
                                type="number"
                                required
                                min="0"
                                step="0.01"
                                value={formData.discount_value}
                                onChange={(e) => handleChange("discount_value", parseFloat(e.target.value))}
                                placeholder={formData.discount_type === "percentage" ? "e.g., 20" : "e.g., 10.00"}
                                className="w-full px-3 py-2 rounded-lg border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                            />
                        </div>
                    </div>

                    {/* Currency */}
                    <div>
                        <label className="block text-sm font-medium text-foreground mb-2">
                            Currency <span className="text-red-500">*</span>
                        </label>
                        <select
                            required
                            value={formData.currency}
                            onChange={(e) => handleChange("currency", e.target.value)}
                            className="w-full px-3 py-2 rounded-lg border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                        >
                            {CURRENCIES.map((currency) => <option key={currency} value={currency}>{currency}</option>)}
                        </select>
                    </div>

                    {/* Min Amount & Max Discount */}
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-foreground mb-2">
                                Minimum Purchase Amount
                            </label>
                            <input
                                type="number"
                                min="0"
                                step="0.01"
                                value={formData.min_amount || ""}
                                onChange={(e) => handleChange("min_amount", e.target.value ? parseFloat(e.target.value) : null)}
                                placeholder="Optional"
                                className="w-full px-3 py-2 rounded-lg border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                            />
                            <p className="text-xs text-muted-foreground mt-1">
                                Leave empty for no minimum
                            </p>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-foreground mb-2">
                                Max Discount (for %)
                            </label>
                            <input
                                type="number"
                                min="0"
                                step="0.01"
                                value={formData.max_discount_amount || ""}
                                onChange={(e) => handleChange("max_discount_amount", e.target.value ? parseFloat(e.target.value) : null)}
                                placeholder="Optional"
                                disabled={formData.discount_type === "fixed_amount"}
                                className="w-full px-3 py-2 rounded-lg border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-50"
                            />
                            <p className="text-xs text-muted-foreground mt-1">
                                Cap for percentage discounts
                            </p>
                        </div>
                    </div>

                    {/* Usage Limits */}
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-foreground mb-2">
                                Total Usage Limit
                            </label>
                            <input
                                type="number"
                                min="1"
                                value={formData.max_uses || ""}
                                onChange={(e) => handleChange("max_uses", e.target.value ? parseInt(e.target.value) : null)}
                                placeholder="Unlimited"
                                className="w-full px-3 py-2 rounded-lg border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                            />
                            <p className="text-xs text-muted-foreground mt-1">
                                Total times this coupon can be used
                            </p>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-foreground mb-2">
                                Per-User Usage Limit
                            </label>
                            <input
                                type="number"
                                min="1"
                                value={formData.max_uses_per_user || ""}
                                onChange={(e) => handleChange("max_uses_per_user", e.target.value ? parseInt(e.target.value) : null)}
                                placeholder="Unlimited"
                                className="w-full px-3 py-2 rounded-lg border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                            />
                            <p className="text-xs text-muted-foreground mt-1">
                                Times each user can use this coupon
                            </p>
                        </div>
                    </div>

                    {/* Validity Period */}
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-foreground mb-2">
                                Valid From
                            </label>
                            <input
                                type="datetime-local"
                                value={formData.valid_from ? formData.valid_from.slice(0, 16) : ""}
                                onChange={(e) => handleChange("valid_from", e.target.value ? new Date(e.target.value).toISOString() : null)}
                                className="w-full px-3 py-2 rounded-lg border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-foreground mb-2">
                                Valid Until
                            </label>
                            <input
                                type="datetime-local"
                                value={formData.valid_until ? formData.valid_until.slice(0, 16) : ""}
                                onChange={(e) => handleChange("valid_until", e.target.value ? new Date(e.target.value).toISOString() : null)}
                                className="w-full px-3 py-2 rounded-lg border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                            />
                        </div>
                    </div>

                    {/* Plan Restrictions */}
                    <div>
                        <label className="block text-sm font-medium text-foreground mb-2">
                            Applicable Plans
                        </label>
                        <div className="space-y-2 max-h-48 overflow-y-auto border border-border rounded-lg p-3">
                            <label className="flex items-center gap-2 cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={!formData.applies_to_plan_ids}
                                    onChange={(e) => handleChange("applies_to_plan_ids", e.target.checked ? null : [])}
                                    className="rounded border-border text-primary focus:ring-primary"
                                />
                                <span className="text-sm text-foreground font-medium">All Plans</span>
                            </label>
                            {plans.map((plan) => (
                                <label key={plan.id} className="flex items-center gap-2 cursor-pointer">
                                    <input
                                        type="checkbox"
                                        disabled={!formData.applies_to_plan_ids}
                                        checked={formData.applies_to_plan_ids?.includes(plan.id) || false}
                                        onChange={(e) => {
                                            const current = formData.applies_to_plan_ids || [];
                                            const updated = e.target.checked
                                                ? [...current, plan.id]
                                                : current.filter(id => id !== plan.id);
                                            handleChange("applies_to_plan_ids", updated.length > 0 ? updated : null);
                                        }}
                                        className="rounded border-border text-primary focus:ring-primary disabled:opacity-50"
                                    />
                                    <span className="text-sm text-muted-foreground">{plan.name}</span>
                                </label>
                            ))}
                        </div>
                    </div>

                    {/* Status */}
                    <div>
                        <label className="flex items-center gap-2 cursor-pointer">
                            <input
                                type="checkbox"
                                checked={formData.is_active}
                                onChange={(e) => handleChange("is_active", e.target.checked)}
                                className="rounded border-border text-primary focus:ring-primary"
                            />
                            <span className="text-sm font-medium text-foreground">Active</span>
                        </label>
                        <p className="text-xs text-muted-foreground mt-1">
                            Inactive coupons cannot be used by customers
                        </p>
                    </div>
                </div>

                {/* Actions */}
                <div className="flex gap-3 mt-6">
                    <Link
                        href="/admin/coupons"
                        className="px-4 py-2 rounded-lg border border-border text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors"
                    >
                        Cancel
                    </Link>
                    <button
                        type="submit"
                        disabled={saving}
                        className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:brightness-110 transition-all disabled:opacity-50"
                    >
                        <Save size={14} />
                        {saving ? "Saving..." : isEdit ? "Update Coupon" : "Create Coupon"}
                    </button>
                </div>
            </form>
        </div>
    );
}
