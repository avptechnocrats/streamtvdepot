"use client";

import { ChevronDown, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

export interface CategoryPickerOption {
    value: string;
    label: string;
}

interface CategoryPickerProps {
    options: CategoryPickerOption[];
    selected: string[];
    onChange: (values: string[]) => void;
    placeholder?: string;
    searchable?: boolean;
}

const inputClassName = "w-full px-3 py-2 rounded-lg border border-border bg-background text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary";

export function CategoryPicker({
    options,
    selected,
    onChange,
    placeholder = "+ Add category...",
    searchable = false,
}: CategoryPickerProps) {
    const [open, setOpen] = useState(false);
    const [search, setSearch] = useState("");
    const containerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const close = (event: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
                setOpen(false);
                setSearch("");
            }
        };
        document.addEventListener("mousedown", close);
        return () => document.removeEventListener("mousedown", close);
    }, []);

    const toggle = (value: string) => onChange(
        selected.includes(value) ? selected.filter(item => item !== value) : [...selected, value],
    );
    const availableOptions = options.filter(option => !selected.includes(option.value));
    const filteredOptions = search.trim()
        ? availableOptions.filter(option => option.label.toLowerCase().includes(search.toLowerCase()))
        : availableOptions;

    return (
        <div ref={containerRef} className="space-y-1.5">
            {selected.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                    {selected.map(value => {
                        const option = options.find(item => item.value === value);
                        return (
                            <span key={value} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-primary/15 text-primary text-xs font-medium">
                                {option?.label ?? value}
                                <button type="button" onClick={() => toggle(value)} className="hover:text-red-400 transition-colors" aria-label={`Remove ${option?.label ?? value}`}>
                                    <X size={11} />
                                </button>
                            </span>
                        );
                    })}
                </div>
            )}
            {searchable ? (
                <div className="relative">
                    <input
                        type="text"
                        value={search}
                        onChange={event => { setSearch(event.target.value); setOpen(true); }}
                        onFocus={() => setOpen(true)}
                        placeholder={placeholder}
                        className={inputClassName}
                    />
                    {open && (
                        <div className="absolute z-50 mt-1 w-full rounded-xl border border-border bg-card shadow-xl max-h-48 overflow-y-auto">
                            {filteredOptions.length ? filteredOptions.map(option => (
                                <button key={option.value} type="button" onClick={() => toggle(option.value)} className="w-full text-left px-3 py-2 text-sm text-foreground hover:bg-secondary transition-colors">
                                    {option.label}
                                </button>
                            )) : <p className="px-3 py-2 text-xs text-muted-foreground">No categories found.</p>}
                        </div>
                    )}
                </div>
            ) : (
                <div className="relative">
                    <select value="" onChange={event => { if (event.target.value) toggle(event.target.value); }} className={`${inputClassName} appearance-none pr-8`}>
                        <option value="">{placeholder}</option>
                        {availableOptions.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
                    </select>
                    <ChevronDown size={13} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                </div>
            )}
        </div>
    );
}