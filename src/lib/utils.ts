import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(n: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(n);
}

export function formatDate(d: string): string {
  return new Date(d).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function relativeTime(d: string): string {
  const now = Date.now();
  const then = new Date(d).getTime();
  const diffMs = now - then;
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHr = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHr / 24);

  if (diffSec < 60) return "just now";
  if (diffMin < 60) return `${diffMin} minute${diffMin > 1 ? "s" : ""} ago`;
  if (diffHr < 24) return `${diffHr} hour${diffHr > 1 ? "s" : ""} ago`;
  return `${diffDay} day${diffDay > 1 ? "s" : ""} ago`;
}

/**
 * How a client is identified across the app: the COMPANY is the business
 * identity we show on enquiry/client screens. Falls back to the contact
 * person's name for legacy records created before company was mandatory.
 */
export function clientDisplayName(
  c?: { company?: string | null; name?: string | null } | null,
): string {
  return c?.company?.trim() || c?.name?.trim() || "Unknown";
}

/**
 * Trigger a browser download for a Blob.
 *
 * The object URL is revoked on a LATER tick — never in the same tick as
 * click(). Revoking immediately can abort the transfer before the browser has
 * finished writing the file, which is what produced empty/corrupt PDF and CSV
 * downloads.
 */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Generous window so slow disks / large files still complete.
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
