"use client";

import { useEffect, useState } from "react";
import { BellRing, CalendarRange, Mail, MessageSquare, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";

const STORAGE_KEY = "streamtvdepot-admin-notification-settings";

type NotificationSettings = {
    email: boolean;
    sms: boolean;
    productUpdates: boolean;
    securityAlerts: boolean;
    weeklySummary: boolean;
};

const defaultSettings: NotificationSettings = {
    email: true,
    sms: false,
    productUpdates: true,
    securityAlerts: true,
    weeklySummary: false,
};

export default function NotificationSettingsPage() {
    const { toast } = useToast();
    const [settings, setSettings] = useState<NotificationSettings>(defaultSettings);

    useEffect(() => {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (raw) setSettings({ ...defaultSettings, ...JSON.parse(raw) });
        } catch {
            setSettings(defaultSettings);
        }
    }, []);

    const saveSettings = () => {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
        toast({
            title: "Notification settings saved",
            description: "Your preferences are stored in this browser.",
            variant: "success",
        });
    };

    return (
        <div className="grid gap-6 xl:grid-cols-[1fr_0.9fr]">
            <Card className="border-border/80 bg-card/90 backdrop-blur-sm">
                <CardContent className="p-6 space-y-6">
                    <div className="flex items-start gap-4">
                        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                            <BellRing size={24} />
                        </div>
                        <div className="space-y-1">
                            <h2 className="text-2xl font-display font-semibold tracking-tight text-foreground">Notification Settings</h2>
                            <p className="text-sm text-muted-foreground">Choose which admin alerts you want to receive.</p>
                        </div>
                    </div>

                    <div className="space-y-4">
                        {[
                            { key: "email", label: "Email alerts", description: "Receive important account notices by email.", icon: Mail },
                            { key: "sms", label: "SMS alerts", description: "Send critical alerts to your phone number.", icon: MessageSquare },
                            { key: "productUpdates", label: "Product updates", description: "Get release notes and admin feature updates.", icon: CalendarRange },
                            { key: "securityAlerts", label: "Security alerts", description: "Notify on suspicious activity and password changes.", icon: BellRing },
                            { key: "weeklySummary", label: "Weekly summary", description: "A weekly digest of activity and system notices.", icon: CalendarRange },
                        ].map(({ key, label, description, icon: Icon }) => (
                            <label key={key} className="flex items-start justify-between gap-4 rounded-2xl border border-border bg-background/60 p-4">
                                <span className="flex items-start gap-3">
                                    <span className="mt-0.5 flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
                                        <Icon size={16} />
                                    </span>
                                    <span>
                                        <span className="block text-sm font-medium text-foreground">{label}</span>
                                        <span className="block text-xs text-muted-foreground mt-1">{description}</span>
                                    </span>
                                </span>
                                <Switch
                                    checked={settings[key as keyof NotificationSettings]}
                                    onCheckedChange={(checked) => setSettings((current) => ({ ...current, [key]: checked }))}
                                />
                            </label>
                        ))}
                    </div>

                    <Button type="button" onClick={saveSettings} className="min-w-40">
                        <Save size={16} />
                        Save preferences
                    </Button>
                </CardContent>
            </Card>

            <Card className="border-border/80 bg-card/90 backdrop-blur-sm">
                <CardContent className="p-6 space-y-4">
                    <p className="text-sm font-semibold text-foreground">Where these apply</p>
                    <div className="space-y-3 text-sm text-muted-foreground">
                        <p>These preferences are stored locally until a dedicated notifications API is introduced.</p>
                        <p>Security alerts stay enabled by default to reduce account risk.</p>
                        <p>You can expand this screen later to connect email, SMS, and push delivery rules.</p>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}