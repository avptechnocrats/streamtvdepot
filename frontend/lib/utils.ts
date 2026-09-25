import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function parseApiDateTime(value: string | null | undefined): Date | null {
  if (!value) return null;

  const normalized = value.trim();
  if (!normalized) return null;

  const withZulu = normalized.endsWith("Z") ? normalized.replace(/Z$/, "+00:00") : normalized;
  const withOffsetColon = withZulu.replace(/([+-]\d{2})(\d{2})$/, "$1:$2");
  const date = new Date(withOffsetColon);

  return Number.isNaN(date.getTime()) ? null : date;
}

export function formatLocalDateTime(value: string | null | undefined): string {
  const date = parseApiDateTime(value);
  if (!date) return "-";

  return new Intl.DateTimeFormat(undefined, {
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(date);
}
