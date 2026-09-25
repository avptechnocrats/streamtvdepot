"use client";

import { useState } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { createUser, updateUser, type EndUserOut } from "@/lib/api";
import { CountrySelector } from "@/components/ui/country-selector";

// ─── Schema ───────────────────────────────────────────────────────────────────

const createSchema = z.object({
    full_name: z.string().min(1, "Full name is required"),
    email: z.string().email("Enter a valid email address"),
    password: z.string().min(8, "Password must be at least 8 characters"),
    phone: z.string().optional(),
    country: z.string().optional(),
});

const editSchema = z.object({
    full_name: z.string().min(1, "Full name is required"),
    phone: z.string().optional(),
    country: z.string().optional(),
    is_active: z.boolean(),
});

type CreateValues = z.infer<typeof createSchema>;
type EditValues = z.infer<typeof editSchema>;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function inputCls(hasError = false) {
    return `w-full h-9 rounded-lg bg-secondary border ${hasError ? "border-red-500/60" : "border-border"
        } px-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary transition-colors`;
}

function FieldError({ msg }: { msg?: string }) {
    if (!msg) return null;
    return <p className="text-[11px] text-red-400 mt-0.5">{msg}</p>;
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface UserFormCreateProps {
    mode: "create";
    initialData?: undefined;
    onSuccess: (user: EndUserOut) => void;
    onCancel: () => void;
}

interface UserFormEditProps {
    mode: "edit";
    initialData: EndUserOut;
    onSuccess: (user: EndUserOut) => void;
    onCancel: () => void;
}

type UserFormProps = UserFormCreateProps | UserFormEditProps;

// ─── Create form ──────────────────────────────────────────────────────────────

function CreateUserForm({ onSuccess, onCancel }: { onSuccess: (u: EndUserOut) => void; onCancel: () => void }) {
    const [apiError, setApiError] = useState<string | null>(null);

    const { register, handleSubmit, control, formState: { errors, isSubmitting } } = useForm<CreateValues>({
        resolver: zodResolver(createSchema),
        defaultValues: { full_name: "", email: "", password: "", phone: "", country: "" },
    });

    async function onSubmit(values: CreateValues) {
        setApiError(null);
        try {
            const saved = await createUser({
                full_name: values.full_name,
                email: values.email,
                password: values.password,
                phone: values.phone || null,
                country: values.country || null,
            });
            onSuccess(saved);
        } catch (err: unknown) {
            setApiError(err instanceof Error ? err.message : "Failed to create user");
        }
    }

    return (
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            {apiError && (
                <div className="rounded-lg px-3 py-2.5 text-sm text-red-300 border border-red-500/20 bg-red-500/8">
                    {apiError}
                </div>
            )}

            <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">
                    Full Name <span className="text-red-400">*</span>
                </label>
                <input {...register("full_name")} placeholder="John Doe" className={inputCls(!!errors.full_name)} />
                <FieldError msg={errors.full_name?.message} />
            </div>

            <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">
                    Email Address <span className="text-red-400">*</span>
                </label>
                <input {...register("email")} type="email" placeholder="john@example.com" className={inputCls(!!errors.email)} />
                <FieldError msg={errors.email?.message} />
            </div>

            <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">
                    Password <span className="text-red-400">*</span>
                </label>
                <input {...register("password")} type="password" placeholder="Min 8 characters" className={inputCls(!!errors.password)} />
                <FieldError msg={errors.password?.message} />
            </div>

            <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                    <label className="text-xs font-medium text-muted-foreground">Phone</label>
                    <input {...register("phone")} placeholder="+1 555 000 0000" className={inputCls()} />
                </div>
                <div className="space-y-1.5">
                    <label className="text-xs font-medium text-muted-foreground">Country</label>
                    <Controller
                        name="country"
                        control={control}
                        render={({ field }) => (
                            <CountrySelector
                                value={field.value || ""}
                                onChange={field.onChange}
                                placeholder="Select a country..."
                                error={!!errors.country}
                            />
                        )}
                    />
                    <FieldError msg={errors.country?.message} />
                </div>
            </div>

            <FormActions isSubmitting={isSubmitting} submitLabel="Create User" onCancel={onCancel} />
        </form>
    );
}

// ─── Edit form ────────────────────────────────────────────────────────────────

function EditUserForm({ initialData, onSuccess, onCancel }: { initialData: EndUserOut; onSuccess: (u: EndUserOut) => void; onCancel: () => void }) {
    const [apiError, setApiError] = useState<string | null>(null);

    const { register, handleSubmit, control, formState: { errors, isSubmitting } } = useForm<EditValues>({
        resolver: zodResolver(editSchema),
        defaultValues: {
            full_name: initialData.full_name,
            phone: initialData.phone ?? "",
            country: initialData.country ?? "",
            is_active: initialData.is_active,
        },
    });

    async function onSubmit(values: EditValues) {
        setApiError(null);
        try {
            const saved = await updateUser(initialData.id, {
                full_name: values.full_name,
                phone: values.phone || null,
                country: values.country || null,
                is_active: values.is_active,
            });
            onSuccess(saved);
        } catch (err: unknown) {
            setApiError(err instanceof Error ? err.message : "Failed to save user");
        }
    }

    return (
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            {apiError && (
                <div className="rounded-lg px-3 py-2.5 text-sm text-red-300 border border-red-500/20 bg-red-500/8">
                    {apiError}
                </div>
            )}

            <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">
                    Full Name <span className="text-red-400">*</span>
                </label>
                <input {...register("full_name")} placeholder="John Doe" className={inputCls(!!errors.full_name)} />
                <FieldError msg={errors.full_name?.message} />
            </div>

            <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Email Address</label>
                <input
                    value={initialData.email}
                    readOnly
                    className={`${inputCls()} opacity-60 cursor-not-allowed`}
                />
                <p className="text-[11px] text-muted-foreground">Email cannot be changed after registration.</p>
            </div>

            <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                    <label className="text-xs font-medium text-muted-foreground">Phone</label>
                    <input {...register("phone")} placeholder="+1 555 000 0000" className={inputCls()} />
                </div>
                <div className="space-y-1.5">
                    <label className="text-xs font-medium text-muted-foreground">Country</label>
                    <Controller
                        name="country"
                        control={control}
                        render={({ field }) => (
                            <CountrySelector
                                value={field.value || ""}
                                onChange={field.onChange}
                                placeholder="Select a country..."
                                error={!!errors.country}
                            />
                        )}
                    />
                    <FieldError msg={errors.country?.message} />
                </div>
            </div>

            <Controller
                name="is_active"
                control={control}
                render={({ field }) => (
                    <label className="flex items-center gap-3 cursor-pointer select-none pt-1">
                        <button
                            type="button"
                            onClick={() => field.onChange(!field.value)}
                            className={`relative w-9 h-5 rounded-full transition-colors shrink-0 ${field.value ? "bg-primary" : "bg-muted"}`}
                        >
                            <span className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${field.value ? "translate-x-4" : "translate-x-0"}`} />
                        </button>
                        <div>
                            <p className="text-sm font-medium text-foreground">Active Account</p>
                            <p className="text-xs text-muted-foreground">Inactive users cannot sign in to the platform.</p>
                        </div>
                    </label>
                )}
            />

            <FormActions isSubmitting={isSubmitting} submitLabel="Save Changes" onCancel={onCancel} />
        </form>
    );
}

// ─── Shared action row ────────────────────────────────────────────────────────

function FormActions({ isSubmitting, submitLabel, onCancel }: { isSubmitting: boolean; submitLabel: string; onCancel: () => void }) {
    return (
        <div className="flex items-center gap-3 pt-2">
            <button
                type="submit"
                disabled={isSubmitting}
                className="px-5 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            >
                {isSubmitting ? "Saving…" : submitLabel}
            </button>
            <button
                type="button"
                onClick={onCancel}
                className="px-5 py-2 rounded-lg text-sm text-muted-foreground hover:text-foreground hover:bg-surface-hover transition-colors"
            >
                Cancel
            </button>
        </div>
    );
}

// ─── Public export ────────────────────────────────────────────────────────────

export function UserForm({ mode, initialData, onSuccess, onCancel }: UserFormProps) {
    if (mode === "create") {
        return <CreateUserForm onSuccess={onSuccess} onCancel={onCancel} />;
    }
    return <EditUserForm initialData={initialData} onSuccess={onSuccess} onCancel={onCancel} />;
}

