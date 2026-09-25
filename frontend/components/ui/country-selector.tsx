"use client";

import { useState, useRef, useEffect } from "react";
import { ChevronDown, MapPin, Check } from "lucide-react";
import { COUNTRIES, getCountryName } from "@/lib/services/geolocation";

export interface CountrySelectorProps {
    value: string;
    onChange: (country: string) => void;
    placeholder?: string;
    className?: string;
    error?: boolean;
}

/**
 * Country Selector Component
 * Searchable dropdown for selecting countries by code or name
 * Returns ISO 3166-1 alpha-2 country code (e.g., "US", "IN")
 */
export function CountrySelector({
    value,
    onChange,
    placeholder = "Select a country...",
    className = "",
    error = false,
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

    const selectedCountry = COUNTRIES.find((c) => c.code === value);

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
        <div className={`relative w-full ${className}`} ref={dropdownRef}>
            {/* Selector Button */}
            <button
                type="button"
                onClick={() => setIsOpen(!isOpen)}
                className={`w-full h-9 rounded-lg bg-secondary border ${error ? "border-red-500/60" : "border-border"
                    } px-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary transition-colors flex items-center justify-between`}
            >
                <span className={selectedCountry ? "font-medium" : "text-muted-foreground"}>
                    {selectedCountry ? `${selectedCountry.code} • ${selectedCountry.name}` : placeholder}
                </span>
                <ChevronDown
                    size={14}
                    className={`text-muted-foreground transition-transform shrink-0 ${isOpen ? "rotate-180" : ""}`}
                />
            </button>

            {/* Dropdown Menu */}
            {isOpen && (
                <div className="absolute top-full left-0 mt-2 w-full z-50 rounded-lg border border-border bg-card shadow-lg">
                    {/* Search Input */}
                    <div className="p-2 border-b border-border">
                        <input
                            ref={searchInputRef}
                            type="text"
                            placeholder="Search..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full px-2.5 py-1.5 rounded-md bg-muted border border-border text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                        />
                    </div>

                    {/* Country List */}
                    <div className="max-h-64 overflow-y-auto">
                        {filteredCountries.length > 0 ? (
                            filteredCountries.map((country) => {
                                const isSelected = value === country.code;

                                return (
                                    <button
                                        key={country.code}
                                        type="button"
                                        onClick={() => {
                                            onChange(country.code);
                                            setIsOpen(false);
                                            setSearchQuery("");
                                        }}
                                        className={`w-full px-3 py-2 text-left text-sm hover:bg-muted transition-colors flex items-center justify-between ${isSelected ? "bg-primary/10 text-primary font-medium" : ""
                                            }`}
                                    >
                                        <span>{country.code} • {country.name}</span>
                                        {isSelected && <Check size={14} className="text-primary" />}
                                    </button>
                                );
                            })
                        ) : (
                            <div className="px-3 py-6 text-center text-sm text-muted-foreground">
                                No countries found
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
