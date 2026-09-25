import * as React from "react";
import { ChevronLeft, ChevronRight, MoreHorizontal } from "lucide-react";

import { cn } from "@/lib/utils";
import { ButtonProps, buttonVariants } from "@/components/ui/button";

const Pagination = ({ className, ...props }: React.ComponentProps<"nav">) => (
  <nav
    role="navigation"
    aria-label="pagination"
    className={cn("mx-auto flex w-full justify-end", className)}
    {...props}
  />
);
Pagination.displayName = "Pagination";

const PaginationContent = React.forwardRef<HTMLUListElement, React.ComponentProps<"ul">>(
  ({ className, ...props }, ref) => (
    <ul ref={ref} className={cn("flex flex-row items-center gap-1", className)} {...props} />
  ),
);
PaginationContent.displayName = "PaginationContent";

const PaginationItem = React.forwardRef<HTMLLIElement, React.ComponentProps<"li">>(({ className, ...props }, ref) => (
  <li ref={ref} className={cn("", className)} {...props} />
));
PaginationItem.displayName = "PaginationItem";

type PaginationLinkProps = {
  isActive?: boolean;
} & Pick<ButtonProps, "size"> &
  React.ComponentProps<"a">;

const PaginationLink = ({ className, isActive, size = "icon", ...props }: PaginationLinkProps) => (
  <a
    aria-current={isActive ? "page" : undefined}
    className={cn(
      buttonVariants({
        variant: isActive ? "outline" : "ghost",
        size,
      }),
      className,
    )}
    {...props}
  />
);
PaginationLink.displayName = "PaginationLink";

const PaginationPrevious = ({ className, ...props }: React.ComponentProps<typeof PaginationLink>) => (
  <PaginationLink aria-label="Go to previous page" size="default" className={cn("gap-1 pl-2.5", className)} {...props}>
    <ChevronLeft className="h-4 w-4" />
    <span>Previous</span>
  </PaginationLink>
);
PaginationPrevious.displayName = "PaginationPrevious";

const PaginationNext = ({ className, ...props }: React.ComponentProps<typeof PaginationLink>) => (
  <PaginationLink aria-label="Go to next page" size="default" className={cn("gap-1 pr-2.5", className)} {...props}>
    <span>Next</span>
    <ChevronRight className="h-4 w-4" />
  </PaginationLink>
);
PaginationNext.displayName = "PaginationNext";

const PaginationEllipsis = ({ className, ...props }: React.ComponentProps<"span">) => (
  <span aria-hidden className={cn("flex h-9 w-9 items-center justify-center", className)} {...props}>
    <MoreHorizontal className="h-4 w-4" />
    <span className="sr-only">More pages</span>
  </span>
);
PaginationEllipsis.displayName = "PaginationEllipsis";

export function getPaginationItems(currentPage: number, totalPages: number, siblings = 1): Array<number | "ellipsis"> {
  const pageWindowSize = 5;

  if (totalPages <= pageWindowSize + 2) {
    return Array.from({ length: totalPages }, (_, index) => index + 1);
  }

  const pages = new Set<number>([1, totalPages]);
  const start = Math.max(2, currentPage - siblings);
  const end = Math.min(totalPages - 1, currentPage + siblings);

  for (let page = start; page <= end; page += 1) {
    pages.add(page);
  }

  const orderedPages = [...pages].sort((a, b) => a - b);

  while (orderedPages.length > pageWindowSize) {
    const leftGap = currentPage - orderedPages[0];
    const rightGap = orderedPages[orderedPages.length - 1] - currentPage;

    if (leftGap <= rightGap) {
      orderedPages.shift();
    } else {
      orderedPages.pop();
    }
  }

  const result: Array<number | "ellipsis"> = [];
  let previous = 0;

  for (const page of orderedPages) {
    if (page > previous + 1) {
      result.push("ellipsis");
    }
    result.push(page);
    previous = page;
  }

  if (result[0] !== 1) {
    result.unshift(1, "ellipsis");
  }

  if (result[result.length - 1] !== totalPages) {
    result.push("ellipsis", totalPages);
  }

  return result.filter((page, index, array) => {
    if (page === "ellipsis") {
      const previousValue = array[index - 1];
      const nextValue = array[index + 1];
      return previousValue !== "ellipsis" && nextValue !== "ellipsis" && previousValue !== undefined && nextValue !== undefined;
    }

    return page > 0 && page <= totalPages;
  });
}

export {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
};
