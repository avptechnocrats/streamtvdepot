"use client";

import { useState, useRef, useEffect } from "react";
import { ChevronDown, MapPin, Check } from "lucide-react";
import { COUNTRIES, getCountryName } from "@/lib/services/geolocation";

export interface CountrySelectorProps {
    selectedCountry: string | null;
    detectedCountry: string | null;
    onCountryChange: (country: string) => void;
    showDetectionInfo?: boolean;
}

export function CountrySelector({
    selectedCountry,
    detectedCountry,
    onCountryChange,
    showDetectionInfo = true,
}: CountrySelectorProps) {
    const [isOpen, setIsOpen] = useState(false);
    const [searchQuery, setSearchQuery] = useState("");
    const dropdownRef = useRef<HTMLDivElement>(null);
    const searchInputRef = useRef<HTMLInputElement>(null);

    const filteredCountries = COUNTRIES.filter(
        (c) =>
            c.code.toUpperCase().includes(searchQuery.toUpperCase()) ||
            c.name.toUpperCase().includes(searchQuery.toUpperCase()),
    );

    const displayCountry = selectedCountry || detectedCountry;
    const isDetected = !selectedCountry && detectedCountry;

    // Close dropdown when clicking outside
    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        }

        if (isOpen) {
            document.addEventListener("mousedown", handleClickOutside);
            // Focus search input when dropdown opens
            setTimeout(() => searchInputRef.current?.focus(), 50);
            return () => document.removeEventListener("mousedown", handleClickOutside);
        }
    }, [isOpen]);

    return (
        <div className="relative" ref={dropdownRef}>
            {/* Selector Button */}
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="flex items-center gap-2 px-3 py-2 rounded-lg border border-border bg-card hover:bg-muted/50 transition-colors text-sm"
            >
                <MapPin size={16} className="text-primary" />
                <span className="font-medium">{displayCountry ? getCountryName(displayCountry) : "Select Country"}</span>
                {isDetected && showDetectionInfo && (
                    <span className="text-xs px-1.5 py-0.5 rounded bg-primary/10 text-primary font-medium">Auto-detected</span>
                )}
                <ChevronDown
                    size={16}
                    className={`text-muted-foreground transition-transform ${isOpen ? "rotate-180" : ""}`}
                />
            </button>

            {/* Dropdown Menu */}
            {isOpen && (
                <div className="absolute top-full left-0 mt-2 w-72 z-50 rounded-lg border border-border bg-card shadow-lg">
                    {/* Search Input */}
                    <div className="p-3 border-b border-border">
                        <input
                            ref={searchInputRef}
                            type="text"
                            placeholder="Search country..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full px-3 py-2 rounded-md bg-muted border border-border text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                        />
                    </div>

                    {/* Country List */}
                    <div className="max-h-80 overflow-y-auto">
                        {filteredCountries.length > 0 ? (
                            filteredCountries.map((country) => {
                                const isSelected = displayCountry === country.code;
                                const isDetectedCountry = detectedCountry === country.code && !selectedCountry;

                                return (
                                    <button
                                        key={country.code}
                                        onClick={() => {
                                            onCountryChange(country.code);
                                            setIsOpen(false);
                                            setSearchQuery("");
                                        }}
                                        className={`w-full px-4 py-2.5 text-left text-sm hover:bg-muted transition-colors flex items-center justify-between ${
                                            isSelected ? "bg-primary/10 text-primary font-medium" : ""
                                        }`}
                                    >
                                        <div className="flex flex-col">
                                            <span>
                                                {country.code} • {country.name}
                                            </span>
                                            {isDetectedCountry && (
                                                <span className="text-xs text-muted-foreground">Auto-detected location</span>
                                            )}
                                        </div>
                                        {isSelected && <Check size={16} className="text-primary" />}
                                    </button>
                                );
                            })
                        ) : (
                            <div className="px-4 py-8 text-center text-sm text-muted-foreground">
                                No countries found
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}

/**
 * Pricing Header with Country Detection Info
 * Shows detected country and displays local pricing message
 */
export function PricingHeaderWithCountry({
    detectedCountry,
    selectedCountry,
    onCountryChange,
}: {
    detectedCountry: string | null;
    selectedCountry: string | null;
    onCountryChange: (country: string) => void;
}) {
    const displayCountry = selectedCountry || detectedCountry;
    const isDetected = !selectedCountry && detectedCountry;

    return (
        <div className="space-y-6">
            {/* Main Heading */}
            <div className="text-center">
                <h1 className="text-4xl md:text-5xl font-black text-foreground tracking-tight">
                    Simple, transparent pricing
                </h1>
                <p className="mt-3 text-lg text-muted-foreground max-w-xl mx-auto">
                    Choose the plan that works for you. Cancel anytime.
                </p>
            </div>

            {/* Country Detection Banner */}
            {displayCountry && (
                <div className="max-w-2xl mx-auto">
                    <div className="rounded-lg border border-primary/20 bg-primary/5 px-4 py-3 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <MapPin size={18} className="text-primary" />
                            <div>
                                <p className="text-sm font-medium text-foreground">
                                    Pricing in {getCountryName(displayCountry)}
                                    {isDetected && " (auto-detected)"}
                                </p>
                                <p className="text-xs text-muted-foreground mt-0.5">
                                    Prices shown in your local currency
                                </p>
                            </div>
                        </div>
                        <CountrySelector
                            selectedCountry={selectedCountry}
                            detectedCountry={detectedCountry}
                            onCountryChange={onCountryChange}
                            showDetectionInfo={false}
                        />
                    </div>
                </div>
            )}
        </div>
    );
}
