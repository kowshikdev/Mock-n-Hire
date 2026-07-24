import { supabase } from "./supabase";

/* Centralised REST helper for Student FastAPI endpoints.
 *
 * Every one of these routes now requires a real bearer token (the student
 * backend used to have no auth dependency at all -- any mock_user_id/
 * session_id in the URL was trusted as-is). Attaching the current Supabase
 * session's access_token here, once, means every call site gets this for
 * free instead of needing to remember it individually -- same token the
 * recruiter-side upload modal already sends. */
export const APIStudent = async (
    path: string,
    opts: RequestInit & { headers?: Record<string, string> } = {},
  ) => {
    // Student routes are merged into the same backend service as the
    // recruiter routes (see api/api_service.py) -- same base URL as
    // lib/api.ts, not a separate :8001 process anymore.
    const base = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";
    const url = `${base}${path}`;

    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token;

    // Default headers
    const defaults: Record<string, string> = {
      Accept: "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    };
    const headers = { ...defaults, ...(opts.headers || {}) };

    return fetch(url, { ...opts, headers });
  };
