"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { isAxiosError } from "axios";
import { Copy, Facebook, Heart, Loader2, Mail, MessageCircle, Send, Share2, Smartphone } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "@/hooks/use-toast";
import { addToWatchlist, getWatchlist, removeFromWatchlist } from "@/lib/services/watchlist";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

export default function ChannelActions({ channel }: { channel: { id: string; title: string } }) {
    const router = useRouter();
    const { user, isLoading: authLoading } = useAuth();
    const queryClient = useQueryClient();
    const [shareUrl, setShareUrl] = useState("");
    const [nativeShareAvailable, setNativeShareAvailable] = useState(false);
    const [copyDialogOpen, setCopyDialogOpen] = useState(false);
    const { data: watchlist = [], isPending, isError, refetch } = useQuery({
        queryKey: ["watchlist", user?.id],
        queryFn: getWatchlist,
        enabled: !!user,
    });
    const favourite = watchlist.some(item => item.video_id === channel.id);
    const toggleFavourite = useMutation({
        mutationFn: async ({ id, remove }: { id: string; remove: boolean }) => {
            try {
                if (remove) await removeFromWatchlist(id);
                else await addToWatchlist(id, "live_stream");
            } catch (error) {
                if (isAxiosError(error) && error.response?.status === (remove ? 404 : 409)) return;
                throw error;
            }
        },
        onSuccess: async (_, { remove }) => {
            await queryClient.invalidateQueries({ queryKey: ["watchlist"] });
            toast({ title: remove ? "Channel removed from My List" : "Channel added to My List" });
        },
        onError: () => toast({ title: "Unable to update My List", description: "Please try again.", variant: "destructive" }),
    });

    async function copyLink() {
        try {
            await navigator.clipboard.writeText(shareUrl);
            toast({ title: "Link copied" });
        } catch {
            setCopyDialogOpen(true);
        }
    }

    async function shareNative() {
        try {
            await navigator.share({ title: channel.title, url: shareUrl });
        } catch (error) {
            if (error instanceof Error && error.name === "AbortError") return;
            toast({ title: "Unable to open sharing options", description: "Choose a service or copy the link instead.", variant: "destructive" });
        }
    }

    const encodedUrl = encodeURIComponent(shareUrl);
    const encodedTitle = encodeURIComponent(channel.title);
    const socialLinks = [
        { label: "WhatsApp", href: `https://wa.me/?text=${encodeURIComponent(`${channel.title} ${shareUrl}`)}`, icon: MessageCircle },
        { label: "Facebook", href: `https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}`, icon: Facebook },
        { label: "X", href: `https://twitter.com/intent/tweet?url=${encodedUrl}&text=${encodedTitle}`, icon: Share2 },
        { label: "Telegram", href: `https://t.me/share/url?url=${encodedUrl}&text=${encodedTitle}`, icon: Send },
    ];

    return <>
        <Button
            variant="outline"
            aria-pressed={favourite}
            disabled={authLoading || toggleFavourite.isPending || (!!user && isPending)}
            onClick={() => {
                if (!user) {
                    router.push(`/login?returnTo=${encodeURIComponent(`/tv-shows?channel=${channel.id}`)}`);
                    return;
                }
                if (isError) {
                    void refetch();
                    toast({ title: "Unable to load My List", description: "Retrying. Please try again once your list loads.", variant: "destructive" });
                    return;
                }
                toggleFavourite.mutate({ id: channel.id, remove: favourite });
            }}
            className="h-10 flex-1 gap-2 border-white/30 bg-transparent text-white hover:bg-white/10 hover:text-white"
        >
            {toggleFavourite.isPending ? <Loader2 size={15} className="animate-spin" /> : <Heart size={15} fill={favourite ? "currentColor" : "none"} />}
            {favourite ? "Favourited" : "Favourite"}
        </Button>
        <DropdownMenu onOpenChange={open => {
            if (!open) return;
            setShareUrl(new URL(`/tv-shows/${channel.id}`, window.location.origin).href);
            setNativeShareAvailable(typeof navigator.share === "function");
        }}>
            <DropdownMenuTrigger asChild>
                <Button variant="outline" className="h-10 flex-1 gap-2 border-white/30 bg-transparent text-white hover:bg-white/10 hover:text-white"><Share2 size={15} /> Share</Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" aria-label={`Share ${channel.title}`} className="min-w-48">
                {nativeShareAvailable && <><DropdownMenuItem onSelect={() => { void shareNative(); }}><Smartphone size={16} className="mr-2" />Device sharing options</DropdownMenuItem><DropdownMenuSeparator /></>}
                {socialLinks.map(({ label, href, icon: Icon }) => <DropdownMenuItem key={label} asChild><a href={href} target="_blank" rel="noopener noreferrer"><Icon size={16} className="mr-2" />{label}</a></DropdownMenuItem>)}
                <DropdownMenuItem asChild><a href={`mailto:?subject=${encodedTitle}&body=${encodedUrl}`}><Mail size={16} className="mr-2" />Email</a></DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => { void copyLink(); }}><Copy size={16} className="mr-2" />Copy link</DropdownMenuItem>
            </DropdownMenuContent>
        </DropdownMenu>
        <Dialog open={copyDialogOpen} onOpenChange={setCopyDialogOpen}>
            <DialogContent className="w-[calc(100%-2rem)] max-w-md">
                <DialogHeader><DialogTitle>Channel link</DialogTitle></DialogHeader>
                <Label htmlFor="channel-share-link">Link</Label>
                <Input id="channel-share-link" value={shareUrl} readOnly onFocus={event => event.currentTarget.select()} />
            </DialogContent>
        </Dialog>
    </>;
}