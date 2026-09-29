"use client";

import { ChevronLeft, ChevronRight, MoreHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";

type PaginationProps = {
    page: number;
    hasNextPage: boolean;
    loading?: boolean;
    onPageChange: (page: number) => void;
};

export default function Pagination({
    page,
    hasNextPage,
    loading = false,
    onPageChange,
}: PaginationProps) {
    if (page === 1 && !hasNextPage) return null;

    const pageNumbers = new Set<number>([1, page]);
    if (page > 1) pageNumbers.add(page - 1);
    if (hasNextPage) pageNumbers.add(page + 1);
    const sortedPages = [...pageNumbers].sort((a, b) => a - b);
    const pageItems: (number | "ellipsis")[] = [];

    sortedPages.forEach((pageNumber, index) => {
        const previousPage = sortedPages[index - 1];
        if (previousPage && pageNumber - previousPage > 1) {
            pageItems.push("ellipsis");
        }
        pageItems.push(pageNumber);
    });

    return (
        <div className="mt-5 flex items-center justify-between">
            <p className="text-xs text-muted-foreground">Page {page}</p>
            <div className="flex items-center gap-1">
                <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => onPageChange(Math.max(1, page - 1))}
                    disabled={loading || page === 1}
                    className="gap-1"
                >
                    <ChevronLeft size={13} />
                    Previous
                </Button>
                <div className="flex items-center gap-1 px-1">
                    {pageItems.map((item, index) => item === "ellipsis" ? (
                        <span
                            key={`ellipsis-${index}`}
                            className="flex h-9 w-9 items-center justify-center text-muted-foreground"
                            aria-hidden="true"
                        >
                            <MoreHorizontal size={14} />
                        </span>
                    ) : (
                        <Button
                            key={item}
                            type="button"
                            variant={item === page ? "default" : "outline"}
                            size="icon"
                            onClick={() => onPageChange(item)}
                            disabled={loading || item === page}
                            aria-label={`Go to page ${item}`}
                            aria-current={item === page ? "page" : undefined}
                            className="h-9 w-9 text-xs"
                        >
                            {item}
                        </Button>
                    ))}
                </div>
                <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => onPageChange(page + 1)}
                    disabled={loading || !hasNextPage}
                    className="gap-1"
                >
                    Next
                    <ChevronRight size={13} />
                </Button>
            </div>
        </div>
    );
}