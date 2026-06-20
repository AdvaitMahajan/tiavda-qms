// Central API client. All data/storage/edge-function access goes through the
// Railway REST API (Supabase is used only for Auth — login/session/token).
//
// - apiClient: authenticated calls (attaches the Supabase access token).
// - publicApi: unauthenticated calls for /public/* token-gated endpoints.
import { supabase } from "@/integrations/supabase/client";

const BASE =
  (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, "") ||
  "http://localhost:8080/api";

export class ApiError extends Error {
  status: number;
  code?: string;
  details?: unknown;
  constructor(status: number, message: string, code?: string, details?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

type QueryValue = string | number | boolean | null | undefined;
export type Query = Record<string, QueryValue> | undefined;

function buildUrl(path: string, query?: Query): string {
  const url = `${BASE}${path.startsWith("/") ? path : `/${path}`}`;
  if (!query) return url;
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) {
    if (v !== undefined && v !== null) qs.append(k, String(v));
  }
  const s = qs.toString();
  return s ? `${url}?${s}` : url;
}

interface RequestOpts {
  query?: Query;
  body?: unknown;
  auth?: boolean; // default true
  signal?: AbortSignal;
}

async function request<T>(method: string, path: string, opts: RequestOpts = {}): Promise<T> {
  const headers: Record<string, string> = {};
  let body: BodyInit | undefined;
  if (opts.body !== undefined) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(opts.body);
  }
  if (opts.auth !== false) {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (token) headers["Authorization"] = `Bearer ${token}`;
  }

  const res = await fetch(buildUrl(path, opts.query), { method, headers, body, signal: opts.signal });

  if (res.status === 204) return undefined as T;

  const text = await res.text();
  let payload: unknown = null;
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = text;
    }
  }

  if (!res.ok) {
    const errObj = (payload as { error?: { message?: string; code?: string; details?: unknown } })?.error ?? {};
    if (res.status === 401 && opts.auth !== false) {
      // Token invalid/expired — drop the session so the app returns to login.
      void supabase.auth.signOut();
    }
    throw new ApiError(res.status, errObj.message || res.statusText || "Request failed", errObj.code, errObj.details);
  }

  return payload as T;
}

export const apiClient = {
  get: <T>(path: string, query?: Query, signal?: AbortSignal) => request<T>("GET", path, { query, signal }),
  post: <T>(path: string, body?: unknown, query?: Query) => request<T>("POST", path, { body, query }),
  put: <T>(path: string, body?: unknown, query?: Query) => request<T>("PUT", path, { body, query }),
  patch: <T>(path: string, body?: unknown, query?: Query) => request<T>("PATCH", path, { body, query }),
  del: <T>(path: string, query?: Query) => request<T>("DELETE", path, { query }),
};

export const publicApi = {
  get: <T>(path: string, query?: Query) => request<T>("GET", path, { query, auth: false }),
  post: <T>(path: string, body?: unknown, query?: Query) => request<T>("POST", path, { body, auth: false }),
};
