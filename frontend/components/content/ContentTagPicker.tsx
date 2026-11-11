"use client";

import { useEffect, useId, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, ChevronDown, Loader2, Plus, Tag, X } from "lucide-react";
import { Command, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { createContentTag, getApiErrorMessage, getClientSlug, listContentTags } from "@/lib/api";

export default function ContentTagPicker({ selected, onChange }: {
    selected: string[];
    onChange: (tags: string[]) => void;
}) {
    const id = useId();
    const [open, setOpen] = useState(false);
    const [search, setSearch] = useState("");
    const [debouncedSearch, setDebouncedSearch] = useState("");
    const queryClient = useQueryClient();
    const tenant = getClientSlug();
    const name = search.trim().replace(/\s+/g, " ");
    const key = (value: string) => value.toLocaleLowerCase();

    useEffect(() => {
        const timer = setTimeout(() => setDebouncedSearch(name), 200);
        return () => clearTimeout(timer);
    }, [name]);

    const tags = useQuery({
        queryKey: ["content-tags", tenant, debouncedSearch],
        queryFn: () => listContentTags(debouncedSearch),
        enabled: open,
        staleTime: 30_000,
    });

    const toggle = (tag: string) => {
        const exists = selected.some(value => key(value) === key(tag));
        onChange(exists ? selected.filter(value => key(value) !== key(tag)) : [...selected, tag]);
    };

    const create = useMutation({
        mutationFn: createContentTag,
        onSuccess: (tag) => {
            if (!selected.some(value => key(value) === key(tag.name))) {
                onChange([...selected, tag.name]);
            }
            setSearch("");
            void queryClient.invalidateQueries({ queryKey: ["content-tags", tenant] });
        },
    });

    const existing = (tags.data ?? []).some(tag => key(tag.name) === key(name))
        || selected.some(tag => key(tag) === key(name));
    const waiting = tags.isFetching || name !== debouncedSearch;
    const canCreate = name.length > 0 && name.length <= 80 && !existing && !waiting && !tags.isError;

    return (
        <div className="min-w-0 space-y-1.5">
            <label htmlFor={id} className="block text-xs font-semibold text-muted-foreground">Tags</label>
            <Popover open={open} onOpenChange={(value) => { setOpen(value); if (!value) setSearch(""); }}>
                <PopoverTrigger asChild>
                    <button id={id} type="button" role="combobox" aria-expanded={open} disabled={selected.length >= 100}
                        className="flex h-9 w-full items-center gap-2 rounded-lg border border-input bg-background px-3 text-left text-sm text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-50">
                        <Tag size={14} className="shrink-0" />
                        <span className="min-w-0 flex-1 truncate">Add tags...</span>
                        <ChevronDown size={13} className="shrink-0" />
                    </button>
                </PopoverTrigger>
                <PopoverContent align="start" className="w-[var(--radix-popover-trigger-width)] max-w-[calc(100vw-2rem)] p-0">
                    <Command shouldFilter={false}>
                        <CommandInput value={search} onValueChange={(value) => { setSearch(value); if (create.isError) create.reset(); }} disabled={create.isPending} placeholder="Search or add a tag..." maxLength={80} />
                        <CommandList>
                            {waiting && <div role="status" className="flex items-center gap-2 px-3 py-2 text-xs text-muted-foreground"><Loader2 size={13} className="animate-spin" />Loading tags...</div>}
                            {tags.isError && <div className="space-y-2 px-3 py-2 text-xs"><p role="alert" className="text-destructive">Could not load tags.</p><button type="button" onClick={() => { void tags.refetch(); }} className="underline">Retry</button></div>}
                            {!waiting && !tags.isError && !tags.data?.length && !name && <p className="px-3 py-2 text-xs text-muted-foreground">No tags yet.</p>}
                            <CommandGroup>
                                {(tags.data ?? []).map(tag => {
                                    const checked = selected.some(value => key(value) === key(tag.name));
                                    return (
                                        <CommandItem key={tag.id} value={tag.id} onSelect={() => toggle(tag.name)} disabled={create.isPending || (!checked && selected.length >= 100)} className="gap-2">
                                            <Check size={14} className={checked ? "shrink-0 text-primary" : "shrink-0 opacity-0"} />
                                            <span className="min-w-0 break-words">{tag.name}</span>
                                        </CommandItem>
                                    );
                                })}
                                {canCreate && <CommandItem value="create-tag" onSelect={() => create.mutate(name)} disabled={create.isPending || selected.length >= 100} className="gap-2">
                                    {create.isPending ? <Loader2 size={14} className="shrink-0 animate-spin" /> : <Plus size={14} className="shrink-0" />}
                                    <span className="min-w-0 break-words">Create &quot;{name}&quot;</span>
                                </CommandItem>}
                            </CommandGroup>
                        </CommandList>
                    </Command>
                </PopoverContent>
            </Popover>
            {create.isError && <p role="alert" className="text-xs text-destructive">{getApiErrorMessage(create.error, "Could not create tag. Please try again.")}</p>}
            {selected.length > 0 && <div className="flex flex-wrap gap-1.5">
                {selected.map(tag => <span key={tag} className="inline-flex max-w-full items-center gap-1 rounded-md bg-primary/15 px-2 py-0.5 text-xs font-medium text-primary">
                    <span className="min-w-0 break-words">{tag}</span>
                    <button type="button" aria-label={`Remove tag ${tag}`} title={`Remove ${tag}`} onClick={() => toggle(tag)} className="shrink-0 hover:text-red-400"><X size={11} /></button>
                </span>)}
            </div>}
        </div>
    );
}