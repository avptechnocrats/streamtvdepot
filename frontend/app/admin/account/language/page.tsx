"use client";

import { useEffect, useState } from "react";
import { Globe, Languages, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";

const STORAGE_KEY = "signalview-admin-language";

const languages = [
    { value: "en", label: "English" },
    { value: "es", label: "Spanish" },
    { value: "fr", label: "French" },
    { value: "hi", label: "Hindi" },
    { value: "ar", label: "Arabic" },
];

export default function LanguagePage() {
    const { toast } = useToast();
    const [language, setLanguage] = useState("en");

    useEffect(() => {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored) setLanguage(stored);
    }, []);

    const handleSave = () => {
        localStorage.setItem(STORAGE_KEY, language);
        toast({
            title: "Language preference saved",
            description: "This browser will use the selected language setting.",
            variant: "success",
        });
    };

    return (
        <div className="grid gap-6 xl:grid-cols-[1fr_0.9fr]">
            <Card className="border-border/80 bg-card/90 backdrop-blur-sm">
                <CardContent className="p-6 space-y-6">
                    <div className="flex items-start gap-4">
                        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                            <Globe size={24} />
                        </div>
                        <div className="space-y-1">
                            <h2 className="text-2xl font-display font-semibold tracking-tight text-foreground">Language</h2>
                            <p className="text-sm text-muted-foreground">Choose the admin UI language for this browser session.</p>
                        </div>
                    </div>

                    <div className="space-y-2 max-w-sm">
                        <label className="text-sm font-medium text-foreground">Display language</label>
                        <Select value={language} onValueChange={setLanguage}>
                            <SelectTrigger>
                                <SelectValue placeholder="Choose language" />
                            </SelectTrigger>
                            <SelectContent>
                                {languages.map((entry) => (
                                    <SelectItem key={entry.value} value={entry.value}>
                                        {entry.label}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    <Button type="button" onClick={handleSave} className="min-w-36">
                        <Save size={16} />
                        Save language
                    </Button>
                </CardContent>
            </Card>

            <Card className="border-border/80 bg-card/90 backdrop-blur-sm">
                <CardContent className="p-6 space-y-4">
                    <div className="flex items-center gap-3">
                        <Languages size={18} className="text-primary" />
                        <p className="text-sm font-semibold text-foreground">Notes</p>
                    </div>
                    <div className="space-y-3 text-sm text-muted-foreground">
                        <p>This preference is currently stored locally. It can be connected to a profile API later.</p>
                        <p>Only the most common admin languages are shown here to keep the menu concise.</p>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}