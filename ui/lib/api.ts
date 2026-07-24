/* Centralised REST helper for Recruiter FastAPI endpoints */
export const API = async (
  path: string,
  opts: RequestInit & { headers?: Record<string, string> } = {},
) => {
  // NEXT_PUBLIC_API_URL must be set in production -- this was hardcoded to
  // localhost:4000 before, which silently broke every recruiter API call
  // (upload, status, ranking) once deployed, since the browser has no
  // localhost:4000 to reach.
  const base = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";
  const url = `${base}${path}`;

  // Default headers
  const defaults = {
    Accept: "application/json",
  };
  const headers = { ...defaults, ...(opts.headers || {}) };

  return fetch(url, { ...opts, headers });
};
