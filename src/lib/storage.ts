// Storage helpers — uploads/downloads go through the API's signed-URL endpoints
// (the browser PUTs directly to Supabase Storage; the file never passes through
// our API). Used by quotation PDFs, receipts, reports, site-visit photos.
import { apiClient } from "@/lib/apiClient";

export type StorageBucket =
  | "quotation-pdfs"
  | "receipts"
  | "reports"
  | "site-visit-photos"
  | "intake-uploads";

/** Upload a Blob/File to a bucket via a short-lived signed upload URL. Returns the path. */
export async function uploadToStorage(
  bucket: StorageBucket,
  path: string,
  file: Blob,
  opts?: { upsert?: boolean; contentType?: string },
): Promise<string> {
  const { signedUrl, path: storedPath } = await apiClient.post<{ signedUrl: string; token: string; path: string }>(
    "/storage/sign-upload",
    { bucket, path, upsert: opts?.upsert ?? false },
  );
  const contentType = opts?.contentType ?? (file as File).type ?? "application/octet-stream";
  const res = await fetch(signedUrl, {
    method: "PUT",
    headers: { "Content-Type": contentType, ...(opts?.upsert ? { "x-upsert": "true" } : {}) },
    body: file,
  });
  if (!res.ok) throw new Error(`Upload failed (${res.status})`);
  // The API namespaces objects under the org_id, so return the path it actually
  // wrote to (callers that persist the path — e.g. site-visit photos — store this).
  return storedPath ?? path;
}

/** Get a time-limited signed download URL for a private object. */
export async function getSignedUrl(
  bucket: StorageBucket,
  path: string,
  expiresIn = 86400 * 30,
): Promise<string> {
  const { signed_url } = await apiClient.post<{ signed_url: string }>("/storage/sign-url", {
    bucket,
    path,
    expires_in: expiresIn,
  });
  return signed_url;
}

/** Deterministic public URL for an object in a PUBLIC bucket (no signing needed).
 * Used for site-visit photos which live in a public bucket. */
export function getPublicStorageUrl(bucket: StorageBucket, path: string): string {
  const base = (import.meta.env.VITE_SUPABASE_URL as string).replace(/\/$/, "");
  return `${base}/storage/v1/object/public/${bucket}/${encodeURI(path)}`;
}

/** Download a private object as a Blob (via a short-lived signed URL). */
export async function downloadFromStorage(bucket: StorageBucket, path: string): Promise<Blob> {
  const url = await getSignedUrl(bucket, path, 120);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Download failed (${res.status})`);
  return res.blob();
}
